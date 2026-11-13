/**
 * Check specs for work that is not code: plans, briefs, launch copy, audits. A spec is written for
 * one artifact, from its own brief. Nothing here prescribes a shape or a template: every invariant is
 * optional, and each one is about what must hold however the piece is written (claims are true,
 * numbers recompute, links work, the audience is the intended one).
 *
 * Checks decide. Promises are plain-language statements graded by a judge that starts as advice and
 * only blocks once people's sign-offs show it can be trusted (see `judgeAuthority` in run.ts).
 */
import { z } from 'zod';

export const Severity = z.enum(['block', 'warn', 'note']);
export type Severity = z.infer<typeof Severity>;
export const CheckFamily = z.enum(['media', 'contract', 'require', 'forbid', 'length', 'audience', 'numbers', 'claims', 'links']);
export type CheckFamily = z.infer<typeof CheckFamily>;

const Text = z.string().min(1).max(2000);
const Ref = z.string().min(1).max(2048).describe('A file path relative to the spec, or an http(s) URL.');
const Pattern = z.string().min(1).max(500).refine((value) => { try { new RegExp(value, 'i'); return true; } catch { return false; } }, 'must be a valid regular expression');
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');

const Contract = z.object({
  fields: z.array(z.string().min(1).max(120)).min(1).max(40).describe('Labels this artifact itself promises to state, such as Owner or Stop condition. Matched as a heading or a "Label:" line with content.'),
  severity: Severity.default('block'),
}).strict();

const Claims = z.object({
  minQuoteLength: z.number().int().min(4).max(200).default(12),
  mustCite: z.array(Pattern).max(40).default([]).describe('Lines matching any of these must carry a link. A match without one is unproven, not failed.'),
  unsourcedQuotes: z.enum(['block', 'note', 'ignore']).default('note').describe('Quoted text with no link on its line. Real documents quote draft copy, defined terms and slogans, so by default these are counted in one note. block: every quotation must carry its source.'),
  severity: Severity.default('block'),
}).strict();

const NumberCheck = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/).max(64),
  find: Pattern.describe('A regular expression with one capture group around the number as the artifact writes it.'),
  source: z.object({ ref: Ref, path: z.string().min(1).max(200).optional().describe('Dotted path into a JSON source.'), pattern: Pattern.optional().describe('For a text source: one capture group around the number.') }).strict()
    .refine((s) => (s.path === undefined) !== (s.pattern === undefined), 'give exactly one of path or pattern'),
  tolerance: z.number().min(0).max(1e9).default(0),
  severity: Severity.default('block'),
}).strict();

const Links = z.object({
  resolve: z.boolean().default(true),
  requireParams: z.array(z.string().min(1).max(60)).max(10).default([]).describe('Query parameters every external link must carry, such as utm_source.'),
  severity: Severity.default('block'),
}).strict();

const Forbid = z.object({
  pattern: Pattern,
  reason: Text,
  example: z.string().min(1).max(200).optional().describe('Text that matches the pattern; used to prove the check can fail when the pattern is not a plain phrase.'),
  unless: Pattern.optional().describe('A line that also matches this is not a hit: for a piece that names the banned wording in order to rule it out.'),
  severity: Severity.default('block'),
}).strict();

const Require = z.object({
  pattern: Pattern,
  reason: Text,
  severity: Severity.default('block'),
}).strict();

const Length = z.object({
  minWords: z.number().int().min(1).max(1_000_000).optional(),
  maxWords: z.number().int().min(1).max(1_000_000).optional(),
  severity: Severity.default('block'),
}).strict().refine((l) => l.minWords !== undefined || l.maxWords !== undefined, 'give minWords, maxWords or both')
  .refine((l) => l.minWords === undefined || l.maxWords === undefined || l.minWords <= l.maxWords, 'minWords cannot exceed maxWords');

const Media = z.object({
  formats: z.array(z.string().min(2).max(10)).min(1).max(12).optional().describe('Allowed file formats, read from the bytes and not the file name: png, jpeg, gif, webp, svg, avif, mp4, mov, webm.'),
  minWidth: z.number().int().min(1).max(100_000).optional(), maxWidth: z.number().int().min(1).max(100_000).optional(),
  minHeight: z.number().int().min(1).max(100_000).optional(), maxHeight: z.number().int().min(1).max(100_000).optional(),
  aspect: z.string().regex(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/, 'write it as width:height, such as 16:9').optional().describe('Width to height, within 1%.'),
  maxBytes: z.number().int().min(1).optional(),
  minSeconds: z.number().min(0).max(86_400).optional(), maxSeconds: z.number().min(0).max(86_400).optional(),
  severity: Severity.default('block'),
}).strict().refine((m) => Object.keys(m).some((key) => key !== 'severity'), 'give at least one delivery spec');

const Audience = z.object({
  recipients: Ref.describe('One recipient per line, or a CSV whose first column is the recipient.'),
  noneIn: z.array(Ref).min(1).max(10).describe('Lists nobody in recipients may appear in: suppressed, unsubscribed, existing customers.'),
  severity: Severity.default('block'),
}).strict();

export const Exclusion = z.object({
  check: CheckFamily,
  match: z.string().min(1).max(300).optional().describe('Only findings whose subject or detail contains this text. Leave out to exclude the whole check.'),
  reason: Text,
  owner: z.string().min(1).max(120),
  expires: Day,
}).strict();
export type Exclusion = z.infer<typeof Exclusion>;

