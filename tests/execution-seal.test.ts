import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanupTemps, planSample, runSample, sampleCopy } from '../conformance/helpers.ts';
import { readVerifiedBundle, verifyBundle, writeExecutionBundle } from '../src/core/bundle.ts';
import { BundleSnapshot } from '../src/core/bundleSnapshot.ts';
import { freeze } from '../src/protocol/index.ts';
import * as files from '../src/core/atomicFiles.ts';

let root: string; let source: string; let sequence = 0;
let frozenInput: Omit<Parameters<typeof writeExecutionBundle>[0], 'dir'>;
const target = () => join(root, `source-seal-${++sequence}`);
function prepared() { const dir = target(); mkdirSync(dir); cpSync(join(source, 'cells'), join(dir, 'cells'), { recursive: true }); return dir; }
beforeAll(async () => {
  const sample = sampleCopy(); root = sample.root;
  const bundle = planSample(sample.configPath);
  const summary = await runSample(bundle, sample.stateDir);
  source = summary.executionDir;
  const records = readVerifiedBundle(source);
  frozenInput = { bundle, request: records.request, selection: records.selection, receipts: records.receipts, campaign: records.campaign };
});
afterEach(() => vi.restoreAllMocks());
afterAll(cleanupTemps);

it('persists and reduces the original candidate before exclusively publishing its existing-format manifest', () => {
  const dir = prepared();
  const syncFile = vi.spyOn(files, 'syncRegularFile');
  writeExecutionBundle({ ...frozenInput, dir });
  expect(syncFile).toHaveBeenCalledWith(join(dir, 'request.json'));
  expect(verifyBundle(dir)).toMatchObject({ ok: true, outcome: 'passed' });
  expect(readVerifiedBundle(dir).request.ref).toEqual(frozenInput.request!.ref);
  expect(readdirSync(dir).some(name => name.startsWith('.bundle-'))).toBe(false);
  const manifest = readFileSync(join(dir, 'manifest.json'));
  expect(() => writeExecutionBundle({ ...frozenInput, dir })).toThrow('already sealed');
  expect(readFileSync(join(dir, 'manifest.json'))).toEqual(manifest);
});

it('does not make an internal candidate readable as a committed public bundle', () => {
  const dir = target(); cpSync(source, dir, { recursive: true });
  const manifest = readFileSync(join(dir, 'manifest.json')); rmSync(join(dir, 'manifest.json'));
  expect(BundleSnapshot.fromCandidateManifest(dir, manifest).json('request.json')).toMatchObject({ ref: frozenInput.request!.ref });
  expect(verifyBundle(dir).ok).toBe(false);
  expect(() => readVerifiedBundle(dir)).toThrow('manifest.json');
});

it('retains incomplete records and refuses automatic retry after a payload write failure', () => {
  const dir = prepared();
  vi.spyOn(files, 'writeExclusiveDurable').mockImplementationOnce(() => { throw new Error('injected payload write failure'); });
  expect(() => writeExecutionBundle({ ...frozenInput, dir })).toThrow('injected payload write failure');
  expect(existsSync(join(dir, 'manifest.json'))).toBe(false);
  expect(existsSync(join(dir, '.bundle-write.lock'))).toBe(true);
  expect(verifyBundle(dir).ok).toBe(false);
  expect(() => writeExecutionBundle({ ...frozenInput, dir })).toThrow('locked');
});

it('leaves the manifest absent after payload fsync failure and preserves existing corrupt files', () => {
  const dir = prepared();
  vi.spyOn(files, 'syncRegularFile').mockImplementationOnce(() => { throw new Error('injected payload fsync failure'); });
  expect(() => writeExecutionBundle({ ...frozenInput, dir })).toThrow('injected payload fsync failure');
  expect(existsSync(join(dir, 'manifest.json'))).toBe(false);
  const existing = prepared(); writeFileSync(join(existing, 'request.json'), 'corrupt preexisting payload');
  expect(() => writeExecutionBundle({ ...frozenInput, dir: existing })).toThrow('EEXIST');
  expect(readFileSync(join(existing, 'request.json'), 'utf8')).toBe('corrupt preexisting payload');
});

