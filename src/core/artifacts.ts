/** Local ArtifactStore: content-addressed objects under the execution-owned state directory. */
import { linkSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { EvidenceArtifact, digestOfBytes, parseAs, type Digest, type Ref } from '../protocol/index.ts';
import { InfrastructureFailure } from './errors.ts';
import { createDurableDirectory, syncDirectory, writeExclusiveDurable } from './atomicFiles.ts';
import { readBoundedFile } from './boundedFile.ts';
import { BUNDLE_LIMITS } from './bundleSnapshot.ts';

export class LocalArtifactStore {
  constructor(readonly root: string) {
    createDurableDirectory(join(root, 'objects', 'sha256'));
  }

  objectPath(hex: string): string {
    if (!/^[a-f0-9]{64}$/.test(hex)) throw new InfrastructureFailure('invalid artifact digest');
    return join(this.root, 'objects', 'sha256', hex);
  }

  /** Write bytes, read them back and verify the digest before returning the ref. */
  put(input: { id: string; bytes: Buffer; mediaType: string; producerRef: Ref; stepIds: string[]; from: string; to: string }): EvidenceArtifact {
    const digest = digestOfBytes(input.bytes);
    const target = this.objectPath(digest.hex);
    if (input.bytes.length > BUNDLE_LIMITS.fileBytes) throw new InfrastructureFailure('artifact exceeds bounded file size');
    const directory = join(this.root, 'objects', 'sha256');
    const staging = mkdtempSync(join(directory, '.pending-'));
    try {
      const temporary = join(staging, 'object');
      writeExclusiveDurable(temporary, input.bytes);
      if (digestOfBytes(readBoundedFile(temporary, BUNDLE_LIMITS.fileBytes)).hex !== digest.hex) throw new InfrastructureFailure('artifact staging digest mismatch');
      // link is exclusive: a concurrent writer cannot replace any existing object.
      try { linkSync(temporary, target); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      syncDirectory(directory);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    const readBack = digestOfBytes(readBoundedFile(target, BUNDLE_LIMITS.fileBytes));
    if (readBack.hex !== digest.hex) throw new InfrastructureFailure(`artifact readback digest mismatch for ${input.id}`);
    return parseAs(EvidenceArtifact, {
      ref: { id: input.id, revision: '1', digest },
      privateObject: { provider: 'local_fs', bucket: this.root, key: `objects/sha256/${digest.hex}` },
      mediaType: input.mediaType,
      byteCount: input.bytes.byteLength,
      producerRef: input.producerRef,
      stepIds: input.stepIds,
      timeRange: { from: input.from, to: input.to },
      redactionPolicyRef: null,
      retentionPolicyRef: null,
      accessPolicyRef: null,
      derivativeOf: null,
    }, 'evidence artifact');
  }

  verify(digest: Digest): boolean {
    try { this.read(digest); return true; } catch { return false; }
  }

  read(digest: Digest): Buffer {
    const bytes = readBoundedFile(this.objectPath(digest.hex), BUNDLE_LIMITS.fileBytes);
    if (digestOfBytes(bytes).hex !== digest.hex) throw new InfrastructureFailure(`artifact ${digest.hex} missing or corrupt`);
    return bytes;
  }
}
