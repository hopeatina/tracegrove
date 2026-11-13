/**
 * The deterministic check families. Each one reads the artifact and, where a claim points outside
 * it, reads the source separately: what the artifact says about itself is never the proof.
 *
 * A finding is `fail` only when something was read and disagrees. Something that could not be read
 * is `blocked`; a claim with nothing to read it against is `unproven`. Neither is ever a pass.
 */
import type { ArtifactSpec, CheckFamily, Severity } from './spec.ts';
import { isUrl, normalize, parseArtifact, parseList, parseNumber, readable, type Sources } from './read.ts';

export type FindingStatus = 'pass' | 'fail' | 'unproven' | 'blocked' | 'excluded';
export type Finding = {
  check: CheckFamily; status: FindingStatus; severity: Severity;
  /** What the finding is about, stable across runs: a field name, a URL, a quote, a number id. */
  subject: string; detail: string; line: number | null; source: string | null; fix: string | null;
  /** Set when an exclusion applied: what the finding was before, and why it was set aside. */
  excluded?: { was: Exclude<FindingStatus, 'excluded'>; reason: string; owner: string; expires: string };
};

export type CheckEnv = {
  sources: Sources;
  /** Turns a relative link in the artifact into a reference the fetcher understands, or null when it can't be checked. */
  localLink: (link: string) => string | null;
  /** Recipients added by a seeded defect. */
  extraRecipients?: string[];
};

const cut = (text: string, max = 160): string => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where a declared field is stated: its line, and whether anything follows it. */
export function findField(lines: string[], field: string): { line: number; filled: boolean } | null {
  const name = escapeRe(field.trim());
  const heading = new RegExp(`^\\s{0,3}#{1,6}\\s+${name}\\s*:?\\s*$`, 'i');
  const label = new RegExp(`^\\s*(?:[-*]\\s+)?(?:\\*\\*|__)?${name}(?:\\*\\*|__)?\\s*(?::|\\|)\\s*(?:\\*\\*|__)?\\s*(.*)$`, 'i');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (heading.test(line)) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j]!;
        if (/^\s{0,3}#{1,6}\s/.test(next)) break;
        if (next.trim()) return { line: i + 1, filled: true };
      }
      return { line: i + 1, filled: false };
    }
    const labelled = label.exec(line);
    if (labelled) return { line: i + 1, filled: (labelled[1] ?? '').replace(/[|*_\s]/g, '').length > 0 };
  }
  return null;
}

function contract(spec: ArtifactSpec, text: string): Finding[] {
  const rule = spec.invariants.contract!;
  const lines = text.split(/\r?\n/);
  return rule.fields.map((field): Finding => {
    const found = findField(lines, field);
    const base = { check: 'contract' as const, severity: rule.severity, subject: field, source: null };
    if (!found) return { ...base, status: 'fail', detail: `"${field}" is not stated`, line: null, fix: `state ${field}, as a heading or a "${field}:" line` };
    if (!found.filled) return { ...base, status: 'fail', detail: `"${field}" is named but left empty`, line: found.line, fix: `fill in ${field}` };
    return { ...base, status: 'pass', detail: 'stated', line: found.line, fix: null };
  });
}

function forbid(spec: ArtifactSpec, text: string): Finding[] {
  const lines = text.split(/\r?\n/);
  return spec.invariants.forbid!.flatMap((rule): Finding[] => {
    const pattern = new RegExp(rule.pattern, 'i');
    const base = { check: 'forbid' as const, severity: rule.severity, subject: rule.pattern, source: null };
    const hits = lines.flatMap((line, index) => { const match = pattern.exec(line); return match ? [{ line: index + 1, text: match[0] }] : []; });
    if (!hits.length) return [{ ...base, status: 'pass', detail: 'not present', line: null, fix: null }];
    return hits.slice(0, 20).map((hit) => ({ ...base, status: 'fail' as const, detail: `"${cut(hit.text, 80)}": ${rule.reason}`, line: hit.line, fix: 'remove or reword it' }));
  });
}

