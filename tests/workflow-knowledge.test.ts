import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeSample } from '../src/cli/samples/write.ts';
import { loadProject, localScope } from '../src/core/corpus.ts';
import { plan } from '../src/core/planner.ts';
import { executeBundle } from '../src/core/executor.ts';
import { LocalLedger } from '../src/core/ledger.ts';
import { VerifiedBundleSnapshot, exportVerifiedBundle } from '../src/core/bundle.ts';
import { chromium, type Browser } from 'playwright';
import { startUi, type UiServer } from '../src/authoring/ui.ts';
import { WorkflowKnowledgeSnapshot, WORKFLOW_KNOWLEDGE_LIMITS } from '../src/core/workflowKnowledge.ts';
import { WorkflowKnowledge, WorkflowKnowledgePage, digestOfValue, freeze, verifySelfDigest, refKey } from '../src/protocol/index.ts';
import { NativeObservationSnapshot } from '../src/imports/index.ts';
import { lookupCursor, lookupOffset } from '../src/core/lookupCursor.ts';
import { cleanupTemps, planSample, sampleCopy, runSample } from '../conformance/helpers.ts';
import { runCli } from './fixtures/cli.ts';

let passed:VerifiedBundleSnapshot,failed:VerifiedBundleSnapshot,missing:VerifiedBundleSnapshot,api:VerifiedBundleSnapshot;
let goodPath:string,badPath:string,root:string,original:string,server:UiServer,browser:Browser;
beforeAll(async()=>{
  mkdirSync(resolve('artifacts/qa'),{recursive:true});root=mkdtempSync(resolve('artifacts/qa/workflow-knowledge-'));
  const config=writeSample(resolve('src/samples'),'notes-browser',root),casePath=join(root,'verification/cases/notes.browser.yaml');original=readFileSync(casePath,'utf8');
  async function run(){const stateDir=join(root,'state'),ledger=LocalLedger.open(stateDir);try{
    const result=await executeBundle({bundle:plan({project:loadProject(config),profileName:'native-real',scope:localScope()}),stateDir,ledger,scope:localScope()});
    return {snapshot:VerifiedBundleSnapshot.open(result.executionDir),path:result.executionDir};
  }finally{ledger.close()}}
  const good=await run();passed=good.snapshot;goodPath=good.path;expect(passed.records.campaign.outcome).toBe('passed');
  writeFileSync(casePath,original.replaceAll('value: Existing note','value: controlled wrong expectation').replace('id: read_dom\n    kind: ui.observe\n    timeoutMs: 5000','id: read_dom\n    kind: ui.observe\n    timeoutMs: 200'));
  const bad=await run();failed=bad.snapshot;badPath=bad.path;expect(failed.records.campaign.outcome).toBe('assertion_failed');
  writeFileSync(casePath,original.replace('role: button, name: Refresh','role: button, name: absent controlled landmark').replace('id: refresh\n    kind: ui.action\n    timeoutMs: 5000','id: refresh\n    kind: ui.action\n    timeoutMs: 200'));
  missing=(await run()).snapshot;expect(missing.records.campaign.outcome).not.toBe('passed');writeFileSync(casePath,original);
  const f=sampleCopy(project=>{
    const cases=join(project,'verification/cases');
    writeFileSync(join(cases,'second.yaml'),readFileSync(join(cases,'notes.create.yaml'),'utf8').replace('id: example.notes.create','id: example.notes.second'));
    const suite=join(cases,'notes.suite.yaml');writeFileSync(suite,readFileSync(suite,'utf8')+'\n  - { caseRef: ./second.yaml, required: true, profiles: [native-real] }\n');
  }),result=await runSample(planSample(f.configPath),f.stateDir);expect(result.outcome).toBe('passed');api=VerifiedBundleSnapshot.open(result.executionDir);
  for(const [name,path] of [['observed',goodPath],['failed',badPath]]){const parent=join(root,'.tracegrove/runs',name!);mkdirSync(parent,{recursive:true});expect(exportVerifiedBundle(path!,join(parent,'bundle')).ok).toBe(true)}
  server=await startUi({dir:root});browser=await chromium.launch({headless:true});
},60000);
afterAll(async()=>{await browser?.close();await server?.close();cleanupTemps()});

