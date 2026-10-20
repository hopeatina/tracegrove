import { z } from 'zod';

/** Public top-level failures only. No exception text, arguments, paths, stacks or candidate output. */
export const CliErrorCode = z.enum([
  'unknown_command', 'unknown_flag', 'duplicate_flag', 'unexpected_argument', 'invalid_boolean',
  'missing_argument', 'conflicting_flags', 'invalid_argument', 'config_not_found',
  'invalid_authoring_file', 'invalid_yaml', 'no_flows', 'no_flows_selected', 'unknown_profile',
  'launch_executable_missing', 'application_runtime_unrecognized', 'command_adapter_unqualified',
  'run_not_found', 'execution_not_found', 'invalid_request_file', 'invalid_port',
  'prerequisite_unavailable', 'state_conflict', 'invalid_document', 'invalid_json',
  'input_unavailable', 'access_denied', 'infrastructure_failure', 'unexpected_failure',
]);
const Reason = z.object({ code: CliErrorCode, message: z.string().min(1).max(512), recovery: z.string().min(1).max(512) }).strict();
export const CliErrorReport = z.object({
  schemaVersion: z.literal('tracegrove.cli-error/v1'),
  command: z.enum(['help', 'init', 'test', 'status', 'heal', 'list', 'compile', 'show', 'ui', 'discover', 'check', 'draft',
    'settings', 'sample-config', 'validate', 'setup', 'doctor', 'plan', 'seed', 'run', 'controller', 'cases',
    'rerun', 'inspect', 'export', 'verify-bundle', 'result-ingest', 'results', 'awr-prepare', 'awr-inspect', 'awr-deliver',
    'report-prepare', 'report-inspect', 'report-attach', 'verify-cleanup', 'source-resolve', 'recovery-status',
    'source-materialize', 'schema']).nullable(),
  errorClass: z.enum(['blocked', 'conflict', 'invalid_input', 'infrastructure_failure', 'unexpected_failure']),
  exitCode: z.union([z.literal(2), z.literal(3)]),
  reasons: z.array(Reason).min(1).max(32), omittedReasonCount: z.number().int().nonnegative(),
}).strict();
export type CliErrorReport = z.infer<typeof CliErrorReport>;
