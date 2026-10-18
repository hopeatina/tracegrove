import { canonicalize, digestOfBytes, digestOfValue, type Digest, type ImportedObservation, type ImportedObservations } from '../protocol/index.ts';

export const IMPORT_LIMITS = { reportBytes: 8 * 1024 * 1024, artifactBytes: 16 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024, artifacts: 1000, observations: 20000, depth: 100, nodes: 100000 } as const;
export type RawAttachment = { pointer: string; observationId: string; name: string; mediaType: string; path: string | null; body: string | null };
export type NativeProjection = Pick<ImportedObservations, 'observations' | 'globalErrorRefs' | 'reportedTotals' | 'warnings' | 'producer'> & {
  attachments: RawAttachment[];
};
export function addAttachment(result: NativeProjection, attachment: RawAttachment): void {
  if (result.attachments.length >= IMPORT_LIMITS.artifacts) throw new Error('native attachment count');
  result.attachments.push(attachment);
}
export function contentRef(pointer: string, value: unknown) {
  const bytes = Buffer.from(canonicalize(value)); return { pointer, digest: digestOfBytes(bytes), byteCount: bytes.length };
}
export const nativeObservationId = (source: Digest, pointer: string): string => digestOfValue({ source, pointer }).hex;
export function emptyObservation(pointer: string, title: string, suite: string[], source: Digest): ImportedObservation {
  return { id: nativeObservationId(source, pointer), pointer, kind: 'test_without_result', reportedTestId: null, suite, title, project: null, source: null,
    retry: null, outcome: 'unknown', expectedOutcome: null, producerClassification: null, durationMs: null, startedAt: null,
    errorRefs: [], detailRefs: [] };
}
export function finishProjection(result: NativeProjection): NativeProjection {
  if (result.observations.length > IMPORT_LIMITS.observations || result.attachments.length > IMPORT_LIMITS.artifacts || result.globalErrorRefs.length > 1000) throw new Error('native report limit');
  if (!result.observations.length) result.warnings.push('empty_report');
  if (!result.producer.version) result.warnings.push('producer_version_unavailable');
  if (result.observations.some(a => !a.detailRefs.length && !a.errorRefs.length)) result.warnings.push('assertion_details_unavailable');
  result.warnings = [...new Set(result.warnings)]; return result;
}
