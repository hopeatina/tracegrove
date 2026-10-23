/** Grove comparison reuses the page's DOM helpers and existing design tokens. */
export const COMPARISON_CSS = String.raw`
.compare-controls label{display:flex;flex:1 1 260px;min-width:0;flex-direction:column;gap:6px}
.compare-controls select{width:100%;min-width:0}
.comparison-rows{list-style:none;padding:0;margin:20px 0}
.comparison-row{padding:20px 0;border-top:1px solid var(--line);overflow-wrap:anywhere}
.comparison-points{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:16px}
.comparison-point{min-width:0;overflow-wrap:anywhere}
.comparison-point p{margin:8px 0}.comparison-point .btn{margin-top:8px}
.comparison-summary{margin-top:20px;overflow-wrap:anywhere}
.comparison-summary details{margin-top:8px}.comparison-summary ul{padding-left:20px}
@media(max-width:720px){.comparison-points{gap:12px}}
`;
export const COMPARISON_JS = String.raw`
ui.comparison={baseline:'',candidate:'',report:null,error:null,loading:false,serial:0,auto:false,capturedAt:null};
const comparisonQuery=new URLSearchParams(location.search);
const initialBaseline=comparisonQuery.get('compare-baseline'),initialCandidate=comparisonQuery.get('compare-candidate');
if(initialBaseline&&initialCandidate&&initialBaseline.length<=200&&initialCandidate.length<=200){ui.comparison.baseline=initialBaseline;ui.comparison.candidate=initialCandidate;ui.comparison.auto=true;tab='Compare'}
function syncComparisonLocation(){const url=new URL(location.href),c=ui.comparison;
 if(tab==='Compare'&&c.baseline&&c.candidate){url.searchParams.set('compare-baseline',c.baseline);url.searchParams.set('compare-candidate',c.candidate)}
 else{url.searchParams.delete('compare-baseline');url.searchParams.delete('compare-candidate')}
 if(url.href!==location.href)history.replaceState(null,'',url.href);
}

const COMPARISON_CHANGES={unchanged:'Same recorded outcome',passed_to_failed:'Passed → assertion failed',failed_to_passed:'Assertion failed → passed',outcome_changed:'Outcome changed',selection_added:'Selection added',selection_removed:'Selection removed',ambiguous_selection:'Ambiguous selection',missing_receipt:'Receipt unavailable',contract_changed:'Contract changed',context_changed:'Execution context changed'};
const COMPARISON_OUTCOMES={passed:'Passed',assertion_failed:'Assertion failed',blocked:'Blocked',infrastructure_failed:'Infrastructure failed',inconclusive:'Inconclusive',cancelled:'Cancelled'};
function comparisonPoints(label,points,name,caseId){return h('section',{class:'comparison-point','aria-label':label+' '+caseId},h('div',{class:'label'},label),
 points.length?points.map(point=>h('div',{},h('p',{},h('span',{class:'pill '+(point.outcome==='passed'?'p-pass':point.outcome==='assertion_failed'?'p-fail':'p-warn')},COMPARISON_OUTCOMES[point.outcome]||'Receipt unavailable')),
  disclosureFor(label+':'+point.selectionCellId,'Target and receipt details',h('p',{class:'mono small muted'},point.selectionCellId),
  point.steps.filter(step=>step.result==='failed'||step.result==='cancelled').slice(0,1).map(step=>h('p',{class:'small'},step.stepId+(step.reasonCode?' · '+step.reasonCode:''))),
  h('p',{class:'small muted'},'Declared target '+point.expectedTargetDigest.hex.slice(0,12)),
  h('p',{class:'small muted'},point.observedTargetDigest?'Recorded observed target '+point.observedTargetDigest.hex.slice(0,12):'Observed target unavailable'),
  point.repositoryCommits.map(repo=>h('p',{class:'mono small'},repo.repositoryRole+' · '+repo.resolvedCommit.slice(0,12))),
  point.receiptRef?h('p',{class:'mono small muted',title:point.receiptRef.digest.hex},'Receipt '+point.receiptRef.digest.hex.slice(0,12)):null))):
 h('p',{class:'muted'},'Not selected'),points.length?h('button',{class:'btn ghost sm',on:{click:()=>inspectComparedRun(name,caseId)}},'Inspect '+label.toLowerCase()):null)}
function comparisonCoverage(label,bundle){return h('section',{'aria-label':label+' coverage'},h('h2',{},label+' coverage'),
 h('p',{class:'small muted'},bundle.coverage.selected+' selected · '+bundle.coverage.required+' required · '+bundle.coverage.passed+' passed · '+bundle.excludedCells.length+' excluded'),
 bundle.excludedCells.length?h('details',{},h('summary',{},'Excluded cells ('+bundle.excludedCells.length+')'),h('ul',{},bundle.excludedCells.map(cell=>h('li',{},h('span',{class:'mono small'},cell.cellKey),': '+cell.reason)))):null)}
function comparisonRow(row,c){return h('li',{class:'comparison-row'},
 h('div',{class:'rulehead'},h('h2',{class:'mono'},row.dimensions.caseId),h('span',{class:'pill '+(row.change==='passed_to_failed'?'p-fail':row.change==='unchanged'?'p-none':'p-warn')},COMPARISON_CHANGES[row.change])),
 h('div',{class:'comparison-points'},comparisonPoints('Baseline',row.baseline,c.baseline,row.dimensions.caseId),comparisonPoints('Candidate',row.candidate,c.candidate,row.dimensions.caseId)))}
function comparisonContent(){const c=ui.comparison;
 if(c.loading)return[h('p',{role:'status','aria-live':'polite'},'Checking both retained evidence bundles…')];
 if(c.error)return[h('div',{role:'alert'},h('h2',{},'Comparison unavailable'),h('p',{},c.error),h('p',{class:'small muted'},'Select retained runs and compare again. No result from the previous comparison is shown.'))];
 if(!c.report)return[h('p',{class:'muted',role:'status'},'Choose a baseline and candidate, then compare their recorded evidence.')];
 const r=c.report,changed=r.rows.filter(row=>row.change!=='unchanged'),same=r.rows.filter(row=>row.change==='unchanged');
 return[h('div',{class:'comparison-summary'},h('p',{role:'status','aria-live':'polite'},changed.length+' changed · '+same.length+' unchanged'),
  h('p',{class:'small muted'},r.executionIdentityRelation==='same_campaign'?'Same recorded campaign. This is not another independent attempt.':r.executionIdentityRelation==='distinct_recorded_executions'?'Distinct recorded execution IDs. Independence is not established.':'Execution identity relation: '+r.executionIdentityRelation),
  h('p',{class:'small muted'},'Captured '+new Date(c.capturedAt).toLocaleTimeString()+'. Compare again to re-check retained evidence. Issuer unverified; qualification not evaluated.'),
  r.selectionPolicyChanged?h('p',{class:'c-warn'},'Selection policy changed. Compare the complete coverage on both sides.'):null),
  h('ol',{class:'comparison-rows','aria-label':'Recorded selection differences'},changed.map(row=>comparisonRow(row,c))),
  same.length?disclosure('Unchanged scenarios ('+same.length+')',h('ol',{class:'comparison-rows'},same.map(row=>comparisonRow(row,c)))):null,
  h('div',{class:'comparison-points comparison-summary'},comparisonCoverage('Baseline',r.baseline),comparisonCoverage('Candidate',r.candidate))];
}
function paintComparison(){if(tab!=='Compare')return;const result=document.getElementById('comparison-result');if(result){result.setAttribute('aria-busy',ui.comparison.loading?'true':'false');result.replaceChildren(...comparisonContent())}
 const submit=document.getElementById('compare-submit');if(submit){submit.disabled=ui.comparison.loading||!ui.comparison.baseline||!ui.comparison.candidate;submit.textContent=ui.comparison.loading?'Comparing…':'Compare runs'}
}
function invalidateComparison(){const c=ui.comparison;c.serial++;c.report=null;c.error=null;c.loading=false;c.capturedAt=null;syncComparisonLocation();paintComparison()}
async function fetchComparison(){const c=ui.comparison;if(!c.baseline||!c.candidate)return;const serial=++c.serial;
 const pair={baseline:c.baseline,candidate:c.candidate};c.loading=true;c.report=null;c.error=null;syncComparisonLocation();paintComparison();
 try{const report=await api('/api/compare?'+new URLSearchParams(pair));if(serial!==c.serial)return;c.report=report;c.capturedAt=new Date().toISOString()}
 catch(error){if(serial!==c.serial)return;c.error=error.error||'Check the local connection and try again.'}
 finally{if(serial===c.serial){c.loading=false;paintComparison()}}
}
async function inspectComparedRun(name,caseId){try{const run=await api('/api/runs/'+encodeURIComponent(name));ui.runName=name;ui.run=run;ui.sel=caseId;
 const steps=((run.cases||[]).find(c=>c.caseId===caseId)||{steps:[]}).steps.filter(step=>step.declared!==false);
 ui.step=Math.max(0,steps.findIndex(step=>step.result==='failed'||step.result==='cancelled'));openTab('Run');
 }catch(error){ui.comparison.report=null;ui.comparison.error=error.error||'This retained run is unavailable.';paintComparison()}}
function comparisonTab(){const c=ui.comparison;
 if(!c.baseline&&!c.candidate&&state.runs.length>=2){c.candidate=state.runs[0].name;c.baseline=state.runs[1].name}
 if(state.runs.length<2&&!(c.baseline&&c.candidate))return[emptyState('See what changed between runs.','Save one more run to compare results side by side. Your first run is already here.',()=>openTab('Run'),'Go to Run')];
 const select=side=>{const selected=c[side],names=state.runs.map(run=>run.name);return h('select',{id:'compare-'+side,'aria-label':side==='baseline'?'Baseline run':'Candidate run',on:{change:event=>{c[side]=event.target.value;invalidateComparison()}}},
  !names.includes(selected)?h('option',{value:selected,selected:true},selected):null,
  state.runs.map(run=>h('option',{value:run.name,selected:run.name===selected},ago(run.startedAt)+' · '+(run.bundleVerified===false?'evidence unavailable':COMPARISON_OUTCOMES[run.outcome]||run.outcome)+' · '+run.name)))};
 const controls=h('form',{class:'row compare-controls',style:'margin-top:20px',on:{submit:event=>{event.preventDefault();fetchComparison()}}},
  h('label',{},h('span',{class:'label'},'Baseline'),select('baseline')),h('label',{},h('span',{class:'label'},'Candidate'),select('candidate')),
  h('button',{type:'button',class:'btn ghost',on:{click:()=>{const old=c.baseline;c.baseline=c.candidate;c.candidate=old;document.getElementById('compare-baseline').value=c.baseline;document.getElementById('compare-candidate').value=c.candidate;invalidateComparison()}}},'Swap runs'),
  h('button',{type:'submit',id:'compare-submit',class:'btn',disabled:c.loading},c.loading?'Comparing…':'Compare runs'));
 if(c.auto){c.auto=false;queueMicrotask(()=>{if(tab==='Compare')fetchComparison()})}
 return[h('h1',{},'Compare two runs'),h('p',{class:'muted'},'See which checks changed and inspect the saved evidence on each side.'),controls,
  h('div',{id:'comparison-result','aria-busy':c.loading?'true':'false'},...comparisonContent())];
}
`;
