#!/usr/bin/env node
/**
 * tracegrove CLI (also installed as workflow-verify). Every command goes through the same resolver, admission and reducer as
 * the library API. Exit codes: 0 pass, 1 assertion failure, 2 blocked/inconclusive,
 * 3 infrastructure failure, 4 cancelled. Non-execution commands exit 0 for their own success only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { SampleName } from './samples/catalog.ts';
import { loadProject, localScope } from '../core/corpus.ts';
import { plan, type FrozenBundle } from '../core/planner.ts';
import { EXIT_CODES, executeBundle } from '../core/executor.ts';
import { LocalLedger } from '../core/ledger.ts';
import { LocalResultSink } from '../core/resultSink.ts';
import { delegateRun, startController } from '../core/controller.ts';
import { searchCases } from '../core/lookup.ts';
import { createRerun } from '../core/rerun.ts';
import { exportVerifiedBundle, verifyBundle, VerifiedBundleSnapshot } from '../core/bundle.ts';
import { createDurableDirectory } from '../core/atomicFiles.ts';
import { readFrozenBundle } from '../core/frozenBundle.ts';
import { inspectFrozenPlan } from '../core/planInspection.ts';
import { inspectExecution, inspectFailedSteps } from '../core/executionInspection.ts';
import { checkCleanupFiles } from './cleanup.ts';
import { readConfigurationJson } from './jsonFile.ts';
import { jsonRequested, parseArgs, type Args } from './arguments.ts';
import { cliErrorReport } from './errors.ts';
import { inspectRecoveryStatus } from '../core/recoveryStatus.ts';
import { Blocked, Conflict, InfrastructureFailure } from '../core/errors.ts';
import { SchemaViolation, CaseFixturePlan, CaseSpec, SeedRecipe, LogicalPayload, ExecutionReceipt, CampaignResult, HostPlan, RunRequest, parseAs, refKey, type Ref } from '../protocol/index.ts';
import { inspectDoctor, doctorFailure } from './doctor.ts';
import { writeSample } from './samples/write.ts';
import { resolveSourceFiles, materializeSourceFiles } from './source.ts';
import { readGitSnapshotTree } from '../source/snapshotTree.ts';
import { sameScope } from '../protocol/canonical.ts';
import { compileProject, findConfig } from '../authoring/compile.ts';
import { resolveRun, runTests, type TestRunReport } from '../authoring/run.ts';
import { initProject } from '../authoring/init.ts';
import { startUi } from '../authoring/ui.ts';
import { checkProject, discoverProject, draftWithAgent, saveCatalog } from '../authoring/workspace.ts';
import { setupBrowsers } from './setup.ts';
import { detectAgents, readLocalSettings, resolveAgentSettings, writeLocalSettings } from '../authoring/agent.ts';
import { loadAuthoringConfig } from '../authoring/compile.ts';
import { heal, undoHeal } from '../authoring/heal.ts';
import { projectRoot, projectStatus } from '../authoring/status.ts';
import { runActivity } from '../authoring/activity.ts';
import { paint, progressLine, renderHeal, renderStatus, renderTree } from './render.ts';
import { previewVerificationSource, savedVerificationSource } from '../authoring/verificationSource.ts';

function flag(args: Args, name: string): string | null {
  const value = (args.flags as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
}

function out(args: Args, value: unknown, text: string): void {
  if (('json' in args.flags && args.flags.json) || ('jsonl' in args.flags && args.flags.jsonl)) process.stdout.write(`${JSON.stringify(value)}\n`);
  else process.stdout.write(`${text}\n`);
}

function stateDirFor(projectRoot: string): string {
  return join(projectRoot, '.workflow-verify');
}

function samplesDir(): string {
  // dist/cli/main.js -> ../../samples ; src/cli/main.ts -> ../samples
  const candidates = [resolve(import.meta.dirname, '..', '..', 'samples'), resolve(import.meta.dirname, '..', 'samples')];
  const found = candidates.find((dir) => existsSync(dir));
  if (!found) throw new InfrastructureFailure('sample packs are not installed with this distribution');
  return found;
}

const HELP = `tracegrove <command> [--flags]

Everyday commands (tracegrove.config.yaml or tracegrove.config.ts, found by walking up from the current folder):
  (no command)                                         where this project stands and what to run next
  init [--dir <dir>] [--force]                         detect FastAPI / Django / Node and write a config + example flow
  test [--grep <text>] [--tag a,b] [--json|--jsonl]    compile, plan, run and verify; writes .tracegrove/runs/<run>/
       [--heal]                                        on failure, heal and re-run (see heal)
       [--source-snapshot <snapshot.json>]              verify and launch an owner-bound private source copy
       [--source-repository-role <role>]                bind the verified resolver head to a repository role
  heal [--dir <dir>] [--no-agent] [--dry-run]          fix setup and drifted tests, prove each fix by re-running, keep only
       [--agent claude|codex] [--model <m>]            what passes; product bugs are reported, never hidden
  heal --undo <id|latest>                              put back every change a heal kept
  status [--dir <dir>] [--json]                        project health plus ordered next commands (for people and agents)
  list [--json]                                        list flows with their ids, tags and steps
  show [--run latest|<name>] [--json]                  print a run's summary
  compile [--json] [--source-snapshot <snapshot.json>]   write the derived v1 corpus to .tracegrove/compiled/
          [--source-repository-role <role>]            bind a single resolver-head repository
  ui [--dir <dir>] [--branch <branch>] [--port <n>]    local web UI: config, flows, runs, discovery, agent drafts, settings

Agent-friendly commands (every one takes --json and never starts the app):
  discover [--dir <dir>] [--branch <branch>] [--save]  routes from code, the catalog and served traffic vs. flows and actions;
                                                       --save records what is known in tracegrove/catalog.yaml
  check [--dir <dir>]                                  compile flows only; exit 0 when clean, 2 with file-located issues
  draft [--intent "<what to verify>"] [--branch <b>]   have Claude Code or Codex write flows into tracegrove/discovered/,
        [--agent claude|codex] [--model <m>]           then check them and run each one end to end, sending failures back
        [--no-prove]                                   for up to 2 repairs (default: Claude Code on haiku, its cheapest model)
  settings [--agent claude|codex|none] [--model <m>]   show or save your agent choice in .tracegrove/settings.json
           [--source-snapshot <snapshot.json> | --working-tree]  save the next run's input; never edits team config
  test, list, show and compile take --config <tracegrove.config.yaml|tracegrove.config.ts>; the commands above use --dir.

Low-level corpus commands (the strict workflow.*/v1 files):
  sample-config --sample ${SampleName.options.join('|')} --output <dir>     write a sample project (real app + corpus)
  validate --config <workflow.yaml>                    validate schemas, references and digests
  setup browsers [--dry-run] [--check-only]            install the pinned Playwright headless shell and ffmpeg, then record
                                                       a one-second test video to prove browser flows can run here
  doctor [--dir <dir>|--config <yaml>] [--profile <name>]\n                                                       inspect native setup and plan; never launch the app
  plan --config <workflow.yaml> [--profile <name>] --output <request.json>
       [--work-binding <json>]                        freeze an existing work ID and requirement refs before execution
  seed --request <request.json> --preview              show planned fixture resources and cleanup (no effects)
  run --request <request.json> [--jsonl]               admit and execute the frozen request
  controller --state-dir <dir> --project-root <dir>    own the local ledger; CLI runs delegate
  cases --config <workflow.yaml> [--id <id>] [--cursor <cursor>]
  rerun --request <request.json> --output <new.json>   freeze a fresh attempt on the same cases
  inspect --execution <id> --state-dir <dir> [--failed-step]
  recovery-status --execution <id> --state-dir <dir>  inspect recorded recovery state; no effects or authority
  inspect --bundle <dir> [--failed-step]               inspect independently verified saved evidence
  inspect --request <request.json>                    inspect frozen structure; no runtime or authority checks
  export --execution <id> --state-dir <dir> --output <dir>
  verify-bundle --bundle <dir>                         recheck hashes, digests and re-reduce the verdict
  result-ingest --bundle <dir> --sink <dir>             retain verified local evidence; does not qualify or activate it
  awr-prepare --sink <dir> --id <result-id> --destination <json>
                                                       freeze a redacted AWR export and exact destination; no network
  awr-inspect --sink <dir> --id <result-id>              show saved delivery and acknowledgement state
  awr-deliver --sink <dir> --id <result-id> [--credential-env <name>]
                                                       retry the frozen import; default secret env TRACEGROVE_ORGX_TOKEN
  report-prepare --sink <dir> --id <result-id> --target <json>
                                                       freeze attachment to the exact bound work; no network
  report-inspect --sink <dir> --id <result-id>           inspect independent attachment acknowledgement state
  report-attach --sink <dir> --id <result-id> [--credential-env <name>]
                                                       recheck the imported receipt, then attach it in review; no completion
  results --sink <dir> [--id <record-id>]               list receipts; --id re-verifies its retained archive
          [--limit 1..100] [--cursor <opaque>]           bounded, snapshot-stable pages; issuer remains unverified
  verify-cleanup --proof <json> --expectation <json> --trust <json> [--json]
                                                       check signed follow-up integrity; no hosted release
  schema --output <dir>                                export JSON Schemas
  source-resolve --input <repositories.json> --output <source.json>
  source-materialize --input <source.json> --repository <id> --root <local-repo> --side base|head --output <new-dir>
                                                       freeze local Git commit pairs and complete diffs (no fetch or review)