it('rejects payload corruption during manifest staging before publishing any commit marker', () => {
  const dir = prepared(); const write = files.writeExclusiveDurable;
  vi.spyOn(files, 'writeExclusiveDurable').mockImplementation((path, bytes) => {
    write(path, bytes);
    if (path.endsWith('/manifest.json')) writeFileSync(join(dir, 'campaign.json'), '{}');
  });
  expect(() => writeExecutionBundle({ ...frozenInput, dir })).toThrow(/hash mismatch .*campaign\.json/);
  expect(existsSync(join(dir, 'manifest.json'))).toBe(false);
  expect(readdirSync(dir).some(name => name.startsWith('.bundle-pending-'))).toBe(true);
  expect(verifyBundle(dir).ok).toBe(false);
});

it('rejects a complete hash-consistent candidate whose reduction conflicts with its frozen records', () => {
  const dir = prepared();
  const campaign = freeze({ ...frozenInput.campaign!, outcome: 'assertion_failed' as const });
  expect(() => writeExecutionBundle({ ...frozenInput, dir, campaign })).toThrow('campaign outcome assertion_failed but re-reduction gives passed');
  expect(existsSync(join(dir, 'manifest.json'))).toBe(false);
  expect(verifyBundle(dir).ok).toBe(false);
});

it('reports publication uncertainty if the commit directory fsync fails after the manifest link', () => {
  const dir = prepared(); const sync = files.syncDirectory;
  vi.spyOn(files, 'syncDirectory').mockImplementation(path => {
    if (path === dir && existsSync(join(dir, 'manifest.json'))) throw new Error('injected commit fsync failure');
    sync(path);
  });
  expect(() => writeExecutionBundle({ ...frozenInput, dir })).toThrow('published but final directory/lock durability is unconfirmed');
  expect(verifyBundle(dir).ok).toBe(true);
  expect(existsSync(join(dir, '.bundle-write.lock'))).toBe(true);
  expect(() => writeExecutionBundle({ ...frozenInput, dir })).toThrow('already sealed');
});

it.each(['before', 'after'])('survives actual process death %s manifest publication with an explicit commit boundary', async point => {
  const dir = prepared(); const inputPath = `${dir}.input.json`; writeFileSync(inputPath, JSON.stringify(frozenInput));
  const code = `import fs from 'node:fs';import{join}from'node:path';import{syncBuiltinESMExports}from'node:module';
const dir=process.argv[1],point=process.argv[3];let linked=false;const link=fs.linkSync,sync=fs.fsyncSync;
fs.linkSync=(...args)=>{if(args[1]===join(dir,'manifest.json')&&point==='before')process.kill(process.pid,'SIGKILL');link(...args);if(args[1]===join(dir,'manifest.json'))linked=true;};
fs.fsyncSync=fd=>{sync(fd);if(linked&&point==='after'&&fs.fstatSync(fd).isDirectory())process.kill(process.pid,'SIGKILL');};syncBuiltinESMExports();
const{writeExecutionBundle}=await import('./src/core/bundle.ts');writeExecutionBundle({...JSON.parse(fs.readFileSync(process.argv[2],'utf8')),dir});`;
  const result = await Promise.allSettled([promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, dir, inputPath, point], { cwd: join(import.meta.dirname, '..') })]);
  expect(result[0]?.status).toBe('rejected');
  if (result[0]?.status === 'rejected') expect(result[0].reason.signal).toBe('SIGKILL');
  expect(existsSync(join(dir, 'manifest.json'))).toBe(point === 'after');
  expect(verifyBundle(dir).ok).toBe(point === 'after');
  expect(existsSync(join(dir, '.bundle-write.lock'))).toBe(true);
  expect(readdirSync(dir).some(name => name.startsWith('.bundle-pending-'))).toBe(true);
  expect(() => writeExecutionBundle({ ...frozenInput, dir })).toThrow(point === 'after' ? 'already sealed' : 'incomplete execution seal');
});

it('rejects linked parents before creating a source tree in their target', () => {
  const outside = target(); mkdirSync(outside); const link = target(); symlinkSync(outside, link);
  expect(() => writeExecutionBundle({ ...frozenInput, dir: join(link, 'execution') })).toThrow('real owned directory');
  expect(readdirSync(outside)).toEqual([]);
});
