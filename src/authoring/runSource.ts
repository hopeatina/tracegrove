import { join } from 'node:path';
import { z } from 'zod';
import { readVerifiedBundle } from '../core/bundle.ts';
import { readBoundedFile } from '../core/boundedFile.ts';
import { EXIT_CODES } from '../core/executor.ts';
import { CaseSpec, DigestSchema, EffectiveConfig, HostPlan, RepositoryPath, digestOfValue, refKey, type Step } from '../protocol/index.ts';
import { caseReport } from './run.ts';
import { TestRunReport, invalidateRunReport } from './runReport.ts';
import { describeSnapshot } from './verificationSource.ts';
import type { VerificationSourceBinding } from './sourceSelection.ts';
import type { CompiledFlowInfo, CompiledStepInfo } from './compile.ts';
import { isRunDirectory } from './runLocation.ts';
import { verifiedObservedRequests } from './traffic.ts';
import { cellBundleName } from '../core/bundlePaths.ts';

export const CheckedRunReport = TestRunReport.extend({ sourceChecked: z.boolean(), sourceIssue: z.string().optional(),
  evidenceStatus: z.enum(['verified', 'invalid', 'not_executed']), manifestDigest: DigestSchema.nullable() }).strict();
export type CheckedRunReport = z.infer<typeof CheckedRunReport>;
const ISSUE = 'Saved evidence is missing or could not be verified. No product result is available.';

/** What a conversation step was checked for, rebuilt from its sealed assertions. */
function conversationExpectation(assertions: CaseSpec['assertions'], stepId: string): string {
  type P = CaseSpec['assertions'][number]['predicate'];
  const flat = (p: P): P[] => p.kind === 'all' ? p.predicates.flatMap(flat) : [p];
  const own = assertions.filter((a) => a.stepId === stepId).flatMap((a) => flat(a.predicate));
  const values = (kind: string, tools: boolean) => own.flatMap((p) => (p.kind === 'json_path_includes' || p.kind === 'json_path_excludes') && p.kind === kind && /toolNames$/.test(p.path) === tools ? p.values : []);
  const says = values('json_path_includes', false); const calls = values('json_path_includes', true);
  const parts = [says.length ? `says ${says.map((v) => JSON.stringify(v)).join(', ')}` : '', calls.length ? `calls ${calls.join(', ')}` : '',
    own.some((p) => p.kind === 'json_path_excludes') ? 'and avoids what it must not do' : ''].filter(Boolean);
  return parts.length ? `Agent ${parts.join('; ')}` : 'Conversation completes';
}

function stepInfo(step: Step, persona: string, assertions: CaseSpec['assertions'] = []): CompiledStepInfo {
  const common = { id: step.id, name: step.id.replaceAll('_', ' '), as: persona, expectStatus: null };
  if (step.kind === 'http.request') return { ...common, method: step.method, path: step.path, expectStatus: step.expectStatus,
    ...(step.expectStatus !== null ? { expectation: `Status ${step.expectStatus}` } : {}) };
  if (step.kind === 'observe') return { ...common, method: step.readback.method, path: step.readback.path };
  if (step.kind === 'ui.navigate') return { ...common, method: 'UI', path: step.path };
  if (step.kind === 'conversation.run') return { ...common, method: step.command.channel === 'voice' ? 'VOICE' : 'CHAT', path: `${step.command.endpoint} · ${step.command.turns.length} turn${step.command.turns.length === 1 ? '' : 's'}`, expectation: conversationExpectation(assertions, step.id) };
  if (step.kind === 'standin.fault') return { ...common, method: 'FAULT', path: `${step.command.standIn} ${step.command.route.method} ${step.command.route.path}`, expectation: 'Fault armed' };
  if (step.kind === 'standin.observe') return { ...common, method: 'STANDIN', path: `${step.command.standIn}${step.command.route ? ` ${step.command.route.method} ${step.command.route.path}` : ''}` };
  return { ...common, method: step.kind.startsWith('job.') ? 'JOB' : step.kind === 'mcp.call' ? 'MCP' : 'UI', path: step.id };
}

