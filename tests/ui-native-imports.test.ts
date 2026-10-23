import { afterAll, beforeAll, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { request } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { nativeImportsReply } from '../src/authoring/uiImportsApi.ts';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { NativeObservationSnapshot } from '../src/imports/index.ts';
import { listNativeImports, readNativeImport, retainNativeImport } from '../src/authoring/nativeImports.ts';
import { localScope } from '../src/core/corpus.ts';
import { nativeReportsFixture } from './fixtures/nativeReports.ts';
import { runCli } from './fixtures/cli.ts';
import { parseArgs } from '../src/cli/arguments.ts';

let f: ReturnType<typeof nativeReportsFixture>, root: string, server: UiServer, browser: Browser, token: string;
let retained: ReturnType<typeof retainNativeImport>;
beforeAll(async () => {
  f = nativeReportsFixture(); root = mkdtempSync(join(f.root,'project-'));
  retained = retainNativeImport(root, NativeObservationSnapshot.open({ file:f.json, format:'playwright_json',scope:localScope(),artifactRoot:f.root }));
  server = await startUi({dir:root}); browser = await chromium.launch({headless:true});
  const html = await (await fetch(server.url)).text(); token = /const TOKEN='([^']+)'/.exec(html)![1]!;
},90000);
afterAll(async () => { await browser?.close(); await server?.close(); });
const endpoint = (path:string) => new URL(path,server.url);
const post = (body:string, query='format=junit_xml', headers:Record<string,string>={}) => fetch(endpoint('/api/imports?'+query),{
  method:'POST',headers:{'content-type':'application/octet-stream','x-tracegrove-token':token,...headers},body});

it('captures bytes without filesystem authority, retains idempotently, and detects damage on fresh read', () => {
  const bytes=readFileSync(f.json), snapshot=NativeObservationSnapshot.fromBytes(bytes,{format:'playwright_json',scope:localScope()});
  expect(snapshot.report.attachments.some(a=>a.state==='not_requested')).toBe(true);
  expect(()=>NativeObservationSnapshot.fromBytes(bytes,{format:'playwright_json',scope:localScope(),artifactRoot:f.root} as never)).toThrow();
  const project=mkdtempSync(join(f.root,'identity-')), first=retainNativeImport(project,snapshot);
  expect(retainNativeImport(project,snapshot).replayed).toBe(true);
  const source=join(project,'.tracegrove/imports',first.name,'source.bin');writeFileSync(source,'corrupt');
  expect(listNativeImports(project)).toHaveLength(1);expect(()=>readNativeImport(project,first.name)).toThrow();
  expect(()=>retainNativeImport(project,snapshot)).toThrow();
});

it('retains CLI captures into project history and requires exactly one destination', () => {
  expect(()=>parseArgs(['import-observations','--format','junit_xml','--input',f.xml])).toThrow();
  expect(()=>parseArgs(['import-observations','--format','junit_xml','--input',f.xml,'--into',root,'--output','other'])).toThrow();
  const cli=runCli(['import-observations','--format','junit_xml','--input',f.xml,'--into',root,'--artifact-root',f.root]);
  expect(cli.status,cli.stderr).toBe(0);expect(listNativeImports(root)).toHaveLength(2);
});

it('bounds and authenticates uploads; rejects path authority and unsafe names', async () => {
  expect((await post('bad')).status).toBe(422);
  expect((await post('bad','format=junit_xml',{'x-tracegrove-token':'invalid'})).status).toBe(403);
  expect((await post('bad','format=junit_xml',{'origin':'https://foreign.invalid'})).status).toBe(403);
  for(const query of ['format=junit_xml&format=junit_xml','format=junit_xml&artifactRoot=/tmp','format=junit_xml&producer=x'])expect((await post('bad',query)).status).toBe(400);
  const oversized=await new Promise<number>(resolve=>{const req=request(endpoint('/api/imports?format=junit_xml'),{method:'POST',headers:{'content-type':'application/octet-stream','x-tracegrove-token':token,'content-length':8*1024*1024+1}},res=>{res.resume();resolve(res.statusCode!)});req.end()});
  expect(oversized).toBe(413);
  expect((await fetch(endpoint('/api/imports/latest'))).status).toBe(400);
  symlinkSync(join(root,'.tracegrove/imports',retained.name),join(root,'.tracegrove/imports/linked'));
  expect((await fetch(endpoint('/api/imports/linked'))).status).toBe(409);
  expect(existsSync(join(root,'.tracegrove/ledger'))).toBe(false);
});