it('derives cited routes, accessible landmarks, fixture actions, target identities and assertion coverage from real execution',()=>{
  const snapshot=WorkflowKnowledgeSnapshot.capture(passed),report=WorkflowKnowledge.parse(snapshot.report),entry=report.workflows[0]!;
  expect(verifySelfDigest(report)).toBe(true);expect(report.evidence.manifestDigest).toEqual(passed.manifestDigest);
  expect(entry.receipt?.ref).toEqual(passed.records.receipts[0]!.ref);expect(entry.receipt?.eventsDigest).toEqual(passed.records.receipts[0]!.eventsDigest);
  expect(entry.steps.find(s=>s.stepId==='navigate')).toMatchObject({declaredRoute:'/ui',observation:{result:'completed',observedRoute:'/ui',browserCommandObserved:true}});
  expect(entry.steps.find(s=>s.stepId==='refresh')).toMatchObject({declaredLandmark:{by:'role',role:'button',name:'Refresh'},observation:{browserCommandObserved:true}});
  expect(entry.steps.find(s=>s.stepId==='read_dom')).toMatchObject({declaredLandmark:{by:'testId',name:'notes'}});
  expect(entry.prerequisites.fixture?.entities[0]).toMatchObject({entityKey:'existing_note',setup:{method:'POST',effect:'create'},cleanup:{method:'DELETE'},absenceReadback:{method:'GET'}});
  expect(entry.recordedTarget).toEqual(passed.records.receipts[0]!.environment.observed);
  expect(entry.assertionCoverage).toContainEqual(expect.objectContaining({tags:['notes.ui'],result:'pass'}));expect(entry.gaps).toEqual([]);
  expect(entry.transitions).toHaveLength(3);expect(entry.transitions.every(t=>t.basis==='declared_sequence'&&t.bothCommandsCompleted)).toBe(true);
  expect(report).toMatchObject({authority:'none',issuerTrust:'not_authenticated',freshness:'recorded_only_revalidate_at_execution',qualification:'not_evaluated'});
  expect(JSON.stringify(report)).not.toContain('Existing note'); // response and fixture values are not navigation knowledge
});

it('retains counterevidence and unavailable landmarks without promoting completed commands to passing assertions',()=>{
  const failure=WorkflowKnowledgeSnapshot.capture(failed).report.workflows[0]!;
  expect(failure.receipt?.outcome).toBe('assertion_failed');
  expect(failure.steps.find(s=>s.stepId==='read_dom')?.observation).toMatchObject({result:'completed',browserCommandObserved:true});
  expect(failure.assertionCoverage.find(a=>a.assertionId==='a.browser')?.result).toBe('fail');
  const absent=WorkflowKnowledgeSnapshot.capture(missing).report.workflows[0]!;
  expect(absent.steps.find(s=>s.stepId==='refresh')?.observation?.browserCommandObserved).toBe(false);
  expect(absent.gaps).toContainEqual({stepId:'refresh',reason:'landmark_unobserved'});
  expect(absent.transitions.some(t=>!t.bothCommandsCompleted)).toBe(true);
});

it('looks up routes, tags, role/landmark text and exact workflow identities with bounded snapshot-bound pages',()=>{
  const snapshot=WorkflowKnowledgeSnapshot.capture(passed),entry=snapshot.report.workflows[0]!;
  for(const query of [{text:'Refresh'},{text:'notes'},{route:'/ui'},{tag:'notes.ui'},{workflowId:'notes.browser'},{caseId:entry.caseRef.id},{surface:'hybrid' as const}])expect(snapshot.search(query).total).toBe(1);
  expect(snapshot.search({route:'/not-a-route'}).total).toBe(0);expect(snapshot.search({surface:'api'}).total).toBe(0);
  const multiple=WorkflowKnowledgeSnapshot.capture(api),first=multiple.search({limit:1});expect(first.total).toBeGreaterThan(1);expect(first.cursor).not.toBeNull();
  const next=multiple.search({limit:1,cursor:first.cursor!});expect(next.results[0]!.selectionCellId).not.toBe(first.results[0]!.selectionCellId);
  expect(()=>multiple.search({limit:1,cursor:first.cursor!,text:'changed'})).toThrow(/foreign lookup/);
  expect(()=>snapshot.search({cursor:first.cursor!})).toThrow(/foreign lookup/);
  expect(()=>multiple.search({limit:0})).toThrow();expect(()=>multiple.search({limit:101})).toThrow();
  expect(WorkflowKnowledgePage.parse(first).authority).toBe('none');
});

