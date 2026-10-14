import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { parseArgs } from '../src/cli/arguments.ts';

it('rejects an unsupported run flag before reading or admitting the request', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/main.ts', 'run',
    '--request', '/definitely-not-a-tracegrove-request.json', '--dry-run'], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(2);
  expect(result.stderr).toContain('unknown_flag');
  expect(result.stderr).not.toContain('ENOENT');
});

it('parses equals syntax, space-containing paths and explicit false booleans without truthy strings', () => {
  expect(parseArgs(['run', '--request=path with spaces.json', '--json=false', '--jsonl', 'true'])).toEqual({
    command: 'run', flags: { request: 'path with spaces.json', json: false, jsonl: true },
  });
  expect(parseArgs(['validate', '--config=--filename.yaml'])).toEqual({ command: 'validate', flags: { config: '--filename.yaml' } });
});

it('supports help aliases and command help without loading a required request', () => {
  expect(parseArgs([]).command).toBe('help');
  expect(parseArgs(['-h']).command).toBe('help');
  expect(parseArgs(['run', '--help'])).toEqual({ command: 'help', flags: {} });
});

it.each([
  ['run', '--request'],
  ['run', '--request='],
  ['run', '--request=a', '--request=b'],
  ['run', '--request=a', 'ignored'],
  ['doctor', '--config=x', '--jsonl'],
  ['run', '--request=a', '--json', '--jsonl'],
  ['run', '--request=a', '--json=maybe'],
  ['plan', '--config=x', '--output=x', '--purpose=published'],
  ['cases', '--config=x', '--limit=NaN'],
  ['cases', '--config=x', '--limit=101'],
  ['run', '--request=a', '--__proto__=x'],
  ['toString'],
])('rejects ambiguous or invalid arguments: %j', (...argv) => {
  expect(() => parseArgs(argv)).toThrow();
});
