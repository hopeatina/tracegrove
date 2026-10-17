import { z } from 'zod';
import { ChangeModel, PlanSourceValidation, RefSchema, RevisionMatrix, ScopeSchema, SourcePlan, digestOfBytes,
  freeze, parseAs, refKey, refList, sameDigest, sameRef, sameScope, verifySelfDigest, type ChangeElement, type Ref, type Scope } from '../protocol/index.ts';
import { SourceCitation, verifySourceCitation, type SourceCitationPorts } from './source-citation.ts';
import { Conflict } from './errors.ts';
import { newId } from './clock.ts';

export interface SourceAnalysisPorts extends SourceCitationPorts {
  resolveDocument(ref: Ref, scope: Scope): Promise<unknown>;
  readDiff(scope: Scope, repository: RevisionMatrix['repositories'][number]): Promise<Uint8Array>;
  /** Registered policy owns missing-base alternatives; absence cannot invent an empty diff. */
  verifyRevisionPolicy(scope: Scope, matrix: RevisionMatrix, policyRef: Ref): Promise<void>;
  /** Independent AST/schema/route oracle, never another unsupported model opinion. */
  verifyElement(scope: Scope, element: ChangeElement, citations: SourceCitation[], policyRef: Ref): Promise<{ verified: boolean; evidenceRefs: Ref[] }>;
  /** Frozen requirement policy admits exclusions/no-E2E reasoning and retains unresolved questions. */
  verifyCoverage(scope: Scope, plan: SourcePlan, model: ChangeModel, policyRef: Ref): Promise<void>;
}
export const MAX_SOURCE_DIFF_BYTES = 4 * 1024 * 1024;
const keys = (refs: Ref[]) => refs.map(refKey).sort().join('\n');

/** Checks selected immutable source facts and derivations; supplies no execution authority. */
export async function validatePlanSources(ports: SourceAnalysisPorts, input: unknown, policy: Ref): Promise<PlanSourceValidation> {
  const plan = SourcePlan.parse(input);
  if (new Set(plan.candidates.map(candidate => candidate.id)).size !== plan.candidates.length) throw new Conflict('duplicate plan candidate identity');
  const policyRef = RefSchema.parse(policy);
  const scope = ScopeSchema.parse(plan.scope);
  if (!verifySelfDigest(plan)) throw new Conflict('source plan digest mismatch');
  const resolve = async <T extends z.ZodType<{ ref: Ref; scope: Scope }>>(schema: T, ref: Ref) => {
    const result = parseAs(schema, await ports.resolveDocument(structuredClone(ref), structuredClone(scope)), 'source document');
    if (!sameRef(result.ref, ref) || !sameScope(result.scope, scope) || !verifySelfDigest(result)) throw new Conflict('source document digest or scope mismatch');
    return result;
  };
  const model = await resolve(ChangeModel, plan.changeModelRef);
  const matrix = await resolve(RevisionMatrix, plan.revisionMatrixRef);
  if (!sameRef(model.revisionMatrixRef, matrix.ref)) throw new Conflict('change model revision matrix mismatch');
  const repositories = new Map(matrix.repositories.map(repository => [refKey(repository.repositoryRef), repository]));
  if (repositories.size !== matrix.repositories.length) throw new Conflict('duplicate repository in revision matrix');
  for (const repository of matrix.repositories) {
    if ((repository.mergeBaseCommit === null) !== (repository.mergeBaseAbsentReason !== null)) throw new Conflict('missing merge base needs an explicit reason');
    await ports.authorize(structuredClone(scope), structuredClone(repository.repositoryRef));
    const diff = await ports.readDiff(structuredClone(scope), structuredClone(repository));
    if (!(diff instanceof Uint8Array) || diff.byteLength > MAX_SOURCE_DIFF_BYTES || !sameDigest(digestOfBytes(Buffer.from(diff)), repository.diffRef.digest)) {
      throw new Conflict('full diff bytes are unavailable, oversized or changed');
    }
  }
  await ports.verifyRevisionPolicy(structuredClone(scope), structuredClone(matrix), structuredClone(policyRef));
  const elements = new Map(model.elements.map(element => [element.id, element]));
  if (elements.size !== model.elements.length) throw new Conflict('duplicate source element identity');
  const diagnostics = model.extractorReports.filter(report => report.status !== 'complete').flatMap(report => {
    if (!report.diagnosticRefs.length) throw new Conflict('incomplete extraction needs retained diagnostics');
    return report.diagnosticRefs;
  });
  const gaps = new Set(plan.gapRefs.map(refKey));
  if (diagnostics.some(ref => !gaps.has(refKey(ref))) || (model.unresolvedQuestions.length && !plan.gapRefs.length)) {
    throw new Conflict('source plan discarded required extraction gaps');
  }
  const runnable = new Map<string, ChangeElement>();
  for (const candidate of plan.candidates) {
    if (candidate.sourceElementIds.some(id => !elements.has(id))) throw new Conflict('candidate cites an unknown source element');
    if (candidate.disposition !== 'runnable') {
      if (!candidate.reasonRefs.length) throw new Conflict('withheld candidate needs retained reasons');
      continue;
    }
    if (!candidate.caseRef || !candidate.sourceElementIds.length) throw new Conflict('runnable candidate needs a case and source elements');
    for (const id of candidate.sourceElementIds) runnable.set(id, elements.get(id)!);
  }
  const citations = new Map<string, SourceCitation>();
  for (const element of runnable.values()) {
    if (element.verification !== 'confirmed' || !element.citationRefs.length || !element.verificationEvidenceRefs.length) {
      throw new Conflict('runnable derivation lacks confirmed independent source evidence');
    }
    const selected: SourceCitation[] = [];
    for (const ref of element.citationRefs) {
      let citation = citations.get(refKey(ref));
      if (!citation) {
        if (citations.size >= 500) throw new Conflict('source validation exceeds the citation bound');
        citation = SourceCitation.parse(await ports.resolveDocument(structuredClone(ref), structuredClone(scope)));
        if (!sameRef(citation.ref, ref)) throw new Conflict('citation resolver substituted its reference');
        const repository = repositories.get(refKey(citation.repositoryRef));
        if (!repository || ![repository.headCommit, repository.baseCommit, repository.mergeBaseCommit].includes(citation.resolvedCommit)) {
          throw new Conflict('citation is outside selected repository revisions');
        }
        citation = (await verifySourceCitation(ports, citation, scope)).citation;
        citations.set(refKey(ref), citation);
      }
      selected.push(citation);
    }
    const checked = z.object({ verified: z.boolean(), evidenceRefs: refList().min(1) }).strict().parse(
      await ports.verifyElement(structuredClone(scope), structuredClone(element), structuredClone(selected), structuredClone(policyRef)));
    if (!checked.verified || keys(checked.evidenceRefs) !== keys(element.verificationEvidenceRefs)) throw new Conflict('independent element confirmation disagrees');
  }
  await ports.verifyCoverage(structuredClone(scope), structuredClone(plan), structuredClone(model), structuredClone(policyRef));
  return PlanSourceValidation.parse(freeze({ schemaVersion: 'workflow.source-validation/v1', ref: { id: newId('source-validation'), revision: '1' },
    scope, sourcePlanRef: plan.ref, changeModelRef: model.ref, revisionMatrixRef: matrix.ref, policyRef,
    verifiedCitationRefs: [...citations.values()].map(citation => citation.ref), runnableElementIds: [...runnable.keys()], retainedDiagnosticRefs: diagnostics,
  }));
}
