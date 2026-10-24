import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clipFrame, clipPlayerHtml, clipTimeline, parseEventLog } from '../src/authoring/growClip.ts';
import type { GrowEvent } from '../src/authoring/growState.ts';
import { recordGrove } from '../src/cli/growRecord.ts';

const temps: string[] = [];
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** A refunds change: two limbs and a Stripe root, four scenarios, one pass, one fail, one not run, one outside the mode. */
function events(): GrowEvent[] {
  const body: Array<Record<string, unknown>> = [
    { kind: 'phase.started', phase: 0 },
    { kind: 'change.read', branch: 'refunds', base: 'main', head: 'abc1234', pr: 42, title: 'Add refunds <b>', url: null, files: 2, adds: 40, dels: 3, untraced: 0 },
    { kind: 'trunk.grown' },
    { kind: 'unit.found', unit: 'u1', label: 'POST /refunds', unitKind: 'route', loc: 'app.mjs:7', root: false, layer: 'api', parent: null },
    { kind: 'unit.found', unit: 'u2', label: 'RefundButton', unitKind: 'component', loc: 'ui.tsx:3', root: false, layer: 'ui', parent: null },
    { kind: 'unit.found', unit: 'u3', label: 'Stripe', unitKind: 'third party', loc: 'app.mjs:2', root: true, layer: 'ext', parent: 'u1' },
    ...[['s1', 'u1', 'happy', 'min'], ['s2', 'u1', 'sad', 'min'], ['s3', 'u2', 'happy', 'min'], ['s4', 'u3', 'edge', 'min'], ['s5', 'u2', 'edge', 'max']].map(([scenario, unit, scenarioKind, mode]) => ({
      kind: 'scenario.drafted', scenario, unit, scenarioKind, mode, title: `${scenario} title`, proves: 'it works', criteria: [], layers: ['api'], flow: null, variants: [], realKey: null, mockOnly: null, by: 'rules', ext: [] })),
    { kind: 'mode.chosen', mode: 'min', by: 'flag' },
    { kind: 'scenario.running', scenario: 's2', flow: 'refunds/sad' },
    { kind: 'scenario.failed', scenario: 's2', ms: 80, run: 'r2', why: 'expected 402, got 500' },
    { kind: 'scenario.running', scenario: 's1', flow: 'refunds/happy' },
    { kind: 'scenario.passed', scenario: 's1', ms: 120, run: 'r1' },
    { kind: 'scenario.not_run', scenario: 's3', why: 'No flow proves this yet' },
    { kind: 'discovery.finished', ran: 2, passed: 1, failed: 1, notRun: 2 },
  ];
  return body.map((e, i) => ({ v: 'tracegrove.discovery-event/v1', seq: i + 1, ms: i * 10, ...e }) as GrowEvent);
}

describe('grow clip', () => {
  it('turns a leaf green only where a real run passed', () => {
    const tl = clipTimeline(events());
    const end = Object.fromEntries(tl.leaves.map((l) => [l.id, l.end]));
    expect(end).toEqual({ s1: 'pass', s2: 'fail', s3: 'pale', s4: 'pale' });
    expect(tl.leaves.some((l) => l.id === 's5')).toBe(false);
    expect(tl.totals).toEqual({ scenarios: 4, proved: 1, failed: 1, pale: 2 });
    // The failure ran first, so it settles first.
    expect(tl.leaves.find((l) => l.id === 's2')!.endAt).toBeLessThan(tl.leaves.find((l) => l.id === 's1')!.endAt);
    expect(tl.branches.filter((b) => b.root).map((b) => b.label)).toEqual(['Stripe']);
    expect(tl.meta).toBe('2 files · +40 −3 · #42');
  });

  it('lays out the same tree every time and keeps it inside the 9:16 frame', () => {
    const a = clipTimeline(events()); const b = clipTimeline(events());
    expect(a).toEqual(b);
    for (const l of a.leaves) { expect(l.x).toBeGreaterThan(0); expect(l.x).toBeLessThan(a.w); expect(l.y).toBeLessThan(a.ground); }
    for (const p of a.pads) { expect(p.x - p.rx).toBeGreaterThanOrEqual(0); expect(p.x + p.rx).toBeLessThanOrEqual(a.w); }
  });

  it('draws a seed first and the honest count last, escaping change text', () => {
    const tl = clipTimeline(events());
    const first = clipFrame(tl, 0); const last = clipFrame(tl, tl.duration);
    expect(first).toMatch(/^<svg /);
    expect(first).toContain('refunds');
    expect(first).not.toContain('>1</text>');
    expect(last).toContain('>proved</text>');
    expect(last).toContain('>failed</text>');
    expect(last).toContain('>not run yet</text>');
    expect(last).toContain('npx tracegrove grow');
    expect(clipFrame({ ...tl, branch: '<script>x</script>' }, 0)).not.toContain('<script>');
    const html = clipPlayerHtml({ ...tl, branch: 'a</script><b>' });
    expect(html.match(/<\/script>/g)!.length).toBe(1);
  });

  it('reads a saved log and ignores lines that are not discovery events', () => {
    const text = `${events().map((e) => JSON.stringify(e)).join('\n')}\n\nnot json\n{"v":"other"}\n`;
    expect(parseEventLog(text)).toHaveLength(events().length);
  });

  it('writes the player and the still without a browser', async () => {
    const out = mkdtempSync(join(tmpdir(), 'tracegrove-clip-')); temps.push(out);
    const result = await recordGrove(events(), { out, video: false });
    expect(result.video).toBeNull();
    expect(existsSync(join(out, 'grove.html'))).toBe(true);
    expect(readFileSync(join(out, 'grove.svg'), 'utf8')).toContain('>proved</text>');
  });
});
