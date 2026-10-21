/**
 * Guided `tracegrove env add`: with no flags, propose what the repo's deploy files describe and ask
 * only what tracegrove cannot know (which one, its name, where each persona's credential lives).
 * Every answer becomes the same validated config patch the flag form writes.
 */
import { dirname } from 'node:path';
import { loadAuthoringConfig } from '../authoring/compile.ts';
import { configPatch, type ConfigEditResult } from '../authoring/configEdit.ts';
import { detectEnvironments, detectedCommand, detectedPatch, type Detected } from '../environments/detect.ts';

export type Ask = (question: string) => Promise<string>;

export function detectForConfig(configPath: string): { schemaVersion: 'tracegrove.env-detect/v1'; declared: string[]; detected: Array<Detected & { declared: boolean; command: string }> } {
  const config = loadAuthoringConfig(configPath);
  const declared = Object.keys(config.environments ?? {});
  const detected = detectEnvironments(dirname(configPath), config.app.health).map((d) => ({ ...d, declared: declared.includes(d.name), command: detectedCommand(d) }));
  return { schemaVersion: 'tracegrove.env-detect/v1', declared, detected };
}

export function renderDetected(result: ReturnType<typeof detectForConfig>): string {
  if (!result.detected.length) return 'No deploy files found (compose, fly.toml, render.yaml, vercel.json, netlify.toml, .env.<stage>).\nAdd one by hand: tracegrove env add staging --url https://staging.example.com';
  return [`Found ${result.detected.length} environment(s) in this repo's deploy files:`, ...result.detected.map((d) =>
    `  ${d.name.padEnd(12)} ${'url' in d.target ? d.target.url : `compose ${d.target.service}:${d.target.port}`}  ${label(d)}${d.declared ? '  (already declared)' : ''}\n               from ${d.source}: ${d.why}\n               ${d.command}`),
  ].join('\n');
}

const label = (d: Detected) => d.class === 'production_observation' ? 'production, read-only, agents denied' : d.class === 'deployed_preview' ? 'preview, agents ask first' : 'local, launched by tracegrove';

/** env add <name> with no --url: the detection of that name, when there is one. */
export function detectedNamed(configPath: string, name: string): Detected | null {
  return detectForConfig(configPath).detected.find((d) => d.name === name) ?? null;
}

export async function guidedEnvAdd(configPath: string, ask: Ask, say: (line: string) => void, options: { dryRun?: boolean } = {}): Promise<{ name: string; result: ConfigEditResult } | null> {
  const found = detectForConfig(configPath);
  const fresh = found.detected.filter((d) => !d.declared);
  say(renderDetected(found));
  const config = loadAuthoringConfig(configPath);
  let pick: Detected | null = null;
  if (fresh.length) {
    const answer = (await ask(`\nWhich one? [1-${fresh.length}, or u to enter a URL] (1) `)).trim().toLowerCase() || '1';
    if (answer !== 'u') {
      pick = fresh[Number(answer) - 1] ?? null;
      if (!pick) { say(`No choice ${answer}; nothing written.`); return null; }
    }
  }
  if (!pick) {
    const url = (await ask('Deployed URL (https://…): ')).trim();
    if (!url) { say('No URL; nothing written.'); return null; }
    const stage = (await ask('Is it production? Production is read-only and closed to agents. [y/N] ')).trim().toLowerCase().startsWith('y') ? 'production' : 'staging';
    pick = { name: stage, target: { url }, class: stage === 'production' ? 'production_observation' : 'deployed_preview', source: 'you', why: 'entered by hand' };
  }
  const name = (await ask(`Name (${pick.name}) `)).trim() || pick.name;
  const patch = detectedPatch(pick, name) as { environments: Record<string, Record<string, unknown>> };
  if ('url' in pick.target) {
    // A deployment can't take host-issued tokens: ask where each persona's credential lives.
    const personas: Record<string, { from: string }> = {};
    for (const persona of Object.keys(config.personas)) {
      const suggestion = `env:${name.toUpperCase().replace(/-/g, '_')}_${persona.toUpperCase().replace(/-/g, '_')}_TOKEN`;
      const from = (await ask(`Where does ${persona}'s credential come from? (${suggestion}, - to skip) `)).trim() || suggestion;
      if (from !== '-') personas[persona] = { from };
    }
    if (Object.keys(personas).length) patch.environments[name]!.personas = personas;
  }
  return { name, result: configPatch(configPath, patch, options) };
}
