"""Replay the pinned public applications in disposable local checkouts."""
import argparse
import concurrent.futures
import hashlib
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
from urllib.request import urlopen

import yaml

HERE = Path(__file__).resolve().parent
WRONG_TITLE = "TraceGrove wrong deployment control"


def execute(argv, cwd, timeout=180, check=True):
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=check)


def cli(root, binary, *args):
    proc = execute(["node", binary, *args, "--json"], root, check=False)
    try:
        return json.loads(proc.stdout or proc.stderr)
    except ValueError as error:
        raise RuntimeError(f"CLI returned {proc.returncode}: {proc.stderr[-800:]}") from error


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def run_and_verify(root, binary, *selection):
    report = cli(root, binary, "test", *selection)
    if not report.get("runDir"):
        return {"outcome": "blocked", "reasons": report.get("reasons", [])}
    bundle = Path(report["runDir"]) / "bundle"
    verified = cli(root, binary, "verify-bundle", "--bundle", str(bundle))
    return {
        "outcome": report["outcome"], "verified": verified.get("ok") is True and verified["outcome"] == report["outcome"],
        "execution": report["executionId"], "source": report["sourceDigest"],
        "manifestSha256": hashlib.sha256((bundle / "manifest.json").read_bytes()).hexdigest(),
        "cases": [{"id": c["caseId"], "outcome": c["outcome"], "failure": c["failure"],
                   "checks": [{"step": s["id"], "field": a["check"], "expected": a["expected"], "observed": a["got"], "held": a["held"]}
                              for s in c["steps"] for a in s.get("checked", [])]} for c in report["cases"]],
    }


