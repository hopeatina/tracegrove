// Usage: node --import tsx scripts/materialize-payload.ts <recipe.yaml> <output.yaml>
import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { dirname, resolve } from 'node:path';
import { ProjectLoader, AUTHORING_SCOPE } from '../src/core/corpus.ts';
import { materializeLogicalPayload } from '../src/core/generators.ts';
import { SeedRecipe, parseAs } from '../src/protocol/index.ts';

const [recipePath, outPath] = process.argv.slice(2);
if (!recipePath || !outPath) throw new Error('usage: materialize-payload <recipe> <out>');
const abs = resolve(recipePath);
const loader = new ProjectLoader(resolve(dirname(abs), '..'));
const recipe = parseAs(SeedRecipe, loader.loadDocument(abs).value, 'recipe');
const payload = materializeLogicalPayload(recipe, AUTHORING_SCOPE);
// Authoring form: drop the digest (the loader recomputes it) and the scope (the loader injects it).
const { scope: _s, ...rest } = payload;
const authoring = { ...rest, ref: { id: payload.ref.id, revision: payload.ref.revision } };
writeFileSync(outPath, stringify(authoring));
console.log(`wrote ${outPath}`);
void readFileSync; void parse;
