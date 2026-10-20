import { BenchmarkAxis, ScopeSchema, type BenchmarkReport, type Scope } from '../protocol/index.ts';
import { readAttemptCheckpoint } from './attemptInventory.ts';
import { aggregateBenchmark } from './benchmarkAggregation.ts';
export { BENCHMARK_LIMITS } from './benchmarkAggregation.ts';

/** Read all execution admissions at one stable local checkpoint. Never executes or recovers work. */
export function inspectBenchmark(options: { stateDir: string; scope: Scope; axis: BenchmarkAxis }): BenchmarkReport {
  const axis = BenchmarkAxis.parse(options.axis), scope = ScopeSchema.parse(options.scope);
  return aggregateBenchmark(readAttemptCheckpoint({ stateDir: options.stateDir, scope }), axis);
}
