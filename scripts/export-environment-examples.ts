import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { portableEnvironmentTemplate } from '../src/authoring/environmentTemplates.ts';
const root = join(import.meta.dirname, '..', 'docs', 'examples', 'portable-environments');
mkdirSync(root, { recursive: true });
for (const mode of ['alongside_runner', 'external_staging'] as const) {
  const file = join(root, `${mode}.json`); const bytes = `${JSON.stringify(portableEnvironmentTemplate(mode), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== bytes) throw new Error(`environment example drift: ${mode}`);
  } else writeFileSync(file, bytes);
}
