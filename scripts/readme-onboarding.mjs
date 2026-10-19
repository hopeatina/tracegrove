/** Execute the README's canonical first-use block after build; not a clean dependency-install claim. */
import { readFileSync, writeFileSync, mkdirSync, cpSync, lstatSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyBundle, readVerifiedBundle } from '../dist/index.js';
const root = resolve(import.meta.dirname, '..');
const output = join(root, 'artifacts', 'qa', 'readme-onboarding'); mkdirSync(output, { recursive: true });
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const block = readme.match(/<!-- onboarding-quickstart:start -->\s*```bash\n([\s\S]*?)```\s*<!-- onboarding-quickstart:end -->/);
if (!block) throw new Error('README canonical onboarding block missing');
const started = Date.now();
function retainRun(stdout, preferredRunDir) {
  const demoDir = stdout.match(/^wrote sample notes-api to (.+)$/m)?.[1];
  let runDir = preferredRunDir;
  if (!runDir) {
    for (const line of stdout.split('\n')) {
      try { const report = JSON.parse(line); if (report.schemaVersion === 'tracegrove.run-summary/v1' && typeof report.runDir === 'string') runDir = report.runDir; } catch { /* unrelated CLI output */ }
    }
  }
  if (!runDir) return { status: 'no_run_report_available', bundleVerified: false };
  try {
    // Only the run produced beneath this invocation's generated sample is eligible for export.
    if (!demoDir || dirname(resolve(runDir)) !== resolve(demoDir, '.tracegrove', 'runs') || !lstatSync(runDir).isDirectory() || lstatSync(runDir).isSymbolicLink()) return { status: 'invalid_owned_run_path', bundleVerified: false };
    const exportedRunDir = join(output, basename(runDir));
    cpSync(runDir, exportedRunDir, { recursive: true, errorOnExist: true, force: false });
    const verification = verifyBundle(join(exportedRunDir, 'bundle'));
    return { status: 'retained', runDir, exportedRunDir, pathRelativeToArtifact: basename(runDir), bundleVerified: verification.ok, outcome: verification.outcome ?? null };
  } catch { return { status: 'export_failed', bundleVerified: false }; }
}
let result;
try { result = await promisify(execFile)('bash', ['-c', block[1]], { cwd: output, env: { ...process.env, TRACEGROVE_CLI: join(root, 'dist', 'cli', 'main.js') }, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }); }
catch (error) {
  writeFileSync(join(output, 'stdout.txt'), String(error.stdout ?? ''), { mode: 0o600 });
  writeFileSync(join(output, 'stderr.txt'), String(error.stderr ?? ''), { mode: 0o600 });
  const retained = retainRun(String(error.stdout ?? ''));
  writeFileSync(join(output, 'failure-receipt.json'), `${JSON.stringify({ status: 'failed', observedExitCode: typeof error.code === 'number' ? error.code : null,
    retained, limit: 'Available failed sample evidence exported; missing capture is explicit and never a passing journey.' }, null, 2)}\n`, { mode: 0o600 });
  throw new Error('README onboarding failed; inspect artifacts/qa/readme-onboarding/ stderr/stdout');
}
writeFileSync(join(output, 'stdout.txt'), result.stdout, { mode: 0o600 });
writeFileSync(join(output, 'stderr.txt'), result.stderr, { mode: 0o600 });
const runDir = result.stdout.match(/^Evidence retained at (.+)$/m)?.[1];
if (!runDir) throw new Error('README did not identify evidence destination');
const summary = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8'));
const verification = verifyBundle(join(runDir, 'bundle'));
// The CI runner's /tmp disappears; retain this exact owned sample and verify its exported bytes.
const retained = retainRun(result.stdout, runDir);
if (retained.status !== 'retained' || !retained.exportedRunDir) throw new Error('README sample artifact export failed');
const exportedRunDir = retained.exportedRunDir;
const snapshot = readVerifiedBundle(join(runDir, 'bundle'));
const cleanup = snapshot.receipts.map(r => ({ executionId: r.executionId, attempted: r.cleanup.attempted, confirmed: r.cleanup.confirmed,
  remainingUnknownMutations: r.cleanup.remainingUnknownMutations, critical: r.cleanup.critical, reasonCodes: r.cleanup.reasonCodes }));
const cleanupConfirmed = cleanup.length > 0 && cleanup.every(c => [...c.attempted, ...c.critical].every(id => c.confirmed.includes(id)) && !c.remainingUnknownMutations && !c.reasonCodes.length);
const receipt = { schemaVersion: 'tracegrove.readme-onboarding-receipt/v1', node: process.version, platform: process.platform,
  elapsedSeconds: (Date.now() - started) / 1000, runDir, exportedRunDir, outcome: summary.outcome,
  bundleVerified: verification.ok, exportedBundleVerified: retained.bundleVerified, pathRelativeToArtifact: retained.pathRelativeToArtifact, cleanupConfirmed, cleanup,
  limit: 'Actual README sample journey using the existing build/dependencies; independent clean-room setup is separate. No portable profile/host qualification.' };
writeFileSync(join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
writeFileSync(join(exportedRunDir, 'onboarding-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
if (summary.outcome !== 'passed' || !summary.bundleVerified || !verification.ok || !retained.bundleVerified || !cleanupConfirmed) throw new Error('README first-use outcome/evidence/export/cleanup gate failed');
console.log(JSON.stringify(receipt));
