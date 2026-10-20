import { NativeObservationErrorCode } from '../protocol/index.ts';
import { Conflict } from '../core/errors.ts';

const diagnostics: Record<NativeObservationErrorCode, { message: string; recovery: string }> = {
  native_report_invalid: { message: 'Native report could not be captured; check its format, bounds and owned paths.',
    recovery: 'Select UTF-8 Playwright JSON or supported JUnit XML. Check input limits and the explicit artifact root before importing again.' },
  native_archive_invalid: { message: 'Imported observation archive is unavailable or invalid.',
    recovery: 'Restore the unchanged archive or import the original native report into a new directory. This command does not rerun tests.' },
  native_output_conflict: { message: 'Import output already exists or is locked.',
    recovery: 'Choose a new directory under an existing owned parent. Ask the trusted owner to reconcile an existing publisher; do not break its lock.' },
};
export class NativeObservationError extends Conflict {
  readonly code: NativeObservationErrorCode;
  constructor(code: NativeObservationErrorCode) { super(diagnostics[NativeObservationErrorCode.parse(code)].message); this.code = code; }
  /** Static public diagnostics only; never serialize an exception or candidate report message. */
  static diagnostic(code: NativeObservationErrorCode) { return { ...diagnostics[code] }; }
}
