import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Blocked } from '../core/errors.ts';
import { djangoBootstrap } from '../hosts/launchTemplates.ts';
import { applicationCwd } from './appLocation.ts';
import type { AuthoringConfig } from './schema.ts';

export function applicationLaunch(config: AuthoringConfig, root: string, appRoot: string): { cwd: string; command: string; args: string[]; runtime: string } {
  const app = config.app; const dependencyRoot = resolve(root, app.root);
  const configured = app.python && app.python.includes('/') ? resolve(root, app.python) : app.python;
  const python = configured ?? [appRoot, dependencyRoot].map(dir => join(dir, '.venv/bin/python')).find(path => existsSync(path)) ?? 'python3';
  const cwd = applicationCwd(app, appRoot);
  const fail = (code: string, detail: string, action: string): never => { throw new Blocked([{ code, detail, owner: 'test author', action }]); };
  switch (app.adapter) {
    case 'node':
      if (!app.entry) fail('missing_entry', 'app.entry is required for adapter node', 'set app.entry');
      return { cwd, command: process.execPath, args: [app.entry!], runtime: `node${process.versions.node.split('.')[0]}` };
    case 'fastapi':
      if (!app.entry) fail('missing_entry', 'app.entry is required for adapter fastapi', 'set app.entry to module:app');
      return { cwd, command: python, args: ['-m', 'uvicorn', app.entry!, '--host', '127.0.0.1', '--port', '{port}'], runtime: 'python' };
    case 'django':
      if (!existsSync(join(cwd, 'manage.py'))) fail('missing_manage_py', 'app.entry must contain manage.py', 'set app.entry to the Django folder');
      return { cwd, command: python, args: ['-c', djangoBootstrap('{port}')], runtime: 'python' };
    case 'command':
      if (!app.run) fail('missing_run', 'app.run is required for adapter command', 'set app.run');
      return { cwd, command: 'sh', args: ['-c', `exec ${app.run}`], runtime: 'command' };
  }
}
