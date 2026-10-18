import type { HostCapabilityObservation, HostLease, HostPlan, IdentityAttestation, Scope } from '../protocol/index.ts';

export type HostStartContext = {
  hostPlan: HostPlan;
  projectRoot: string;
  workspaceDir: string;
  scope: Scope;
  campaignId: string;
  executionId: string;
  attemptId: string;
  generation: number;
  actorId: string;
  credentialNames: string[];
  signal: AbortSignal;
  mockResponses: import('../protocol/index.ts').MockResponses | null;
};

export type HostSession = {
  origin: string;
  lease: HostLease;
  observation: HostCapabilityObservation;
  attestations: IdentityAttestation[];
  /** credential name -> secret; kept in memory for this attempt only */
  credentials: Map<string, string>;
  boundaryMode: 'real' | 'stubbed';
  interceptorRefs: import('../protocol/index.ts').Ref[];
  ownedResources: Array<{ entityKey: string; physicalId: string; boundaryId: string }>;
  dataDir: string | null;
  nativeJobs?: import('../adapters/job/types.ts').NativeJobSession;
  stop(reason: string): Promise<{ confirmed: boolean; detail: string }>;
};

export interface ExecutorHost {
  start(context: HostStartContext): Promise<HostSession>;
}
