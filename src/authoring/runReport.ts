import { z } from 'zod';
import { RunVideo } from './schema.ts';
import { VerificationSourceBinding } from './sourceSelection.ts';
import { MAX_OBSERVED_PER_CASE, ObservedRequest } from './traffic.ts';

const Text = z.string().max(65536);
export const SavedRunName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/, 'run name must be one local path segment');
export const StepReport = z.object({ id: Text, name: Text, method: Text, path: Text, result: Text, status: z.number().int().nullable(),
  durationMs: z.number().nonnegative().nullable(), reason: Text.nullable(), observedText: Text.nullable().optional(),
  declared: z.boolean().optional(), expectStatus: z.number().int().nullable().optional(), expectation: Text.optional(),
  /** 'fail' when a check on this step's evidence failed, even though the step itself completed. */
  checks: z.enum(['pass', 'fail']).optional(),
  /** The check that failed on this step, with what it expected and what it got, from the run's recorded assertion. */
  compared: z.object({ check: Text, expected: z.unknown(), got: z.unknown() }).strict().optional(),
  /** What the app answered an HTTP step: the recorded response body, cut at 4 KB. */
  answer: Text.optional() }).strict();
export type StepReport = z.infer<typeof StepReport>;
export const CaseReport = z.object({ caseId: Text, file: Text, title: Text, outcome: Text, durationMs: z.number().nonnegative(), steps: z.array(StepReport).max(10000),
  failure: z.object({ step: Text, message: Text, observed: Text.nullable(), fix: Text.nullable().optional(), code: Text.optional() }).strict().nullable(), videos: z.array(RunVideo).max(10000).optional(),
  /** What the app served during this case, from the sealed proxy events. */
  requests: z.array(ObservedRequest).max(MAX_OBSERVED_PER_CASE).optional() }).strict();
export type CaseReport = z.infer<typeof CaseReport>;
/** Where a run happened. Unsealed annotation; the sealed receipts carry the environment class. */
export const RunEnvironment = z.object({ name: Text, class: Text, kind: Text, origin: Text.nullable(), writes: Text, expectedRelease: Text.nullable(),
  agent: z.object({ name: Text.nullable(), policy: Text, decision: z.enum(['allowed', 'approved', 'human']), approvedBy: Text.optional(), approvedAt: Text.optional() }).strict().nullable() }).strict();
export type RunEnvironment = z.infer<typeof RunEnvironment>;
/** Display metadata is parsed, but product facts are reconstructed from verified evidence on read. */
export const TestRunReport = z.object({ schemaVersion: z.literal('tracegrove.run-summary/v1'), project: Text, outcome: Text, exitCode: z.number().int(),
  startedAt: Text, finishedAt: Text, executionId: Text.nullable(), sourceDigest: Text, runDir: Text, stateDir: Text.optional(), bundleVerified: z.boolean().nullable(),
  blockers: z.array(z.object({ code: Text, detail: Text, action: Text, owner: Text.optional(), fix: Text.nullable().optional(), docs: Text.nullable().optional() }).strict()).max(10000), cases: z.array(CaseReport).max(10000),
  totals: z.object({ passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), other: z.number().int().nonnegative() }).strict(),
  sourceBinding: VerificationSourceBinding.nullable().optional(),
  /** Absent in reports written before environments existed (always local then). */
  environment: RunEnvironment.optional(),
}).strict();
export type TestRunReport = z.infer<typeof TestRunReport>;

export function invalidateRunReport(report: TestRunReport, detail: string): TestRunReport {
  return { ...report, outcome: 'inconclusive', exitCode: 2, bundleVerified: false, sourceBinding: null, sourceDigest: '', executionId: null, cases: [],
    totals: { passed: 0, failed: 0, other: 0 }, blockers: [{ code: 'saved_evidence_unavailable', detail, action: 'inspect or restore this run’s evidence bundle before relying on its results' }] };
}
