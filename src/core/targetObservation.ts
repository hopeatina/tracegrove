import type { IdentityAttestation, TargetTuple } from '../protocol/index.ts';

/** Current hosts attest component identity only. Requested metadata is never an observation. */
export function targetFromComponentAttestations(expected: TargetTuple, attestations: IdentityAttestation[]): TargetTuple {
  return {
    // These are immutable execution/selection bindings, not measured target attributes.
    componentProfileRef: expected.componentProfileRef,
    requiredComponents: expected.requiredComponents,
    excludedComponents: expected.excludedComponents,
    corpus: expected.corpus, runner: expected.runner, evaluator: expected.evaluator,
    components: expected.components.map(component => {
      const attestation = attestations.find(value => value.componentId === component.componentId);
      return { componentId: component.componentId, kind: attestation?.kind ?? component.kind, identity: attestation?.identity ?? null };
    }),
    repositories: [],
    frontendRelease: null, backendRelease: null, workerRelease: null,
    schemaFingerprint: null, featureFlagsDigest: null, capabilityVersionsDigest: null,
    browserVersion: null, containerImageDigest: null, modelConfigDigest: null,
  };
}
