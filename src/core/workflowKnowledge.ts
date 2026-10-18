import { z } from 'zod';
import { BrowserObservation, CaseSpec, Persona, EnvironmentBinding, WorkflowKnowledge, WorkflowKnowledgePage, WorkflowKnowledgeQuery,
  digestOfValue, freeze, refKey, sameRef, type WorkflowMapEntry, type WorkflowMapStep, type Step,
} from '../protocol/index.ts';
import { VerifiedBundleSnapshot, type VerifiedBundleRecords } from './bundle.ts';
import { lookupCursor, lookupOffset } from './lookupCursor.ts';
import { Conflict } from './errors.ts';
import { workflowFixtureKnowledge } from './workflowFixtureKnowledge.ts';

export const WORKFLOW_KNOWLEDGE_LIMITS = { workflows: 500, steps: 20000, reportBytes: 16*1024*1024, pageBytes: 128*1024 } as const;
const CAPTURE=Symbol('workflow knowledge from verified evidence');
const route = (path: string) => path.split(/[?#]/,1)[0]!;
function declaredStep(step: Step): Pick<WorkflowMapStep,'stepId'|'operation'|'declaredRoute'|'declaredLandmark'> {
  return { stepId: step.id,
    operation: step.kind === 'http.request' ? step.method : step.kind === 'observe' ? step.readback.method : step.kind === 'ui.action' ? step.command.kind : step.kind,
    declaredRoute: step.kind === 'http.request' || step.kind === 'ui.navigate' ? route(step.path) : step.kind === 'observe' ? route(step.readback.path) : null,
    declaredLandmark: step.kind === 'ui.action' ? step.command.target : step.kind === 'ui.observe' ? step.target : null };
}
function recordedRoute(step: Step, output: unknown): { path: string|null; browser: boolean } {
  const browser = BrowserObservation.safeParse(output);
  const expected = step.kind === 'ui.navigate' ? 'navigate' : step.kind === 'ui.observe' ? 'read' : step.kind === 'ui.action' ? step.command.kind : null;
  if (expected && browser.success && browser.data.kind === expected) {
    try { const url=new URL(browser.data.url);return {path:['http:','https:'].includes(url.protocol)?url.pathname:null,browser:true}; } catch { return {path:null,browser:true}; }
  }
  // Retain a concrete request URL only when the recorded HTTP output actually supplies one.
  if (step.kind === 'http.request' || step.kind === 'observe') {
    const http=z.object({url:z.string()}).safeParse(output);
    if(http.success)try {const url=new URL(http.data.url);return {path:['http:','https:'].includes(url.protocol)?url.pathname:null,browser:false}}catch{ /* absent route evidence */ }
  }
  return {path:null,browser:false};
}
function workflow(bundle: VerifiedBundleRecords, cell: VerifiedBundleRecords['selection']['cells'][number],spec:CaseSpec,persona:Persona): WorkflowMapEntry {
  const receipt=bundle.receipts.find(r=>r.selectionCellId===cell.selectionCellId);
  const observed=new Map(receipt?.steps.map(s=>[s.stepId,s])??[]),assertions=new Map(receipt?.assertions.map(a=>[a.assertionId,a])??[]);
  const steps=spec.steps.map(step=>{
    const observation=observed.get(step.id),actual=recordedRoute(step,observation?.output);
    return {...declaredStep(step),observation:observation?{result:observation.result,reasonCode:observation.reasonCode,
      observedRoute:actual.path,browserCommandObserved:actual.browser,inputDigest:observation.inputDigest,outputDigest:observation.outputDigest,eventIds:observation.eventIds}:null};
  });
  const tags=[...new Set(spec.assertions.flatMap(a=>a.coverageTags))].sort();
  const gaps:WorkflowMapEntry['gaps']=[];
  if(!receipt)gaps.push({stepId:null,reason:'receipt_unavailable'});
  if(!receipt?.environment.observed)gaps.push({stepId:null,reason:'target_unobserved'});
  for(const step of steps){
    if(!step.observation||step.observation.result==='not_run')gaps.push({stepId:step.stepId,reason:'step_unobserved'});
    if(step.declaredLandmark&&!step.observation?.browserCommandObserved)gaps.push({stepId:step.stepId,reason:'landmark_unobserved'});
  }
  return {selectionCellId:cell.selectionCellId,required:cell.required,caseRef:cell.caseRef,workflowId:spec.workflowId,purpose:spec.purpose,
    surface:spec.surface,surfaceBindingRef:cell.surfaceBindingRef,variantRef:cell.variantRef,navigationRef:spec.navigationRef,
    aliases:[...new Set([spec.ref.id,spec.workflowId,...tags])].sort(),coverageTags:tags,declaredSourceRefs:spec.sourceRefs,
    prerequisites:{personaRef:cell.personaRef,roleScopes:persona.roleScopes,traits:persona.traits,
      recipeRefs:[persona.stateRecipeRef,persona.dataVolumeRecipeRef,persona.entitlementRef,persona.connectorStateRef,persona.authRecipeRef,persona.cleanupPolicyRef].filter(v=>v!==null),
      fixturePlanRef:spec.fixturePlanRef,cleanupRecipeRef:spec.effects.cleanupRecipeRef,fixture:workflowFixtureKnowledge(bundle.documents,spec.fixturePlanRef)},environmentRef:cell.environmentRef,
    expectedTarget:cell.expectedTarget,recordedTarget:receipt?.environment.observed??null,gaps,
    receipt:receipt?{ref:receipt.ref,eventsDigest:receipt.eventsDigest,finalizedAt:receipt.finalizedAt,outcome:receipt.outcome,proofEligible:receipt.proofEligible}:null,
    steps,transitions:steps.slice(1).map((step,i)=>({fromStepId:steps[i]!.stepId,toStepId:step.stepId,basis:'declared_sequence',
      bothCommandsCompleted:steps[i]!.observation?.result==='completed'&&step.observation?.result==='completed'})),
    assertionCoverage:[...spec.preconditions.map(a=>({assertionId:a.id,stepId:a.stepId,required:a.required,phase:'precondition' as const,tags:a.coverageTags,result:null})),
      ...spec.assertions.map(a=>({assertionId:a.id,stepId:a.stepId,required:a.required,phase:'assertion' as const,tags:a.coverageTags,result:assertions.get(a.id)?.result??null}))]};
}
/** Immutable recorded navigation knowledge, derived only from a completely reduced captured bundle. */
export class WorkflowKnowledgeSnapshot {
  readonly #report: WorkflowKnowledge;
  private constructor(token:typeof CAPTURE,report:WorkflowKnowledge){if(token!==CAPTURE)throw new Conflict('capture verified workflow knowledge first');this.#report=structuredClone(report)}
  static capture(snapshot:VerifiedBundleSnapshot):WorkflowKnowledgeSnapshot {
    if(!(snapshot instanceof VerifiedBundleSnapshot))throw new Conflict('workflow knowledge requires a verified captured execution bundle');
    const bundle=snapshot.records;
    if(bundle.selection.cells.length>WORKFLOW_KNOWLEDGE_LIMITS.workflows)throw new Conflict('workflow map exceeds the workflow bound');
    let stepCount=0;const workflows:WorkflowMapEntry[]=[];
    for(const cell of bundle.selection.cells){
      const spec=CaseSpec.parse(bundle.documents[refKey(cell.caseRef)]),persona=Persona.parse(bundle.documents[refKey(cell.personaRef)]);
      stepCount+=spec.steps.length;if(stepCount>WORKFLOW_KNOWLEDGE_LIMITS.steps)throw new Conflict('workflow map exceeds the step bound');
      workflows.push(workflow(bundle,cell,spec,persona));
    }
    workflows.sort((a,b)=>a.selectionCellId.localeCompare(b.selectionCellId));
    const report=WorkflowKnowledge.parse(freeze({schemaVersion:'tracegrove.workflow-knowledge/v1',
      ref:{id:`workflow-knowledge-${snapshot.manifestDigest.hex}`,revision:'1'},scope:bundle.request.requestedScope,
      operation:'read_only',authority:'none',issuerTrust:'not_authenticated',freshness:'recorded_only_revalidate_at_execution',qualification:'not_evaluated',
      evidence:{manifestDigest:snapshot.manifestDigest,requestRef:bundle.request.ref,selectionRef:bundle.selection.ref,campaignRef:bundle.campaign.ref,
        campaignOutcome:bundle.campaign.outcome,coverage:bundle.campaign.coverage},workflows,excludedCells:bundle.selection.excludedCells}));
    if(Buffer.byteLength(JSON.stringify(report))>WORKFLOW_KNOWLEDGE_LIMITS.reportBytes)throw new Conflict('workflow map exceeds the byte bound');
    return new WorkflowKnowledgeSnapshot(CAPTURE,report);
  }
  get report():WorkflowKnowledge{return structuredClone(this.#report)}
  get(selectionCellId:string):WorkflowMapEntry {
    const entry=this.#report.workflows.find(w=>w.selectionCellId===selectionCellId);
    if(!entry)throw new Conflict('workflow selection is not in this recorded map');return structuredClone(entry);
  }
  search(input:WorkflowKnowledgeQuery={}):WorkflowKnowledgePage {
    const {cursor,limit,...filter}=WorkflowKnowledgeQuery.parse(input),fingerprint=digestOfValue(filter).hex,snapshot=refKey(this.#report.ref);
    const offset=lookupOffset(cursor,snapshot,fingerprint);
    const text=filter.text?.normalize('NFKC').toLowerCase();
    const matches=this.#report.workflows.filter(w=>{
      if(filter.caseId&&filter.caseId!==w.caseRef.id||filter.workflowId&&filter.workflowId!==w.workflowId||filter.surface&&filter.surface!==w.surface||filter.tag&&!w.coverageTags.includes(filter.tag))return false;
      if(filter.route&&!w.steps.some(s=>s.declaredRoute===filter.route||s.observation?.observedRoute===filter.route))return false;
      const haystack=[w.purpose,...w.aliases,...w.prerequisites.roleScopes,...w.steps.flatMap(s=>[s.declaredRoute??'',s.observation?.observedRoute??'',s.declaredLandmark?.name??''])].join(' ').normalize('NFKC').toLowerCase();
      return !text||haystack.includes(text);
    });
    if(offset>matches.length)throw new Conflict('lookup cursor is outside this recorded result set');
    const results=matches.slice(offset,offset+limit),next=offset+results.length;
    const page=WorkflowKnowledgePage.parse({schemaVersion:'tracegrove.workflow-knowledge-page/v1',snapshotRef:this.#report.ref,
      operation:'read_only',authority:'none',freshness:'recorded_only_revalidate_at_execution',evidence:this.#report.evidence,results,total:matches.length,
      cursor:next<matches.length?lookupCursor(snapshot,fingerprint,next):null});
    if(Buffer.byteLength(JSON.stringify(page))>WORKFLOW_KNOWLEDGE_LIMITS.pageBytes)throw new Conflict('workflow lookup page exceeds the byte bound; reduce limit');
    return page;
  }
  /** Caller-declared compatibility is a stale-recipe hint, never a live landmark or authority check. */
  assess(selectionCellId:string, current:Pick<WorkflowMapEntry,'caseRef'|'expectedTarget'>) {
    const entry=this.get(selectionCellId),input=z.object({caseRef:CaseSpec.shape.ref,expectedTarget:EnvironmentBinding.shape.expected}).strict().parse(current);
    const caseMatches=sameRef(entry.caseRef,input.caseRef),targetMatches=digestOfValue(entry.expectedTarget).hex===digestOfValue(input.expectedTarget).hex;
    return {caseMatches,targetMatches,state:caseMatches&&targetMatches?'declared_context_matches' as const:'stale_for_declared_context' as const,
      landmarkValidation:'required_at_execution' as const,authority:'none' as const};
  }
}
