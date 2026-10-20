/**
 * `tracegrove setup browsers`: install exactly the browser pieces this Playwright version pins (its
 * headless shell and ffmpeg build), then prove them with the same one-second recording doctor makes.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { probeBrowser, type BrowserProbe } from '../adapters/browser/probe.ts';

export type SetupResult = {
  install: { command: string[]; ran: boolean; exitCode: number | null } | null;
  probe: BrowserProbe | null;
};

export async function setupBrowsers(options: { dryRun?: boolean; checkOnly?: boolean; onOutput?: ((chunk: string) => void) | undefined }): Promise<SetupResult> {
  let install: SetupResult['install'] = null;
  if (!options.checkOnly) {
    let cli: string;
    // The CLI that ships with the installed playwright package pins the matching browser builds.
    try { cli = join(dirname(createRequire(import.meta.url).resolve('playwright/package.json')), 'cli.js'); }
    catch { cli = 'playwright'; }
    const command = [process.execPath, cli, 'install', '--only-shell', 'chromium', 'ffmpeg'];
    if (options.dryRun) install = { command, ran: false, exitCode: null };
    else {
      const exitCode = await new Promise<number>((done) => {
        const child = spawn(command[0]!, command.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
        const relay = (chunk: Buffer) => options.onOutput?.(chunk.toString());
        child.stdout.on('data', relay); child.stderr.on('data', relay);
        child.on('error', () => done(127));
        child.on('close', (code) => done(code ?? 1));
      });
      install = { command, ran: true, exitCode };
    }
  }
  return { install, probe: options.dryRun ? null : await probeBrowser() };
}