async function audience(spec: ArtifactSpec, env: CheckEnv): Promise<Finding[]> {
  const rule = spec.invariants.audience!;
  const base = { check: 'audience' as const, severity: rule.severity, line: null };
  const list = await env.sources.get(rule.recipients);
  if (!list.ok) return [{ ...base, status: 'blocked', subject: rule.recipients, detail: `the recipient list could not be read: ${list.why}`, source: rule.recipients, fix: null }];
  const recipients = [...new Set([...parseList(list.text), ...(env.extraRecipients ?? []).map((r) => r.toLowerCase())])];
  const findings: Finding[] = [];
  for (const ref of rule.noneIn) {
    const blockList = await env.sources.get(ref);
    if (!blockList.ok) { findings.push({ ...base, status: 'blocked', subject: ref, detail: `this list could not be read: ${blockList.why}`, source: ref, fix: null }); continue; }
    const banned = new Set(parseList(blockList.text));
    const hits = recipients.filter((r) => banned.has(r));
    if (!hits.length) findings.push({ ...base, status: 'pass', subject: ref, detail: `none of ${recipients.length} recipients appear in it`, source: ref, fix: null });
    for (const hit of hits.slice(0, 50)) findings.push({ ...base, status: 'fail', subject: hit, detail: `${hit} is a recipient and is listed in ${ref}`, source: ref, fix: `remove ${hit} from the recipients` });
  }
  return findings;
}

function dig(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((at, key) => at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined, value);
}

async function numbers(spec: ArtifactSpec, text: string, env: CheckEnv): Promise<Finding[]> {
  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];
  for (const rule of spec.invariants.numbers!) {
    const base = { check: 'numbers' as const, severity: rule.severity, subject: rule.id, source: rule.source.ref };
    const pattern = new RegExp(rule.find, 'i');
    const at = lines.findIndex((line) => pattern.test(line));
    const stated = at < 0 ? null : parseNumber(pattern.exec(lines[at]!)?.[1] ?? '');
    if (stated === null) { findings.push({ ...base, status: 'unproven', detail: 'the artifact no longer states this number where the spec looks for it', line: null, fix: 'update the spec\'s find pattern, or drop this number check' }); continue; }
    const source = await env.sources.get(rule.source.ref);
    if (!source.ok) { findings.push({ ...base, status: 'blocked', detail: `the source could not be read: ${source.why}`, line: at + 1, fix: null }); continue; }
    let actual: number | null = null;
    if (rule.source.path !== undefined) {
      try { const got = dig(JSON.parse(source.text), rule.source.path); actual = typeof got === 'number' ? got : typeof got === 'string' ? parseNumber(got) : null; } catch { actual = null; }
    } else {
      actual = parseNumber(new RegExp(rule.source.pattern!, 'i').exec(readable(source.text))?.[1] ?? '');
    }
    if (actual === null) { findings.push({ ...base, status: 'blocked', detail: `the source has no number at ${rule.source.path ?? rule.source.pattern}`, line: at + 1, fix: null }); continue; }
    const ok = Math.abs(actual - stated) <= rule.tolerance;
    findings.push(ok
      ? { ...base, status: 'pass', detail: `${stated} matches the source`, line: at + 1, fix: null }
      : { ...base, status: 'fail', detail: `the artifact says ${stated}; the source says ${actual}`, line: at + 1, fix: `change ${stated} to ${actual}` });
  }
  return findings;
}

