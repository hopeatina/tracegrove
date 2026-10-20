import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Real pinned Playwright JSON/JUnit producers, including counterevidence. No provider/model calls. */
export function nativeReportsFixture() {
  const qa = resolve('artifacts/qa'); mkdirSync(qa, { recursive: true });
  const root = mkdtempSync(join(qa, 'native-reports-'));
  const testModule = pathToFileURL(resolve('node_modules/playwright/test.mjs')).href;
  const config = join(root, 'playwright.config.mjs');
  const html = `<button onclick="this.textContent='Saved'">Save</button>`;
  writeFileSync(config, `export default { testDir: ${JSON.stringify(root)}, testMatch: 'native.spec.mjs', workers: 1, retries: 1,
    timeout: 1500, expect: { timeout: 200 }, outputDir: ${JSON.stringify(join(root, 'results'))},
    reporter: [['json', {outputFile: ${JSON.stringify(join(root, 'report.json'))}}], ['junit', {outputFile: ${JSON.stringify(join(root, 'report.xml'))}}]],
    use: {headless: true, trace: 'on', screenshot: 'only-on-failure'} };`);
  writeFileSync(join(root, 'native.spec.mjs'), `import {test, expect} from ${JSON.stringify(testModule)};
    test('native DOM pass', async ({page}) => { await page.setContent(${JSON.stringify(html)});
      await page.getByRole('button', {name: 'Save'}).click(); await expect(page.getByRole('button')).toHaveText('Saved'); });
    test('native retry retained', async ({page}, info) => { await page.setContent('<p>'+ (info.retry ? 'ready' : 'pending') +'</p>');
      await expect(page.locator('p')).toHaveText('ready'); });
    test('native failure retained', async () => { expect(1).toBe(2); });
    test('native expected failure', async () => { test.fail(); expect(1).toBe(2); });
    test.skip('native skipped', async () => {});
    test('native timeout', async () => { await new Promise(() => {}); });
  `);
  const process = spawnSync(globalThis.process.execPath, [resolve('node_modules/playwright/cli.js'), 'test', '--config', config],
    { cwd: root, encoding: 'utf8', timeout: 60000 });
  writeFileSync(join(root, 'producer-exit.json'), JSON.stringify({ status: process.status, signal: process.signal }));
  if (process.status !== 1) throw new Error(`Controlled native producer did not retain its expected failure: ${process.stderr.slice(0,300)}`);
  if (JSON.parse(readFileSync(join(root, 'report.json'), 'utf8')).errors.length) throw new Error('Native producer failed collection; inspect its retained report.');
  return { root, json: join(root, 'report.json'), xml: join(root, 'report.xml') };
}
