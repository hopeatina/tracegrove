/**
 * `tracegrove try [example] [--bug <name>]`: write an example, run it, verify the evidence and open
 * the UI, in one command. It replaces the shell scaffolding a first-time reader used to type. Every
 * default (folder, ports) is chosen and printed; `--json` returns the same facts for agents and CI.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { parseDocument } from 'yaml';
import { Blocked } from '../core/errors.ts';
import { runTests } from '../authoring/run.ts';
import { runActivity } from '../authoring/activity.ts';
import { startUi } from '../authoring/ui.ts';
import { EXAMPLES, exampleNamed, type Example, type ExampleBug } from './samples/catalog.ts';
import { writeSample } from './samples/write.ts';
import { paint, progressLine, renderTree } from './render.ts';

export type TryInput = {
  example: string | null; bug: string | null; out: string | null; open: boolean; port: string | null; json: boolean;
  samplesRoot: string; write: (value: unknown, text: string) => void;
};

/** `./tracegrove-try/<name>`, or the first free `<name>-2`, `<name>-3` … so reruns never clobber evidence. */
function freshFolder(name: string, cwd = process.cwd()): string {
  const base = join(cwd, 'tracegrove-try', name);
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!existsSync(candidate) || readdirSync(candidate).length === 0) return candidate;
  }
  throw new Blocked([{ code: 'try_folder_exhausted', detail: base, action: 'remove old tracegrove-try folders or pass --out <dir>' }]);
}

/** Switch a bug on through the app's environment, editing only `app.env` so the rest of the file stays as written. */
function applyBug(configPath: string, bug: ExampleBug): void {
  const doc = parseDocument(readFileSync(configPath, 'utf8'));
  for (const [key, value] of Object.entries(bug.env)) doc.setIn(['app', 'env', key], value);
  writeFileSync(configPath, doc.toString());
}

function listing(): string {
  const p = paint();
  const width = Math.max(...EXAMPLES.map((e) => e.name.length));
  return [p.bold('Examples you can run with one command:'), '',
    ...EXAMPLES.flatMap((e, i) => [`  ${p.dim(`${i + 1}.`)} ${p.moss(e.name.padEnd(width))}  ${e.shows}`,
      ...(e.bugs.length ? [`     ${' '.repeat(width)}  ${p.dim(`bugs to try: ${e.bugs.map((b) => b.name).join(', ')}`)}`] : []),
      ...(e.needs ? [`     ${' '.repeat(width)}  ${p.amber(`needs ${e.needs}`)}`] : [])]),
    '', `run one:  ${p.moss('tracegrove try voice-receptionist')}`, `break it: ${p.moss('tracegrove try voice-receptionist --bug drop_booking')}`].join('\n');
}

