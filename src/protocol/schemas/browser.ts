import { z } from 'zod';

const name = z.string().min(1).max(512);
export const BrowserLocator = z.discriminatedUnion('by', [
  z.object({ by: z.literal('role'), role: z.enum(['button', 'link', 'textbox', 'checkbox', 'heading', 'status']), name }).strict(),
  z.object({ by: z.literal('label'), name }).strict(),
  z.object({ by: z.literal('testId'), name }).strict(),
]);
export type BrowserLocator = z.infer<typeof BrowserLocator>;

export const BrowserCommand = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('navigate'), path: z.string().min(1).max(4096).startsWith('/') }).strict(),
  z.object({ kind: z.literal('click'), target: BrowserLocator }).strict(),
  z.object({ kind: z.literal('fill'), target: BrowserLocator, value: z.string().max(8192) }).strict(),
  z.object({ kind: z.literal('read'), target: BrowserLocator }).strict(),
]);
export type BrowserCommand = z.infer<typeof BrowserCommand>;

export const BrowserObservation = z.object({
  kind: z.enum(['navigate', 'click', 'fill', 'read']),
  url: z.string().max(4096),
  status: z.number().int().min(100).max(599).nullable(),
  text: z.string().max(8192).nullable(),
  textTruncated: z.boolean(),
}).strict();
export type BrowserObservation = z.infer<typeof BrowserObservation>;
