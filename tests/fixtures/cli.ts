import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
/** Independent CLI interpreter. No discovery, service credentials or approval authority is installed. */
export function runCli(args: string[]) {
  return spawnSync(process.execPath, process.env.WORKFLOW_VERIFY_TEST_CLI === 'compiled'
    ? [join(root, 'dist/cli/main.js'), ...args, '--json'] : ['--import', 'tsx', join(root, 'src/cli/main.ts'), ...args, '--json'],
  { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
}