async function pick(): Promise<Example | null> {
  process.stdout.write(`${listing()}\n\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question('Which one? (number or name, Enter for 1) ')).trim();
    if (!answer) return EXAMPLES[0]!;
    return exampleNamed(answer) ?? EXAMPLES.at(Number(answer) - 1) ?? null;
  } finally { rl.close(); }
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { const child = spawn(command, args, { stdio: 'ignore', detached: true }); child.on('error', () => {}); child.unref(); } catch { /* the URL is printed anyway */ }
}

export async function tryExample(input: TryInput): Promise<number> {
  const interactive = !input.json && process.stdin.isTTY && process.stdout.isTTY && !process.env.CI;
  let example = input.example ? exampleNamed(input.example) : null;
  if (input.example && !example) throw new Blocked([{ code: 'unknown_example', detail: input.example, owner: 'operator', action: `choose one of: ${EXAMPLES.map((e) => e.name).join(', ')}` }]);
  if (!example) {
    if (!interactive) { input.write({ schemaVersion: 'tracegrove.examples/v1', examples: EXAMPLES }, listing()); return 0; }
    example = await pick();
    if (!example) throw new Blocked([{ code: 'unknown_example', detail: 'no example picked', owner: 'operator', action: 'run tracegrove try <name>' }]);
  }
  const bug = input.bug ? example.bugs.find((b) => b.name === input.bug) : null;
  if (input.bug && !bug) throw new Blocked([{ code: 'unknown_bug', detail: `${example.name} has no bug named ${input.bug}`, owner: 'operator',
    action: example.bugs.length ? `choose one of: ${example.bugs.map((b) => b.name).join(', ')}` : `${example.name} has no switchable bugs; try voice-receptionist, support-chatbot or notes-api` }]);
  if (input.port !== null && !/^\d{1,5}$/.test(input.port)) throw new Blocked([{ code: 'invalid_port', detail: input.port, owner: 'operator', action: 'pass --port <number>, or leave it out for a free port' }]);

  const p = paint();
  const folder = input.out ? resolve(input.out) : freshFolder(bug ? `${example.name}-${bug.name}` : example.name);
  writeSample(input.samplesRoot, example.name, folder);
  const configPath = join(folder, 'tracegrove.config.yaml');
  if (bug) applyBug(configPath, bug);
  const shown = relative(process.cwd(), folder) || folder;
  if (!input.json) process.stdout.write(`${p.moss('✓')} wrote ${p.bold(example.title)} to ${shown}${bug ? `  ${p.amber(`bug on: ${bug.what}`)}` : ''}\n`);

  const live = input.json ? { update: () => {}, done: () => {} } : progressLine();
  const controller = new AbortController();
  const onSignal = () => controller.abort(new Error('user_cancelled'));
  process.on('SIGINT', onSignal);
  let report;
  try {
    live.update('Starting the app and running every scenario');
    ({ report } = await runTests({ configPath, signal: controller.signal, onEvent: (event) => live.update(runActivity(event).label) }));
  } finally { live.done(); process.off('SIGINT', onSignal); }

  const caught = bug ? report.cases.find((c) => c.failure && c.failure.step === bug.caughtBy) ?? report.cases.find((c) => c.failure) ?? null : null;
  const facts = { schemaVersion: 'tracegrove.try/v1', example: example.name, bug: bug?.name ?? null, folder, configPath,
    outcome: report.outcome, exitCode: report.exitCode, bundleVerified: report.bundleVerified, runDir: report.runDir, totals: report.totals,
    caught: caught ? { caseId: caught.caseId, step: caught.failure!.step, message: caught.failure!.message } : null,
    next: { ui: `tracegrove ui --dir ${shown}`, rerun: `tracegrove test --config ${relative(process.cwd(), configPath) || configPath}` } };

  const lines = [renderTree(report, folder, p, { next: false }), ''];
  if (bug) {
    lines.push(caught ? `${p.moss('✓ caught')} ${bug.what}: ${p.bold(caught.failure!.step)} failed with ${p.red(caught.failure!.message.split('\n')[0]!)}`
      : `${p.amber('!')} the ${bug.name} bug was switched on but no scenario failed; please report this as a tracegrove bug`);
  } else if (report.outcome === 'passed') {
    const first = example.bugs[0];
    if (first) lines.push(`${p.bold('Now break it:')}  ${p.moss(`tracegrove try ${example.name} --bug ${first.name}`)}  ${p.dim(first.what)}`);
  }
  if (report.cases.some((c) => c.failure?.message.includes('browser_unavailable'))) lines.push(`${p.amber('!')} Chromium isn't installed. Run ${p.moss('tracegrove setup browsers')} once, then try again.`);
  lines.push(`${p.bold('Use it on your app:')}  ${p.moss('tracegrove init')}`);
  input.write(facts, lines.join('\n'));

  // With a bug on, a failing run is the expected result: exit 0 when the bug was caught.
  const exitCode = bug ? (caught ? 0 : 1) : report.exitCode;
  if (!input.open || !interactive) return exitCode;
  const server = await startUi({ dir: folder, example: example.name, branch: null, ...(input.port ? { port: Number(input.port) } : {}) });
  process.stdout.write(`\n${p.bold('Look around:')} ${server.url}  ${p.dim('(Ctrl+C to stop)')}\n`);
  openBrowser(server.url);
  await new Promise<void>((done) => {
    const stop = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); void server.close().finally(done); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  });
  return exitCode;
}
