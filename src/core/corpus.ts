/**
 * Project corpus: human-readable YAML/JSON authoring files beside the product source.
 * `{ $file: './path' }` placeholders become frozen Refs of the loaded, validated, hashed
 * document. The resolver publishes a frozen CorpusManifest; indexes are rebuildable.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { userInfo } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import {
  CorpusManifest, RefSchema, SCHEMA_REGISTRY, SchemaViolation, WorkflowConfig, Suite,
  freeze, parseAs, refKey, sameDigest, selfDigest, sha256Hex, validateDocument,
  type Ref, type Scope, type SchemaVersion,
} from '../protocol/index.ts';

export type LoadedDocument = { ref: Ref; schemaVersion: SchemaVersion; value: unknown; sourcePath: string; sourceDigest: string };

/**
 * Scope of the local actor: derived from the controller's process owner (or an explicit
 * WORKFLOW_VERIFY_OWNER override). It is the requested scope on execution records only.
 */
export function localScope(): Scope {
  let user = process.env.WORKFLOW_VERIFY_OWNER ?? '';
  if (!user) { try { user = userInfo().username; } catch { user = 'local'; } }
  user = user.replace(/[^A-Za-z0-9._-]/g, '_') || 'local';
  return { ownerId: `local:${user}`, tenantId: null, visibility: 'owner_private' };
}

/**
 * Scope stamped into reviewed authoring definitions when the file declares none. It is a
 * constant so a definition's content digest is identical on every machine; a scope is never
 * an access grant, and the controller derives real authority separately at admission.
 */
export const AUTHORING_SCOPE: Scope = { ownerId: 'authoring', tenantId: null, visibility: 'owner_private' };

export class CorpusStore {
  private readonly byKey = new Map<string, LoadedDocument>();
  private readonly byIdRevision = new Map<string, LoadedDocument>();

  constructor(readonly manifest: CorpusManifest, documents: LoadedDocument[]) {
    for (const doc of documents) this.add(doc);
  }

  private add(doc: LoadedDocument): void {
    const key = refKey(doc.ref);
    const idRev = `${doc.ref.id}@${doc.ref.revision}`;
    const existing = this.byIdRevision.get(idRev);
    if (existing && !sameDigest(existing.ref.digest, doc.ref.digest)) {
      throw new SchemaViolation('corpus', [`conflicting definitions for ${idRev}: ${existing.sourcePath} and ${doc.sourcePath}`]);
    }
    this.byKey.set(key, doc);
    this.byIdRevision.set(idRev, doc);
  }

  /** Exact ref lookup; verifies the stored bytes still hash to the requested digest. */
  get(ref: Ref): LoadedDocument {
    const doc = this.byKey.get(refKey(ref));
    if (!doc) throw new SchemaViolation('corpus', [`unresolved ref ${refKey(ref)}`]);
    const recomputed = selfDigest(doc.value as { ref: Ref });
    if (!sameDigest(recomputed, ref.digest)) throw new SchemaViolation('corpus', [`digest mismatch for ${refKey(ref)}`]);
    return doc;
  }

  getAs<T extends z.ZodType<unknown>>(schema: T, ref: Ref): z.infer<T> {
    const doc = this.get(ref);
    return parseAs(schema, doc.value, `${doc.schemaVersion} ${ref.id}`);
  }

  has(ref: Ref): boolean {
    return this.byKey.has(refKey(ref));
  }

  documents(): LoadedDocument[] {
    return [...this.byKey.values()];
  }

  findById(id: string): LoadedDocument[] {
    return this.documents().filter((doc) => doc.ref.id === id);
  }
}

export type LoadedProject = {
  root: string;
  configPath: string;
  config: WorkflowConfig;
  configDigest: string;
  suite: Suite;
  suiteCases: Array<{ ref: Ref; required: boolean }>;
  corpus: CorpusStore;
  /** Maps a project-relative file path to the frozen ref it produced. */
  fileRefs: Map<string, Ref>;
};

function readStructured(path: string): unknown {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) return JSON.parse(text);
  return parseYaml(text, { strict: true });
}

function safeJoin(root: string, base: string, rel: string): string {
  if (!rel.startsWith('./') && !rel.startsWith('../')) throw new SchemaViolation('corpus', [`file reference must be relative (./ or ../): ${rel}`]);
  const abs = resolve(base, rel);
  const relToRoot = relative(root, abs);
  if (relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
    throw new SchemaViolation('corpus', [`file reference escapes project root: ${rel}`]);
  }
  return abs;
}

export class ProjectLoader {
  private readonly loaded = new Map<string, LoadedDocument>();
  private readonly loading = new Set<string>();
  private readonly scope: Scope;

  constructor(readonly root: string, scope?: Scope) {
    this.scope = scope ?? AUTHORING_SCOPE;
  }

