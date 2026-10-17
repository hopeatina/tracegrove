import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cleanupTemps, planSample, runSample, sampleCopy } from '../conformance/helpers.ts';
import { exportVerifiedBundle, verifyBundle } from '../src/core/bundle.ts';
import { LocalArtifactStore } from '../src/core/artifacts.ts';
import { digestOfBytes } from '../src/protocol/index.ts';
import * as files from '../src/core/atomicFiles.ts';

let root: string;
let source: string;
let sequence = 0;
const output = () => join(root, `export-${++sequence}`);
beforeAll(async () => {
  const sample = sampleCopy(); root = sample.root;
  source = (await runSample(planSample(sample.configPath), sample.stateDir)).executionDir;
});
afterEach(() => vi.restoreAllMocks());
afterAll(cleanupTemps);

it('atomically exports the verified sealed snapshot and excludes unlisted private files', () => {
  mkdirSync(join(source, 'private'), { recursive: true });
  writeFileSync(join(source, 'private', 'secret.txt'), 'not sealed');
  const target = output();
  expect(exportVerifiedBundle(source, target)).toMatchObject({ ok: true, outcome: 'passed' });
  expect(verifyBundle(target).ok).toBe(true);
  expect(existsSync(join(target, 'private'))).toBe(false);
  expect(readFileSync(join(target, 'manifest.json'))).toEqual(readFileSync(join(source, 'manifest.json')));
  expect(readdirSync(root).filter(name => name.includes('.publish.lock') || name.startsWith('.tracegrove-publish-'))).toEqual([]);
});

it('never merges into or overwrites an existing output', () => {
  const target = output(); mkdirSync(target); writeFileSync(join(target, 'keep'), 'existing');
  expect(() => exportVerifiedBundle(source, target)).toThrow('already exists');
  expect(readdirSync(target)).toEqual(['keep']);
});

it('rejects corrupt source evidence before exposing an output directory', () => {
  const invalid = output(); cpSync(source, invalid, { recursive: true });
  writeFileSync(join(invalid, 'campaign.json'), '{}');
  const target = output();
  expect(exportVerifiedBundle(invalid, target).ok).toBe(false);
  expect(existsSync(target)).toBe(false);
});

it('exports the same verified snapshot if source bytes change during publication', () => {
  const mutable = output(); cpSync(source, mutable, { recursive: true });
  const write = files.writeExclusiveDurable;
  vi.spyOn(files, 'writeExclusiveDurable').mockImplementationOnce((path, bytes) => {
    writeFileSync(join(mutable, 'campaign.json'), '{}'); write(path, bytes);
  });
  const target = output();
  expect(exportVerifiedBundle(mutable, target).ok).toBe(true);
  expect(verifyBundle(mutable).ok).toBe(false);
  expect(verifyBundle(target).ok).toBe(true);
});

it('keeps output absent and removes owned staging after a payload write failure', () => {
  vi.spyOn(files, 'writeExclusiveDurable').mockImplementationOnce(() => { throw new Error('injected write failure'); });
  const target = output();
  expect(() => exportVerifiedBundle(source, target)).toThrow('injected write failure');
  expect(existsSync(target)).toBe(false);
  expect(readdirSync(root).filter(name => name.includes('.publish.lock') || name.startsWith('.tracegrove-publish-'))).toEqual([]);
});

it('reports uncertainty after publication if parent-directory durability cannot be confirmed', () => {
  const sync = files.syncDirectory;
  vi.spyOn(files, 'syncDirectory').mockImplementation(path => {
    if (path === root) throw new Error('injected sync failure');
    sync(path);
  });
  const target = output();
  expect(() => exportVerifiedBundle(source, target)).toThrow('durability is unconfirmed');
  expect(verifyBundle(target).ok).toBe(true);
  expect(() => exportVerifiedBundle(source, target)).toThrow('already exists');
});

it('rejects symlink parents and refuses to break an existing publication lock', () => {
  const actual = output(); mkdirSync(actual);
  const link = output(); symlinkSync(actual, link);
  expect(() => exportVerifiedBundle(source, join(link, 'bundle'))).toThrow('real owned directory');
  const target = output(); const lock = join(root, `.${target.split('/').at(-1)}.publish.lock`); mkdirSync(lock);
  expect(() => exportVerifiedBundle(source, target)).toThrow('publication is locked');
  expect(existsSync(lock)).toBe(true);
});

