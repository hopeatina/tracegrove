/**
 * The single page served by `tracegrove ui`, in the Grove design: a bonsai of scenarios (trunk,
 * branches, step twigs), pruning as a reversible rename, and agent work shown as named phases.
 * No build step and no framework; every string reaches the DOM through textContent.
 */
import { SOURCE_CONTROLS_JS } from './uiSourceControls.ts';
export const UI_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>tracegrove</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--stone:#F4F4F1;--paper:#FFFFFF;--line:#E2E2DC;--line2:#CFCFC8;--sel:#E6E7E1;--ink:#1A1C1A;--ink2:#3E423D;--ink3:#5E625C;--muted:#6B6F68;
 --trunk:#3C4A3E;--twig:#A9B0A6;--moss:#2F5D3A;--moss-bg:#E9F0E8;--verm:#B8410E;--verm-bg:#FBE9E0;--verm-ink:#8A2E08;--ochre:#9A6A1F;--ochre-bg:#FBF1E4;--ochre-ink:#5B3A0A;
 --indigo:#4A5C94;--indigo-bg:#EAEDF6;--forest:#1F3524;--on-forest:#F4F4F1;--bar:#F0F0EB;--code:#F4F4F1;
 --sans:'Instrument Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
@media (prefers-color-scheme:dark){:root{--stone:#121412;--paper:#1A1D1A;--line:#2A2E2A;--line2:#3A3F3A;--sel:#262A26;--ink:#E8E9E4;--ink2:#C9CCC4;--ink3:#A3A79F;--muted:#8F938B;
 --trunk:#8FA38F;--twig:#55605A;--moss:#7FC39A;--moss-bg:#1D2E22;--verm:#F08A66;--verm-bg:#3A2219;--verm-ink:#F6B59C;--ochre:#E2B45C;--ochre-bg:#352A17;--ochre-ink:#EBCB8E;
 --indigo:#9AAEE8;--indigo-bg:#1F2538;--forest:#CFE3D3;--on-forest:#121412;--bar:#232723;--code:#141714}}
*{box-sizing:border-box}html,body{margin:0;background:var(--stone);color:var(--ink);font:15px/22px var(--sans)}
button{font:inherit;color:inherit;cursor:pointer}button:disabled{cursor:not-allowed;opacity:.5}
:focus-visible{outline:2px solid var(--moss);outline-offset:2px;border-radius:6px}
a{color:var(--moss)}code,pre,.mono{font-family:var(--mono)}
header{display:flex;flex-wrap:wrap;align-items:center;gap:12px 32px;min-height:64px;padding:12px 32px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:17px;letter-spacing:-.01em}
nav{display:flex;flex-wrap:wrap;gap:4px}
nav button{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border:0;border-radius:8px;background:none;color:var(--ink3)}
nav button[aria-current=page]{background:var(--sel);color:var(--ink);font-weight:500}
.ctx{margin-left:auto;font:13px/18px var(--mono);color:var(--ink3);overflow-wrap:anywhere}
.page{max-width:1376px;margin:0 auto;padding:28px 32px 48px}
.label{font:500 11px/16px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.rulehead{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}.rulehead .rule{flex:1;height:1px;background:var(--line);min-width:40px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:20px}
.recording{margin-top:20px}.recording video{display:block;width:100%;max-height:360px;aspect-ratio:16/9;object-fit:contain;margin:10px 0;background:var(--ink)}
.cols{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}.grow{flex:999 1 560px;min-width:0}.side{flex:1 1 340px;min-width:0;display:flex;flex-direction:column;gap:16px}
h1{font-size:28px;line-height:34px;font-weight:500;letter-spacing:-.015em;margin:0;max-width:30ch}h2{font-size:17px;line-height:24px;font-weight:600;margin:0}
.muted{color:var(--ink3)}.small{font-size:13px;line-height:18px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:8px;border:0;background:var(--forest);color:var(--on-forest);font-weight:500;white-space:nowrap}
.btn.ghost{background:var(--paper);color:var(--ink);border:1px solid var(--line2);font-weight:400}.btn.sm{min-height:36px;padding:0 12px;font-size:14px}
input,select,textarea{font:inherit;color:var(--ink);background:var(--paper);border:1px solid var(--line2);border-radius:8px;padding:0 12px;min-height:44px;max-width:100%}
textarea{padding:12px;resize:vertical;min-height:88px;width:100%}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.stats{display:flex;flex-wrap:wrap;gap:12px 40px;margin-top:20px}.stats b{font-size:22px;font-weight:500;margin-right:6px}
.pill{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:6px;font-size:12px;line-height:16px;font-weight:500}
.p-pass{background:var(--moss-bg);color:var(--moss)}.p-fail{background:var(--verm-bg);color:var(--verm-ink)}.p-warn{background:var(--ochre-bg);color:var(--ochre-ink)}.p-info{background:var(--indigo-bg);color:var(--indigo)}.p-none{background:var(--sel);color:var(--ink3)}
.state{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.c-pass{color:var(--moss)}.c-fail{color:var(--verm)}.c-warn{color:var(--ochre)}.c-none{color:var(--muted)}
.dot{width:12px;height:12px;border-radius:50%;flex:none}.dot.pass{background:var(--moss)}.dot.fail{background:var(--paper);border:3px solid var(--verm)}.dot.warn{background:var(--paper);border:3px solid var(--ochre)}
.dot.none{border:1.5px solid var(--ink3)}.dot.pruned{border:1.5px dashed var(--muted)}.dot.s{width:8px;height:8px;border-width:0}.dot.s.fail{background:var(--verm)}.dot.s.warn{background:var(--ochre)}.dot.s.none{background:var(--twig)}
.tree{border-left:1.5px solid var(--trunk);margin-left:10px}
.br{display:flex;align-items:stretch;padding:3px 0}.twig{width:22px;flex:none;display:flex;align-items:center}.twig i{display:block;width:100%;border-top:1.5px solid var(--trunk)}.twig.cut i{border-top-style:dashed;border-color:var(--twig)}
.node{flex:1;min-width:0;display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:10px;border:1px solid transparent;background:none;min-height:44px;text-align:left}
.node:hover{background:var(--paper)}.node[aria-expanded=true]{background:var(--paper);border-color:var(--line2)}
.node .body{display:flex;flex-direction:column;min-width:0;flex:1}.node .id{font:13px/18px var(--mono)}
.pips{display:flex;gap:3px;flex:none}.pips i{width:8px;height:14px;border-radius:2px;background:var(--twig)}.pips i.pass{background:var(--moss)}.pips i.fail{background:var(--verm)}.pips i.warn{background:var(--ochre)}
.time{font:12px/16px var(--mono);color:var(--ink3);width:56px;text-align:right;flex:none}
.twigs{border-left:1px solid var(--twig);margin:4px 0 8px 44px}.twigs .twig{width:18px}.twigs .twig i{border-top:1px solid var(--twig)}
.step{flex:1;min-width:0;display:grid;grid-template-columns:8px minmax(120px,1.1fr) minmax(120px,1fr) minmax(60px,.8fr) 60px 48px;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;border:0;background:none;min-height:40px;text-align:left}
.step:hover{background:var(--sel)}.step[aria-pressed=true]{background:var(--sel)}
.step .req{font:12px/16px var(--mono);color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar{height:10px;position:relative;background:var(--bar);border-radius:3px}.bar i{position:absolute;top:0;bottom:0;border-radius:3px;background:var(--trunk);min-width:3px}.bar i.fail{background:var(--verm)}
.ms,.res{font:12px/16px var(--mono);text-align:right}
.fix{display:flex;flex-direction:column;gap:4px;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--paper)}
.fix:hover,.fix[aria-pressed=true]{border-color:var(--twig)}
.obs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin:12px 0}.obs>div{min-width:0;overflow-wrap:anywhere;padding:10px 12px;border-radius:8px;background:var(--stone)}.obs .bad{background:var(--verm-bg)}.obs .good{background:var(--moss-bg)}
pre{font:12px/1.6 var(--mono);background:var(--code);border-radius:8px;padding:12px 14px;overflow-x:auto;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.think{display:inline-flex;gap:5px;align-items:center}.think i{width:7px;height:7px;border-radius:50%;background:var(--moss);animation:pulse 1.2s ease-in-out infinite}
.think i:nth-child(2){animation-delay:.18s}.think i:nth-child(3){animation-delay:.36s}
.growing .dot{animation:breathe 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.25;transform:scale(.75)}50%{opacity:1;transform:scale(1)}}@keyframes breathe{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 5px var(--moss-bg)}}
.fade{animation:fade .24s ease-out both}@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.think i,.growing .dot,.fade{animation:none}}
.phases{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}.phases li{display:flex;gap:10px;align-items:center}.phases .ok{color:var(--moss);width:12px}.phases .wait{color:var(--muted);width:12px}
.src{display:flex;flex-direction:column;gap:4px}.src button{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 12px;border-radius:8px;border:1px solid transparent;background:none;text-align:left;font:13px/18px var(--mono)}
.src button[aria-pressed=true]{background:var(--paper);border-color:var(--line2)}.src button:hover{background:var(--paper)}
.route{display:grid;grid-template-columns:8px minmax(160px,1.4fr) minmax(120px,1fr) auto;gap:12px;align-items:center;padding:8px 12px;border-radius:8px;min-height:44px}.route:hover{background:var(--paper)}
.grid{border-collapse:separate;border-spacing:0}.grid th,.grid td{padding:8px 10px;text-align:center;border-bottom:1px solid var(--line)}.grid th:first-child,.grid td:first-child{text-align:left;position:sticky;left:0;background:var(--stone)}
.cell{width:28px;height:28px;border-radius:8px;border:1px solid transparent;background:none;display:inline-flex;align-items:center;justify-content:center}.cell:hover{border-color:var(--twig);background:var(--paper)}
.scroll{overflow-x:auto}.seg{display:flex;flex-wrap:wrap;gap:8px}.seg button{flex:1 1 160px;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid var(--line2);background:var(--paper);display:flex;flex-direction:column;gap:2px}
.seg button[aria-pressed=true]{border-color:var(--moss);box-shadow:inset 0 0 0 1px var(--moss)}
table.kv{border-collapse:collapse;width:100%}table.kv th,table.kv td{text-align:left;padding:8px 0;border-bottom:1px solid var(--line);vertical-align:top}table.kv th{width:38%;padding-right:12px;font-weight:500;color:var(--ink3)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--forest);color:var(--on-forest);padding:10px 16px;border-radius:10px;font-size:14px;z-index:9}
@media (max-width:720px){header{padding:12px 16px}.page{padding:20px 16px 40px}.ctx{margin-left:0;width:100%}h1{font-size:23px;line-height:30px}
 .step{grid-template-columns:8px 1fr 48px;}.step .req,.step .bar,.step .ms{display:none}.route{grid-template-columns:8px 1fr auto}.route .where{display:none}.obs{grid-template-columns:minmax(0,1fr)}}
