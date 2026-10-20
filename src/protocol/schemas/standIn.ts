import { z } from 'zod';
import { JsonValue, NonNegInt } from '../primitives.ts';

/**
 * Stand-ins replace a third party the app calls (a calendar, CRM, payment provider, automation webhook)
 * with a recording HTTP server on loopback. The host starts each one before the app and hands its URL to
 * the app in an environment variable. Steps can make it fail for a while, and read back what the app sent:
 * the effect checked where it lands, not where the app says it went.
 */
const Name = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/);
const Method = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const RoutePath = z.string().min(1).max(512).regex(/^\/[A-Za-z0-9_.~:/{}*-]*$/);
export const StandInRoute = z.object({ method: Method, path: RoutePath }).strict();

export const StandInResponse = z.object({
  ...StandInRoute.shape,
  status: z.number().int().min(100).max(599),
  json: JsonValue.optional(),
}).strict();

export const StandInSpec = z.object({
  name: Name,
  env: z.string().min(1).max(64).regex(/^[A-Z_][A-Z0-9_]*$/),
  responses: z.array(StandInResponse).max(64),
}).strict();
export type StandInSpec = z.infer<typeof StandInSpec>;

/** Make matching requests fail, or answer slowly, for the next `times` calls. */
export const StandInFault = z.object({
  standIn: Name,
  route: StandInRoute,
  times: z.number().int().min(1).max(100),
  status: z.number().int().min(100).max(599).optional(),
  delayMs: z.number().int().min(1).max(60_000).optional(),
  drop: z.boolean().optional(),
}).strict().refine(f => f.status !== undefined || f.delayMs !== undefined || f.drop === true, 'a fault needs status, delayMs or drop');
export type StandInFault = z.infer<typeof StandInFault>;

export const StandInQuery = z.object({ standIn: Name, route: StandInRoute.nullable() }).strict();
export type StandInQuery = z.infer<typeof StandInQuery>;

export const StandInCall = z.object({
  method: z.string().max(16), path: z.string().max(2048), query: z.record(z.string(), z.string()),
  json: JsonValue.nullable(), text: z.string().max(65_536).nullable(), status: z.number().int(), faulted: z.boolean(), at: z.string(),
}).strict();
export const StandInObservation = z.object({
  kind: z.literal('stand_in'), standIn: Name, route: StandInRoute.nullable(),
  count: NonNegInt, calls: z.array(StandInCall).max(200), attempts: NonNegInt,
}).strict();
export type StandInObservation = z.infer<typeof StandInObservation>;
export const StandInArmObservation = z.object({ kind: z.literal('stand_in_fault'), standIn: Name, route: StandInRoute, times: NonNegInt, attempts: NonNegInt }).strict();
export type StandInArmObservation = z.infer<typeof StandInArmObservation>;
