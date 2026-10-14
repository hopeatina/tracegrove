import type { ActionRegistry } from '../protocol/index.ts';

type Action = ActionRegistry['actions'][number];

/** The HTTP status-only absence contract requires an explicit missing-resource response. */
export function cleanupActionError(action: Action | undefined, absence: Action | undefined,
  absenceStatus: number): string | null {
  if (!action || !absence) return 'cleanup requires registered deletion and absence readback';
  if (action.effect !== 'delete' || ['GET', 'HEAD', 'OPTIONS'].includes(action.method)) {
    return 'cleanup requires a registered delete effect with a mutating method';
  }
  if (absence.effect !== 'read' || !['GET', 'HEAD'].includes(absence.method)) {
    return 'absence readback requires a registered read effect using GET or HEAD';
  }
  if (![404, 410].includes(absenceStatus)) return 'status-only absence readback requires 404 or 410';
  return null;
}
