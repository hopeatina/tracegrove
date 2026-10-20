/**
 * One capability table (R7). Compiled cases, host plans and the planner refer to these ids; the
 * planner admits a case only when its host kind provides every required capability, and
 * `tracegrove capabilities` renders the same table as a matrix.
 */
import type { HostKind } from '../hosts/types.ts';

export type CapabilitySpec = {
  version: number;
  layer: 'surface' | 'fixture' | 'host';
  summary: string;
  /** Host kinds that can provide it. */
  providedBy: readonly HostKind[];
  /** Other capabilities it needs. */
  requires: readonly string[];
  /** A local precondition to probe before planning (an optional dependency or binary). */
  probe: 'mcp_sdk' | 'playwright' | 'docker' | null;
  /** Whether using it writes to the target. */
  writes: boolean;
  docs: string;
};

const LIVE: readonly HostKind[] = ['local_process', 'mock_loopback', 'url', 'compose', 'container'];
const LOOPBACK: readonly HostKind[] = ['local_process', 'mock_loopback', 'compose', 'container'];
const DOCKER: readonly HostKind[] = ['compose', 'container'];
const LAUNCHED: readonly HostKind[] = ['local_process'];
const docs = (anchor: string) => `docs/environments.md#${anchor}`;

export const CAPABILITIES = {
  'http.request': { version: 1, layer: 'surface', summary: 'HTTP requests to the app', providedBy: LIVE, requires: [], probe: null, writes: false, docs: docs('capabilities') },
  observe: { version: 1, layer: 'surface', summary: 'Independent readback polling', providedBy: LIVE, requires: ['http.request'], probe: null, writes: false, docs: docs('capabilities') },
  'fixture.http': { version: 1, layer: 'fixture', summary: 'Owned fixtures created and deleted through the app API', providedBy: LIVE, requires: ['http.request'], probe: null, writes: true, docs: docs('capabilities') },
  'mcp.call': { version: 1, layer: 'surface', summary: 'MCP tool calls over streamable HTTP', providedBy: LAUNCHED, requires: ['http.request'], probe: 'mcp_sdk', writes: false, docs: docs('capabilities') },
  'conversation.run': { version: 1, layer: 'surface', summary: 'Scripted voice or chat conversation (RTVI WebSocket or HTTP chat)', providedBy: LIVE, requires: ['http.request'], probe: null, writes: true, docs: 'docs/voice-and-chat.md' },
  'ui.navigate': { version: 1, layer: 'surface', summary: 'Browser navigation (Playwright)', providedBy: LAUNCHED, requires: ['http.request'], probe: 'playwright', writes: false, docs: docs('capabilities') },
  'ui.action': { version: 1, layer: 'surface', summary: 'Browser actions (Playwright)', providedBy: LAUNCHED, requires: ['ui.navigate'], probe: 'playwright', writes: false, docs: docs('capabilities') },
  'ui.observe': { version: 1, layer: 'surface', summary: 'Browser observations (Playwright)', providedBy: LAUNCHED, requires: ['ui.navigate'], probe: 'playwright', writes: false, docs: docs('capabilities') },
  native_job: { version: 1, layer: 'host', summary: 'Native Node job bridge over IPC', providedBy: LAUNCHED, requires: ['shell'], probe: null, writes: true, docs: docs('capabilities') },
  shell: { version: 1, layer: 'host', summary: 'Launch the app as a local process', providedBy: LAUNCHED, requires: [], probe: null, writes: false, docs: docs('capabilities') },
  'network_origin:loopback': { version: 1, layer: 'host', summary: 'App reachable on loopback', providedBy: LOOPBACK, requires: [], probe: null, writes: false, docs: docs('capabilities') },
  'network_origin:external': { version: 1, layer: 'host', summary: 'A deployment reached over the network', providedBy: ['url'], requires: [], probe: null, writes: false, docs: docs('capabilities') },
  container: { version: 1, layer: 'host', summary: 'App runs in Docker containers tracegrove owns', providedBy: DOCKER, requires: [], probe: 'docker', writes: false, docs: docs('docker') },
  confirmed_cancel: { version: 1, layer: 'host', summary: 'Host confirms it stopped what it started', providedBy: LIVE, requires: [], probe: null, writes: false, docs: docs('capabilities') },
  artifact_delivery: { version: 1, layer: 'host', summary: 'Evidence artifacts are retained', providedBy: LIVE, requires: [], probe: null, writes: false, docs: docs('capabilities') },
  file_persistence: { version: 1, layer: 'host', summary: 'Owned data directory', providedBy: LAUNCHED, requires: [], probe: null, writes: false, docs: docs('capabilities') },
} as const satisfies Record<string, CapabilitySpec>;
export type CapabilityId = keyof typeof CAPABILITIES;

export const isCapabilityId = (id: string): id is CapabilityId => Object.hasOwn(CAPABILITIES, id);

/** Capability ids a compiled case needs, in the order the compiler always wrote them. */
export function caseCapabilities(input: { mcp: boolean; browser: boolean; fixtures: boolean; conversation?: boolean }): CapabilityId[] {
  return ['http.request', 'observe', ...(input.mcp ? ['mcp.call' as const] : []), ...(input.conversation ? ['conversation.run' as const] : []), ...(input.browser ? ['ui.navigate', 'ui.action', 'ui.observe'] as const : []), ...(input.fixtures ? ['fixture.http' as const] : [])];
}

/** Why `host` cannot run something that needs `id`, or null when it can. */
export function capabilityGap(id: string, host: HostKind): string | null {
  if (!isCapabilityId(id)) return null; // unknown ids stay with the runner's own admission check
  const spec: CapabilitySpec = CAPABILITIES[id];
  return spec.providedBy.includes(host) ? null : `${id} is not provided by the ${host} host (provided by ${spec.providedBy.join(', ')})`;
}
