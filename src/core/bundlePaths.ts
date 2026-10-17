export function cellBundleName(id: string): string { return id.replace(/[^A-Za-z0-9._-]/g, '_'); }

export function videoBundlePath(cellId: string, digest: string): string {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('invalid video digest');
  return `cells/${cellBundleName(cellId)}/media/${digest}.webm`;
}
