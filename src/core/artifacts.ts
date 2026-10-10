/** Local ArtifactStore: content-addressed objects under the execution-owned state directory. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { EvidenceArtifact, digestOfBytes, parseAs, type Digest, type Ref } from '../protocol/index.ts';
import { InfrastructureFailure } from './errors.ts';

export class LocalArtifactStore {
  constructor(readonly root: string) {
    mkdirSync(join(root, 'objects', 'sha256'), { recursive: true });
  }

  objectPath(hex: string): string {
    return join(this.root, 'objects', 'sha256', hex);
  }

  /** Write bytes, read them back and verify the digest before returning the ref. */
  put(input: { id: string; bytes: Buffer; mediaType: string; producerRef: Ref; stepIds: string[]; from: string; to: string }): EvidenceArtifact {
    const digest = digestOfBytes(input.bytes);
    const target = this.objectPath(digest.hex);
    if (!existsSync(target)) {
      const tmp = `${target}.tmp-${process.pid}`;
      writeFileSync(tmp, input.bytes);
      renameSync(tmp, target);
    }
    const readBack = digestOfBytes(readFileSync(target));
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
    const target = this.objectPath(digest.hex);
    if (!existsSync(target)) return false;
    return digestOfBytes(readFileSync(target)).hex === digest.hex;
  }

  read(digest: Digest): Buffer {
    if (!this.verify(digest)) throw new InfrastructureFailure(`artifact ${digest.hex} missing or corrupt`);
    return readFileSync(this.objectPath(digest.hex));
  }
}
