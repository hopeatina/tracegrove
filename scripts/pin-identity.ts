// Usage: node --import tsx scripts/pin-identity.ts <launch-cwd> <component-profile.yaml> <file...>
// Pins the launcher-computed source identity digest into a component profile authoring file.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { sourceIdentityDigest } from '../src/hosts/local.ts';
const [cwd, profilePath, ...files] = process.argv.slice(2);
if (!cwd || !profilePath || files.length === 0) throw new Error('usage: pin-identity <cwd> <profile> <files...>');
const identity = sourceIdentityDigest(cwd, files);
const doc = parse(readFileSync(profilePath, 'utf8')) as { components: Array<{ expectedIdentity: { kind: string; sourceDigest?: { hex: string } } | null }> };
for (const component of doc.components) {
  if (component.expectedIdentity?.kind === 'source_digest' && component.expectedIdentity.sourceDigest) component.expectedIdentity.sourceDigest.hex = identity.hex;
}
writeFileSync(profilePath, stringify(doc));
console.log(`pinned ${identity.hex} into ${profilePath}`);
