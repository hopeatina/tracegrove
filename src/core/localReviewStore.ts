import { z } from 'zod';
import { IdString, PlanEditProjection, PlanReview, PlanSourceValidation, ScopeSchema, SourcePlan, digestOfValue,
  refKey, sameRef, sameScope, verifySelfDigest, type Ref, type Scope } from '../protocol/index.ts';
import { LocalLedger } from './ledger.ts';
import { Conflict } from './errors.ts';
import type { PlanReviewPorts, ReviewSnapshot } from './review.ts';

const State = z.object({ schemaVersion: z.literal('workflow.local-review-state/v1'), projection: PlanEditProjection,
  plans: z.array(SourcePlan).min(1).max(500), reviews: z.array(PlanReview).max(500), validations: z.array(PlanSourceValidation).max(500),
}).strict();
type State = z.infer<typeof State>;
export type LocalReviewAuthority = Pick<PlanReviewPorts, 'authorize' | 'validateSources'>;

/** Protected single-writer host storage, not a filesystem ACL or distributed authorization service. */
export class LocalReviewStore {
  private readonly scope: Scope;
  private readonly aggregateId: string;
  constructor(private readonly ledger: LocalLedger, private readonly id: string, scope: Scope, private readonly authority: LocalReviewAuthority) {
    IdString.parse(id); this.scope = ScopeSchema.parse(scope);
    this.aggregateId = `workflow-review:${digestOfValue({ id, scope: this.scope }).hex}`;
  }

  private scoped(id: string, scope: Scope): void {
    if (id !== this.id || !sameScope(scope, this.scope)) throw new Conflict('local review identity or scope mismatch');
  }
  private checked(raw: unknown): State {
    const state = State.parse(raw); this.scoped(state.projection.id, state.projection.scope);
    const documents = [...state.plans, ...state.reviews, ...state.validations];
    const identities = new Set<string>();
    for (const document of documents) {
      if (!verifySelfDigest(document) || !sameScope(document.scope, this.scope)) throw new Conflict('local review document digest or scope mismatch');
      const identity = JSON.stringify([document.ref.id, document.ref.revision]);
      if (identities.has(identity)) throw new Conflict('local review immutable identity was reused');
      identities.add(identity);
    }
    const current = state.plans.find(plan => sameRef(plan.ref, state.projection.sourcePlanRef));
    if (!current || state.plans.some(plan => plan.ref.id !== current.ref.id)) throw new Conflict('local review plan identity is missing or substituted');
    if (state.projection.currentReviewRef) {
      const review = state.reviews.find(review => sameRef(review.ref, state.projection.currentReviewRef!));
      if (!review || !sameRef(review.sourcePlanRef, current.ref) || review.editRevision !== state.projection.editRevision) {
        throw new Conflict('local review projection retains a stale or missing review');
      }
    }
    for (const review of state.reviews) {
      const plan = state.plans.find(plan => sameRef(plan.ref, review.sourcePlanRef));
      if (!plan) throw new Conflict('local review references a missing plan');
      if (review.decision === 'approved' && !state.validations.some(check => review.reasonRefs.some(ref => sameRef(ref, check.ref)) &&
          sameRef(check.sourcePlanRef, plan.ref) && sameRef(check.changeModelRef, plan.changeModelRef) &&
          sameRef(check.revisionMatrixRef, plan.revisionMatrixRef) && sameRef(check.policyRef, review.policyRef))) {
        throw new Conflict('approved local review lacks its atomically stored source validation');
      }
    }
    return state;
  }
  private current(): { version: number; state: State } {
    const entry = this.ledger.current(this.aggregateId);
    if (!entry || !entry.type.startsWith('workflow.review.')) throw new Conflict('local review is not initialized');
    return { version: entry.version, state: this.checked(entry.data.state) };
  }
  private write(version: number, state: State, event: string): void {
    this.ledger.append(this.aggregateId, version, event, { state: this.checked(state) });
  }

  async initialize(raw: unknown): Promise<ReviewSnapshot> {
    const plan = SourcePlan.parse(raw);
    await this.authority.authorize(structuredClone(this.scope), 'edit');
    const state: State = { schemaVersion: 'workflow.local-review-state/v1', plans: [plan], reviews: [], validations: [],
      projection: { id: this.id, scope: this.scope, editRevision: 1, sourcePlanRef: plan.ref, currentReviewRef: null } };
    this.write(0, state, 'workflow.review.created');
    return this.read(this.id, this.scope);
  }

  /** Stage immutable drafts without changing editable revision or retaining approval for an edit. */
  async stage(raw: unknown): Promise<void> {
    const plan = SourcePlan.parse(raw);
    await this.authority.authorize(structuredClone(this.scope), 'edit');
    const { version, state } = this.current();
    const existing = state.plans.find(p => p.ref.id === plan.ref.id && p.ref.revision === plan.ref.revision);
    if (existing && sameRef(existing.ref, plan.ref) && verifySelfDigest(plan)) return;
    if (existing) throw new Conflict('staged revision changes an immutable plan identity');
    state.plans.push(plan); this.write(version, state, 'workflow.review.draft-staged');
  }

  async read(id: string, scope: Scope): Promise<ReviewSnapshot> {
    this.scoped(id, scope); const { version, state } = this.current();
    return { storageVersion: version, projection: structuredClone(state.projection) };
  }
  async resolvePlan(ref: Ref, scope: Scope): Promise<SourcePlan> {
    this.scoped(this.id, scope);
    const plan = this.current().state.plans.find(plan => sameRef(plan.ref, ref));
    if (!plan) throw new Conflict('local review plan reference is not stored');
    return structuredClone(plan);
  }

  ports(): PlanReviewPorts {
    return { authorize: (scope, action) => { this.scoped(this.id, scope); return this.authority.authorize(structuredClone(scope), action); },
      validateSources: (plan, policy) => this.authority.validateSources(structuredClone(plan), structuredClone(policy)),
      resolvePlan: (ref, scope) => this.resolvePlan(ref, scope), read: (id, scope) => this.read(id, scope),
      compareAndSwap: async (version, raw, review, validation) => {
        const next = PlanEditProjection.parse(raw); this.scoped(next.id, next.scope);
        const actor = await this.authority.authorize(structuredClone(this.scope), review ? 'review' : 'edit');
        const { version: actual, state } = this.current(); if (actual !== version) return false;
        const before = state.projection;
        if (!sameRef(next.sourcePlanRef, before.sourcePlanRef)) {
          if (review || validation || next.currentReviewRef || next.editRevision !== before.editRevision + 1) throw new Conflict('local plan edit must advance revision and clear review');
        } else {
          if (!review || next.editRevision !== before.editRevision || !next.currentReviewRef || !sameRef(next.currentReviewRef, review.ref) ||
              (review.decision === 'rejected' && validation)) throw new Conflict('local review transition is inconsistent');
          if (review.reviewerActorId !== actor.actorId || !sameRef(review.policyRef, actor.policyRef)) throw new Conflict('local review actor or policy changed before commit');
          state.reviews.push(review); if (validation) state.validations.push(validation);
        }
        state.projection = next; this.write(actual, state, review ? 'workflow.review.decided' : 'workflow.review.edited');
        return true;
      } };
  }
}
