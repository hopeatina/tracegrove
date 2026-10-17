import { posix } from 'node:path';
import { sameRef, sameScope, verifySelfDigest } from '../protocol/canonical.ts';
import type { IdentityAttestation, LaunchRecipe, Scope } from '../protocol/index.ts';
import { identityFromEntries } from '../hosts/sourceIdentity.ts';

/** Recheck source-manifest bindings from frozen bytes, independent of the launch directory. */
export function snapshotAttestationProblems(launch: LaunchRecipe, attestation: IdentityAttestation, scope: Scope): string[] {
  const pin = launch.sourceSnapshot; const observed = attestation.evidence.sourceSnapshotRef;
  if (!pin) return observed ? ['unbound source snapshot observation'] : [];
  const problems: string[] = [];
  if (!verifySelfDigest(pin.snapshot) || !sameScope(pin.snapshot.scope, scope)) problems.push('source snapshot digest or scope mismatch');
  if (!observed || !sameRef(pin.snapshot.ref, observed)) problems.push('source snapshot lacks its supervisor observation');
  const files = attestation.evidence.files;
  const declared = [...launch.identitySourceFiles].sort();
  if (JSON.stringify(files.map(file => file.path).sort()) !== JSON.stringify(declared)) problems.push('source snapshot identity file closure differs');
  for (const file of files) {
    const path = posix.normalize(posix.join(pin.cwd, file.path));
    if (!pin.snapshot.files.some(entry => entry.path === path && entry.digest.hex === file.sha256)) problems.push('source snapshot identity bytes differ');
  }
  if (attestation.identity.kind !== 'source_digest' || attestation.identity.sourceDigest.hex !== identityFromEntries(files).hex) problems.push('source snapshot digest differs from observed files');
  return problems;
}
