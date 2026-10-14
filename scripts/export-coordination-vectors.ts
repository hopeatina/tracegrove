import { readFileSync, writeFileSync } from 'node:fs';
import { buildCoordinationVectors } from '../conformance/coordinationVectors.ts';

const path = new URL('../conformance/coordination-vectors.json', import.meta.url);
const body = JSON.stringify({ schemaVersion: 1, vectors: buildCoordinationVectors() }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== body) throw new Error('Coordination vectors drifted; regenerate and review the portable transition diff');
} else writeFileSync(path, body);
