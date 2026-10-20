import { z } from 'zod';
export const CoordinationKey=z.string().min(1).max(256);
export const CoordinationCounter=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const CoordinationLeaseDuration=CoordinationCounter.positive().max(300000);
