/** The single page served by `tracegrove ui`. No external assets; all text goes through textContent. */
export const UI_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tracegrove</title>
<style>
:root{--bg:#fbfaf7;--panel:#fff;--ink:#1d1f1c;--muted:#6b6f68;--line:#e4e2dc;--accent:#2f6b4f;--pass:#2f7d4f;--fail:#b3412e;--warn:#9a6a12;--code:#f2f0ea}
@media (prefers-color-scheme:dark){:root{--bg:#141614;--panel:#1c1f1c;--ink:#e8e8e3;--muted:#9a9d95;--line:#2c302c;--accent:#7fc3a0;--pass:#6fcf97;--fail:#f08a76;--warn:#e2b45c;--code:#232723}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
header{display:flex;gap:16px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap}
header b{font-size:16px}header .dir{color:var(--muted);font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}
nav{display:flex;gap:4px;padding:0 20px;border-bottom:1px solid var(--line);overflow-x:auto}
nav button{border:0;background:none;color:var(--muted);padding:10px 12px;cursor:pointer;font:inherit;border-bottom:2px solid transparent}
nav button.on{color:var(--ink);border-bottom-color:var(--accent)}
main{padding:20px;max-width:1100px;margin:0 auto}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px;margin-bottom:16px}
h2{font-size:15px;margin:0 0 10px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500;font-size:12px}code,pre{font-family:ui-monospace,monospace;font-size:12px;background:var(--code);border-radius:4px}
code{padding:1px 4px}pre{padding:10px;overflow:auto;white-space:pre-wrap}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;border:1px solid currentColor}
.passed,.pass{color:var(--pass)}.assertion_failed,.fail{color:var(--fail)}.blocked,.infrastructure_failed,.inconclusive,.warn{color:var(--warn)}
.muted{color:var(--muted)}button.act{background:var(--accent);color:var(--bg);border:0;border-radius:6px;padding:7px 12px;cursor:pointer;font:inherit}
button.ghost{background:none;border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit}
select,input{font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink);max-width:100%}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.stat b{display:block;font-size:22px}.scroll{overflow-x:auto}
</style></head><body>
<header><b>Tracegrove</b><span class="dir" id="dir"></span><span class="row" style="margin-left:auto"><span id="status" class="muted"></span></span></header>
<nav id="tabs"></nav><main id="main"></main>
<script>
const TOKEN='__TOKEN__';const START_BRANCH=__BRANCH__;
const TABS=['Overview','Discovery','Flows','Runs'];let tab=START_BRANCH?'Discovery':'Overview';let state=null;
function h(tag,attrs,...kids){const el=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(k==='on')for(const[e,f]of Object.entries(v))el.addEventListener(e,f);else if(v!==null&&v!==undefined)el.setAttribute(k,v)}for(const kid of kids.flat()){if(kid===null||kid===undefined)continue;el.append(kid instanceof Node?kid:document.createTextNode(String(kid)))}return el}
async function api(path,body){const r=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json','x-tracegrove-token':TOKEN},body:JSON.stringify(body)}:{});const j=await r.json();if(!r.ok)throw j;return j}
function errBox(e){return h('div',{class:'card'},h('h2',{class:'fail'},'Blocked'),...(e.reasons||[{code:'error',detail:e.error||String(e),action:''}]).map(r=>h('p',{},h('b',{},r.code),': ',r.detail,r.action?h('div',{class:'muted'},'Fix: '+r.action):null)))}
function pill(o){return h('span',{class:'pill '+o},o)}
function nav(){const n=document.getElementById('tabs');n.replaceChildren(...TABS.map(t=>h('button',{class:t===tab?'on':'',on:{click:()=>{tab=t;render()}}},t)))}
async function load(){state=await api('/api/overview');document.getElementById('dir').textContent=state.dir+(state.git.isRepo?'  ·  '+(state.git.current||''):'');render()}
function overview(){const s=state;const out=[];
 if(!s.hasConfig)out.push(h('div',{class:'card'},h('h2',{},'No tracegrove.config.yaml here yet'),h('p',{class:'muted'},'Init detects FastAPI, Django or Node and writes a config plus an example flow.'),h('button',{class:'act',on:{click:async()=>{try{await api('/api/init',{});await load()}catch(e){main(errBox(e))}}}},'Initialize')));
 if(s.compileError)out.push(errBox(s.compileError));
 const last=s.runs[0];
 out.push(h('div',{class:'card'},h('div',{class:'grid'},
  h('div',{class:'stat'},h('b',{},s.flows.length),h('span',{class:'muted'},'flows')),
  h('div',{class:'stat'},h('b',{},s.config?s.config.app.adapter:'–'),h('span',{class:'muted'},'adapter')),
  h('div',{class:'stat'},h('b',{},s.sourceFiles),h('span',{class:'muted'},'attested source files')),
  h('div',{class:'stat'},h('b',{class:last?last.outcome:''},last?last.outcome:'never run'),h('span',{class:'muted'},'last run'))),
  s.sourceDigest?h('p',{class:'muted'},'App source digest ',h('code',{},s.sourceDigest.slice(0,16))):null));
 if(s.config)out.push(h('div',{class:'card'},h('h2',{},'Config'),h('table',{},h('tbody',{},
  h('tr',{},h('th',{},'Project'),h('td',{},s.config.project)),
  h('tr',{},h('th',{},'App'),h('td',{},h('code',{},s.config.app.adapter),' ',s.config.app.entry||s.config.app.run||'')),
  h('tr',{},h('th',{},'Health'),h('td',{},h('code',{},s.config.app.health))),
  h('tr',{},h('th',{},'Personas'),h('td',{},Object.entries(s.config.personas).map(([k,v],i)=>h('span',{},i?', ':'',h('code',{},k),' → '+v.subject+(i===0?' (default)':''))))),
  h('tr',{},h('th',{},'Injected env'),h('td',{},Object.values(s.config.app.inject).map(v=>h('code',{},v)).flatMap((c,i)=>i?[' ',c]:[c])))))));
 if(s.hasConfig&&!s.compileError)out.push(h('div',{class:'card row'},h('input',{id:'grep',placeholder:'filter (optional)'}),h('button',{class:'act',on:{click:runNow}},'Run tests')));
 return out}
async function runNow(){const st=document.getElementById('status');st.textContent='running…';try{const g=document.getElementById('grep');const r=await api('/api/test',{grep:g?g.value:''});st.textContent='';await load();tab='Runs';render(r)}catch(e){st.textContent='';main(errBox(e))}}
function flowsTab(){if(!state.flows.length)return[h('div',{class:'card muted'},'No flows yet. Use Discovery to draft some.')];
 return state.flows.map(f=>h('div',{class:'card'},h('h2',{},f.caseId,' ',h('span',{class:'muted'},f.tags.map(t=>'#'+t).join(' '))),h('p',{},f.title),h('p',{class:'muted'},h('code',{},f.file),f.fixtures.length?'  given: '+f.fixtures.join(', '):''),
  h('div',{class:'scroll'},h('table',{},h('thead',{},h('tr',{},h('th',{},'Step'),h('th',{},'Request'),h('th',{},'As'),h('th',{},'Expect'))),h('tbody',{},f.steps.map(s=>h('tr',{},h('td',{},s.name),h('td',{},h('code',{},s.method+' '+s.path)),h('td',{},s.as),h('td',{},s.expectStatus??''))))))))}
function runsTab(fresh){const out=[];if(fresh)out.push(runCard(fresh));
 out.push(h('div',{class:'card'},h('h2',{},'History'),state.runs.length?h('div',{class:'scroll'},h('table',{},h('tbody',{},state.runs.map(r=>h('tr',{},h('td',{},pill(r.outcome)),h('td',{},h('code',{},r.name)),h('td',{},r.totals.passed+' passed, '+r.totals.failed+' failed'+(r.totals.other?', '+r.totals.other+' other':'')),h('td',{},h('button',{class:'ghost',on:{click:async()=>{render(await api('/api/runs/'+encodeURIComponent(r.name)))}}},'Open'))))))):h('p',{class:'muted'},'No runs yet.')));return out}
function runCard(r){return h('div',{class:'card'},h('h2',{},'Run ',pill(r.outcome),' ',h('span',{class:'muted'},r.startedAt)),
 h('p',{class:'muted'},'Bundle verified: ',String(r.bundleVerified),'  ·  ',h('code',{},r.runDir)),
 ...(r.blockers||[]).map(b=>h('p',{class:'warn'},b.code+': '+b.detail)),
 ...r.cases.map(c=>h('div',{},h('p',{},pill(c.outcome),' ',h('b',{},c.caseId),' ',h('span',{class:'muted'},c.title)),c.failure?h('pre',{},'step "'+c.failure.step+'": '+c.failure.message+(c.failure.observed?'\\n'+c.failure.observed:'')):null,
  h('div',{class:'scroll'},h('table',{},h('tbody',{},c.steps.map(s=>h('tr',{},h('td',{},s.name),h('td',{},h('code',{},s.method+' '+s.path)),h('td',{class:s.result==='completed'?'pass':s.result==='failed'?'fail':'muted'},s.result),h('td',{},s.status??''),h('td',{class:'muted'},s.durationMs!=null?s.durationMs+' ms':'')))))))))}
let disc=null;
async function discoveryTab(){const g=state.git;const pick=h('select',{id:'branch'},h('option',{value:''},'working tree'),...g.branches.map(b=>h('option',{value:b},b)));
 const card=h('div',{class:'card'},h('h2',{},'Discovery'),h('p',{class:'muted'},'Scans FastAPI, Django and Express-style routes and matches them to flows. Pick a branch to see routes in files it changed against ',h('code',{},g.base||'the default branch'),' first.'),
  h('div',{class:'row'},g.isRepo?pick:h('span',{class:'muted'},'Not a git repo: scanning the working tree.'),h('button',{class:'act',on:{click:()=>scan(pick.value)}},'Scan')));
 const box=h('div',{id:'disc'});setTimeout(()=>{if(START_BRANCH&&!disc){pick.value=START_BRANCH;scan(START_BRANCH)}else if(disc)showDisc()},0);return[card,box]}
async function scan(branch){const box=document.getElementById('disc');box.replaceChildren(h('div',{class:'card muted'},'scanning…'));try{disc=await api('/api/discover?branch='+encodeURIComponent(branch||''));showDisc()}catch(e){box.replaceChildren(errBox(e))}}
function showDisc(){const d=disc;const box=document.getElementById('disc');if(!box)return;
 box.replaceChildren(h('div',{class:'card'},h('h2',{},d.routes.length+' routes, ',h('span',{class:d.uncovered?'warn':'pass'},d.uncovered+' without a flow')),h('p',{class:'muted'},d.source+' · '+d.files+' source files'+(d.branch&&d.base?' · '+d.changedFiles.length+' files changed vs '+d.base:'')),
  d.routes.length?h('div',{class:'scroll'},h('table',{},h('thead',{},h('tr',{},h('th',{},'Route'),h('th',{},'Where'),h('th',{},'Covered by'),h('th',{}))),h('tbody',{},d.routes.map(r=>h('tr',{},h('td',{},h('code',{},r.method+' '+r.path),r.changed?h('span',{class:'pill warn',style:'margin-left:6px'},'changed'):null),h('td',{class:'muted'},r.file+':'+r.line),h('td',{},r.coveredBy.length?r.coveredBy.join(', '):h('span',{class:'warn'},'none')),h('td',{},r.coveredBy.length?null:h('button',{class:'ghost',on:{click:()=>draft(r)}},'Draft flow'))))))):h('p',{class:'muted'},'No routes found. Discovery reads decorators (@app.get), Django path() and app/router.get(…).')),h('div',{id:'draft'}))}
async function draft(r){const out=document.getElementById('draft');try{const d=await api('/api/draft',{method:r.method,path:r.path});out.replaceChildren(h('div',{class:'card'},h('h2',{},'Draft: ',h('code',{},'discovered/'+d.file)),h('pre',{},d.yaml),h('button',{class:'act',on:{click:async()=>{try{const s=await api('/api/draft',{method:r.method,path:r.path,save:true});out.replaceChildren(h('div',{class:'card pass'},'Saved '+s.saved+'. Fill the TODOs, then run tests.'));await load()}catch(e){out.replaceChildren(errBox(e))}}}},'Save to tracegrove/discovered/')));out.scrollIntoView({behavior:'smooth'})}catch(e){out.replaceChildren(errBox(e))}}
function main(...nodes){document.getElementById('main').replaceChildren(...nodes.flat())}
async function render(fresh){nav();if(!state)return;if(tab==='Overview')main(overview());else if(tab==='Flows')main(flowsTab());else if(tab==='Runs')main(runsTab(fresh&&fresh.cases?fresh:null));else main(await discoveryTab())}
load().catch(e=>main(errBox(e)));
</script></body></html>`;
