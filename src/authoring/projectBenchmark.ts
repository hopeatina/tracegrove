import { join } from 'node:path';
import { z } from 'zod';
import { BenchmarkAxis } from '../protocol/index.ts';
import { inspectBenchmark } from '../core/benchmark.ts';
import { localScope } from '../core/corpus.ts';
import { STATE_DIR } from './compile.ts';

const Query = z.object({ axis: BenchmarkAxis }).strict();

/** One owned project checkpoint. Paths, scopes and selected-attempt filters are never request inputs. */
export function projectBenchmark(root: string, url: URL) {
  const query = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success || url.searchParams.getAll('axis').length !== 1) {
    return { status: 400, body: { error: 'Choose exactly one benchmark axis: runner or model.' } };
  }
  try {
    return { status: 200, body: inspectBenchmark({ stateDir: join(root, STATE_DIR, 'state'), scope: localScope(), axis: query.data.axis }) };
  } catch {
    return { status: 409, body: { error: 'Benchmark evidence is unavailable. Refresh to re-check this project checkpoint.' } };
  }
}
