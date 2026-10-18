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

/** Planner, executor, and verifier share one reproduction rule; step names cannot select a runner. */
export function frozenRunnerCapabilities(documents: Record<string, unknown>, expected: Ref): RunnerCapabilities {
  for (const document of Object.values(documents)) {
    const profile = RunnerProfile.safeParse(document);
    if (!profile.success || !verifySelfDigest(profile.data)) continue;
    const capabilities = runnerCapabilitiesFor(profile.data);
    if (refKey(capabilities.ref) === refKey(expected)) return capabilities;
  }
  throw new Blocked([{ code: 'runner_profile_missing', detail: 'no frozen profile reproduces the admitted runner capabilities' }]);
}
