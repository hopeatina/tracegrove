import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCoordinationVectors } from './coordinationVectors.ts';

describe('portable coordination vectors', () => {
  it('binds the cross-runtime fixture to the executable transition, including every expiry field', () => {
    const fixture = JSON.parse(readFileSync(new URL('./coordination-vectors.json', import.meta.url), 'utf8'));
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.vectors).toEqual(buildCoordinationVectors());
    expect(fixture.vectors).toHaveLength(6);
    expect(new Set(fixture.vectors.map((vector: { id: string }) => vector.id)).size).toBe(6);
  });
});
