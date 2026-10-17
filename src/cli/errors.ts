/** Controlled public diagnostics: never copy exception messages or candidate-supplied details. */
import { Blocked, Conflict, InfrastructureFailure } from '../core/errors.ts';
import { CliErrorReport, SchemaViolation } from '../protocol/index.ts';
import { COMMAND_SCHEMAS } from './arguments.ts';

type Reason = CliErrorReport['reasons'][number];
const reason = (code: Reason['code'], message: string, recovery: string): Reason => ({ code, message, recovery });
const options = 'Run tracegrove help and correct the command options.';
const config = 'Create or select a valid project configuration; use tracegrove check for authoring diagnostics.';
const cases = 'List the available flows and correct the selected flow names or tags.';
const interpreter = 'Install the application interpreter in an authorized environment or configure its executable path.';
const blockedReasons: Partial<Record<Reason['code'], Reason>> = {
  unknown_command: reason('unknown_command', 'The command is not supported.', options),
  unknown_flag: reason('unknown_flag', 'An option is not supported for this command.', options),
  duplicate_flag: reason('duplicate_flag', 'An option was supplied more than once.', options),
  unexpected_argument: reason('unexpected_argument', 'An unexpected positional argument was supplied.', options),
  invalid_boolean: reason('invalid_boolean', 'A boolean option requires true or false.', options),
  missing_argument: reason('missing_argument', 'A required option or option value is missing.', options),
  conflicting_flags: reason('conflicting_flags', 'The selected options cannot be combined.', options),
  invalid_argument: reason('invalid_argument', 'An option value is invalid.', options),
  config_not_found: reason('config_not_found', 'The project configuration could not be found.', config),
  invalid_authoring_file: reason('invalid_authoring_file', 'An authoring file is invalid.', config),
  invalid_yaml: reason('invalid_yaml', 'A YAML input is invalid.', config),
  no_flows: reason('no_flows', 'The project has no authoring flows.', cases),
  no_flows_selected: reason('no_flows_selected', 'No authoring flows match the selection.', cases),
  unknown_profile: reason('unknown_profile', 'The selected profile is not available.', config),
  launch_executable_missing: reason('launch_executable_missing', 'The application interpreter is unavailable.', interpreter),
  application_runtime_unrecognized: reason('application_runtime_unrecognized', 'The configured executable did not identify a supported interpreter.', interpreter),
  command_adapter_unqualified: reason('command_adapter_unqualified', 'The command adapter is not qualified.', 'Select the supported Node, FastAPI or Django interpreter preset.'),
  run_not_found: reason('run_not_found', 'The selected run is unavailable.', 'Select an existing run or execute an authorized test first.'),
  execution_not_found: reason('execution_not_found', 'The selected execution is unavailable.', 'Select an existing execution and its matching state directory.'),
  invalid_request_file: reason('invalid_request_file', 'The input is not a frozen request bundle.', 'Pass an unchanged request bundle written by tracegrove plan.'),
  invalid_port: reason('invalid_port', 'The selected port is invalid.', 'Choose a valid port or omit the port option.'),
};
const prerequisite = reason('prerequisite_unavailable', 'A required prerequisite is unavailable.', 'Check the selected configuration, dependencies and authorization; resolve the prerequisite before retrying.');

export function cliErrorReport(error: unknown, command: string | undefined): CliErrorReport {
  let errorClass: CliErrorReport['errorClass']; let exitCode: 2 | 3; let reasons: Reason[];
  let omittedReasonCount = 0;
  if (error instanceof Blocked) {
    errorClass = 'blocked'; exitCode = 2;
    reasons = error.reasons.slice(0, 32).map(item => Object.hasOwn(blockedReasons, item.code)
      ? blockedReasons[item.code as Reason['code']]! : prerequisite);
    if (!reasons.length) reasons = [prerequisite];
    omittedReasonCount = Math.max(0, error.reasons.length - 32);
  } else if (error instanceof Conflict) {
    errorClass = 'conflict'; exitCode = 2;
    reasons = [reason('state_conflict', 'The operation conflicts with existing state or ownership.', 'Inspect the owned state and reconcile the interrupted operation; do not break locks or replay uncertain effects.')];
  } else if (error instanceof SchemaViolation) {
    errorClass = 'invalid_input'; exitCode = 2;
    reasons = [reason('invalid_document', 'An input document does not match its schema.', 'Validate and regenerate the input with the matching Tracegrove version.')];
  } else if (error instanceof SyntaxError) {
    errorClass = 'invalid_input'; exitCode = 3; // Preserve the existing top-level JSON parse error exit status.
    reasons = [reason('invalid_json', 'A JSON input could not be parsed.', 'Restore or regenerate valid JSON input; do not replay an interrupted execution blindly.')];
  } else if (error instanceof InfrastructureFailure) {
    errorClass = 'infrastructure_failure'; exitCode = 3;
    reasons = [reason('infrastructure_failure', 'An infrastructure operation failed.', 'Inspect the owned environment and retained execution evidence; reconcile uncertain effects before retrying.')];
  } else {
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : null;
    errorClass = 'infrastructure_failure'; exitCode = 3;
    if (code === 'ENOENT' || code === 'ENOTDIR') reasons = [reason('input_unavailable', 'A required local input or directory is unavailable.', 'Check that the selected configuration, input files and dependencies exist.')];
    else if (code === 'EACCES' || code === 'EPERM') reasons = [reason('access_denied', 'A local operation was denied.', 'Use an authorized readable input or writable output; request owner assistance if access is required.')];
    else {
      errorClass = 'unexpected_failure';
      reasons = [reason('unexpected_failure', 'The command could not complete.', 'Inspect the owned environment and retained evidence. Report the command, error code and exit status without credentials.')];
    }
  }
  return CliErrorReport.parse({ schemaVersion: 'tracegrove.cli-error/v1', command: command && Object.hasOwn(COMMAND_SCHEMAS, command) ? command : null,
    errorClass, exitCode, reasons, omittedReasonCount });
}
