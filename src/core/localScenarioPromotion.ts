import { IdString, ScenarioPromotion, ScenarioProjection, digestOfValue, sameScope, verifySelfDigest } from '../protocol/index.ts';
import { deriveScenarioPromotion, normalizePromotionIntent, PromotionActor, type ScenarioPromotionPorts } from './sourcePromotion.ts';
import type { LocalReviewStore } from './localReviewStore.ts';
import type { LocalScenarioOwner } from './localScenarioOwner.ts';
import { Conflict } from './errors.ts';

export type LocalScenarioPromotionAuthority = Pick<ScenarioPromotionPorts, 'authorizePromotion'>;
type Owner = LocalScenarioOwner & { authorizeInitialization(): Promise<void> };
export function localScenarioPromotionPorts(owner: Owner, review: LocalReviewStore, authority: LocalScenarioPromotionAuthority): ScenarioPromotionPorts {
  const scoped = (scope: typeof owner.scope) => { if (!sameScope(scope, owner.scope)) throw new Conflict('promotion scope mismatch'); };
  return { authorizePromotion: async (scope, digest) => { scoped(scope); return authority.authorizePromotion(structuredClone(scope), structuredClone(digest)); },
    resolveApprovedReview: async (token, reviewRef) => (await review.approvedSnapshot(owner.ledger, token, reviewRef)).documents,
    validateDefinition: definition => owner.readPorts.validateDefinition(definition),
    readPromotion: async (key, scope) => {
      IdString.parse(key); scoped(scope); await owner.authorizeRead(structuredClone(scope));
      return structuredClone(owner.current().state.scenarios.find(s => s.promotion?.receipt.intent.idempotencyKey === key)?.promotion?.receipt ?? null);
    },
    compareAndSwapPromotion: async (rawIntent, rawDefinition, rawSelections, rawReceipt, rawApproved) => {
      const intent = normalizePromotionIntent(rawIntent); scoped(intent.reviewToken.scope);
      const receipt = ScenarioPromotion.parse(rawReceipt);
      if (intent.scenarioId !== owner.id || !verifySelfDigest(receipt)) throw new Conflict('promotion scenario identity or seal changed');
      await owner.authorizeInitialization();
      const { version, state } = owner.current();
      if (state.scenarios.some(s => s.promotion?.receipt.intent.idempotencyKey === intent.idempotencyKey)) return false;
      if (state.scenarios.some(s => s.projection.id === owner.id)) throw new Conflict('promotion cannot overwrite an existing scenario');
      const approved = await review.approvedSnapshot(owner.ledger, intent.reviewToken, rawDefinition.reviewRef);
      if (digestOfValue(approved.documents).hex !== digestOfValue(rawApproved).hex) throw new Conflict('approved source snapshot changed before promotion');
      await owner.readPorts.validateDefinition(structuredClone(rawDefinition));
      await owner.authorizeInitialization();
      const actor = PromotionActor.parse(await authority.authorizePromotion(structuredClone(owner.scope), digestOfValue(intent)));
      const expected = deriveScenarioPromotion(intent, rawDefinition, rawSelections, approved.documents, actor, receipt.promotedAt);
      if (digestOfValue(expected.promotion).hex !== digestOfValue(receipt).hex) throw new Conflict('promotion manifest differs from current source or actor authority');
      if (owner.current().version !== version) return false;
      approved.assertCurrent(); // Synchronous with the single scenario-registry publication below.
      state.scenarios.push({ projection: ScenarioProjection.parse({ id: owner.id, scope: owner.scope, aggregateVersion: 1,
        definitionRef: expected.definition.ref, state: 'proposed', invalidationEpoch: 0, latestRoundSequence: 0,
        qualificationRoundRefs: [], activationDecisionRef: null }), definitions: [expected.definition], selections: expected.selections,
        admissions: [], activations: [], regressionAdmissions: [], structuralValidations: [], promotion: { receipt, approved: approved.documents } });
      owner.write(version, state, 'workflow.scenario.promoted'); return true;
    },
  };
}
