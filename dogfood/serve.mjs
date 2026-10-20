// Dogfood harness: serves `tracegrove ui` over a fresh copy of the notes sample, so tracegrove can
// test its own UI server. The operator persona's token becomes the UI session token.
// Env: PORT, TRACEGROVE_DATA_DIR, TRACEGROVE_TOKENS (JSON object token -> subject).
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startUi } from '../dist/authoring/ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const data = process.env.TRACEGROVE_DATA_DIR ?? join(here, '.data');
const tokens = JSON.parse(process.env.TRACEGROVE_TOKENS ?? '{}');
const token = Object.entries(tokens).find(([, subject]) => subject === 'operator')?.[0];
const project = join(data, 'notes');
mkdirSync(data, { recursive: true });
cpSync(join(here, '../src/samples/notes-api'), project, { recursive: true });

const server = await startUi({ dir: project, port: Number(process.env.PORT ?? 0), ...(token ? { token } : {}) });
const stop = () => { void server.close().then(() => process.exit(0)); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
