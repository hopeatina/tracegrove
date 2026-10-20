import { z } from 'zod';
import { addAttachment, contentRef, emptyObservation, finishProjection, IMPORT_LIMITS, type NativeProjection } from './normalize.ts';
import { digestOfBytes, type ImportedObservation } from '../protocol/index.ts';

const Text = z.string().max(8192), Count = z.number().int().nonnegative().safe();
const Status = z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
const ErrorValue = z.unknown();
const Result = z.object({ status: Status.optional(), duration: z.number().finite().nonnegative(), retry: Count, startTime: Text,
  errors: z.array(ErrorValue).max(1000), error: ErrorValue.optional(),
  attachments: z.array(z.object({ name: Text, contentType: Text, path: Text.optional(), body: z.string().max(IMPORT_LIMITS.reportBytes).optional() })).max(1000),
  steps: z.array(z.unknown()).max(1000).optional() });
const Test = z.object({ expectedStatus: Status, projectName: Text, projectId: Text,
  results: z.array(Result).max(1000), status: z.enum(['skipped', 'expected', 'unexpected', 'flaky']) });
const Spec = z.object({ title: Text, tests: z.array(Test).max(1000), id: Text, file: Text, line: Count, column: Count });
const Suite = z.object({ title: Text, specs: z.array(Spec).max(20000), suites: z.array(z.unknown()).max(20000).optional() });
const Report = z.object({ config: z.object({ version: Text.optional() }), suites: z.array(z.unknown()).max(20000),
  errors: z.array(ErrorValue).max(1000), stats: z.object({ expected: Count, unexpected: Count, flaky: Count, skipped: Count }) });
const outcome = (status: z.infer<typeof Status> | undefined): ImportedObservation['outcome'] => status === 'timedOut' ? 'timed_out' : status ?? 'not_run';

/** Official JSON reporter shape, pinned by real producer fixtures. Unknown fields remain in source bytes. */
export function normalizePlaywright(bytes: Buffer): NativeProjection {
  const report = Report.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  const source = digestOfBytes(bytes);
  const result: NativeProjection = { observations: [], attachments: [], globalErrorRefs: report.errors.map((value, i) => contentRef(`/errors/${i}`, value)),
    reportedTotals: report.stats, warnings: [], producer: { name: 'playwright', version: report.config.version ?? null, basis: 'reported' } };
  const classifications = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }, ids = new Set<string>(); let nodes = 0;
  const walk = (raw: unknown, pointer: string, parents: string[]) => {
    if (parents.length >= IMPORT_LIMITS.depth || ++nodes > IMPORT_LIMITS.nodes) throw new Error('native report depth');
    const suite = Suite.parse(raw), ancestry = [...parents, suite.title];
    suite.specs.forEach((spec, si) => spec.tests.forEach((test, ti) => {
      const testPointer = `${pointer}/specs/${si}/tests/${ti}`;
      const key = JSON.stringify([spec.id, test.projectId]);
      if (ids.has(key)) result.warnings.push('duplicate_reported_test_id'); ids.add(key); classifications[test.status]++;
      const results = test.results.length ? test.results : [null];
      if (!test.results.length) result.warnings.push('no_attempts_for_test');
      if (test.results.some((attempt, i) => attempt.retry !== i)) result.warnings.push('attempt_history_incomplete');
      results.forEach((attempt, ai) => {
        if (result.observations.length >= IMPORT_LIMITS.observations) throw new Error('native report attempts');
        const path = attempt ? `${testPointer}/results/${ai}` : testPointer;
        const row = emptyObservation(path, spec.title, ancestry, source);
        Object.assign(row, { kind: attempt ? 'attempt_result' : 'test_without_result', reportedTestId: spec.id, project: test.projectId || test.projectName,
          source: { file: spec.file, line: spec.line, column: spec.column }, retry: attempt?.retry ?? null,
          outcome: outcome(attempt?.status), expectedOutcome: outcome(test.expectedStatus), producerClassification: test.status,
          durationMs: attempt?.duration ?? null, startedAt: attempt?.startTime ?? null,
          errorRefs: attempt?.errors.map((value, i) => contentRef(`${path}/errors/${i}`, value)) ?? [],
          detailRefs: attempt?.steps?.map((value, i) => contentRef(`${path}/steps/${i}`, value)) ?? [] });
        if (attempt && !attempt.status) result.warnings.push('no_reported_status');
        if (attempt?.error && !attempt.errors.length) row.errorRefs.push(contentRef(`${path}/error`, attempt.error));
        result.observations.push(row);
        attempt?.attachments.forEach((attachment, i) => addAttachment(result, { pointer: `${path}/attachments/${i}`, observationId: row.id,
          name: attachment.name, mediaType: attachment.contentType, path: attachment.path ?? null, body: attachment.body ?? null }));
      });
    }));
    suite.suites?.forEach((child, i) => walk(child, `${pointer}/suites/${i}`, ancestry));
  };
  report.suites.forEach((suite, i) => walk(suite, `/suites/${i}`, []));
  if (Object.entries(classifications).some(([key, count]) => report.stats[key as keyof typeof classifications] !== count)) result.warnings.push('reported_totals_mismatch');
  return finishProjection(result);
}
