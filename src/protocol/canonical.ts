/**
 * CanonicalCodec: schema-validated values <-> canonical JSON bytes and SHA-256 digests.
 *
 * Rules (shared conformance vectors live in tests/canonical.test.ts):
 * - Object keys sorted by UTF-16 code unit order; no whitespace; UTF-8 bytes.
 * - Arrays keep their order (semantic order is part of identity).
 * - `undefined` members are dropped (JSON semantics). `null` is retained.
 * - NaN, +/-Infinity, bigint, symbol, function and non-plain objects are rejected.
 * - Depth and node limits bound the work an untrusted document can cause.
 * - A document is hashed WITHOUT its own `ref.digest` field (schema-declared exclusion).
 */
import { createHash } from 'node:crypto';

export const CANONICAL_MAX_DEPTH = 64;
export const CANONICAL_MAX_NODES = 250_000;

import type { Digest, Ref, Scope } from './primitives.ts';

export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalError';
  }
}

type Counter = { nodes: number };

function canonicalizeValue(value: unknown, depth: number, counter: Counter): string {
  if (++counter.nodes > CANONICAL_MAX_NODES) throw new CanonicalError('canonical node limit exceeded');
  if (depth > CANONICAL_MAX_DEPTH) throw new CanonicalError('canonical depth limit exceeded');
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new CanonicalError('non-finite number is not canonical JSON');
      if (Object.is(value, -0)) return '0';
      return JSON.stringify(value);
    case 'bigint':
    case 'symbol':
    case 'function':
      throw new CanonicalError(`unsupported value type ${typeof value}`);
    case 'undefined':
      throw new CanonicalError('undefined cannot be canonicalized at top level');
    case 'object': {
      if (Array.isArray(value)) {
        const items = value.map((item) =>
          item === undefined ? 'null' : canonicalizeValue(item, depth + 1, counter),
        );
        return `[${items.join(',')}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new CanonicalError('non-plain object is not canonical JSON');
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const parts = keys.map(
        (key) => `${JSON.stringify(key)}:${canonicalizeValue(record[key], depth + 1, counter)}`,
      );
      return `{${parts.join(',')}}`;
    }
    default:
      throw new CanonicalError('unsupported value');
  }
}

export function canonicalize(value: unknown): string {
  return canonicalizeValue(value, 0, { nodes: 0 });
}

export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), 'utf8');
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function digestOfBytes(bytes: Buffer | string): Digest {
  return { algorithm: 'sha256', hex: sha256Hex(bytes) };
}

export function digestOfValue(value: unknown): Digest {
  return digestOfBytes(canonicalBytes(value));
}

/** Returns a structural copy with `ref.digest` removed, for self-digest computation. */
export function withoutOwnDigest<T extends { ref?: { digest?: unknown } }>(doc: T): T {
  if (!doc || typeof doc !== 'object' || !('ref' in doc) || !doc.ref || typeof doc.ref !== 'object') {
    return doc;
  }
  const { digest: _omit, ...restRef } = doc.ref as Record<string, unknown>;
  return { ...doc, ref: restRef } as T;
}

/** Digest of a document excluding its own `ref.digest`. */
export function selfDigest(doc: { ref?: { digest?: unknown } }): Digest {
  return digestOfValue(withoutOwnDigest(doc));
}

/** Fill `ref.digest` from content. The result is the frozen immutable definition. */
export function freeze<T extends { ref: { id: string; revision: string; digest?: unknown } }>(
  doc: T,
): T & { ref: Ref } {
  const digest = selfDigest(doc);
  return { ...doc, ref: { id: doc.ref.id, revision: doc.ref.revision, digest } };
}

/** True when the embedded digest equals the recomputed self digest. */
export function verifySelfDigest(doc: { ref: Ref }): boolean {
  const expected = selfDigest(doc);
  return doc.ref.digest.algorithm === 'sha256' && doc.ref.digest.hex === expected.hex;
}

export function sameDigest(a: Digest | null | undefined, b: Digest | null | undefined): boolean {
  return !!a && !!b && a.algorithm === b.algorithm && a.hex === b.hex;
}

export function refKey(ref: Ref): string {
  return `${ref.id}@${ref.revision}#${ref.digest.hex}`;
}

export function sameRef(a: Ref, b: Ref): boolean {
  return a.id === b.id && a.revision === b.revision && sameDigest(a.digest, b.digest);
}

export function sameScope(a: Scope, b: Scope): boolean {
  return a.ownerId === b.ownerId && a.tenantId === b.tenantId && a.visibility === b.visibility;
}
