/** Fresh saved-run evidence readback; unsealed summaries never supply verification authority. */
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { CaseSpec, refKey } from '../protocol/index.ts';
import { readBoundedFile } from '../core/boundedFile.ts';
import { readVerifiedBundle } from '../core/bundle.ts';
import { caseReport, type TestRunReport } from './run.ts';
import type { CompiledFlowInfo } from './compile.ts';
import { MAX_OBSERVED_PER_CASE, ObservedRequest, verifiedObservedRequests } from './traffic.ts';
import { cellBundleName } from '../core/bundlePaths.ts';

const text = z.string().max(8192);
const step = z.object({ id: text, name: text, method: text, path: text, result: text, status: z.number().finite().nullable(), durationMs: z.number().finite().nullable(), reason: text.nullable(), observedText: text.nullable().optional() });
const summary = z.object({ schemaVersion: z.literal('tracegrove.run-summary/v1'), project: text, outcome: text, exitCode: z.number().int(), startedAt: text, finishedAt: text,
  executionId: text.nullable(), sourceDigest: text, runDir: text, stateDir: text.optional(), bundleVerified: z.boolean().nullable(), blockers: z.array(z.object({ code: text, detail: text, action: text })).max(256),
  cases: z.array(z.object({ caseId: text, file: text, title: text, outcome: text, durationMs: z.number().finite(), steps: z.array(step).max(512), failure: z.object({ step: text, message: text, observed: text.nullable(), code: text.optional() }).nullable(), videos: z.array(z.object({ digest: text, byteCount: z.number().int().nonnegative(), mediaType: z.literal('video/webm') })).max(64).optional(), requests: z.array(ObservedRequest).max(MAX_OBSERVED_PER_CASE).optional() })).max(1024),
  totals: z.object({ passed: z.number().int(), failed: z.number().int(), other: z.number().int() }),
  /** Unsealed annotation; the sealed receipts carry the environment class. */
  environment: z.object({ name: text, class: text, kind: text, origin: text.nullable(), writes: text, expectedRelease: text.nullable(),
    agent: z.object({ name: text.nullable(), policy: text, decision: z.enum(['allowed', 'approved', 'human']), approvedBy: text.optional(), approvedAt: text.optional() }).nullable() }).optional(),
});
type EvidenceStatus = 'verified' | 'missing' | 'invalid' | 'mismatch';
const messages: Record<EvidenceStatus, string> = {
  verified: 'Saved evidence was freshly verified and bound to this execution, source, cases and recorded results. Human names and flow paths are unsealed saved annotations.',
  missing: 'Saved evidence is unavailable. Historical summary results have not been verified.',
  invalid: 'Saved evidence failed fresh verification. Historical summary results have not been verified.',
  mismatch: 'The saved summary does not match the verified execution evidence. Historical summary results have not been verified.',
};
export type SavedRunReport = TestRunReport & { savedEvidence: { status: EvidenceStatus; message: string; annotations: 'unsealed_saved_annotations' } };

function ownedRunDirectory(root: string, name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(name)) throw new Error('Saved run is unavailable or invalid.');
  let directory = root;
  for (const segment of ['.tracegrove', 'runs', name]) {
    directory = join(directory, segment);
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Saved run is unavailable or invalid.');
  }
  return directory;
}

export function readSavedRunSummary(root: string, name: string): TestRunReport {
  try {
    const parsed = summary.parse(JSON.parse(readBoundedFile(join(ownedRunDirectory(root, name), 'summary.json'), 8 * 1024 * 1024).toString('utf8')));
    const { stateDir, environment, ...report } = parsed;
    return { ...report, ...(stateDir === undefined ? {} : { stateDir }), ...(environment === undefined ? {} : { environment: environment as TestRunReport['environment'] & object }), cases: parsed.cases.map(c => ({ ...c, videos: c.videos ?? [], requests: c.requests ?? [], steps: c.steps.map(s => ({ ...s, observedText: s.observedText ?? null })) })) };
  }
  catch { throw new Error('Saved run summary is unavailable or invalid.'); }
}

