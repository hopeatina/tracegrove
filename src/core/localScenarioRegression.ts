import { RegressionAdmission, RegressionRunIntent, digestOfValue, freeze, sameRef, sameScope,
  type Ref, type RunRequest, type Scope } from '../protocol/index.ts';
import { newId } from './clock.ts';
import { Conflict } from './errors.ts';
import { storedDefinition, storedSelection } from './localScenarioState.ts';
import { validateQualificationMatrix, validateScenarioSnapshot } from './scenario.ts';
import type { LocalScenarioOwner } from './localScenarioOwner.ts';
import type { LocalLedger } from './ledger.ts';
import type { RegressionExecutionOwner } from './regressionExecution.ts';

export interface LocalScenarioRegressionAuthority {
  authorizeRegistration(scope: Scope, intentDigest: ReturnType<typeof digestOfValue>): Promise<void>;
  /** Actual fresh physical-state lease/access validation; declaring references grants nothing. */
  validateStateLeases(admission: RegressionAdmission): Promise<{ assertCurrent(): void }>;
  authorizeEffects(request: RunRequest, admission: RegressionAdmission, cellId: string | null): Promise<void>;
}
/** Existing scenario journal owns registration and lease claims; execution keeps its normal writer/ownership path. */
export function localScenarioRegressionOwner(owner: LocalScenarioOwner, authority: LocalScenarioRegressionAuthority): RegressionExecutionOwner & {
  register(input: RegressionRunIntent): Promise<RegressionAdmission>;
} {
  const scoped = (scope: Scope) => { if (!sameScope(scope, owner.scope)) throw new Conflict('regression scope differs from the owner'); };
  const currentEntry = () => { const current = owner.current(); return { ...current, entry: owner.entry(current.state) }; };
  return {
    async register(input) {
      const intent = RegressionRunIntent.parse(input); scoped(intent.snapshot.scope);
      if (intent.snapshot.id !== owner.id) throw new Conflict('regression scenario differs from the owner');
      const digest = digestOfValue(intent);
      await authority.authorizeRegistration(structuredClone(owner.scope), structuredClone(digest));
      await owner.authorizeRead(structuredClone(owner.scope));
      const { version, state, entry } = currentEntry();
      const prior = state.scenarios.flatMap(s => s.regressionAdmissions).find(a => a.intent.idempotencyKey === intent.idempotencyKey);
      if (prior) {
        if (digestOfValue(prior.intent).hex !== digest.hex) throw new Conflict('regression idempotency key belongs to another intent');
        return structuredClone(prior);
      }
      validateScenarioSnapshot({ projection: entry.projection, admissions: entry.admissions }, intent.snapshot);
      const p = entry.projection;
      if (p.state !== 'active' || !p.activationDecisionRef) throw new Conflict('regression requires current explicitly active coverage');
      const definition = storedDefinition(entry, p.definitionRef);
      const selection = storedSelection(entry, intent.selectionManifestRef), matrix = storedSelection(entry, definition.qualificationMatrixRef);
      validateQualificationMatrix(definition, matrix, selection);
      const admission = RegressionAdmission.parse(freeze({ schemaVersion: 'workflow.regression-admission/v1',
        ref: { id: `regression-admission-${digest.hex}`, revision: '1' }, scope: owner.scope, intent,
        activationRef: p.activationDecisionRef, campaignId: newId('regression-campaign') }));
      const reviewed = await owner.checkDefinition(definition);
      const leases = await authority.validateStateLeases(structuredClone(admission));
      await authority.authorizeRegistration(structuredClone(owner.scope), structuredClone(digest));
      if (owner.current().version !== version) throw new Conflict('scenario changed during regression registration');
      reviewed?.assertCurrent();
      leases.assertCurrent();
      entry.regressionAdmissions.push(admission);
      entry.projection = { ...p, aggregateVersion: p.aggregateVersion + 1 };
      // The existing state validator atomically checks history, scoped keys, campaign and all state-lease claims.
      owner.write(version, state, 'workflow.scenario.regression-registered');
      return structuredClone(admission);
    },
    async resolve(ref: Ref, scope: Scope, ledger: LocalLedger) {
      scoped(scope); if (ledger !== owner.ledger) throw new Conflict('regression must use its registration owner ledger');
      await owner.authorizeRead(structuredClone(scope));
      const { version, entry } = currentEntry();
      const admission = entry.regressionAdmissions.find(a => sameRef(a.ref, ref)), p = entry.projection;
      if (!admission || p.state !== 'active' || !p.activationDecisionRef || !sameRef(p.activationDecisionRef, admission.activationRef) ||
          !sameRef(p.definitionRef, admission.intent.snapshot.expectedDefinitionRef) ||
          p.invalidationEpoch !== admission.intent.snapshot.expectedInvalidationEpoch) throw new Conflict('regression admission is missing, inactive or invalidated');
      const definition = storedDefinition(entry, p.definitionRef);
      const activation = entry.activations.find(a => sameRef(a.activation.ref, admission.activationRef))!.activation;
      const reviewed = await owner.checkDefinition(definition);
      const leases = await authority.validateStateLeases(structuredClone(admission));
      await owner.authorizeRead(structuredClone(scope));
      if (owner.current().version !== version) throw new Conflict('regression authority changed during execution admission');
      reviewed?.assertCurrent();
      leases.assertCurrent();
      return structuredClone({ admission, definition, activation, selection: storedSelection(entry, admission.intent.selectionManifestRef),
        matrix: storedSelection(entry, definition.qualificationMatrixRef), ...(reviewed ? { sourceReview: reviewed.documents } : {}) });
    },
    authorizeEffects: (request, admission, cellId) => authority.authorizeEffects(structuredClone(request), structuredClone(admission), cellId),
  };
}
