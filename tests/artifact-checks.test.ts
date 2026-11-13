import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArtifactSpec, DEAD_LINK, GATE_MIN_DECISIONS, defaultFetcher, draftSpec, judgeAuthority, loadSpec, recordDecision, renderDraft, renderReceipt, runArtifactCheck, type Fetcher } from '../src/artifacts/index.ts';
import { parseArtifact, parseList, parseNumber } from '../src/artifacts/read.ts';
import { findField } from '../src/artifacts/checks.ts';
import { spawnSync } from 'node:child_process';

const EXAMPLE = resolve('examples/artifacts/send-plan');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** A private copy of the example, so a test can break one thing and see which check notices. */
function plan(): { dir: string; spec: string; edit: (file: string, change: (text: string) => string) => void } {
  const dir = mkdtempSync(join(tmpdir(), 'tg-artifact-')); roots.push(dir);
  cpSync(EXAMPLE, dir, { recursive: true });
  return { dir, spec: join(dir, 'send-plan.check.yaml'), edit: (file, change) => writeFileSync(join(dir, file), change(readFileSync(join(dir, file), 'utf8'))) };
}
const NOW = new Date('2026-11-13T12:00:00Z');
const answer = (verdicts: Array<'met' | 'not_met' | 'unclear'>) => async () => JSON.stringify({ items: verdicts.map((verdict, i) => ({ item: i + 1, verdict, lines: verdict === 'unclear' ? [] : [5], why: 'because of line 5' })) });

describe('reading an artifact', () => {
  it('finds links and quotes with their lines, and takes a quote\'s sources from its own line', () => {
    const artifact = parseArtifact('Intro\n\nShe said "this saved us a whole day" ([notes](notes.md)).\n\n```\n"quoted inside code is ignored"\n```\nSee <https://example.com/a>.');
    expect(artifact.links).toEqual([{ url: 'notes.md', line: 3 }, { url: 'https://example.com/a', line: 8 }]);
    expect(artifact.quotes).toEqual([{ text: 'this saved us a whole day', line: 3, sources: ['notes.md'] }]);
  });
  it('reads numbers the way people write them', () => {
    expect([parseNumber('1,204'), parseNumber('38%'), parseNumber('$4.5k'), parseNumber('about ten')]).toEqual([1204, 38, 4500, null]);
    expect(parseList('email,clinic\nA@x.example,One\n\nb@x.example,Two\n')).toEqual(['a@x.example', 'b@x.example']);
  });
  it('accepts a field stated as a heading, a label or a bold label, and notices an empty one', () => {
    expect(findField(['## Owner', '', 'Dana'], 'Owner')).toEqual({ line: 1, filled: true });
    expect(findField(['- **Owner:** Dana'], 'owner')).toEqual({ line: 1, filled: true });
    expect(findField(['Owner:', 'Send date: soon'], 'Owner')).toEqual({ line: 1, filled: false });
    expect(findField(['The owner is Dana'], 'Owner')).toBeNull();
  });
});

describe('the spec', () => {
  it('prescribes no shape: an id and an artifact are enough', () => {
    const spec = ArtifactSpec.parse({ id: 'trailer-cut-3', artifact: 'https://example.com/cut-3' });
    expect(spec.invariants).toEqual({});
    expect(spec.afterlife).toBe('once');
  });
  it('rejects a hypothesis with no review date and an exclusion with no owner or end date', () => {
    expect(ArtifactSpec.safeParse({ id: 'a', artifact: 'a.md', afterlife: 'hypothesis' }).success).toBe(false);
    expect(ArtifactSpec.safeParse({ id: 'a', artifact: 'a.md', exclusions: [{ check: 'links', reason: 'flaky host' }] }).success).toBe(false);
  });
});

