import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

/** Read a bounded regular file without following its final symlink or allocating from unchecked size. */
export function readBoundedFile(path: string, maxBytes: number, expectedBytes?: number): Buffer {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('input is not a bounded regular file');
    const size = expectedBytes ?? stat.size;
    if (stat.size !== size) throw new Error(`hash mismatch ${path}: byte count changed`);
    const bytes = Buffer.alloc(size + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = readSync(descriptor, bytes, count, bytes.length - count, null);
      if (!read) break;
      count += read;
    }
    if (count !== size) throw new Error(`hash mismatch ${path}: byte count changed`);
    return bytes.subarray(0, count);
  } finally { closeSync(descriptor); }
}
