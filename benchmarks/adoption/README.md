# External repository adoption benchmark

This corpus exercises 25 browser applications and library demos, plus four HTTP or full-stack application examples. Each case names an upstream Git commit, its real entry point, the workflow being tested, and any setup it needs. The case range includes standalone pages, Vite output, legacy jQuery demos, a Flask factory-compatible runtime, FastAPI and Express.

## Run it

Use Node 22.22 or later in the 22.x series, Git, Python with PyYAML and network access to GitHub and the listed package registries. From the TraceGrove checkout:

```sh
npm ci && npm run build
node dist/cli/main.js setup browsers
python3 -m venv /tmp/tracegrove-adoption-python
/tmp/tracegrove-adoption-python/bin/pip install PyYAML fastapi uvicorn flask flasgger decorator Brotli
export TRACEGROVE_PYTHON=/tmp/tracegrove-adoption-python/bin/python
"$TRACEGROVE_PYTHON" benchmarks/adoption/run.py --work /tmp/tracegrove-adoption-results
```

Use `--repo bigskysoftware/htmx` to select a single case, or `--jobs 4` to run four disposable checkouts at a time. Each requested repository needs a fresh output directory. A local clone cache can be supplied with `--cache`. Repository setup commands run only inside the disposable checkouts. The runner leaves the source, build logs, reports and bundles in the work directory and returns a failing exit code for unsuccessful controls or healthy runs.

## What is measured

- Every healthy run is rechecked by a separate `verify-bundle` invocation. Results include the upstream commit, tested source digest, case assertions and SHA-256 of the bundle manifest.
- For every browser entry the runner substitutes a maintenance page that returns HTTP 200. The unchanged title assertion must fail with the planted title and its bundle must verify. The runner then restores the original bytes.
- Two additional experiments use `test --prove-faults`. After verifying the original upstream application, a local fixture adds one environment-controlled defect. Both launches in each pair use the same source. The FastAPI fixture drops a write. The Flask fixture changes the arithmetic result.
- The workflows exercise the browser or application code shipped at the pinned commit. Express uses a one-line listener around the upstream exported app to honor the assigned port. The math.js case runs the upstream code-editor example and its locked math.js dependency. Two older demos need a CDN copy of jQuery to function offline. Their fixtures pin the original asset by SHA-256 and point the disposable HTML at a local copy. All setup is recorded in [cases.json](cases.json).
- These results apply to the selected workflows. A page-only pass covers the initial browser navigation and title. The matrix does not measure maintainer adoption, production load, complete application behavior or hours saved.

See [the recorded results](results.md) for coverage by repository and the onboarding comparison.