it('keeps captured knowledge immutable and flags changed declared contracts and target identities as stale',()=>{
  const snapshot=WorkflowKnowledgeSnapshot.capture(passed),entry=snapshot.report.workflows[0]!;
  snapshot.report.workflows.length=0;snapshot.get(entry.selectionCellId).steps.length=0;
  expect(snapshot.get(entry.selectionCellId).steps).toHaveLength(4);
  const current={caseRef:entry.caseRef,expectedTarget:entry.expectedTarget};expect(snapshot.assess(entry.selectionCellId,current)).toMatchObject({state:'declared_context_matches',landmarkValidation:'required_at_execution'});
  const changed=WorkflowKnowledgeSnapshot.capture(failed).report.workflows[0]!;
  expect(snapshot.assess(entry.selectionCellId,{...current,caseRef:changed.caseRef})).toMatchObject({caseMatches:false,state:'stale_for_declared_context'});
  const target=structuredClone(entry.expectedTarget);target.components[0]!.componentId+='-changed';
  expect(snapshot.assess(entry.selectionCellId,{...current,expectedTarget:target})).toMatchObject({targetMatches:false,state:'stale_for_declared_context'});
  expect(()=>snapshot.get('not-selected')).toThrow();
});

it('rejects foreign native reports, forged/corrupt evidence, malformed cursors and pages outside their bounds',()=>{
  expect(()=>WorkflowKnowledgeSnapshot.capture({records:passed.records} as VerifiedBundleSnapshot)).toThrow(/verified captured/);
  expect(()=>WorkflowKnowledgeSnapshot.capture(NativeObservationSnapshot.fromBytes(Buffer.from('<testsuite/>'),{format:'junit_xml',scope:localScope()}) as unknown as VerifiedBundleSnapshot)).toThrow();
  for(const cursor of ['?',Buffer.from(JSON.stringify({snapshot:'x',filter:'0'.repeat(64),offset:-1})).toString('base64url'),'a'.repeat(1025)])expect(()=>lookupOffset(cursor,'x','0'.repeat(64))).toThrow();
  const snapshot=WorkflowKnowledgeSnapshot.capture(passed),ref=snapshot.report.ref;
  expect(()=>snapshot.search({cursor:lookupCursor(refKey(ref),digestOfValue({}).hex,999)})).toThrow(/outside/);
  const file=join(goodPath,'documents.json'),before=readFileSync(file);try{writeFileSync(file,'{}');expect(()=>VerifiedBundleSnapshot.open(goodPath)).toThrow()}finally{writeFileSync(file,before)}
  const resealed=freeze({...snapshot.report,workflows:[]});expect(verifySelfDigest(resealed)).toBe(true);
  // There is deliberately no restore-from-map method: a self-digest cannot replace the verified execution source.
  expect('restore' in WorkflowKnowledgeSnapshot).toBe(false);expect(WORKFLOW_KNOWLEDGE_LIMITS.pageBytes).toBe(131072);
  expect(()=>Reflect.construct(WorkflowKnowledgeSnapshot,[snapshot.report])).toThrow(/capture verified/);
});

it('uses installed CLI contracts to emit map and filtered pages without needing live config or discovery',()=>{
  const full=runCli(['workflow-map','--bundle',goodPath]);expect(full.status,full.stderr).toBe(0);const report=WorkflowKnowledge.parse(JSON.parse(full.stdout));
  const query=runCli(['workflows','--bundle',badPath,'--text','Refresh','--route','/ui']);expect(query.status,query.stderr).toBe(0);
  expect(WorkflowKnowledgePage.parse(JSON.parse(query.stdout)).results[0]!.receipt?.outcome).toBe('assertion_failed');
  const detail=runCli(['workflow-map','--bundle',goodPath,'--cell',report.workflows[0]!.selectionCellId]);expect(detail.status,detail.stderr).toBe(0);expect(JSON.parse(detail.stdout).steps).toHaveLength(4);
  const prose=runCli(['workflows','--bundle',goodPath],false);expect(prose.status).toBe(0);expect(prose.stdout).toContain('revalidate landmarks');
  expect(runCli(['workflows','--bundle',goodPath,'--limit','101']).status).toBe(2);
});

it('constrains HTTP map lookup to named owned runs and strict query fields',async()=>{
  const response=await fetch(new URL('/api/workflows?run=observed&text=Refresh',server.url));expect(response.status).toBe(200);
  const page=WorkflowKnowledgePage.parse(await response.json());expect(page.results).toHaveLength(1);expect(page.evidence.manifestDigest).toEqual(passed.manifestDigest);
  for(const query of ['run=latest','run=../escape','run=observed&actor=override','run=observed&run=failed','run=observed&limit=101'])expect((await fetch(new URL('/api/workflows?'+query,server.url))).status).toBe(400);
  const detail=await fetch(new URL('/api/workflow-map?'+new URLSearchParams({run:'observed',cell:page.results[0]!.selectionCellId}),server.url));
  expect((await detail.json() as {entry:{caseRef:unknown}}).entry.caseRef).toEqual(page.results[0]!.caseRef);
});

