import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize, exportJsonSchemas } from '../src/protocol/index.ts';
import { exportAuthoringSchemas } from '../src/authoring/schema.ts';

const check = process.argv.includes('--check');
const dir = join(import.meta.dirname, '..', 'schema');
mkdirSync(dir, { recursive: true });
const schemas = { ...exportJsonSchemas(), ...exportAuthoringSchemas() };
let drift = 0;
for (const [name, schema] of Object.entries(schemas)) {
  const file = join(dir, `${name.replace(/[\/.]/g, '_')}.json`);
  const next = `${JSON.stringify(JSON.parse(canonicalize(schema)), null, 2)}\n`;
  if (check) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== next) { drift += 1; console.error(`schema drift: ${file}`); }
  } else {
    writeFileSync(file, next);
  }
}
if (check && drift > 0) { console.error(`${drift} exported schema file(s) out of date; run npm run schema:export`); process.exit(1); }
console.log(check ? `schemas in sync (${Object.keys(schemas).length})` : `exported ${Object.keys(schemas).length} schemas to ${dir}`);
