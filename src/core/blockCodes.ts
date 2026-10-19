/**
 * One block-code table (R8). Every blocked result can be rendered the same way for people
 * (owner, action, docs) and agents (a runnable `fix` command and who owns running it).
 * `owner: agent` means an agent may run the fix itself; `developer` and `operator` mean ask a human.
 */
export type BlockOwner = 'developer' | 'operator' | 'agent';
export type FixContext = { env?: string | undefined; persona?: string | undefined; detail?: string | undefined };
type BlockSpec = { owner: BlockOwner; action: string; fix: (ctx: FixContext) => string | null; docs: string };

const envFlag = (ctx: FixContext) => (ctx.env && ctx.env !== 'local' ? ` --env ${ctx.env}` : '');
const doctor = (ctx: FixContext) => `tracegrove env doctor ${ctx.env ?? 'local'}`;
const d = (anchor: string) => `docs/environments.md#${anchor}`;

export const BLOCK_CODES = {
  // existing authoring and planning codes
  config_not_found: { owner: 'agent', action: 'create a project config', fix: () => 'tracegrove init', docs: 'docs/getting-started.md' },
  invalid_authoring_file: { owner: 'agent', action: 'fix the authoring file', fix: () => 'tracegrove check --json', docs: 'docs/getting-started.md' },
  invalid_yaml: { owner: 'agent', action: 'fix the YAML syntax', fix: () => 'tracegrove check --json', docs: 'docs/getting-started.md' },
  no_flows_selected: { owner: 'agent', action: 'select flows that exist and are enabled for this environment', fix: ctx => `tracegrove list${envFlag(ctx)}`, docs: d('flows') },
  unknown_persona: { owner: 'agent', action: 'declare the persona or use an existing one', fix: () => 'tracegrove check --json', docs: 'docs/getting-started.md' },
  credential_not_issuable: { owner: 'developer', action: 'give the persona a resolvable credential in this environment', fix: doctor, docs: d('credentials') },
  launch_executable_missing: { owner: 'developer', action: 'install the app interpreter', fix: () => 'tracegrove doctor', docs: 'docs/getting-started.md' },
  environment_class_not_applicable: { owner: 'developer', action: 'opt the flow into this environment with envs:', fix: ctx => `tracegrove explain${envFlag(ctx)}`, docs: d('flows') },
  capability_not_provided_by_host: { owner: 'developer', action: 'choose an environment whose host provides the capability', fix: ctx => `tracegrove capabilities${envFlag(ctx)}`, docs: d('capabilities') },
  mcp_sdk_missing: { owner: 'developer', action: 'install the optional MCP SDK', fix: () => 'npm install @modelcontextprotocol/sdk@1.32.1', docs: 'docs/mcp-driver.md' },
  identity_mismatch: { owner: 'operator', action: 'the target is not the build this plan expects; redeploy or update the expected release', fix: doctor, docs: d('identity') },
  // environments
  invalid_environment: { owner: 'developer', action: 'fix the environment in tracegrove.config.yaml', fix: ctx => `tracegrove env show ${ctx.env ?? 'local'}`, docs: d('environments') },
  no_flows_for_environment: { owner: 'agent', action: 'opt flows into this environment with envs: [<env>]', fix: ctx => `tracegrove explain${envFlag(ctx)}`, docs: d('flows') },
  host_binding_missing: { owner: 'agent', action: 'compile for the environment so the host has its binding', fix: ctx => `tracegrove compile${envFlag(ctx)}`, docs: d('environments') },
  snapshot_requires_launch: { owner: 'agent', action: 'source snapshots only apply to launched environments', fix: () => null, docs: d('environments') },
  approval_requires_human: { owner: 'operator', action: 'approvals must come from a person, not an agent', fix: ctx => `tracegrove approve --env ${ctx.env ?? '<env>'}`, docs: d('agents') },
  unknown_environment: { owner: 'agent', action: 'choose a declared environment', fix: () => 'tracegrove env list', docs: d('environments') },
  environment_writes_forbidden: { owner: 'developer', action: 'this environment allows no writes; run read-only flows here or pick a writable environment', fix: ctx => `tracegrove explain${envFlag(ctx)}`, docs: d('safety') },
  approval_required: { owner: 'operator', action: 'a human must approve agent runs in this environment', fix: ctx => `tracegrove approve --env ${ctx.env ?? '<env>'}`, docs: d('agents') },
  agent_policy_denied: { owner: 'operator', action: 'agents may not run in this environment', fix: () => null, docs: d('agents') },
  persona_secret_unresolvable: { owner: 'operator', action: 'make the persona secret resolvable (sign in to the secret store or set the reference)', fix: doctor, docs: d('credentials') },
  persona_identity_mismatch: { owner: 'operator', action: 'the persona credential signs in as a different subject; fix the secret', fix: ctx => `tracegrove whoami${envFlag(ctx)}${ctx.persona ? ` --as ${ctx.persona}` : ''}`, docs: d('whoami') },
  persona_identity_collision: { owner: 'operator', action: 'two personas resolve to the same subject; negatives would prove nothing', fix: ctx => `tracegrove whoami${envFlag(ctx)}`, docs: d('whoami') },
  persona_credential_expired: { owner: 'operator', action: 'the persona credential expired or was revoked mid-run; mint a fresh one and rerun', fix: ctx => `tracegrove env doctor ${ctx.env ?? 'local'}`, docs: d('broker') },
  auth_recipe_failed: { owner: 'operator', action: 'the auth recipe could not sign in with the resolved secret', fix: ctx => `tracegrove whoami${envFlag(ctx)}${ctx.persona ? ` --as ${ctx.persona}` : ''}`, docs: d('recipes') },
  deployment_unreachable: { owner: 'operator', action: 'the deployment did not answer; check the URL, VPN or tunnel', fix: doctor, docs: d('doctor') },
  deployment_not_ready: { owner: 'operator', action: 'the deployment answered but its health check failed', fix: doctor, docs: d('doctor') },
  origin_not_allowed: { owner: 'developer', action: 'add the endpoint to the environment network allowlist', fix: ctx => `tracegrove env show ${ctx.env ?? 'local'}`, docs: d('network') },
  cleanup_unconfirmed: { owner: 'operator', action: 'cleanup in a deployed environment was not confirmed; reconcile the leftover records', fix: () => 'tracegrove show --json', docs: d('safety') },
  deployed_cleanup_unconfirmed: { owner: 'operator', action: 'a deployed environment kept records this run created; the run fails until cleanup is confirmed', fix: () => 'tracegrove show --run latest --json', docs: d('safety') },
  docker_unavailable: { owner: 'developer', action: 'start Docker (the daemon must be reachable)', fix: () => 'docker info', docs: d('docker') },
  budget_exceeded: { owner: 'operator', action: 'the run would exceed the environment request budget', fix: ctx => `tracegrove explain${envFlag(ctx)}`, docs: d('budget') },
} as const satisfies Record<string, BlockSpec>;
export type BlockCode = keyof typeof BLOCK_CODES;

export type BlockDescription = { code: string; owner: BlockOwner; action: string; fix: string | null; docs: string | null };

/** Owner, action, runnable fix and docs for a block code; unknown codes keep their own action. */
export function describeBlock(code: string, ctx: FixContext = {}, fallbackAction = 'resolve the prerequisite and plan again'): BlockDescription {
  const base = code.split(':')[0]!;
  if (!Object.hasOwn(BLOCK_CODES, base)) return { code, owner: 'developer', action: fallbackAction, fix: null, docs: null };
  const spec: BlockSpec = BLOCK_CODES[base as BlockCode];
  return { code, owner: spec.owner, action: spec.action, fix: spec.fix(ctx), docs: spec.docs };
}
