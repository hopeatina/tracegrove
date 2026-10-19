/**
 * Branded secret values. A `Secret` cannot be serialized: `toJSON` throws, `String()` and
 * `util.inspect` print a redaction marker, and the raw value is reachable only through `reveal()`.
 * Every live secret value is also registered with the process redactor so any text that leaves the
 * process (events, summaries, logs) can be scrubbed as a second line of defence.
 */
import { inspect } from 'node:util';

const values = new WeakMap<Secret, string>();
const live = new Set<string>();
export const REDACTED = '<redacted>';

export class SecretSerializationError extends Error {
  constructor() { super('secret_serialization_refused: a Secret value cannot be serialized'); this.name = 'SecretSerializationError'; }
}

export class Secret {
  declare readonly __brand: 'tracegrove.secret';
  private constructor(value: string) { values.set(this, value); if (value.length >= 6) live.add(value); Object.freeze(this); }
  static of(value: string): Secret {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError('secret value must be a non-empty string');
    return new Secret(value);
  }
  /** The only way to read the value. Callers put it straight into a request header and nowhere else. */
  reveal(): string { const value = values.get(this); if (value === undefined) throw new Error('secret was disposed'); return value; }
  /** Forget the value after the attempt; later reveal() throws. */
  dispose(): void { const value = values.get(this); if (value !== undefined) live.delete(value); values.delete(this); }
  toJSON(): never { throw new SecretSerializationError(); }
  toString(): string { return REDACTED; }
  [Symbol.toPrimitive](): string { return REDACTED; }
  [inspect.custom](): string { return 'Secret(<redacted>)'; }
}

export const isSecret = (value: unknown): value is Secret => value instanceof Secret;

/** Replace every live secret value in `text`; used on any text that leaves the process. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const value of live) if (out.includes(value)) out = out.split(value).join(REDACTED);
  return out;
}

/** Deep-redact a JSON-like value; Secret instances become the marker. */
export function redactValue<T>(value: T): T {
  if (value instanceof Secret) return REDACTED as T;
  if (typeof value === 'string') return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map(redactValue) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v)])) as T;
  return value;
}
