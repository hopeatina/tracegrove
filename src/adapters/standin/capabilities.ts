import { RunnerCapabilities, digestOfValue, parseAs } from '../../protocol/index.ts';

/** The same runner, also able to arm stand-in faults and read stand-ins back. Only flows that use stand-ins get it. */
export function withStandIns(runner: RunnerCapabilities): RunnerCapabilities {
  const ref = { id: `${runner.ref.id}.standins`, revision: runner.ref.revision };
  const capabilities = { ...runner, operations: [...runner.operations, 'standin.fault', 'standin.observe', 'standin.http'], oracles: [...runner.oracles, 'standin.observation/1'],
    faultOperations: [...runner.faultOperations, 'standin.fault'] };
  return parseAs(RunnerCapabilities, { ...capabilities, ref: { ...ref, digest: digestOfValue({ ...capabilities, ref }) } }, 'stand-in runner');
}
