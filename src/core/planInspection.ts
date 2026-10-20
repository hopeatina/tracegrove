import { z } from 'zod';
import { DigestSchema, RefSchema, RunRequest, ScopeSchema, digestOfValue, refKey, verifySelfDigest, type Scope } from '../protocol/index.ts';
import { FrozenBundle, PlanBlocker } from './frozenBundle.ts';
import { checkedFrozenRequest, prepareFrozenCells } from './executionPreparation.ts';
import { Blocked } from './errors.ts';

export const FrozenPlanInspection = z.object({ schemaVersion: z.literal('tracegrove.plan-inspection/v1'),
  structural: z.enum(['valid', 'blocked']), executionAuthority: z.literal('not_checked'), scope: ScopeSchema.nullable(),
  requestRef: RefSchema.nullable(), purpose: RunRequest.shape.purpose.nullable(), replayOf: RefSchema.nullable(),
  sourceSelectionRef: RefSchema.nullable(), sourcePlanRef: RefSchema.nullable(), reviewRef: RefSchema.nullable(),
  requiresQualificationOwner: z.boolean(), executableClosureDigest: DigestSchema,
  cells: z.array(z.object({ selectionCellId: z.string(), required: z.boolean(), caseRef: RefSchema, personaRef: RefSchema,
    executionHostRef: RefSchema }).strict()), blockers: z.array(PlanBlocker),
}).strict();
export type FrozenPlanInspection = z.infer<typeof FrozenPlanInspection>;

/** Static resolution only. Never probes a runtime, starts a host, provisions state or reads a review owner. */
export function inspectFrozenPlan(input: unknown, scope: Scope): FrozenPlanInspection {
  const bundle = FrozenBundle.parse(input); const request = bundle.request;
  let cells: FrozenPlanInspection['cells'] = []; let blockers = [...bundle.blockers];
  try {
    checkedFrozenRequest(bundle, scope);
    if (blockers.length) throw new Blocked(blockers);
    for (const [key, document] of Object.entries(bundle.documents)) {
      const parsed = RefSchema.safeParse(document && typeof document === 'object' && 'ref' in document ? document.ref : null);
      if (!parsed.success || refKey(parsed.data) !== key || !verifySelfDigest(document as { ref: z.infer<typeof RefSchema> }))
        throw new Blocked([{ code: 'frozen_document_changed', detail: key, owner: 'operator', action: 'plan again from reviewed definitions' }]);
    }
    const prepared = prepareFrozenCells(bundle, scope, request!);
    cells = prepared.selection.cells.map(({ selectionCellId, required, caseRef, personaRef, executionHostRef }) => ({ selectionCellId, required, caseRef, personaRef, executionHostRef }));
  } catch (error) {
    if (!(error instanceof Blocked)) throw error;
    blockers = error.reasons.length ? error.reasons.map(reason => ({ code: reason.code, detail: reason.detail, owner: reason.owner ?? 'operator', action: reason.action ?? 'plan again', cellId: null }))
      : [{ code: 'frozen_request_missing', detail: 'The envelope has no executable request.', owner: 'operator', action: 'plan again', cellId: null }];
  }
  return FrozenPlanInspection.parse({ schemaVersion: 'tracegrove.plan-inspection/v1', structural: blockers.length ? 'blocked' : 'valid', executionAuthority: 'not_checked',
    scope: request?.requestedScope ?? null, requestRef: request?.ref ?? null, purpose: request?.purpose ?? null, replayOf: request?.replayOf ?? null,
    sourceSelectionRef: request?.sourceSelectionRef ?? null, sourcePlanRef: request?.sourcePlanRef ?? null, reviewRef: request?.reviewRef ?? null,
    requiresQualificationOwner: request?.purpose === 'qualification' || request?.purpose === 'regression' || !!request?.regressionAdmissionRef || !!request?.sourcePlanRef || !!request?.scenarioRefs.length,
    executableClosureDigest: digestOfValue({ request, documents: bundle.documents }), cells, blockers });
}
