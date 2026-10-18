import { resolve } from 'node:path';
import type { AuthoringConfig } from './schema.ts';

export function applicationCwd(app: AuthoringConfig['app'], appRoot: string): string {
  return app.adapter === 'django' ? resolve(appRoot, app.entry ?? '.') : appRoot;
}
