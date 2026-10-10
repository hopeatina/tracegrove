import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadProject, localScope } from '../src/core/corpus.ts';
import { plan } from '../src/core/planner.ts';
import { verifySelfDigest } from '../src/protocol/index.ts';

const SAMPLE = join(import.meta.dirname, '..', 'src', 'samples', 'notes-api', 'verification', 'workflow.yaml');

describe('plan', () => {
  it('freezes a request for the native-real profile with the real case selected and the contract case excluded', () => {
    const project = loadProject(SAMPLE);
    const bundle = plan({ project, profileName: 'native-real', scope: localScope() });
    expect(bundle.blockers).toEqual([]);
    expect(bundle.request).not.toBeNull();
    expect(verifySelfDigest(bundle.request!)).toBe(true);
    expect(bundle.request!.caseRefs.map((r) => r.id)).toEqual(['example.notes.create']);
    expect(bundle.excludedCells.map((c) => c.cellKey)).toEqual(['example.notes.contract__example.persona.owner']);
    expect(bundle.request!.fixturePlanRef).not.toBeNull();
    expect(Object.keys(bundle.documents).length).toBeGreaterThan(15);
  });

  it('is deterministic for the same frozen inputs (idempotency key) while campaign ids differ', () => {
    const project = loadProject(SAMPLE);
    const a = plan({ project, profileName: 'native-real', scope: localScope() });
    const b = plan({ project, profileName: 'native-real', scope: localScope() });
    expect(a.request!.idempotencyKey).toBe(b.request!.idempotencyKey);
    expect(a.request!.campaignId).not.toBe(b.request!.campaignId);
  });

  it('plans the offline profile with the mock host and no fixture plan', () => {
    const project = loadProject(SAMPLE);
    const bundle = plan({ project, profileName: 'offline-contract', scope: localScope() });
    expect(bundle.blockers).toEqual([]);
    expect(bundle.request!.caseRefs.map((r) => r.id)).toEqual(['example.notes.contract']);
    expect(bundle.request!.fixturePlanRef).toBeNull();
    expect(bundle.request!.executionHostRef!.id).toBe('example.host.mock-loopback');
  });
});
