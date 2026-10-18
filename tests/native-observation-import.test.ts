import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JSONReport, JSONReportSuite, JSONReportTestResult } from 'playwright/types/testReporter';
import * as atomic from '../src/core/atomicFiles.ts';
import { NativeObservationSnapshot, exportImportedObservations, readImportedObservations } from '../src/imports/index.ts';
import { ImportedObservations, digestOfBytes, freeze } from '../src/protocol/index.ts';
import { localScope } from '../src/core/corpus.ts';
import { verifyBundle } from '../src/core/bundle.ts';
import { nativeReportsFixture } from './fixtures/nativeReports.ts';
import { runCli } from './fixtures/cli.ts';
import { parseArgs } from '../src/cli/arguments.ts';

let f: ReturnType<typeof nativeReportsFixture>;
beforeAll(() => { f = nativeReportsFixture(); }, 90000);
afterEach(() => vi.restoreAllMocks());
function jsonFile(value: unknown, name = 'custom.json') { const file = join(f.root, name); writeFileSync(file, JSON.stringify(value)); return file; }
function rawReport(): JSONReport { return JSON.parse(readFileSync(f.json, 'utf8')); }
function firstResult(report: JSONReport): JSONReportTestResult {
  const walk = (suites: JSONReportSuite[]): JSONReportTestResult | undefined => {
    for (const suite of suites) { const direct = suite.specs[0]?.tests[0]?.results[0]; if (direct) return direct;
      const nested = walk(suite.suites ?? []); if (nested) return nested; }
    return undefined;
  };
  const result = walk(report.suites); if (!result) throw new Error('native producer has no result'); return result;
}
function options(file = f.json) { return { file, format: 'playwright_json' as const, scope: localScope(), artifactRoot: f.root }; }
function output(name: string) { return join(mkdtempSync(join(f.root, name)), 'archive'); }

it('retains every real Playwright retry, failure, expected failure, skip, timeout and attachment without claiming verification', () => {
  const snapshot = NativeObservationSnapshot.open(options()), report = snapshot.report;
  expect(report.observations).toHaveLength(9);
  expect(report.observations.every(o => o.kind === 'attempt_result')).toBe(true);
  const outcomes = (title: string) => report.observations.filter(a => a.title === title).map(a => a.outcome);
  expect(outcomes('native retry retained')).toEqual(['failed', 'passed']);
  expect(outcomes('native failure retained')).toEqual(['failed', 'failed']);
  expect(outcomes('native timeout')).toEqual(['timed_out', 'timed_out']);
  expect(outcomes('native skipped')).toEqual(['skipped']);
  expect(report.observations.find(a => a.title === 'native expected failure')).toMatchObject({ outcome: 'failed', expectedOutcome: 'failed', producerClassification: 'expected' });
  expect(report.producer).toMatchObject({ name: 'playwright', version: '1.64.1', basis: 'reported' });
  expect(report).toMatchObject({ authority: 'none', issuerTrust: 'not_authenticated', qualification: 'not_evaluated', verificationVerdict: 'not_evaluated' });
  expect(report.source.digest).toEqual(digestOfBytes(readFileSync(f.json)));
  const trace = report.attachments.find(a => a.name === 'trace')!;
  expect(trace.state).toBe('captured'); expect(snapshot.artifact(trace.digest!).subarray(0,2).toString()).toBe('PK');
  const copied = snapshot.source(); copied.fill(0); expect(snapshot.source()).toEqual(readFileSync(f.json));
});

it('imports native JUnit with explicit missing retry/producer metadata and captures native attachment markers', () => {
  const snapshot = NativeObservationSnapshot.open({ ...options(f.xml), format: 'junit_xml' }), report = snapshot.report;
  expect(report.observations).toHaveLength(6); expect(report.warnings).toContain('retry_history_not_guaranteed');
  expect(report.observations.every(o => o.kind === 'testcase_summary')).toBe(true);
  expect(report.producer).toEqual({ name: null, version: null, basis: 'unavailable' });
  expect(report.observations.find(a => a.title === 'native failure retained')?.outcome).toBe('failed');
  expect(report.observations.find(a => a.title === 'native skipped')?.outcome).toBe('skipped');
  expect(report.attachments.length).toBeGreaterThan(0); expect(report.attachments.every(a => a.state === 'captured')).toBe(true);
});

