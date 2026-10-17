/** Execute the README's canonical first-use block after build; not a clean dependency-install claim. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyBundle, readVerifiedBundle } from '../dist/index.js';
const root = resolve(import.meta.dirname, '..');
const output = join(root, 'artifacts', 'qa', 'readme-onboarding'); mkdirSync(output, { recursive: true });
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const block = readme.match(/<!-- onboarding-quickstart:start -->\s*```bash\n([\s\S]*?)```\s*<!-- onboarding-quickstart:end -->/);
if (!block) throw new Error('README canonical onboarding block missing');
const started = Date.now();
let result;
try { result = await promisify(execFile)('bash', ['-c', block[1]], { cwd: root, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }); }
catch (error) {
  writeFileSync(join(output, 'stdout.txt'), String(error.stdout ?? ''), { mode: 0o600 });
  writeFileSync(join(output, 'stderr.txt'), String(error.stderr ?? ''), { mode: 0o600 });
  throw new Error('README onboarding failed; inspect artifacts/qa/readme-onboarding/ stderr/stdout');
}
writeFileSync(join(output, 'stdout.txt'), result.stdout, { mode: 0o600 });
writeFileSync(join(output, 'stderr.txt'), result.stderr, { mode: 0o600 });
const runDir = result.stdout.match(/^Evidence retained at (.+)$/m)?.[1];
if (!runDir) throw new Error('README did not identify evidence destination');
const summary = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8'));
const verification = verifyBundle(join(runDir, 'bundle'));
const snapshot = readVerifiedBundle(join(runDir, 'bundle'));
const cleanup = snapshot.receipts.map(r => ({ executionId: r.executionId, attempted: r.cleanup.attempted, confirmed: r.cleanup.confirmed,
  remainingUnknownMutations: r.cleanup.remainingUnknownMutations, critical: r.cleanup.critical, reasonCodes: r.cleanup.reasonCodes }));
const cleanupConfirmed = cleanup.length > 0 && cleanup.every(c => [...c.attempted, ...c.critical].every(id => c.confirmed.includes(id)) && !c.remainingUnknownMutations && !c.reasonCodes.length);
const receipt = { schemaVersion: 'tracegrove.readme-onboarding-receipt/v1', node: process.version, platform: process.platform,
  elapsedSeconds: (Date.now() - started) / 1000, runDir, outcome: summary.outcome, bundleVerified: verification.ok, cleanupConfirmed, cleanup,
  limit: 'Actual README sample journey using the existing build/dependencies; independent clean-room setup is separate. No portable profile/host qualification.' };
writeFileSync(join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
if (summary.outcome !== 'passed' || !summary.bundleVerified || !verification.ok || !cleanupConfirmed) throw new Error('README first-use outcome/evidence/cleanup gate failed');
console.log(JSON.stringify(receipt));
