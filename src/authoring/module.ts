import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { Blocked } from '../core/errors.ts';

const EXPORT_BYTES = 1024 * 1024;
const EVALUATION_TIMEOUT_MS = 5000;
// A fresh process avoids stale imported helpers and keeps author console output
// out of CLI JSON. This is trusted project code, not an application sandbox.
const evaluate = `
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { default: value } = await import(pathToFileURL(process.argv[1]).href);
const json = JSON.stringify(value, (_key, item) => {
  if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof item) ||
      (typeof item === 'number' && !Number.isFinite(item))) throw new Error('not JSON data');
  return item;
});
writeFileSync(3, json);
`;

/** Node's pinned runtime strips erasable TypeScript; no second compiler or config schema. */
export function readAuthoringModule(path: string): unknown {
  const absolute = resolve(path);
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', evaluate, absolute], {
    cwd: dirname(absolute), timeout: EVALUATION_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: EXPORT_BYTES,
    stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
  });
  const output = child.output[3];
  if (child.error || child.status !== 0 || !output || output.length > EXPORT_BYTES) {
    throw new Blocked([{ code: 'authoring_module_failed', detail: `${absolute}: module did not export bounded JSON data within ${EVALUATION_TIMEOUT_MS}ms`,
      owner: 'test author', action: 'export a default config, flow, or fixture; use erasable TypeScript and JSON values' }]);
  }
  try { return JSON.parse(output.toString('utf8')); }
  catch { throw new Blocked([{ code: 'authoring_module_failed', detail: `${absolute}: module export was not JSON`, owner: 'test author', action: 'export a default JSON-compatible value' }]); }
}