it('publishes a re-readable private native archive and never accepts it as an execution bundle', () => {
  const snapshot = NativeObservationSnapshot.open(options()), target = output('export-');
  const retained = exportImportedObservations(snapshot, target); expect(retained.report).toEqual(snapshot.report);
  expect(readImportedObservations(target).report).toEqual(snapshot.report); expect(verifyBundle(target).ok).toBe(false);
  const trace = snapshot.report.attachments.find(a => a.name === 'trace')!;
  expect(retained.artifact(trace.digest!)).toEqual(snapshot.artifact(trace.digest!));
  expect(() => exportImportedObservations(snapshot, target)).toThrow('already exists');
});

it('refuses escaped/linked attachment reads and keeps missing/invalid/not-requested references explicit', () => {
  const raw = rawReport(), result = firstResult(raw), owned = join(f.root, 'owned.bin'); writeFileSync(owned, 'owned');
  const linked = join(f.root, 'linked.bin'); symlinkSync(owned, linked);
  result.attachments = [
    { name: 'outside', contentType: 'text/plain', path: '/etc/passwd' },
    { name: 'linked', contentType: 'text/plain', path: linked },
    { name: 'missing', contentType: 'text/plain', path: join(f.root, 'missing.bin') },
    { name: 'invalid', contentType: 'text/plain', body: 'not base64!' },
    { name: 'inline', contentType: 'text/plain', body: Buffer.from('inline').toString('base64') },
  ];
  const file = jsonFile(raw), report = NativeObservationSnapshot.open(options(file)).report;
  expect(report.attachments.slice(0,5).map(a => a.state)).toEqual(['refused', 'refused', 'missing', 'invalid', 'captured']);
  const withoutRoot = NativeObservationSnapshot.open({ file, format: 'playwright_json', scope: localScope() }).report;
  expect(withoutRoot.attachments[0]?.state).toBe('not_requested');
  expect(() => NativeObservationSnapshot.open({ ...options(), expectedSourceDigest: digestOfBytes('other') })).toThrow('could not be captured');
});

it.each(['projection', 'source', 'artifact'] as const)('refuses modified %s bytes, including a resealed forged normalized outcome', kind => {
  const snapshot = NativeObservationSnapshot.open(options()), target = output(`corrupt-${kind}-`); exportImportedObservations(snapshot, target);
  if (kind === 'projection') {
    const report = snapshot.report; report.observations.find(a => a.outcome === 'failed')!.outcome = 'passed';
    writeFileSync(join(target, 'import.json'), JSON.stringify(freeze(report)));
  }
  if (kind === 'source') writeFileSync(join(target, 'source.bin'), '{}');
  if (kind === 'artifact') writeFileSync(join(target, 'artifacts', snapshot.report.attachments.find(a => a.state === 'captured')!.digest!.hex), 'changed');
  expect(() => readImportedObservations(target)).toThrow('unavailable or invalid');
});

it('keeps explicit Surefire retry diagnostics, global errors and unsupported outcomes', () => {
  const file = join(f.root, 'variants.xml'); writeFileSync(file, `<testsuite tests="3"><error message="suite failed"/>
    <testcase name="flaky"><flakyFailure message="first failure"/></testcase>
    <testcase name="unknown"><customFailure/></testcase><testcase name="duplicate"><skipped/></testcase></testsuite>`);
  const report = NativeObservationSnapshot.open({ file, format: 'junit_xml', scope: localScope(), producer: { name: 'declared-runner', version: '1' } }).report;
  expect(report.observations.filter(a => a.title === 'flaky').map(a => a.outcome)).toEqual(['failed', 'passed']);
  expect(report.observations.filter(a => a.title === 'flaky').map(a => a.kind)).toEqual(['retry_diagnostic', 'testcase_summary']);
  expect(report.observations.find(a => a.title === 'unknown')?.outcome).toBe('unknown'); expect(report.globalErrorRefs).toHaveLength(1);
  expect(report.producer.basis).toBe('operator_declared'); expect(report.warnings).toContain('unsupported_junit_extension');
});