</style></head><body>
<header><span class="brand"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" style="color:var(--moss)"><path d="M12 21V11"/><path d="M12 14c-3 0-5-2-6-4"/><path d="M12 11c2.5 0 4.5-1.5 5.5-3.5"/><circle cx="6" cy="9" r="2.2"/><circle cx="17.8" cy="7.2" r="2.2"/><circle cx="12" cy="6" r="2.6"/><path d="M8 21h8"/></svg>tracegrove</span>
<nav id="tabs" aria-label="Sections"></nav><span class="ctx" id="ctx"></span></header>
<div class="page" id="main"></div>
<script>
const TOKEN='__TOKEN__';const START_BRANCH=__BRANCH__;const DEFAULT_MODELS=__DEFAULT_MODELS__;
const TABS=['Run','Discover','History','Settings'];
let tab=START_BRANCH?'Discover':'Run';let state=null;
const ui={run:null,runName:null,sel:null,step:null,running:false,disc:null,source:START_BRANCH||'',draft:null,agent:null,agentPhase:-1,videoTimes:{}};
function h(tag,attrs,...kids){const el=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(k==='on')for(const[e,f]of Object.entries(v))el.addEventListener(e,f);else if(v!==null&&v!==undefined&&v!==false)el.setAttribute(k,v===true?'':v)}for(const kid of kids.flat()){if(kid===null||kid===undefined||kid===false)continue;el.append(kid instanceof Node?kid:document.createTextNode(String(kid)))}return el}
async function api(path,body){const r=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json','x-tracegrove-token':TOKEN},body:JSON.stringify(body)}:{});const j=await r.json();if(!r.ok)throw j;return j}
function toast(text){const t=h('div',{class:'toast fade',role:'status'},text);document.body.append(t);setTimeout(()=>t.remove(),2600)}
function blocked(e){return h('div',{class:'card fade'},h('div',{class:'row'},h('span',{class:'pill p-fail'},'blocked'),h('h2',{},'Fix this first')),
 ...(e.reasons||[{code:'error',detail:e.error||String(e),action:''}]).map(r=>h('div',{style:'margin-top:12px'},h('div',{class:'mono small'},r.code),h('div',{},r.detail),r.action?h('div',{class:'muted small'},'Fix: '+r.action):null)))}
const OUT={passed:'pass',assertion_failed:'fail',failed:'fail',completed:'pass',blocked:'warn',inconclusive:'warn',infrastructure_failed:'warn',cancelled:'warn',skipped:'none'};
const LABEL={pass:'held',fail:'failed',warn:'blocked',none:'not run',pruned:'pruned'};
const kind=o=>OUT[o]||'none';
const secs=ms=>ms==null?'':ms<1000?ms+' ms':(ms/1000).toFixed(1)+' s';
const ago=iso=>{const d=(Date.now()-new Date(iso).getTime())/1000;return d<60?'just now':d<3600?Math.round(d/60)+' min ago':d<86400?Math.round(d/3600)+' h ago':new Date(iso).toLocaleDateString()};
function header(){document.getElementById('tabs').replaceChildren(...TABS.map(t=>h('button',{'aria-current':t===tab?'page':'false',on:{click:()=>{tab=t;render()}}},t)));
 const g=state?state.git:null;const last=state&&state.runs[0];
 document.getElementById('ctx').textContent=state?[state.config?state.config.project:state.dir.split('/').pop(),g&&g.isRepo?(g.current||'detached'):null,last?'last run '+ago(last.startedAt):'never run'].filter(Boolean).join(' · '):''}
async function load(){state=await api('/api/overview');if(state.running){ui.running=ui.running||'Verification is running';watchRun()}if(state.runs.length&&(!ui.runName||!state.runs.some(r=>r.name===ui.runName))){ui.runName=state.runs[0].name;ui.run=null}if(ui.runName&&!ui.run){try{ui.run=await api('/api/runs/'+encodeURIComponent(ui.runName))}catch{ui.run=null}}render()}
function page(...nodes){document.getElementById('main').replaceChildren(...nodes.flat())}

${SOURCE_CONTROLS_JS}
/* ---------- Run: the bonsai ---------- */
function scenarios(){const run=ui.run;const byId=new Map((run?run.cases:[]).map(c=>[c.caseId,c]));
 const flows=state.flows.length?state.flows:(run?run.cases.map(c=>({...c,fixtures:[],steps:c.steps})):[]);
 const live=flows.map(f=>{const c=byId.get(f.caseId);const steps=f.steps.map((s,i)=>{const r=c?(c.steps.find(x=>x.id===s.id)||c.steps[i]):null;return{name:s.name,method:s.method,path:s.path,as:s.as,expect:s.expectStatus,expectation:s.expectation,result:r?kind(r.result):'none',status:r?r.status:null,observedText:r?r.observedText:null,ms:r?r.durationMs:null,reason:r?r.reason:null}});
  return{id:f.caseId,title:f.title,file:f.file,fixtures:f.fixtures,state:c?kind(c.outcome):'none',ms:c?c.durationMs:null,failure:c?c.failure:null,steps}});
 const cut=(state.pruned||[]).map(p=>({id:p.file.replace(/^.*\//,'').replace(/\.flow\.(?:ya?ml|ts)\.pruned$/,''),title:p.title,file:p.file,state:'pruned',steps:[],fixtures:[]}));
 return live.concat(cut)}
function runTab(){
 if(!state.hasConfig)return[h('div',{class:'card fade',style:'max-width:640px'},h('span',{class:'label'},'Plant the first tree'),h('h1',{style:'margin:8px 0 12px'},'No tracegrove.config.yaml in this folder yet.'),
  h('p',{class:'muted'},'Init detects FastAPI, Django or Node, writes a config and one example flow, and tells you the test-mode auth line to add.'),h('button',{class:'btn',on:{click:async()=>{try{await api('/api/init',{});toast('Config and example flow written');await load()}catch(e){page(blocked(e))}}}},'Initialize'))];
 if(state.compileError&&!state.flows.length&&!ui.run)return[sourceBanner(),blocked(state.compileError)];
 const sc=scenarios();const run=ui.run;const ran=sc.filter(s=>s.state!=='none'&&s.state!=='pruned');const held=ran.filter(s=>s.state==='pass').length;
 const allSteps=run?(run.cases||[]).flatMap(s=>s.steps):[];const stepsHeld=allSteps.filter(s=>kind(s.result)==='pass').length;
 if(ui.sel===null){const f=sc.find(s=>s.state==='fail');ui.sel=f?f.id:(sc[0]||{}).id;ui.step=f?Math.max(0,f.steps.findIndex(x=>x.result==='fail')):0}
 const headline=!run?'Nothing has run yet. Run the grove to see which scenarios hold.':run.bundleVerified===false?'Evidence could not be verified for this run.':run.outcome==='passed'?'Every scenario held on this run.':held+' of '+ran.length+' scenarios held. '+(ran.length-held)+' need'+(ran.length-held===1?'s':'')+' a look.';
 const pick=h('select',{'aria-label':'Run',on:{change:async e=>{ui.runName=e.target.value;ui.run=null;ui.sel=null;await load()}}},state.runs.map(r=>h('option',{value:r.name,selected:r.name===ui.runName},ago(r.startedAt)+' · '+LABEL[kind(r.outcome)]+' · '+r.totals.passed+'/'+(r.totals.passed+r.totals.failed+r.totals.other))));
 const hero=h('section',{style:'margin-bottom:28px'},h('div',{class:'row',style:'justify-content:space-between;align-items:flex-start'},
   h('div',{},h('span',{class:'label'},run?'Run '+run.runDir.split('/').pop():state.flows.length+' scenarios planted'),h('h1',{style:'margin-top:6px'},headline)),
   h('div',{class:'row'},state.runs.length?pick:null,ui.running?h('span',{class:'row muted'},h('span',{class:'think'},h('i'),h('i'),h('i')),h('span',{id:'run-activity',role:'status','aria-live':'polite'},ui.running)):
    [ui.sel&&sc.length>1?h('button',{class:'btn ghost',disabled:!!state.compileError,on:{click:()=>runNow(ui.sel)}},'Run this scenario'):null,h('button',{class:'btn',disabled:!!state.compileError,on:{click:()=>runNow('')}},'Run all')])),
  run?h('div',{class:'stats'},h('div',{},h('b',{},held+' / '+ran.length),h('span',{class:'muted'},'scenarios held')),h('div',{},h('b',{},stepsHeld+' / '+allSteps.length),h('span',{class:'muted'},'steps held')),
   h('div',{},h('b',{},secs(new Date(run.finishedAt)-new Date(run.startedAt))),h('span',{class:'muted'},'wall time')),
   h('div',{},h('b',{class:run.bundleVerified?'c-pass':'c-warn'},run.bundleVerified?'✓':'–'),h('span',{class:'muted'},run.bundleVerified?'evidence bundle re-verified':'bundle not verified'))):null,
  state.compileError?h('div',{style:'margin-top:16px'},blocked(state.compileError)):null,ui.error?h('div',{style:'margin-top:16px'},blocked(ui.error)):null);
 const tree=h('section',{class:'grow','aria-label':'Scenario tree'},h('div',{class:'rulehead'},h('span',{class:'label'},'Scenarios'),h('span',{class:'rule'}),h('span',{class:'small muted'},'step · interaction · time on the run clock · status')),
  h('div',{class:'tree'+(ui.running?' growing':'')},sc.map(s=>branch(s))));
 const side=h('div',{class:'side'},fixes(sc,run),detail(sc));
 return[sourceBanner(),hero,h('div',{class:'cols'},tree,side)]}
function branch(s){const open=ui.sel===s.id&&s.steps.length>0;const cut=s.state==='pruned';const total=s.steps.reduce((a,x)=>a+(x.ms||0),0)||1;let at=0;
 return h('div',{class:'fade'},h('div',{class:'br'},h('span',{class:'twig'+(cut?' cut':'')},h('i')),
  h('button',{class:'node','aria-expanded':open?'true':'false',on:{click:()=>{ui.sel=s.id;ui.step=Math.max(0,s.steps.findIndex(x=>x.result==='fail'));render()}}},
   h('span',{class:'dot '+s.state,'aria-hidden':'true'}),
   h('span',{class:'body'},h('span',{class:'row',style:'gap:4px 12px'},h('span',{class:'id',style:cut?'color:var(--muted)':''},s.id),h('span',{class:'state c-'+(cut?'none':s.state)},LABEL[s.state])),
    h('span',{style:cut?'color:var(--ink3)':''},s.title),s.fixtures.length?h('span',{class:'small muted'},'given '+s.fixtures.join(', ')):null),
   h('span',{class:'pips','aria-label':s.steps.filter(x=>x.result==='pass').length+' of '+s.steps.length+' steps held'},s.steps.map(x=>h('i',{class:x.result}))),
   h('span',{class:'time'},secs(s.ms)))),
  open?h('div',{class:'twigs fade'},s.steps.map((x,j)=>{const left=at/total*100;at+=x.ms||0;return h('div',{class:'br'},h('span',{class:'twig'},h('i')),
   h('button',{class:'step','aria-pressed':ui.step===j?'true':'false',on:{click:()=>{ui.step=j;render()}}},h('span',{class:'dot s '+x.result,'aria-hidden':'true'}),h('span',{},x.name),h('span',{class:'req'},x.method+' '+x.path),
    h('span',{class:'bar','aria-hidden':'true'},x.ms!=null?h('i',{class:x.result==='fail'?'fail':'',style:'left:'+left.toFixed(1)+'%;width:'+((x.ms||0)/total*100).toFixed(1)+'%'}):null),
    h('span',{class:'ms muted'},x.ms!=null?x.ms+' ms':''),h('span',{class:'res c-'+x.result},x.status!=null?x.status:x.result==='none'?'–':LABEL[x.result])))})):null)}
function fixes(sc,run){const items=[];for(const s of sc)if(s.state==='fail'||s.state==='warn')items.push({s,title:s.failure?s.failure.message:'Did not complete',where:s.failure?'step "'+s.failure.step+'"':s.file});
 if(run&&run.bundleVerified===false)items.push({s:null,title:'Exported evidence failed verification',where:'Inspect bundle-problems.txt before relying on this run.'});
 for(const b of (run&&run.blockers)||[])items.push({s:null,title:b.code+': '+b.detail,where:b.action});
 return h('section',{'aria-label':'Needs a fix'},h('div',{class:'rulehead'},h('h2',{},'Needs a fix'),h('span',{class:'rule'}),h('span',{class:'small muted'},items.length?items.length+' open':'')),
  items.length?h('div',{style:'display:flex;flex-direction:column;gap:8px'},items.map(it=>h('button',{class:'fix','aria-pressed':it.s&&ui.sel===it.s.id?'true':'false',on:{click:()=>{if(!it.s)return;ui.sel=it.s.id;ui.step=Math.max(0,it.s.steps.findIndex(x=>x.result!=='pass'));render()}}},
   h('span',{class:'row',style:'gap:8px'},h('span',{class:'pill '+(it.s&&it.s.state==='fail'?'p-fail':'p-warn')},it.s&&it.s.state==='fail'?'bug':'blocked'),h('span',{class:'mono small'},it.s?it.s.id:'run')),h('span',{},it.title),h('span',{class:'small muted'},it.where)))):
  h('p',{class:'muted'},run?'Nothing. Every scenario that ran held.':'Run the grove and failures land here, ordered as they occurred.'))}
function recording(s){const c=ui.run&&(ui.run.cases||[]).find(c=>c.caseId===s.id);const v=c&&(c.videos||[]).find(v=>v.mediaType==='video/webm'&&/^[a-f0-9]{64}$/.test(v.digest));if(!v||!ui.runName)return null;
 const status=h('p',{class:'small muted',role:'status'},'Checking the recording evidence…');
 if(ui.run.bundleVerified===false)return h('section',{class:'recording','aria-label':'Browser recording'},h('h2',{},'Browser recording'),h('p',{role:'alert'},'Recording unavailable: this run’s evidence failed verification.'));
 const key=ui.runName+':'+v.digest;
 const player=h('video',{controls:true,playsinline:true,preload:'metadata','aria-label':'Browser recording for '+s.id,src:'/api/runs/'+encodeURIComponent(ui.runName)+'/media/'+v.digest+'?case='+encodeURIComponent(s.id),
  on:{loadedmetadata:()=>{const at=ui.videoTimes[key];if(Number.isFinite(at)&&at>0)player.currentTime=Math.min(at,Number.isFinite(player.duration)?player.duration:at);status.textContent='Recording loaded from verified evidence.'},timeupdate:()=>{ui.videoTimes[key]=player.currentTime},error:()=>{status.textContent='Recording unavailable or its evidence failed verification.'}}});
 return h('section',{class:'recording','aria-label':'Browser recording'},h('h2',{},'Browser recording'),player,status)}
function detail(sc){const s=sc.find(x=>x.id===ui.sel);if(!s)return null;const x=s.steps[ui.step];
 if(!x)return h('aside',{class:'card fade'},h('span',{class:'label'},s.id),h('h2',{style:'margin:6px 0'},s.title),h('p',{class:'muted'},s.state==='pruned'?'Pruned: the file is kept as '+s.file+' and the compiler skips it.':'No steps.'),
  s.state==='pruned'?h('button',{class:'btn ghost',on:{click:()=>prune(s.file.replace(/\.pruned$/,''),true)}},'Graft back'):null);
 const bad=x.result==='fail';
 return h('aside',{class:'card fade','aria-label':'Step detail'},h('span',{class:'label'},s.id+' › step '+(ui.step+1)+' of '+s.steps.length),h('h2',{style:'margin:6px 0 2px'},x.name),
  h('p',{class:'mono small muted',style:'margin:0'},[x.method&&x.path?x.method+' '+x.path:null,x.as?'as '+x.as:null,x.ms!=null?x.ms+' ms':null].filter(Boolean).join(' · ')),
  h('div',{class:'obs'},h('div',{},h('div',{class:'label'},'expected'),h('div',{class:'mono'},x.expectation||(x.expect!=null?'Status '+x.expect:state.compileError?'Expectation not recorded in summary':'Step completes'))),h('div',{class:bad?'bad':x.result==='pass'?'good':''},h('div',{class:'label'},'observed'),h('div',{class:'mono'},x.observedText!=null?x.observedText:x.status!=null?x.status:x.result==='none'?'not run':LABEL[x.result]))),
  bad&&s.failure?h('pre',{},s.failure.message+(s.failure.observed?'\n'+s.failure.observed:'')):x.reason?h('p',{class:'small muted'},x.reason):h('p',{class:'small muted'},x.result==='pass'?'Step completed; its configured checks held.':'Run the scenario to observe this step.'),
  recording(s),
  h('div',{class:'row',style:'margin-top:16px'},h('span',{class:'mono small muted',style:'flex:1;overflow-wrap:anywhere'},s.file),
   h('button',{class:'btn ghost sm',on:{click:()=>prune(s.file,false)}},'Prune'),h('button',{class:'btn sm',disabled:!!state.compileError,on:{click:()=>runNow(s.id)}},s.state==='none'?'Run':'Rerun')))}
let runWatch=null;
function stopRunWatch(){if(runWatch!==null)clearInterval(runWatch);runWatch=null}
function watchRun(){if(runWatch!==null)return;let polling=false;runWatch=setInterval(async()=>{if(polling)return;polling=true;try{const a=await api('/api/activity');if(ui.running&&a.status==='running'){ui.running=a.label;const el=document.getElementById('run-activity');if(el)el.textContent=a.label}else if(ui.running&&(a.status==='finished'||a.status==='failed')){stopRunWatch();ui.running=false;ui.runName=null;ui.run=null;await load()}}catch{}finally{polling=false}},500)}
async function runNow(grep){if(state.compileError){ui.error=state.compileError;render();return}ui.running='Planning and running; awaiting verified evidence';render();watchRun();
 ui.error=null;try{const r=await api('/api/test',{grep});ui.runName=r.runDir.split('/').pop();ui.run=r;ui.sel=r.cases.some(c=>c.caseId===ui.sel)?ui.sel:(r.cases[0]?.caseId||null);toast(r.outcome==='passed'?'Every scenario held':'Run finished: '+r.outcome)}catch(e){ui.error=e}finally{stopRunWatch();ui.running=false}await load()}
async function prune(file,graft){try{await api('/api/prune',{file,graft});toast(graft?'Grafted back':'Pruned. Graft it back any time.');ui.sel=null;await load()}catch(e){toast(e.error||'Could not '+(graft?'graft':'prune'))}}

/* ---------- Discover: source, reachability, intent ---------- */
const AGENT_PHASES=['Drafting and checking; awaiting the agent result'];
function discoverTab(){const g=state.git;const a=state.agent.settings;const name=a.provider==='claude'?'Claude':a.provider==='codex'?'Codex':null;
 const sources=[{v:'',label:'working tree',note:'uncommitted files included'}].concat(g.branches.map(b=>({v:b,label:b,note:b===g.current?'checked out':b===g.base?'base':''})));
 const src=h('section',{class:'side',style:'flex:1 1 260px;max-width:340px'},h('div',{},h('span',{class:'label'},'Source'),h('div',{class:'src',style:'margin-top:10px'},
   (g.isRepo?sources:sources.slice(0,1)).map(s=>h('button',{'aria-pressed':ui.source===s.v?'true':'false',on:{click:()=>{ui.source=s.v;scan()}}},h('span',{class:'dot s '+(ui.source===s.v?'pass':'none')}),h('span',{style:'flex:1;min-width:0;display:flex;flex-direction:column;padding:6px 0'},h('span',{style:'overflow-wrap:anywhere'},s.label),s.note?h('span',{class:'small muted',style:'font-family:var(--sans)'},s.note):null)))),
   g.isRepo?h('p',{class:'small muted'},'A branch shows routes in files it changed against '+(g.base||'the default branch')+' first.'):h('p',{class:'small muted'},'Not a git repo, so only the working tree.')));
 const d=ui.disc;
 const reach=h('section',{class:'grow'},h('div',{class:'rulehead'},h('span',{class:'label'},'Reachability'),h('span',{class:'rule'}),d?h('span',{class:'small muted'},d.routes.length+' routes · '+d.uncovered+' unreached'+(d.branch&&d.base?' · '+d.changedFiles.length+' files changed':'')):null),
  !d?h('p',{class:'row muted'},h('span',{class:'think'},h('i'),h('i'),h('i')),'Scanning routes'):d.routes.length?h('div',{},d.routes.map(r=>routeRow(r))):h('p',{class:'muted'},'No routes found. Discovery reads FastAPI decorators, Django path() and Express routers.'),
  ui.draft?draftCard():null);
 const intent=h('section',{class:'side',style:'flex:1 1 340px'},h('div',{class:'card'},h('span',{class:'label'},'Intent'),h('h2',{style:'margin:6px 0 4px'},'What should be true after this change?'),
  h('p',{class:'small muted',style:'margin:0 0 12px'},name?name+' ('+(a.model||'CLI default')+') reads the code, writes flows into tracegrove/discovered/, and tracegrove checks them before you see them.':'Pick Claude Code or Codex in Settings to draft with an agent.'),
  h('textarea',{id:'intent',placeholder:'After Alice revokes a share, Bob can no longer read the note.','aria-label':'Intent'},ui.intent||''),
  h('div',{class:'row',style:'margin-top:12px'},h('button',{class:'btn',disabled:!name||ui.agentPhase>=0,on:{click:agentDraft}},name?'Draft with '+name:'Draft'),h('button',{class:'btn ghost',on:{click:()=>{tab='Settings';render()}}},'Settings')),
  ui.agentPhase>=0?h('ul',{class:'phases fade','aria-live':'polite'},AGENT_PHASES.map((p,i)=>h('li',{},i<ui.agentPhase?h('span',{class:'ok'},'✓'):i===ui.agentPhase?h('span',{class:'think'},h('i'),h('i'),h('i')):h('span',{class:'wait'},'○'),h('span',{class:i>ui.agentPhase?'muted':''},p)))):null,
  ui.agent?agentResult():null));
 return[h('div',{class:'cols'},src,reach,intent)]}
function routeRow(r){const covered=r.coveredBy.length>0;return h('div',{class:'route fade'},h('span',{class:'dot s '+(covered?'pass':'fail'),'aria-hidden':'true'}),
 h('span',{style:'min-width:0'},h('span',{class:'mono small'},r.method+' '+r.path),r.changed?h('span',{class:'pill p-warn',style:'margin-left:8px'},'changed'):null,h('div',{class:'small '+(covered?'muted':'c-fail')},covered?r.coveredBy.join(', '):'unreached')),
 h('span',{class:'where mono small muted',style:'overflow-wrap:anywhere'},r.file+':'+r.line),covered?h('span'):h('button',{class:'btn ghost sm',on:{click:()=>draftOne(r)}},'Draft'))}
function draftCard(){const d=ui.draft;return h('div',{class:'card fade',style:'margin-top:16px'},h('span',{class:'label'},'Draft'),h('h2',{class:'mono',style:'font-size:14px;margin:6px 0 12px'},'discovered/'+d.file),h('pre',{},d.yaml),
 h('div',{class:'row',style:'margin-top:12px'},h('button',{class:'btn',on:{click:async()=>{try{const s=await api('/api/draft',{method:d.route.method,path:d.route.path,save:true});ui.draft=null;toast('Saved '+s.saved.split('/').slice(-3).join('/')+'. Fill the TODOs.');await load();scan()}catch(e){toast(e.error||'Could not save')}}}},'Plant it'),h('button',{class:'btn ghost',on:{click:()=>{ui.draft=null;render()}}},'Discard')))}
async function draftOne(r){try{const d=await api('/api/draft',{method:r.method,path:r.path});ui.draft={...d,route:r};render()}catch(e){toast(e.error||'Could not draft')}}
async function scan(){ui.scanning=true;ui.disc=null;ui.draft=null;render();try{ui.disc=await api('/api/discover?branch='+encodeURIComponent(ui.source||''))}catch(e){ui.scanning=false;page(blocked(e));return}ui.scanning=false;if(tab==='Discover')render()}
async function agentDraft(){ui.intent=document.getElementById('intent').value;ui.agent=null;ui.agentPhase=0;render();
 try{ui.agent=await api('/api/agent-draft',{intent:ui.intent,branch:ui.source})}catch(e){ui.agent={error:e}}finally{ui.agentPhase=-1}await load();if(ui.disc)scan()}
function agentResult(){const r=ui.agent;if(r.error)return h('div',{style:'margin-top:16px'},blocked(r.error));const c=r.check;const ok=c.ok&&r.agent.exitCode===0;
 return h('div',{class:'fade',style:'margin-top:16px'},h('div',{class:'row',style:'gap:8px'},h('span',{class:'pill '+(ok?'p-pass':'p-fail')},ok?'checked':'needs fixes'),h('span',{class:'small muted'},r.agent.files.length+' flow file(s) from '+r.agent.provider+(r.agent.model?' · '+r.agent.model:''))),
  r.agent.files.length?h('div',{style:'margin-top:8px'},r.agent.files.map(f=>h('div',{class:'row',style:'justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)'},h('span',{class:'mono small',style:'overflow-wrap:anywhere'},f),h('button',{class:'btn ghost sm',on:{click:()=>prune(f,false)}},'Prune')))):null,
  c.ok?null:c.issues.map(x=>h('p',{class:'small'},h('span',{class:'c-fail'},x.detail),h('br'),h('span',{class:'muted'},'Fix: '+x.action))),
  r.agent.output?h('details',{style:'margin-top:8px'},h('summary',{class:'small muted'},'What the agent said'),h('pre',{style:'margin-top:8px'},r.agent.output)):null,
  ok&&r.agent.files.length?h('button',{class:'btn',style:'margin-top:12px',on:{click:()=>{tab='Run';ui.sel=null;render();runNow('discovered')}}},'Run the new scenarios'):null)}

/* ---------- History: one case or the whole set ---------- */
function historyTab(){const runs=state.runs.slice(0,24);if(!runs.length)return[h('div',{class:'card'},h('h2',{},'No runs yet'),h('p',{class:'muted'},'Every run is kept under .tracegrove/runs/ with its evidence bundle.'))];
 const ids=[...new Set(state.flows.map(f=>f.caseId).concat(runs.flatMap(r=>r.cases.map(c=>c.caseId))))];
 const open=async(name,id)=>{ui.runName=name;ui.run=null;ui.sel=id||null;tab='Run';await load()};
 return[h('div',{class:'rulehead'},h('span',{class:'label'},'History'),h('span',{class:'rule'}),h('span',{class:'small muted'},'newest first · a column is one run of the set · a row is one scenario across runs')),
  h('div',{class:'card scroll',style:'padding:8px 12px'},h('table',{class:'grid'},h('thead',{},h('tr',{},h('th',{class:'label',style:'text-align:left'},'Scenario'),runs.map(r=>h('th',{},h('button',{class:'cell',title:r.name+' · '+r.outcome,on:{click:()=>open(r.name)}},h('span',{class:'dot '+kind(r.outcome)})),h('div',{class:'mono',style:'font-size:11px;color:var(--muted)'},ago(r.startedAt).replace(' ago','')))))),
   h('tbody',{},ids.map(id=>h('tr',{},h('td',{class:'mono small'},id),runs.map(r=>{const c=r.cases.find(x=>x.caseId===id);return h('td',{},c?h('button',{class:'cell',title:id+' · '+c.outcome+' · '+secs(c.durationMs),on:{click:()=>open(r.name,id)}},h('span',{class:'dot s '+kind(c.outcome)})):h('span',{class:'muted'},'·'))}))))))]}

/* ---------- Settings ---------- */
function settingsTab(){const a=state.agent;const s=a.settings;const det=a.detected;let provider=s.provider;
 const model=h('input',{id:'model','aria-label':'Model',value:s.source.model==='default'?'':(s.model||''),placeholder:DEFAULT_MODELS[s.provider]||'No agent selected',style:'flex:1;min-width:200px'});
 const opt=(v,title,note,ok)=>h('button',{'aria-pressed':provider===v?'true':'false',on:{click:e=>{provider=v;model.value='';model.placeholder=DEFAULT_MODELS[v]||'No agent selected';for(const b of e.currentTarget.parentNode.children)b.setAttribute('aria-pressed',b===e.currentTarget?'true':'false')}}},h('b',{style:'font-weight:500'},title),h('span',{class:'small '+(ok?'c-pass':'muted')},note));
 const cfg=state.config;
 return[sourceSettings(),h('div',{class:'cols'},h('section',{class:'grow card'},h('span',{class:'label'},'Agent under the hood'),h('h2',{style:'margin:6px 0 4px'},'Who drafts and repairs your flows'),
   h('p',{class:'small muted',style:'margin:0 0 16px'},'Saved to .tracegrove/settings.json for you alone. agent: in tracegrove.config.yaml sets the team default; --agent and --model on the CLI override both.'),
   h('div',{class:'seg'},opt('claude','Claude Code',det.claude?'installed · '+DEFAULT_MODELS.claude:'not installed',!!det.claude),opt('codex','Codex',det.codex?'installed · '+DEFAULT_MODELS.codex:'not installed',!!det.codex),opt('none','None','discovery and templates only',false)),
   h('div',{class:'row',style:'margin-top:16px'},model,h('button',{class:'btn',on:{click:async()=>{try{state.agent=await api('/api/settings',{agent:{provider,model:model.value}});toast('Saved');render()}catch(e){toast(e.reasons?e.reasons[0].detail:e.error)}}}},'Save')),
   h('p',{class:'small muted',style:'margin-top:12px'},'In effect: ',h('span',{class:'mono'},s.provider+' · '+(s.model||'CLI default')),' (provider from '+s.source.provider+', model from '+s.source.model+').'),
   (!det.claude||!det.codex)?h('p',{class:'small muted'},(!det.claude?'Claude Code: npm i -g @anthropic-ai/claude-code. ':'')+(!det.codex?'Codex: npm i -g @openai/codex.':'')):null),
  h('section',{class:'side card'},h('span',{class:'label'},'Project'),cfg?h('table',{class:'kv'},h('tbody',{},
   h('tr',{},h('th',{},'Name'),h('td',{},cfg.project)),h('tr',{},h('th',{},'Adapter'),h('td',{class:'mono small'},cfg.app.adapter+' '+(cfg.app.entry||cfg.app.run||''))),
   h('tr',{},h('th',{},'Health'),h('td',{class:'mono small'},cfg.app.health)),h('tr',{},h('th',{},'Personas'),h('td',{class:'small'},Object.entries(cfg.personas).map(([k,v],i)=>(i?', ':'')+k+' → '+v.subject+(i===0?' (default)':'')).join(''))),
   h('tr',{},h('th',{},'Flows'),h('td',{class:'mono small'},cfg.testDir+'/ · '+state.flows.length+' live, '+(state.pruned||[]).length+' pruned')),
   h('tr',{},h('th',{},'Source digest'),h('td',{class:'mono small'},state.sourceDigest?state.sourceDigest.slice(0,16)+' · '+state.sourceFiles+' files':'–')))):h('p',{class:'muted'},'No config yet. Initialize from the Run tab.'),
   h('p',{class:'small muted mono',style:'overflow-wrap:anywhere'},state.dir)))]}

function render(){header();if(!state)return;const views={Run:runTab,Discover:discoverTab,History:historyTab,Settings:settingsTab};page(views[tab]());if(tab==='Discover'&&!ui.disc&&!ui.scanning)scan()}
load().catch(e=>page(blocked(e)));
</script></body></html>`;