describe('artifact check', () => {
  it('is ready when every check passes and every check was shown to fail on a planted defect', async () => {
    const { spec } = plan();
    const receipt = await runArtifactCheck(spec, { now: NOW });
    expect(receipt.verdict).toBe('ready');
    expect(receipt.exitCode).toBe(0);
    expect(receipt.proofs.map((p) => [p.check, p.proven])).toEqual([['contract', true], ['forbid', true], ['audience', true], ['numbers', true], ['claims', true], ['links', true]]);
    expect(receipt.artifact).toMatchObject({ ref: 'send-plan.md' });
    expect(receipt.artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.sources.map((s) => s.ref)).toContain('sources/metrics.json');
    expect(receipt.sources.some((s) => s.ref === DEAD_LINK)).toBe(false);
    expect(receipt.path && existsSync(receipt.path)).toBe(true);
  });

  it('fails with a fix list when a number, a quote, a field, a link, the wording and the audience are wrong', async () => {
    const { spec, edit } = plan();
    edit('send-plan.md', (text) => text.replace('38% of them', '41% of them').replace('losing Monday mornings', 'wasting Monday mornings').replace('Owner: Dana Okafor\n', '')
      .replace('sources/recording-page.md', 'sources/missing-page.md').replace('I can show you', 'Results guaranteed. I can show you'));
    edit('sources/recipients.csv', (text) => `${text}owner@baycity.example,Bay City\n`);
    const receipt = await runArtifactCheck(spec, { now: NOW });
    expect(receipt.verdict).toBe('fix');
    expect(receipt.exitCode).toBe(1);
    const failed = receipt.findings.filter((f) => f.status === 'fail');
    expect(failed.map((f) => f.check).sort()).toEqual(['audience', 'claims', 'contract', 'forbid', 'links', 'numbers']);
    expect(failed.find((f) => f.check === 'numbers')).toMatchObject({ subject: 'second-call-rate', detail: 'the artifact says 41; the source says 38', fix: 'change 41 to 38' });
    expect(failed.find((f) => f.check === 'audience')?.subject).toBe('owner@baycity.example');
    expect(receipt.fixList.length).toBe(6);
    expect(renderReceipt(receipt)).toContain('Fix list');
  });

  it('calls a quote with no source unproven, and an unreadable source blocked, never a pass', async () => {
    const first = plan();
    first.edit('send-plan.md', (text) => text.replace(' ([interview notes](sources/interview-notes.md))', ''));
    // Quotation marks are also used for draft copy and defined terms, so an unlinked quote is reported without blocking...
    const noted = await runArtifactCheck(first.spec, { now: NOW, write: false });
    expect(noted.verdict).toBe('ready');
    expect(noted.findings.find((f) => f.subject === 'unsourced quotes')).toMatchObject({ status: 'unproven', severity: 'note' });
    // ...unless the spec says every quotation in this piece is a claim.
    first.edit('send-plan.check.yaml', (text) => text.replace("mustCite: ['\\d+% of']", "mustCite: ['\\d+% of']\n    unsourcedQuotes: block"));
    const unproven = await runArtifactCheck(first.spec, { now: NOW });
    expect([unproven.verdict, unproven.exitCode]).toEqual(['unproven', 3]);
    expect((await runArtifactCheck(first.spec, { now: NOW, allowUnproven: true, write: false })).verdict).toBe('ready');

    const second = plan();
    second.edit('send-plan.check.yaml', (text) => text.replace('source: { ref: sources/metrics.json, path: pilot.clinics_reached }', 'source: { ref: "https://metrics.example/pilot.json", path: pilot.clinics_reached }'));
    const files = defaultFetcher(second.dir);
    const blocked = await runArtifactCheck(second.spec, { now: NOW, fetcher: async (ref) => ref.startsWith('https://metrics.example') ? { ok: false, why: 'no answer in 10 s', status: null } : files(ref) });
    expect([blocked.verdict, blocked.exitCode]).toEqual(['blocked', 2]);
    expect(blocked.findings.find((f) => f.status === 'blocked')).toMatchObject({ check: 'numbers', subject: 'clinics-reached' });
  });

  it('does not count a check that cannot be shown to fail', async () => {
    const { spec, edit } = plan();
    edit('send-plan.check.yaml', (text) => text.replace('      example: HIPAA-compliant\n', ''));
    const receipt = await runArtifactCheck(spec, { now: NOW });
    expect(receipt.verdict).toBe('unproven');
    expect(receipt.proofs.find((p) => p.check === 'forbid')).toMatchObject({ proven: false });
    expect(receipt.reasons.join(' ')).toContain('forbid');
    const skipped = await runArtifactCheck(spec, { now: NOW, prove: false, write: false });
    expect(skipped.verdict).toBe('unproven');
  });

  it('sets a finding aside only while its exclusion is in date, and never reports it as a pass', async () => {
    const { spec, edit } = plan();
    edit('send-plan.md', (text) => text.replace('sources/recording-page.md', 'sources/missing-page.md'));
    edit('send-plan.check.yaml', (text) => text.replace('exclusions: []', 'exclusions:\n  - { check: links, match: missing-page, reason: the page goes live on send day, owner: Dana, expires: "2026-11-18" }'));
    const during = await runArtifactCheck(spec, { now: NOW });
    expect(during.verdict).toBe('ready');
    expect(during.counts.excluded).toBe(1);
    expect(during.findings.find((f) => f.status === 'excluded')?.excluded).toMatchObject({ was: 'fail', owner: 'Dana' });
    const after = await runArtifactCheck(spec, { now: new Date('2026-11-19T00:00:00Z') });
    expect(after.verdict).toBe('fix');
    expect(after.reasons.join(' ')).toContain('expired on 2026-11-18');
  });

  it('checks a piece that shipped once only once, and chains each receipt to the one before', async () => {
    const { spec, edit } = plan();
    const first = await runArtifactCheck(spec, { now: NOW });
    const again = await runArtifactCheck(spec, { now: new Date('2026-11-14T12:00:00Z') });
    expect(again.reused).toBe(true);
    expect(again.receiptHash).toBe(first.receiptHash);
    edit('send-plan.md', (text) => `${text}\nPS: reply to this address.\n`);
    const changed = await runArtifactCheck(spec, { now: new Date('2026-11-15T12:00:00Z') });
    expect(changed.reused).toBe(false);
    expect(changed.previous).toBe(first.receiptHash);
  });

  it('resolves links over the network through the fetcher, and treats a host that does not answer as blocked', async () => {
    const { spec, edit, dir } = plan();
    edit('send-plan.md', (text) => `${text}\n[pricing](https://example.com/pricing) and [old page](https://example.com/gone) and [slow](https://slow.example/)\n`);
    const files = defaultFetcher(dir);
    const fetcher: Fetcher = async (ref) => ref === 'https://example.com/pricing' ? { ok: true, text: 'ok', sha256: 'x', bytes: 2, status: 200 }
      : ref === 'https://example.com/gone' ? { ok: false, why: 'status 404', status: 404 } : ref === 'https://slow.example/' ? { ok: false, why: 'no answer in 10 s', status: null } : files(ref);
    const receipt = await runArtifactCheck(spec, { now: NOW, fetcher });
    const by = (url: string) => receipt.findings.find((f) => f.subject === url)?.status;
    expect([by('https://example.com/pricing'), by('https://example.com/gone'), by('https://slow.example/')]).toEqual(['pass', 'fail', 'blocked']);
  });
});

