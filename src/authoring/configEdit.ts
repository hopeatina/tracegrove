/**
 * `tracegrove config get|set|patch` and `env add`: structured, validated edits to
 * tracegrove.config.yaml. Edits go through the `yaml` Document API, so comments and layout survive;
 * every result is validated against the same zod schema as compile, and `--dry-run` shows the diff.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { isMap, parse as parseYaml, parseDocument, type Document } from 'yaml';
import { Blocked } from '../core/errors.ts';
import { AuthoringConfig } from './schema.ts';
import { lineDiff } from './heal.ts';

export type ConfigEditResult = { schemaVersion: 'tracegrove.config-edit/v1'; path: string; dryRun: boolean; changed: boolean; diff: string; written: boolean };
type Segment = string | number;

export function configPath(path: string): Segment[] {
  if (!/^[A-Za-z_$][A-Za-z0-9_$-]*(?:\.[A-Za-z0-9_$-]+|\[\d+\])*$/.test(path)) throw new Blocked([{ code: 'invalid_config_path', detail: path, owner: 'agent', action: 'use a dot path such as environments.staging.target.url' }]);
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').map(part => (/^\d+$/.test(part) ? Number(part) : part));
}

function editableDocument(file: string): { text: string; doc: Document } {
  if (!/\.ya?ml$/.test(file)) throw new Blocked([{ code: 'config_edit_unsupported', detail: `${basename(file)} is TypeScript; config set edits YAML only`, owner: 'developer', action: 'edit tracegrove.config.ts by hand' }]);
  const text = readFileSync(file, 'utf8');
  const doc = parseDocument(text, { keepSourceTokens: true });
  if (doc.errors.length) throw new Blocked([{ code: 'invalid_yaml', detail: doc.errors[0]!.message.split('\n')[0]!, owner: 'agent', action: `fix ${basename(file)}` }]);
  return { text, doc };
}

/** Parse a CLI value as YAML (so `true`, `5`, `[a, b]` and `{ kind: bearer }` work); plain words stay strings. */
export function parseValue(text: string): unknown {
  try { return parseYaml(text, { strict: true }); } catch { return text; }
}

function validated(file: string, doc: Document, path: string): string {
  const next = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
  const parsed = AuthoringConfig.safeParse(parseYaml(next) ?? {});
  if (!parsed.success) throw new Blocked(parsed.error.issues.slice(0, 8).map(issue => ({ code: 'config_edit_invalid', detail: `${path}: ${issue.path.join('.') || '(root)'}: ${issue.message}`, owner: 'agent', action: `tracegrove config get ${issue.path.slice(0, -1).join('.') || path} to see the current value` })));
  void file;
  return next;
}

function commit(file: string, before: string, after: string, path: string, dryRun: boolean): ConfigEditResult {
  const changed = before !== after;
  if (changed && !dryRun) {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, after);
    renameSync(tmp, file);
  }
  return { schemaVersion: 'tracegrove.config-edit/v1', path, dryRun, changed, diff: changed ? lineDiff(before, after, basename(file)) : '', written: changed && !dryRun };
}

export function configGet(file: string, path?: string): { schemaVersion: 'tracegrove.config-get/v1'; path: string | null; value: unknown; effective: unknown } {
  const { doc } = editableDocument(file);
  const raw = doc.toJS() as unknown;
  const effective = AuthoringConfig.safeParse(raw);
  const pick = (value: unknown) => (path ? configPath(path).reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string | number, unknown>)[k] : undefined), value) : value);
  return { schemaVersion: 'tracegrove.config-get/v1', path: path ?? null, value: pick(raw) ?? null, effective: effective.success ? pick(effective.data) ?? null : null };
}

export function configSet(file: string, path: string, value: unknown, options: { dryRun?: boolean } = {}): ConfigEditResult {
  const { text, doc } = editableDocument(file);
  const segments = configPath(path);
  if (value === undefined || value === null) doc.deleteIn(segments);
  else doc.setIn(segments, doc.createNode(value, { flow: false }));
  return commit(file, text, validated(file, doc, path), path, options.dryRun === true);
}

/** RFC 7396 merge patch, applied key by key so untouched comments and order survive. */
export function configPatch(file: string, patch: unknown, options: { dryRun?: boolean } = {}): ConfigEditResult {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Blocked([{ code: 'config_edit_invalid', detail: 'a patch is a JSON object (merge patch)', owner: 'agent', action: `tracegrove config patch '{"environments":{"staging":{"agents":"ask"}}}'` }]);
  const { text, doc } = editableDocument(file);
  const apply = (prefix: Segment[], value: Record<string, unknown>) => {
    for (const [key, next] of Object.entries(value)) {
      const at = [...prefix, key];
      if (next === null) doc.deleteIn(at);
      else if (next && typeof next === 'object' && !Array.isArray(next) && isMap(doc.getIn(at, true))) apply(at, next as Record<string, unknown>);
      else doc.setIn(at, doc.createNode(next));
    }
  };
  apply([], patch as Record<string, unknown>);
  return commit(file, text, validated(file, doc, '(patch)'), '(patch)', options.dryRun === true);
}

/** `env add`: a validated shortcut that writes one environments.<name> entry. */
export function envAddPatch(input: { name: string; url?: string | null; personas: string[]; class?: string | null; writes?: string | null; agents?: string | null; health?: string | null; whoami?: string | null }): Record<string, unknown> {
  if (!input.url) throw new Blocked([{ code: 'missing_argument', detail: 'env add needs --url <https://…> (compose and container targets: use tracegrove config patch)', owner: 'agent', action: 'tracegrove env add <name> --url https://staging.example.com --persona owner=env:OWNER_TOKEN' }]);
  const personas = Object.fromEntries(input.personas.map(entry => {
    const match = entry.match(/^([A-Za-z][A-Za-z0-9_-]*)=(.+)$/);
    if (!match) throw new Blocked([{ code: 'invalid_argument', detail: `--persona ${entry}: use <persona>=<secret reference>`, owner: 'agent', action: '--persona owner=aws-sm://app/staging/personas#owner' }]);
    return [match[1]!, { from: match[2]! }];
  }));
  const whoami = input.whoami?.match(/^(\/[^ ]*)\s*(?:#|\s)\s*([A-Za-z_][A-Za-z0-9_.]*)$/);
  return { environments: { [input.name]: {
    target: { url: input.url, ...(input.health ? { health: input.health } : {}) },
    ...(input.class ? { class: input.class } : {}), ...(input.writes ? { writes: input.writes } : {}), ...(input.agents ? { agents: input.agents } : {}),
    ...(Object.keys(personas).length ? { personas } : {}),
    ...(whoami ? { whoami: { GET: whoami[1], subject: whoami[2] } } : {}),
  } } };
}

