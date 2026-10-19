/** Controlled public diagnostics: never copy exception messages or candidate-supplied details. */
import { Blocked, Conflict, InfrastructureFailure } from '../core/errors.ts';
import { CliErrorReport, SchemaViolation } from '../protocol/index.ts';
import { COMMAND_SCHEMAS } from './arguments.ts';
import { BLOCK_CODES, describeBlock } from '../core/blockCodes.ts';

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
  unknown_environment: reason('unknown_environment', 'The selected environment is not declared.', 'Run tracegrove env list and choose a declared environment.'),
  invalid_environment: reason('invalid_environment', 'The selected environment configuration is invalid.', 'Fix the environment in tracegrove.config.yaml; tracegrove env show explains each field.'),
  no_flows_for_environment: reason('no_flows_for_environment', 'No selected flow is enabled for this environment.', 'Opt flows in with envs: [<env>]; flows default to local only.'),
  approval_required: reason('approval_required', 'Agent runs in this environment need a person to approve them first.', 'Ask a person to run the approval command, then run again.'),
  approval_requires_human: reason('approval_requires_human', 'Approvals must be granted by a person, not an agent.', 'Ask a person to run the approval command.'),
  agent_policy_denied: reason('agent_policy_denied', 'Agents may not run in this environment.', 'Ask a person to run it, or to change the environment agent policy.'),
  invalid_config_path: reason('invalid_config_path', 'The configuration path does not name a setting.', 'Use a dot path such as environments.staging.target.url; see tracegrove config get.'),
  config_edit_invalid: reason('config_edit_invalid', 'The configuration edit would not validate.', 'Run the edit with --dry-run to see the schema errors and fix the value.'),
};
const SAFE_FIX = /^(?:tracegrove|docker|aws|op|npm) [A-Za-z0-9 ._:/=<>@-]{0,200}$/;
const prerequisite = reason('prerequisite_unavailable', 'A required prerequisite is unavailable.', 'Check the selected configuration, dependencies and authorization; resolve the prerequisite before retrying.');

export function cliErrorReport(error: unknown, command: string | undefined): CliErrorReport {
  let errorClass: CliErrorReport['errorClass']; let exitCode: 2 | 3; let reasons: Reason[];
  let omittedReasonCount = 0;
  if (error instanceof Blocked) {
    errorClass = 'blocked'; exitCode = 2;
    reasons = error.reasons.slice(0, 32).map(item => {
      const base = Object.hasOwn(blockedReasons, item.code) ? blockedReasons[item.code as Reason['code']]! : prerequisite;
      if (base === prerequisite) return base;
      const described = describeBlock(item.code);
      const fix = item.fix ?? item.action.match(/(?:runs?|run):\s*(.+)$/)?.[1]?.trim() ?? described.fix;
      return { ...base, ...(Object.hasOwn(BLOCK_CODES, item.code) ? { owner: described.owner } : {}), ...(fix && SAFE_FIX.test(fix) ? { fix } : {}) };
    });
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
