import { z } from 'zod';
import { Conflict } from './errors.ts';
const Cursor = z.object({ snapshot: z.string().min(1).max(8192), filter: z.string().regex(/^[a-f0-9]{64}$/),
  offset: z.number().int().nonnegative().safe() }).strict();
/** A cursor binds a recorded snapshot and query, never a capability or access grant. */
export function lookupOffset(cursor: string | undefined, snapshot: string, filter: string): number {
  if (!cursor) return 0;
  try {
    if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const parsed = Cursor.parse(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')));
    if (parsed.snapshot !== snapshot || parsed.filter !== filter) throw new Error();
    return parsed.offset;
  } catch { throw new Conflict('stale or foreign lookup cursor'); }
}
export function lookupCursor(snapshot: string, filter: string, offset: number): string {
  const cursor = Buffer.from(JSON.stringify(Cursor.parse({snapshot,filter,offset}))).toString('base64url');
  if (cursor.length > 1024) throw new Conflict('lookup identity exceeds the cursor bound');
  return cursor;
}
