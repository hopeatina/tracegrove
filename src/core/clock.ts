import { randomBytes } from 'node:crypto';

export function nowIso(): string {
  return new Date().toISOString();
}
export function isoPlusMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
export function monotonicMs(): number {
  return Number(process.hrtime.bigint() / 1_000_000n);
}
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}
