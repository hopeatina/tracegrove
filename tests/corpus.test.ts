import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadProject } from '../src/core/corpus.ts';
import { compileCase } from '../src/core/compiler.ts';
import { materializeLogicalPayload } from '../src/core/generators.ts';
import { CaseSpec, CaseFixturePlan, LogicalPayload, RunnerCapabilities, SeedRecipe, parseAs, sameDigest, verifySelfDigest } from '../src/protocol/index.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../src/adapters/http/capabilities.ts';

const SAMPLE = join(import.meta.dirname, '..', 'src', 'samples', 'notes-api', 'verification', 'workflow.yaml');

describe('project corpus', () => {
  it('loads, freezes and resolves the sample corpus with a frozen manifest', () => {
    const project = loadProject(SAMPLE);
    expect(project.suiteCases).toHaveLength(2);
    expect(project.corpus.manifest.members.length).toBeGreaterThan(10);
    for (const doc of project.corpus.documents()) expect(verifySelfDigest(doc.value as never)).toBe(true);
    const created = project.corpus.getAs(CaseSpec, project.suiteCases[0]!.ref);
    expect(created.ref.id).toBe('example.notes.create');
    // $file placeholders became exact refs that resolve.
    expect(project.corpus.has(created.surfaceBindingRef)).toBe(true);
    expect(project.corpus.has(created.personaRef)).toBe(true);
  });

  it('checked-in logical payload equals deterministic regeneration', () => {
    const project = loadProject(SAMPLE);
    const created = project.corpus.getAs(CaseSpec, project.suiteCases[0]!.ref);
    const plan = project.corpus.getAs(CaseFixturePlan, created.fixturePlanRef!);
    const recipe = project.corpus.getAs(SeedRecipe, plan.seedRecipeRef);
    const checkedIn = project.corpus.getAs(LogicalPayload, plan.logicalPayloadRef);
    const regenerated = materializeLogicalPayload(recipe, checkedIn.scope);
    expect(sameDigest(regenerated.ref.digest, checkedIn.ref.digest)).toBe(true);
  });

  it('compiles the real case against the HTTP runner and rejects an oversize flow', () => {
    const project = loadProject(SAMPLE);
    const created = project.corpus.getAs(CaseSpec, project.suiteCases[0]!.ref);
    const plan = project.corpus.getAs(CaseFixturePlan, created.fixturePlanRef!);
    const recipe = project.corpus.getAs(SeedRecipe, plan.seedRecipeRef);
    const compiled = compileCase(created, HTTP_RUNNER_CAPABILITIES, recipe);
    expect(compiled.orderedStepIds).toEqual(['create', 'read_back', 'intruder_read', 'delete', 'confirm_absent', 'existing_intact']);
    expect([...compiled.credentialNames]).toEqual(['intruder_token']);
    const tiny = parseAs(RunnerCapabilities, { ...HTTP_RUNNER_CAPABILITIES, maxStepsPerCase: 2 }, 'caps');
    expect(() => compileCase(created, tiny, recipe)).toThrow(/step_limit_exceeded/);
  });
});

describe('definition identity is machine independent', () => {
  it('the same corpus hashes identically regardless of the local owner', () => {
    const before = process.env.WORKFLOW_VERIFY_OWNER;
    process.env.WORKFLOW_VERIFY_OWNER = 'alice';
    const a = loadProject(SAMPLE).corpus.manifest.ref.digest.hex;
    process.env.WORKFLOW_VERIFY_OWNER = 'runner';
    const b = loadProject(SAMPLE).corpus.manifest.ref.digest.hex;
    if (before === undefined) delete process.env.WORKFLOW_VERIFY_OWNER; else process.env.WORKFLOW_VERIFY_OWNER = before;
    expect(a).toBe(b);
  });
});
