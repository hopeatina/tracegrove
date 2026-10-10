import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const root = join(import.meta.dirname, '..');
rmSync(join(root, 'samples'), { recursive: true, force: true });
mkdirSync(join(root, 'samples'), { recursive: true });
cpSync(join(root, 'src', 'samples'), join(root, 'samples'), { recursive: true });
console.log('samples copied');