def replay(row, options):
    name = row["repo"].replace("/", "--")
    work = options.work / name
    work.mkdir()  # Refuse to reuse or overwrite an existing checkout.
    checkout = work / "source"
    checkout.mkdir()
    repository = str(options.cache / row["repo"].split("/")[1]) if options.cache else "https://github.com/" + row["repo"] + ".git"
    execute(["git", "init", "-q"], checkout)
    execute(["git", "fetch", "--quiet", "--depth=1", repository, row["commit"]], checkout)
    execute(["git", "checkout", "-q", "--detach", "FETCH_HEAD"], checkout)
    assert execute(["git", "rev-parse", "HEAD"], checkout).stdout.strip() == row["commit"]
    build_root = checkout / row.get("buildDir", ".")
    for index, command in enumerate(row.get("build", [])):
        build = execute(command, build_root, timeout=600, check=False)
        (work / f"build-{index}.log").write_text(build.stdout + build.stderr)
        if build.returncode:
            raise RuntimeError(f"upstream build failed; see {work}/build-{index}.log")
    if "concat" in row:  # Bliss's upstream gulp concat task.
        output, *inputs = row["concat"]
        (checkout / output).write_bytes(b"\n".join((checkout / path).read_bytes() for path in inputs))
    root = checkout / row.get("siteRoot", ".")
    if "mirror" in row:
        # Some upstream demos load their only copy of jQuery from a CDN. Make the exact bytes local.
        mirror = row["mirror"]
        with urlopen(mirror["url"], timeout=30) as response:
            data = response.read(2_000_000)
        if hashlib.sha256(data).hexdigest() != mirror["sha256"]:
            raise RuntimeError("CDN fixture digest mismatch")
        page = root / row["page"]
        html = page.read_text()
        if html.count(mirror["original"]) != 1:
            raise RuntimeError("Upstream asset reference changed")
        (page.parent / "adoption-jquery.min.js").write_bytes(data)
        page.write_text(html.replace(mirror["original"], "adoption-jquery.min.js"))
    config_file = root / "tracegrove.config.yaml"
    flow_dir = root / "tracegrove"
    result = {"repo": row["repo"], "commit": row["commit"]}
    if "page" in row:
        init = cli(root, options.cli, "init", "--static", row["page"], *(["--title", row["expectedTitle"]] if row.get("expectedTitle") else []))
        if "detection" not in init:
            raise RuntimeError(str(init))
        result.update(missingAssets=init["missingAssets"], externalAssetOrigins=init["externalAssetOrigins"])
        cfg = yaml.safe_load(config_file.read_text())
        sources = list(row.get("sources", []))
        if "fixture" in row:
            shutil.copyfile(HERE / "fixtures" / row["fixture"], root / "adoption-fixture.html")
            sources.append("adoption-fixture.html")
        if sources:
            cfg["app"]["sources"] = sources
    else:
        app = dict(row["app"])
        if app["adapter"] != "node":
            app["python"] = os.environ["TRACEGROVE_PYTHON"]
        if "pythonPath" in row:
            app["env"] = {"PYTHONPATH": str(checkout / row["pythonPath"])}
        if "nodeExport" in row:
            (checkout / app["entry"]).write_text("require(" + json.dumps(row["nodeExport"]) + ").listen(Number(process.env.PORT), '127.0.0.1');\n")
        cfg = {"project": "adoption", "app": app}
        flow_dir.mkdir()
    cfg["personas"] = {"visitor": {"subject": "visitor", "inputMode": row.get("inputMode", "pointer")}}
    write(config_file, cfg)
    if row.get("steps"):
        steps = list(row["steps"])
        if "page" in row:
            steps.insert(0, {"browser": {"kind": "navigate", "path": row.get("workflowEntry", "/" + row["page"])}, "expect": {"status": 200}})
        flow = {"title": row["case"], "as": "none", "steps": steps}
        if any("browser" in s for s in steps):
            flow["browser"] = {"allowPaths": ["/"], "allowMethods": ["GET", "HEAD"] if "page" in row else ["GET", "HEAD", "POST"], "maxActions": 300}
        write(flow_dir / "workflow.flow.yaml", flow)
    result["healthy"] = run_and_verify(root, options.cli)
    if "page" in row:
        page = root / row["page"]
        saved = page.read_bytes()
        try:
            page.write_text(f"<!doctype html><title>{WRONG_TITLE}</title><h1>Maintenance</h1>")
            result["control"] = run_and_verify(root, options.cli, "--grep", "page")
        finally:
            page.write_bytes(saved)
        control = result["control"]
        result["caught"] = (control.get("verified") and control["outcome"] == "assertion_failed" and any(
            check["field"] == "browser.text" and check["observed"] == WRONG_TITLE and not check["held"]
            for case in control["cases"] for check in case["checks"]))
    if row.get("fault") and result["healthy"].get("verified"):
        # The upstream run above is pristine. This separate experiment adds one environment switch
        # to the disposable app and uses the same modified source for both proof launches.
        fault = row["fault"]
        source = checkout / fault["file"]
        original = source.read_text()
        if original.count(fault["before"]) != 1:
            raise RuntimeError("Fault fixture no longer matches the pinned app")
        declaration = root / "tracegrove.faults.json"
        try:
            source.write_text(original.replace(fault["before"], fault["after"]))
            write(declaration, [{**{k: fault[k] for k in ("name", "step", "check", "expected", "got")},
                                  "caseId": "workflow", "env": {"ADOPTION_BUG": fault["name"]}}])
            run = cli(root, options.cli, "test", "--prove-faults")
            proof = run.get("proofs", [{}])[0]
            result["namedFault"] = {k: proof.get(k) for k in ("name", "caught", "check", "healthy", "broken", "reason")}
        finally:
            source.write_text(original)
            declaration.unlink(missing_ok=True)
    write(work / "result.json", result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", type=Path, required=True, help="new directory for checkouts, bundles and results")
    parser.add_argument("--cache", type=Path, help="optional pre-fetched repos named after the upstream repo")
    parser.add_argument("--cli", type=Path, default=HERE.parents[1] / "dist/cli/main.js")
    parser.add_argument("--jobs", type=int, default=2, choices=range(1, 9))
    parser.add_argument("--repo", action="append", help="run just these owner/repo names")
    options = parser.parse_args()
    options.work = options.work.resolve()
    options.cli = options.cli.resolve()
    if options.cache:
        options.cache = options.cache.resolve()
    options.work.mkdir(parents=True, exist_ok=True)
    cases = json.loads((HERE / "cases.json").read_text())
    if options.repo:
        cases = [c for c in cases if c["repo"] in options.repo]
        if set(options.repo) != {c["repo"] for c in cases}:
            parser.error("unknown repository")
    results = []
    with concurrent.futures.ThreadPoolExecutor(options.jobs) as pool:
        futures = {pool.submit(replay, row, options): row for row in cases}
        for future in concurrent.futures.as_completed(futures):
            row = futures[future]
            try:
                result = future.result()
            except Exception as error:
                result = {"repo": row["repo"], "commit": row["commit"], "error": str(error)}
            results.append(result)
            print(row["repo"], result.get("healthy", {}).get("outcome", result.get("error")), "control:", result.get("caught", "n/a"), flush=True)
    write(options.work / "results.json", sorted(results, key=lambda r: r["repo"].lower()))
    return int(any(r.get("healthy", {}).get("outcome") != "passed" or not r["healthy"].get("verified") or not r.get("caught", True) or not r.get("namedFault", {}).get("caught", True) for r in results))


if __name__ == "__main__":
    sys.exit(main())
