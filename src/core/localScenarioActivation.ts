import { IdString, ScenarioActivation, ScenarioActivationIntent, ScenarioProjection, ScenarioReplayAssessment,
  digestOfValue, sameScope, verifySelfDigest, type Scope } from '../protocol/index.ts';
import type { LocalQualificationResults } from './localQualificationResults.ts';
import { storedDefinition } from './localScenarioState.ts';
import { ActivationActor, deriveScenarioActivation } from './activationDecision.ts';
import { assessScenarioReplay } from './replayAssessment.ts';
import { validateScenarioSnapshot } from './scenario.ts';
import type { LocalScenarioOwner } from './localScenarioOwner.ts';
import type { ScenarioActivationPorts } from './scenarioActivation.ts';
import { Conflict } from './errors.ts';

export type LocalScenarioActivationAuthority = Pick<ScenarioActivationPorts, 'resolvePolicy' | 'authorizeActivation'>;
/** Internal composition over the existing scenario owner; no separate transaction or activation journal. */
export function localScenarioActivationPorts(owner: LocalScenarioOwner, results: LocalQualificationResults,
  authority: LocalScenarioActivationAuthority): ScenarioActivationPorts {
  const scoped = (scope: Scope) => { if (!sameScope(scope, owner.scope)) throw new Conflict('activation belongs to another scope'); };
  const ports: ScenarioActivationPorts = { ...owner.readPorts, ...results.replayPorts(),
    authorize: async scope => { scoped(scope); await owner.authorizeRead(structuredClone(scope)); },
    resolvePolicy: async (ref, scope) => { scoped(scope); return authority.resolvePolicy(structuredClone(ref), structuredClone(scope)); },
    authorizeActivation: async (scope, digest) => { scoped(scope); return authority.authorizeActivation(structuredClone(scope), structuredClone(digest)); },
    readActivation: async (key, scope) => {
      IdString.parse(key); scoped(scope); await owner.authorizeRead(structuredClone(scope));
      const records = owner.current().state.scenarios.flatMap(scenario => scenario.activations);
      return structuredClone(records.find(record => record.activation.intent.idempotencyKey === key)?.activation ?? null);
    },
    compareAndSwapActivation: async (rawIntent, rawNext, rawActivation, rawReport) => {
      const intent = ScenarioActivationIntent.parse(rawIntent); const next = ScenarioProjection.parse(rawNext);
      const activation = ScenarioActivation.parse(rawActivation); const submitted = ScenarioReplayAssessment.parse(rawReport);
      scoped(intent.snapshot.scope); scoped(next.scope); scoped(activation.scope);
      if (intent.snapshot.id !== owner.id || next.id !== owner.id || !verifySelfDigest(activation)) throw new Conflict('activation scenario identity or seal changed');
      await owner.authorizeRead(structuredClone(owner.scope));
      const { version, state } = owner.current(); const entry = owner.entry(state);
      if (state.scenarios.some(scenario => scenario.activations.some(a => a.activation.intent.idempotencyKey === intent.idempotencyKey))) return false;
      validateScenarioSnapshot({ projection: entry.projection, admissions: entry.admissions }, intent.snapshot);
      const evidence = await results.replaySnapshot(owner.ledger);
      // Raw retained evidence and current policy are re-read inside the commit boundary.
      // The submitted report, actor and projection never grant authority by themselves.
      let report: ScenarioReplayAssessment;
      try { report = await assessScenarioReplay({ ...ports, ...evidence }, intent.snapshot); }
      catch (error) {
        if (error instanceof Conflict && owner.current().version !== version) return false;
        throw error;
      }
      if (digestOfValue(report).hex !== digestOfValue(submitted).hex) throw new Conflict('activation selected evidence changed before commit');
      const actor = ActivationActor.parse(await ports.authorizeActivation(structuredClone(owner.scope), digestOfValue(intent)));
      const expected = deriveScenarioActivation(intent, entry.projection, storedDefinition(entry, entry.projection.definitionRef), report, actor, activation.activatedAt);
      if (digestOfValue(next).hex !== digestOfValue(expected.next).hex || digestOfValue(activation).hex !== digestOfValue(expected.activation).hex) throw new Conflict('activation actor, intent, assessments or projection differ from current authority');
      if (owner.current().version !== version) return false;
      evidence.assertCurrent(); // Synchronous with the single journal append below.
      entry.projection = next; entry.activations.push({ activation, report });
      owner.write(version, state, 'workflow.scenario.activated');
      return true;
    },
  };
  return ports;
}