describe('promises and the judge', () => {
  it('leaves promises unjudged without --judge, and treats a judged miss as advice until sign-offs earn more', async () => {
    const { spec, edit, dir } = plan();
    edit('send-plan.check.yaml', (text) => text.replace('  - The plan says when to stop sending, in terms someone can measure.', '  - { text: "The plan says when to stop sending, in terms someone can measure.", authority: gate }'));
    expect((await runArtifactCheck(spec, { now: NOW, write: false })).promises.map((p) => p.verdict)).toEqual(['not_judged', 'not_judged']);

    const advised = await runArtifactCheck(spec, { now: NOW, ask: answer(['met', 'not_met']) });
    expect(advised.verdict).toBe('ready');
    expect(advised.promises[1]).toMatchObject({ verdict: 'not_met', authority: 'advice', lines: [5] });
    expect(advised.fixList.at(-1)?.check).toBe('promise (advice)');

    // People reject the run the judge also faulted, thirty times: the judge has now earned the gate.
    for (let i = 0; i < GATE_MIN_DECISIONS; i++) recordDecision(spec, 'reject', { reason: 'no measurable stop', now: NOW });
    expect(judgeAuthority(dir, 'sales.send_plan')).toMatchObject({ decisions: GATE_MIN_DECISIONS, agreement: 1, gateEarned: true });
    const gated = await runArtifactCheck(spec, { now: NOW, ask: answer(['met', 'not_met']), rerun: true });
    expect([gated.verdict, gated.exitCode]).toEqual(['fix', 1]);
    expect(gated.promises[1]?.authority).toBe('gate');
  });

  it('turns an uncited answer into unclear, and needs a reason to reject', async () => {
    const { spec } = plan();
    const receipt = await runArtifactCheck(spec, { now: NOW, ask: async () => '{"items":[{"item":1,"verdict":"met","lines":[],"why":"looks fine"}]}' });
    expect(receipt.promises.map((p) => p.verdict)).toEqual(['unclear', 'unclear']);
    expect(() => recordDecision(spec, 'reject')).toThrow(/artifact_reason_required/);
  });
});

