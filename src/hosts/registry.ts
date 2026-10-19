/**
 * Host registry (R2). Each host kind is one file plus one line here; `satisfies` makes the compiler
 * reject a missing kind. Hosts load lazily so an HTTP-only local run never imports Docker or URL code.
 */
import type { ExecutorHost, HostFactory, HostKind } from './types.ts';

export const HOSTS = {
  local_process: () => import('./local.ts').then(m => m.localProcessHost),
  mock_loopback: () => import('./mock.ts').then(m => m.mockLoopbackHost),
} satisfies Record<HostKind, () => Promise<HostFactory>>;

export async function hostFactory(kind: HostKind): Promise<HostFactory> {
  return HOSTS[kind]();
}

/** Legacy executor option names map onto host kinds. */
export type HostOverrides = Partial<Record<HostKind, ExecutorHost>> & { local?: ExecutorHost; mock?: ExecutorHost };
export async function hostFor(kind: HostKind, overrides: HostOverrides | undefined): Promise<ExecutorHost> {
  const legacy = kind === 'local_process' ? overrides?.local : kind === 'mock_loopback' ? overrides?.mock : undefined;
  return overrides?.[kind] ?? legacy ?? (await hostFactory(kind)).create();
}
