import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { DigestSchema, ImportedObservations, NativeReportFormat, ScopeSchema, digestOfBytes, digestOfValue, freeze, sameDigest,
  type Digest, type ImportedAttachment } from '../protocol/index.ts';
import { readBoundedFile } from '../core/boundedFile.ts';
import { requireRealDirectory } from '../core/atomicFiles.ts';
import { Conflict } from '../core/errors.ts';
import { IMPORT_LIMITS, type NativeProjection, type RawAttachment } from './normalize.ts';
import { normalizePlaywright } from './playwright.ts';
import { normalizeJunit } from './junit.ts';
import { NativeObservationError } from './errors.ts';

const Producer = z.object({ name: z.string().min(1).max(8192), version: z.string().min(1).max(8192) }).strict();
const Options = z.object({ file: z.string().min(1), format: NativeReportFormat, scope: ScopeSchema,
  artifactRoot: z.string().min(1).optional(), producer: Producer.optional(), expectedSourceDigest: DigestSchema.optional() }).strict();
export type NativeObservationOptions = z.infer<typeof Options>;
const BytesOptions = Options.omit({ file: true, artifactRoot: true });
export type NativeObservationBytesOptions = z.infer<typeof BytesOptions>;
const CAPTURE = Symbol('captured native report');
function normalize(bytes: Buffer, format: NativeReportFormat): NativeProjection {
  return format === 'playwright_json' ? normalizePlaywright(bytes) : normalizeJunit(bytes);
}
type Captured = { report: ImportedObservations; source: Buffer; artifacts: Map<string, Buffer> };
function complete(base: NativeProjection, source: Buffer, options: Pick<NativeObservationOptions, 'format' | 'scope' | 'producer'>,
  attachments: ImportedAttachment[]): ImportedObservations {
  const { attachments: ignored, ...projection } = base;
  if (options.producer) {
    if (projection.producer.basis === 'reported' && projection.producer.version &&
        (options.producer.name !== projection.producer.name || options.producer.version !== projection.producer.version)) throw new Error('producer metadata conflicts');
    if (!projection.producer.version) projection.producer = { ...options.producer, basis: 'operator_declared' };
    projection.warnings = projection.warnings.filter(code => code !== 'producer_version_unavailable');
  }
  const payload = { schemaVersion: 'tracegrove.imported-observations/v1' as const, ...projection, scope: options.scope, format: options.format,
    source: { digest: digestOfBytes(source), byteCount: source.length }, attachments, authority: 'none' as const, issuerTrust: 'not_authenticated' as const,
    qualification: 'not_evaluated' as const, verificationVerdict: 'not_evaluated' as const, execution: 'not_started_by_import' as const };
  return ImportedObservations.parse(freeze({ ...payload, ref: { id: `native-import-${digestOfValue(payload).hex}`, revision: '1' } }));
}
function capturedAttachment(raw: RawAttachment, state: ImportedAttachment['state'], bytes?: Buffer): ImportedAttachment {
  return { pointer: raw.pointer, observationId: raw.observationId, name: raw.name, mediaType: raw.mediaType, reportedPath: raw.path,
    state, digest: bytes ? digestOfBytes(bytes) : null, byteCount: bytes?.length ?? null };
}
function decodeInline(body: string): Buffer | null {
  return body.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body) ? Buffer.from(body, 'base64') : null;
}
function capture(raw: RawAttachment, options: NativeObservationOptions, paths: Map<string, Buffer>): { attachment: ImportedAttachment; bytes?: Buffer } {
  if (raw.path && raw.body !== null) return { attachment: capturedAttachment(raw, 'invalid') };
  let bytes: Buffer;
  if (raw.body !== null) {
    const decoded = decodeInline(raw.body); if (!decoded) return { attachment: capturedAttachment(raw, 'invalid') }; bytes = decoded;
  } else {
    if (!raw.path) return { attachment: capturedAttachment(raw, 'invalid') };
    if (!options.artifactRoot) return { attachment: capturedAttachment(raw, 'not_requested') };
    if (raw.path.includes('\\') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw.path)) return { attachment: capturedAttachment(raw, 'refused') };
    const path = resolve(dirname(resolve(options.file)), raw.path), within = relative(resolve(options.artifactRoot), path);
    if (!within || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) return { attachment: capturedAttachment(raw, 'refused') };
    try {
      requireRealDirectory(dirname(path)); bytes = paths.get(path) ?? readBoundedFile(path, IMPORT_LIMITS.artifactBytes); paths.set(path, bytes);
    } catch (error) {
      const missing = ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '');
      return { attachment: capturedAttachment(raw, missing ? 'missing' : 'refused') };
    }
  }
  if (bytes.length > IMPORT_LIMITS.artifactBytes) return { attachment: capturedAttachment(raw, 'refused') };
  return { attachment: capturedAttachment(raw, 'captured', bytes), bytes };
}
/** Captured foreign observations. This type can never stand in for a VerifiedBundleSnapshot. */
export class NativeObservationSnapshot {
  readonly #report: ImportedObservations; readonly #source: Buffer; readonly #artifacts: Map<string, Buffer>;
  private constructor(token: typeof CAPTURE, captured: Captured) {
    if (token !== CAPTURE) throw new Conflict('Native report capture is required');
    this.#report = structuredClone(captured.report); this.#source = Buffer.from(captured.source);
    this.#artifacts = new Map([...captured.artifacts].map(([key, bytes]) => [key, Buffer.from(bytes)]));
  }
  static open(input: NativeObservationOptions): NativeObservationSnapshot {
    try {
      const options = Options.parse(input), path = resolve(options.file); requireRealDirectory(dirname(path));
      if (options.artifactRoot) requireRealDirectory(resolve(options.artifactRoot));
      const source = readBoundedFile(path, IMPORT_LIMITS.reportBytes);
      return this.capture(source, options);
    } catch { throw new NativeObservationError('native_report_invalid'); }
  }
  /** Uploaded bytes never grant file-path access. Only attachments embedded in the report can be captured. */
  static fromBytes(bytes: Uint8Array, input: NativeObservationBytesOptions): NativeObservationSnapshot {
    try {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > IMPORT_LIMITS.reportBytes) throw new Error('native source size');
      return this.capture(Buffer.from(bytes), { ...BytesOptions.parse(input), file: 'native-report' });
    } catch { throw new NativeObservationError('native_report_invalid'); }
  }
  private static capture(source: Buffer, options: NativeObservationOptions): NativeObservationSnapshot {
    if (options.expectedSourceDigest && !sameDigest(digestOfBytes(source), options.expectedSourceDigest)) throw new Error('source changed');
    const base = normalize(source, options.format), artifacts = new Map<string, Buffer>(), paths = new Map<string, Buffer>(); let size = source.length;
    const attachments = base.attachments.map(raw => {
      const value = capture(raw, options, paths);
      if (value.bytes) { size += value.bytes.length; if (size > IMPORT_LIMITS.totalBytes) throw new Error('native import byte limit'); }
      if (value.bytes && value.attachment.digest && !artifacts.has(value.attachment.digest.hex)) artifacts.set(value.attachment.digest.hex, value.bytes);
      return value.attachment;
    });
    return new NativeObservationSnapshot(CAPTURE, { report: complete(base, source, options, attachments), source, artifacts });
  }
  /** Archive reader supplies captured bytes only. Reparse/rederive to reject edited normalized outcomes. */
  static restore(reportValue: unknown, source: Buffer, read: (digest: Digest, bytes: number) => Buffer): NativeObservationSnapshot {
    try {
      if (source.length > IMPORT_LIMITS.reportBytes) throw new Error('native source size');
      const report = ImportedObservations.parse(reportValue), base = normalize(source, report.format);
      if (source.length !== report.source.byteCount || !sameDigest(digestOfBytes(source), report.source.digest) || base.attachments.length !== report.attachments.length) throw new Error('source binding');
      let total = source.length; const artifacts = new Map<string, Buffer>();
      const attachments = base.attachments.map((raw, index) => {
        const recorded = report.attachments[index]!;
        if (recorded.state !== 'captured') {
          if (recorded.digest || recorded.byteCount !== null) throw new Error('uncaptured attachment');
          return capturedAttachment(raw, recorded.state);
        }
        if (!recorded.digest || recorded.byteCount === null) throw new Error('captured attachment missing');
        total += recorded.byteCount; if (total > IMPORT_LIMITS.totalBytes) throw new Error('import size');
        let bytes = artifacts.get(recorded.digest.hex);
        if (!bytes) { bytes = read(recorded.digest, recorded.byteCount); artifacts.set(recorded.digest.hex, bytes); }
        const inline = raw.body !== null ? decodeInline(raw.body) : null;
        if (bytes.length !== recorded.byteCount || !sameDigest(digestOfBytes(bytes), recorded.digest) ||
            raw.body !== null && (!inline || raw.path || !bytes.equals(inline))) throw new Error('attachment binding');
        return capturedAttachment(raw, 'captured', bytes);
      });
      const expected = complete(base, source, { format: report.format, scope: report.scope,
        ...(report.producer.basis === 'operator_declared' ? { producer: { name: report.producer.name!, version: report.producer.version! } } : {}) }, attachments);
      if (digestOfValue(expected).hex !== digestOfValue(report).hex) throw new Error('normalized report binding');
      return new NativeObservationSnapshot(CAPTURE, { report, source, artifacts });
    } catch { throw new NativeObservationError('native_archive_invalid'); }
  }
  get report(): ImportedObservations { return structuredClone(this.#report); }
  source(): Buffer { return Buffer.from(this.#source); }
  artifact(digest: Digest): Buffer {
    const value = this.#artifacts.get(DigestSchema.parse(digest).hex);
    if (!value) throw new Conflict('Native attachment was not captured'); return Buffer.from(value);
  }
}
