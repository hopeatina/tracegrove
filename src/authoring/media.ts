import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { HexSha256, IdString, type ExecutionReceipt } from '../protocol/index.ts';
import { readVerifiedVideo } from '../core/bundle.ts';
import { RunVideo } from './schema.ts';

export function runVideos(receipt: ExecutionReceipt): RunVideo[] {
  return receipt.artifacts.filter(a => a.mediaType === 'video/webm').map(a => RunVideo.parse({ digest: a.ref.digest.hex, byteCount: a.byteCount, mediaType: a.mediaType }));
}

/** Only receipt-bound media from an owned, fully verified run; never a caller-supplied file path. */
export function readRunVideo(projectRoot: string, runName: string, digest: string, caseId: string): Buffer {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(runName) || !HexSha256.safeParse(digest).success || !IdString.safeParse(caseId).success) throw new Error('invalid recording reference');
  let directory = projectRoot;
  for (const segment of ['.tracegrove', 'runs', runName, 'bundle']) {
    directory = join(directory, segment);
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('recording directory is not owned by this run');
  }
  return readVerifiedVideo(directory, digest, caseId);
}

/** One RFC-style byte range for native video seeking. Invalid or unsatisfiable ranges fail closed. */
export function videoRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return { start: 0, end: size - 1 };
  const match = /^bytes=([0-9]*)-([0-9]*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
  const start = first ?? Math.max(0, size - last!);
  const end = first === null ? size - 1 : Math.min(size - 1, last ?? size - 1);
  return size > 0 && start >= 0 && start < size && end >= start ? { start, end } : null;
}
