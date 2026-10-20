/**
 * Run the README's first command exactly as a reader would (`tracegrove try <example>`) against the
 * built CLI, then check the outcome, the evidence and cleanup from the files it left. Also runs the
 * bug variant the README advertises and requires it to be caught. Not a clean dependency-install claim.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { verifyBundle, readVerifiedBundle } from '../dist/index.js';

const root = resolve(import.meta.dirname, '..');
const cli = join(root, 'dist', 'cli', 'main.js');
const output = join(root, 'artifacts', 'qa', 'readme-onboarding'); mkdirSync(output, { recursive: true });
const readme = readFileSync(join(root, 'README.md'), 'utf8');
// The README's first command and its "break it" command are the journeys under test.
const first = readme.match(/npx tracegrove try ([a-z-]+)\n/)?.[1];
const broken = readme.match(/npx tracegrove try ([a-z-]+) --bug ([a-z_]+)/);
assert.ok(first, 'README must lead with `npx tracegrove try <example>`');
assert.ok(broken, 'README must show `npx tracegrove try <example> --bug <name>`');

const cleanupOf = (bundle) => readVerifiedBundle(bundle).receipts.map(r => ({ executionId: r.executionId, attempted: r.cleanup.attempted, confirmed: r.cleanup.confirmed,
  remainingUnknownMutations: r.cleanup.remainingUnknownMutations, critical: r.cleanup.critical, reasonCodes: r.cleanup.reasonCodes }));
const confirmed = (cleanup) => cleanup.length > 0 && cleanup.every(c => [...c.attempted, ...c.critical].every(id => c.confirmed.includes(id)) && !c.remainingUnknownMutations && !c.reasonCodes.length);

async function journey(label, args) {
  const cwd = mkdtempSync(join(tmpdir(), `tracegrove-try-${label}-`));
  const started = Date.now();
  let stdout = '', stderr = '', exitCode = 0;
  try { ({ stdout, stderr } = await promisify(execFile)(process.execPath, [cli, 'try', ...args, '--json'], { cwd, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })); }
  catch (error) { stdout = String(error.stdout ?? ''); stderr = String(error.stderr ?? ''); exitCode = typeof error.code === 'number' ? error.code : -1; }
  writeFileSync(join(output, `${label}-stdout.txt`), stdout, { mode: 0o600 });
  writeFileSync(join(output, `${label}-stderr.txt`), stderr, { mode: 0o600 });
  const facts = JSON.parse(stdout);
  assert.equal(facts.schemaVersion, 'tracegrove.try/v1');
  // The CI runner's temp folder disappears; retain the run and verify the exported copy.
  const exportedRunDir = join(output, `${label}-${basename(facts.runDir)}`);
  cpSync(facts.runDir, exportedRunDir, { recursive: true, errorOnExist: true, force: false });
  const verification = verifyBundle(join(exportedRunDir, 'bundle'));
  const cleanup = cleanupOf(join(exportedRunDir, 'bundle'));
  rmSync(cwd, { recursive: true, force: true });
  return { label, command: `tracegrove try ${args.join(' ')}`, exitCode, elapsedSeconds: (Date.now() - started) / 1000, outcome: facts.outcome, caught: facts.caught,
    bundleVerified: facts.bundleVerified, exportedBundleVerified: verification.ok, exportedOutcome: verification.outcome ?? null, exportedRunDir, cleanupConfirmed: confirmed(cleanup), cleanup };
}

const passing = await journey('first-use', [first]);
const bug = await journey('bug-caught', [broken[1], '--bug', broken[2]]);
const receipt = { schemaVersion: 'tracegrove.readme-onboarding-receipt/v2', node: process.version, platform: process.platform, journeys: [passing, bug],
  limit: 'The README commands run with the existing build and dependencies; independent clean-room setup is separate. No portable profile/host qualification.' };
writeFileSync(join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ first: passing.command, outcome: passing.outcome, bug: bug.command, caught: bug.caught }));
if (passing.exitCode !== 0 || passing.outcome !== 'passed' || !passing.bundleVerified || !passing.exportedBundleVerified || !passing.cleanupConfirmed) throw new Error('README first-use journey failed; inspect artifacts/qa/readme-onboarding/');
if (bug.exitCode !== 0 || bug.outcome !== 'assertion_failed' || !bug.caught || !bug.exportedBundleVerified || bug.exportedOutcome !== 'assertion_failed' || !bug.cleanupConfirmed) throw new Error('README bug journey was not caught as an assertion failure with verified evidence and cleanup');
