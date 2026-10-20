/**
 * Capture-time redaction of client data. Patterns are part of the frozen case (and so of its digest),
 * and they run on every step observation before it reaches events, receipts or the run folder, so
 * matching values never touch disk. Captured variables (ids a later step needs) are taken before
 * redaction; assertions are re-evaluated on the redacted evidence, so assert on structure
 * (status, present, absent) rather than on a value a pattern hides.
 */
export const BUILTIN_REDACTIONS = {
  email: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
  phone: '(?:\\+?1[-. ]?)?(?:\\(\\d{3}\\)|\\b\\d{3})[-. ]\\d{3}[-. ]\\d{4}\\b|\\b\\d{3}[-. ]\\d{4}\\b',
  card: '\\b(?:\\d[ -]?){12,18}\\d\\b',
  ssn: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
} as const;
export type BuiltinRedaction = keyof typeof BUILTIN_REDACTIONS;
export type RedactionRule = { name: string; pattern: string };

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export function redactionRules(entries: ReadonlyArray<BuiltinRedaction | RedactionRule>): RedactionRule[] {
  return entries.map((entry) => typeof entry === 'string' ? { name: entry, pattern: BUILTIN_REDACTIONS[entry] } : entry);
}

/** Returns a deep scrubber, or null when there are no rules (the common case costs nothing). */
export function scrubber(rules: ReadonlyArray<RedactionRule> | undefined): (<T>(value: T) => T) | null {
  if (!rules?.length) return null;
  const compiled = rules.map((rule) => ({ name: rule.name, regex: new RegExp(rule.pattern, 'g') }));
  const text = (value: string) => compiled.reduce((out, rule) => out.replace(rule.regex, (match) =>
    rule.name === 'card' && !luhn(match.replace(/\D/g, '')) ? match : `[redacted:${rule.name}]`), value);
  const deep = (value: unknown): unknown => {
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(deep);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deep(item)]));
    return value;
  };
  return <T>(value: T) => deep(value) as T;
}
