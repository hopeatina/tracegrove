export type ReasonCode = string;

/** Shared by live execution and independent bundle reduction. */
const INFRASTRUCTURE_STEP_FAILURES = new Set([
  'transport_failure', 'deadline_exceeded', 'native_job_unavailable', 'native_job_queue_unavailable',
  'native_job_request_too_large', 'native_job_response_invalid', 'native_job_identity_missing', 'native_job_identity_mismatch', 'native_job_secret_echo',
]);
export function isInfrastructureStepFailure(code: string | null): boolean { return code !== null && INFRASTRUCTURE_STEP_FAILURES.has(code); }

export class Blocked extends Error {
  readonly reasons: Array<{ code: ReasonCode; detail: string; owner: string; action: string }>;
  constructor(reasons: Array<{ code: ReasonCode; detail: string; owner?: string; action?: string }>) {
    super(`blocked: ${reasons.map((r) => `${r.code} (${r.detail})`).join('; ')}`);
    this.name = 'Blocked';
    this.reasons = reasons.map((r) => ({ code: r.code, detail: r.detail, owner: r.owner ?? 'operator', action: r.action ?? 'resolve the prerequisite and plan again' }));
  }
}

export class Conflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Conflict';
  }
}

export class InfrastructureFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InfrastructureFailure';
  }
}
