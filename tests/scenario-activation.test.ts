import { afterEach, expect, it } from 'vitest';
import { cleanupTemps } from '../conformance/helpers.ts';
import { activateScenario } from '../src/core/scenarioActivation.ts';
import { digestOfBytes, verifySelfDigest, type Ref } from '../src/protocol/index.ts';
import { activationFixture } from './fixtures/activation.ts';

afterEach(cleanupTemps);
const ref = (id: string): Ref => ({ id, revision: '1', digest: digestOfBytes(id) });
it('atomically publishes authenticated activation, exact selected assessments and active projection', async () => {
  const f = await activationFixture(); const intent = f.intent();
  const decision = await activateScenario(f.ports, intent);
  expect(verifySelfDigest(decision)).toBe(true); expect(decision.actorId).toBe('authenticated-owner');
  expect(decision.authorizationPolicyRef).toEqual(ref('owner-activation-policy'));
  expect(decision.assessmentRefs).toHaveLength(2); expect(f.published).toHaveLength(1); expect(f.decisions.size).toBe(1);
  expect(f.snapshot.projection).toMatchObject({ state: 'active', aggregateVersion: 4, latestRoundSequence: 2, activationDecisionRef: decision.ref });
  expect(f.snapshot.projection.qualificationRoundRefs).toEqual(decision.intent.roundRefs);
});
it('replays the same intent exactly once, including reordered round selection and later invalidation', async () => {
  const f = await activationFixture(); const intent = f.intent();
  const first = await activateScenario(f.ports, intent);
  const replay = await activateScenario(f.ports, { ...intent, roundRefs: [...intent.roundRefs].reverse() });
  expect(replay).toEqual(first); expect(f.ports.compareAndSwapActivation).toHaveBeenCalledTimes(1);
  f.snapshot.projection.state = 'degraded'; f.snapshot.projection.invalidationEpoch++;
  expect(await activateScenario(f.ports, intent)).toEqual(first);
  expect(f.snapshot.projection.state).toBe('degraded'); expect(f.published).toHaveLength(1);
});
it('never trusts a caller-supplied actor, readiness flag, missing authority or reused key with different intent', async () => {
  const f = await activationFixture(); const intent = f.intent();
  await expect(activateScenario(f.ports, { ...intent, actorId: 'forged-owner' } as never)).rejects.toThrow();
  await expect(activateScenario(f.ports, { ...intent, qualifies: true } as never)).rejects.toThrow();
  f.controls.authorized = false;
  await expect(activateScenario(f.ports, intent)).rejects.toThrow('denied');
  expect(f.ports.read).not.toHaveBeenCalled(); expect(f.published).toEqual([]);
  f.controls.authorized = true; await activateScenario(f.ports, intent);
  await expect(activateScenario(f.ports, { ...intent, targetProfileRef: ref('different') })).rejects.toThrow('idempotency');
  f.controls.authorized = false;
  await expect(activateScenario(f.ports, intent)).rejects.toThrow('denied');
});
it.each(['replayContractRef', 'qualificationPolicyRef', 'qualificationMatrixRef', 'targetProfileRef'] as const)(
  'rejects changed %s before publishing anything', async field => {
    const f = await activationFixture();
    await expect(activateScenario(f.ports, { ...f.intent(), [field]: ref('different') })).rejects.toThrow('bindings changed');
    expect(f.decisions.size).toBe(0); expect(f.published).toEqual([]);
  });
it('refuses duplicate/foreign selected rounds and mock-only qualification', async () => {
  const f = await activationFixture(); const intent = f.intent();
  await expect(activateScenario(f.ports, { ...intent, roundRefs: [intent.roundRefs[0]!, intent.roundRefs[0]!] })).rejects.toThrow('duplicate');
  await expect(activateScenario(f.ports, { ...intent, roundRefs: [intent.roundRefs[0]!, ref('foreign')] })).rejects.toThrow('scenario_not_qualified');
  expect(f.published).toEqual([]);
  const mock = await activationFixture('offline-contract');
  await expect(activateScenario(mock.ports, mock.intent())).rejects.toThrow('scenario_not_qualified');
  expect(mock.published).toEqual([]);
});
it('does not activate when a newer registered round is pending', async () => {
  const f = await activationFixture(); f.pending();
  await expect(activateScenario(f.ports, f.intent())).rejects.toThrow('scenario_not_qualified');
  expect(f.snapshot.projection.state).toBe('validating'); expect(f.published).toEqual([]);
});
it('requires the explicit selected set to contain the latest qualifying round', async () => {
  const f = await activationFixture('native-real', 3); const intent = f.intent();
  await expect(activateScenario(f.ports, { ...intent, roundRefs: intent.roundRefs.slice(0, 2) })).rejects.toThrow('scenario_not_qualified');
  expect(f.published).toEqual([]);
  const decision = await activateScenario(f.ports, { ...intent, roundRefs: intent.roundRefs.slice(1) });
  expect(decision.assessmentRefs).toHaveLength(2); expect(f.published).toHaveLength(1);
});
it('rejects registration, revocation and selected-evidence races inside the final atomic commit', async () => {
  for (const race of ['registration', 'revocation', 'evidence'] as const) {
    const f = await activationFixture(); const intent = f.intent();
    f.controls.beforeCommit = () => {
      if (race === 'registration') f.pending();
      if (race === 'revocation') f.controls.authorized = false;
      if (race === 'evidence') f.locations.values().next().value!.roundRef = ref('changed-result');
    };
    await expect(activateScenario(f.ports, intent), race).rejects.toThrow('changed during activation');
    expect(f.decisions.size, race).toBe(0); expect(f.published, race).toEqual([]);
  }
});
it('concurrent identical deliveries converge on one receipt; different intents conflict', async () => {
  const f = await activationFixture(); const intent = f.intent();
  const both = await Promise.all([activateScenario(f.ports, intent), activateScenario(f.ports, intent)]);
  expect(both[0]).toEqual(both[1]); expect(f.published).toHaveLength(1);
  const g = await activationFixture(); const request = g.intent();
  const results = await Promise.allSettled([activateScenario(g.ports, request), activateScenario(g.ports, { ...request, idempotencyKey: 'different-key' })]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(g.published).toHaveLength(1);
});
it('recovers a committed activation after its acknowledgement was lost, without publishing twice', async () => {
  const f = await activationFixture(); const intent = f.intent(); const commit = f.ports.compareAndSwapActivation;
  f.ports.compareAndSwapActivation = async (...args) => {
    const saved = await commit(...args);
    if (saved) throw new Error('commit acknowledgement lost');
    return saved;
  };
  await expect(activateScenario(f.ports, intent)).rejects.toThrow('acknowledgement lost');
  expect(f.snapshot.projection.state).toBe('active');
  const receipt = await activateScenario(f.ports, intent);
  expect(receipt).toEqual(f.decisions.get(intent.idempotencyKey)); expect(f.published).toHaveLength(1);
});
it('rejects corrupt historical receipts and never writes an activation for active or retired scenarios', async () => {
  const f = await activationFixture(); const intent = f.intent(); const decision = await activateScenario(f.ports, intent);
  f.decisions.set(intent.idempotencyKey, { ...decision, actorId: 'changed' });
  await expect(activateScenario(f.ports, intent)).rejects.toThrow('corrupt');
  for (const state of ['active', 'retired'] as const) {
    const g = await activationFixture(); g.snapshot.projection.state = state;
    await expect(activateScenario(g.ports, g.intent())).rejects.toThrow('requires a validating');
    expect(g.published).toEqual([]);
  }
});
