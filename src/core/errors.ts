export type ReasonCode = string;

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
