import type { IdentityAttestation, LaunchRecipe, Scope, TargetTuple } from '../protocol/index.ts';
import { snapshotAttestationProblems } from './snapshotEvidence.ts';

/** Current hosts attest component identity only. Requested metadata is never an observation. */
export function targetFromComponentAttestations(expected: TargetTuple, attestations: IdentityAttestation[], launch: LaunchRecipe | null, scope: Scope): TargetTuple {
  return {
    // These are immutable execution/selection bindings, not measured target attributes.
    componentProfileRef: expected.componentProfileRef,
    requiredComponents: expected.requiredComponents,
    excludedComponents: expected.excludedComponents,
    corpus: expected.corpus, runner: expected.runner, evaluator: expected.evaluator,
    components: expected.components.map(component => {
      const attestation = attestations.find(value => value.componentId === component.componentId);
      const pinUnobserved = attestation && launch?.sourceSnapshot && launch.componentId === component.componentId && snapshotAttestationProblems(launch, attestation, scope).length > 0;
      return { componentId: component.componentId, kind: attestation?.kind ?? component.kind, identity: pinUnobserved ? null : attestation?.identity ?? null };
    }),
    repositories: [],
    frontendRelease: null, backendRelease: null, workerRelease: null,
    schemaFingerprint: null, featureFlagsDigest: null, capabilityVersionsDigest: null,
    browserVersion: null, containerImageDigest: null, modelConfigDigest: null,
  };
}