async function claims(spec: ArtifactSpec, text: string, env: CheckEnv): Promise<Finding[]> {
  const rule = spec.invariants.claims!;
  const artifact = parseArtifact(text, rule.minQuoteLength);
  const base = { check: 'claims' as const, severity: rule.severity };
  const findings: Finding[] = [];
  for (const quote of artifact.quotes) {
    const subject = cut(quote.text, 120);
    const refs = quote.sources.map((url) => isUrl(url) ? url : env.localLink(url)).filter((ref): ref is string => ref !== null);
    if (!refs.length) { findings.push({ ...base, status: 'unproven', subject, detail: 'a quoted passage with no source on its line', line: quote.line, source: null, fix: 'link the source next to the quote, or stop presenting it as a quote' }); continue; }
    const wanted = normalize(quote.text);
    let found: string | null = null; const problems: string[] = []; let read = 0;
    for (const ref of refs) {
      const source = await env.sources.get(ref);
      if (!source.ok) { problems.push(`${ref}: ${source.why}`); continue; }
      read++;
      if (normalize(readable(source.text)).includes(wanted)) { found = ref; break; }
    }
    if (found) findings.push({ ...base, status: 'pass', subject, detail: 'found word for word in its source', line: quote.line, source: found, fix: null });
    else if (!read) findings.push({ ...base, status: 'blocked', subject, detail: `no source could be read (${cut(problems.join('; '), 200)})`, line: quote.line, source: refs[0] ?? null, fix: null });
    else findings.push({ ...base, status: 'fail', subject, detail: 'these words are not in the cited source', line: quote.line, source: refs[0] ?? null, fix: 'quote the source exactly, cite the right source, or remove the quote' });
  }
  const mustCite = rule.mustCite.map((pattern) => new RegExp(pattern, 'i'));
  const linked = new Set(artifact.links.map((link) => link.line));
  artifact.lines.forEach((line, index) => {
    const hit = mustCite.map((pattern) => pattern.exec(line)).find((match) => match !== null);
    if (hit && !linked.has(index + 1)) findings.push({ ...base, status: 'unproven', subject: cut(line.trim(), 120), detail: `"${cut(hit[0], 60)}" is stated with no source`, line: index + 1, source: null, fix: 'link the source on this line' });
  });
  if (!findings.length) findings.push({ ...base, status: 'pass', subject: 'claims', detail: 'no quoted passages or lines that need a source', line: null, source: null, fix: null });
  return findings;
}

async function links(spec: ArtifactSpec, text: string, env: CheckEnv): Promise<Finding[]> {
  const rule = spec.invariants.links!;
  const base = { check: 'links' as const, severity: rule.severity };
  const first = new Map<string, number>();
  for (const link of parseArtifact(text).links) if (!first.has(link.url)) first.set(link.url, link.line);
  const findings: Finding[] = [];
  for (const [url, line] of first) {
    if (isUrl(url)) {
      let query: URLSearchParams | null = null;
      try { query = new URL(url).searchParams; } catch { findings.push({ ...base, status: 'fail', subject: url, detail: 'not a valid URL', line, source: null, fix: 'correct the link' }); continue; }
      const missing = rule.requireParams.filter((name) => !query.has(name));
      if (missing.length) { findings.push({ ...base, status: 'fail', subject: url, detail: `missing ${missing.join(', ')}`, line, source: null, fix: `add ${missing.join(', ')} to the link` }); continue; }
    }
    if (!rule.resolve) { findings.push({ ...base, status: 'pass', subject: url, detail: 'well formed', line, source: null, fix: null }); continue; }
    const ref = isUrl(url) ? url : env.localLink(url.split('#')[0] ?? url);
    if (ref === null) { findings.push({ ...base, status: 'unproven', subject: url, detail: 'a relative link that cannot be followed from here', line, source: null, fix: null }); continue; }
    const got = await env.sources.get(ref);
    // A page that answers, even one too large to keep, is a working link.
    if (got.ok || (got.status !== null && got.status < 400)) findings.push({ ...base, status: 'pass', subject: url, detail: 'resolves', line, source: null, fix: null });
    else if (!isUrl(url) || got.status === 404 || got.status === 410) findings.push({ ...base, status: 'fail', subject: url, detail: isUrl(url) ? `the page is gone (status ${got.status})` : got.why, line, source: null, fix: 'point the link at a page that exists' });
    else findings.push({ ...base, status: 'blocked', subject: url, detail: `could not confirm the link: ${got.why}`, line, source: null, fix: null });
  }
  if (!findings.length) findings.push({ ...base, status: 'pass', subject: 'links', detail: 'no links', line: null, source: null, fix: null });
  return findings;
}

/** Runs one family over the given text. Seeded-defect reruns call this with altered text. */
export async function runFamily(family: CheckFamily, spec: ArtifactSpec, text: string, env: CheckEnv): Promise<Finding[]> {
  switch (family) {
    case 'contract': return contract(spec, text);
    case 'forbid': return forbid(spec, text);
    case 'audience': return audience(spec, env);
    case 'numbers': return numbers(spec, text, env);
    case 'claims': return claims(spec, text, env);
    case 'links': return links(spec, text, env);
  }
}
