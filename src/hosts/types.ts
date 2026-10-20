import type { CredentialCheck, RequestCredential } from '../credentials/types.ts';
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
  /** Present when a recording proxy fronts the app: `origin` is then the proxy's origin. */
  traffic?: import('./trafficProxy.ts').TrafficRecorder;
  /** Auth-recipe credentials by credential name (R3). Hosts that only issue bearer tokens may omit it. */
  requestCredentials?: Map<string, RequestCredential>;
  /** Named endpoints this session admits (R4); the primary `origin` is always admitted. */
  endpoints?: Record<string, string>;
  /** Account class of the application boundary; defaults from boundaryMode. */
  accountClass?: 'local' | 'test_sandbox' | 'designated_production' | 'none';
  /** Ask the credential's issuer whether it is still valid (e.g. a broker token that expired mid-run). */
  credentialCheck?(name: string, signal: AbortSignal): Promise<CredentialCheck>;
  /** Resolver kind, reference, recipe, expiry and observed subject per persona; never values. */
  credentialRecords?: import('./personas.ts').CredentialRecord[];
  /** Request ceiling from the environment budget; null for none. */
  requestBudget?: number | null;
  /** Methods the environment admits (production observation: GET/HEAD only); null for any. */
  allowedMethods?: string[] | null;
  stop(reason: string): Promise<{ confirmed: boolean; detail: string }>;
};

export interface ExecutorHost {
  start(context: HostStartContext): Promise<HostSession>;
}

/** Every host kind the kernel knows; the registry in ./registry.ts must cover each one. */
export type HostKind = HostPlan['adapter'];
export type HostCapabilities = { supported: readonly string[]; unsupported: readonly string[] };
export type HostFactory = { kind: HostKind; capabilities: HostCapabilities; create(): ExecutorHost };
export const defineHost = <K extends HostKind>(factory: HostFactory & { kind: K }) => factory;
