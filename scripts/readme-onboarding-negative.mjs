/** Deliberate local sample assertion failure: retained evidence must survive a nonzero README shell. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, symlinkSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { verifyBundle, readVerifiedBundle } from '../dist/index.js';
const root = resolve(import.meta.dirname, '..'); const trial = mkdtempSync(join(tmpdir(), 'tracegrove-onboarding-negative-'));
const output = join(root, 'artifacts', 'qa', 'readme-onboarding', `negative-${basename(trial)}`);
mkdirSync(join(trial, 'scripts'));
symlinkSync(join(root, 'dist'), join(trial, 'dist'), 'dir');
cpSync(join(root, 'scripts', 'readme-onboarding.mjs'), join(trial, 'scripts', 'readme-onboarding.mjs'));
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const hook = 'node "$TRACEGROVE_CLI" test --config';
assert.equal(readme.split(hook).length, 2, 'canonical README test hook must be unambiguous');
const mutation = `node -e 'const fs=require("node:fs"),p=process.argv[1],s=fs.readFileSync(p,"utf8");if(!s.includes("status: 201"))process.exit(5);fs.writeFileSync(p,s.replace("status: 201","status: 202"))' "$TRACEGROVE_DEMO/tracegrove/notes/create-read-delete.flow.yaml"\n`;
writeFileSync(join(trial, 'README.md'), readme.replace(hook, mutation + hook));
let failed = false;
try { await promisify(execFile)(process.execPath, [join(trial, 'scripts', 'readme-onboarding.mjs')], { cwd: trial, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }); }
catch (error) { assert.equal(error.code, 1, 'harness failure must remain nonzero'); failed = true; }
assert.ok(failed, 'incorrect expected HTTP status must fail the journey');
const evidenceRoot = join(trial, 'artifacts', 'qa', 'readme-onboarding');
// Preserve available child diagnostics before asserting the expected failure classification.
cpSync(evidenceRoot, output, { recursive: true, errorOnExist: true, force: false });
const receipt = JSON.parse(readFileSync(join(evidenceRoot, 'failure-receipt.json'), 'utf8'));
assert.equal(receipt.observedExitCode, 1); assert.equal(receipt.retained.status, 'retained'); assert.equal(receipt.retained.bundleVerified, true);
assert.equal(receipt.retained.outcome, 'assertion_failed');
// Verify the final retained copy too.
const bundle = join(output, receipt.retained.pathRelativeToArtifact, 'bundle');
assert.equal(verifyBundle(bundle).ok, true);
const snapshot = readVerifiedBundle(bundle);
assert.ok(snapshot.receipts.length > 0);
assert.ok(snapshot.receipts.every(r => [...r.cleanup.attempted, ...r.cleanup.critical].every(id => r.cleanup.confirmed.includes(id)) && !r.cleanup.remainingUnknownMutations && !r.cleanup.reasonCodes.length));
const result = { expectedFailure: 'assertion_failed', originalExitCode: 1, exportedBundleVerified: true, cleanupConfirmed: true,
  bundleRelativeToArtifact: `${basename(output)}/${receipt.retained.pathRelativeToArtifact}/bundle`,
  limit: 'Deliberate synthetic expectation fault; not the unchanged README first-use journey or additional environment qualification.' };
writeFileSync(join(output, 'negative-retention-receipt.json'), `${JSON.stringify(result, null, 2)}\n`);
rmSync(trial, { recursive: true, force: true }); // Only this script's owned scratch harness, after verified evidence export.
console.log(JSON.stringify(result));