it.each([1440,375])('finds cited browser workflows, inspects declarations and counterevidence, and reloads links at %ipx',async width=>{
  const page=await browser.newPage({viewport:{width,height:950}}),errors:string[]=[],writes:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')writes.push(r.url())});await page.route('https://**/*',r=>r.abort());
  try{
    await page.goto(new URL('?map-run=observed',server.url).href);await page.getByRole('heading',{name:'Navigation and landmarks',exact:true}).waitFor();
    await page.getByText('Declared landmark: role · button · Refresh',{exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Find a workflow'}).fill('Refresh');expect(await page.getByRole('complementary',{name:'Recorded workflow detail'}).count()).toBe(0);
    await page.getByRole('button',{name:'Find workflows',exact:true}).click();await page.getByText('Declared route: /ui',{exact:true}).waitFor();
    await page.locator('.nav-tools > summary').focus();await page.keyboard.press('j');expect(await page.locator('[data-map-cell][aria-pressed=true]').count()).toBe(1);
    const link=await page.getByRole('link',{name:'Link to this workflow',exact:true}).getAttribute('href');expect(link).toContain('map-cell=');
    await page.goto(new URL(link!,server.url).href);await page.getByText('Declared landmark: testId · notes',{exact:true}).waitFor();
    await page.getByRole('combobox',{name:'Workflow source run'}).selectOption('failed');await page.getByText('Recorded outcome: assertion_failed',{exact:true}).waitFor();
    await page.getByText('a.browser · assertion · fail · notes.ui',{exact:true}).waitFor();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:join(root,'workflow-map-'+width+'.png'),fullPage:true});
    await page.getByText('Declared setup and cleanup',{exact:true}).click();await page.getByText('Recorded target and citations',{exact:true}).click();
    expect(errors).toEqual([]);expect(writes).toEqual([]);
  }finally{await page.close()}
},30000);

it('clears previous map facts after a network outage or corrupted bundle and supports retry',async()=>{
  const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());
  try{await page.goto(new URL('?map-run=observed',server.url).href);await page.getByRole('complementary',{name:'Recorded workflow detail'}).waitFor();
    await page.route('**/api/workflows?**',r=>r.abort());await page.getByRole('button',{name:'Refresh map',exact:true}).click();await page.getByRole('alert').waitFor();expect(await page.getByRole('complementary',{name:'Recorded workflow detail'}).count()).toBe(0);
    await page.unroute('**/api/workflows?**');await page.getByRole('button',{name:'Retry workflow lookup',exact:true}).click();await page.getByRole('complementary',{name:'Recorded workflow detail'}).waitFor();
    const source=join(root,'.tracegrove/runs/observed/bundle/documents.json'),before=readFileSync(source);
    try{writeFileSync(source,'{}');await page.getByRole('button',{name:'Refresh map',exact:true}).click();await page.getByRole('alert').waitFor();expect(await page.getByRole('complementary',{name:'Recorded workflow detail'}).count()).toBe(0)}finally{writeFileSync(source,before)}
  }finally{await page.close()}
});

it('ignores a late map response after navigation leaves the view',async()=>{
  const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());
  let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>entered=r);
  let requests=0;await page.route('**/api/workflows?**',async route=>{if(++requests===1){entered();await gate}await route.continue()});
  try{await page.goto(new URL('?map-run=observed',server.url).href);await seen;
    await page.getByRole('button',{name:'Run',exact:true}).click();
    await page.locator('.nav-tools > summary').click();await page.getByRole('button',{name:'Map',exact:true}).click();await page.getByRole('complementary',{name:'Recorded workflow detail'}).waitFor();
    await page.getByRole('combobox',{name:'Workflow source run'}).selectOption('failed');await page.getByText('Recorded outcome: assertion_failed',{exact:true}).waitFor();
    const old=page.waitForResponse(response=>response.url().includes('/api/workflows?')&&response.url().includes('run=observed'));release();await (await old).finished();
    expect(await page.getByText('Recorded outcome: assertion_failed',{exact:true}).count()).toBe(1);
  }finally{release();await page.close()}
});
