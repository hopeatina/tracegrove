import { z } from 'zod';
import { IdString, RunRequest } from '../protocol/index.ts';
import { Blocked } from '../core/errors.ts';
import { SampleName } from './samples/catalog.ts';

const Text = z.string().min(1).max(8192);
const Bool = z.boolean().optional();
const common = { json: Bool, help: Bool };
const ExecutionId = Text.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'execution ID must be one local path segment');
export const COMMAND_SCHEMAS = {
  help: z.object({ help: Bool }).strict(),
  init: z.object({ ...common, dir: Text.optional(), force: Bool }).strict(),
  test: z.object({ ...common, config: Text.optional(), grep: Text.optional(), tag: Text.optional(), jsonl: Bool, heal: Bool, 'source-snapshot': Text.optional(), 'source-repository-role': Text.optional() }).strict(),
  status: z.object({ ...common, dir: Text.optional() }).strict(),
  heal: z.object({ ...common, dir: Text.optional(), agent: Text.optional(), model: Text.optional(), 'no-agent': Bool, 'dry-run': Bool, undo: Text.optional() }).strict(),
  list: z.object({ ...common, config: Text.optional() }).strict(),
  compile: z.object({ ...common, config: Text.optional(), 'source-snapshot': Text.optional(), 'source-repository-role': Text.optional() }).strict(),
  show: z.object({ ...common, config: Text.optional(), run: Text.optional() }).strict(),
  ui: z.object({ ...common, dir: Text.optional(), branch: Text.optional(), port: Text.optional() }).strict(),
  discover: z.object({ ...common, dir: Text.optional(), branch: Text.optional(), save: Bool }).strict(),
  check: z.object({ ...common, dir: Text.optional() }).strict(),
  draft: z.object({ ...common, dir: Text.optional(), branch: Text.optional(), intent: Text.optional(), agent: Text.optional(), model: Text.optional(), 'no-prove': Bool }).strict(),
  settings: z.object({ ...common, dir: Text.optional(), agent: Text.optional(), model: Text.optional(), 'source-snapshot': Text.optional(), 'working-tree': Bool }).strict(),
  'sample-config': z.object({ ...common, sample: SampleName.optional(), output: Text }).strict(),
  validate: z.object({ ...common, config: Text }).strict(),
  setup: z.object({ ...common, 'dry-run': Bool, 'check-only': Bool }).strict(),
  doctor: z.object({ ...common, config: Text.optional(), dir: Text.optional(), profile: Text.optional() }).strict(),
  plan: z.object({ ...common, config: Text, profile: Text.optional(), output: Text,
    purpose: RunRequest.shape.purpose.optional(), 'work-binding': Text.optional() }).strict(),
  seed: z.object({ ...common, request: Text, preview: Bool }).strict(),
  run: z.object({ ...common, request: Text, 'state-dir': Text.optional(), jsonl: Bool }).strict(),
  controller: z.object({ ...common, 'state-dir': Text, 'project-root': Text }).strict(),
  cases: z.object({ ...common, config: Text, id: Text.optional(), workflow: Text.optional(),
    surface: Text.optional(), text: Text.optional(), cursor: Text.optional(),
    limit: Text.regex(/^[1-9][0-9]{0,2}$/).refine(value => Number(value) <= 100, 'limit must be 1..100').optional() }).strict(),
  rerun: z.object({ ...common, request: Text, output: Text }).strict(),
  inspect: z.object({ ...common, execution: ExecutionId.optional(), 'state-dir': Text.optional(), request: Text.optional(), bundle: Text.optional(), 'failed-step': Bool }).strict()
    .refine(flags => flags.request ? !flags.execution && !flags['state-dir'] && !flags.bundle && !flags['failed-step']
      : flags.bundle ? !flags.execution && !flags['state-dir'] : !!flags.execution && !!flags['state-dir'],
    'choose --request, --bundle, or --execution with --state-dir; --failed-step is only for execution evidence'),
  export: z.object({ ...common, execution: ExecutionId, 'state-dir': Text, output: Text }).strict(),
  'verify-bundle': z.object({ ...common, bundle: Text }).strict(),
  'result-ingest': z.object({ ...common, bundle: Text, sink: Text }).strict(),
  results: z.object({ ...common, sink: Text, id: IdString.optional(), cursor: Text.optional(), limit: Text.regex(/^(?:[1-9][0-9]?|100)$/).optional() }).strict(),
  'awr-prepare': z.object({ ...common, sink: Text, id: IdString, destination: Text }).strict(),
  'awr-inspect': z.object({ ...common, sink: Text, id: IdString }).strict(),
  'awr-deliver': z.object({ ...common, sink: Text, id: IdString, 'credential-env': Text.regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional() }).strict(),
  'report-prepare': z.object({ ...common, sink: Text, id: IdString, target: Text }).strict(),
  'report-inspect': z.object({ ...common, sink: Text, id: IdString }).strict(),
  'report-attach': z.object({ ...common, sink: Text, id: IdString, 'credential-env': Text.regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional() }).strict(),
  'verify-cleanup': z.object({ ...common, proof: Text, expectation: Text, trust: Text }).strict(),
  'source-resolve': z.object({ ...common, input: Text, output: Text }).strict(),
  'recovery-status': z.object({ ...common, 'state-dir': Text, execution: Text }).strict(),
  'source-materialize': z.object({ ...common, input: Text, repository: Text, root: Text, side: z.enum(['base', 'head']), output: Text }).strict(),
  schema: z.object({ ...common, output: Text }).strict(),
} as const;
export type Args = {
  [Name in keyof typeof COMMAND_SCHEMAS]: { command: Name; flags: z.infer<typeof COMMAND_SCHEMAS[Name]> }
}[keyof typeof COMMAND_SCHEMAS];
const deny = (code: string, detail: string, command: string): never => {
  throw new Blocked([{ code, detail, owner: 'operator', action: `workflow-verify ${command} --help` }]);
};

