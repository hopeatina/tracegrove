/** Durable local inventory under the existing ledger's exclusive writer. No provider recovery or PID-based deletion. */
import { z } from 'zod';
import { digestOfValue, RefSchema, ScopeSchema, type Ref } from '../protocol/index.ts';
import { Conflict } from './errors.ts';
import type { LocalLedger } from './ledger.ts';
import type { LedgerReadView } from './ledgerRecords.ts';
const Binding = z.object({ executionId: z.string(), attemptId: z.string(), generation: z.number().int().positive(),
  campaignId: z.string(), requestDigest: z.string().regex(/^[a-f0-9]{64}$/), scope: ScopeSchema }).strict();
export type ExecutionOwnershipBinding = z.infer<typeof Binding>;
type Binding = ExecutionOwnershipBinding;
const Resource = z.object({ key: z.string(), kind: z.enum(['host', 'fixture']), cellId: z.string(), planRef: RefSchema,
  state: z.enum(['reserved', 'observed', 'cleanup_pending', 'removed']),
  physicalIds: z.array(z.string()).max(64),
}).strict();
const Inventory = z.object({ binding: Binding, resources: z.array(Resource).max(10000) }).strict();
const aggregate = (executionId: string) => `ownership:${executionId}`;
const equal = (a: unknown, b: unknown) => digestOfValue(a).hex === digestOfValue(b).hex;

/** Only the trusted executor constructs this writer; returned snapshots grant no effect authority. */
export class ExecutionOwnership {
  private readonly binding: Binding;
  constructor(private readonly ledger: LocalLedger, binding: Binding) { this.binding = structuredClone(Binding.parse(binding)); }
  initialize(): void {
    this.ledger.append(aggregate(this.binding.executionId), 0, 'ownership.initialized', { binding: this.binding, resources: [] });
  }
  private read() {
    return readExecutionOwnership(this.ledger, this.binding);
  }
  private change(type: string, update: (resources: z.infer<typeof Resource>[]) => void): void {
    const { row, inventory } = this.read(); update(inventory.resources);
    this.ledger.append(row.aggregateId, row.version, type, Inventory.parse(inventory));
  }
  reserve(key: string, kind: 'host' | 'fixture', cellId: string, planRef: Ref): void {
    this.change('ownership.reserved', resources => {
      if (resources.some(r => r.key === key)) throw new Conflict('ownership_resource_already_reserved');
      resources.push({ key, kind, cellId, planRef, state: 'reserved', physicalIds: [] });
    });
  }
  observed(key: string, physicalIds: string[]): void {
    this.change('ownership.observed', resources => {
      const item = resources.find(r => r.key === key);
      if (!item || item.state !== 'reserved' || !physicalIds.length) throw new Conflict('ownership_acknowledgement_invalid');
      item.state = 'observed'; item.physicalIds = physicalIds;
    });
  }
  cleaning(key: string): void {
    this.change('ownership.cleanup_pending', resources => {
      const item = resources.find(r => r.key === key);
      if (!item || item.state !== 'observed') throw new Conflict('ownership_cleanup_not_observed');
      item.state = 'cleanup_pending';
    });
  }
  removed(key: string): void {
    this.change('ownership.removed', resources => {
      const item = resources.find(r => r.key === key);
      if (!item || item.state !== 'cleanup_pending') throw new Conflict('ownership_cleanup_acknowledgement_invalid');
      item.state = 'removed';
    });
  }
}

/** Read the same validated inventory without giving the reader any mutation methods. */
export function readExecutionOwnership(ledger: LedgerReadView, expected: Binding) {
  const row = ledger.current(aggregate(expected.executionId));
  if (!row) throw new Conflict('ownership_inventory_missing; reconcile the interrupted attempt before retrying');
  const inventory = Inventory.parse(row.data);
  if (!equal(inventory.binding, expected)) throw new Conflict('ownership_binding_mismatch');
  return { row, inventory };
}

/** An interrupted attempt never automatically replays an uncertain acquisition, including legacy missing inventory. */
export function assertInterruptedOwnershipResolved(ledger: LedgerReadView, expected: Binding): void {
  const { inventory } = readExecutionOwnership(ledger, expected);
  if (inventory.resources.some(r => r.state !== 'removed')) throw new Conflict('ownership_reconciliation_required; interrupted resources remain unresolved; no acquisition was replayed');
}