  /** Load a referenced document, freezing nested `$file` references first. */
  loadDocument(absPath: string): LoadedDocument {
    const key = resolve(absPath);
    const cached = this.loaded.get(key);
    if (cached) return cached;
    if (this.loading.has(key)) throw new SchemaViolation('corpus', [`reference cycle through ${relative(this.root, key)}`]);
    if (!existsSync(key) || !statSync(key).isFile()) throw new SchemaViolation('corpus', [`missing file ${relative(this.root, key)}`]);
    this.loading.add(key);
    try {
      const raw = readStructured(key);
      const resolved = this.resolveFileRefs(raw, dirname(key));
      if (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
        const obj = resolved as Record<string, unknown>;
        if (!('scope' in obj)) obj.scope = this.scope;
        if (obj.ref && typeof obj.ref === 'object' && !('digest' in (obj.ref as object))) {
          // placeholder digest for validation; replaced by freeze below
          (obj.ref as Record<string, unknown>).digest = { algorithm: 'sha256', hex: '0'.repeat(64) };
        }
      }
      const { schemaVersion, value } = validateDocument(resolved);
      const frozen = freeze(value as { ref: { id: string; revision: string } });
      // Re-validate the frozen value (same schema) to keep the typed value authoritative.
      const final = parseAs(SCHEMA_REGISTRY[schemaVersion] as z.ZodType<unknown>, frozen, schemaVersion);
      const doc: LoadedDocument = {
        ref: parseAs(RefSchema, (final as { ref: unknown }).ref, 'ref'),
        schemaVersion,
        value: final,
        sourcePath: relative(this.root, key).split(sep).join('/'),
        sourceDigest: sha256Hex(readFileSync(key)),
      };
      this.loaded.set(key, doc);
      return doc;
    } finally {
      this.loading.delete(key);
    }
  }

  private resolveFileRefs(value: unknown, base: string): unknown {
    if (Array.isArray(value)) return value.map((item) => this.resolveFileRefs(item, base));
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 1 && keys[0] === '$file' && typeof obj.$file === 'string') {
        const doc = this.loadDocument(safeJoin(this.root, base, obj.$file));
        return { ...doc.ref };
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) out[k] = this.resolveFileRefs(v, base);
      return out;
    }
    return value;
  }

  refFor(absPath: string): Ref {
    return this.loadDocument(absPath).ref;
  }

  documents(): LoadedDocument[] {
    return [...this.loaded.values()];
  }
}

export function loadProject(configPath: string, scope?: Scope): LoadedProject {
  const abs = resolve(configPath);
  const root = dirname(abs);
  const rawConfig = readStructured(abs);
  const config = parseAs(WorkflowConfig, rawConfig, 'workflow.config/v1');
  const loader = new ProjectLoader(root, scope);
  const suitePath = safeJoin(root, root, config.suiteRef);
  const suite = parseAs(Suite, readStructured(suitePath), 'workflow.suite/v1');
  const suiteCases = suite.cases.map((entry) => ({ ref: loader.refFor(safeJoin(root, dirname(suitePath), entry.caseRef)), required: entry.required }));
  // Load every file the config names so the frozen manifest covers the executable closure.
  const fileRefs = new Map<string, Ref>();
  const pathsToLoad: string[] = [config.executionHostRef, config.intelligencePolicyRef];
  if (config.sourceSetRef) pathsToLoad.push(config.sourceSetRef);
  for (const profile of Object.values(config.profiles)) {
    pathsToLoad.push(profile.environmentPlanRef, profile.personaRef, profile.fidelityProfileRef, profile.runnerRef);
    if (profile.hostPlanRef) pathsToLoad.push(profile.hostPlanRef);
    if (profile.fixturePlanRef) pathsToLoad.push(profile.fixturePlanRef);
  }
  for (const rel of pathsToLoad) fileRefs.set(rel, loader.refFor(safeJoin(root, root, rel)));
  for (const entry of suite.cases) fileRefs.set(join(dirname(config.suiteRef), entry.caseRef).replace(/^(?!\.)/, './'), loader.refFor(safeJoin(root, dirname(suitePath), entry.caseRef)));
  const documents = loader.documents();
  const manifestBase = {
    schemaVersion: 'workflow.corpus/v1' as const,
    ref: { id: `${config.project}.corpus`, revision: '1', digest: { algorithm: 'sha256' as const, hex: '0'.repeat(64) } },
    scope: scope ?? AUTHORING_SCOPE,
    projectId: config.project,
    members: documents
      .map((doc) => ({ ref: doc.ref, schemaVersion: doc.schemaVersion, sourcePath: doc.sourcePath, sourceDigest: doc.sourceDigest }))
      .sort((a, b) => (a.sourcePath < b.sourcePath ? -1 : 1)),
  };
  const manifest = parseAs(CorpusManifest, freeze(manifestBase), 'workflow.corpus/v1');
  return {
    root,
    configPath: abs,
    config,
    configDigest: sha256Hex(readFileSync(abs)),
    suite,
    suiteCases,
    corpus: new CorpusStore(manifest, documents),
    fileRefs,
  };
}