Exit codes: 0 pass, 1 assertion failure, 2 blocked/inconclusive, 3 infrastructure failure, 4 cancelled.`;

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  switch (args.command) {
    case 'help': {
      // Bare `tracegrove` inside a project is a home screen; --help (or no project) is the reference.
      if (argv.length === 0 && projectRoot('.')) { process.stdout.write(`${renderStatus(projectStatus('.'), paint())}\n`); return 0; }
      process.stdout.write(`${HELP}\n`); return 0;
    }

    case 'status': {
      const status = projectStatus(flag(args, 'dir') ?? '.');
      out(args, status, renderStatus(status, paint()));
      return 0;
    }

    case 'heal': {
      const dir = projectRoot(flag(args, 'dir') ?? '.') ?? resolve(flag(args, 'dir') ?? '.');
      const undo = flag(args, 'undo');
      if (undo !== null) {
        const result = undoHeal(dir, undo);
        out(args, result, `${result.restored.length ? `restored:\n${result.restored.map((f) => `  ${f}`).join('\n')}` : 'nothing restored'}${result.skipped.length ? `\nskipped:\n${result.skipped.map((s) => `  ${s.file}: ${s.why}`).join('\n')}` : ''}\nnext: tracegrove test`);
        return result.skipped.length ? 2 : 0;
      }
      const controller = new AbortController();
      const onSignal = () => controller.abort(new Error('user_cancelled'));
      process.on('SIGINT', onSignal);
      const live = args.flags.json ? { update: () => {}, done: () => {} } : progressLine();
      try {
        const report = await heal({ dir, agent: args.flags['no-agent'] !== true, dryRun: args.flags['dry-run'] === true, overrides: { provider: flag(args, 'agent'), model: flag(args, 'model') }, signal: controller.signal,
          onProgress: (phase, detail) => live.update(`${phase}${detail ? ` · ${detail}` : ''}`), onAgentActivity: (line) => live.update(`agent · ${line.replaceAll(`${dir}/`, '')}`) });
        live.done();
        out(args, report, renderHeal(report, dir, paint()));
        return report.exitCode;
      } finally { live.done(); process.off('SIGINT', onSignal); }
    }
    case 'source-resolve': {
      const result = await resolveSourceFiles(args.flags.input, args.flags.output);
      out(args, result.summary, result.text);
      return 0;
    }
    case 'source-materialize': {
      const result = await materializeSourceFiles(args.flags.input, args.flags.repository, args.flags.root, args.flags.side, args.flags.output);
      out(args, result.summary, result.text);
      return 0;
    }

    case 'init': {
      const dir = resolve(flag(args, 'dir') ?? '.');
      const result = initProject(dir, { force: args.flags.force === true });
      out(args, result, `${result.detection.reason}: adapter ${result.detection.adapter}\nwrote:\n${result.files.map((f) => `  ${f}`).join('\n')}\n\nAdd this to your app's test-mode auth so personas work:\n\n${result.snippet}\n\nnext: tracegrove test`);
      return 0;
    }

    case 'compile': {
      const compiled = compileProject(findConfig(flag(args, 'config') ?? '.'), { sourceSnapshot: flag(args, 'source-snapshot') ? resolve(flag(args, 'source-snapshot')!) : undefined, sourceRepositoryRole: flag(args, 'source-repository-role') ?? undefined });
      out(args, compiled, `compiled ${compiled.flows.length} flow(s) into ${compiled.compiledDir}\napp source digest ${compiled.sourceDigest.slice(0, 12)} over ${compiled.sourceFiles.length} file(s)\nlow-level: workflow-verify plan --config ${compiled.workflowConfigPath} --output request.json`);
      return 0;
    }

    case 'list': {
      const compiled = compileProject(findConfig(flag(args, 'config') ?? '.'));
      out(args, compiled.flows, compiled.flows.map((f) => `${f.caseId}  [${f.tags.join(', ')}]  ${f.file}\n  ${f.title}\n${f.steps.map((s) => `    - ${s.name}: ${s.method} ${s.path}${s.as !== Object.keys(compiled.config.personas)[0] ? ` (as ${s.as})` : ''}`).join('\n')}`).join('\n'));
      return 0;
    }

    case 'test': {
      const configPath = findConfig(flag(args, 'config') ?? '.');
      const controller = new AbortController();
      const onSignal = () => { process.stderr.write('stop requested; revoking action authority, cleanup continues\n'); controller.abort(new Error('user_cancelled')); };
      process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
      const live = args.flags.json || args.flags.jsonl ? { update: () => {}, done: () => {} } : progressLine();
      try {
        const tags = flag(args, 'tag')?.split(',').map((t) => t.trim()).filter(Boolean);
        live.update('Compiling flows and starting the app');
        const { report, compiled } = await runTests({ configPath, grep: flag(args, 'grep') ?? undefined, tags, sourceSnapshot: flag(args, 'source-snapshot') ? resolve(flag(args, 'source-snapshot')!) : undefined, sourceRepositoryRole: flag(args, 'source-repository-role') ?? undefined, signal: controller.signal,
          onEvent: (event: { kind: string; stepId: string | null; redactedPayload: Record<string, unknown>; at: string }) => {
            if (args.flags.jsonl) process.stdout.write(`${JSON.stringify(event)}\n`);
            else live.update(runActivity(event).label);
          } });
        live.done();
        const p = paint();
        if (args.flags.heal && report.exitCode !== 0 && report.exitCode !== 4) {
          if (!args.flags.json) process.stdout.write(`${renderTree(report, compiled.root, p)}\n\n`);
          const healed = await heal({ dir: compiled.root, report, signal: controller.signal, onProgress: (phase, detail) => live.update(`${phase}${detail ? ` · ${detail}` : ''}`), onAgentActivity: (line) => live.update(`agent · ${line.replaceAll(`${compiled.root}/`, '')}`) });
          live.done();
          out(args, { report, heal: healed }, renderHeal(healed, compiled.root, p));
          return healed.exitCode;
        }
        out(args, report, renderTree(report, compiled.root, p));
        return report.exitCode;
      } finally {
        live.done();
        process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
      }
    }

    case 'show': {
      const configPath = findConfig(flag(args, 'config') ?? '.');
      const root = dirname(configPath);
      const runDir = resolveRun(root, flag(args, 'run') ?? 'latest');
      if (!runDir || !existsSync(join(runDir, 'summary.json'))) throw new Blocked([{ code: 'run_not_found', detail: flag(args, 'run') ?? 'latest', owner: 'operator', action: 'run tracegrove test first, or pass --run <folder name>' }]);
      const report = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8')) as TestRunReport;
      out(args, report, renderTree(report, root, paint()));
      return 0;
    }

    case 'ui': {
      const port = flag(args, 'port');
      if (port !== null && !/^\d{1,5}$/.test(port)) throw new Blocked([{ code: 'invalid_port', detail: port, owner: 'operator', action: 'pass --port <number>, or leave it out for a free port' }]);
      const server = await startUi({ dir: flag(args, 'dir') ?? '.', branch: flag(args, 'branch') ?? null, ...(port ? { port: Number(port) } : {}) });
      process.stdout.write(`tracegrove ui on ${server.url}\n(loopback only; Ctrl+C to stop)\n`);
      await new Promise<void>((done, fail) => {
        let stopping = false;
        const stop = () => { if (stopping) return; stopping = true;
          process.stderr.write('Stopping UI; waiting for the owned verification to settle. Inspect saved receipts for cleanup status.\n');
          const unlisten = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); };
          void server.close().then(() => { unlisten(); done(); }, error => { unlisten(); fail(error); }); };
        process.on('SIGINT', stop); process.on('SIGTERM', stop);
      });
      return 0;
    }

    case 'discover': {
      const result = discoverProject(flag(args, 'dir') ?? '.', flag(args, 'branch'));
      const saved = args.flags.save === true ? saveCatalog(flag(args, 'dir') ?? '.', result) : null;
      const observed = result.observed ? `observed traffic from run ${result.observed.run}${result.observed.stale ? ' (source changed since)' : ''}` : 'no verified run yet, so nothing is observed';
      const state = (r: typeof result.routes[number]) => r.observedBy.length ? 'observed ' : r.confirmedEarlier ? 'earlier  ' : r.coveredBy.length ? 'declared ' : 'UNCOVERED';
      out(args, result, [
        `${result.source}: ${result.routes.length} route(s), ${result.uncovered} uncovered; ${observed}${result.changedFiles.length ? `; ${result.changedFiles.length} changed file(s) vs ${result.base}` : ''}`,
        ...result.routes.map((r) => `  ${state(r)} ${r.method.padEnd(6)} ${r.path}  ${r.file ? `${r.file}${r.line ? `:${r.line}` : ''}` : '(seen only in traffic)'}${r.actions.length ? `  [${r.actions.join(', ')}]` : ''}${r.changed ? '  (changed)' : ''}`),
        ...(result.actions.length ? ['', `${result.actions.length} reusable action(s):`, ...result.actions.map((a) => `  ${a.id.padEnd(24)} ${a.routes.join(', ') || '(no routes)'}  used by ${a.usedBy.length} flow(s)`)] : []),
        ...(saved ? ['', `catalog: ${saved.routes} route(s) recorded in ${relative(resolve(flag(args, 'dir') ?? '.'), saved.path)}`] : []),
        ...(result.ambiguities.length ? ['', `${result.ambiguities.length} place(s) discovery cannot read; \`tracegrove draft\` asks the agent to resolve them and proves the answer:`, ...result.ambiguities.slice(0, 12).map((a) => `  ? ${a.detail}`)] : []),
      ].join('\n'));
      return 0;
    }

    case 'check': {
      const result = checkProject(flag(args, 'dir') ?? '.');
      out(args, result, result.ok ? `ok: ${result.flows.length} flow(s) compile` : `${result.issues.length} issue(s):\n${result.issues.map((i) => `  ${i.detail}\n    → ${i.action}`).join('\n')}`);
      return result.ok ? 0 : 2;
    }

    case 'settings': {
      const dir = resolve(flag(args, 'dir') ?? '.');
      const provider = flag(args, 'agent'); const model = flag(args, 'model');
      const snapshot = flag(args, 'source-snapshot');
      const workingTree = args.flags['working-tree'] === true;
      if (snapshot !== null && workingTree) throw new Conflict('Choose --source-snapshot or --working-tree, not both');
      if (provider !== null || model !== null || snapshot !== null || workingTree) {
        const current = readLocalSettings(dir);
        const agent = { ...current.agent };
        if (provider !== null && provider !== agent.provider && model === null) delete agent.model;
        const source = snapshot !== null ? previewVerificationSource(dir, resolve(snapshot), loadAuthoringConfig(findConfig(dir))).selection
          : workingTree ? { kind: 'working_tree' as const } : null;
        writeLocalSettings(dir, { ...current,
          ...(provider !== null || model !== null ? { agent: { ...agent, ...(provider !== null ? { provider } : {}), ...(model !== null ? { model } : {}) } } : {}),
          ...(source ? { verification: { source } } : {}),
        });
      }
      let config = null; try { config = loadAuthoringConfig(findConfig(dir)); } catch { config = null; }
      const settings = resolveAgentSettings(dir, config);
      const detected = detectAgents();
      const verificationSource = savedVerificationSource(dir);
      out(args, { settings, detected, verificationSource }, `agent: ${settings.provider} (from ${settings.source.provider})\nmodel: ${settings.model ?? 'CLI default'} (from ${settings.source.model})\nclaude: ${detected.claude ?? 'not installed'}\ncodex: ${detected.codex ?? 'not installed'}\nverification input: ${verificationSource.kind === 'snapshot' ? verificationSource.path + ' (pinned local snapshot)' : 'working tree'}`);
      return 0;
    }

    case 'draft': {
      const controller = new AbortController();
      const onSignal = () => controller.abort(new Error('user_cancelled'));
      process.on('SIGINT', onSignal);
      const live = args.flags.json ? { update: () => {}, done: () => {} } : progressLine();
      live.update('Discovering routes and briefing the agent');
      try {
        const result = await draftWithAgent({ dir: flag(args, 'dir') ?? '.', branch: flag(args, 'branch'), intent: flag(args, 'intent'), overrides: { provider: flag(args, 'agent'), model: flag(args, 'model') }, signal: controller.signal,
          prove: args.flags['no-prove'] !== true,
          ...(args.flags.json ? {} : { onActivity: (line: string) => live.update(`agent · ${line.replaceAll(`${resolve(flag(args, 'dir') ?? '.')}/`, '')}`), onProve: (line: string) => live.update(`prove · ${line}`) }) });
        live.done();
        const { agent, check, prove } = result;
        const mark = { proven: '✓ proven     ', failed: '✗ failed     ', product_bug: '! product bug', not_run: '· not run    ' } as const;
        const proveText = prove === null ? 'prove: skipped (--no-prove); next: tracegrove test --grep discovered'
          : prove.flows.length === 0 ? 'prove: no new flow files to run'
          : [`prove: ran each new flow end to end${prove.rounds ? `, ${prove.rounds} repair round(s)` : ''}`,
            ...prove.flows.map((f) => `  ${mark[f.outcome]} ${f.file}${f.served.length ? `  (served ${f.served.length} route(s))` : ''}${f.detail ? `\n                  ${f.detail}` : ''}`),
            ...prove.actions.map((a) => `  ${a.outcome === 'proven' ? '✓ proven     ' : a.outcome === 'unused' ? '· unused     ' : '✗ unproven   '} ${a.file}  (action ${a.id}${a.usedBy.length ? `, used by ${a.usedBy.join(', ')}` : ''})`),
            ...(result.catalog ? [`catalog: ${result.catalog.routes} route(s) recorded in ${relative(resolve(flag(args, 'dir') ?? '.'), result.catalog.path)}`] : [])].join('\n');
        out(args, result, `\n${agent.provider}${agent.model ? ` (${agent.model})` : ''} exited ${agent.exitCode}; ${agent.files.length} flow file(s) written\n\n${agent.output}\n\ncheck: ${check.ok ? `ok, ${check.flows.length} flow(s) compile` : check.issues.map((i) => `  ${i.detail}`).join('\n')}\n${proveText}`);
        const proven = prove === null || prove.flows.every((f) => f.outcome === 'proven');
        return agent.exitCode === 0 && check.ok ? (proven ? 0 : 1) : 2;
      } finally { live.done(); process.off('SIGINT', onSignal); }
    }

    case 'sample-config': {
      const sample = args.flags.sample ?? 'notes-api';
      const output = resolve(args.flags['output']);
      const config = writeSample(samplesDir(), sample, output);
      const next = sample === 'notes-django' ? `install the pinned Python dependencies as described in ${join(output, 'README.md')}, then run doctor` : `workflow-verify doctor --config ${config}`;
      out(args, { sample, output, config }, `wrote sample ${sample} to ${output}\nnext: ${next}`);
      return 0;
    }

    case 'validate': {
      const project = loadProject(args.flags['config']);
      out(args, { project: project.config.project, corpusDigest: project.corpus.manifest.ref.digest.hex, members: project.corpus.manifest.members.length, cases: project.suiteCases.map((c) => c.ref.id) },
        `valid: ${project.corpus.manifest.members.length} definitions, corpus ${project.corpus.manifest.ref.digest.hex.slice(0, 12)}; ${project.suiteCases.length} suite cases. Validation approves nothing and verifies no product.`);
      return 0;
    }

    case 'cases': {
      const project = loadProject(args.flags['config']);
      const query: import('../core/lookup.ts').CaseQuery = {};
      for (const name of ['id', 'workflow', 'surface', 'text', 'cursor'] as const) {
        const value = flag(args, name); if (value) query[name] = value;
      }
      if (flag(args, 'limit')) query.limit = Number(flag(args, 'limit'));
      const page = searchCases(project, query);
      out(args, page, JSON.stringify(page, null, 2)); return 0;
    }

    case 'rerun': {
      const bundle = createRerun(readBundle(args.flags['request']));
      const output = resolve(args.flags['output']);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`);
      out(args, { output, requestRef: bundle.request!.ref, replayOf: bundle.request!.replayOf }, `fresh rerun request: ${output}`);
      return 0;
    }

    case 'recovery-status': {
      const report = inspectRecoveryStatus({ stateDir: args.flags['state-dir'], executionId: args.flags.execution, scope: localScope() });
      out(args, report, `${report.code}\n${report.recovery}\nRecorded resources: ${report.resources ? JSON.stringify(report.resources) : 'unavailable'}\nNo cleanup or execution was attempted; this report grants no action authority.`);
      return report.exitCode;
    }

    case 'setup': {
      const result = await setupBrowsers({ dryRun: args.flags['dry-run'] === true, checkOnly: args.flags['check-only'] === true, onOutput: args.flags.json ? undefined : (chunk) => process.stderr.write(chunk) });
      out(args, result, [result.install ? `${result.install.ran ? 'ran' : 'would run'}: ${result.install.command.join(' ')}${result.install.ran ? ` (exit ${result.install.exitCode})` : ''}` : 'install: skipped (--check-only)',
        result.probe ? (result.probe.ok ? `browser: ok, recorded a ${result.probe.videoBytes}-byte test video with ${result.probe.executable}` : `browser: ${result.probe.code}: ${result.probe.detail}`) : 'browser: not probed (--dry-run)'].join('\n'));
      return result.probe && !result.probe.ok ? 2 : result.install?.ran && result.install.exitCode !== 0 ? 3 : 0;
    }

    case 'doctor': {
      const report = await inspectDoctor(args.flags);
      out(args, report, report.checks.map(c => `${c.state.padEnd(8)} ${c.check}: ${c.detail}${c.action !== 'none' ? `\n  action: ${c.action}` : ''}`).join('\n') +
        report.errors.map(e => `\nBLOCKED ${e.code}: ${e.detail}\n  action: ${e.action}`).join('') +
        `\n${report.blocked ? 'BLOCKED: resolve the items above' : 'Metadata checks passed; application execution and verification have not started.'}\n` +
        `${report.selection?.compiledFilesWritten ? 'Derived corpus files were written. ' : ''}Doctor never launches the app; interpreter --version probes may run. No running product was observed.`);
      return report.exitCode;
    }

    case 'plan': {
      const project = loadProject(args.flags['config']);
      const profileName = flag(args, 'profile') ?? project.config.defaultProfile;
      const output = resolve(args.flags['output']);
      const workBinding = args.flags['work-binding'] ? RunRequest.shape.workBinding.parse(readConfigurationJson(args.flags['work-binding'], 262144)) : null;
      const bundle = plan({ project, profileName, scope: localScope(), purpose: args.flags.purpose ?? 'trial', workBinding });
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`);
      const summary = { output, profile: profileName, requestDigest: bundle.request?.ref.digest.hex ?? null, idempotencyKey: bundle.request?.idempotencyKey ?? null, cells: bundle.request?.caseRefs.length ?? 0, excluded: bundle.excludedCells, blockers: bundle.blockers, estimatedCostCents: bundle.estimatedCostCents, requirements: bundle.requirements };
      out(args, summary, bundle.blockers.length === 0
        ? `frozen request ${bundle.request!.ref.digest.hex.slice(0, 12)} (${summary.cells} cell(s), ${bundle.excludedCells.length} excluded) -> ${output}\nestimated cost: ${bundle.estimatedCostCents} cents; no effects performed`
        : `BLOCKED plan written to ${output}:\n${bundle.blockers.map((b) => `  ${b.code} [${b.cellId ?? 'campaign'}] ${b.detail}\n    owner: ${b.owner}; action: ${b.action}`).join('\n')}`);
      return bundle.blockers.length === 0 ? 0 : 2;
    }

    case 'seed': {
      const bundle = readBundle(args.flags['request']);
      if (!args.flags.preview) throw new Blocked([{ code: 'seed_apply_not_separate', detail: 'seed --apply is not implemented in this prototype; run prepares the same admitted attempt once', owner: 'operator', action: 'use seed --preview or run' }]);
      if (!bundle.request) { out(args, { blockers: bundle.blockers }, `plan is blocked; nothing to preview`); return 2; }
      const rows: Array<Record<string, unknown>> = [];
      for (const caseRef of bundle.request.caseRefs) {
        const spec = parseAs(CaseSpec, bundle.documents[refKey(caseRef)], 'case');
        if (!spec.fixturePlanRef) { rows.push({ case: spec.ref.id, fixtures: 'none' }); continue; }
        const planDoc = parseAs(CaseFixturePlan, bundle.documents[refKey(spec.fixturePlanRef)], 'fixture plan');
        const recipe = parseAs(SeedRecipe, bundle.documents[refKey(planDoc.seedRecipeRef)], 'recipe');
        const payload = parseAs(LogicalPayload, bundle.documents[refKey(planDoc.logicalPayloadRef)], 'payload');
        for (const entity of recipe.entities) {
          rows.push({ case: spec.ref.id, entity: entity.entityKey, action: entity.actionId, values: payload.entities.find((e) => e.entityKey === entity.entityKey)?.values ?? {}, readback: entity.readback?.actionId ?? null, cleanup: entity.cleanup?.actionId ?? null, payloadDigest: payload.ref.digest.hex.slice(0, 12) });
        }
      }
      out(args, { preview: rows }, rows.map((r) => JSON.stringify(r)).join('\n') + '\nestimated records only; nothing was created');
      return 0;
    }

    case 'controller': {
      const controller = await startController(args.flags['state-dir'], args.flags['project-root']);
      out(args, { endpoint: controller.endpoint }, `controller ready: ${controller.endpoint}`);
      await new Promise<void>((done) => {
        const stop = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); done(); };
        process.on('SIGINT', stop); process.on('SIGTERM', stop);
      });
      await controller.close();
      return 0;
    }

    case 'run': {
      const bundle = readBundle(args.flags['request']);
      if (!bundle.request) { out(args, { outcome: 'blocked', blockers: bundle.blockers }, `BLOCKED: ${bundle.blockers.map((b) => b.code).join(', ')}`); return 2; }
      const stateDir = flag(args, 'state-dir') ?? stateDirFor(bundle.projectRoot);
      let ledger: LocalLedger | null = null;
      try { ledger = LocalLedger.open(stateDir); }
      catch (error) { if (!(error instanceof Conflict)) throw error; }
      const controller = new AbortController();
      const onSignal = () => { process.stderr.write('stop requested; revoking action authority, cleanup continues\n'); controller.abort(new Error('user_cancelled')); };
      process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
      try {
        const summary = ledger
          ? await executeBundle({ bundle, stateDir, ledger, scope: localScope(), signal: controller.signal, ...(args.flags.jsonl ? { onEvent: (event: { kind: string; stepId: string | null; redactedPayload: Record<string, unknown>; at: string }) => { process.stdout.write(`${JSON.stringify(event)}\n`); } } : {}) })
          : await delegateRun(stateDir, bundle, controller.signal);
        const result = { executionId: summary.executionId, attemptId: summary.attemptId, campaignId: summary.campaignId, outcome: summary.outcome, exitCode: summary.exitCode, reasonCodes: summary.reasonCodes, redelivered: summary.redelivered, executionDir: summary.executionDir, cells: summary.receipts.map((r) => ({ cell: r.selectionCellId, outcome: r.outcome, proofClaim: r.proofClaim, firstFailure: r.steps.find((s) => s.result !== 'completed')?.stepId ?? null, failedAssertions: r.assertions.filter((a) => a.result === 'fail').map((a) => a.assertionId) })) };
        out(args, result, `${summary.outcome.toUpperCase()} (${summary.redelivered ? 'reconciled existing execution ' : 'execution '}${summary.executionId})\n` + result.cells.map((c) => `  ${c.cell}: ${c.outcome}${c.firstFailure ? `; first failure at step ${c.firstFailure}` : ''}${c.failedAssertions.length ? `; failed ${c.failedAssertions.join(', ')}` : ''}`).join('\n') + `\nreasons: ${summary.reasonCodes.join(', ') || 'none'}\nbundle: ${summary.executionDir}`);
        return summary.exitCode;
      } finally {
        process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
        ledger?.close();
      }
    }

    case 'inspect': {
      if (args.flags.request) {
        const inspection = inspectFrozenPlan(readBundle(args.flags.request), localScope());
        out(args, inspection, `${inspection.structural.toUpperCase()} frozen structure · ${inspection.cells.length} cell(s)\nexecution authority: ${inspection.executionAuthority}\n` +
          inspection.blockers.map(b => `${b.code}: ${b.detail}`).join('\n'));
        return inspection.structural === 'valid' ? 0 : 2;
      }
      const executionId = args.flags.execution ?? null;
      const dir = args.flags.bundle ? resolve(args.flags.bundle) : join(resolve(args.flags['state-dir']!), 'executions', executionId!);
      if (!existsSync(dir)) throw new Blocked([{ code: 'execution_not_found', detail: dir, owner: 'operator', action: 'check the bundle or execution path' }]);
      const snapshot = VerifiedBundleSnapshot.open(dir);
      if (args.flags['failed-step']) {
        const inspection = inspectFailedSteps(snapshot, executionId); const { failed } = inspection;
        out(args, inspection, failed.length ? failed.map((f) => `${f.cell} step ${f.step}: ${f.result} (${f.reason ?? 'no reason'})\n${JSON.stringify(f.output, null, 2)}`).join('\n') : 'no failed step'); return 0;
      }
      const inspection = inspectExecution(snapshot, executionId);
      out(args, inspection, `${inspection.outcome.toUpperCase()} campaign ${inspection.campaignId} · evidence verified\n` +
        inspection.cells.map(r => `  ${r.cell}: ${r.outcome} [${r.reasonCodes.join(', ') || 'no reasons'}]\n    steps: ${r.steps.join(' ')}\n    assertions: ${r.assertions.join(' ')}`).join('\n'));
      return 0;
    }

    case 'export': {
      const stateDir = resolve(args.flags['state-dir']);
      const executionId = args.flags['execution'];
      const output = resolve(args.flags['output']);
      const dir = join(stateDir, 'executions', executionId);
      if (!existsSync(dir)) throw new Blocked([{ code: 'execution_not_found', detail: executionId }]);
      createDurableDirectory(dirname(output));
      const verification = exportVerifiedBundle(dir, output);
      out(args, { output, verification, published: verification.ok }, verification.ok ? `exported to ${output}; verification ok` : `bundle invalid; no output published: ${verification.problems.join('; ')}`);
      return verification.ok ? 0 : 2;
    }

    case 'verify-bundle': {
      const verification = verifyBundle(resolve(args.flags['bundle']));
      out(args, verification, verification.ok ? `bundle ok: ${verification.receipts} receipt(s), re-reduced outcome ${verification.outcome}` : `bundle INVALID:\n  ${verification.problems.join('\n  ')}`);
      return verification.ok ? 0 : 2;
    }

    case 'awr-prepare':
    case 'awr-inspect':
    case 'awr-deliver':
    case 'report-prepare':
    case 'report-inspect':
    case 'report-attach': {
      const { runAwrCommand } = await import('../integrations/awr/cli.ts').catch(() => {
        throw new Conflict('AWR integration unavailable; install the optional peer @useorgx/agent-work-receipt@0.3.0');
      });
      const state = await runAwrCommand(args.command, args.flags);
      out(args, state, `${state.status}: ${state.prepared.ref.id}\nAttempts: ${state.attempts}; target verdict is in the saved receipt.\nImported evidence remains unverified; native acceptance and outcomes are separate.`);
      return 0;
    }
    case 'result-ingest':
    case 'results': {
      if (args.command === 'results' && args.flags.id && (args.flags.cursor !== undefined || args.flags.limit !== undefined)) throw new Conflict('Choose --id or pagination options, not both');
      const scope = localScope(); const ledger = LocalLedger.open(resolve(args.flags.sink));
      try {
        const sink = new LocalResultSink(ledger, scope, { authorize: async requested => {
          if (!sameScope(requested, scope)) throw new Conflict('Result scope differs from the local operator');
        } });
        if (args.command === 'result-ingest') {
          const result = await sink.ingest(resolve(args.flags.bundle));
          out(args, result, `${result.replayed ? 'already retained' : 'retained'}: ${result.receipt.ref.id}\noutcome: ${result.receipt.retainedOutcome}; planned lanes: ${result.receipt.plannedLanes.join(', ') || 'unavailable'}\nissuer unverified; qualification not evaluated\narchive: ${result.bundleDir}`);
        } else if (args.flags.id) {
          const result = await sink.get(args.flags.id);
          out(args, result, `${result.receipt.ref.id}\nretained outcome: ${result.receipt.retainedOutcome}; archive re-verified\nplanned lanes: ${result.receipt.plannedLanes.join(', ') || 'unavailable'}\nissuer unverified; qualification not evaluated\narchive: ${result.bundleDir}`);
        } else {
          const page = await sink.list({ ...(args.flags.cursor ? { cursor: args.flags.cursor } : {}), ...(args.flags.limit ? { limit: Number(args.flags.limit) } : {}) });
          out(args, page, `${page.records.map(record => `${record.ref.id}  ${record.retainedOutcome}  [${record.plannedLanes.join(', ')}]  ${record.campaignRef.id}`).join('\n') || 'No retained results.'}\nStored receipts only; archives not checked. Issuers unverified; qualification not evaluated.${page.nextCursor ? `\nnext cursor: ${page.nextCursor}` : ''}`);
        }
        return 0;
      } finally { ledger.close(); }
    }

    case 'verify-cleanup': {
      const result = checkCleanupFiles(resolve(args.flags['proof']),
        resolve(args.flags['expectation']), resolve(args.flags['trust']));
      out(args, result, result.ok
        ? `cleanup follow-up integrity valid: ${result.proofDigest}\n${result.resourceCount} resource(s); hosted release is not admitted`
        : `cleanup follow-up INVALID:\n  ${result.problems.join('\n  ')}`);
      return result.ok ? 0 : 2;
    }

    case 'schema': {
      const { exportJsonSchemas } = await import('../protocol/index.ts');
      const output = resolve(args.flags['output']);
      mkdirSync(output, { recursive: true });
      const schemas = exportJsonSchemas();
      for (const [name, schema] of Object.entries(schemas)) writeFileSync(join(output, `${name.replace(/[\/.]/g, '_')}.json`), `${JSON.stringify(schema, null, 2)}\n`);
      out(args, { output, count: Object.keys(schemas).length }, `exported ${Object.keys(schemas).length} schemas to ${output}`);
      return 0;
    }

    default: {
      const unreachable: never = args;
      void unreachable;
      throw new InfrastructureFailure('Parsed CLI command has no implementation');
    }
  }
}