it('admits exactly one of two independent processes publishing the same destination', async () => {
  const target = output();
  const code = 'import {exportVerifiedBundle} from "./src/core/bundle.ts"; try {const r=exportVerifiedBundle(process.argv[1],process.argv[2]);console.log(JSON.stringify(r));process.exitCode=r.ok?0:2;} catch {process.exitCode=3;}';
  const run = () => promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, source, target], { cwd: join(import.meta.dirname, '..') });
  const results = await Promise.allSettled([run(), run()]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(verifyBundle(target).ok).toBe(true);
});

it('survives actual writer death without publishing partial bytes or automatically breaking its lock', async () => {
  const parent = output(); mkdirSync(parent); const target = join(parent, 'bundle');
  const code = 'import fs from "node:fs";import{syncBuiltinESMExports}from"node:module";const write=fs.writeFileSync;fs.writeFileSync=(...args)=>{write(...args);process.kill(process.pid,"SIGKILL")};syncBuiltinESMExports();const{exportVerifiedBundle}=await import("./src/core/bundle.ts");exportVerifiedBundle(process.argv[1],process.argv[2]);';
  const result = await Promise.allSettled([promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, source, target], { cwd: join(import.meta.dirname, '..') })]);
  expect(result[0]?.status).toBe('rejected');
  if (result[0]?.status === 'rejected') expect(result[0].reason.signal).toBe('SIGKILL');
  expect(existsSync(target)).toBe(false);
  expect(readdirSync(parent).some(name => name.startsWith('.tracegrove-publish-'))).toBe(true);
  expect(() => exportVerifiedBundle(source, target)).toThrow('publication is locked');
  expect(verifyBundle(target).ok).toBe(false);
});

it('publishes immutable content-addressed objects, detects corruption and never follows object links', () => {
  const store = new LocalArtifactStore(join(root, 'artifact-store'));
  const bytes = Buffer.from('captured native bytes');
  const digest = digestOfBytes(bytes);
  const input = { id: 'capture', bytes, mediaType: 'text/plain', producerRef: { id: 'producer', revision: '1', digest }, stepIds: ['observe'], from: '2026-10-17T00:00:00Z', to: '2026-10-17T00:00:01Z' };
  store.put(input); store.put(input);
  expect(store.read(digest)).toEqual(bytes);
  writeFileSync(store.objectPath(digest.hex), 'corrupt');
  expect(store.verify(digest)).toBe(false);
  expect(() => store.put(input)).toThrow('digest mismatch');
  expect(readFileSync(store.objectPath(digest.hex), 'utf8')).toBe('corrupt');
  const linked = digestOfBytes(Buffer.from('linked'));
  symlinkSync(store.objectPath(digest.hex), store.objectPath(linked.hex));
  expect(store.verify(linked)).toBe(false);
  expect(() => store.objectPath('../escape')).toThrow('invalid artifact digest');
  expect(readdirSync(join(store.root, 'objects', 'sha256')).some(name => name.startsWith('.pending-'))).toBe(false);
});

it('rejects an existing symlink ancestor before creating directories in its target', () => {
  const outside = output(); mkdirSync(outside); const link = output(); symlinkSync(outside, link);
  expect(() => new LocalArtifactStore(join(link, 'store'))).toThrow('real owned directory');
  expect(() => files.createDurableDirectory(join(link, 'output-parent'))).toThrow('real owned directory');
  expect(readdirSync(outside)).toEqual([]);
});

it('the public CLI exports a verified snapshot and rejects linked parents before mkdir effects', async () => {
  const target = output(); const executionId = basename(source); const stateDir = dirname(dirname(source));
  const run = (destination: string) => promisify(execFile)(process.execPath, ['--import', 'tsx', 'src/cli/main.ts', 'export', '--state-dir', stateDir, '--execution', executionId, '--output', destination, '--json'], { cwd: join(import.meta.dirname, '..') });
  const result = await run(target);
  expect(JSON.parse(result.stdout)).toMatchObject({ published: true, verification: { ok: true } });
  expect(verifyBundle(target).ok).toBe(true);
  const outside = output(); mkdirSync(outside); const link = output(); symlinkSync(outside, link);
  await expect(run(join(link, 'new-parent', 'bundle'))).rejects.toThrow();
  expect(readdirSync(outside)).toEqual([]);
});
