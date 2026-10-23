/** Grove's existing DOM helpers, flat evidence rows, semantic controls and design tokens. */
export const BENCHMARK_CSS = String.raw`
.benchmark-controls{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:20px 0}
.benchmark-controls label{display:flex;flex:1 1 220px;min-width:0;flex-direction:column;gap:6px}
.benchmark-controls select{width:100%;min-width:0}
.benchmark-group{border-top:1px solid var(--line);padding:20px 0;overflow-wrap:anywhere}
.benchmark-cohorts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:12px}
.benchmark-cohorts>section{min-width:0}.benchmark-cohorts p{margin:8px 0}
.benchmark-timings{padding-left:18px}.benchmark-timings li{margin:8px 0;overflow-wrap:anywhere}
.benchmark-inventory{padding-left:20px}.benchmark-inventory li{margin:8px 0;overflow-wrap:anywhere}
@media(max-width:720px){.benchmark-cohorts{grid-template-columns:minmax(0,1fr);gap:16px}}
`;

export const BENCHMARK_JS = String.raw`
ui.benchmark={axis:'runner',report:null,error:null,loading:false,serial:0,auto:true,page:0,capturedAt:null};
const benchmarkQuery=new URLSearchParams(location.search);if(['runner','model'].includes(benchmarkQuery.get('benchmark-axis'))){ui.benchmark.axis=benchmarkQuery.get('benchmark-axis');tab='Benchmark'}
const BENCHMARK_FINDINGS={inventory_incomplete:'Some admissions have incomplete or unavailable evidence.',no_receipts:'No verified terminal receipts are retained.',unknown_model:'Observed model identity or recorded inference is missing.',target_unobserved:'An observed matching runner is missing.',no_matching_cohorts:'No condition group contains multiple cohorts.',conditions_unmatched:'Some recorded conditions have no matching cohort.',pricing_incomplete:'Some charges are unpriced, unreconciled or unknown.',temperature_unobserved:'Warm or cold observations are missing; unknown temperature is not inferred.',timing_coverage_unmatched:'Cohorts have different timing coverage or no numeric uncensored samples.',reservation_conflict:'Shared reservation IDs contain conflicting amounts.',evidence_limit_exceeded:'Evidence exceeds the capture bound; no subset is compared.',report_limit_exceeded:'Evidence exceeds the report bound; no subset is compared.'};
const BENCHMARK_CHECKPOINT_STATES={ledger_snapshot_unavailable:'The project execution checkpoint is missing or cannot be read. Refresh when it is available.',ledger_snapshot_changed:'The ledger changed during inspection. Refresh to capture one stable checkpoint.',ledger_snapshot_invalid:'Ledger integrity could not be verified. Inspect the saved ledger before relying on this report.',inventory_limit_exceeded:'This checkpoint exceeds the supported admission bound. No subset was selected.',inspection_failed:'The checkpoint could not be inspected. Refresh after its source is available.'};
function invalidateBenchmark(){const b=ui.benchmark;b.serial++;b.report=null;b.error=null;b.loading=false;b.capturedAt=null;b.page=0}
function syncBenchmarkLocation(){const url=new URL(location.href);if(tab==='Benchmark')url.searchParams.set('benchmark-axis',ui.benchmark.axis);else url.searchParams.delete('benchmark-axis');if(url.href!==location.href)history.replaceState(null,'',url.href)}
function paintBenchmark(){if(tab!=='Benchmark')return;const b=ui.benchmark,result=document.getElementById('benchmark-result');if(result){result.setAttribute('aria-busy',String(b.loading));result.replaceChildren(...benchmarkContent().filter(Boolean))}
 const refresh=document.getElementById('benchmark-refresh');if(refresh){refresh.disabled=b.loading;refresh.textContent=b.loading?'Checking evidence…':'Refresh evidence'}const download=document.getElementById('benchmark-download');if(download)download.disabled=b.loading||!b.report}
async function loadBenchmark(){invalidateBenchmark();const b=ui.benchmark,serial=b.serial,axis=b.axis;b.loading=true;syncBenchmarkLocation();paintBenchmark();
 try{const report=await api('/api/benchmark?'+new URLSearchParams({axis}));if(serial!==b.serial||tab!=='Benchmark')return;
 if(report.schemaVersion!=='tracegrove.benchmark/v1'||report.axis!==axis||report.operation!=='read_only')throw{};
 b.report=report;b.capturedAt=new Date().toISOString();b.loading=false;paintBenchmark()
 }catch(error){if(serial!==b.serial||tab!=='Benchmark')return;b.report=null;b.loading=false;b.error='The project checkpoint could not be read. Check the connection and retry.';paintBenchmark()}}
function downloadBenchmark(){const report=ui.benchmark.report;if(!report||ui.benchmark.loading)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}));const link=h('a',{href:url,download:'tracegrove-benchmark-'+report.axis+'.json'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function benchmarkCents(value){return value===null?'Unknown':value+' cents'}
function benchmarkCohort(c,axis,key){return h('section',{'aria-label':axis==='runner'?'Runner '+c.runnerRef.id:'Observed model '+(c.observedModel||'unknown')},
 h('h3',{class:'mono'},axis==='runner'?c.runnerRef.id+'@'+c.runnerRef.revision:c.observedModel||'Observed model unavailable'),
 axis==='model'?h('p',{class:'small muted'},'Requested model: '+(c.requestedModel||'unknown')):null,
 h('p',{},c.receipts.length+' receipts · '+c.outcomes.map(o=>(COMPARISON_OUTCOMES[o.outcome]||o.outcome)+' '+o.count).join(' · ')),
 h('p',{class:'small'},'Runner time: '+c.usage.runnerSeconds.toFixed(3)+' s'),
 disclosureFor(key+':cost','Cost and billing details',h('p',{class:'small'},'Reconciled subtotal: '+benchmarkCents(c.pricing.reconciledSubtotalCents)+' · '+c.pricing.unreconciledReceipts+' unreconciled receipt(s)'),
 h('p',{class:'small muted'},'Estimated subtotal: '+benchmarkCents(c.pricing.estimatedSubtotalCents)+' · '+c.pricing.unpricedEstimates+' unpriced · '+c.pricing.unknownChargeCount+' unknown charges')),
 disclosureFor(key+':timings','Step timings',h('ul',{class:'benchmark-timings'},c.timings.slice(0,20).map(t=>h('li',{class:'small'},h('span',{class:'mono'},t.metric),h('div',{class:'muted'},t.boundary+' · '+t.clock+' · '+t.temperature+' · strata '+t.strataDigest.hex.slice(0,12)),
 h('div',{},'Median '+(t.medianMs===null?'unknown':t.medianMs+' ms')+' · n='+t.numericUncensored+' · censored '+t.censored+' · missing '+t.missing))))),
 c.timings.length>20?h('p',{class:'small muted'},(c.timings.length-20)+' additional timing strata in the JSON report.'):null,
 h('details',{},h('summary',{},'Receipt citations ('+c.receipts.length+')'),h('pre',{},JSON.stringify(c.receipts,null,2))))}
function benchmarkContent(){const b=ui.benchmark;if(b.loading)return[h('p',{role:'status','aria-live':'polite'},'Checking every admission at one project checkpoint…')];
 if(b.error)return[h('section',{role:'alert'},h('h2',{},'Benchmark evidence unavailable'),h('p',{},b.error),h('p',{class:'muted'},'Previous results have been cleared.'),h('button',{class:'btn ghost',on:{click:loadBenchmark}},'Retry benchmark evidence'))];
 if(!b.report)return[h('p',{role:'status'},'Refresh the project checkpoint to inspect recorded benchmark evidence.')];
 const r=b.report,rows=r.inventory.attempts,groups=r.groups.slice(b.page*10,b.page*10+10),available=['complete_inventory','partial_evidence','no_attempts'].includes(r.inventory.code);
 return[h('section',{'aria-label':'Benchmark evidence status'},h('h2',{},!available?'Run records unavailable':!rows.length?'No runs recorded yet':r.code==='descriptive_evidence'?'Recorded usage':'More runs needed for comparison'),
 h('p',{role:'status','aria-live':'polite'},available?rows.length+' runs · '+r.retainedReceipts+' retained receipts · '+r.unassignedReceipts+' unassigned':'Admission counts are unavailable until the checkpoint can be read.'),
 h('p',{class:'small muted'},'Checkpoint '+(r.inventory.checkpoint?r.inventory.checkpoint.sequence+' · '+r.inventory.checkpoint.digest.slice(0,12):'unavailable')+' · '+r.inventory.writerLock+' writer lock · captured '+new Date(b.capturedAt).toLocaleTimeString()),
 available&&rows.length?h('p',{class:'small'},'Recorded reservation budget: '+benchmarkCents(r.reservations.retainedCents)+' · '+(r.reservations.uniqueIds===null?'unknown reservation count':r.reservations.uniqueIds+' unique reservation(s)')):null,
 disclosure('How to read these numbers',h('p',{class:'muted small'},'Reservations are not actual charges. Missing prices remain unknown. These records do not establish controlled conditions or statistical significance.')),
 available&&rows.length&&r.findings.length?disclosure('What is missing for a fair comparison',h('ul',{class:'benchmark-inventory','aria-label':'Missing benchmark evidence'},r.findings.map(f=>h('li',{},BENCHMARK_FINDINGS[f]||f)))):null,
 !available?h('p',{},(BENCHMARK_CHECKPOINT_STATES[r.inventory.code]||'The checkpoint could not be inspected.')+' Inspection creates no execution state.'):!rows.length?h('p',{},'This readable checkpoint contains no execution admissions. Importing a native report does not create execution usage.'):null,
 available&&rows.length?h('details',{},h('summary',{},'All admissions ('+rows.length+')'),h('ul',{class:'benchmark-inventory'},rows.map(a=>h('li',{},h('span',{class:'mono small'},a.executionId||'Admission #'+a.admissionSequence),h('div',{class:'small'},a.status.replaceAll('_',' ')+' · '+(COMPARISON_OUTCOMES[a.outcome]||'No terminal outcome retained')))))):null),
 ...groups.map(g=>h('section',{class:'benchmark-group'},h('h2',{class:'mono'},g.conditions.caseRef.id),h('p',{class:'small muted'},g.conditions.personaRef.id+' · '+g.conditions.environmentRef.id+' · conditions '+g.conditionsDigest.hex.slice(0,12)),
 h('div',{class:'benchmark-cohorts'},g.cohorts.slice(0,4).map((c,i)=>benchmarkCohort(c,r.axis,g.conditionsDigest.hex+':'+i))),g.cohorts.length>4?h('p',{class:'small muted'},(g.cohorts.length-4)+' additional cohorts are retained in the JSON report.'):null)),
 r.groups.length>10?h('div',{class:'row','aria-label':'Benchmark condition pages'},h('button',{class:'btn ghost',disabled:b.page===0,on:{click:()=>{b.page--;paintBenchmark()}}},'Previous conditions'),h('span',{class:'small'},'Page '+(b.page+1)+' of '+Math.ceil(r.groups.length/10)),h('button',{class:'btn ghost',disabled:(b.page+1)*10>=r.groups.length,on:{click:()=>{b.page++;paintBenchmark()}}},'Next conditions')):null]}
function benchmarkTab(){const b=ui.benchmark;if(b.auto){b.auto=false;queueMicrotask(()=>{if(tab==='Benchmark')loadBenchmark()})}
 return[h('h1',{},'Timing and usage'),h('p',{class:'muted'},'Inspect the time and usage recorded by your runs. A comparison needs runs captured under matching conditions.'),
 h('div',{class:'benchmark-controls'},h('label',{},h('span',{class:'label'},'Comparison axis'),h('select',{id:'benchmark-axis','aria-label':'Comparison axis',on:{change:e=>{b.axis=e.target.value;loadBenchmark()}}},h('option',{value:'runner',selected:b.axis==='runner'},'Runner'),h('option',{value:'model',selected:b.axis==='model'},'Model'))),
 h('button',{class:'btn',id:'benchmark-refresh',disabled:b.loading,on:{click:loadBenchmark}},b.loading?'Checking evidence…':'Refresh evidence'),h('button',{class:'btn ghost',id:'benchmark-download',disabled:b.loading||!b.report,on:{click:downloadBenchmark}},'Download captured JSON')),
 h('div',{id:'benchmark-result','aria-busy':String(b.loading)},...benchmarkContent())]}
`;
