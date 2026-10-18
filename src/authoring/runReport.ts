import { z } from 'zod';
import { RunVideo } from './schema.ts';
import { VerificationSourceBinding } from './sourceSelection.ts';

const Text = z.string().max(65536);
export const SavedRunName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/, 'run name must be one local path segment');
export const StepReport = z.object({ id: Text, name: Text, method: Text, path: Text, result: Text, status: z.number().int().nullable(),
  durationMs: z.number().nonnegative().nullable(), reason: Text.nullable(), observedText: Text.nullable().optional(),
  declared: z.boolean().optional(), expectStatus: z.number().int().nullable().optional(), expectation: Text.optional() }).strict();
export type StepReport = z.infer<typeof StepReport>;
export const CaseReport = z.object({ caseId: Text, file: Text, title: Text, outcome: Text, durationMs: z.number().nonnegative(), steps: z.array(StepReport).max(10000),
  failure: z.object({ step: Text, message: Text, observed: Text.nullable() }).strict().nullable(), videos: z.array(RunVideo).max(10000).optional() }).strict();
export type CaseReport = z.infer<typeof CaseReport>;
/** Display metadata is parsed, but product facts are reconstructed from verified evidence on read. */
export const TestRunReport = z.object({ schemaVersion: z.literal('tracegrove.run-summary/v1'), project: Text, outcome: Text, exitCode: z.number().int(),
  startedAt: Text, finishedAt: Text, executionId: Text.nullable(), sourceDigest: Text, runDir: Text, stateDir: Text.optional(), bundleVerified: z.boolean().nullable(),
  blockers: z.array(z.object({ code: Text, detail: Text, action: Text }).strict()).max(10000), cases: z.array(CaseReport).max(10000),
  totals: z.object({ passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), other: z.number().int().nonnegative() }).strict(),
  sourceBinding: VerificationSourceBinding.nullable().optional(),
}).strict();
export type TestRunReport = z.infer<typeof TestRunReport>;

export function invalidateRunReport(report: TestRunReport, detail: string): TestRunReport {
  return { ...report, outcome: 'inconclusive', exitCode: 2, bundleVerified: false, sourceBinding: null, sourceDigest: '', executionId: null, cases: [],
    totals: { passed: 0, failed: 0, other: 0 }, blockers: [{ code: 'saved_evidence_unavailable', detail, action: 'inspect or restore this run’s evidence bundle before relying on its results' }] };
}
