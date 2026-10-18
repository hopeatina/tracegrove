import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Blocked } from '../core/errors.ts';
import { AGENT_PROVIDERS } from './schema.ts';
import { VerificationSourceSelection } from './sourceSelection.ts';

export const SETTINGS_FILE = 'settings.json';
export const LocalSettings = z.object({
  agent: z.object({ provider: z.enum(AGENT_PROVIDERS).optional(), model: z.string().min(1).max(120).optional(),
    maxBudgetUsd: z.number().positive().max(100).optional() }).strict().optional(),
  verification: z.object({ source: VerificationSourceSelection }).strict().optional(),
}).strict();
export type LocalSettings = z.infer<typeof LocalSettings>;
export function settingsPath(root: string): string { return join(root, '.tracegrove', SETTINGS_FILE); }
export function readLocalSettings(root: string): LocalSettings {
  const file = settingsPath(root);
  if (!existsSync(file)) return {};
  const parsed = LocalSettings.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) throw new Blocked(parsed.error.issues.map(issue => ({ code: 'invalid_settings', detail: `${file} at ${issue.path.join('.')}: ${issue.message}`, action: `fix or delete ${file}` })));
  return parsed.data;
}
export function writeLocalSettings(root: string, next: unknown): LocalSettings {
  const parsed = LocalSettings.safeParse(next);
  if (!parsed.success) throw new Blocked(parsed.error.issues.map(issue => ({ code: 'invalid_settings', detail: `${issue.path.join('.') || 'settings'}: ${issue.message}`, action: 'provide valid local agent or verification settings' })));
  mkdirSync(join(root, '.tracegrove'), { recursive: true });
  writeFileSync(settingsPath(root), `${JSON.stringify(parsed.data, null, 2)}\n`);
  return parsed.data;
}
