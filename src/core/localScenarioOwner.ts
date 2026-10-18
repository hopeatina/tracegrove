import type { Scope } from '../protocol/index.ts';
import type { LocalLedger } from './ledger.ts';
import type { LocalScenarioState, StoredScenario } from './localScenarioState.ts';
import type { ScenarioReadPorts } from './scenario.ts';

/** Internal single-writer repository access shared by lifecycle transaction adapters. */
export interface LocalScenarioOwner {
  id: string; scope: Scope; ledger: LocalLedger; readPorts: ScenarioReadPorts;
  authorizeRead(scope: Scope): Promise<void>;
  current(): { version: number; state: LocalScenarioState };
  entry(state: LocalScenarioState): StoredScenario;
  write(version: number, state: LocalScenarioState, event: string): void;
}