/** Reconstruct every product fact from one verified capture. Summary fields supply file hints only. */
export function readRunSource(runDir: string, input: unknown): CheckedRunReport {
  const parsed = TestRunReport.safeParse(input);
  const report: TestRunReport = parsed.success ? { ...parsed.data, runDir } : { schemaVersion: 'tracegrove.run-summary/v1',
    project: 'unavailable', outcome: 'inconclusive', exitCode: 2, startedAt: '', finishedAt: '', executionId: null,
    sourceDigest: '', runDir, bundleVerified: false, sourceBinding: null, blockers: [], cases: [], totals: { passed: 0, failed: 0, other: 0 } };
  try {
    if (!isRunDirectory(runDir)) throw new Error('run directory is not owned');
    if (!isRunDirectory(join(runDir, 'bundle'))) throw new Error('bundle directory is linked or missing');
    const bundle = readVerifiedBundle(join(runDir, 'bundle'));
    const sources = bundle.selection.cells.map(cell => {
      const host = HostPlan.parse(bundle.documents[refKey(cell.executionHostRef)]);
      return host.launch?.sourceSnapshot ? describeSnapshot(host.launch.sourceSnapshot.snapshot) : { kind: 'working_tree' as const };
    });
    const sourceBinding: VerificationSourceBinding | undefined = sources[0];
    if (!sourceBinding || sources.some(source => digestOfValue(source).hex !== digestOfValue(sourceBinding).hex)) throw new Error('mixed source binding');
    const config = EffectiveConfig.parse(bundle.documents[refKey(bundle.request.effectiveConfigRef)]);
    const cases = bundle.receipts.map(receipt => {
      const spec = CaseSpec.parse(bundle.documents[refKey(receipt.caseRef)]);
      const hint = report.cases.find(c => c.caseId === spec.ref.id)?.file;
      const flow: CompiledFlowInfo = { caseId: spec.ref.id, file: RepositoryPath.safeParse(hint).success ? hint! : '', title: spec.purpose,
        tags: [], risk: spec.risk, fixtures: [], steps: spec.steps.map(step => stepInfo(step, spec.personaRef.id, spec.assertions)) };
      const verified = caseReport(receipt, flow, spec.assertions);
      // Requests are read from the sealed events, bound to the receipt's events digest.
      try { verified.requests = verifiedObservedRequests(receipt, readBoundedFile(join(runDir, 'bundle', 'cells', cellBundleName(receipt.selectionCellId), 'events.jsonl'), 16 * 1024 * 1024)); } catch { verified.requests = []; }
      return verified;
    });
    const starts = bundle.receipts.flatMap(receipt => receipt.startedAt ? [receipt.startedAt] : []).sort();
    const identity = bundle.request.expectedTarget?.components.find(component => component.identity?.kind === 'source_digest')?.identity;
    return { ...report, project: config.projectId, runDir, outcome: bundle.campaign.outcome, exitCode: EXIT_CODES[bundle.campaign.outcome],
      startedAt: starts[0] ?? bundle.campaign.finalizedAt, finishedAt: bundle.campaign.finalizedAt, executionId: bundle.receipts[0]?.executionId ?? null,
      sourceDigest: identity?.kind === 'source_digest' ? identity.sourceDigest.hex : '', sourceBinding, sourceChecked: true,
      bundleVerified: true, evidenceStatus: 'verified', manifestDigest: bundle.manifestDigest, blockers: [], cases,
      totals: { passed: cases.filter(c => c.outcome === 'passed').length, failed: cases.filter(c => c.outcome === 'assertion_failed').length,
        other: cases.filter(c => c.outcome !== 'passed' && c.outcome !== 'assertion_failed').length } };
  } catch {
    if (parsed.success && report.outcome === 'blocked' && report.executionId === null && report.bundleVerified === null && !report.cases.length) {
      return { ...report, sourceBinding: null, sourceChecked: false, evidenceStatus: 'not_executed', manifestDigest: null,
        totals: { passed: 0, failed: 0, other: 0 } };
    }
    return { ...invalidateRunReport(report, ISSUE), sourceChecked: false, evidenceStatus: 'invalid', manifestDigest: null, sourceIssue: ISSUE };
  }
}

/** Bounded optional display metadata; a missing summary cannot hide valid captured results. */
export function readSavedRun(runDir: string): CheckedRunReport {
  let metadata: unknown = null;
  try {
    if (isRunDirectory(runDir)) metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(join(runDir, 'summary.json'), 16 * 1024 * 1024)));
  }
  catch { /* Evidence remains the authority when display metadata is unavailable. */ }
  return readRunSource(runDir, metadata);
}
