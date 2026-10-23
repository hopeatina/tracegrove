/** Grove workflow lookup shares the SDK's bound query pages; it does not infer successful navigation. */
export const WORKFLOW_MAP_JS=String.raw`
ui.map={run:'',text:'',page:null,entry:null,loading:false,error:null,serial:0,auto:true,cursor:null};
const mapQuery=new URLSearchParams(location.search);if(mapQuery.get('map-run')){ui.map.run=mapQuery.get('map-run');ui.map.initialCell=mapQuery.get('map-cell');ui.map.text=mapQuery.get('map-text')||'';tab='Map'}
function invalidateMap(){const m=ui.map;m.serial++;m.page=null;m.entry=null;m.loading=false;m.error=null}
function paintMap(){if(tab==='Map')render()}
function syncMapLocation(){const url=new URL(location.href),m=ui.map;
 if(tab==='Map'&&m.run){url.searchParams.set('map-run',m.run);if(m.entry)url.searchParams.set('map-cell',m.entry.selectionCellId);else url.searchParams.delete('map-cell');if(m.text)url.searchParams.set('map-text',m.text);else url.searchParams.delete('map-text')}
 else for(const key of ['map-run','map-cell','map-text'])url.searchParams.delete(key);
 if(url.href!==location.href)history.replaceState(null,'',url.href)}
async function loadMap(cursor=null,cell=null){invalidateMap();const m=ui.map;if(!m.run){paintMap();return}const serial=m.serial;m.loading=true;m.cursor=cursor;paintMap();
 try{const query=new URLSearchParams({run:m.run,limit:'20'});if(m.text)query.set('text',m.text);if(cursor)query.set('cursor',cursor);
 const page=await api('/api/workflows?'+query);if(serial!==m.serial)return;
 let entry=page.results.find(w=>w.selectionCellId===cell)||page.results[0]||null;
 if(cell&&!page.results.some(w=>w.selectionCellId===cell)){const detail=await api('/api/workflow-map?'+new URLSearchParams({run:m.run,cell}));if(serial!==m.serial)return;if(detail.snapshotRef.digest.hex!==page.snapshotRef.digest.hex)throw{};entry=detail.entry}
 m.page=page;m.entry=entry;m.loading=false;paintMap();
 }catch(e){if(serial===m.serial){m.loading=false;m.page=null;m.entry=null;m.error=e.error||'Recorded workflow knowledge could not be read. Retry when connected.';paintMap()}}}
function mapLink(entry){const url=new URL(location.href);url.searchParams.set('map-run',ui.map.run);url.searchParams.set('map-cell',entry.selectionCellId);return url.pathname+url.search}
function mapMove(d){const m=ui.map,rows=m.page?.results||[];if(!rows.length)return;const i=rows.findIndex(w=>w.selectionCellId===m.entry?.selectionCellId);m.entry=rows[Math.max(0,Math.min(rows.length-1,i+d))];paintMap();document.querySelector('[data-map-cell="'+CSS.escape(m.entry.selectionCellId)+'"]')?.focus()}
function mapDetail(w){if(!w)return h('p',{class:'muted'},'Choose a recorded workflow.');
 return h('aside',{class:'side','aria-label':'Recorded workflow detail',style:'overflow-wrap:anywhere'},h('h2',{},w.workflowId),h('p',{},w.purpose),h('a',{href:mapLink(w)},'Link to this workflow'),
 h('p',{class:'pill p-warn'},'Recorded only · revalidate at execution'),h('p',{class:'small'},'Recorded outcome: '+(w.receipt?.outcome||'receipt unavailable')),
 w.gaps.length?h('p',{class:'small'},'Gaps: '+w.gaps.map(g=>(g.stepId?g.stepId+': ':'')+g.reason).join(' · ')):null,
 h('h2',{},'Before this journey'),h('p',{class:'small'},'Persona '+w.prerequisites.personaRef.id),h('p',{class:'small'},'Roles: '+(w.prerequisites.roleScopes.join(', ')||'none declared')),
 h('details',{},h('summary',{},'Declared setup and cleanup'),h('pre',{},JSON.stringify(w.prerequisites,null,2))),
 h('h2',{},'Navigation and landmarks'),w.steps.map(s=>h('section',{style:'padding:12px 0;border-bottom:1px solid var(--line)'},h('div',{class:'mono small'},s.stepId+' · '+s.operation),
 s.declaredRoute?h('p',{class:'small'},'Declared route: '+s.declaredRoute):null,
 s.declaredLandmark?h('p',{class:'small'},'Declared landmark: '+s.declaredLandmark.by+' · '+(s.declaredLandmark.role?s.declaredLandmark.role+' · ':'')+s.declaredLandmark.name):null,
 h('p',{class:'small muted'},'Recorded command: '+(s.observation?.result||'not observed')+(s.observation?.observedRoute?' · observed route '+s.observation.observedRoute:'')),
 s.declaredLandmark?h('p',{class:'small muted'},s.observation?.browserCommandObserved?'Matching browser command was recorded; assertions are listed separately.':'Landmark has no matching browser observation.'):null)),
 h('h2',{},'Checks recorded'),w.assertionCoverage.map(a=>h('p',{class:'small'},a.assertionId+' · '+a.phase+' · '+(a.result||'not observed')+' · '+a.tags.join(', '))),
 h('details',{},h('summary',{},'Recorded target and citations'),h('pre',{},JSON.stringify({caseRef:w.caseRef,receipt:w.receipt,expectedTarget:w.expectedTarget,recordedTarget:w.recordedTarget,sourceRefs:w.declaredSourceRefs,transitions:w.transitions},null,2))),
 h('button',{class:'btn ghost',on:{click:()=>inspectComparedRun(ui.map.run,w.caseRef.id)}},'Inspect recorded run'))}
function workflowMapTab(){const m=ui.map;if(!state.runs.length&&!m.run)return[emptyState('Your journeys will take shape here.','Run a scenario to explore its recorded steps, routes and checks.',()=>openTab('Run'),'Go to Run')];if(m.auto){m.auto=false;if(!m.run&&state.runs.length)m.run=state.runs[0].name;const cell=m.initialCell;m.initialCell=null;if(m.run)queueMicrotask(()=>loadMap(null,cell))}
 const search=h('input',{'aria-label':'Find a workflow',maxlength:256,placeholder:'Route, landmark, role or workflow',value:m.text,style:'flex:1 1 280px',on:{input:e=>{m.text=e.target.value;const start=e.target.selectionStart;invalidateMap();paintMap();const input=document.querySelector('[aria-label="Find a workflow"]');input.focus();input.setSelectionRange(start,start)}}});
 return[h('section',{},taskHeading('Follow a recorded journey.','Explore the steps, routes and checks from a saved run. A recording describes that run; it does not prove today’s app still behaves the same way.'),
 h('div',{class:'row'},h('select',{'aria-label':'Workflow source run',style:'width:100%',on:{change:e=>{m.run=e.target.value;loadMap()}}},h('option',{value:'',selected:!m.run},'Choose a retained run'),m.run&&!state.runs.some(r=>r.name===m.run)?h('option',{value:m.run,selected:true},m.run+' · selected by link'):null,state.runs.map(r=>h('option',{value:r.name,selected:r.name===m.run},r.name+' · '+ago(r.startedAt))))),
 h('form',{class:'row',style:'margin-top:16px',on:{submit:e=>{e.preventDefault();loadMap()}}},search,h('button',{class:'btn',type:'submit',disabled:!m.run||m.loading},'Find workflows'),h('button',{class:'btn ghost',type:'button',disabled:!m.run||m.loading,on:{click:()=>loadMap()}},'Refresh map'))),
 h('section',{id:'map-results','aria-label':'Workflow lookup results'},m.loading?h('p',{role:'status'},'Checking recorded workflow evidence…'):null,
 m.error?h('div',{role:'alert'},h('p',{},m.error),h('button',{class:'btn ghost',on:{click:()=>loadMap()}},'Retry workflow lookup')):null,
 !state.runs.length?h('p',{},'No saved executions yet. Importing a native report does not create an execution map.'):null,
 m.page?[h('p',{class:'small muted'},m.page.total+' matching workflows · '+m.page.evidence.manifestDigest.hex.slice(0,12)+' recorded bundle'),
 h('p',{class:'small muted'},'Recorded campaign: '+m.page.evidence.campaignOutcome+' · '+m.page.evidence.coverage.required+' required · '+m.page.evidence.coverage.excluded+' excluded'),
 h('div',{class:'cols'},h('section',{class:'grow','aria-label':'Recorded workflows'},m.page.results.map(w=>h('button',{class:'node',style:'width:100%;overflow-wrap:anywhere','data-map-cell':w.selectionCellId,'aria-pressed':String(w.selectionCellId===m.entry?.selectionCellId),on:{click:()=>{m.entry=w;paintMap()}}},h('span',{class:'body'},h('span',{},w.workflowId),h('span',{class:'small muted'},w.caseRef.id+' · '+(w.receipt?.outcome||'receipt unavailable'))))),
 h('div',{class:'row',style:'margin-top:16px'},m.cursor?h('button',{class:'btn ghost sm',on:{click:()=>loadMap()}},'First page'):null,m.page.cursor?h('button',{class:'btn ghost sm',on:{click:()=>loadMap(m.page.cursor)}},'Next page'):null)),mapDetail(m.entry)),!m.page.results.length?emptyState('No journeys match that search.','Try a route, part of a scenario name, or clear the search to see every journey.',()=>{m.text='';loadMap()},'Show all journeys',null,'h2'):null]:null)]}
`;
