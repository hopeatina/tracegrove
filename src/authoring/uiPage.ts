/**
 * The single page served by `tracegrove ui`, in the Grove design: a bonsai of scenarios (trunk,
 * branches, step twigs), pruning as a reversible rename, live progress from real run and agent
 * events, self-healing with reviewable diffs and undo, a command palette (Cmd/Ctrl+K) and keyboard
 * navigation.
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
.obs-long{grid-template-columns:minmax(0,1fr)}.obs .mono{white-space:pre-wrap}
pre{font:12px/1.6 var(--mono);background:var(--code);border-radius:8px;padding:12px 14px;overflow-x:auto;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.think{display:inline-flex;gap:5px;align-items:center}.think i{width:7px;height:7px;border-radius:50%;background:var(--moss);animation:pulse 1.2s ease-in-out infinite}
.think i:nth-child(2){animation-delay:.18s}.think i:nth-child(3){animation-delay:.36s}
.growing .dot{animation:breathe 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.25;transform:scale(.75)}50%{opacity:1;transform:scale(1)}}@keyframes breathe{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 5px var(--moss-bg)}}
.fade{animation:fade .24s ease-out both}@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.think i,.growing .dot,.fade,.live .dot{animation:none}}
.phases{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}.phases li{display:flex;gap:10px;align-items:center}.phases .ok{color:var(--moss);width:12px}.phases .wait{color:var(--muted);width:12px}
.src{display:flex;flex-direction:column;gap:4px}.src button{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 12px;border-radius:8px;border:1px solid transparent;background:none;text-align:left;font:13px/18px var(--mono)}
.src button[aria-pressed=true]{background:var(--paper);border-color:var(--line2)}.src button:hover{background:var(--paper)}
.route{display:grid;grid-template-columns:8px minmax(160px,1.4fr) minmax(120px,1fr) auto;gap:12px;align-items:center;padding:8px 12px;border-radius:8px;min-height:44px}.route:hover{background:var(--paper)}
.grid{border-collapse:separate;border-spacing:0}.grid th,.grid td{padding:8px 10px;text-align:center;border-bottom:1px solid var(--line)}.grid th:first-child,.grid td:first-child{text-align:left;position:sticky;left:0;background:var(--stone)}
.cell{width:28px;height:28px;border-radius:8px;border:1px solid transparent;background:none;display:inline-flex;align-items:center;justify-content:center}.cell:hover{border-color:var(--twig);background:var(--paper)}
.scroll{overflow-x:auto}.seg{display:flex;flex-wrap:wrap;gap:8px}.seg button{flex:1 1 160px;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid var(--line2);background:var(--paper);display:flex;flex-direction:column;gap:2px}
.seg button[aria-pressed=true]{border-color:var(--moss);box-shadow:inset 0 0 0 1px var(--moss)}
table.kv{border-collapse:collapse;width:100%}table.kv th,table.kv td{text-align:left;padding:8px 0;border-bottom:1px solid var(--line);vertical-align:top}table.kv th{width:38%;padding-right:12px;font-weight:500;color:var(--ink3)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:14px;background:var(--forest);color:var(--on-forest);padding:10px 16px;border-radius:10px;font-size:14px;z-index:30;max-width:92vw}
.toast .act{background:none;border:0;color:var(--on-forest);text-decoration:underline;font-weight:600;min-height:28px;padding:0}
.pal-back{position:fixed;inset:0;background:rgba(18,20,18,.34);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh;z-index:20}
.pal{width:min(640px,92vw);background:var(--paper);border:1px solid var(--line2);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.2);overflow:hidden}
.pal input{width:100%;border:0;border-bottom:1px solid var(--line);border-radius:0;min-height:54px;font-size:16px;padding:0 18px;outline:none}
.pal ul{list-style:none;margin:0;padding:6px;max-height:52vh;overflow:auto}.pal li{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;min-height:44px}
.pal li[aria-selected=true]{background:var(--sel)}.pal .grp{font:500 11px/16px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);width:76px;flex:none}.pal .hint{margin-left:auto;color:var(--muted);font-size:13px}
.pal .foot{display:flex;gap:16px;padding:8px 14px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;flex-wrap:wrap}
kbd{font:500 11px/16px var(--mono);border:1px solid var(--line2);border-bottom-width:2px;border-radius:5px;padding:1px 6px;color:var(--ink3);background:var(--stone)}
.kbtn{display:inline-flex;gap:8px;align-items:center;min-height:36px;padding:0 10px;border:1px solid var(--line2);border-radius:8px;background:var(--paper);color:var(--ink3);font-size:13px}
.log{max-height:280px;overflow:auto;font:12px/1.6 var(--mono);background:var(--code);border-radius:8px;padding:10px 12px;margin-top:12px}.log div{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink3)}.log div:last-child{color:var(--ink)}
.diff{font:12px/1.6 var(--mono);background:var(--code);border-radius:8px;padding:8px 0;overflow-x:auto;margin-top:8px}.diff div{padding:0 12px;white-space:pre}.diff .add{background:var(--moss-bg);color:var(--moss)}.diff .del{background:var(--verm-bg);color:var(--verm-ink)}.diff .ctx{color:var(--ink3)}
.finding{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:10px;border:1px solid var(--line);background:var(--paper)}
.step.live,.node.live{box-shadow:inset 3px 0 0 var(--moss);background:var(--paper)}.live .dot{animation:breathe 1.1s ease-in-out infinite}
.keys{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;align-items:center;margin-top:12px}
@media (max-width:720px){header{padding:12px 16px}.page{padding:20px 16px 40px}.ctx{margin-left:0;width:100%}h1{font-size:23px;line-height:30px}
 .step{grid-template-columns:8px 1fr 48px;}.step .req,.step .bar,.step .ms{display:none}.route{grid-template-columns:8px 1fr auto}.route .where{display:none}.obs{grid-template-columns:minmax(0,1fr)}}
</style></head><body>
<header><span class="brand"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" style="color:var(--moss)"><path d="M12 21V11"/><path d="M12 14c-3 0-5-2-6-4"/><path d="M12 11c2.5 0 4.5-1.5 5.5-3.5"/><circle cx="6" cy="9" r="2.2"/><circle cx="17.8" cy="7.2" r="2.2"/><circle cx="12" cy="6" r="2.6"/><path d="M8 21h8"/></svg>tracegrove</span>
<nav id="tabs" aria-label="Sections"></nav><span class="ctx" id="ctx"></span><button class="kbtn" id="palbtn" type="button" aria-label="Open the command palette" aria-keyshortcuts="Control+K Meta+K">Commands <kbd>⌘K</kbd></button></header>
<div class="page" id="main"></div>
<script>
const TOKEN='__TOKEN__';const START_BRANCH=__BRANCH__;const DEFAULT_MODELS=__DEFAULT_MODELS__;
const TABS=['Run','Discover','Heal','History','Settings'];
let tab=START_BRANCH?'Discover':'Run';let state=null;
const ui={run:null,runName:null,sel:null,step:null,running:false,activeRunId:null,cancelling:false,disc:null,source:START_BRANCH||'',draft:null,agent:null,agentPhase:-1,videoTimes:{},live:null,heal:null,heals:[],healing:false,healError:null};
function h(tag,attrs,...kids){const el=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(k==='on')for(const[e,f]of Object.entries(v))el.addEventListener(e,f);else if(v!==null&&v!==undefined&&v!==false)el.setAttribute(k,v===true?'':v)}for(const kid of kids.flat()){if(kid===null||kid===undefined||kid===false)continue;el.append(kid instanceof Node?kid:document.createTextNode(String(kid)))}return el}
async function api(path,body){const r=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json','x-tracegrove-token':TOKEN},body:JSON.stringify(body)}:{});const j=await r.json();if(!r.ok)throw j;return j}
function toast(text,action){for(const old of document.querySelectorAll('.toast'))old.remove();const t=h('div',{class:'toast fade',role:'status'},h('span',{},text),
 action?h('button',{class:'act',on:{click:async()=>{t.remove();await action.run()}}},action.label):null);document.body.append(t);setTimeout(()=>t.remove(),action?7000:2800)}
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
async function load(){state=await api('/api/overview');try{ui.heals=await api('/api/heals')}catch{ui.heals=[]}if(!ui.heal&&ui.heals.length)ui.heal=ui.heals[0];ui.activeRunId=state.activeRunId;ui.cancelling=state.cancelling;if(state.running){ui.running=ui.running||'Verification is running';watchRun()}if(state.runs.length&&(!ui.runName||!state.runs.some(r=>r.name===ui.runName))){ui.runName=state.runs[0].name;ui.run=null}if(ui.runName&&!ui.run){try{ui.run=await api('/api/runs/'+encodeURIComponent(ui.runName))}catch{ui.run=null}}render()}
function page(...nodes){document.getElementById('main').replaceChildren(...nodes.flat().filter(n=>n!==null&&n!==undefined&&n!==false))}

${SOURCE_CONTROLS_JS}
/* ---------- Run: the bonsai ---------- */
function scenarios(){const run=ui.run;
 // Saved observations belong to their recorded steps, never today's flow or array position.
 if(run)return(run.cases||[]).map(c=>({id:c.caseId,title:c.title,file:c.file,reportedFile:c.reportedFile,reportedTitle:c.reportedTitle,fixtures:[],state:kind(c.outcome),ms:c.durationMs,failure:c.failure,
  steps:c.steps.map(r=>({id:r.id,name:r.name,reportedName:r.reportedName,method:r.method,path:r.path,as:null,expect:null,expectation:'Checks recorded for this run',result:kind(r.result),status:r.status,observedText:r.observedText,ms:r.durationMs,reason:r.reason}))}));
 const live=state.flows.map(f=>({id:f.caseId,title:f.title,file:f.file,fixtures:f.fixtures,state:'none',ms:null,failure:null,
  steps:f.steps.map(s=>({id:s.id,name:s.name,method:s.method,path:s.path,as:s.as,expect:s.expectStatus,expectation:s.expectation,result:'none',status:null,observedText:null,ms:null,reason:null}))}));
 const cut=(state.pruned||[]).map(p=>({id:p.file.replace(/^.*\//,'').replace(/\.flow\.(?:ya?ml|ts)\.pruned$/,''),title:p.title,file:p.file,state:'pruned',steps:[],fixtures:[]}));
 return live.concat(cut)}
function runTab(){
 if(!state.hasConfig&&!ui.run)return[h('div',{class:'card fade',style:'max-width:640px'},h('span',{class:'label'},'Plant the first tree'),h('h1',{style:'margin:8px 0 12px'},'No tracegrove.config.yaml in this folder yet.'),
  h('p',{class:'muted'},'Init detects FastAPI, Django or Node, writes a config and one example flow, and tells you the test-mode auth line to add.'),h('button',{class:'btn',on:{click:async()=>{try{await api('/api/init',{});toast('Config and example flow written');await load()}catch(e){page(blocked(e))}}}},'Initialize'))];
 if(state.compileError&&!state.flows.length&&!ui.run)return[sourceBanner(),blocked(state.compileError)];
 const sc=scenarios();const run=ui.run;const ran=sc.filter(s=>s.state!=='none'&&s.state!=='pruned');const held=ran.filter(s=>s.state==='pass').length;
 const allSteps=run?(run.cases||[]).flatMap(s=>s.steps):[];const stepsHeld=allSteps.filter(s=>kind(s.result)==='pass').length;
 if(ui.sel===null){const f=sc.find(s=>s.state==='fail');ui.sel=f?f.id:(sc[0]||{}).id;ui.step=f?Math.max(0,f.steps.findIndex(x=>x.result==='fail')):0}
 const headline=!run?'Nothing has run yet. Run the grove to see which scenarios hold.':run.bundleVerified===false?'Evidence could not be verified for this run.':run.outcome==='passed'?'Every scenario held on this run.':held+' of '+ran.length+' scenarios held. '+(ran.length-held)+' need'+(ran.length-held===1?'s':'')+' a look.';
 const pick=h('select',{'aria-label':'Run',on:{change:async e=>{ui.runName=e.target.value;ui.run=null;ui.sel=null;await load()}}},state.runs.map(r=>h('option',{value:r.name,selected:r.name===ui.runName},ago(r.startedAt)+' · '+LABEL[kind(r.outcome)]+' · '+r.totals.passed+'/'+(r.totals.passed+r.totals.failed+r.totals.other))));
 const hero=h('section',{style:'margin-bottom:28px'},h('div',{class:'row',style:'justify-content:space-between;align-items:flex-start'},
   h('div',{},h('span',{class:'label'},run?'Run '+run.runDir.split('/').pop():state.flows.length+' scenarios planted'),h('h1',{style:'margin-top:6px'},headline)),
   h('div',{class:'row'},state.runs.length?pick:null,ui.running?h('div',{class:'row'},h('span',{class:'row muted'},h('span',{class:'think'},h('i'),h('i'),h('i')),h('span',{id:'run-activity',role:'status','aria-live':'polite'},ui.running)),ui.activeRunId?h('button',{class:'btn ghost',disabled:ui.cancelling,on:{click:cancelRun}},ui.cancelling?'Waiting for run to settle':'Cancel run'):null):
    [ui.sel&&sc.length>1?h('button',{class:'btn ghost',disabled:!!state.compileError||!state.flows.some(f=>f.caseId===ui.sel),on:{click:()=>runNow(ui.sel)}},'Run this scenario'):null,h('button',{class:'btn',disabled:!state.hasConfig||!!state.compileError,on:{click:()=>runNow('')}},'Run all')])),
  run?h('div',{class:'stats'},h('div',{},h('b',{},held+' / '+ran.length),h('span',{class:'muted'},'scenarios held')),h('div',{},h('b',{},stepsHeld+' / '+allSteps.length),h('span',{class:'muted'},'steps held')),
   h('div',{},h('b',{},secs(new Date(run.finishedAt)-new Date(run.startedAt))),h('span',{class:'muted'},'wall time')),
   h('div',{},h('b',{class:run.bundleVerified?'c-pass':'c-warn'},run.bundleVerified?'✓':'–'),h('span',{class:'muted'},run.savedEvidence?(run.savedEvidence.status==='verified'?'saved evidence freshly verified':'saved evidence '+run.savedEvidence.status):(run.bundleVerified?'evidence verified at run completion':'bundle not verified')))):null,
  run?h('p',{class:'small muted',role:'note'},'Showing recorded scenarios and steps. Rerun and Run all use the current configuration.'+(state.sourceDigest==null?' Current application source could not be resolved.':run.sourceDigest!==state.sourceDigest?' Application source differs from this recorded run.':'')):null,
  run&&run.savedEvidence?h('p',{class:'small muted','aria-label':'Saved evidence status'},run.savedEvidence.message):null,
  state.compileError?h('div',{style:'margin-top:16px'},blocked(state.compileError)):null,ui.error?h('div',{style:'margin-top:16px'},blocked(ui.error)):null);
 const tree=h('section',{class:'grow','aria-label':'Scenario tree'},h('div',{class:'rulehead'},h('span',{class:'label'},'Scenarios'),h('span',{class:'rule'}),h('span',{class:'small muted'},'step · interaction · time on the run clock · status')),
  h('div',{class:'tree'+(ui.running?' growing':'')},sc.map(s=>branch(s))));
 const side=h('div',{class:'side'},fixes(sc,run),detail(sc));
 return[sourceBanner(),hero,h('div',{class:'cols'},tree,side)]}
function branch(s){const open=ui.sel===s.id&&s.steps.length>0;const cut=s.state==='pruned';const total=s.steps.reduce((a,x)=>a+(x.ms||0),0)||1;let at=0;
 return h('div',{class:'fade'},h('div',{class:'br'},h('span',{class:'twig'+(cut?' cut':'')},h('i')),
  h('button',{class:'node','data-case':s.id,'data-steps':s.steps.map(x=>x.id).join(' '),'aria-expanded':open?'true':'false',on:{click:()=>{ui.sel=s.id;ui.step=Math.max(0,s.steps.findIndex(x=>x.result==='fail'));render()}}},
   h('span',{class:'dot '+s.state,'aria-hidden':'true'}),
   h('span',{class:'body'},h('span',{class:'row',style:'gap:4px 12px'},h('span',{class:'id',style:cut?'color:var(--muted)':''},s.id),h('span',{class:'state c-'+(cut?'none':s.state)},LABEL[s.state])),
    h('span',{style:cut?'color:var(--ink3)':''},s.title),s.reportedTitle&&s.reportedTitle!==s.title?h('span',{class:'small muted'},'Saved title (unsealed): '+s.reportedTitle):null,s.fixtures.length?h('span',{class:'small muted'},'given '+s.fixtures.join(', ')):null),
   h('span',{class:'pips','aria-label':s.steps.filter(x=>x.result==='pass').length+' of '+s.steps.length+' steps held'},s.steps.map(x=>h('i',{class:x.result}))),
   h('span',{class:'time'},secs(s.ms)))),
  open?h('div',{class:'twigs fade'},s.steps.map((x,j)=>{const left=at/total*100;at+=x.ms||0;return h('div',{class:'br'},h('span',{class:'twig'},h('i')),
   h('button',{class:'step','data-step':x.id,'aria-pressed':ui.step===j?'true':'false',on:{click:()=>{ui.step=j;render()}}},h('span',{class:'dot s '+x.result,'aria-hidden':'true'}),h('span',{},x.name,x.reportedName&&x.reportedName!==x.name?h('small',{class:'muted'},' · saved name (unsealed): '+x.reportedName):null),h('span',{class:'req'},x.method+' '+x.path),
    h('span',{class:'bar','aria-hidden':'true'},x.ms!=null?h('i',{class:x.result==='fail'?'fail':'',style:'left:'+left.toFixed(1)+'%;width:'+((x.ms||0)/total*100).toFixed(1)+'%'}):null),
    h('span',{class:'ms muted'},x.ms!=null?x.ms+' ms':''),h('span',{class:'res c-'+x.result},x.status!=null?x.status:x.result==='none'?'–':LABEL[x.result])))})):null)}
function fixes(sc,run){const items=[];for(const s of sc)if(s.state==='fail'||s.state==='warn')items.push({s,title:s.failure?s.failure.message:'Did not complete',where:s.failure?'step "'+s.failure.step+'"':s.file});
 if(run&&run.bundleVerified===false)items.push({s:null,title:run.savedEvidence?run.savedEvidence.message:'Exported evidence failed verification',where:'Preserve this run and inspect its evidence before relying on the historical result.'});
 for(const b of (run&&run.blockers)||[])items.push({s:null,title:b.code+': '+b.detail,where:b.action});
  return h('section',{'aria-label':'Needs a fix'},h('div',{class:'rulehead'},h('h2',{},'Needs a fix'),h('span',{class:'rule'}),h('span',{class:'small muted'},items.length?items.length+' open':''),
   items.length&&!ui.running?h('button',{class:'btn sm',title:'Fix setup and drifted tests, prove each fix by re-running; product bugs are reported, never hidden (h)',on:{click:()=>startHeal(false)}},'Heal'):null),
  items.length?h('div',{style:'display:flex;flex-direction:column;gap:8px'},items.map(it=>h('button',{class:'fix','aria-pressed':it.s&&ui.sel===it.s.id?'true':'false',on:{click:()=>{if(!it.s)return;ui.sel=it.s.id;ui.step=Math.max(0,it.s.steps.findIndex(x=>x.result!=='pass'));render()}}},
   h('span',{class:'row',style:'gap:8px'},h('span',{class:'pill '+(it.s&&it.s.state==='fail'?'p-fail':'p-warn')},it.s&&it.s.state==='fail'?'failed':'blocked'),h('span',{class:'mono small'},it.s?it.s.id:'run')),h('span',{},it.title),h('span',{class:'small muted'},it.where)))):
  h('p',{class:'muted'},run?'Nothing. Every scenario that ran held.':'Run the grove and failures land here, ordered as they occurred.'))}
function recording(s){const c=ui.run&&(ui.run.cases||[]).find(c=>c.caseId===s.id);const v=c&&(c.videos||[]).find(v=>v.mediaType==='video/webm'&&/^[a-f0-9]{64}$/.test(v.digest));if(!v||!ui.runName)return null;
 const status=h('p',{class:'small muted',role:'status'},'Checking the recording evidence…');
 if(ui.run.bundleVerified===false)return h('section',{class:'recording','aria-label':'Browser recording'},h('h2',{},'Browser recording'),h('p',{role:'alert'},'Recording unavailable: this run’s evidence failed verification.'));
 const key=ui.runName+':'+v.digest;
 const player=h('video',{controls:true,playsinline:true,preload:'metadata','aria-label':'Browser recording for '+s.id,src:'/api/runs/'+encodeURIComponent(ui.runName)+'/media/'+v.digest+'?case='+encodeURIComponent(s.id),
  on:{loadedmetadata:()=>{const at=ui.videoTimes[key];if(Number.isFinite(at)&&at>0)player.currentTime=Math.min(at,Number.isFinite(player.duration)?player.duration:at);status.textContent='Recording loaded from verified evidence.'},timeupdate:()=>{ui.videoTimes[key]=player.currentTime},error:()=>{status.textContent='Recording unavailable or its evidence failed verification.'}}});
 return h('section',{class:'recording','aria-label':'Browser recording'},h('h2',{},'Browser recording'),player,status)}
function detail(sc){const s=sc.find(x=>x.id===ui.sel);if(!s)return null;const x=s.steps[ui.step];const current=state.flows.find(f=>f.caseId===s.id);
 if(!x)return h('aside',{class:'card fade'},h('span',{class:'label'},s.id),h('h2',{style:'margin:6px 0'},s.title),h('p',{class:'muted'},s.state==='pruned'?'Pruned: the file is kept as '+s.file+' and the compiler skips it.':'No steps.'),
  s.state==='pruned'?h('button',{class:'btn ghost',on:{click:()=>prune(s.file.replace(/\.pruned$/,''),true)}},'Graft back'):null);
 const bad=x.result==='fail';
 return h('aside',{class:'card fade','aria-label':'Step detail'},h('span',{class:'label'},s.id+' › step '+(ui.step+1)+' of '+s.steps.length),h('h2',{style:'margin:6px 0 2px'},x.name),
  x.reportedName&&x.reportedName!==x.name?h('p',{class:'small muted'},'Saved name (unsealed): '+x.reportedName):null,
    h('p',{class:'mono small muted',style:'margin:0'},[x.method&&x.path?x.method+' '+x.path:null,x.as?'as '+x.as:null,x.ms!=null?x.ms+' ms':null].filter(Boolean).join(' · ')),

  h('div',{class:'obs'+(x.observedText&&x.observedText.length>120?' obs-long':'')},h('div',{},h('div',{class:'label'},'expected'),h('div',{class:'mono'},x.expectation||(x.expect!=null?'Status '+x.expect:'Step completes'))),h('div',{class:bad?'bad':x.result==='pass'?'good':''},h('div',{class:'label'},'observed'),h('div',{class:'mono'},x.observedText!=null?x.observedText:x.status!=null?x.status:x.result==='none'?'not run':LABEL[x.result]))),
  s.failure?h('pre',{},'Recorded case failure at '+s.failure.step+': '+s.failure.message+(s.failure.observed?'\n'+s.failure.observed:'')):x.reason?h('p',{class:'small muted'},x.reason):h('p',{class:'small muted'},x.result==='pass'?'Step completed. See the recorded case outcome and checks.':'Run the scenario to observe this step.'),
  recording(s),
  h('div',{class:'row',style:'margin-top:16px'},h('span',{class:'mono small muted',style:'flex:1;overflow-wrap:anywhere'},s.reportedFile?'Saved flow (unsealed): '+s.reportedFile:s.file),
   current?h('button',{class:'btn ghost sm',on:{click:()=>prune(current.file,false)}},ui.run?'Prune current flow':'Prune'):null,h('button',{class:'btn sm',disabled:!current||!!ui.running||!!state.compileError,on:{click:()=>runNow(s.id)}},s.state==='none'?'Run':'Rerun')))}
let runWatch=null;
function stopRunWatch(){if(runWatch!==null)clearInterval(runWatch);runWatch=null}
/* Live progress comes from real run and agent events (/api/live), never from timers. */
function paintLive(){const l=ui.live;if(!l)return;const a=l.run;
 const el=document.getElementById('run-activity');if(el&&a.status==='running')el.textContent=a.label;
 for(const n of document.querySelectorAll('[data-step]'))n.classList.toggle('live',a.status==='running'&&!!a.stepId&&n.getAttribute('data-step')===a.stepId);
 for(const n of document.querySelectorAll('[data-steps]'))n.classList.toggle('live',a.status==='running'&&!!a.stepId&&n.getAttribute('data-steps').split(' ').includes(a.stepId));
 const log=document.getElementById('agent-log');if(log){const lines=l.agent.lines.length?l.agent.lines:['Waiting for the agent to start'];if(log.childElementCount!==lines.length||log.lastChild.textContent!==lines[lines.length-1]){const stick=log.scrollTop+log.clientHeight>=log.scrollHeight-8;log.replaceChildren(...lines.map(x=>h('div',{},x)));if(stick)log.scrollTop=log.scrollHeight}}
 const hp=document.getElementById('heal-phase');if(hp&&l.heal.status==='running')hp.textContent=l.heal.phase+(l.heal.detail?' · '+l.heal.detail:'')}
function watchRun(){if(runWatch!==null)return;let polling=false;runWatch=setInterval(async()=>{if(polling)return;polling=true;try{const [l,c]=await Promise.all([api('/api/live'),api('/api/run-control')]);const changed=ui.activeRunId!==c.runId||ui.cancelling!==c.cancelling;ui.activeRunId=c.runId;ui.cancelling=c.cancelling;ui.live=l;if(changed)render();const a=l.run;if(ui.running&&a.status==='running')ui.running=a.label;paintLive();
  if(ui.running&&!ui.healing&&ui.agentPhase<0&&(a.status==='finished'||a.status==='failed')){stopRunWatch();ui.running=false;ui.runName=null;ui.run=null;await load()}}catch{}finally{polling=false}},400)}
async function cancelRun(){const runId=ui.activeRunId;if(!runId||ui.cancelling)return;ui.cancelling=true;render();try{const r=await api('/api/cancel',{runId});toast((r.operation==='heal'?'Heal':r.operation==='draft'?'Draft':'Run')+' settled: '+r.outcome+'; inspect saved records')}catch(e){ui.error=e;render()}}
async function runNow(grep){if(state.compileError){ui.error=state.compileError;render();return}if(ui.running)return;ui.running='Compiling flows and starting the app';render();watchRun();
 ui.error=null;try{const r=await api('/api/test',{grep});ui.runName=r.runDir.split('/').pop();ui.run=r;ui.sel=null;toast(r.outcome==='passed'?'Every scenario held':'Run finished: '+r.totals.passed+' held, '+(r.totals.failed+r.totals.other)+' need a look',r.outcome==='passed'?null:{label:'Heal',run:()=>startHeal(false)})}catch(e){ui.error=e}finally{stopRunWatch();ui.running=false;ui.activeRunId=null;ui.cancelling=false}await load()}
async function prune(file,graft){try{await api('/api/prune',{file,graft});toast(graft?'Grafted back':'Pruned '+file.split('/').pop(),{label:'Undo',run:()=>prune(file,!graft)});ui.sel=null;await load()}catch(e){toast(e.error||'Could not '+(graft?'graft':'prune'))}}

/* ---------- Discover: source, reachability, intent ---------- */
function discoverTab(){const g=state.git;const a=state.agent.settings;const name=a.provider==='claude'?'Claude':a.provider==='codex'?'Codex':null;const available=!!(name&&state.agent.detected[a.provider]);
 const sources=[{v:'',label:'working tree',note:'uncommitted files included'}].concat(g.branches.map(b=>({v:b,label:b,note:b===g.current?'checked out':b===g.base?'base':''})));
 const src=h('section',{class:'side',style:'flex:1 1 260px;max-width:340px'},h('div',{},h('span',{class:'label'},'Source'),h('div',{class:'src',style:'margin-top:10px'},
   (g.isRepo?sources:sources.slice(0,1)).map(s=>h('button',{'aria-pressed':ui.source===s.v?'true':'false',on:{click:()=>{ui.source=s.v;scan()}}},h('span',{class:'dot s '+(ui.source===s.v?'pass':'none')}),h('span',{style:'flex:1;min-width:0;display:flex;flex-direction:column;padding:6px 0'},h('span',{style:'overflow-wrap:anywhere'},s.label),s.note?h('span',{class:'small muted',style:'font-family:var(--sans)'},s.note):null)))),
   g.isRepo?h('p',{class:'small muted'},'A branch shows routes in files it changed against '+(g.base||'the default branch')+' first.'):h('p',{class:'small muted'},'Not a git repo, so only the working tree.')));
 const d=ui.disc;
 const reach=h('section',{class:'grow'},h('div',{class:'rulehead'},h('span',{class:'label'},'Static routes'),h('span',{class:'rule'}),d?h('span',{class:'small muted'},d.routes.length+' recognized routes · '+d.uncovered+' without a flow'+(d.branch&&d.base?' · '+d.changedFiles.length+' files changed':'')):null),
  h('p',{class:'small muted'},'Partial static inventory for FastAPI, Django and Express. Other routes may be missing; this is not execution coverage.'),
  !d?h('p',{class:'row muted'},h('span',{class:'think'},h('i'),h('i'),h('i')),'Scanning routes'):d.routes.length?h('div',{},d.routes.map(r=>routeRow(r))):h('p',{class:'muted'},'No supported routes recognized. Other routing styles, including Next.js, are not scanned.'),
  ui.draft?draftCard():null);
 const intent=h('section',{class:'side',style:'flex:1 1 340px'},h('div',{class:'card'},h('span',{class:'label'},'Intent'),h('h2',{style:'margin:6px 0 4px'},'What should be true after this change?'),
  h('p',{id:'agent-readiness',class:'small muted',style:'margin:0 0 12px'},name?(available?name+' ('+(a.model||'CLI default')+') reads the code, writes flows into tracegrove/discovered/, and tracegrove checks them before you see them.':name+' is not installed. Choose an installed provider in Settings, or None for templates. Executable detection does not establish sign-in.'):'Choose an installed provider in Settings, or use route templates without an agent.'),
  h('textarea',{id:'intent',placeholder:'After Alice revokes a share, Bob can no longer read the note.','aria-label':'Intent'},ui.intent||''),
  h('div',{class:'row',style:'margin-top:12px'},h('button',{class:'btn','aria-describedby':'agent-readiness',disabled:!available||ui.agentPhase>=0,on:{click:agentDraft}},name?'Draft with '+name:'Draft'),h('button',{class:'btn ghost',on:{click:()=>{tab='Settings';render()}}},'Settings')),
  ui.agentPhase>=0?h('div',{class:'fade'},h('p',{class:'row small muted',style:'margin:14px 0 0'},h('span',{class:'think'},h('i'),h('i'),h('i')),name+' is working; tracegrove checks every file it writes'),
   h('div',{class:'log',id:'agent-log','aria-live':'polite'},(ui.live&&ui.live.agent.task==='draft'&&ui.live.agent.lines.length?ui.live.agent.lines:['Waiting for the agent to start']).map(x=>h('div',{},x)))):null,
  ui.agent?agentResult():null));
 return[h('div',{class:'cols'},src,reach,intent)]}
function routeRow(r){const covered=r.coveredBy.length>0;return h('div',{class:'route fade'},h('span',{class:'dot s '+(covered?'pass':'fail'),'aria-hidden':'true'}),
 h('span',{style:'min-width:0'},h('span',{class:'mono small'},r.method+' '+r.path),r.changed?h('span',{class:'pill p-warn',style:'margin-left:8px'},'changed'):null,h('div',{class:'small '+(covered?'muted':'c-fail')},covered?r.coveredBy.join(', '):'no matching flow')),
 h('span',{class:'where mono small muted',style:'overflow-wrap:anywhere'},r.file+':'+r.line),covered?h('span'):h('button',{class:'btn ghost sm',on:{click:()=>draftOne(r)}},'Draft'))}
function draftCard(){const d=ui.draft;return h('div',{class:'card fade',style:'margin-top:16px'},h('span',{class:'label'},'Draft'),h('h2',{class:'mono',style:'font-size:14px;margin:6px 0 12px'},'discovered/'+d.file),h('pre',{},d.yaml),
 h('div',{class:'row',style:'margin-top:12px'},h('button',{class:'btn',on:{click:async()=>{try{const s=await api('/api/draft',{method:d.route.method,path:d.route.path,save:true});ui.draft=null;toast('Saved '+s.saved.split('/').slice(-3).join('/')+'. Fill the TODOs.');await load();scan()}catch(e){toast(e.error||'Could not save')}}}},'Plant it'),h('button',{class:'btn ghost',on:{click:()=>{ui.draft=null;render()}}},'Discard')))}
async function draftOne(r){try{const d=await api('/api/draft',{method:r.method,path:r.path});ui.draft={...d,route:r};render()}catch(e){toast(e.error||'Could not draft')}}
async function scan(){ui.scanning=true;ui.disc=null;ui.draft=null;render();try{ui.disc=await api('/api/discover?branch='+encodeURIComponent(ui.source||''))}catch(e){ui.scanning=false;page(blocked(e));return}ui.scanning=false;if(tab==='Discover')render()}
async function agentDraft(){const box=document.getElementById('intent');if(box)ui.intent=box.value;ui.agent=null;ui.agentPhase=0;ui.live=null;render();watchRun();
 try{ui.agent=await api('/api/agent-draft',{intent:ui.intent||'',branch:ui.source})}catch(e){ui.agent={error:e}}finally{ui.agentPhase=-1;stopRunWatch()}await load();if(ui.disc)scan();
 if(ui.agent&&ui.agent.agent)toast(ui.agent.agent.files.length+' flow file(s) drafted'+(ui.agent.check.ok?' and checked':'; check found issues'))}
function agentResult(){const r=ui.agent;if(r.error)return h('div',{style:'margin-top:16px'},blocked(r.error));const c=r.check;const ok=c.ok&&r.agent.exitCode===0;
 return h('div',{class:'fade',style:'margin-top:16px'},h('div',{class:'row',style:'gap:8px'},h('span',{class:'pill '+(ok?'p-pass':'p-fail')},ok?'checked':'needs fixes'),h('span',{class:'small muted'},r.agent.files.length+' flow file(s) from '+r.agent.provider+(r.agent.model?' · '+r.agent.model:''))),
  r.agent.files.length?h('div',{style:'margin-top:8px'},r.agent.files.map(f=>h('div',{class:'row',style:'justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)'},h('span',{class:'mono small',style:'overflow-wrap:anywhere'},f),h('button',{class:'btn ghost sm',on:{click:()=>prune(f,false)}},'Prune')))):null,
  c.ok?null:c.issues.map(x=>h('p',{class:'small'},h('span',{class:'c-fail'},x.detail),h('br'),h('span',{class:'muted'},'Fix: '+x.action))),
  r.agent.output?h('details',{style:'margin-top:8px'},h('summary',{class:'small muted'},'What the agent said'),h('pre',{style:'margin-top:8px'},r.agent.output)):null,
  ok&&r.agent.files.length?h('button',{class:'btn',style:'margin-top:12px',disabled:!!ui.running,on:{click:()=>{tab='Run';ui.sel=null;render();runNow('discovered')}}},'Run the new scenarios'):null)}

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

/* ---------- Heal: diagnose, repair, prove, undo ---------- */
const KIND={setup:['setup','p-warn'],authoring:['authoring','p-warn'],test_drift:['test drift','p-info'],product_bug:['product bug','p-fail'],assertion:['failing','p-fail'],evidence:['evidence','p-warn'],infrastructure:['infrastructure','p-warn']};
const HEAL_TITLE={cancelled:'Heal cancelled',healthy:'Nothing to heal. Every scenario holds.',healed:'Healed. Every fix was proven by a re-run.',partly_healed:'Partly healed. Some findings still need you.',product_bugs:'Found product bugs. The tests stay red on purpose.',needs_human:'Needs you. Nothing was safe to fix automatically.'};
function diffView(text){return h('div',{class:'diff'},text.split('\n').slice(2).map(l=>h('div',{class:l[0]==='+'?'add':l[0]==='-'?'del':'ctx'},l||' ')))}
function healTab(){const r=ui.heal;const a=state.agent.settings;const name=a.provider==='claude'?'Claude Code':a.provider==='codex'?'Codex':null;const installed=name&&state.agent.detected[a.provider];
 const hero=h('section',{style:'margin-bottom:24px'},h('div',{class:'row',style:'justify-content:space-between;align-items:flex-start'},
  h('div',{style:'max-width:760px'},h('span',{class:'label'},'Self-healing'),h('h1',{style:'margin-top:6px'},ui.healing?'Healing the grove':r?HEAL_TITLE[r.outcome]:'Fix what broke, prove it, keep only what holds.'),
   h('p',{class:'muted',style:'margin:8px 0 0'},'Setup mistakes are fixed in the config. Failing checks go to '+(installed?name+' ('+(a.model||'default')+')':'the agent')+', which must call each one test drift or a product bug. Drift is repaired and re-run; bugs are reported and the test stays red. Inspect the saved diff: agent judgments do not prove intended product behavior. Undo skips files changed afterward.')),
  ui.healing?(ui.activeRunId?h('button',{class:'btn ghost',disabled:ui.cancelling,on:{click:cancelRun}},ui.cancelling?'Waiting for heal to settle':'Cancel heal'):null):h('div',{class:'row'},h('button',{class:'btn ghost',on:{click:()=>startHeal(true)}},'Preview'),h('button',{class:'btn',on:{click:()=>startHeal(false)}},'Heal now'))),
  ui.healing?h('div',{class:'card fade',style:'margin-top:18px'},h('p',{class:'row',style:'margin:0'},h('span',{class:'think'},h('i'),h('i'),h('i')),h('span',{id:'heal-phase',role:'status','aria-live':'polite'},ui.live&&ui.live.heal.status==='running'?ui.live.heal.phase+(ui.live.heal.detail?' · '+ui.live.heal.detail:''):'Starting')),
   h('div',{class:'log',id:'agent-log','aria-label':'What the agent is doing'},(ui.live&&ui.live.agent.task==='heal'&&ui.live.agent.lines.length?ui.live.agent.lines:['The agent joins only if a check fails after setup is sound']).map(x=>h('div',{},x)))):null,
  !installed&&!ui.healing?h('p',{class:'small muted'},'No agent available: setup fixes still run. ',h('button',{class:'btn ghost sm',on:{click:()=>{tab='Settings';render()}}},'Choose an agent')):null,
  ui.healError?h('div',{style:'margin-top:16px'},blocked(ui.healError)):null);
 if(!r||ui.healing)return[hero,pastHeals()];
 const kept=r.changes.filter(c=>c.status==='kept');const other=r.changes.filter(c=>c.status!=='kept');const b=r.before.totals,af=r.after.totals;
 const findings=h('section',{class:'grow'},h('div',{class:'rulehead'},h('span',{class:'label'},'Findings'),h('span',{class:'rule'}),h('span',{class:'small muted'},r.findings.length+' · '+r.id)),
  r.findings.length?h('div',{style:'display:flex;flex-direction:column;gap:8px'},r.findings.map(f=>{const k=KIND[f.kind]||[f.kind,'p-none'];return h('div',{class:'finding fade'},
   h('div',{class:'row',style:'gap:8px'},h('span',{class:'pill '+(f.status==='fixed'?'p-pass':k[1])},f.status==='fixed'?'fixed':k[0]),h('span',{class:'mono small'},f.caseId||f.file||'project'),f.step?h('span',{class:'small muted'},'· '+f.step):null),
   h('span',{},f.detail.split('\n')[0]),h('span',{class:'small muted'},f.status==='fixed'?'Fixed and verified.':f.fix),
   f.caseId?h('div',{class:'row'},h('button',{class:'btn ghost sm',on:{click:()=>{tab='Run';ui.sel=f.caseId;ui.step=null;render()}}},'Open scenario')):null)})):h('p',{class:'muted'},'Nothing to fix.'));
 const changes=h('div',{class:'side'},h('section',{class:'card'},h('div',{class:'rulehead'},h('h2',{},'Kept changes'),h('span',{class:'rule'}),kept.length?h('button',{class:'btn ghost sm',on:{click:()=>undoHeal(r.id)}},'Undo all'):null),
   kept.length?kept.map(c=>h('div',{style:'margin-top:10px'},h('div',{class:'row',style:'gap:8px'},h('span',{class:'pill p-pass'},c.by),h('span',{class:'mono small',style:'overflow-wrap:anywhere'},c.file)),h('div',{class:'small muted',style:'margin-top:4px'},c.reason+(c.note?' · '+c.note:'')),diffView(c.diff))):h('p',{class:'muted small'},'No file was changed.'),
   b&&af?h('p',{class:'small muted',style:'margin-top:14px'},'Before: '+b.passed+' passed, '+b.failed+' failed, '+b.other+' other. After: '+af.passed+' passed, '+af.failed+' failed, '+af.other+' other.'):null),
  other.length?h('details',{class:'card'},h('summary',{class:'small'},other.length+' tried and not kept'),other.map(c=>h('div',{style:'margin-top:10px'},h('div',{class:'row',style:'gap:8px'},h('span',{class:'pill p-none'},c.status),h('span',{class:'mono small'},c.file)),h('div',{class:'small muted'},c.note||c.reason),diffView(c.diff)))):null,
  r.agent?h('details',{class:'card'},h('summary',{class:'small'},'What '+r.agent.provider+(r.agent.model?' ('+r.agent.model+')':'')+' concluded'),r.agent.verdicts.map(v=>h('p',{class:'small'},h('b',{class:'mono',style:'font-weight:500'},v.caseId),': '+v.verdict.replace('_',' ')+'. '+v.reason)),r.agent.summary?h('pre',{style:'margin-top:8px'},r.agent.summary):null):null,
  r.next.length?h('section',{class:'card'},h('span',{class:'label'},'Next'),r.next.map(n=>h('div',{style:'margin-top:8px'},h('code',{class:'small'},n.command),h('div',{class:'small muted'},n.why)))):null);
 return[hero,h('div',{class:'cols'},findings,changes),pastHeals()]}
function pastHeals(){const list=ui.heals.filter(x=>!ui.heal||x.id!==ui.heal.id);if(!list.length)return null;
 return h('section',{style:'margin-top:28px'},h('div',{class:'rulehead'},h('span',{class:'label'},'Earlier heals'),h('span',{class:'rule'})),
  list.slice(0,8).map(x=>h('div',{class:'route'},h('span',{class:'dot s '+(x.outcome==='healed'||x.outcome==='healthy'?'pass':x.outcome==='product_bugs'?'fail':'warn')}),h('span',{},HEAL_TITLE[x.outcome]),h('span',{class:'where mono small muted'},x.id),h('button',{class:'btn ghost sm',on:{click:()=>{ui.heal=x;render()}}},'Open'))))}
async function startHeal(dryRun){if(ui.healing||ui.running)return;tab='Heal';ui.healing=true;ui.healError=null;ui.running='Healing';ui.live=null;render();watchRun();
 try{ui.heal=await api('/api/heal',{dryRun});const kept=ui.heal.changes.filter(c=>c.status==='kept').length;
  const bugs=ui.heal.findings.filter(f=>f.kind==='product_bug').length;
  toast(dryRun?'Preview ready: nothing was changed':(kept?kept+' verified fix'+(kept===1?'':'es')+' kept':'No file changed')+(bugs?'; '+bugs+' product bug'+(bugs===1?'':'s')+' reported':''),kept&&!dryRun?{label:'Undo',run:()=>undoHeal(ui.heal.id)}:null)}
 catch(e){ui.healError=e}finally{ui.healing=false;ui.running=false;stopRunWatch()}ui.runName=null;ui.run=null;await load()}
async function undoHeal(id){try{const r=await api('/api/heal/undo',{id});toast(r.restored.length?'Restored '+r.restored.join(', '):r.skipped.length?r.skipped[0].file+': '+r.skipped[0].why:'Nothing to restore');ui.runName=null;ui.run=null;await load()}catch(e){toast(e.reasons?e.reasons[0].detail:e.error||'Could not undo')}}

/* ---------- Command palette and keyboard ---------- */
function commands(){const list=[];const add=(grp,label,run,hint)=>list.push({grp,label,run,hint:hint||''});
 add('Run','Run all scenarios',()=>{tab='Run';render();runNow('')},'R');
 if(ui.sel)add('Run','Rerun '+ui.sel,()=>{tab='Run';render();runNow(ui.sel)},'r');
 add('Heal','Heal now',()=>startHeal(false),'h');add('Heal','Preview a heal (changes nothing)',()=>startHeal(true));
 if(ui.heal&&ui.heal.changes.some(c=>c.status==='kept'))add('Heal','Undo heal '+ui.heal.id,()=>undoHeal(ui.heal.id));
 if(state&&state.agent.settings.provider!=='none')add('Agent','Draft flows for uncovered routes',()=>{tab='Discover';render();agentDraft()});
 for(const t of TABS)add('Go','Open '+t,()=>{tab=t;render()},String(TABS.indexOf(t)+1));
 for(const f of (state?state.flows:[]))add('Scenario',f.caseId,()=>{tab='Run';ui.sel=f.caseId;ui.step=null;render()},f.title);
 if(state&&state.git.isRepo)for(const b of state.git.branches)add('Branch','Discover on '+b,()=>{tab='Discover';ui.source=b;render();scan()});
 for(const f of (state?state.flows:[]))add('Prune','Prune '+f.caseId,()=>prune(f.file,false));
 add('Help','Keyboard shortcuts',shortcuts,'?');return list}
function fuzzy(q,text){q=q.toLowerCase();text=text.toLowerCase();if(!q)return 1;if(text.includes(q))return 3-text.indexOf(q)/1000;let i=0;for(const ch of text)if(ch===q[i])i++;return i===q.length?1:0}
let palette=null;
function closeOverlay(){if(palette){palette.remove();palette=null}}
function openPalette(){closeOverlay();const all=commands();let sel=0;let shown=all;
 const input=h('input',{type:'text',placeholder:'Type a command, a scenario or a branch','aria-label':'Command',role:'combobox','aria-expanded':'true','aria-controls':'pal-list',autocomplete:'off'});
 const list=h('ul',{id:'pal-list',role:'listbox'});
 const draw=()=>{list.replaceChildren(...shown.slice(0,60).map((c,i)=>h('li',{role:'option','aria-selected':i===sel?'true':'false',on:{mousemove:()=>{if(sel!==i){sel=i;draw()}},click:()=>pick(i)}},h('span',{class:'grp'},c.grp),h('span',{},c.label),c.hint?h('span',{class:'hint'},c.hint):null)));const on=list.children[sel];if(on)on.scrollIntoView({block:'nearest'})};
 const pick=i=>{const c=shown[i];closeOverlay();if(c)c.run()};
 input.addEventListener('input',()=>{const q=input.value.trim();shown=all.map(c=>({c,s:Math.max(fuzzy(q,c.label),fuzzy(q,c.grp+' '+c.label)*.9)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).map(x=>x.c);sel=0;draw()});
 input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(sel+1,shown.length-1);draw()}else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(sel-1,0);draw()}else if(e.key==='Enter'){e.preventDefault();pick(sel)}else if(e.key==='Escape'){closeOverlay()}});
 palette=h('div',{class:'pal-back',on:{click:e=>{if(e.target===palette)closeOverlay()}}},h('div',{class:'pal fade',role:'dialog','aria-modal':'true','aria-label':'Command palette'},input,list,
  h('div',{class:'foot'},h('span',{},h('kbd',{},'↑↓'),' move'),h('span',{},h('kbd',{},'↵'),' run'),h('span',{},h('kbd',{},'esc'),' close'),h('span',{},h('kbd',{},'?'),' shortcuts'))));
 document.body.append(palette);draw();input.focus()}
function shortcuts(){closeOverlay();const keys=[['⌘K / Ctrl K','command palette'],['j / k','next / previous scenario'],['↵','open the selected scenario'],['r','rerun the selected scenario'],['R','run all'],['h','heal'],['1 to 5','switch tab'],['?','this list'],['esc','close']];
 palette=h('div',{class:'pal-back',on:{click:e=>{if(e.target===palette)closeOverlay()}}},h('div',{class:'pal fade card',role:'dialog','aria-modal':'true','aria-label':'Keyboard shortcuts',style:'padding:20px'},h('h2',{},'Keyboard'),
  h('div',{class:'keys'},keys.flatMap(([k,v])=>[h('kbd',{},k),h('span',{class:'small'},v)]))));document.body.append(palette)}
function moveSel(d){if(tab!=='Run'||!state)return;const sc=scenarios();if(!sc.length)return;const i=sc.findIndex(s=>s.id===ui.sel);const n=sc[Math.max(0,Math.min(sc.length-1,(i<0?0:i+d)))];ui.sel=n.id;ui.step=Math.max(0,n.steps.findIndex(x=>x.result==='fail'));render();
 const el=document.querySelector('[data-case="'+CSS.escape(n.id)+'"]');if(el){el.focus({preventScroll:true});el.scrollIntoView({block:'nearest'})}}
document.addEventListener('keydown',e=>{const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement&&document.activeElement.tagName||'');
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();palette?closeOverlay():openPalette();return}
 if(e.key==='Escape'&&palette){closeOverlay();return}
 if(typing||palette||e.metaKey||e.ctrlKey||e.altKey)return;
 if(e.key==='/'){e.preventDefault();openPalette()}else if(e.key==='?'){shortcuts()}else if(e.key==='j'){moveSel(1)}else if(e.key==='k'){moveSel(-1)}
 else if(e.key==='r'&&ui.sel&&!ui.running){tab='Run';runNow(ui.sel)}else if(e.key==='R'&&!ui.running){tab='Run';runNow('')}else if(e.key==='h'&&!ui.running){startHeal(false)}
 else if(/^[1-5]$/.test(e.key)){tab=TABS[Number(e.key)-1];render()}});
document.getElementById('palbtn').addEventListener('click',openPalette);

function render(){header();if(!state)return;const views={Run:runTab,Discover:discoverTab,Heal:healTab,History:historyTab,Settings:settingsTab};page(views[tab]());if(tab==='Discover'&&!ui.disc&&!ui.scanning)scan()}
load().catch(e=>page(blocked(e)));
</script></body></html>`;
