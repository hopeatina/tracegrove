import { basename } from 'node:path';
import { SaxesParser, type SaxesTagNS } from 'saxes';
import { digestOfBytes, type ImportedObservation } from '../protocol/index.ts';
import { addAttachment, contentRef, emptyObservation, finishProjection, IMPORT_LIMITS, nativeObservationId, type NativeProjection } from './normalize.ts';

const RETRIES = ['flakyFailure', 'flakyError', 'rerunFailure', 'rerunError'];
/** Core JUnit outcomes, Surefire retry diagnostics and Playwright attachment markers. No issuer or host inference. */
export function normalizeJunit(bytes: Buffer): NativeProjection {
  const result: NativeProjection = { observations: [], attachments: [], globalErrorRefs: [], reportedTotals: {},
    warnings: ['retry_history_not_guaranteed'], producer: { name: null, version: null, basis: 'unavailable' } };
  const parser = new SaxesParser({ xmlns: true }), stack: Array<{ tag: string; name: string | null }> = [];
  const source = digestOfBytes(bytes);
  let row: ImportedObservation | null = null, nodes = 0, roots = 0, caseIndex = 0, diagnosticIndex = 0, stdoutIndex = 0;
  let stdout: { text: string; observationId: string; pointer: string } | null = null;
  let diagnostic: { kind: string; attrs: Record<string, string>; text: string; pointer: string } | null = null;
  const attr = (tag: SaxesTagNS, name: string) => Object.values(tag.attributes).find(a => a.local === name && !a.uri)?.value ?? null;
  const attrs = (tag: SaxesTagNS) => Object.fromEntries(Object.values(tag.attributes).map(a => [a.name, a.value]));
  const number = (value: string | null): number | null => value !== null && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
  const push = (attempt: ImportedObservation) => { if (result.observations.length >= IMPORT_LIMITS.observations) throw new Error('native attempt count'); result.observations.push(attempt); };
  parser.on('doctype', () => { throw new Error('DTD is unsupported'); });
  parser.on('xmldecl', declaration => { if (declaration.encoding && !/^utf-?8$/i.test(declaration.encoding)) throw new Error('native XML must use UTF-8'); });
  parser.on('error', () => { throw new Error('invalid native XML'); });
  parser.on('opentag', tag => {
    if (++nodes > IMPORT_LIMITS.nodes || stack.length >= IMPORT_LIMITS.depth) throw new Error('native report structure limit');
    if (!stack.length) {
      roots++; if (!['testsuite', 'testsuites'].includes(tag.local)) throw new Error('not a JUnit report');
      for (const key of ['tests', 'failures', 'errors', 'skipped']) {
        const value = number(attr(tag, key)); if (value !== null && Number.isSafeInteger(value)) result.reportedTotals[key] = value;
      }
    }
    if (tag.local === 'testcase') {
      if (row || stack.at(-1)?.tag !== 'testsuite') throw new Error('invalid JUnit testcase');
      const title = attr(tag, 'name'); if (title === null) throw new Error('JUnit testcase name missing');
      row = emptyObservation(`/testcases/${caseIndex++}`, title, stack.filter(t => t.tag === 'testsuite').map(t => t.name ?? ''), source);
      const file = attr(tag, 'file'), seconds = number(attr(tag, 'time'));
      Object.assign(row, { kind: 'testcase_summary', reportedTestId: attr(tag, 'id'), outcome: 'passed',
        source: file ? { file, line: number(attr(tag, 'line')), column: null } : null, durationMs: seconds === null ? null : seconds * 1000 });
      const classname = attr(tag, 'classname'); if (classname) row.suite.push(classname);
      if (attr(tag, 'status') && attr(tag, 'status') !== 'run') { row.outcome = 'unknown'; result.warnings.push('no_reported_status'); }
    } else if (['failure', 'error', 'skipped', ...RETRIES].includes(tag.local)) {
      if (diagnostic || tag.local === 'skipped' && !row || RETRIES.includes(tag.local) && !row) throw new Error('invalid JUnit diagnostic');
      const pointer = `${row?.pointer ?? '/global'}/${tag.local}/${diagnosticIndex++}`;
      diagnostic = { kind: tag.local, attrs: attrs(tag), text: '', pointer };
      if (row && !RETRIES.includes(tag.local)) {
        const next = tag.local === 'failure' ? 'failed' : tag.local === 'error' ? 'error' : 'skipped';
        row.outcome = row.outcome === 'passed' || row.outcome === next ? next : 'unknown';
      }
    } else if (row && tag.local === 'system-out') {
      const pointer = diagnostic && RETRIES.includes(diagnostic.kind) ? diagnostic.pointer : row.pointer;
      stdout = { text: '', pointer: `${pointer}/system-out/${stdoutIndex++}`, observationId: pointer === row.pointer ? row.id : nativeObservationId(source, pointer) };
    }
    else if (row && !diagnostic && !['system-err', 'properties', 'property'].includes(tag.local)) {
      result.warnings.push('unsupported_junit_extension'); row.outcome = 'unknown';
    }
    stack.push({ tag: tag.local, name: attr(tag, 'name') });
  });
  const text = (value: string) => { if (diagnostic) diagnostic.text += value; if (stdout !== null) stdout.text += value; };
  parser.on('text', text); parser.on('cdata', text);
  parser.on('closetag', tag => {
    if (diagnostic?.kind === tag.local) {
      const ref = contentRef(diagnostic.pointer, { kind: diagnostic.kind, attrs: diagnostic.attrs, text: diagnostic.text });
      if (!row) result.globalErrorRefs.push(ref);
      else if (RETRIES.includes(tag.local)) {
        const retry = structuredClone(row); Object.assign(retry, { kind: 'retry_diagnostic', id: nativeObservationId(source, diagnostic.pointer), pointer: diagnostic.pointer,
          outcome: tag.local.endsWith('Error') ? 'error' : 'failed', producerClassification: tag.local.startsWith('flaky') ? 'flaky' : null,
          durationMs: null, errorRefs: [ref], detailRefs: [ref] }); push(retry); row.detailRefs.push(ref);
      } else { if (tag.local !== 'skipped') row.errorRefs.push(ref); row.detailRefs.push(ref); }
      diagnostic = null;
    }
    if (tag.local === 'system-out' && row && stdout !== null) {
      if (stdout.observationId === row.id) row.detailRefs.push(contentRef(stdout.pointer, stdout.text));
      let index = 0;
      for (const match of stdout.text.matchAll(/\[\[ATTACHMENT\|([^\]\r\n]+)\]\]/g)) {
        const path = match[1]!; addAttachment(result, { pointer: `${stdout.pointer}/attachments/${index++}`, observationId: stdout.observationId,
          name: basename(path), mediaType: 'application/octet-stream', path, body: null });
      }
      stdout = null;
    }
    if (tag.local === 'testcase') { if (!row) throw new Error('missing JUnit testcase'); push(row); row = null; }
    stack.pop();
  });
  parser.write(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).close();
  if (roots !== 1 || row || stack.length || diagnostic) throw new Error('incomplete JUnit report');
  if (result.reportedTotals.tests !== undefined && result.reportedTotals.tests !== caseIndex) result.warnings.push('reported_totals_mismatch');
  return finishProjection(result);
}
