import { describe, expect, it } from 'vitest';
import {
  CanonicalError,
  canonicalize,
  digestOfValue,
  freeze,
  selfDigest,
  verifySelfDigest,
} from '../src/protocol/canonical.ts';

// Shared conformance vectors. Any conforming CanonicalCodec (TypeScript, Python, OrgX adapter)
// must produce these exact bytes and digests.
const VECTORS: Array<{ name: string; value: unknown; canonical: string; sha256: string }> = [
  { name: 'empty object', value: {}, canonical: '{}', sha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
  { name: 'sorted keys', value: { b: 1, a: [true, null, 'x'] }, canonical: '{"a":[true,null,"x"],"b":1}', sha256: '' },
  { name: 'unicode and escapes', value: { s: 'héllo "q" \n' }, canonical: '{"s":"héllo \\"q\\" \\n"}', sha256: '' },
  { name: 'nested and undefined dropped', value: { z: undefined, y: { k: [1, 2, { u: undefined, v: 0 }] } }, canonical: '{"y":{"k":[1,2,{"v":0}]}}', sha256: '' },
  { name: 'negative zero normalized', value: { n: -0 }, canonical: '{"n":0}', sha256: '' },
];

describe('CanonicalCodec vectors', () => {
  for (const vector of VECTORS) {
    it(vector.name, () => {
      expect(canonicalize(vector.value)).toBe(vector.canonical);
      if (vector.sha256) expect(digestOfValue(vector.value).hex).toBe(vector.sha256);
    });
  }

  it('rejects non-finite numbers and non-plain objects', () => {
    expect(() => canonicalize({ n: Number.NaN })).toThrow(CanonicalError);
    expect(() => canonicalize({ n: Number.POSITIVE_INFINITY })).toThrow(CanonicalError);
    expect(() => canonicalize({ d: new Date(0) })).toThrow(CanonicalError);
    expect(() => canonicalize({ b: 10n })).toThrow(CanonicalError);
  });

  it('rejects depth bombs', () => {
    let nested: unknown = 1;
    for (let i = 0; i < 100; i += 1) nested = [nested];
    expect(() => canonicalize(nested)).toThrow(/depth/);
  });

  it('self digest excludes ref.digest and verifies after freeze', () => {
    const doc = { ref: { id: 'example.case', revision: '1' }, purpose: 'p' };
    const frozen = freeze(doc);
    expect(frozen.ref.digest.hex).toHaveLength(64);
    expect(verifySelfDigest(frozen)).toBe(true);
    expect(selfDigest(frozen).hex).toBe(frozen.ref.digest.hex);
    const tampered = { ...frozen, purpose: 'changed' };
    expect(verifySelfDigest(tampered)).toBe(false);
  });
});
