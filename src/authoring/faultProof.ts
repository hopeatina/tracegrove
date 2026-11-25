import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';
import { z } from 'zod';
import { readBoundedFile } from '../core/boundedFile.ts';
import { readVerifiedBundle } from '../core/bundle.ts';
import { HostPlan, refKey } from '../protocol/index.ts';
import { runTests, type TestRunReport } from './run.ts';
import { readSavedRun } from './runSource.ts';
import { isRunDirectory, savedRunDirectory } from './runLocation.ts';
import { SavedRunName } from './runReport.ts';

const label = z.string().min(1).max(512);
const value = z.json();
const Fault = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), caseId: label, step: label, check: label, expected: value, got: value,
  env: z.record(z.string().regex(/^(?:[A-Z][A-Z0-9_]*_BUG|TRACEGROVE_FAULT_[A-Z0-9_]+)$/), z.string().min(1).max(256))
    .refine(env => Object.keys(env).length === 1, 'one fault switch per experiment'),
}).strict();
export type Fault = z.infer<typeof Fault>;
export function projectFaults(root: string): Fault[] {
  const file = join(root, 'tracegrove.faults.json');
  if (!existsSync(file)) return [];
  return z.array(Fault).max(100).refine(rows => new Set(rows.map(r => r.name)).size === rows.length, 'duplicate fault name')
    .parse(JSON.parse(readBoundedFile(file, 128 * 1024).toString()));
}

export function hasFaultAttempt(root: string, control: string, fault: Fault) {
  try { return existsSync(pointerFile(savedRunDirectory(root, control), fault)); } catch { return false; }
}
const Pointer = z.object({ storage: z.string().regex(/^attempt-[a-zA-Z0-9]{6}$/), run: SavedRunName }).strict();
function pointerFile(control: string, fault: Fault) { return join(control, 'fault-' + fault.name + '.json'); }

function evidence(runDir: string, fault: Fault) {
  const report = readSavedRun(runDir);
  if (!report.bundleVerified) throw new Error('Run evidence did not verify');
  const bundle = readVerifiedBundle(join(runDir, 'bundle'));
  if (bundle.manifestDigest.hex !== report.manifestDigest?.hex) throw new Error('Run changed during review');
  const receipt = bundle.receipts.find(r => r.caseRef.id === fault.caseId);
  const host = receipt && HostPlan.parse(bundle.documents[refKey(receipt.executionHostRef)]);
  const c = report.cases.find(c => c.caseId === fault.caseId);
  if (!receipt || !host?.launch || !c) throw new Error('The named case has no local launch evidence');
  const step = c.steps.find(s => s.id === fault.step);
  const check = step?.checked?.find(x => x.check === fault.check && equal(x.expected, fault.expected));
  return { report, receipt, env: host.launch.env, c, step, check };
}

export function inspectFault(root: string, controlName: string, fault: Fault) {
  const result = { name: fault.name, caseId: fault.caseId, step: fault.step, check: fault.check,
    caught: false, reason: '', control: controlName, faultRun: '', healthy: null as unknown, broken: null as unknown };
  try {
    const control = savedRunDirectory(root, controlName);
    const pointer = Pointer.parse(JSON.parse(readBoundedFile(pointerFile(control, fault), 1024).toString()));
    let dir = join(root, '.tracegrove');
    for (const part of ['challenges', pointer.storage, 'runs', pointer.run]) {
      dir = join(dir, part);
      if (!isRunDirectory(dir)) throw new Error('Fault evidence is unavailable');
    }
    result.faultRun = dir;
    const a = evidence(control, fault), b = evidence(dir, fault);
    result.healthy = a.check?.got ?? null;
    result.broken = b.check?.got ?? null;
    const [key, setting] = Object.entries(fault.env)[0]!;
    if (!a.report.sourceDigest || a.report.sourceDigest !== b.report.sourceDigest || a.receipt.caseRef.digest.hex !== b.receipt.caseRef.digest.hex)
      throw new Error('Source or case changed between runs');
    if (a.env[key] === setting || !equal({ ...a.env, ...fault.env }, b.env)) throw new Error('Fault switch does not distinguish the two launches');
    if (a.report.outcome !== 'passed' || a.check?.held !== true) throw new Error('Healthy control did not pass the named assertion');
    if (b.report.outcome !== 'assertion_failed' || b.c.outcome !== 'assertion_failed' || b.check?.held !== false ||
      b.step?.compared?.check !== fault.check || !equal(b.check.got, fault.got)) throw new Error('The fault did not fail the expected assertion with the specified observation');
    result.caught = true;
  } catch (e) { result.reason = e instanceof Error ? e.message : 'Evidence unavailable'; }
  return result;
}

export async function challengeFault(configPath: string, fault: Fault, control: TestRunReport, signal?: AbortSignal) {
  const root = dirname(configPath);
  if (control.outcome !== 'passed' || control.bundleVerified !== true || !control.cases.some(c => c.caseId === fault.caseId)) {
    return { report: control, proof: { name: fault.name, caseId: fault.caseId, step: fault.step, check: fault.check,
      caught: false, reason: 'Healthy control did not pass with verified evidence', control: basename(control.runDir), faultRun: '', healthy: null, broken: null } };
  }
  const parent = join(root, '.tracegrove', 'challenges');
  mkdirSync(parent, { recursive: true });
  const storage = mkdtempSync(join(parent, 'attempt-'));
  const { report } = await runTests({ configPath, caseIds: control.cases.map(c => c.caseId), fault: { storage, env: fault.env }, ...(signal ? { signal } : {}) });
  writeFileSync(pointerFile(control.runDir, fault), JSON.stringify({ storage: basename(storage), run: basename(report.runDir) }), { flag: 'wx' });
  return { report, proof: inspectFault(root, basename(control.runDir), fault) };
}
export type FaultProof = ReturnType<typeof inspectFault>;
export function proofTable(proofs: FaultProof[]): string {
  const cell = (v: unknown) => String(typeof v === 'string' ? v : JSON.stringify(v)).replace(/[|<>\r\n]/g, ' ').slice(0, 240);
  return ['| Fault | Assertion | Healthy | Fault enabled | Result |', '| --- | --- | --- | --- | --- |',
    ...proofs.map(p => '| ' + [p.name, p.check, p.healthy, p.broken, p.caught ? 'Caught' : p.reason].map(cell).join(' | ') + ' |')].join('\n');
}
