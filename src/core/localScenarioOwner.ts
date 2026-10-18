import type { Scope, ScenarioDefinition } from '../protocol/index.ts';
import type { LocalLedger } from './ledger.ts';
import type { LocalScenarioState, StoredScenario } from './localScenarioState.ts';
import type { ScenarioReadPorts } from './scenario.ts';
import type { ApprovedPlanSnapshot } from './sourcePromotion.ts';

/** Internal single-writer repository access shared by lifecycle transaction adapters. */
export interface LocalScenarioOwner {
  id: string; scope: Scope; ledger: LocalLedger; readPorts: ScenarioReadPorts;
  authorizeRead(scope: Scope): Promise<void>;
  checkDefinition(definition: ScenarioDefinition): Promise<ApprovedPlanSnapshot | null>;
  current(): { version: number; state: LocalScenarioState };
  entry(state: LocalScenarioState): StoredScenario;
  write(version: number, state: LocalScenarioState, event: string): void;
}
