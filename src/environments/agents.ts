/**
 * Agent policy per environment (allow | ask | deny). An agent is detected from the environment its
 * CLI sets (CLAUDECODE, CODEX_*, …) or from --agent. Under `ask`, a human grants a single-use,
 * short-lived approval with `tracegrove approve --env <name>`; the next agent run consumes it.
 * This is a guard against an agent wandering into staging, not a security boundary: anything with
 * shell access to this checkout can write the approval file.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { userInfo } from 'node:os';
import { z } from 'zod';
import { Blocked } from '../core/errors.ts';
import { digestOfValue } from '../protocol/index.ts';
import type { ResolvedEnvironment } from './schema.ts';

/** Environment variables agent CLIs set, in the order they are checked. */
export const AGENT_ENV_MARKERS = [
  ['TRACEGROVE_AGENT', null], ['CLAUDECODE', 'claude-code'], ['CLAUDE_CODE_ENTRYPOINT', 'claude-code'],
  ['CODEX_SANDBOX', 'codex'], ['CODEX_SANDBOX_NETWORK_DISABLED', 'codex'], ['CODEX_THREAD_ID', 'codex'], ['CODEX', 'codex'],
  ['CURSOR_AGENT', 'cursor'], ['GEMINI_CLI', 'gemini'],
] as const;

export type AgentIdentity = { agent: string | null; source: string | null };

export function detectAgent(env: NodeJS.ProcessEnv, flag?: string | null): AgentIdentity {
  if (flag) return { agent: flag, source: '--agent' };
  for (const [name, label] of AGENT_ENV_MARKERS) {
    const value = env[name];
    if (value && value !== '0' && value !== 'false') return { agent: label ?? value, source: name };
  }
  return { agent: null, source: null };
}

const Approval = z.object({ schemaVersion: z.literal('tracegrove.approval/v1'), environment: z.string(), configDigest: z.string(), nonce: z.string(),
  approvedBy: z.string(), approvedAt: z.string(), expiresAt: z.string(), uses: z.number().int().positive() }).strict();
export type Approval = z.infer<typeof Approval>;

const approvalsDir = (root: string) => join(root, '.tracegrove', 'approvals');
const approvalFile = (root: string, env: string) => join(approvalsDir(root), `${env}.json`);
export const environmentDigest = (environment: ResolvedEnvironment) => digestOfValue({ name: environment.name, class: environment.class, config: environment.config }).hex;

export function grantApproval(root: string, environment: ResolvedEnvironment, input: { identity: AgentIdentity; ttlMinutes?: number; uses?: number }): Approval {
  if (input.identity.agent) throw new Blocked([{ code: 'approval_requires_human', detail: `approvals must come from a person; this process looks like ${input.identity.agent} (${input.identity.source})`, owner: 'operator', action: `a person runs: tracegrove approve --env ${environment.name}` }]);
  const now = Date.now();
  const approval: Approval = { schemaVersion: 'tracegrove.approval/v1', environment: environment.name, configDigest: environmentDigest(environment), nonce: randomUUID(),
    approvedBy: (() => { try { return userInfo().username; } catch { return 'unknown'; } })(), approvedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (input.ttlMinutes ?? 30) * 60_000).toISOString(), uses: input.uses ?? 1 };
  mkdirSync(approvalsDir(root), { recursive: true });
  const tmp = `${approvalFile(root, environment.name)}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(approval, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, approvalFile(root, environment.name));
  return approval;
}

export function readApproval(root: string, environment: ResolvedEnvironment): Approval | null {
  const file = approvalFile(root, environment.name);
  if (!existsSync(file)) return null;
  const parsed = Approval.safeParse((() => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } })());
  if (!parsed.success || parsed.data.environment !== environment.name || parsed.data.configDigest !== environmentDigest(environment) || Date.parse(parsed.data.expiresAt) <= Date.now()) return null;
  return parsed.data;
}

function consume(root: string, environment: ResolvedEnvironment, approval: Approval): void {
  const file = approvalFile(root, environment.name);
  if (approval.uses <= 1) { rmSync(file, { force: true }); return; }
  writeFileSync(file, `${JSON.stringify({ ...approval, uses: approval.uses - 1 }, null, 2)}\n`, { mode: 0o600 });
}

export type PolicyDecision = { policy: ResolvedEnvironment['agents']; agent: string | null; decision: 'allowed' | 'approved' | 'human'; approval: Pick<Approval, 'approvedBy' | 'approvedAt' | 'nonce'> | null };

/** Enforce the environment's agent policy before anything runs. Consumes a matching approval. */
export function enforceAgentPolicy(root: string, environment: ResolvedEnvironment, identity: AgentIdentity, options: { consume?: boolean } = {}): PolicyDecision {
  const base = { policy: environment.agents, agent: identity.agent };
  if (!identity.agent) return { ...base, decision: 'human', approval: null };
  if (environment.agents === 'allow') return { ...base, decision: 'allowed', approval: null };
  if (environment.agents === 'deny') throw new Blocked([{ code: 'agent_policy_denied', detail: `environment ${environment.name} (${environment.class}) has agents: deny; ${identity.agent} (${identity.source}) may not run here`, owner: 'operator', action: 'a person runs this, or changes agents: for the environment' }]);
  const approval = readApproval(root, environment);
  if (!approval) throw new Blocked([{ code: 'approval_required', detail: `environment ${environment.name} (${environment.class}) has agents: ask and no unexpired approval for ${identity.agent} (${identity.source})`, owner: 'operator', action: `a person runs: tracegrove approve --env ${environment.name}` }]);
  if (options.consume !== false) consume(root, environment, approval);
  return { ...base, decision: 'approved', approval: { approvedBy: approval.approvedBy, approvedAt: approval.approvedAt, nonce: approval.nonce } };
}
