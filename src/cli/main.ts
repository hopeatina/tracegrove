#!/usr/bin/env node
/**
 * workflow-verify CLI. Every command goes through the same resolver, admission and reducer as
 * the library API. Exit codes: 0 pass, 1 assertion failure, 2 blocked/inconclusive,
 * 3 infrastructure failure, 4 cancelled. Non-execution commands exit 0 for their own success only.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadProject, localScope } from '../core/corpus.ts';
import { plan, type FrozenBundle } from '../core/planner.ts';
import { EXIT_CODES, executeBundle } from '../core/executor.ts';
import { LocalLedger } from '../core/ledger.ts';
import { delegateRun, startController } from '../core/controller.ts';
import { searchCases } from '../core/lookup.ts';
import { createRerun } from '../core/rerun.ts';
import { verifyBundle } from '../core/bundle.ts';
import { checkCleanupFiles } from './cleanup.ts';
import { parseArgs, type Args } from './arguments.ts';
import { Blocked, Conflict, InfrastructureFailure } from '../core/errors.ts';
import { SchemaViolation, CaseFixturePlan, CaseSpec, SeedRecipe, LogicalPayload, HostPlan, ExecutionReceipt, CampaignResult, parseAs, refKey, type Ref } from '../protocol/index.ts';
import { sourceIdentityDigest } from '../hosts/local.ts';
import { observeApplicationRuntime } from '../hosts/runtime.ts';

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

const HELP = `workflow-verify <command> [--flags]

  sample-config --sample notes-api --output <dir>     write a sample project (real app + corpus)
  validate --config <workflow.yaml>                    validate schemas, references and digests
  doctor --config <workflow.yaml> [--profile <name>]   report tools, identity pins and capabilities (no effects)
  plan --config <workflow.yaml> [--profile <name>] --output <request.json>
  seed --request <request.json> --preview              show planned fixture resources and cleanup (no effects)
  run --request <request.json> [--jsonl]               admit and execute the frozen request
  controller --state-dir <dir> --project-root <dir>    own the local ledger; CLI runs delegate
  cases --config <workflow.yaml> [--id <id>] [--cursor <cursor>]
  rerun --request <request.json> --output <new.json>   freeze a fresh attempt on the same cases
  inspect --execution <id> --state-dir <dir> [--failed-step]
  export --execution <id> --state-dir <dir> --output <dir>
  verify-bundle --bundle <dir>                         recheck hashes, digests and re-reduce the verdict
  verify-cleanup --proof <json> --expectation <json> --trust <json> [--json]
                                                       check signed follow-up integrity; no hosted release
  schema --output <dir>                                export JSON Schemas

Exit codes: 0 pass, 1 assertion failure, 2 blocked/inconclusive, 3 infrastructure failure, 4 cancelled.`;

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  switch (args.command) {
    case 'help': process.stdout.write(`${HELP}\n`); return 0;

    case 'sample-config': {
      const sample = flag(args, 'sample') ?? 'notes-api';
      const output = resolve(args.flags['output']);
      const source = join(samplesDir(), sample);
      if (!existsSync(source)) throw new Blocked([{ code: 'unknown_sample', detail: sample, owner: 'operator', action: `choose one of ${readdirSync(samplesDir()).join(', ')}` }]);
      mkdirSync(output, { recursive: true });
      cpSync(source, output, { recursive: true });
      out(args, { sample, output, config: join(output, 'verification', 'workflow.yaml') }, `wrote sample ${sample} to ${output}\nnext: workflow-verify doctor --config ${join(output, 'verification', 'workflow.yaml')}`);
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

    case 'doctor': {
      const project = loadProject(args.flags['config']);
      const profileName = flag(args, 'profile') ?? project.config.defaultProfile;
      const profile = project.config.profiles[profileName];
      if (!profile) throw new Blocked([{ code: 'unknown_profile', detail: profileName }]);
      const hostRef = project.fileRefs.get(profile.hostPlanRef ?? project.config.executionHostRef)!;
      const hostPlan = project.corpus.getAs(HostPlan, hostRef);
      const checks: Array<{ check: string; state: string; detail: string }> = [];
      checks.push({ check: 'node', state: process.versions.node.startsWith('22.') ? 'ok' : 'warn', detail: process.version });
      if (hostPlan.launch) {
        const cwd = resolve(project.root, hostPlan.launch.cwd);
        try {
          const identity = sourceIdentityDigest(cwd, hostPlan.launch.identitySourceFiles);
          checks.push({ check: 'identity_sources', state: 'ok', detail: `${identity.entries.length} file(s), digest ${identity.hex.slice(0, 12)}` });
        } catch (error) { checks.push({ check: 'identity_sources', state: 'blocked', detail: String((error as Error).message) }); }
        try {
          const runtime = await observeApplicationRuntime(hostPlan.launch.command, cwd, process.env.PATH ?? '');
          checks.push({ check: 'application_runtime', state: 'ok', detail: `${runtime.runtime} (${runtime.version}); executable digest ${runtime.executableSha256.slice(0, 12)}` });
        } catch (error) { checks.push({ check: 'application_runtime', state: 'blocked', detail: String((error as Error).message) }); }
      } else {
        checks.push({ check: 'host', state: 'ok', detail: `${hostPlan.adapter} binds a declared target; no launch` });
      }
      const bundle = plan({ project, profileName, scope: localScope() });
      checks.push({ check: 'plan', state: bundle.blockers.length === 0 ? 'ok' : 'blocked', detail: bundle.blockers.length === 0 ? `${bundle.request!.caseRefs.length} case(s), ${bundle.excludedCells.length} excluded` : bundle.blockers.map((b) => `${b.code}: ${b.detail}`).join('; ') });
      const blocked = checks.some((c) => c.state === 'blocked');
      out(args, { profile: profileName, checks, blocked }, checks.map((c) => `${c.state.padEnd(8)} ${c.check}: ${c.detail}`).join('\n') + `\n${blocked ? 'BLOCKED: resolve the items above' : 'doctor made no effects and observed no running product; run plan next'}`);
      return blocked ? 2 : 0;
    }

    case 'plan': {
      const project = loadProject(args.flags['config']);
      const profileName = flag(args, 'profile') ?? project.config.defaultProfile;
      const output = resolve(args.flags['output']);
      const bundle = plan({ project, profileName, scope: localScope(), purpose: args.flags.purpose ?? 'trial' });
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
      const stateDir = resolve(args.flags['state-dir']);
      const executionId = args.flags['execution'];
      const dir = join(stateDir, 'executions', executionId);
      if (!existsSync(dir)) throw new Blocked([{ code: 'execution_not_found', detail: executionId, owner: 'operator', action: 'check the execution id and state dir' }]);
      const campaign = parseAs(CampaignResult, JSON.parse(readFileSync(join(dir, 'campaign.json'), 'utf8')), 'campaign');
      const cells = readdirSync(join(dir, 'cells')).map((name) => parseAs(ExecutionReceipt, JSON.parse(readFileSync(join(dir, 'cells', name, 'receipt.json'), 'utf8')), 'receipt'));
      const failed = cells.flatMap((r) => r.steps.filter((s) => s.result !== 'completed').slice(0, 1).map((s) => ({ cell: r.selectionCellId, step: s.stepId, result: s.result, reason: s.reasonCode, output: s.output })));
      if (args.flags['failed-step']) { out(args, { executionId, failed }, failed.length ? failed.map((f) => `${f.cell} step ${f.step}: ${f.result} (${f.reason ?? 'no reason'})\n${JSON.stringify(f.output, null, 2)}`).join('\n') : 'no failed step'); return 0; }
      out(args, { executionId, outcome: campaign.outcome, coverage: campaign.coverage, cells: cells.map((r) => ({ cell: r.selectionCellId, outcome: r.outcome, reasonCodes: r.reasonCodes, steps: r.steps.map((s) => `${s.stepId}:${s.result}`), assertions: r.assertions.map((a) => `${a.assertionId}:${a.result}`) })) },
        `${campaign.outcome.toUpperCase()} campaign ${campaign.campaignId}\n` + cells.map((r) => `  ${r.selectionCellId}: ${r.outcome} [${r.reasonCodes.join(', ') || 'no reasons'}]\n    steps: ${r.steps.map((s) => `${s.stepId}:${s.result}`).join(' ')}\n    assertions: ${r.assertions.map((a) => `${a.assertionId}:${a.result}`).join(' ')}`).join('\n'));
      return 0;
    }

    case 'export': {
      const stateDir = resolve(args.flags['state-dir']);
      const executionId = args.flags['execution'];
      const output = resolve(args.flags['output']);
      const dir = join(stateDir, 'executions', executionId);
      if (!existsSync(dir)) throw new Blocked([{ code: 'execution_not_found', detail: executionId }]);
      mkdirSync(output, { recursive: true });
      cpSync(dir, output, { recursive: true, filter: (src) => !src.includes(`${executionId}/host`) });
      const verification = verifyBundle(output);
      out(args, { output, verification }, `exported to ${output}; verification ${verification.ok ? 'ok' : `FAILED: ${verification.problems.join('; ')}`}`);
      return verification.ok ? 0 : 2;
    }

    case 'verify-bundle': {
      const verification = verifyBundle(resolve(args.flags['bundle']));
      out(args, verification, verification.ok ? `bundle ok: ${verification.receipts} receipt(s), re-reduced outcome ${verification.outcome}` : `bundle INVALID:\n  ${verification.problems.join('\n  ')}`);
      return verification.ok ? 0 : 2;
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
  const bundle = JSON.parse(readFileSync(resolve(path), 'utf8')) as FrozenBundle;
  if (bundle.schemaVersion !== 'workflow.frozen-request-bundle/v1') throw new Blocked([{ code: 'invalid_request_file', detail: path, owner: 'operator', action: 'pass the file written by plan' }]);
  return bundle;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error: unknown) => {
  if (error instanceof Blocked) { process.stderr.write(`BLOCKED: ${error.reasons.map((r) => `${r.code}: ${r.detail} (owner: ${r.owner}; action: ${r.action})`).join('\n')}\n`); process.exitCode = 2; return; }
  if (error instanceof Conflict) { process.stderr.write(`CONFLICT: ${error.message}\n`); process.exitCode = 2; return; }
  if (error instanceof SchemaViolation) { process.stderr.write(`INVALID: ${error.message}\n`); process.exitCode = 2; return; }
  if (error instanceof InfrastructureFailure) { process.stderr.write(`INFRASTRUCTURE FAILURE: ${error.message}\n`); process.exitCode = 3; return; }
  process.stderr.write(`ERROR: ${(error as Error).stack ?? String(error)}\n`);
  process.exitCode = 3;
});
void EXIT_CODES; void (null as unknown as Ref);
