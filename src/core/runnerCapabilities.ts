import { RunnerProfile, digestOfValue, refKey, verifySelfDigest, type Ref, type RunnerCapabilities } from '../protocol/index.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../adapters/http/capabilities.ts';
import { BROWSER_RUNNER_CAPABILITIES } from '../adapters/browser/capabilities.ts';
import { NATIVE_JOB_RUNNER_CAPABILITIES } from '../adapters/job/capabilities.ts';
import { MCP_RUNNER_CAPABILITIES } from '../adapters/mcp/capabilities.ts';
import { Blocked } from './errors.ts';

export function runnerCapabilitiesFor(profile: RunnerProfile): RunnerCapabilities {
  const caps = { ...(profile.adapter === 'mcp' ? MCP_RUNNER_CAPABILITIES : profile.adapter === 'native_job' ? NATIVE_JOB_RUNNER_CAPABILITIES : profile.adapter === 'browser' ? BROWSER_RUNNER_CAPABILITIES : HTTP_RUNNER_CAPABILITIES),
    maxStepsPerCase: profile.maxStepsPerCase, cancellation: profile.cancellation };
  const base = { ...caps, ref: { id: caps.ref.id, revision: caps.ref.revision } };
  return { ...caps, ref: { ...base.ref, digest: digestOfValue(base) } };
}

/** A diagnostic, never a substitute identity or evidence-verification result. */
export type RunnerCompatibilityDiagnostic = {
  schemaVersion: 'tracegrove.runner-compatibility/v1';
  code: 'runner_profile_missing' | 'runner_capability_revision_unsupported' | 'runner_capability_digest_mismatch';
  profileEvidence: 'present' | 'missing_or_invalid';
  verification: 'not_completed';
  requestedRunner: Ref;
  availableProfiles: Array<{ profile: Ref; reproducedRunner: Ref }>;
  action: string;
};

export class RunnerCompatibilityError extends Blocked {
  constructor(readonly diagnostic: RunnerCompatibilityDiagnostic) {
    super([{ code: diagnostic.code,
      detail: diagnostic.code === 'runner_profile_missing' ? 'no valid frozen profile for the requested runner identity'
        : `frozen profile present; requested ${diagnostic.requestedRunner.id}@${diagnostic.requestedRunner.revision} cannot be reproduced exactly by this verifier; see docs/verified-bundles.md#runner-compatibility`,
      action: diagnostic.action }]);
  }
}

/** Planner, executor, and verifier share one reproduction rule; step names cannot select a runner. */
export function frozenRunnerCapabilities(documents: Record<string, unknown>, expected: Ref): RunnerCapabilities {
  const related: RunnerCompatibilityDiagnostic['availableProfiles'] = [];
  for (const document of Object.values(documents)) {
    const profile = RunnerProfile.safeParse(document);
    if (!profile.success || !verifySelfDigest(profile.data)) continue;
    const capabilities = runnerCapabilitiesFor(profile.data);
    if (refKey(capabilities.ref) === refKey(expected)) return capabilities;
    if (capabilities.ref.id === expected.id) related.push({ profile: profile.data.ref, reproducedRunner: capabilities.ref });
  }
  const code = related.length === 0 ? 'runner_profile_missing'
    : related.some(candidate => candidate.reproducedRunner.revision === expected.revision) ? 'runner_capability_digest_mismatch'
    : 'runner_capability_revision_unsupported';
  throw new RunnerCompatibilityError({ schemaVersion: 'tracegrove.runner-compatibility/v1', code,
    profileEvidence: related.length ? 'present' : 'missing_or_invalid', verification: 'not_completed', requestedRunner: expected,
    availableProfiles: related.sort((a, b) => refKey(a.profile).localeCompare(refKey(b.profile))).slice(0, 32),
    action: 'Preserve the original bundle. Do not edit or reseal runner references. Inspect it with its recorded compatible verifier and dependency closure, or perform a new authorized execution to qualify the current runtime. See docs/verified-bundles.md#runner-compatibility.' });
}