it('binds a Surefire retry attachment to that failed retry instead of the final passing observation', () => {
  const file = join(f.root, 'retry-attachment.xml'); writeFileSync(file,
    '<testsuite><testcase name="retry"><flakyFailure><system-out>[[ATTACHMENT|trace.zip]]</system-out></flakyFailure></testcase></testsuite>');
  const report = NativeObservationSnapshot.open({ file, format: 'junit_xml', scope: localScope() }).report;
  expect(report.attachments).toHaveLength(1);
  expect(report.attachments[0]!.observationId).toBe(report.observations.find(a => a.outcome === 'failed')!.id);
  expect(report.attachments[0]!.observationId).not.toBe(report.observations.find(a => a.outcome === 'passed')!.id);
});

it.each(['<!DOCTYPE testsuite [<!ENTITY ex SYSTEM "file:///etc/passwd">]><testsuite><testcase name="&ex;"/></testsuite>',
  '<testsuite><testcase name="one"></testsuite>', '<testsuite><testcase name="one" name="two"/></testsuite>',
  '<other/>', '<testsuite>'+ '<testsuite>'.repeat(101)+'</testsuite>'.repeat(102)])('rejects unsupported/malformed or over-depth XML without leaking its content', xml => {
  const file = join(f.root, 'invalid.xml'); writeFileSync(file, xml);
  expect(() => NativeObservationSnapshot.open({ file, format: 'junit_xml', scope: localScope() })).toThrow('Native report could not be captured');
});

it('cleans unpublished staging on write failure and never overwrites a preexisting or linked destination', () => {
  const snapshot = NativeObservationSnapshot.open(options()), target = output('write-failure-');
  vi.spyOn(atomic, 'writeExclusiveDurable').mockImplementation(() => { throw new Error('controlled disk failure'); });
  expect(() => exportImportedObservations(snapshot, target)).toThrow('controlled disk failure'); expect(existsSync(target)).toBe(false);
  expect(existsSync(`${target}.import-lock`)).toBe(false); vi.restoreAllMocks();
  const linked = join(f.root, 'dangling-output'); symlinkSync(join(f.root, 'absent-output'), linked);
  expect(() => exportImportedObservations(snapshot, linked)).toThrow('already exists');
});

it('retains missing, interrupted and duplicate native identities without silently filling retry history', () => {
  const raw = rawReport();
  const first = firstResult(raw); first.status = 'interrupted'; first.retry = 3;
  const file = jsonFile(raw, 'interrupted.json'), snapshot = NativeObservationSnapshot.open(options(file));
  expect(snapshot.report.observations[0]?.outcome).toBe('interrupted'); expect(snapshot.report.warnings).toContain('attempt_history_incomplete');
  const suite = raw.suites.find(s => s.specs.length)!; suite.specs.push(structuredClone(suite.specs[0]!));
  const test = suite.specs[0]!.tests[0]!; test.results = [];
  const duplicates = NativeObservationSnapshot.open(options(jsonFile(raw, 'duplicates.json'))).report;
  expect(duplicates.warnings).toContain('duplicate_reported_test_id'); expect(duplicates.warnings).toContain('no_attempts_for_test');
  expect(duplicates.observations.some(a => a.outcome === 'not_run')).toBe(true);
  expect(new Set(duplicates.observations.map(a => a.id)).size).toBe(duplicates.observations.length);
});

it('namespaces observation identities by native source bytes while identical captures retain their identity', () => {
  const first = NativeObservationSnapshot.open(options()).report;
  expect(NativeObservationSnapshot.open(options()).report.observations.map(a => a.id)).toEqual(first.observations.map(a => a.id));
  const changed = rawReport(); changed.config.metadata = { ...changed.config.metadata, sourceCopy: 'another-reported-run' };
  const second = NativeObservationSnapshot.open(options(jsonFile(changed, 'different-native-run.json'))).report;
  expect(second.observations[0]!.reportedTestId).toBe(first.observations[0]!.reportedTestId);
  expect(second.observations[0]!.id).not.toBe(first.observations[0]!.id);
});

