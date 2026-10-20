export type ReasonCode = string;

/** Shared by live execution and independent bundle reduction. */
const INFRASTRUCTURE_STEP_FAILURES = new Set([
  'qualification_authority_unavailable',
  'transport_failure', 'deadline_exceeded', 'native_job_unavailable', 'native_job_queue_unavailable',
  'native_job_request_too_large', 'native_job_response_invalid', 'native_job_identity_missing', 'native_job_identity_mismatch', 'native_job_secret_echo',
  'persona_credential_expired', 'environment_writes_forbidden', 'budget_exceeded',
  'mcp_driver_unavailable', 'mcp_origin_not_admitted', 'mcp_endpoint_invalid', 'mcp_request_too_large', 'mcp_capability_missing', 'mcp_response_invalid', 'mcp_protocol_failure', 'mcp_secret_echo',
]);
export function isInfrastructureStepFailure(code: string | null): boolean { return code !== null && INFRASTRUCTURE_STEP_FAILURES.has(code); }

export class Blocked extends Error {
  readonly reasons: Array<{ code: ReasonCode; detail: string; owner: string; action: string; fix?: string }>;
  constructor(reasons: Array<{ code: ReasonCode; detail: string; owner?: string; action?: string; fix?: string }>) {
    super(`blocked: ${reasons.map((r) => `${r.code} (${r.detail})`).join('; ')}`);
    this.name = 'Blocked';
    this.reasons = reasons.map((r) => ({ code: r.code, detail: r.detail, owner: r.owner ?? 'operator', action: r.action ?? 'resolve the prerequisite and plan again', ...(r.fix ? { fix: r.fix } : {}) }));
  }
}

export class Conflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Conflict';
  }
}

/**
 * Stable codes for the infrastructure failures a person or heal acts on. Messages are for reading;
 * these are for matching, so rewording a message never changes what heal does.
 */
export type InfrastructureCode = 'app_not_ready' | 'app_exited_early' | 'app_spawn_failed' | 'app_port_not_reported' | 'browser_unavailable' | 'video_encoder_missing' | 'infrastructure';

export class InfrastructureFailure extends Error {
  readonly code: InfrastructureCode;
  constructor(message: string, code: InfrastructureCode = 'infrastructure') {
    super(message);
    this.name = 'InfrastructureFailure';
    this.code = code;
  }
}
