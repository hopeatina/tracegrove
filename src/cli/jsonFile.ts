import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Conflict } from '../core/errors.ts';

/** Operator-owned configuration, bounded and parsed before any local write. */
export function readConfigurationJson(path: string, maximumBytes: number): unknown {
  const file = resolve(path); const stat = statSync(file);
  if (!stat.isFile() || stat.size > maximumBytes) throw new Conflict(`Configuration must be a file of at most ${maximumBytes} bytes`);
  const bytes = readFileSync(file);
  if (bytes.length > maximumBytes) throw new Conflict('Configuration grew beyond its byte limit');
  return JSON.parse(bytes.toString('utf8'));
}