/** Best-effort output selection before parsing can fail. Duplicate flags still fail parsing. */
export function jsonRequested(argv: string[]): boolean {
  const options = argv.slice(1);
  const index = options.findIndex(option => option === '--json' || option.startsWith('--json='));
  if (index < 0) return false;
  const value = options[index] === '--json'
    ? (['false', 'true'].includes(options[index + 1] ?? '') ? options[index + 1] : 'true')
    : options[index]?.slice('--json='.length);
  return value === 'true';
}

/** Validate every option before file access, admission or execution. No ignored arguments. */
export function parseArgs(argv: string[]): Args {
  // `setup browsers` reads as a sentence; browsers are the only thing setup installs today.
  if (argv[0] === 'setup' && argv[1] === 'browsers') argv = ['setup', ...argv.slice(2)];
  const first = argv[0] ?? 'help';
  const command = ['-h', '--help'].includes(first) ? 'help' : first;
  if (!Object.hasOwn(COMMAND_SCHEMAS, command)) deny('unknown_command', `unknown command ${command}`, 'help');
  const name = command as Args['command'];
  const schema = COMMAND_SCHEMAS[name] as z.ZodObject<Record<string, z.ZodType>>;
  const flags: Record<string, string | boolean> = Object.create(null);
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i] === '-h' ? '--help' : argv[i]!;
    if (!token.startsWith('--')) deny('unexpected_argument', `unexpected positional argument ${token}`, command);
    const equals = token.indexOf('=');
    const key = token.slice(2, equals < 0 ? undefined : equals);
    if (!Object.hasOwn(schema.shape, key)) deny('unknown_flag', `--${key} is unsupported for ${command}; allowed: ${Object.keys(schema.shape).map(flag => `--${flag}`).join(', ')}`, command);
    if (Object.hasOwn(flags, key)) deny('duplicate_flag', `--${key} was supplied more than once`, command);
    const option = schema.shape[key]!;
    const underlying = option instanceof z.ZodOptional ? option.unwrap() : option;
    let value = equals < 0 ? undefined : token.slice(equals + 1);
    if (underlying instanceof z.ZodBoolean) {
      if (value === undefined && ['true', 'false'].includes(argv[i + 1] ?? '')) value = argv[++i];
      if (value !== undefined && value !== 'true' && value !== 'false') deny('invalid_boolean', `--${key} accepts true or false`, command);
      flags[key] = value === undefined || value === 'true';
    } else {
      if (value === undefined) {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--') || next === '-h') deny('missing_argument', `--${key} requires a value`, command);
        value = argv[++i]!;
      }
      flags[key] = value;
    }
  }
  if (flags.help === true) return { command: 'help', flags: {} };
  if (flags.json === true && flags.jsonl === true) deny('conflicting_flags', '--json and --jsonl cannot be combined', command);
  if (name === 'doctor' && flags.config !== undefined && flags.dir !== undefined) deny('conflicting_flags', '--config and --dir cannot be combined', command);
  const parsed = schema.safeParse(flags);
  if (!parsed.success) throw new Blocked(parsed.error.issues.map(issue => ({
    code: Object.hasOwn(flags, String(issue.path[0])) ? 'invalid_argument' : 'missing_argument',
    detail: `--${issue.path.join('.')}: ${issue.message}`, owner: 'operator', action: `workflow-verify ${command} --help`,
  })));
  return { command: name, flags: parsed.data } as Args;
}
