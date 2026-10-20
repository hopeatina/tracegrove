import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tryExample } from '../src/cli/try.ts';
import { EXAMPLES } from '../src/cli/samples/catalog.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const samplesRoot = join(import.meta.dirname, '../src/samples');

async function run(example: string | null, bug: string | null = null) {
  const root = mkdtempSync(join(tmpdir(), 'tracegrove-try-')); roots.push(root);
  let facts: Record<string, unknown> = {};
  const exitCode = await tryExample({ example, bug, out: example ? join(root, 'out') : null, open: false, port: null, json: true, samplesRoot, write: (value) => { facts = value as Record<string, unknown>; } });
  return { exitCode, facts, root };
}

describe('tracegrove try', () => {
  it('lists the examples, with their bugs, when none is named', async () => {
    const { exitCode, facts } = await run(null);
    expect(exitCode).toBe(0);
    expect((facts.examples as typeof EXAMPLES).map((e) => e.name)).toContain('voice-receptionist');
  });

  it('runs an example end to end with verified evidence', async () => {
    const { exitCode, facts } = await run('notes-api');
    expect(exitCode).toBe(0);
    expect(facts).toMatchObject({ schemaVersion: 'tracegrove.try/v1', outcome: 'passed', bundleVerified: true, bug: null, caught: null });
  });

  it('runs the vet receptionist against stand-in third parties', async () => {
    const { exitCode, facts } = await run('vet-receptionist');
    // Say which case and step broke, so a CI-only failure can be diagnosed from the assertion alone.
    const why = exitCode === 0 ? '' : (() => { try { return readFileSync(join(facts.runDir as string, 'summary.json'), 'utf8').slice(0, 4000); } catch { return JSON.stringify(facts); } })();
    expect(exitCode, why).toBe(0);
    expect(facts).toMatchObject({ outcome: 'passed', bundleVerified: true });
  }, 30_000);

  it('runs the SaaS billing example with a payments stand-in that dedupes idempotency keys', async () => {
    const { exitCode, facts } = await run('saas-billing');
    expect(exitCode, JSON.stringify(facts)).toBe(0);
    expect(facts).toMatchObject({ outcome: 'passed', bundleVerified: true, totals: { passed: 4 } });
  }, 30_000);

  it.each(EXAMPLES.flatMap((e) => e.bugs.map((b) => [e.name, b.name, b.caughtBy] as const)))('%s --bug %s is caught at "%s"', async (example, bug, step) => {
    const { exitCode, facts } = await run(example, bug);
    expect(facts).toMatchObject({ outcome: 'assertion_failed', bundleVerified: true, bug });
    expect((facts.caught as { step: string }).step).toBe(step);
    expect(exitCode).toBe(0);
    expect(readFileSync(facts.configPath as string, 'utf8')).toContain(bug);
  }, 30_000);

  it('rejects an unknown example or bug with the choices', async () => {
    await expect(run('nope')).rejects.toThrow('unknown_example');
    await expect(run('notes-mcp', 'drop_booking')).rejects.toThrow('unknown_bug');
  });
});
