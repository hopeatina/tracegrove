import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { localScope } from '../core/corpus.ts';
import { NativeReportFormat } from '../protocol/index.ts';
import { IMPORT_LIMITS, NativeObservationSnapshot, NativeObservationError } from '../imports/index.ts';
import { NativeImportName, listNativeImports, readNativeImport, retainNativeImport } from './nativeImports.ts';

type Reply = { status: number; body: unknown; headers?: Record<string, string> };
type Context = { root: string; readBytes(maximum: number): Promise<Buffer>; canWrite(): boolean };
const Query = z.object({ format: NativeReportFormat, producer: z.string().min(1).max(8192).optional(),
  'producer-version': z.string().min(1).max(8192).optional() }).strict().refine(value => !!value.producer === !!value['producer-version']);
export class NativeUploadLimit extends Error {}
export async function readNativeUpload(req: IncomingMessage, maximum: number): Promise<Buffer> {
  const chunks: Buffer[] = []; let length = 0;
  for await (const value of req) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value); length += chunk.length;
    if (length > maximum) throw new NativeUploadLimit(); chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}
/** Loopback/session checks belong to the UI server. This handler accepts no filesystem path from an upload. */
export async function nativeImportsReply(req: IncomingMessage, url: URL, context: Context): Promise<Reply> {
  const error = (status: number, message: string): Reply => ({ status, body: { error: message } });
  try {
    if (url.pathname === '/api/imports') {
      if (req.method === 'GET') {
        if (url.search) return error(400, 'Import listing accepts no query options.');
        return { status: 200, body: { entries: listNativeImports(context.root) } };
      }
      if (req.method !== 'POST') return error(405, 'Use GET to inspect or POST to import.');
      const query = Query.safeParse(Object.fromEntries(url.searchParams));
      if (!query.success || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) return error(400, 'Choose a report format and, optionally, both producer name and version.');
      if (req.headers['content-type']?.split(';')[0] !== 'application/octet-stream') return error(415, 'Upload the report file as binary bytes.');
      if (Number(req.headers['content-length']) > IMPORT_LIMITS.reportBytes) return error(413, 'Native report uploads are limited to 8 MiB.');
      if (!context.canWrite()) return error(409, 'The UI is closing or an operation is active. Try importing after it settles.');
      const bytes = await context.readBytes(IMPORT_LIMITS.reportBytes);
      if (!context.canWrite()) return error(409, 'The UI is closing or an operation is active. No import was admitted.');
      const snapshot = NativeObservationSnapshot.fromBytes(bytes, { format: query.data.format, scope: localScope(),
        ...(query.data.producer ? { producer: { name: query.data.producer, version: query.data['producer-version']! } } : {}) });
      const retained = retainNativeImport(context.root, snapshot);
      return { status: retained.replayed ? 200 : 201, body: retained };
    }
    if (req.method !== 'GET' || url.search) return error(400, 'Choose a named import without additional options.');
    const match = /^\/api\/imports\/([^/]+)(?:\/(source|artifact\/([a-f0-9]{64})))?$/.exec(url.pathname);
    if (!match) return error(404, 'Imported evidence was not found.');
    let name: string;
    try { name = NativeImportName.parse(decodeURIComponent(match[1]!)); } catch { return error(400, 'Select one named import.'); }
    const snapshot = readNativeImport(context.root, name), report = snapshot.report;
    if (!match[2]) return { status: 200, body: { name, report } };
    let bytes: Buffer, filename: string;
    if (match[2] === 'source') { bytes = snapshot.source(); filename = `native-report.${report.format === 'junit_xml' ? 'xml' : 'json'}`; }
    else {
      const asset = report.attachments.find(a => a.state === 'captured' && a.digest!.hex === match[3]);
      if (!asset) return error(404, 'This attachment was not captured.');
      const extensions = new Map([['application/zip','.zip'],['image/png','.png'],['video/webm','.webm'],['image/jpeg','.jpg']]);
      bytes = snapshot.artifact(asset.digest!); filename = `native-attachment-${asset.digest!.hex}${extensions.get(asset.mediaType) ?? '.bin'}`;
    }
    return { status: 200, body: bytes, headers: { 'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${filename}"`, 'cross-origin-resource-policy': 'same-origin',
      'x-tracegrove-import-digest': report.ref.digest.hex } };
  } catch (caught) {
    if (caught instanceof NativeUploadLimit) return error(413, 'Native report uploads are limited to 8 MiB.');
    if (caught instanceof NativeObservationError) {
      const diagnostic = NativeObservationError.diagnostic(caught.code);
      return { status: caught.code === 'native_report_invalid' ? 422 : 409, body: { error: diagnostic.message, recovery: diagnostic.recovery, code: caught.code } };
    }
    return error(409, 'Imported evidence is unavailable. Reopen its archive or import an unchanged report.');
  }
}