it('reports valid empty native input as empty observations, never passing coverage', () => {
  const file = join(f.root, 'empty.xml'); writeFileSync(file, '<testsuite tests="0"/>');
  const report = NativeObservationSnapshot.open({ file, format: 'junit_xml', scope: localScope() }).report;
  expect(report.observations).toEqual([]); expect(report.warnings).toContain('empty_report'); expect(report.verificationVerdict).toBe('not_evaluated');
});

it('blocks report and attachment-count bounds instead of truncating evidence', () => {
  const huge = join(f.root, 'oversize.xml'); writeFileSync(huge, '<testsuite>'+ ' '.repeat(8*1024*1024) +'</testsuite>');
  expect(() => NativeObservationSnapshot.open({ file: huge, format: 'junit_xml', scope: localScope() })).toThrow('could not be captured');
  const raw = rawReport(); firstResult(raw).attachments = Array.from({ length: 1001 }, () => ({ name: 'extra', contentType: 'text/plain', body: '' }));
  expect(() => NativeObservationSnapshot.open(options(jsonFile(raw, 'too-many-attachments.json')))).toThrow('could not be captured');
});

it('bounds repeated attachment references even when their captured bytes deduplicate', () => {
  const asset = join(f.root, 'reference-budget.bin'); writeFileSync(asset, Buffer.alloc(8*1024*1024));
  const raw = rawReport(); firstResult(raw).attachments = Array.from({ length: 9 }, (_, index) => ({ name: `ref-${index}`, contentType: 'application/octet-stream', path: asset }));
  expect(() => NativeObservationSnapshot.open(options(jsonFile(raw, 'reference-budget.json')))).toThrow('could not be captured');
});

it('keeps unknown producer metadata explicit and rejects contradictory reported producer declarations', () => {
  expect(() => NativeObservationSnapshot.open({ ...options(), producer: { name: 'other', version: 'different' } })).toThrow('could not be captured');
  const file = join(f.root, 'known-producer.xml'); writeFileSync(file, '<testsuite><testcase name="one"/></testsuite>');
  const snapshot = NativeObservationSnapshot.open({ file, format: 'junit_xml', scope: localScope(), producer: { name: 'declared', version: '2' } });
  const archive = output('producer-'); exportImportedObservations(snapshot, archive);
  expect(readImportedObservations(archive).report.producer).toEqual({ name: 'declared', version: '2', basis: 'operator_declared' });
});

it('exposes typed import/inspection CLI output and reports successful import separately from the native producer failure', async () => {
  const target = output('cli-');
  const imported = await runCli(['import-observations', '--input', f.json, '--format', 'playwright_json', '--artifact-root', f.root, '--output', target]);
  expect(imported.status).toBe(0); const report = ImportedObservations.parse(JSON.parse(imported.stdout)); expect(report.observations).toHaveLength(9);
  const inspection = await runCli(['observations', '--archive', target]); expect(inspection.status).toBe(0);
  expect(JSON.parse(inspection.stdout)).toEqual(report);
  const prose = await runCli(['observations', '--archive', target], false); expect(prose.stdout).toContain('Producer-reported');
  expect(prose.stdout).toContain('verification not evaluated');
  expect(() => parseArgs(['import-observations', '--input', 'missing', '--format', 'junit_xml', '--output', 'out', '--producer', 'x'])).toThrow();
});

it('returns import-specific CLI recovery without copying native exception text or source content', async () => {
  const file = join(f.root, 'private-invalid.xml'); writeFileSync(file, '<testsuite secret="PRIVATE_SENTINEL">');
  const response = runCli(['import-observations', '--format', 'junit_xml', '--input', file, '--output', output('invalid-cli-')]);
  expect(response.status).toBe(2); expect(JSON.parse(response.stdout).reasons[0].code).toBe('native_report_invalid');
  expect(response.stdout).not.toContain('PRIVATE_SENTINEL'); expect(response.stdout).not.toContain(file);
  const absent = runCli(['observations', '--archive', join(f.root, 'missing-archive')]);
  expect(JSON.parse(absent.stdout).reasons[0].code).toBe('native_archive_invalid');
});
