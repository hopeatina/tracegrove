import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadProject } from '../src/core/corpus.ts';
import { ComponentProfile } from '../src/protocol/index.ts';
import { sampleIdentityDigest } from '../conformance/helpers.ts';

const ROOT = join(import.meta.dirname, '..', 'src', 'samples', 'notes-api');

describe('sample identity pin', () => {
  it('component profile pins the launcher-computed digest of all declared app sources', () => {
    const project = loadProject(join(ROOT, 'verification', 'workflow.yaml'));
    const doc = project.corpus.documents().find((d) => d.ref.id === 'example.components.notes-api')!;
    const profile = project.corpus.getAs(ComponentProfile, doc.ref);
    const expected = profile.components[0]!.expectedIdentity;
    expect(expected?.kind).toBe('source_digest');
    const computed = sampleIdentityDigest(ROOT);
    expect(expected?.kind === 'source_digest' ? expected.sourceDigest.hex : null).toBe(computed.hex);
  });
});