function readBundle(path: string): FrozenBundle {
  return readFrozenBundle(resolve(path));
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error: unknown) => {
  // Argument failures happen before the doctor handler; retain its structured JSON contract.
  if (jsonRequested(process.argv.slice(2))) {
    const report = process.argv[2] === 'doctor' ? doctorFailure(error) : cliErrorReport(error, process.argv[2]);
    process.stdout.write(`${JSON.stringify(report)}\n`); process.exitCode = report.exitCode; return;
  }
  if (error instanceof Blocked) { process.stderr.write(`BLOCKED: ${error.reasons.map((r) => `${r.code}: ${r.detail} (owner: ${r.owner}; action: ${r.action})`).join('\n')}\n`); process.exitCode = 2; return; }
  if (error instanceof Conflict) { process.stderr.write(`CONFLICT: ${error.message}\n`); process.exitCode = 2; return; }
  if (error instanceof SchemaViolation) { process.stderr.write(`INVALID: ${error.message}\n`); process.exitCode = 2; return; }
  if (error instanceof InfrastructureFailure) { process.stderr.write(`INFRASTRUCTURE FAILURE: ${error.message}\n`); process.exitCode = 3; return; }
  process.stderr.write(`ERROR: ${(error as Error).stack ?? String(error)}\n`);
  process.exitCode = 3;
});
void EXIT_CODES; void (null as unknown as Ref);