describe('pieces that are not shaped like the example', () => {
  const piece = (text: string, spec: Record<string, unknown>, name = 'piece.md') => {
    const dir = mkdtempSync(join(tmpdir(), 'tg-artifact-')); roots.push(dir);
    writeFileSync(join(dir, name), text);
    writeFileSync(join(dir, 'p.check.yaml'), JSON.stringify({ schemaVersion: 'tracegrove.artifact-check/v1', id: 'p', artifact: name, ...spec }));
    return join(dir, 'p.check.yaml');
  };

  it('does not call a piece ready when no check found anything to examine', async () => {
    const empty = await runArtifactCheck(piece('{"meeting":"weekly"}', { promises: ['An executive can decide from this.'], invariants: { claims: {}, links: {} } }, 'piece.json'), { now: NOW, write: false });
    expect([empty.verdict, empty.exitCode]).toEqual(['unproven', 3]);
    expect(empty.reasons.join(' ')).toMatch(/nothing was examined/);
  });

  it('requires wording the brief asked for and holds a piece to its length, and shows both checks can fail', async () => {
    const spec = { invariants: { require: [{ pattern: 'RUN-20261030', reason: 'the brief asks for the run token' }], length: { maxWords: 12 } } };
    const ok = await runArtifactCheck(piece('# Filter\n\nToken RUN-20261030. Removing the filter restores the list.', spec), { now: NOW, write: false });
    expect(ok.verdict).toBe('ready');
    expect(ok.proofs.map((p) => [p.check, p.proven])).toEqual([['require', true], ['length', true]]);
    const bad = await runArtifactCheck(piece('# Filter\n\nRemoving the filter restores the list exactly as it was before, every single time, for every view.', spec), { now: NOW, write: false });
    expect(bad.verdict).toBe('fix');
    expect(bad.findings.filter((f) => f.status === 'fail').map((f) => f.check)).toEqual(['require', 'length']);
  });

  it('lets a forbid rule spare a line that names the wording to rule it out, and an exclusion match the detail', async () => {
    const text = '# Batch\n\nRules: no "game-changing" language.\n\nDraft: a short note about the work.';
    const strict = await runArtifactCheck(piece(text, { invariants: { forbid: [{ pattern: 'game-changing', reason: 'hype' }] } }), { now: NOW, write: false });
    expect(strict.verdict).toBe('fix');
    const spared = await runArtifactCheck(piece(text, { invariants: { forbid: [{ pattern: 'game-changing', reason: 'hype', unless: '\\bno\\b' }] } }), { now: NOW, write: false });
    expect(spared.verdict).toBe('ready');
    expect(spared.findings[0]?.detail).toMatch(/only name it/);
    const used = await runArtifactCheck(piece(`${text}\n\nThis is game-changing.`, { invariants: { forbid: [{ pattern: 'game-changing', reason: 'hype', unless: '\\bno\\b' }] } }), { now: NOW, write: false });
    expect(used.verdict).toBe('fix');
  });

  it('reads a field from a table row', () => {
    expect(findField(['| Owner | Dana |'], 'Owner')).toEqual({ line: 1, filled: true });
  });
});

