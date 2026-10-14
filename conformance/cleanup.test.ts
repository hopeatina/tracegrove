import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { cleanupTemps, editFile, planSample, rematerializePayload, runSample, sampleCopy } from './helpers.ts';
import { LocalProcessHost, sourceIdentityDigest } from '../src/hosts/local.ts';
import { ActionRegistry } from '../src/protocol/index.ts';
import { collectCleanup } from '../src/core/cleanup.ts';
import { Deadline } from '../src/core/deadline.ts';
import { EventLog } from '../src/core/events.ts';

afterEach(cleanupTemps);

describe('verifier.cleanup_ownership', () => {
  it('never clears an owned fixture merely because no cleanup action was supplied', async () => {
    const copy = sampleCopy(root => editFile(join(root, 'verification/fixtures/existing-note.recipe.yaml'), text =>
      text.replace(/    cleanup:\n      actionId: notes.delete\/v1\n      absenceReadback: \{ actionId: notes.read\/v1, expectStatus: 404 \}/, '    cleanup: null')));
    rematerializePayload(copy.root);
    const bundle = planSample(copy.configPath);
    expect(bundle.blockers).toEqual([]);
    const summary = await runSample(bundle, copy.stateDir);
    const receipt = summary.receipts[0]!;
    expect(receipt.cleanup.remainingUnknownMutations).toBe(1);
    expect(receipt.cleanup.confirmed).not.toContain('existing_note');
    expect(receipt.proofEligible).toBe(false);
    expect(summary.outcome).not.toBe('passed');
  });

  it('retains an uncertain allocation when the provider creates but omits its captured ID', async () => {
    const copy = sampleCopy(root => editFile(join(root, 'app/app.mjs'), text =>
      text.replace('return send(res, 201, { note });', 'return send(res, 201, { created: true });')));
    const digest = sourceIdentityDigest(copy.root, ['app/app.mjs']).hex;
    editFile(join(copy.root, 'verification/components/notes-api.profile.yaml'), text =>
      text.replace(/hex: "?[0-9a-f]{64}"?/, `hex: "${digest}"`));
    const bundle = planSample(copy.configPath);
    expect(bundle.blockers).toEqual([]);
    const summary = await runSample(bundle, copy.stateDir);
    const receipt = summary.receipts[0]!;
    expect(receipt.cleanup.remainingUnknownMutations, JSON.stringify({ outcome: summary.outcome, reasons: receipt.reasonCodes, cleanup: receipt.cleanup })).toBe(1);
    expect(receipt.cleanup.ownedResources.filter(resource => resource.entityKey === 'existing_note')).toEqual([]);
    expect(receipt.cleanup.reasonCodes).toContain('fixture_allocation_uncertain');
    expect(receipt.proofEligible).toBe(false);
  });

  it('blocks pretending that a registered read action allocated an owned fixture', () => {
    const copy = sampleCopy(root => editFile(join(root, 'verification/actions/notes.registry.yaml'), text =>
      text.replace('effect: create', 'effect: read')));
    expect(planSample(copy.configPath).blockers.some(reason => reason.code === 'fixture_ownership_unavailable')).toBe(true);
  });
  it.each([
    ['non-delete cleanup', 'verification/actions/notes.registry.yaml', 'effect: delete', 'effect: update'],
    ['mutating absence readback', 'verification/fixtures/existing-note.recipe.yaml', 'absenceReadback: { actionId: notes.read/v1, expectStatus: 404 }', 'absenceReadback: { actionId: notes.delete/v1, expectStatus: 404 }'],
    ['success response as absence', 'verification/fixtures/existing-note.recipe.yaml', 'expectStatus: 404', 'expectStatus: 200'],
  ])('blocks %s before fixture execution', (_name, file, before, after) => {
    const copy = sampleCopy(root => editFile(join(root, file), text => text.replace(before, after)));
    rematerializePayload(copy.root);
    const bundle = planSample(copy.configPath);
    expect(bundle.blockers.some(reason => reason.code === 'fixture_cleanup_invalid')).toBe(true);
    expect(bundle.request).toBeNull();
  });
  it('refuses unsafe cleanup even when a caller bypasses planning', async () => {
    const copy = sampleCopy();
    const bundle = planSample(copy.configPath);
    const registry = Object.values(bundle.documents).map(value => ActionRegistry.safeParse(value))
      .find(result => result.success)?.data;
    expect(registry).toBeDefined();
    const deletion = registry!.actions.find(action => action.effect === 'delete')!;
    const read = registry!.actions.find(action => action.effect === 'read')!;
    deletion.effect = 'update';
    let requests = 0;
    const result = await collectCleanup({
      allocated: [{ entityKey: 'fixture', physicalId: 'owned-id',
        cleanup: { actionId: deletion.actionId, args: {} },
        absence: { actionId: read.actionId, expectStatus: 404 } }],
      uncertainAllocations: 0, registry: registry!, origin: 'http://127.0.0.1',
      driver: { async request() { requests++; throw new Error('must not contact provider'); } },
      deadline: Deadline.in(1000), session: null, reason: 'test', log: new EventLog('test', 'test', 1),
    });
    expect(requests).toBe(0);
    expect(result.cleanup.remainingUnknownMutations).toBe(1);
    expect(result.cleanup.confirmed).toEqual([]);
    expect(result.criticalCleanupConfirmed).toBe(false);
  });
  it('seals a non-green receipt when host cleanup acknowledgement fails', async () => {
    const copy = sampleCopy();
    const base = new LocalProcessHost();
    const summary = await runSample(planSample(copy.configPath), copy.stateDir, { hosts: { local: {
      async start(context) {
        const session = await base.start(context);
        return { ...session, async stop(reason) {
          await session.stop(reason); // Always stop the real process, even in this fault test.
          throw new Error('independent host cleanup readback unavailable');
        } };
      },
    } } });
    const receipt = summary.receipts[0]!;
    expect(receipt.cleanup.reasonCodes).toContain('host_stop_unconfirmed');
    expect(receipt.cleanup.confirmed).not.toContain('host.process');
    expect(receipt.proofEligible).toBe(false);
    expect(summary.reasonCodes).toContain('critical_cleanup_unconfirmed');
  });
});
