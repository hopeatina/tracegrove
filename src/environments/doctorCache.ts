/** Run `env doctor` and cache its report (no secret values) for `status` and the UI. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadAuthoringConfig } from '../authoring/compile.ts';
import { doctorCachePath } from '../authoring/status.ts';
import { resolveEnvironment } from './resolve.ts';
import { envDoctor, type DoctorReport } from './doctor.ts';
import type { AgentIdentity } from './agents.ts';

export async function runEnvDoctor(input: { configPath: string; env: string; identity?: boolean; signal?: AbortSignal; agent?: AgentIdentity }): Promise<DoctorReport & { checkedAt: string }> {
  const config = loadAuthoringConfig(input.configPath);
  const root = dirname(input.configPath);
  const environment = resolveEnvironment(config, input.env);
  const report = { ...(await envDoctor({ config, root, environment, ...(input.signal ? { signal: input.signal } : {}), ...(input.identity !== undefined ? { identity: input.identity } : {}), ...(input.agent ? { agent: input.agent } : {}) })), checkedAt: new Date().toISOString() };
  const file = doctorCachePath(root, input.env);
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`); } catch { /* cache is best effort */ }
  return report;
}
