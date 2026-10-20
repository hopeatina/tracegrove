import { z } from 'zod';
import { DigestSchema, RefSchema, ScopeSchema } from '../primitives.ts';

const Text = z.string().max(8192), Count = z.number().int().nonnegative().safe();
export const NativeReportFormat = z.enum(['playwright_json', 'junit_xml']);
export type NativeReportFormat = z.infer<typeof NativeReportFormat>;
export const NativeObservationErrorCode = z.enum(['native_report_invalid', 'native_archive_invalid', 'native_output_conflict']);
export type NativeObservationErrorCode = z.infer<typeof NativeObservationErrorCode>;
export const ImportedOutcome = z.enum(['passed', 'failed', 'error', 'timed_out', 'skipped', 'interrupted', 'not_run', 'unknown']);
const ContentRef = z.object({ pointer: Text, digest: DigestSchema, byteCount: Count }).strict();
const Producer = z.discriminatedUnion('basis', [
  z.object({ name: Text.min(1), version: Text.nullable(), basis: z.literal('reported') }).strict(),
  z.object({ name: Text.min(1), version: Text.min(1), basis: z.literal('operator_declared') }).strict(),
  z.object({ name: z.null(), version: z.null(), basis: z.literal('unavailable') }).strict(),
]);
export const ImportedObservation = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), pointer: Text,
  kind: z.enum(['attempt_result', 'testcase_summary', 'retry_diagnostic', 'test_without_result']),
  reportedTestId: Text.nullable(), suite: z.array(Text).max(100), title: Text, project: Text.nullable(),
  source: z.object({ file: Text, line: Count.nullable(), column: Count.nullable() }).strict().nullable(),
  retry: Count.nullable(), outcome: ImportedOutcome, expectedOutcome: ImportedOutcome.nullable(),
  producerClassification: z.enum(['expected', 'unexpected', 'flaky', 'skipped']).nullable(),
  durationMs: z.number().finite().nonnegative().nullable(), startedAt: Text.nullable(),
  errorRefs: z.array(ContentRef).max(1000), detailRefs: z.array(ContentRef).max(1000),
}).strict();
export type ImportedObservation = z.infer<typeof ImportedObservation>;
export const ImportedAttachment = z.object({ pointer: Text, observationId: Text, name: Text, mediaType: Text,
  reportedPath: Text.nullable(), state: z.enum(['captured', 'not_requested', 'missing', 'refused', 'invalid']),
  digest: DigestSchema.nullable(), byteCount: Count.nullable() }).strict()
  .refine(a => a.state === 'captured' ? a.digest !== null && a.byteCount !== null : a.digest === null && a.byteCount === null, 'attachment bytes must match capture state');
export type ImportedAttachment = z.infer<typeof ImportedAttachment>;
export const ImportedObservations = z.object({ schemaVersion: z.literal('tracegrove.imported-observations/v1'),
  ref: RefSchema, scope: ScopeSchema, format: NativeReportFormat,
  producer: Producer,
  source: z.object({ digest: DigestSchema, byteCount: Count }).strict(),
  observations: z.array(ImportedObservation).max(20000), attachments: z.array(ImportedAttachment).max(1000),
  globalErrorRefs: z.array(ContentRef).max(1000),
  reportedTotals: z.record(z.string().max(100), Count),
  warnings: z.array(z.enum(['empty_report', 'no_attempts_for_test', 'duplicate_reported_test_id', 'retry_history_not_guaranteed',
    'assertion_details_unavailable', 'producer_version_unavailable', 'reported_totals_mismatch', 'unsupported_junit_extension', 'no_reported_status', 'attempt_history_incomplete'])).max(20),
  authority: z.literal('none'), issuerTrust: z.literal('not_authenticated'), qualification: z.literal('not_evaluated'),
  verificationVerdict: z.literal('not_evaluated'), execution: z.literal('not_started_by_import'),
}).strict().superRefine((report, context) => {
  const ids = new Set(report.observations.map(observation => observation.id));
  if (ids.size !== report.observations.length || report.attachments.some(attachment => !ids.has(attachment.observationId)))
    context.addIssue({ code: 'custom', message: 'Native observation identities or attachment ownership are inconsistent' });
});
export type ImportedObservations = z.infer<typeof ImportedObservations>;
