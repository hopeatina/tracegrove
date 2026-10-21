/**
 * `tracegrove grow` in a terminal: the framed bonsai redrawn in place while events arrive, a mode
 * choice by keypress (1, 2, 3, Enter), plain progress lines when output is piped, and the raw event
 * stream with --jsonl.
 */
import { grow, type GrowOptions } from '../authoring/grow.ts';
import { type GrowState, type Mode } from '../authoring/growState.ts';
import { plainLine, renderGrove } from './renderGrove.ts';
import { relative, resolve } from 'node:path';

export type GrowFlags = { dir?: string | undefined; branch?: string | undefined; base?: string | undefined; spec?: string | undefined; mode?: string | undefined; config?: string | undefined;
  agent?: string | undefined; model?: string | undefined; 'no-agent'?: boolean | undefined; 'no-prove'?: boolean | undefined; 'no-gh'?: boolean | undefined;
  jsonl?: boolean | undefined; json?: boolean | undefined; yes?: boolean | undefined };

const MODE_NAMES: Record<string, Mode> = { min: 'min', minimum: 'min', std: 'std', standard: 'std', max: 'max', maximum: 'max' };
export const modeOf = (name: string | undefined): Mode | null => (name ? MODE_NAMES[name.toLowerCase()] ?? null : null);

export async function growCommand(flags: GrowFlags, write: (text: string) => void = (t) => process.stdout.write(t)): Promise<{ code: number; state: GrowState; log: string | null }> {
  const out = process.stdout;
  const tty = !!out.isTTY && !flags.json && !flags.jsonl;
  const color = tty && !process.env.NO_COLOR;
  const mode = modeOf(flags.mode);
  const prove = flags['no-prove'] !== true;
  const controller = new AbortController();
  const dir = resolve(flags.dir ?? '.');
  const t0 = Date.now();
  let state: GrowState | null = null; let lastLines = 0; let picking: Mode | null = null; let log: string | null = null; let timer: NodeJS.Timeout | null = null;
  const draw = (final = false) => {
    if (!state) return;
    const lines = renderGrove(state, { width: out.columns ?? 120, ...(final ? {} : { height: (out.rows ?? 60) - 1 }), elapsed: Date.now() - t0, color, picking, log });
    write(`${lastLines ? `\x1b[${lastLines}F\x1b[J` : ''}${lines.join('\n')}\n`);
    lastLines = final ? 0 : lines.length;
  };
  const stop = () => controller.abort();
  if (tty) { write('\x1b[?25l'); process.once('SIGINT', stop); timer = setInterval(() => draw(), 80); }

  const options: GrowOptions = {
    dir, branch: flags.branch ?? null, base: flags.base ?? null, spec: flags.spec ?? null, mode, prove, config: flags.config ?? null, gh: flags['no-gh'] !== true, signal: controller.signal,
    agent: { off: flags['no-agent'] === true, provider: flags.agent ?? null, model: flags.model ?? null },
    // Ask in an interactive terminal: 1, 2, 3 pick, Enter proves, q stops. Pipes and --yes keep the suggestion.
    ...(tty && process.stdin.isTTY && !mode && !flags.yes ? { chooseMode: (counts: Record<Mode, number>) => new Promise<Mode | null>((done) => {
      picking = counts.min ? 'min' : 'std';
      const stdin = process.stdin; stdin.setRawMode(true); stdin.resume();
      const onKey = (key: Buffer) => {
        const k = key.toString();
        if (k === '1' || k === '2' || k === '3') { picking = (['min', 'std', 'max'] as const)[Number(k) - 1]!; draw(); return; }
        if (k !== '\r' && k !== '\n' && k !== 'q' && k !== '\x03') return;
        stdin.off('data', onKey); stdin.setRawMode(false); stdin.pause();
        if (k === 'q' || k === '\x03') { controller.abort(); done(null); } else done(picking);
        picking = null;
      };
      stdin.on('data', onKey);
    }) } : {}),
  };
  const result = await grow(options, (event, s) => {
    state = s;
    if (flags.jsonl) { write(`${JSON.stringify(event)}\n`); return; }
    if (!tty && !flags.json) { const line = plainLine(s, event); if (line) write(`${line}\n`); }
  });
  state = result.state; log = result.log ? relative(dir, result.log) : null;
  if (tty) {
    // Let the last limbs finish growing, then print the whole frame once.
    const settle = Math.max(0, ...result.state.units.map((u) => u.foundAt + 1200)) - (Date.now() - t0);
    if (settle > 0) await new Promise((r) => setTimeout(r, Math.min(settle, 1500)));
    if (timer) clearInterval(timer);
    draw(true); write('\x1b[?25h'); process.off('SIGINT', stop);
  } else if (!flags.json && !flags.jsonl) write(`${renderGrove(result.state, { width: 118, elapsed: result.state.ms + 5000, clock: result.state.ms, color: false, log }).join('\n')}\n`);
  const s = result.state;
  const code = s.blocked ? (s.blocked.code === 'discovery_cancelled' ? 4 : 2) : s.done && s.done.failed > 0 ? 1 : 0;
  return { code, state: s, log };
}
