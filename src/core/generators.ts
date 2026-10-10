/**
 * Deterministic logical-payload materialization. The same recipe, seed, generator version and
 * locale produce identical bytes on every implementation; the payload is hashed and checked in,
 * never regenerated implicitly at execution time.
 */
import { createHash } from 'node:crypto';
import { Blocked } from './errors.ts';
import { LogicalPayload, freeze, parseAs, type SeedRecipe, type SeedValue } from '../protocol/index.ts';

const WORDS = ['amber', 'basalt', 'cedar', 'delta', 'ember', 'fjord', 'granite', 'harbor', 'iris', 'juniper', 'kelp', 'lumen', 'marrow', 'nectar', 'orchid', 'pebble', 'quartz', 'river', 'sable', 'thistle', 'umber', 'velvet', 'willow', 'xenon', 'yarrow', 'zephyr'];

function rng(seedText: string): () => number {
  const seed = createHash('sha256').update(seedText).digest();
  let a = seed.readUInt32LE(0) || 1;
  return () => { // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateValue(generatorId: string, args: Record<string, unknown>, seedText: string): unknown {
  const next = rng(seedText);
  switch (generatorId) {
    case 'words': {
      const count = Math.max(1, Math.min(64, Number(args.count ?? 4)));
      return Array.from({ length: count }, () => WORDS[Math.floor(next() * WORDS.length)]).join(' ');
    }
    case 'slug': return `${WORDS[Math.floor(next() * WORDS.length)]}-${Math.floor(next() * 9000 + 1000)}`;
    case 'int': {
      const min = Number(args.min ?? 0); const max = Number(args.max ?? 1000);
      return Math.floor(min + next() * (max - min + 1));
    }
    case 'uuid': {
      const hex = createHash('sha256').update(`uuid:${seedText}`).digest('hex');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    }
    default: throw new Blocked([{ code: 'unknown_generator', detail: generatorId }]);
  }
}

/** Materialize literal and generated values. Entity refs and runtime bindings stay symbolic. */
export function materializeLogicalPayload(recipe: SeedRecipe, scope: LogicalPayload['scope']): LogicalPayload {
  const entities = recipe.entities.map((entity) => {
    const values: Record<string, unknown> = {};
    for (const [name, source] of Object.entries(entity.values) as Array<[string, SeedValue]>) {
      switch (source.kind) {
        case 'literal': values[name] = source.value; break;
        case 'generator': values[name] = generateValue(source.generatorId, source.args, `${recipe.generation.logicalSeed}|${recipe.generation.generatorVersion}|${recipe.generation.locale}|${entity.entityKey}|${name}`); break;
        case 'entity_ref': values[name] = { $entity: source.entityKey, output: source.outputName }; break;
        case 'runtime_binding': values[name] = { $runtime: source.name }; break;
      }
    }
    return { entityKey: entity.entityKey, values };
  });
  const payload = freeze({
    schemaVersion: 'workflow.logical-payload/v1' as const,
    ref: { id: `${recipe.ref.id}.payload`, revision: recipe.ref.revision },
    scope,
    seedRecipeRef: recipe.ref,
    entities,
  });
  return parseAs(LogicalPayload, payload, 'workflow.logical-payload/v1');
}
