import { z } from 'zod';
import { CliCommandName, IdString, NativeReportFormat, RunRequest } from '../protocol/index.ts';
import { Blocked } from '../core/errors.ts';
import { SampleName } from './samples/catalog.ts';

const Text = z.string().min(1).max(8192);
const Bool = z.boolean().optional();
const common = { json: Bool, help: Bool };
const EnvName = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'environment names use letters, digits, - and _');
const Positionals = (min: number, max: number) => z.array(Text).min(min).max(max);
const ExecutionId = Text.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'execution ID must be one local path segment');
export const COMMAND_SCHEMAS = {
  help: z.object({ help: Bool }).strict(),
  init: z.object({ ...common, dir: Text.optional(), force: Bool }).strict(),
  test: z.object({ ...common, config: Text.optional(), grep: Text.optional(), tag: Text.optional(), jsonl: Bool, heal: Bool, 'source-snapshot': Text.optional(), 'source-repository-role': Text.optional(), env: EnvName.optional(), agent: Text.optional() }).strict(),
  env: z.object({ ...common, config: Text.optional(), _: Positionals(1, 2), url: Text.optional(), persona: z.array(Text).max(32).optional(), class: Text.optional(), writes: Text.optional(),
    agents: Text.optional(), health: Text.optional(), whoami: Text.optional(), 'dry-run': Bool, 'no-whoami': Bool, agent: Text.optional() }).strict(),
  whoami: z.object({ ...common, config: Text.optional(), env: EnvName.optional(), as: Text.optional() }).strict(),
  explain: z.object({ ...common, config: Text.optional(), env: EnvName.optional(), grep: Text.optional(), tag: Text.optional(), agent: Text.optional(), _: Positionals(0, 1).optional() }).strict(),
  capabilities: z.object({ ...common, config: Text.optional(), env: EnvName.optional() }).strict(),
  config: z.object({ ...common, config: Text.optional(), _: Positionals(1, 3), 'dry-run': Bool }).strict(),
  approve: z.object({ ...common, config: Text.optional(), env: EnvName, ttl: Text.regex(/^[1-9][0-9]{0,3}$/, 'ttl is minutes, 1..9999').optional(), uses: Text.regex(/^[1-9][0-9]?$/, 'uses is 1..99').optional() }).strict(),
  mcp: z.object({ help: Bool, config: Text.optional(), 'max-calls': Text.regex(/^[1-9][0-9]{0,3}$/).optional(), 'max-test-runs': Text.regex(/^[1-9][0-9]{0,2}$/).optional() }).strict(),
  status: z.object({ ...common, dir: Text.optional() }).strict(),
  heal: z.object({ ...common, dir: Text.optional(), agent: Text.optional(), model: Text.optional(), 'no-agent': Bool, 'dry-run': Bool, undo: Text.optional() }).strict(),
  list: z.object({ ...common, config: Text.optional(), env: EnvName.optional() }).strict(),
  compile: z.object({ ...common, config: Text.optional(), 'source-snapshot': Text.optional(), 'source-repository-role': Text.optional(), env: EnvName.optional() }).strict(),
  show: z.object({ ...common, config: Text.optional(), run: Text.optional() }).strict(),
  ui: z.object({ ...common, dir: Text.optional(), branch: Text.optional(), port: Text.optional() }).strict(),
  discover: z.object({ ...common, dir: Text.optional(), branch: Text.optional(), save: Bool, jsonl: Bool }).strict(),
  grow: z.object({ ...common, dir: Text.optional(), branch: Text.optional(), base: Text.optional(), spec: Text.optional(), config: Text.optional(),
    mode: z.enum(['min', 'minimum', 'std', 'standard', 'max', 'maximum']).optional(), agent: Text.optional(), model: Text.optional(),
    'no-agent': Bool, 'no-prove': Bool, 'no-gh': Bool, jsonl: Bool, yes: Bool }).strict(),
  check: z.object({ ...common, dir: Text.optional() }).strict(),
  draft: z.object({ ...common, dir: Text.optional(), branch: Text.optional(), intent: Text.optional(), agent: Text.optional(), model: Text.optional(), 'no-prove': Bool }).strict(),
  settings: z.object({ ...common, dir: Text.optional(), agent: Text.optional(), model: Text.optional(), 'source-snapshot': Text.optional(), 'working-tree': Bool }).strict(),
  'sample-config': z.object({ ...common, sample: SampleName.optional(), output: Text }).strict(),
  try: z.object({ ...common, _: Positionals(0, 1).optional(), bug: Text.optional(), out: Text.optional(), 'no-open': Bool, port: Text.optional() }).strict(),
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
  'verify-bundle': z.object({ ...common, bundle: Text, signers: Text.optional() }).strict(),
  compare: z.object({ ...common, baseline: Text, candidate: Text }).strict(),
  'workflow-map': z.object({...common,bundle:Text,cell:IdString.optional()}).strict(),
  workflows: z.object({...common,bundle:Text,text:Text.max(256).optional(),case:IdString.optional(),workflow:IdString.optional(),
    route:Text.max(4096).startsWith('/').optional(),surface:z.enum(['ui','api','job','integration','hybrid']).optional(),tag:IdString.optional(),cursor:Text.max(1024).optional(),
    limit:Text.regex(/^[1-9][0-9]{0,2}$/).refine(value=>Number(value)<=100,'limit must be 1..100').optional()}).strict(),
  usage: z.object({ ...common, 'state-dir': Text }).strict(),
  benchmark: z.object({ ...common, 'state-dir': Text, axis: z.enum(['runner', 'model']) }).strict(),
  pools:z.object({...common,snapshot:Text,pool:IdString.optional()}).strict(),
  'import-observations': z.object({ ...common, input: Text, format: NativeReportFormat, output: Text.optional(), into: Text.optional(),
    'artifact-root': Text.optional(), producer: Text.optional(), 'producer-version': Text.optional() }).strict()
    .refine(flags => !!flags.producer === !!flags['producer-version'], 'provide both producer name and version')
    .refine(flags => !!flags.output !== !!flags.into, 'select either output or into'),
  observations: z.object({ ...common, archive: Text }).strict(),
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
  readiness: z.object({ ...common, dir: Text.optional() }).strict(),
  accept: z.object({ ...common, dir: Text.optional(), _: Positionals(1, 1), by: Text.optional(), reason: Text.optional() }).strict(),
  waive: z.object({ ...common, dir: Text.optional(), _: Positionals(1, 1), by: Text.optional(), reason: Text }).strict(),
  reject: z.object({ ...common, dir: Text.optional(), _: Positionals(1, 1), by: Text.optional(), reason: Text }).strict(),
  challenge: z.object({ ...common, dir: Text.optional(), _: Positionals(1, 1), by: Text.optional(), reason: Text, step: Text.optional() }).strict(),
  judge: z.object({ ...common, run: Text.optional(), grep: Text.optional(), agent: Text.optional(), show: Text.optional() }).strict(),
  'import-call': z.object({ ...common, _: Positionals(1, 1), out: Text.optional(), name: Text.optional(), channel: z.enum(['voice', 'chat']).optional(), endpoint: Text.optional(), 'keep-client-data': Bool, force: Bool }).strict(),
  card: z.object({ ...common, _: Positionals(0, 32).optional(), commit: Text.optional(), link: Text.optional(), title: Text.optional(), out: Text.optional() }).strict(),
  handoff: z.object({ ...common, dir: Text.optional(), out: Text.optional(), client: Text.optional(), by: Text.optional() }).strict(),
  keygen: z.object({ ...common, dir: Text.optional(), name: Text.optional() }).strict(),
  sign: z.object({ ...common, dir: Text.optional(), run: Text.optional(), key: Text.optional() }).strict(),
  seal: z.object({ ...common, dir: Text.optional(), run: Text.optional(), out: Text, remove: Bool }).strict(),
  unseal: z.object({ ...common, _: Positionals(1, 1), out: Text }).strict(),
} as const satisfies Record<z.infer<typeof CliCommandName>, z.ZodType>;
/** Most positional words each command accepts (its schema's `_` array validates the rest). */
const POSITIONAL_MAX: Partial<Record<keyof typeof COMMAND_SCHEMAS, number>> = { env: 2, explain: 1, config: 3, accept: 1, try: 1, card: 32, 'import-call': 1, waive: 1, reject: 1, challenge: 1, unseal: 1 };
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
  const flags: Record<string, string | boolean | string[]> = Object.create(null);
  // Commands with subcommands or a target name declare `_` (positional words) in their schema.
  const positionalSchema = schema.shape._ as z.ZodType | undefined;
  const positionalMax = positionalSchema ? POSITIONAL_MAX[name] ?? 0 : 0;
  const positionals: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i] === '-h' ? '--help' : argv[i]!;
    if (!token.startsWith('--')) {
      if (!positionalSchema || positionals.length >= positionalMax) deny('unexpected_argument', `unexpected positional argument ${token}`, command);
      positionals.push(token); flags._ = positionals; continue;
    }
    const equals = token.indexOf('=');
    const key = token.slice(2, equals < 0 ? undefined : equals);
    if (key === '_' || !Object.hasOwn(schema.shape, key)) deny('unknown_flag', `--${key} is unsupported for ${command}; allowed: ${Object.keys(schema.shape).map(flag => `--${flag}`).join(', ')}`, command);
    const option = schema.shape[key]!;
    const underlying = option instanceof z.ZodOptional ? option.unwrap() : option;
    const repeatable = underlying instanceof z.ZodArray;
    if (Object.hasOwn(flags, key) && !repeatable) deny('duplicate_flag', `--${key} was supplied more than once`, command);
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
      flags[key] = repeatable ? [...((flags[key] as string[] | undefined) ?? []), value] : value;
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
