import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readChange, unitsOf } from '../src/authoring/growChange.ts';
import { isPromptFile, promptBlocks, promptOnlyChange } from '../src/authoring/growPrompt.ts';
import { journeysOf, reachGraph } from '../src/authoring/growReach.ts';
import { PROVIDERS } from '../src/authoring/growChange.ts';
import { growCommand } from '../src/cli/grow.ts';
import { inMode } from '../src/authoring/growState.ts';

// A helpdesk whose triage agent reads its system prompt from prompts/triage.md; the branch changes only that prompt.
const FIXTURE = join(import.meta.dirname, 'fixtures', 'prompt-helpdesk');
const temps: string[] = [];
afterAll(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true }); });
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { encoding: 'utf8' });
function helpdesk(change: (dir: string) => void = (dir) => cpSync(join(FIXTURE, 'branch'), dir, { recursive: true })): string {
  const dir = mkdtempSync(join(tmpdir(), 'tracegrove-prompt-')); temps.push(dir);
  cpSync(join(FIXTURE, 'base'), dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Helpdesk');
  git(dir, 'checkout', '-qb', 'triage-tone'); change(dir); git(dir, 'commit', '-qam', 'Triage prompt: security tickets are urgent');
  return dir;
}
const traced = (dir: string) => {
  const files = readChange(dir, 'main', 'triage-tone');
  const { units } = unitsOf(dir, 'triage-tone', files);
  return { files, units, ...journeysOf(units, reachGraph(dir, 'triage-tone', units, PROVIDERS)) };
};

describe('A change to an AI agent\'s prompt', () => {
  it('knows a prompt file from its path, and a prompt string in code from its name', () => {
    for (const p of ['prompts/triage.md', 'src/prompts/agents/reply.txt', 'agent.prompt', 'lib/triage.prompt.md', 'config/system_prompt.txt', 'ai/assistant-prompt.yaml']) expect(isPromptFile(p), p).toBe(true);
    for (const p of ['README.md', 'docs/prompts.mdx', 'tests/prompts/triage.md', 'lib/triage.mjs', 'src/promptly.ts']) expect(isPromptFile(p), p).toBe(false);
    const code = ['import { ask } from "./model.mjs";', 'export const SYSTEM_PROMPT = `You sort tickets.', 'Urgent when money left by mistake.', '`;', 'export const run = (t) => ask(SYSTEM_PROMPT, t);'].join('\n');
    expect(promptBlocks('lib/triage.mjs', code)).toEqual([{ name: 'SYSTEM_PROMPT', from: 2, to: 4 }]);
    expect(promptOnlyChange({ path: 'lib/triage.mjs', added: [{ line: 3, text: 'Urgent when money left by mistake.' }] }, code)).toBe('SYSTEM_PROMPT');
    // a change that also touches code is a code change
    expect(promptOnlyChange({ path: 'lib/triage.mjs', added: [{ line: 3, text: 'Urgent when money left by mistake.' }, { line: 5, text: 'export const run = (t) => ask(SYSTEM_PROMPT, t);' }] }, code)).toBeNull();
    const py = ['SYSTEM_PROMPT = """You sort tickets.', 'Urgent when money left by mistake.', '"""'].join('\n');
    expect(promptOnlyChange({ path: 'triage.py', added: [{ line: 2, text: 'Urgent when money left by mistake.' }] }, py)).toBe('SYSTEM_PROMPT');
  });

  it('grows from the prompt to the agent that reads it and to every route and job that runs that agent, and to no other', () => {
    const { files, units, journeys } = traced(helpdesk());
    expect(files.map((f) => [f.path, f.role])).toEqual([['prompts/triage.md', 'doc']]);
    const by = (label: string) => units.find((u) => u.label === label);
    expect(by('prompts/triage.md')).toMatchObject({ kind: "agent's prompt", file: 'prompts/triage.md', root: false });
    expect(by('triage.mjs')).toMatchObject({ kind: 'agent', file: 'lib/triage.mjs', added: [] });
    expect(by('POST /tickets')).toMatchObject({ kind: 'route', file: 'app/server.mjs', added: [] });
    expect(by('retriage.mjs')).toMatchObject({ kind: 'job', file: 'jobs/retriage.mjs' });
    // the model API the agent sends the prompt to, through the module it imports
    expect(by('Anthropic')).toMatchObject({ root: true, file: 'lib/model.mjs', parent: by('triage.mjs')!.id });
    // the reply agent, its prompt and the route that drafts replies do not read the changed prompt
    for (const other of ['reply.mjs', 'prompts/reply.md', 'POST /tickets/{id}/reply']) expect(by(other), other).toBeUndefined();
    expect(units.map((u) => u.label).filter((l) => /reply/.test(l))).toEqual([]);
    // two journeys, each through the agent to its prompt, each saying the prompt is what it touches
    expect(journeys.map((j) => j.title).sort()).toEqual(['POST /tickets', 'Retriage job']);
    for (const j of journeys) {
      expect(j.units).toContain(by('prompts/triage.md')!.id);
      expect(j.units).toContain(by('triage.mjs')!.id);
      expect(j.why).toMatch(/touches the agent's prompt prompts\/triage\.md$/);
    }
  });

  it('says on the grow what the prompt touches: both journeys in Minimum, with scenarios that name the agent and its prompt', async () => {
    const dir = helpdesk();
    const { code, state, summary } = await growCommand({ dir, branch: 'triage-tone', base: 'main', mode: 'min', 'no-gh': true, 'no-agent': true, 'no-prove': true, json: true }, () => {});
    expect(code).toBe(3);
    expect(summary!.verdict).toBe('not proven yet');
    expect(state.journeys).toHaveLength(2);
    const min = state.scenarios.filter((x) => inMode(state, x));
    // every journey that runs the agent is at risk from its prompt, so each has scenarios in Minimum
    expect(new Set(min.map((x) => x.journey))).toEqual(new Set(state.journeys.map((j) => j.id)));
    expect(min.map((x) => x.title)).toContain("POST /tickets acts on the triage.mjs agent's answer under the new prompt");
    expect(state.units.find((u) => u.label === 'prompts/triage.md')).toMatchObject({ unitKind: "agent's prompt" });
    for (const j of state.journeys) expect(j.why).toContain("touches the agent's prompt prompts/triage.md");
  }, 60_000);

  it('treats a prompt string that is all a code file changed as the agent\'s prompt, and grows to what imports it', () => {
    const dir = helpdesk((d) => {
      const f = join(d, 'lib', 'triage.mjs');
      writeFileSync(f, readFileSync(f, 'utf8').replace("const SYSTEM = readFileSync(new URL('../prompts/triage.md', import.meta.url), 'utf8');",
        'const SYSTEM_PROMPT = `You sort customer support tickets for Helpdesk.\nUrgent only when the customer cannot work at all.\n`;\nconst SYSTEM = SYSTEM_PROMPT;'));
      git(d, 'commit', '-qam', 'Inline the triage prompt');
      writeFileSync(f, readFileSync(f, 'utf8').replace('Urgent only when the customer cannot work at all.', 'Urgent when the customer cannot work at all, or was charged twice.'));
    });
    const files = readChange(dir, 'triage-tone~1', 'triage-tone');
    const { units } = unitsOf(dir, 'triage-tone', files);
    const { journeys } = journeysOf(units, reachGraph(dir, 'triage-tone', units, PROVIDERS));
    expect(units.find((u) => u.file === 'lib/triage.mjs')).toMatchObject({ kind: "agent's prompt", label: 'SYSTEM_PROMPT in triage.mjs' });
    expect(units.map((u) => u.label)).toEqual(expect.arrayContaining(['POST /tickets', 'retriage.mjs', 'Anthropic']));
    for (const j of journeys) expect(j.why).toMatch(/touches the agent's prompt SYSTEM_PROMPT in triage\.mjs$/);
  });

  it('leaves a code change as it was: a changed module is not a prompt', () => {
    const dir = helpdesk((d) => { const f = join(d, 'lib', 'triage.mjs'); writeFileSync(f, readFileSync(f, 'utf8').replace("'technical'", "'support'")); });
    const { units } = traced(dir);
    expect(units.find((u) => u.file === 'lib/triage.mjs')).toMatchObject({ kind: 'module', label: 'triage.mjs' });
    expect(units.some((u) => u.kind === "agent's prompt" || u.kind === 'agent')).toBe(false);
  });
});
