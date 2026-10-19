import { chmodSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const root = join(import.meta.dirname, '..');
rmSync(join(root, 'samples'), { recursive: true, force: true });
mkdirSync(join(root, 'samples'), { recursive: true });
const skip = ['.tracegrove', '.venv', '__pycache__', '.workflow-verify'];
cpSync(join(root, 'src', 'samples'), join(root, 'samples'), { recursive: true, filter: (src) => !skip.some((name) => src.split(/[\\/]/).includes(name)) });
chmodSync(join(root, 'dist', 'cli', 'main.js'), 0o755);
console.log('samples copied');
