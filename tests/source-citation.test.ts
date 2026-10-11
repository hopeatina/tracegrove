import { describe, expect, it, vi } from 'vitest';
import { verifySourceCitation, SOURCE_FILE_MAX_BYTES, type SourceCitationPorts } from '../src/core/source-citation.ts';
import { digestOfBytes, freeze, type Scope } from '../src/protocol/index.ts';

const scope: Scope = { ownerId: 'owner', tenantId: 'tenant', visibility: 'tenant_private' };
function fixture(text = 'first\r\nsecond café\r\nthird') {
  const bytes = Buffer.from(text);
  const citation = freeze({
    ref: { id: 'citation', revision: '1' },
    repositoryRef: { id: 'repository', revision: '1', digest: digestOfBytes('repository identity') },
    resolvedCommit: 'a'.repeat(40), path: 'src/route.ts', fileDigest: digestOfBytes(bytes),
    lineStart: 2, lineEnd: 2, excerptDigest: digestOfBytes('second café\r\n'), symbol: null,
  });
  const readFile = vi.fn(async () => ({ repositoryRef: citation.repositoryRef, resolvedCommit: citation.resolvedCommit, path: citation.path, bytes }));
  const authorize = vi.fn(async () => {});
  const ports: SourceCitationPorts = { authorize, readFile };
  return { bytes, citation, ports, readFile, authorize };
}

describe('immutable source citation byte checks', () => {
  it('binds full repository/commit/path identity and preserves UTF-8/CRLF excerpt bytes', async () => {
    const f = fixture();
    const result = await verifySourceCitation(f.ports, f.citation, scope);
    expect(result).toEqual({ citation: f.citation, fileBytes: f.bytes.length, excerptBytes: Buffer.byteLength('second café\r\n') });
    expect(f.authorize).toHaveBeenCalledWith(scope, f.citation.repositoryRef);
    expect(f.readFile).toHaveBeenCalledWith(scope, f.citation);
    expect(result).not.toHaveProperty('passed');
  });

  it.each(['repositoryRef', 'resolvedCommit', 'path'] as const)('rejects host fetch substitution in %s', async field => {
    const f = fixture();
    const response = await f.readFile();
    const changed = field === 'repositoryRef' ? { ...response, repositoryRef: { ...response.repositoryRef, id: 'other' } }
      : { ...response, [field]: 'other' };
    f.ports.readFile = async () => changed;
    await expect(verifySourceCitation(f.ports, f.citation, scope)).rejects.toThrow('source identity');
  });

  it('rejects changed fetched file bytes even when the excerpt itself is unchanged', async () => {
    const f = fixture();
    f.bytes[0] = 88;
    await expect(verifySourceCitation(f.ports, f.citation, scope)).rejects.toThrow('file digest');
  });

  it('rejects a wrong excerpt digest in an otherwise correctly sealed citation', async () => {
    const f = fixture();
    const changed = freeze({ ...f.citation, excerptDigest: digestOfBytes('wrong') });
    await expect(verifySourceCitation(f.ports, changed, scope)).rejects.toThrow('excerpt digest');
  });

  it('rejects citation tampering before fetching', async () => {
    const f = fixture();
    await expect(verifySourceCitation(f.ports, { ...f.citation, symbol: 'forged' }, scope)).rejects.toThrow('document digest');
    expect(f.readFile).not.toHaveBeenCalled();
  });

  it.each(['../route.ts', '/route.ts', 'src//route.ts', 'src/./route.ts', 'src\\route.ts', 'C:/route.ts', 'src/route\u0000.ts'])('rejects unsafe path %s without host access', async path => {
    const f = fixture();
    await expect(verifySourceCitation(f.ports, freeze({ ...f.citation, path }), scope)).rejects.toThrow('repository-relative');
    expect(f.authorize).not.toHaveBeenCalled();
    expect(f.readFile).not.toHaveBeenCalled();
  });

  it.each([[2, 1], [4, 4], [1, 9]])('rejects invalid line range %i..%i', async (lineStart, lineEnd) => {
    const f = fixture();
    await expect(verifySourceCitation(f.ports, freeze({ ...f.citation, lineStart, lineEnd }), scope)).rejects.toThrow('line range');
  });

  it('does not count a terminating newline as an extra empty source line', async () => {
    const f = fixture('one\n');
    await expect(verifySourceCitation(f.ports, f.citation, scope)).rejects.toThrow('line range');
  });

  it('rejects empty source and allows a final unterminated line', async () => {
    const empty = fixture('');
    await expect(verifySourceCitation(empty.ports, empty.citation, scope)).rejects.toThrow('line range');
    const f = fixture();
    const last = freeze({ ...f.citation, lineStart: 3, lineEnd: 3, excerptDigest: digestOfBytes('third') });
    expect((await verifySourceCitation(f.ports, last, scope)).excerptBytes).toBe(5);
  });

  it.each([Buffer.from([255]), Buffer.from([0]), Buffer.alloc(SOURCE_FILE_MAX_BYTES + 1, 65)])('fails closed on unsupported fetched bytes', async bytes => {
    const f = fixture();
    const response = await f.readFile();
    f.ports.readFile = async () => ({ ...response, bytes });
    await expect(verifySourceCitation(f.ports, f.citation, scope)).rejects.toThrow();
  });

  it('propagates denied authority and unavailable commits without fallback', async () => {
    const f = fixture();
    f.ports.authorize = async () => { throw new Error('denied'); };
    await expect(verifySourceCitation(f.ports, f.citation, scope)).rejects.toThrow('denied');
    expect(f.readFile).not.toHaveBeenCalled();
    f.ports.authorize = async () => {};
    f.ports.readFile = async () => { throw new Error('immutable commit unavailable'); };
    await expect(verifySourceCitation(f.ports, f.citation, scope)).rejects.toThrow('commit unavailable');
  });

  it('isolates selected scope and source identity from host callback mutation', async () => {
    const f = fixture();
    f.ports.authorize = async (receivedScope, repository) => { receivedScope.tenantId = 'other'; repository.id = 'other'; };
    const response = await f.readFile();
    f.ports.readFile = async (receivedScope, receivedCitation) => {
      expect(receivedScope).toEqual(scope);
      expect(receivedCitation).toEqual(f.citation);
      receivedCitation.path = 'changed';
      return response;
    };
    expect((await verifySourceCitation(f.ports, f.citation, scope)).citation).toEqual(f.citation);
  });
});