it('serves freshly checked source and opaque captured attachments without native HTML execution', async () => {
  const response=await fetch(endpoint('/api/imports/'+retained.name+'/source'));
  expect(Buffer.from(await response.arrayBuffer())).toEqual(readFileSync(f.json));
  expect(response.headers.get('content-disposition')).toContain('attachment');
  expect(response.headers.get('x-tracegrove-import-digest')).toBe(retained.report.ref.digest.hex);
  const trace=retained.report.attachments.find(a=>a.name==='trace'&&a.state==='captured')!;
  const asset=await fetch(endpoint('/api/imports/'+retained.name+'/artifact/'+trace.digest!.hex));
  expect(asset.headers.get('content-type')).toBe('application/octet-stream');expect(Buffer.from(await asset.arrayBuffer()).subarray(0,2).toString()).toBe('PK');
});

it('refuses publication if ownership closes while an upload body is being read',async()=>{
  const project=mkdtempSync(join(f.root,'closing-'));let writable=true;
  const reply=await nativeImportsReply({method:'POST',headers:{'content-type':'application/octet-stream'}} as IncomingMessage,
    new URL('http://localhost/api/imports?format=junit_xml'),{root:project,canWrite:()=>writable,readBytes:async()=>{writable=false;return readFileSync(f.xml)}});
  expect(reply.status).toBe(409);expect(listNativeImports(project)).toEqual([]);
});

it.each([1440,375])('inspects imports, filters, uses keyboard, downloads and reloads at %i pixels', async width => {
  const page=await browser.newPage({viewport:{width,height:950}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());
  try {
    await page.goto(endpoint('?native-import='+retained.name).href);
    await page.getByText('Producer not authenticated · qualification not evaluated',{exact:true}).waitFor();
    expect(await page.getByRole('region',{name:'Imported observations'}).getByRole('button').count()).toBe(9);
    await page.getByRole('textbox',{name:'Filter observations'}).fill('expected failure');
    const row=page.getByRole('region',{name:'Imported observations'}).getByRole('button');await row.click();
    await page.getByRole('complementary',{name:'Native observation detail'}).getByText('Expected: failed · Producer classification: expected',{exact:true}).waitFor();
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download native report',exact:true}).click();
    const download=await downloaded;expect(readFileSync((await download.path())!)).toEqual(readFileSync(f.json));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const qa=resolve('artifacts/qa');mkdirSync(qa,{recursive:true});await page.screenshot({path:join(qa,'imports-'+width+'.png'),fullPage:true});
    await page.reload();await page.getByRole('textbox',{name:'Filter observations'}).waitFor();
    await page.locator('.nav-tools > summary').focus();await page.keyboard.press('j');expect(await page.locator('[data-native-id][aria-pressed=true]').count()).toBe(1);
    await page.getByRole('combobox',{name:'Report format'}).selectOption('junit_xml');await page.getByLabel('Report file',{exact:true}).setInputFiles(f.xml);
    await page.getByRole('button',{name:'Import report',exact:true}).click();await page.getByText('6 matching observations',{exact:true}).waitFor();
    expect(errors).toEqual([]);expect(existsSync(join(root,'.tracegrove/runs'))).toBe(false);
  } finally {await page.close()}
},30000);

it('clears stale facts when archive corruption or network failure is discovered and retries inspection', async()=>{
  const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());
  try {await page.goto(endpoint('?native-import='+retained.name).href);await page.getByRole('textbox',{name:'Filter observations'}).waitFor();
    await page.route('**/api/imports',r=>r.abort());await page.getByRole('button',{name:'Refresh imports',exact:true}).click();await page.getByRole('alert').waitFor();
    expect(await page.getByRole('textbox',{name:'Filter observations'}).count()).toBe(0);
    await page.unroute('**/api/imports');await page.getByRole('button',{name:'Retry import inspection',exact:true}).click();await page.getByRole('textbox',{name:'Filter observations'}).waitFor();
    const source=join(root,'.tracegrove/imports',retained.name,'source.bin'),before=readFileSync(source);
    try{writeFileSync(source,'corrupt');await page.getByRole('button',{name:'Refresh imports',exact:true}).click();await page.getByRole('alert').waitFor();expect(await page.getByRole('textbox',{name:'Filter observations'}).count()).toBe(0)}finally{writeFileSync(source,before)}
  }finally{await page.close()}
});
