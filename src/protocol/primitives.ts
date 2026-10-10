import { z } from 'zod';

export const LIMITS = {
  id: 200,
  shortText: 400,
  text: 4_000,
  longText: 64_000,
  url: 2_048,
  list: 500,
  bigList: 5_000,
  int: 2_147_483_647,
  cents: 1_000_000_000,
  ms: 86_400_000 * 30,
} as const;

export const HexSha256 = z.string().regex(/^[0-9a-f]{64}$/, 'sha256 hex digest');
export const DigestSchema = z.object({ algorithm: z.literal('sha256'), hex: HexSha256 }).strict();
export const IdString = z.string().min(1).max(LIMITS.id).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
export const RevisionString = z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
export const RefSchema = z.object({ id: IdString, revision: RevisionString, digest: DigestSchema }).strict();
export const ShortText = z.string().min(1).max(LIMITS.shortText);
export const Text = z.string().max(LIMITS.text);
export const UrlString = z.string().min(1).max(LIMITS.url);
export const IsoDateTime = z.string().datetime({ offset: true });
export const NonNegInt = z.number().int().min(0).max(LIMITS.int);
export const PositiveInt = z.number().int().min(1).max(LIMITS.int);
export const Cents = z.number().int().min(0).max(LIMITS.cents);
export const Millis = z.number().int().min(0).max(LIMITS.ms);
export const PositiveMillis = z.number().int().min(1).max(LIMITS.ms);
export const Sha256HexSchema = HexSha256;

export const ScopeSchema = z
  .object({
    ownerId: IdString,
    tenantId: IdString.nullable(),
    visibility: z.enum(['public', 'owner_private', 'tenant_private']),
  })
  .strict();

export const JsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string().max(LIMITS.longText), z.number().finite(), z.boolean(), z.null(), z.array(JsonValue).max(LIMITS.bigList), z.record(z.string().max(LIMITS.id), JsonValue)]),
);

export type Digest = z.infer<typeof DigestSchema>;
export type Ref = z.infer<typeof RefSchema>;
export type Scope = z.infer<typeof ScopeSchema>;

export function refList(max: number = LIMITS.list) {
  return z.array(RefSchema).max(max);
}
export function idList(max: number = LIMITS.list) {
  return z.array(IdString).max(max);
}