/** Current configuration is deliberately irrelevant to historical execution evidence. */
export function readSavedRun(root: string, name: string): SavedRunReport {
  const saved = readSavedRunSummary(root, name);
  const runDir = ownedRunDirectory(root, name);
  const result = (status: EvidenceStatus, report: TestRunReport = saved): SavedRunReport => ({ ...report, runDir, bundleVerified: status === 'verified',
    savedEvidence: { status, message: messages[status], annotations: 'unsealed_saved_annotations' } });
  const bundleDir = join(runDir, 'bundle');
  try { const stat = lstatSync(bundleDir); if (!stat.isDirectory() || stat.isSymbolicLink()) return result('invalid'); }
  catch (error) { return result((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid'); }
  let checked: ReturnType<typeof readVerifiedBundle>;
  try { checked = readVerifiedBundle(bundleDir); } catch { return result('invalid'); }
  const exitCodes: Record<string, number> = { passed: 0, assertion_failed: 1, blocked: 2, inconclusive: 2, infrastructure_failed: 3, cancelled: 4 };
  if (checked.receipts.length !== saved.cases.length || checked.receipts.some(receipt => receipt.executionId !== saved.executionId)
    || checked.campaign.outcome !== saved.outcome || saved.exitCode !== exitCodes[checked.campaign.outcome] || new Set(saved.cases.map(c => c.caseId)).size !== saved.cases.length) return result('mismatch');
  const specs = new Map(Object.values(checked.documents).flatMap(doc => { const parsed = CaseSpec.safeParse(doc); return parsed.success ? [[refKey(parsed.data.ref), parsed.data] as const] : []; }));
  const cases = [];
  for (const receipt of checked.receipts) {
    const recorded = saved.cases.find(c => c.caseId === receipt.caseRef.id);
    const spec = specs.get(refKey(receipt.caseRef));
    const cell = checked.selection.cells.find(cell => cell.selectionCellId === receipt.selectionCellId);
    const source = cell?.expectedTarget.components.find(c => c.componentId === 'app')?.identity;
    if (!recorded || !spec || source?.kind !== 'source_digest' || source.sourceDigest.hex !== saved.sourceDigest || recorded.outcome !== receipt.outcome
      || recorded.steps.length !== receipt.steps.length || recorded.steps.some((s, i) => s.id !== receipt.steps[i]?.stepId)) return result('mismatch');
    const info: CompiledFlowInfo = { caseId: receipt.caseRef.id, title: spec.purpose, risk: spec.risk, file: '', tags: [], fixtures: [], steps: spec.steps.map(s => ({ id: s.id, name: s.id, as: '',
      method: s.kind.startsWith('ui.') ? 'UI' : s.kind === 'http.request' ? s.method : s.kind === 'observe' ? s.readback.method : '',
      path: s.kind === 'ui.navigate' ? `navigate ${s.path}` : s.kind === 'ui.action' ? `${s.command.kind} ${s.command.target.name}` : s.kind === 'ui.observe' ? `read ${s.target.name}` : s.kind === 'http.request' ? s.path : s.kind === 'observe' ? s.readback.path : '',
      expectStatus: s.kind === 'http.request' ? s.expectStatus : null })) };
    const verified = caseReport(receipt, info);
    // Requests are read from the sealed events, bound to the receipt's events digest.
    try { verified.requests = verifiedObservedRequests(receipt, readBoundedFile(join(bundleDir, 'cells', cellBundleName(receipt.selectionCellId), 'events.jsonl'), 16 * 1024 * 1024)); } catch { verified.requests = []; }
    const facts = (s: typeof verified.steps[number]) => ({ id: s.id, result: s.result, status: s.status, durationMs: s.durationMs, reason: s.reason, observedText: s.observedText ?? null });
    if (JSON.stringify(recorded.steps.map(facts)) !== JSON.stringify(verified.steps.map(facts)) || JSON.stringify(recorded.videos ?? []) !== JSON.stringify(verified.videos ?? [])) return result('mismatch');
    cases.push({ ...verified, reportedTitle: recorded.title, reportedFile: recorded.file, steps: verified.steps.map(s => ({ ...s, reportedName: recorded.steps.find(r => r.id === s.id)?.name ?? s.id })) });
  }
  const startedAt = checked.receipts.map(r => r.startedAt).sort()[0] ?? saved.startedAt;
  return result('verified', { ...saved, startedAt, finishedAt: checked.campaign.finalizedAt, outcome: checked.campaign.outcome, blockers: [],
    cases, totals: { passed: cases.filter(c => c.outcome === 'passed').length, failed: cases.filter(c => c.outcome === 'assertion_failed').length, other: cases.filter(c => !['passed', 'assertion_failed'].includes(c.outcome)).length } });
}
