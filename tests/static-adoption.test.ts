import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { compileProject } from '../src/authoring/compile.ts';
import { detect, initProject } from '../src/authoring/init.ts';
import { staticPage } from '../src/authoring/staticPage.ts';
import { recordedTransition } from '../src/cli/record.ts';
import { runTests } from '../src/authoring/run.ts';
import type { FlowStep } from '../src/authoring/schema.ts';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'tg-adoption-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('static site adoption', () => {
  it('resolves HTML and CSS against their own base, including built assets, and reports broken references', () => {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'index.html'), '<base href="/dist/"><title>Shop &amp; cart</title><link href="site.css" rel="stylesheet"><script src="missing.js"></script><script src="https://example.org/plugin.js"></script>');
    writeFileSync(join(root, 'dist/site.css'), 'body {background:url(product.svg)}');
    writeFileSync(join(root, 'dist/product.svg'), '<svg/>');
    expect(staticPage(root, 'index.html')).toMatchObject({ title: 'Shop & cart',
      assets: ['dist/product.svg', 'dist/site.css', 'index.html'], missingRequired: ['dist/missing.js'], externalOrigins: ['https://example.org'] });
    const init = initProject(root);
    expect(init.detection.adapter).toBe('static');
    expect(() => compileProject(join(root, 'tracegrove.config.yaml'))).toThrow(/missing/i);
  });
  it('serves admitted bytes and returns 404 for unlisted files under the same public folder', async () => {
    writeFileSync(join(root, 'index.html'), '<title>Account</title><script src="account.js"></script>');
    writeFileSync(join(root, 'account.js'), '/* checked */');
    writeFileSync(join(root, 'private.json'), '{"private":true}');
    symlinkSync('private.json', join(root, 'alias.json'));
    const { files } = initProject(root, { staticEntry: 'index.html', expectedTitle: 'Ready' });
    expect(parse(readFileSync(files[1]!, 'utf8')).steps[1].expect.text).toBe('Ready');
    expect(() => staticPage(root, 'index.html', ['alias.json'])).toThrow();
    writeFileSync(join(root, 'tracegrove/assets.flow.yaml'), JSON.stringify({ title: 'Asset boundaries', as: 'none', steps: [
      { HEAD: '/account.js', expect: 200 }, { GET: '/private.json', expect: 404 }, { GET: '/alias.json', expect: 404 },
    ] }));
    const { report } = await runTests({ configPath: files[0]!, caseIds: ['assets'] });
    expect([report.outcome, report.bundleVerified]).toEqual(['passed', true]);
  });
  it('qualifies a Flask application factory and preserves a real Node entry beside a static page', () => {
    writeFileSync(join(root, 'app.py'), 'def create_app():\n    return Flask(__name__)');
    expect(detect(root)).toMatchObject({ adapter: 'flask', entry: 'app:create_app' });
    rmSync(join(root, 'app.py'));
    writeFileSync(join(root, 'package.json'), '{"main":"server.js"}');
    writeFileSync(join(root, 'server.js'), '');
    writeFileSync(join(root, 'index.html'), '<title>Site</title>');
    expect(detect(root).adapter).toBe('node');
  });
  it('requires a changed observation on a separate control in a recorded static flow', () => {
    const observe = (text: string): FlowStep => ({ browser: { kind: 'read', target: { by: 'id', name: 'quantity', property: 'value' } }, expect: { text } });
    const plus: FlowStep = { browser: { kind: 'click', target: { by: 'id', name: 'plus' } } };
    const fill: FlowStep = { browser: { kind: 'fill', target: { by: 'id', name: 'quantity' }, value: '2' } };
    expect(recordedTransition([observe('1'), plus, observe('2')])).toBe(true);
    expect(recordedTransition([observe('1'), plus, observe('1')])).toBe(false);
    expect(recordedTransition([observe('1'), fill, observe('2')])).toBe(false);
  });
});