export const SeededDefect = z.object({
  check: CheckFamily,
  replace: z.object({ find: z.string().min(1).max(500), with: z.string().max(500) }).strict().optional(),
  addRecipient: z.string().min(1).max(320).optional(),
}).strict().refine((d) => (d.replace === undefined) !== (d.addRecipient === undefined), 'give exactly one of replace or addRecipient');
export type SeededDefect = z.infer<typeof SeededDefect>;

export const Promise_ = z.union([Text, z.object({ text: Text, authority: z.enum(['advice', 'gate']).default('advice') }).strict()])
  .transform((value) => typeof value === 'string' ? { text: value, authority: 'advice' as const } : value);

export const ArtifactSpec = z.object({
  schemaVersion: z.literal('tracegrove.artifact-check/v1').default('tracegrove.artifact-check/v1'),
  id: z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/, 'lowercase letters, digits, dot, dash, underscore').max(120),
  title: z.string().min(1).max(200).optional(),
  artifact: Ref,
  transcript: Ref.optional().describe('For an image or video: a text file with the words in it, written out. Without one, the words are read by a model when a judge is available.'),
  kind: z.string().min(1).max(120).optional().describe('A label such as sales.send_plan. It never selects checks.'),
  brief: z.object({ ref: Ref, sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict().optional().describe('The brief this spec was drafted from, and the hash of the bytes read. A check run reports when the brief has changed since.'),
  draftedBy: z.string().min(1).max(120).optional().describe('Who or what drafted the spec: a model name, or rules.'),
  afterlife: z.enum(['once', 'living', 'hypothesis']).default('once').describe('once: never rechecked after release. living: recheck when a source changes. hypothesis: one more run on reviewDate.'),
  reviewDate: Day.optional(),
  promises: z.array(Promise_).max(20).default([]).describe('What this piece must do, in plain words, drafted from its brief. Graded by a judge with cited lines.'),
  invariants: z.object({
    media: Media.optional().describe('Delivery specs for an image or video, read from the file itself.'),
    contract: Contract.optional(),
    claims: Claims.optional(),
    numbers: z.array(NumberCheck).max(60).optional(),
    links: Links.optional(),
    forbid: z.array(Forbid).max(60).optional(),
    require: z.array(Require).max(60).optional().describe('Wording that must appear somewhere: a reference number, a disclosure, a named term.'),
    length: Length.optional(),
    audience: Audience.optional(),
  }).strict().default({}),
  exclusions: z.array(Exclusion).max(60).default([]),
  seededDefects: z.array(SeededDefect).max(60).default([]).describe('Extra defects on top of the automatic ones. Each must make its check fail.'),
  shipRule: z.object({
    maxUnproven: z.number().int().min(0).max(1000).default(0),
    requireProvenChecks: z.boolean().default(true).describe('A check counts only once it has failed on a seeded defect.'),
  }).strict().default({ maxUnproven: 0, requireProvenChecks: true }),
}).strict().superRefine((spec, ctx) => {
  if (spec.afterlife === 'hypothesis' && !spec.reviewDate) ctx.addIssue({ code: 'custom', path: ['reviewDate'], message: 'a hypothesis needs a reviewDate' });
  const ids = (spec.invariants.numbers ?? []).map((n) => n.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['invariants', 'numbers'], message: 'number ids must be unique' });
});
export type ArtifactSpec = z.infer<typeof ArtifactSpec>;

/** The check families a spec actually uses, in the order they run (cheapest first). */
export function familiesIn(spec: ArtifactSpec): CheckFamily[] {
  const i = spec.invariants;
  return ([['media', i.media], ['contract', i.contract], ['require', i.require?.length ? i.require : undefined], ['forbid', i.forbid?.length ? i.forbid : undefined], ['length', i.length], ['audience', i.audience], ['numbers', i.numbers?.length ? i.numbers : undefined], ['claims', i.claims], ['links', i.links]] as const)
    .filter(([, value]) => value !== undefined).map(([name]) => name);
}

const Agree = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/).max(64),
  find: Pattern.describe('A regular expression with one capture group around the value: a price, a date, a code, a link.'),
  in: z.array(z.string().min(1).max(120)).min(2).max(40).optional().describe('Member ids that must each state it. Left out: every member that states it must state the same thing.'),
  severity: Severity.default('block'),
}).strict();

/** Several pieces released together: a campaign, a launch. Each member keeps its own spec; the set checks what must hold across them. */
export const ArtifactSet = z.object({
  schemaVersion: z.literal('tracegrove.artifact-set/v1'),
  id: z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/, 'lowercase letters, digits, dot, dash, underscore').max(120),
  title: z.string().min(1).max(200).optional(),
  kind: z.string().min(1).max(120).optional(),
  members: z.array(Ref).min(2).max(40).describe('Paths to the check spec of each piece, relative to this file.'),
  agree: z.array(Agree).max(40).default([]).describe('Values that must be the same wherever they appear: the price in the email, on the page and in the ad.'),
  promises: z.array(Promise_).max(20).default([]).describe('What the pieces must do together, judged with all of them in view.'),
}).strict().superRefine((set, ctx) => {
  const ids = set.agree.map((a) => a.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['agree'], message: 'agree ids must be unique' });
});
export type ArtifactSet = z.infer<typeof ArtifactSet>;