describe('the command', () => {
  it('prints the receipt as JSON and exits with the verdict', () => {
    const { spec, edit } = plan();
    const cli = () => spawnSync(process.execPath, ['--import', 'tsx', resolve('src/cli/main.ts'), 'artifact', 'check', spec, '--json'], { encoding: 'utf8' });
    const ready = cli();
    expect(ready.status).toBe(0);
    expect(JSON.parse(ready.stdout).verdict).toBe('ready');
    edit('send-plan.md', (text) => text.replace('1,204', '1,300'));
    const fix = cli();
    expect(fix.status).toBe(1);
    expect(JSON.parse(fix.stdout).fixList[0].do).toBe('change 1300 to 1204');
  });
});

describe('drafting a spec from the brief', () => {
  const proposal = { title: 'Reactivation send', afterlife: 'once', promises: ['The message offers one concrete next step.', { text: 'The plan says when to stop.', authority: 'gate' }],
    invariants: { contract: { fields: ['Owner', 'Send date'], severity: 'note' },
      numbers: [{ id: 'clinics', find: 'reached ([\\d,]+) clinics', source: { ref: 'sources/metrics.json', path: 'pilot.clinics_reached' }, tolerance: 500 }, { id: 'made-up', find: '(\\d+) replies', source: { ref: 'sources/replies.json', path: 'n' } }],
      claims: {}, links: {}, forbid: [{ pattern: 'guaranteed', reason: 'no promised outcomes' }], audience: { recipients: 'sources/recipients.csv', noneIn: ['sources/suppressed.csv'] } },
    exclusions: [{ check: 'links', reason: 'trust me', owner: 'the maker', expires: '2099-01-01' }], shipRule: { maxUnproven: 99 } };

  it('keeps what the drafter may propose, removes anything that would let a failure pass, and tries the draft on the piece', async () => {
    const { dir } = plan();
    const result = await draftSpec({ brief: join(dir, 'brief.md'), artifact: join(dir, 'send-plan.md'), sources: join(dir, 'sources'), out: join(dir, 'drafted.check.yaml'), by: 'test model', ask: async () => JSON.stringify(proposal) });
    const { spec } = loadSpec(result.spec);
    expect(spec.exclusions).toEqual([]);
    expect(spec.shipRule.maxUnproven).toBe(0);
    expect(spec.promises.map((p) => p.authority)).toEqual(['advice', 'advice']);
    expect(spec.invariants.contract?.severity).toBe('block');
    expect(spec.invariants.numbers?.map((n) => [n.id, n.tolerance])).toEqual([['clinics', 0]]);
    expect(spec.brief?.ref).toBe('brief.md');
    expect(spec.draftedBy).toBe('test model');
    expect(result.dropped.join('\n')).toMatch(/exclusions/);
    expect(result.dropped.join('\n')).toMatch(/shipRule/);
    expect(result.dropped.join('\n')).toMatch(/gate/);
    expect(result.dropped.join('\n')).toMatch(/made-up/);
    expect(result.trial?.verdict).toBe('ready');
    expect(existsSync(join(dir, '.tracegrove'))).toBe(false);
    expect(renderDraft(result)).toContain('against the piece as it stands: READY');
  });

  it('writes the check from the brief alone: the drafter is never shown the piece, and prose briefs still yield promises', async () => {
    const { dir } = plan();
    let seen = '';
    await draftSpec({ brief: join(dir, 'brief.md'), artifact: join(dir, 'send-plan.md'), out: join(dir, 'blind.check.yaml'), ask: async (prompt) => { seen ||= prompt; return JSON.stringify({ promises: ['x is stated plainly.'], invariants: { require: [{ pattern: 'Monday', reason: 'asked for' }], length: { maxWords: 400 }, claims: { unsourcedQuotes: 'ignore' }, forbid: [{ pattern: 'guaranteed', reason: 'r', unless: 'no' }] } }); } });
    expect(seen).not.toContain('we stopped losing Monday mornings');
    const { spec } = loadSpec(join(dir, 'blind.check.yaml'));
    expect(spec.invariants.claims?.unsourcedQuotes).toBe('note');
    expect(spec.invariants.forbid?.[0]?.unless).toBeUndefined();
    expect(spec.invariants.length?.maxWords).toBe(400);
    writeFileSync(join(dir, 'prose.md'), 'Kind: sales.document\n\nDraft a batch of ten outreach notes for founders. Every note must name the evidence it rests on. Nothing is sent without review.');
    const prose = await draftSpec({ brief: join(dir, 'prose.md'), artifact: join(dir, 'later.md'), out: join(dir, 'prose.check.yaml') });
    expect(prose.promises).toBe(3);
  });

  it('drafts before the piece exists, sends a bad reply back once, and refuses to redraft over a spec', async () => {
    const { dir } = plan();
    rmSync(join(dir, 'send-plan.md')); rmSync(join(dir, 'send-plan.check.yaml'));
    const prompts: string[] = [];
    const ask = async (prompt: string) => { prompts.push(prompt); return prompts.length === 1 ? 'Here you go: {"promises": "not a list", "invariants": {"numbers": "many"}}' : JSON.stringify({ promises: ['It says when to stop.'], invariants: { links: {} } }); };
    const result = await draftSpec({ brief: join(dir, 'brief.md'), artifact: join(dir, 'send-plan.md'), ask });
    expect(result.spec).toBe(join(dir, 'send-plan.check.yaml'));
    expect(result.trial).toBeNull();
    expect(prompts.length).toBe(2);
    expect(prompts[1]).toContain('could not be used');
    expect(prompts[0]).not.toContain('The piece as it stands');
    await expect(draftSpec({ brief: join(dir, 'brief.md'), artifact: join(dir, 'send-plan.md'), ask })).rejects.toThrow(/artifact_spec_exists/);
    await expect(draftSpec({ brief: join(dir, 'brief.md'), artifact: join(dir, 'other.md'), ask: async () => 'no json at all' })).rejects.toThrow(/artifact_draft_invalid/);
  });

  it('drafts by rules with no model, and a later check says when the brief has changed', async () => {
    const { dir, edit } = plan();
    const result = await draftSpec({ brief: join(dir, 'brief.md'), artifact: join(dir, 'send-plan.md'), out: join(dir, 'rules.check.yaml') });
    expect([result.draftedBy, result.promises, result.checks]).toEqual(['rules', 6, ['claims', 'links']]);
    const before = await runArtifactCheck(result.spec, { now: NOW, write: false });
    expect(before.brief?.changed).toBe(false);
    edit('brief.md', (text) => `${text}- Mention the price.\n`);
    const after = await runArtifactCheck(result.spec, { now: NOW, write: false });
    expect(after.brief?.changed).toBe(true);
    expect(after.reasons.join(' ')).toContain('the brief (brief.md) has changed');
  });
});
