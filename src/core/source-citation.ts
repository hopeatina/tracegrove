import { z } from 'zod';
import {
  DigestSchema, PositiveInt, RefSchema, ScopeSchema, ShortText, GitObjectId, RepositoryPath,
  digestOfBytes, sameDigest, sameRef, verifySelfDigest, type Ref, type Scope,
} from '../protocol/index.ts';
import { Conflict } from './errors.ts';

export { RepositoryPath } from '../protocol/index.ts';

/** Source facts only: this does not attest deployed behavior or execution admission. */
export const SourceCitation = z.object({
  ref: RefSchema,
  repositoryRef: RefSchema,
  resolvedCommit: GitObjectId,
  path: RepositoryPath,
  fileDigest: DigestSchema,
  lineStart: PositiveInt,
  lineEnd: PositiveInt,
  excerptDigest: DigestSchema,
  symbol: ShortText.nullable(),
}).strict();
export type SourceCitation = z.infer<typeof SourceCitation>;

export interface SourceCitationPorts {
  /** Trusted host authorization, never supplied by a candidate or plugin. */
  authorize(scope: Scope, repositoryRef: Ref): Promise<void>;
  /** Fetch that immutable object; unavailable objects must fail without checkout fallback. */
  readFile(scope: Scope, citation: SourceCitation): Promise<{
    repositoryRef: Ref; resolvedCommit: string; path: string; bytes: Uint8Array;
  }>;
}

export const SOURCE_FILE_MAX_BYTES = 1_048_576;

/** Inclusive LF-delimited lines; preserve all original bytes, including CRLF and terminators. */
function excerpt(bytes: Buffer, start: number, end: number): Buffer {
  const boundaries = [0];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 10 && index + 1 < bytes.length) boundaries.push(index + 1);
  }
  const lineCount = bytes.length === 0 ? 0 : boundaries.length;
  if (end < start || end > lineCount) throw new Conflict('citation line range is outside fetched source');
  return bytes.subarray(boundaries[start - 1], boundaries[end] ?? bytes.length);
}

export async function verifySourceCitation(
  ports: SourceCitationPorts, input: unknown, requestedScope: Scope,
): Promise<{ citation: SourceCitation; fileBytes: number; excerptBytes: number }> {
  const citation = SourceCitation.parse(input);
  const scope = ScopeSchema.parse(requestedScope);
  if (!verifySelfDigest(citation)) throw new Conflict('citation document digest mismatch');
  if (citation.lineEnd < citation.lineStart) throw new Conflict('citation line range is reversed');
  // Copies keep a host callback from mutating the selected identity or parsed snapshot.
  await ports.authorize(structuredClone(scope), structuredClone(citation.repositoryRef));
  const file = await ports.readFile(structuredClone(scope), structuredClone(citation));
  if (!sameRef(RefSchema.parse(file.repositoryRef), citation.repositoryRef)
    || file.resolvedCommit !== citation.resolvedCommit || file.path !== citation.path) {
    throw new Conflict('fetched source identity does not match citation');
  }
  if (!(file.bytes instanceof Uint8Array) || file.bytes.byteLength > SOURCE_FILE_MAX_BYTES) {
    throw new Conflict('fetched source exceeds supported byte bound or is not bytes');
  }
  const bytes = Buffer.from(file.bytes);
  // Reject binary/invalid UTF-8 instead of inventing replacement characters or line facts.
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (bytes.includes(0)) throw new Conflict('binary source cannot supply a line citation');
  if (!sameDigest(digestOfBytes(bytes), citation.fileDigest)) throw new Conflict('fetched file digest mismatch');
  const selected = excerpt(bytes, citation.lineStart, citation.lineEnd);
  if (!sameDigest(digestOfBytes(selected), citation.excerptDigest)) throw new Conflict('fetched excerpt digest mismatch');
  return { citation, fileBytes: bytes.length, excerptBytes: selected.length };
}
