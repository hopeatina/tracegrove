import { CaseSpec, digestOfValue, refKey, type Ref } from '../protocol/index.ts';
import type { LoadedProject } from './corpus.ts';
import { Blocked } from './errors.ts';
import { lookupCursor, lookupOffset } from './lookupCursor.ts';

export type CaseQuery = { id?: string; workflow?: string; surface?: string; text?: string; limit?: number; cursor?: string };
export function searchCases(project: LoadedProject, query: CaseQuery = {}) {
  const limit = query.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Blocked([{ code: 'lookup_limit', detail: 'limit must be 1..100' }]);
  const filter = { id: query.id ?? null, workflow: query.workflow ?? null, surface: query.surface ?? null, text: query.text ?? null };
  const fingerprint = digestOfValue(filter).hex;
  const snapshot = project.corpus.manifest.ref;
  const offset = lookupOffset(query.cursor, refKey(snapshot), fingerprint);
  const matches = project.corpus.documents().flatMap((doc) => {
    const parsed = CaseSpec.safeParse(doc.value);
    if (!parsed.success) return [];
    const spec = parsed.data;
    if (query.id && spec.ref.id !== query.id) return [];
    if (query.workflow && spec.workflowId !== query.workflow) return [];
    if (query.surface && spec.surface !== query.surface) return [];
    if (query.text && !`${spec.ref.id} ${spec.workflowId} ${spec.purpose}`.toLowerCase().includes(query.text.toLowerCase())) return [];
    return [{ ref: spec.ref, workflowId: spec.workflowId, surface: spec.surface, purpose: spec.purpose,
      sourcePath: doc.sourcePath, requiredCapabilities: spec.requiredCapabilities,
      compatibility: 'recheck_at_plan', state: 'definition_only', review: 'unknown' }];
  }).sort((a, b) => refKey(a.ref).localeCompare(refKey(b.ref)));
  const results = matches.slice(offset, offset + limit);
  if (Buffer.byteLength(JSON.stringify(results)) > 32 * 1024) throw new Blocked([{ code: 'lookup_byte_limit', detail: 'reduce the page limit to fit 32 KiB' }]);
  const next = offset + results.length;
  return { snapshot, results, total: matches.length, cursor: next < matches.length ? lookupCursor(refKey(snapshot), fingerprint, next) : null };
}

export function getCase(project: LoadedProject, ref: Ref, maxBytes = 32 * 1024) {
  const doc = project.corpus.get(ref);
  const spec = project.corpus.getAs(CaseSpec, ref);
  if (Buffer.byteLength(JSON.stringify(spec)) > maxBytes) throw new Blocked([{ code: 'lookup_byte_limit', detail: ref.id }]);
  return { snapshot: project.corpus.manifest.ref, sourcePath: doc.sourcePath, spec };
}
