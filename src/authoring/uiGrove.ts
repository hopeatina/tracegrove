/**
 * The Discover tab's live view of `tracegrove grow`: the change grows as a bonsai while events arrive
 * (see uiBonsai.ts: a branch per end-to-end journey, a leaf per scenario, files as knots, dependencies
 * as roots), with the choice of how much to prove right above it, an outline of the parts, an inspector
 * for a journey, a scenario or a part, the spec mapped both ways, the journeys with their scenarios'
 * mock and real lanes, and everything an agent wrote with its proof state.
 * The page renders the server's folded state; it never invents progress.
 */
import { DEPTH_STEPS, LAYER_LABEL, MODES, PHASES, PHASE_SHORT, EXTENSION_STATE } from './growState.ts';
import { BONSAI_CSS, BONSAI_JS } from './uiBonsai.ts';

const CONST = JSON.stringify({ phases: PHASES, short: PHASE_SHORT, steps: DEPTH_STEPS, modes: MODES, layers: LAYER_LABEL, ext: EXTENSION_STATE }).replaceAll('<', '\\u003c');

export const GROVE_CSS = String.raw`
.gw{margin-bottom:28px}
.gw-start{display:grid;gap:14px}
.gw-start .opts{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center}
.gw-start label{display:inline-flex;gap:8px;align-items:center;font-size:14px;color:var(--ink2)}
.gw-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 24px;align-items:flex-end;margin-bottom:14px}
.gw-head h2{margin:4px 0 0;font:400 24px/30px var(--serif);letter-spacing:-.01em;max-width:none}
.gw-head .sub{font:13px/20px var(--mono);color:var(--ink3);overflow-wrap:anywhere}
.gw-clock{font:500 13px/18px var(--mono);color:var(--muted)}
.gw-rail{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-bottom:18px}
.gw-rail .ph{border-top:3px solid var(--line);padding-top:6px;min-width:0}
.gw-rail .ph b{display:block;font:500 12.5px/16px var(--sans);color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gw-rail .ph span{font:11.5px/16px var(--mono);color:var(--muted)}
.gw-rail .ph.done{border-color:var(--moss)}.gw-rail .ph.done b{color:var(--ink2)}
.gw-rail .ph.on{border-color:var(--gold)}.gw-rail .ph.on b{color:var(--ink)}
.gw-rail.quiet{gap:4px;margin-bottom:14px}.gw-rail.quiet .ph{border-top-width:2px;padding-top:4px}.gw-rail.quiet .ph b{font-size:11.5px;color:var(--muted)}.gw-rail.quiet .ph span{font-size:11px}
.gw-stage{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:0 18px;align-items:start}
@media (max-width:1060px){.gw-stage{grid-template-columns:minmax(0,1fr)}}
.gw-tree{padding:14px 12px 8px;min-width:0}
.gw-tree .gw-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center;margin:0 4px 6px}
.gw-tree .seg2{display:inline-flex;border:1px solid var(--line2);border-radius:8px;overflow:hidden}
.gw-tree .seg2 button{border:0;background:var(--paper);min-height:32px;padding:0 12px;font-size:13px;color:var(--ink3)}
.gw-tree .seg2 button[aria-pressed=true]{background:var(--sel);color:var(--ink);font-weight:500}
.gw-ol{width:100%;border-collapse:collapse;font-size:13px}
.gw-ol th{font:500 11px/16px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
.gw-ol td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
.gw-ol tr.u{cursor:pointer}.gw-ol tr.u:hover td,.gw-ol tr.u.sel td{background:var(--sel)}
.gw-ol tr.grp td{font:500 11px/16px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding-top:14px}
.gw-ol .nm{font:500 13px/18px var(--mono);color:var(--ink);overflow-wrap:anywhere}.gw-ol .loc{font:11.5px/16px var(--mono);color:var(--muted);overflow-wrap:anywhere}
.gw-pips{display:inline-flex;gap:3px;vertical-align:middle}.gw-pips i{width:9px;height:9px;border-radius:50%;border:1.5px solid var(--line2);background:var(--line)}
.gw-pips i.ok{background:var(--moss);border-color:var(--moss)}.gw-pips i.none{background:var(--paper);border-color:var(--moss)}.gw-pips i.stop{background:var(--verm);border-color:var(--verm)}
.gw-mini{display:inline-flex;gap:3px;flex-wrap:wrap}.gw-mini i{width:8px;height:8px;border-radius:2px 8px;background:var(--moss-bg);border:1px solid var(--moss)}
.gw-mini i.pass{background:var(--moss)}.gw-mini i.fail{background:var(--verm);border-color:var(--verm)}.gw-mini i.out{background:none;border-color:var(--line2)}.gw-mini i.run{background:var(--gold);border-color:var(--gold)}.gw-mini i.not_run,.gw-mini i.none{background:var(--paper);border-style:dashed}
.gw-chip{display:inline-flex;align-items:center;min-height:20px;padding:0 7px;border-radius:5px;font:500 11.5px/16px var(--mono);background:var(--sel);color:var(--ink2);border:1px solid transparent}
.gw-chip.built{background:var(--moss-bg);color:var(--moss)}.gw-chip.indirect{background:var(--gold-bg);color:var(--gold)}.gw-chip.missing{background:none;color:var(--ink3);border:1px dashed var(--line2)}
.gw-chip.agent{background:var(--gold-bg);color:var(--gold);border-color:var(--gold)}.gw-chip.min{background:var(--forest);color:var(--on-forest)}
.gw-chips{display:flex;flex-wrap:wrap;gap:4px}
.gw-eyebrow{display:block;font:500 11px/16px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.gw-ins{padding:6px 4px 4px 0;min-width:0}
@media (max-width:1060px){.gw-ins{padding:14px 4px 4px;border-top:1px solid var(--line);margin-top:8px}}
.gw-ins .who{font:12px/16px var(--mono);color:var(--muted)}.gw-ins h3{margin:2px 0;font:500 16px/22px var(--mono);overflow-wrap:anywhere}.gw-ins .where{font:12px/18px var(--mono);color:var(--ink3);overflow-wrap:anywhere}
.gw-ins .sec{margin-top:14px}
.gw-dp{display:grid;grid-template-columns:18px minmax(0,1fr);gap:2px 8px;padding:5px 0;border-bottom:1px solid var(--line)}
.gw-dp:last-child{border:0}.gw-dp .m{font:600 13px/20px var(--mono);text-align:center}.gw-dp.ok .m,.gw-dp.none .m{color:var(--moss)}.gw-dp.stop .m{color:var(--verm)}.gw-dp.wait .m{color:var(--line2)}
.gw-dp .n{font-size:13px;line-height:20px;min-width:0}.gw-dp small{display:block;font:11.5px/16px var(--mono);color:var(--ink3);overflow-wrap:anywhere}
.gw-dp .by{font:10.5px/14px var(--mono);color:var(--gold);margin-left:6px}
.gw-lay{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 10px;align-items:start;font-size:13px}.gw-lay small{display:block;font:11px/15px var(--mono);color:var(--muted)}
.gw-strip{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}
.gw-cc{display:inline-flex;align-items:center;gap:7px;min-height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);font:500 12.5px/16px var(--mono);color:var(--ink2)}
.gw-cc i{width:8px;height:8px;border-radius:50%;background:var(--line2)}.gw-cc i.pass{background:var(--moss)}.gw-cc i.warn,.gw-cc i.run{background:var(--gold)}.gw-cc i.fail,.gw-cc i.miss{background:var(--verm)}.gw-cc i.cov,.gw-cc i.code{background:var(--indigo)}.gw-cc i.open{background:var(--paper);border:1.5px solid var(--muted)}
.gw-cc:hover{border-color:var(--line2)}.gw-cc[aria-pressed=true]{border-color:var(--ink);background:var(--sel);color:var(--ink)}
.gw-cdet{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:8px;align-items:start;padding:10px 6px 6px;font-size:13px;line-height:19px}
.gw-cdet .id{font:600 12px/19px var(--mono);color:var(--ink3)}.gw-cdet small{display:block;color:var(--muted);font-size:12px}
.gw-badge{display:inline-flex;align-items:center;white-space:nowrap;min-height:20px;padding:0 7px;border-radius:5px;font:500 11.5px/16px var(--mono);background:var(--sel);color:var(--ink3)}
.gw-badge.pass{background:var(--moss-bg);color:var(--moss)}.gw-badge.fail,.gw-badge.miss{background:var(--verm-bg);color:var(--verm-ink)}.gw-badge.warn{background:var(--gold-bg);color:var(--gold)}
.gw-badge.run{background:var(--gold-bg);color:var(--gold)}.gw-badge.nf{background:none;border:1px dashed var(--line2)}.gw-badge.code,.gw-badge.cov{background:var(--indigo-bg);color:var(--indigo)}
.gw-flag{display:grid;gap:2px;padding:9px 10px;border-radius:8px;background:var(--gold-bg);font-size:13px;line-height:19px;margin-top:8px}.gw-flag b{font-weight:500;color:var(--ink)}.gw-flag span{color:var(--ink2)}
.gw-flag.red{background:var(--verm-bg)}
.gw-notes summary{cursor:pointer;list-style:none;font-size:13px;color:var(--ink3);padding:6px 0;margin-top:4px}.gw-notes summary::-webkit-details-marker{display:none}.gw-notes summary::before{content:'▸ ';color:var(--muted)}.gw-notes[open] summary::before{content:'▾ '}
.gw-agents{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
.gw-ag{display:grid;gap:1px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);min-width:0;flex:1 1 220px;max-width:100%}
.gw-ag b{font:500 12.5px/18px var(--mono);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gw-ag span{font:11.5px/16px var(--mono);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gw-ag.live{border-color:var(--gold)}.gw-ag.live b::before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gold);margin-right:7px;animation:pulse 1.1s ease-in-out infinite}
.gw-ag.bad{border-color:var(--verm)}
.gw-agline{font:12px/18px var(--mono);color:var(--muted);margin:-8px 0 14px}
.gw-modes{display:flex;flex-wrap:wrap;gap:8px}
.gw-modes button{flex:1 1 180px;text-align:left;padding:10px 12px;border-radius:10px;border:1px solid var(--line2);background:var(--paper);display:grid;gap:2px}
.gw-modes button b{font-weight:500;font-size:14px}.gw-modes button span{font-size:12.5px;line-height:17px;color:var(--ink3)}
.gw-modes button[aria-pressed=true]{border-color:var(--forest);box-shadow:inset 0 0 0 1px var(--forest)}
.gw-modes.ask button{border-color:var(--gold)}
.gw-modes.set{gap:6px}.gw-modes.set button{flex:0 1 auto;padding:4px 10px;min-height:28px;border-color:var(--line);display:inline-flex;gap:6px;align-items:center}.gw-modes.set button b{font-size:12.5px}.gw-modes.set button span{display:none}
.gw-modes.set button[aria-pressed=true]{border-color:var(--forest);box-shadow:none;background:var(--sel)}
.gw-sgroup{border-bottom:1px solid var(--line)}.gw-sgroup:last-child{border-bottom:0}
.gw-sgroup>summary{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 4px;cursor:pointer;list-style:none}.gw-sgroup>summary::-webkit-details-marker{display:none}
.gw-sgroup>summary:hover{background:var(--sel)}.gw-sgroup>summary .n{font:500 13px/18px var(--mono);color:var(--ink);flex:1;min-width:0;overflow-wrap:anywhere}.gw-sgroup>summary .c{font:11.5px/16px var(--mono);color:var(--muted);white-space:nowrap}
.gw-sgroup>summary .car{width:14px;color:var(--muted);font-size:11px;flex:none}.gw-sgroup[open]>summary .car{transform:rotate(90deg)}
.gw-sgroup .list{padding:0 0 8px 24px}
.gw-sc{border-bottom:1px solid var(--line)}.gw-sc:last-child{border-bottom:0}
.gw-sc summary{display:flex;align-items:center;gap:10px;min-height:40px;padding:6px 4px;cursor:pointer;list-style:none}.gw-sc summary::-webkit-details-marker{display:none}
.gw-sc summary:hover,.gw-sc.hl>summary{background:var(--sel)}.gw-sc .t{flex:1;min-width:0}.gw-sc .body{display:grid;gap:6px;padding:2px 4px 12px 30px}
.gw-dot{flex:none;width:9px;height:9px;border-radius:2px 9px;background:var(--moss-bg);border:1.5px solid var(--moss)}.gw-dot.pass{background:var(--moss)}.gw-dot.fail{background:var(--verm);border-color:var(--verm)}.gw-dot.run{background:var(--gold);border-color:var(--gold)}
.gw-kind{flex:none;width:44px;font:11px/16px var(--mono);color:var(--muted)}
.gw-sc .t{font-size:14px;line-height:20px}
.gw-sc .p{font-size:13px;line-height:19px;color:var(--ink3)}.gw-sc .err{font:12px/17px var(--mono);color:var(--verm-ink);background:var(--verm-bg);padding:6px 8px;border-radius:6px;overflow-wrap:anywhere}
.gw-lanes{display:grid;gap:4px;margin-top:2px}.gw-ln{display:grid;grid-template-columns:118px auto minmax(0,1fr);gap:8px;align-items:center;font-size:12px}.gw-ln .note{color:var(--muted);line-height:16px}
.gw-xi{display:grid;gap:3px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px;line-height:19px}.gw-xi:last-child{border:0}
.gw-xi .hd{display:flex;justify-content:space-between;gap:8px}.gw-xi .k{font:500 11px/16px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
.gw-xi .path{font:11.5px/16px var(--mono);color:var(--muted);overflow-wrap:anywhere}.gw-xi .need{color:var(--ink2)}
.gw-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start;margin-top:18px}
@media (max-width:1060px){.gw-two{grid-template-columns:minmax(0,1fr)}}
.gw-result{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 24px;align-items:center;padding:16px 20px;border-radius:12px;background:var(--forest);color:var(--on-forest);margin:0 0 18px}
.gw-result .big{font:400 22px/28px var(--serif)}.gw-result .sub{font-size:13px;line-height:19px;opacity:.85;max-width:760px}
.gw-result.bad{background:var(--verm-bg);color:var(--ink)}
.gw-result .btn.ghost{background:transparent;color:inherit;border-color:currentColor;opacity:.9}
.gw-empty{font-size:13px;color:var(--muted);margin:6px 0}
@media (max-width:760px){.gw-head>div:last-child{text-align:left!important;display:flex;gap:12px;align-items:center}}
@media (max-width:640px){.gw-ol thead{display:none}.gw-ol tr.u{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 12px;padding:10px 8px;border-bottom:1px solid var(--line)}.gw-ol tr.u td{padding:0;border:0;background:none!important}.gw-ol tr.u.sel,.gw-ol tr.u:hover{background:var(--sel)}.gw-ol tr.u td:first-child{grid-column:1/-1}.gw-ol tr.grp td{display:block}.gw-ol .gw-chip{white-space:nowrap}.gw-rail{grid-template-columns:repeat(3,minmax(0,1fr))}.gw-ln{grid-template-columns:1fr}.gw-head h2{font-size:20px;line-height:26px}.gw-sgroup .list{padding-left:8px}}
@media (prefers-reduced-motion:reduce){.gw-ag.live b::before{animation:none}}
${BONSAI_CSS}`;

export const GROVE_JS = String.raw`
/* ---------- Grow: the change's tree, live ---------- */
const GW=${CONST};
const gw={el:null,svg:null,B:null,M:null,seen:new Set(),state:null,view:null,events:0,id:null,busy:false,error:null,log:null,tree:'grove',pinned:null,hov:null,preview:null,selCrit:null,onlyGaps:false,base:'',prove:true,agent:true,t0:0,raf:0};
try{const v=localStorage.getItem('gw-tree');if(v==='outline'||v==='grove')gw.tree=v}catch(e){}
function growPanel(){if(!gw.el)gw.el=h('section',{class:'gw','aria-label':'Grow this change','data-testid':'grow'});
 const branch=ui.source||state.git.current||'';if(!gw.busy&&!gw.state&&state.git.isRepo&&branch&&gw.lastFor!==branch){gw.lastFor=branch;growLast(branch)}
 growPaint();return gw.el}
/* A saved grow of this branch comes back on reload, marked as saved, instead of an empty start card. */
async function growLast(branch){try{const r=await fetch('/api/grow/last?branch='+encodeURIComponent(branch));const d=r.ok?await r.json():null;
 if(d&&!gw.busy&&!gw.state){gw.state=d.state;gw.view=d.view;gw.log=d.log;gw.saved=d.at;growPaint()}}catch(e){}}
async function growStart(){
 if(gw.busy)return;gw.busy=true;gw.saved=null;gw.error=null;gw.state=null;gw.view=null;gw.events=0;gw.id=null;gw.log=null;gw.pinned=null;gw.hov=null;gw.selCrit=null;gw.svg=null;gw.B=null;gw.seen=new Set();gw.t0=Date.now();growPaint();growTick();
 try{
  const r=await fetch('/api/grow',{method:'POST',headers:{'content-type':'application/json','x-tracegrove-token':TOKEN},body:JSON.stringify({branch:ui.source||null,base:gw.base||null,prove:gw.prove,agent:gw.agent})});
  if(!r.ok){gw.error=await r.json().catch(()=>({error:'Could not start'}));return}
  const reader=r.body.getReader();const dec=new TextDecoder();let buf='';
  for(;;){const {value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
   while((i=buf.indexOf('\n\n'))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);let ev='message',data='';for(const line of block.split('\n')){if(line.startsWith('event: '))ev=line.slice(7);else if(line.startsWith('data: '))data+=line.slice(6)}
    let d=null;try{d=JSON.parse(data)}catch(e){continue}
    if(ev==='session')gw.id=d.id;else if(ev==='event')gw.events++;else if(ev==='state'){gw.state=d.state;gw.view=d.view;growPaint()}else if(ev==='done')gw.log=d.log;else if(ev==='failed')gw.error=d}}
 }catch(e){gw.error={error:String(e&&e.message||e)}}
 finally{gw.busy=false;growPaint()}}
async function growPick(mode){if(!gw.id)return;try{await api('/api/grow/mode',{id:gw.id,mode})}catch(e){toast(e.error||'Could not choose')}}
function growTick(){cancelAnimationFrame(gw.raf);const step=now=>{gbCursors(now);if(gw.busy||(gw.state&&!gw.state.done))gw.raf=requestAnimationFrame(step)};gw.raf=requestAnimationFrame(step)}
const gwFmt=ms=>{const s=Math.max(0,ms)/1000;const m=Math.floor(s/60);return String(m).padStart(2,'0')+':'+(s%60).toFixed(1).padStart(4,'0')};
const gwUnit=id=>gw.state.units.find(u=>u.id===id);
const gwScen=id=>gw.state.scenarios.find(s=>s.id===id);
const gwRank={min:0,std:1,max:2};
const gwIn=s=>gwRank[s.mode]<=gwRank[gw.state.mode];
const gwAt=(a,now)=>a.unit||(a.units.length?a.units[Math.floor(now/1600)%a.units.length]:null);
/* The part the outline highlights: a pinned part, else the one being traced. */
const gwSel=()=>gw.pinned?(gw.pinned.startsWith('u:')?gw.pinned.slice(2):/^[js]:/.test(gw.pinned)?null:gw.pinned):gw.state.focus;
const gwPut=(el,...k)=>{for(const x of k.flat(Infinity))if(x!==null&&x!==undefined&&x!==false)el.append(x)};
const gwDur=ms=>ms<1000?Math.round(ms)+' ms':(ms/1000).toFixed(1)+' s';
const gwCut=(t,n)=>t.length>n?t.slice(0,n-1)+'…':t;
const gwQuiet=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
function gwOutline(){const s=gw.state,v=gw.view,sel=gwSel();
 const row=u=>{if(gw.onlyGaps&&!v.gaps[u.id])return null;const d=v.depth[u.id]||{pips:[],score:0};
  const crit=v.criteria.filter(c=>c.units.includes(u.id)).map(c=>c.id);const drift=s.drift.some(x=>x.unit===u.id);
  const lv=s.scenarios.filter(x=>x.unit===u.id).map(x=>{const r=s.run[x.id];return h('i',{class:!gwIn(x)?'out':r?r.st:'',title:x.title})});
  return h('tr',{class:'u'+(sel===u.id?' sel':''),tabindex:0,'data-unit':u.id,on:{click:()=>{gw.pinned=u.id;growPaint()},keydown:e=>{if(e.key==='Enter'){gw.pinned=u.id;growPaint()}}}},
   h('td',{},h('div',{class:'nm'},(s.units.indexOf(u)+1)+' '+u.label),h('div',{class:'loc'},u.unitKind+' · '+u.loc)),
   h('td',{},h('span',{class:'gw-pips','aria-label':d.score+' of 5 checked'},d.pips.map(p=>h('i',{class:p}))),h('div',{class:'loc'},d.pips.filter(p=>p==='ok').length+' found · '+d.score+'/5')),
   h('td',{},h('div',{class:'gw-chips'},(s.cells[u.id]||[]).map(c=>h('span',{class:'gw-chip '+c.status,title:c.reason},GW.layers[c.layer])))),
   h('td',{class:'loc'},crit.length?crit.join(' '):drift?h('span',{class:'gw-chip indirect'},'not in spec'):'—'),
   h('td',{},h('span',{class:'gw-mini'},lv)))};
 const br=s.units.filter(u=>!u.root).map(row).filter(Boolean),rt=s.units.filter(u=>u.root).map(row).filter(Boolean);
 return h('div',{class:'scroll'},h('table',{class:'gw-ol','data-testid':'grow-outline'},h('thead',{},h('tr',{},['Part','Depth','Layers','Spec','Scenarios'].map(t=>h('th',{},t)))),
  h('tbody',{},!br.length&&!rt.length?h('tr',{},h('td',{colspan:5,class:'gw-empty'},gw.onlyGaps?'No gaps.':'Parts appear here as they are found.')):null,
   br.length?[h('tr',{class:'grp'},h('td',{colspan:5},'Branches · what people use')),...br]:null,rt.length?[h('tr',{class:'grp'},h('td',{colspan:5},'Roots · what it depends on')),...rt]:null)))}
/* The inspector: whatever is pinned (a journey, a scenario or a part); otherwise the part being traced while it runs,
   and once it is done the first failing journey, else the headline one. */
function gwInspector(){const s=gw.state,v=gw.view;const M=gw.M||gbModel();
 const card=h('aside',{class:'gw-ins','aria-label':'Inspector','data-testid':'grow-inspector'});
 let pin=gw.pinned,who='Pinned';
 if(!pin){if(!s.done&&s.focus){pin='u:'+s.focus;const ag=s.agents.find(a=>!a.done&&a.unit===s.focus);who='Following '+(ag?(ag.by==='rules'?'the rules':ag.by)+' · '+ag.brief:'the latest event')}
  else if(M.J.length){const order=gw.order&&gw.order.length?gw.order:M.J.map(j=>j.id);const failing=order.find(id=>(M.leaves[id]||[]).some(x=>s.run[x.id]&&s.run[x.id].st==='fail'));pin='j:'+(failing||order[0]);who=failing?'The first failing journey':'The headline journey'}}
 if(!pin){gwPut(card,h('span',{class:'gw-eyebrow'},'Inspector'),h('p',{class:'gw-empty'},'Follows the tracer as it works. Select a journey, a leaf or a knot to pin it.'));return card}
 const head=h('div',{class:'row',style:'justify-content:space-between'},h('span',{class:'who'},who),gw.pinned?h('button',{class:'btn ghost sm',on:{click:()=>{gw.pinned=null;growPaint()}}},s.done?'Unpin':'Follow'):null);
 if(pin.startsWith('j:')){gwPut(card,head,gbJourneyCard(pin.slice(2)));return card}
 if(pin.startsWith('s:')){gwPut(card,head,gbScenarioCard(pin.slice(2)));return card}
 const id=pin.startsWith('u:')?pin.slice(2):pin;const u=gwUnit(id);if(!u)return card;const d=s.depth[id]||{};const dp=v.depth[id]||{pips:[],score:0};
 const on=M.J.filter(j=>j.units.includes(id));const own=s.scenarios.filter(x=>x.unit===id&&!M.J.some(j=>(M.leaves[j.id]||[]).includes(x)));
 gwPut(card,head,h('h3',{},u.label),h('div',{class:'where'},(u.root?'what it depends on':'part')+' · '+u.unitKind+' · '+u.loc),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},on.length?'On '+on.length+' journey'+(on.length===1?'':'s'):'On no journey'),
   on.length?on.map(j=>h('button',{class:'gb-row',on:{click:()=>{gw.pinned='j:'+j.id;growPaint()}}},h('span',{},j.title),h('span',{class:'small muted'},(M.leaves[j.id]||[]).filter(gwIn).length+' scenarios'))):h('p',{class:'small muted',style:'margin:0'},'Changed, but nothing in this change reaches it. Max checks it on its own.')),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'How deep it went'),h('div',{class:'row',style:'gap:10px;margin-bottom:6px'},h('span',{class:'gw-pips'},dp.pips.map(p=>h('i',{class:p}))),h('b',{style:'font-weight:500;font-size:13px'},dp.score+' of 5 checked · '+dp.pips.filter(p=>p==='ok').length+' found'),dp.pips.includes('stop')?h('span',{class:'gw-badge miss'},'stopped'):null),
   GW.steps.map(([k,label])=>{const e=d[k];const st=e?e.status:'wait';return h('div',{class:'gw-dp '+st},h('span',{class:'m'},{ok:'✓',none:'○',stop:'✕',wait:'·'}[st]),h('span',{class:'n'},label,e&&e.by!=='rules'?h('span',{class:'by'},e.by):null,e?h('small',{},e.loc+' · '+e.note):null))})),
  (s.cells[id]||[]).length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'How each layer is proved'),h('div',{class:'gw-lay'},(s.cells[id]||[]).flatMap(c=>[h('span',{class:'gw-chip '+c.status},GW.layers[c.layer]),h('span',{},c.reason,h('small',{},c.adapter==='none'?'no adapter':'adapter: '+c.adapter))]))):null,
  own.length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Checked on its own'),own.map(x=>h('button',{class:'gb-row',on:{click:()=>{gw.pinned='s:'+x.id;growPaint()}}},h('span',{},x.title),gwBadge(x)))):null);
 return card}
function gwBadge(x){const r=gw.state.run[x.id];if(!gwIn(x))return h('span',{class:'gw-badge'},x.mode==='max'?'max':'standard');
 if(!r)return h('span',{class:'gw-badge'},'drafted');if(r.st==='run')return h('span',{class:'gw-badge run'},'running');if(r.st==='pass')return h('span',{class:'gw-badge pass'},'passed '+gwDur(r.ms));
 if(r.st==='fail')return h('span',{class:'gw-badge fail'},'failed');return h('span',{class:'gw-badge'+(x.flow?'':' nf'),title:r.why||''},x.flow?'to prove':'no flow yet')}
/* The spec as a strip of criteria: one chip each, its dot the status; the chosen one opens below and lights its parts in the tree. */
function gwSpec(){const s=gw.state,v=gw.view;const card=h('section',{class:'card','aria-label':'Spec','data-testid':'grow-spec'});
 const t=v.summary;const open=gw.selCrit?v.criteria.find(c=>c.id===gw.selCrit):null;
 const notes=[...s.drift.length?[h('div',{class:'gw-flag'},h('b',{},'In the code, not in the spec'),h('span',{},'Changed here, but no criterion covers '+(s.drift.length===1?'it':'them')+'. Confirm '+(s.drift.length===1?'it is':'they are')+' intended, or add '+(s.drift.length===1?'it':'them')+' to the spec.'),s.drift.map(d=>h('span',{class:'mono small'},d.what+' ',h('span',{class:'muted'},d.loc))))]:[],
  ...s.stops.map(x=>h('div',{class:'gw-flag red'},h('b',{},'Tracing stopped at '+((gwUnit(x.unit)||{}).label||x.unit)),h('span',{},x.why+' ',h('span',{class:'mono small muted'},x.at))))];
 gwPut(card,h('div',{class:'row',style:'justify-content:space-between'},h('span',{class:'gw-eyebrow',style:'margin:0'},'Spec'),s.criteria.length?h('span',{class:'small muted'},t.proved+' proved · '+t.agentChecked+' agent-checked · '+(t.notProven?t.notProven+' not proven yet · ':'')+t.needYou+' need you'):null),
  h('p',{class:'small muted',style:'margin:4px 0 0'},s.spec?'From '+s.spec.source+', '+s.spec.via:s.specMissing?'No spec: '+s.specMissing:'Looking in the PR, linked issues and commits'),
  v.criteria.length?h('div',{class:'gw-strip',role:'group','aria-label':'Criteria'},v.criteria.map(c=>h('button',{class:'gw-cc','aria-pressed':gw.selCrit===c.id?'true':'false',title:c.text+' · '+c.status.text,on:{click:()=>{gw.selCrit=gw.selCrit===c.id?null:c.id;growPaint()}}},h('i',{class:c.status.cls}),c.id))):null,
  open?h('div',{class:'gw-cdet'},h('span',{class:'id'},open.id),h('span',{},open.text,h('small',{},s.unbuilt[open.id]?s.unbuilt[open.id]:open.units.length?'in '+open.units.map(id=>(gwUnit(id)||{}).label).join(', '):'No part of the change matched its words yet.')),h('span',{class:'gw-badge '+open.status.cls},open.status.text)):
   v.criteria.length?h('p',{class:'gw-empty',style:'margin:6px 0 0'},'Pick a criterion to see which parts serve it; the tree lights them.'):null,
  s.dropped.length?h('div',{class:'gw-flag red'},h('b',{},s.dropped.length+' agent claim'+(s.dropped.length===1?'':'s')+' dropped'),h('span',{},s.dropped.slice(0,3).map(x=>x.why).join('; ')+(s.dropped.length>3?'; and more':''))):null,
  notes.length?h('details',{class:'gw-notes',open:notes.some(n=>n.classList.contains('red'))?true:null},h('summary',{},notes.length+' note'+(notes.length===1?'':'s')+': '+[s.drift.length?s.drift.length+' in the code, not in the spec':null,s.stops.length?'tracing stopped '+s.stops.length+'×':null].filter(Boolean).join(' · ')),notes):null);
 return card}
function gwCard(x){const s=gw.state;const r=s.run[x.id];const st=r?r.st:'';
 const dot=h('i',{class:'gw-dot '+(st==='pass'?'pass':st==='fail'?'fail':st==='run'?'run':'')});
 return h('details',{class:'gw-sc'+(st==='fail'?' failed':''),'data-sid':x.id,open:st==='fail'?true:null},h('summary',{},dot,h('span',{class:'gw-kind'},x.scenarioKind),h('span',{class:'t'},x.title),
   x.variants.length?h('span',{class:'gw-chip',title:'Runs against a stand-in and, with a key, the real sandbox'},'mock + real'):null,x.by!=='rules'?h('span',{class:'gw-chip agent'},x.by):null,gwBadge(x)),
  h('div',{class:'body'},h('span',{class:'p'},x.proves),
   h('div',{class:'gw-chips'},x.mode==='min'?h('span',{class:'gw-chip min'},'minimum'):null,x.criteria.map(c=>h('span',{class:'gw-chip'},c)),x.layers.map(l=>h('span',{class:'gw-chip'},GW.layers[l])),
    x.flow?h('span',{class:'gw-chip built',title:'Runs this existing flow'},x.flow):null,
    x.ext.filter(e=>s.ext[e]&&s.ext[e].state!=='proven').map(e=>h('span',{class:'gw-chip agent',title:s.ext[e].path},'agent-written '+s.ext[e].extKind))),
   x.variants.length?gwLanes(x):null,r&&r.st==='fail'?h('div',{class:'err'},r.why||'failed'):null,r&&r.st==='not_run'&&r.why?h('span',{class:'small muted'},r.why):null))}
function gwLanes(x){const s=gw.state;const r=s.run[x.id],v=s.real[x.id];
 const mock=!r?h('span',{class:'gw-badge'},'waiting'):r.st==='run'?h('span',{class:'gw-badge run'},'running'):r.st==='pass'?h('span',{class:'gw-badge pass'},'passed '+gwDur(r.ms)):r.st==='fail'?h('span',{class:'gw-badge fail'},'failed'):h('span',{class:'gw-badge'},'not run');
 const real=x.mockOnly?h('span',{class:'gw-badge'},'mock only'):!v?h('span',{class:'gw-badge'},r&&r.st==='pass'?'next':'after mock'):v.st==='pass'?h('span',{class:'gw-badge pass'},'passed '+gwDur(v.ms)):h('span',{class:'gw-badge warn'},v.na?'mock only':'skipped');
 const note=x.mockOnly||(v&&v.note)||(x.realKey?'Runs against the provider sandbox when '+x.realKey+' is set':'No sandbox known for this provider yet');
 return h('div',{class:'gw-lanes'},h('div',{class:'gw-ln'},h('span',{class:'gw-chip'},'mock · stand-in'),mock,h('span',{class:'note'},'Every PR. Can fail, slow down or hang up on purpose.')),h('div',{class:'gw-ln'},h('span',{class:'gw-chip'},'real · sandbox'),real,h('span',{class:'note'},note)))}
function gwExt(){const s=gw.state;if(!s.extOrder.length)return null;const ids=s.extOrder;const review=ids.filter(x=>s.ext[x].state==='review').length;
 return h('section',{class:'card','aria-label':'Built by the agent','data-testid':'grow-agent-written'},h('details',{class:'gw-notes',open:review?true:null},h('summary',{style:'margin:0;padding:0;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap'},h('span',{class:'gw-eyebrow',style:'margin:0;display:inline'},'Built by the agent · '+ids.length),
  h('span',{class:'small muted'},ids.filter(x=>s.ext[x].state==='proven').length+' proven · '+review+' need review · '+ids.filter(x=>['unproven','draft'].includes(s.ext[x].state)).length+' not used for proof')),
  ids.map(x=>{const e=s.ext[x];const cls=e.state==='proven'?'pass':e.state==='review'?'warn':e.state==='draft'?'miss':'';
   return h('div',{class:'gw-xi'},h('div',{class:'hd'},h('span',{class:'k'},e.extKind),h('span',{class:'gw-badge '+cls},GW.ext[e.state]+(e.state==='proven'&&e.provenBy?' by '+((gwScen(e.provenBy)||{}).title||e.provenBy):''))),h('b',{style:'font-weight:500'},e.name),h('span',{class:'path'},e.path),h('span',{},e.why),h('span',{class:'need'},e.need))})))}
function gwStartCard(){const g=state.git;const a=state.agent.settings;const name=a.provider==='claude'?'Claude':a.provider==='codex'?'Codex':null;const available=!!(name&&state.agent.detected[a.provider]);
 if(!available)gw.agent=false;
 const branch=ui.source||g.current||'';
 return h('div',{class:'card gw-start','data-testid':'grow-start'},h('span',{class:'label'},'Grow a change'),
  h('h1',{style:'margin:0;font-size:26px;line-height:32px;max-width:none'},branch&&branch!==g.base?'What does '+branch+' change, and is it proved?':'Pick a branch to grow'),
  h('p',{class:'small muted',style:'margin:0'},'tracegrove reads the branch and its spec, grows the change as a tree, traces every part five ways, drafts happy, sad and edge scenarios, and proves them with real flows.'),
  h('div',{class:'opts'},h('label',{},h('input',{type:'checkbox','data-testid':'grow-prove',checked:gw.prove,on:{change:e=>{gw.prove=e.target.checked}}}),'Prove with real flows'),
   h('label',{title:available?'':'No agent installed; the rules trace everything'},h('input',{type:'checkbox','data-testid':'grow-agent',checked:gw.agent&&available,disabled:!available,on:{change:e=>{gw.agent=e.target.checked}}}),available?'Trace with '+name+' ('+(a.model||'CLI default')+')':'Rules only (no agent installed)'),
   h('label',{},'against ',h('input',{class:'mono',style:'min-height:34px;padding:0 8px;border:1px solid var(--line2);border-radius:6px;background:var(--paper);color:var(--ink);width:200px',value:gw.base||g.base||'',placeholder:g.base||'main',on:{input:e=>{gw.base=e.target.value}}}))),
  h('div',{class:'row'},h('button',{class:'btn','data-testid':'grow-go',disabled:gw.busy||!g.isRepo||!branch||branch===g.base,on:{click:growStart}},'Grow '+(branch||'this branch')),
   !g.isRepo?h('span',{class:'small muted'},'Not a git repo: grow compares a branch with its base.'):branch===g.base?h('span',{class:'small muted'},'This is the base branch. Pick a feature branch below.'):null))}
function gwResult(){const s=gw.state,v=gw.view;const t=v.summary;const fail=s.scenarios.find(x=>s.run[x.id]&&s.run[x.id].st==='fail');
 return h('div',{class:'gw-result','data-testid':'grow-result'},h('div',{},h('div',{class:'big'},t.passed+' of '+t.scenarios+' scenarios proved'+(t.failed?', '+t.failed+' failed':'')+(t.notRun?', '+t.notRun+' not run yet':'')),
  h('div',{class:'sub'},(s.criteria.length?'Spec: '+t.proved+' of '+t.criteria+' criteria proved, '+t.agentChecked+' agent-checked'+(t.notProven?', '+t.notProven+' not proven yet':'')+', '+t.needYou+' need you. ':'No spec to check against. ')+(fail?'First failure: '+fail.title+'. ':'')+(t.toReview?t.toReview+' agent-written piece'+(t.toReview===1?'':'s')+' to review. ':'')+(gw.log?'Log: '+gw.log:''))),
  h('div',{class:'row'},fail?h('button',{class:'btn ghost sm',on:{click:()=>openTab('Heal')}},'Heal the failure'):null,h('button',{class:'btn ghost sm',on:{click:()=>openTab('Run')}},'Open the runs')))}
/* How much to prove sits right above the tree it prunes; hovering a choice previews the cut. */
function gwModes(){const s=gw.state,v=gw.view;const asked=s.asked&&!s.modeBy;const locked=!!s.modeBy;
 const look=id=>{if(asked&&gw.preview!==id){gw.preview=id;gbPaint()}},away=()=>{if(gw.preview){gw.preview=null;gbPaint()}};
 return h('div',{class:'gb-mode'},h('div',{class:'gw-modes'+(asked?' ask':' set'),'data-testid':'grow-modes',role:'group','aria-label':'How much to prove'},GW.modes.map(m=>h('button',{'data-testid':'grow-mode-'+m.id,'aria-pressed':String((locked?s.mode:(gw.picking||'min'))===m.id),disabled:!asked,
   on:{click:()=>{gw.picking=m.id;gw.preview=null;growPick(m.id)},mouseenter:()=>look(m.id),focus:()=>look(m.id),mouseleave:away,blur:away}},h('b',{},m.label+' · '+v.counts[m.id]),h('span',{},m.blurb)))),
  h('p',{class:'small muted','data-testid':'grow-mode-hint',style:'margin:0'},asked?'Choose how much to prove. Tracing is done; nothing runs until you pick.':locked?'Mode: '+GW.modes.find(m=>m.id===s.mode).label+(s.modeBy==='you'?', your choice.':s.modeBy==='flag'?', set at start.':', the default.'):'You choose once scenarios are drafted.'))}
/* The key under the tree: what a branch is, where a leaf sits on its pad and why, and what each leaf's colour means. */
function gwKey(){const s=gw.state;const drafted=s.scenarios.length,inm=s.scenarios.filter(gwIn).length;const M=gw.M,B=gw.B;
 const one=!!M&&M.J.length===1,narrow=!!(B&&B.L&&B.L.narrow);const lf=(c,t)=>h('span',{},h('i',{class:c}),t);const left=drafted-inm;
 const onJ=x=>!!M&&M.J.some(j=>(M.leaves[j.id]||[]).includes(x));const out=s.scenarios.filter(x=>!gwIn(x));const outJ=out.filter(onJ).length,outP=out.length-outJ;
 const buds=!!M&&s.scenarios.some(x=>!onJ(x)&&(!s.modeBy||gwIn(x)));const crack=!!(B&&Object.values(B.knot||{}).some(k=>k.classList.contains('wound')));
 const modeOf=m=>GW.modes.find(q=>q.id===m).label;const partModes=[...new Set(out.filter(x=>!onJ(x)).map(x=>modeOf(x.mode)))];
 return [h('div',{class:'gb-key'},h('span',{},one?'One journey, end to end: the crown is its happy path; what it refuses and how it fails grow as its branches.':'Each branch is a journey, end to end, fed from the roots it depends on; each leaf is one of its scenarios; each knot a file it passes through.')),
  h('div',{class:'gb-key'},h('span',{},'On a pad, the happy path sits on the crest, guards on the shoulders, and the ways it fails hang beneath.')),
  h('div',{class:'gb-key'},lf('','passed'),lf('fail','failed'),lf('run','running'),lf('in','to prove'),lf('none','no flow yet'),crack?lf('crack','where it failed'):null,buds?lf('bud','a part checked on its own (Max)'):null,lf('cut','pruned, cut back')),
  narrow&&M?h('ol',{class:'gb-names'},(gw.order||[]).map(id=>h('li',{},(M.J.find(j=>j.id===id)||{}).title||''))):null,
  s.modeBy&&left>0?h('div',{class:'gb-cap'},modeOf(s.mode)+' keeps '+inm+' of the '+drafted+' drafted scenarios. Pruned: '+[outJ?outJ+' on journeys (the cut stubs and stems)':null,outP?outP+' part and regression checks that only '+partModes.join(' and ')+' grows':null].filter(Boolean).join('; ')+'.'):null]}
/* The page, top down: the verdict once there is one, the phases (quiet when done), the tracers, the tree with its inspector, then the journeys and the spec side by side, then what the agent built.
   Everything paints into fixed slots so the tree's SVG stays where it is between paints: moving a node resets its transitions, and the limbs would snap instead of grow. */
function gwSlots(){if(gw.slots)return gw.slots;const S={};for(const k of ['start','head','verdict','rail','agents','tree','two','error'])S[k]=h('div',{});
 S.card=h('section',{class:'card gw-tree','aria-label':'Tree'});S.bar=h('div',{});S.mode=h('div',{});S.stage=h('div',{class:'gw-stage'});S.left=h('div',{style:'min-width:0'});S.scroll=h('div',{class:'gb-wrap'});S.legend=h('div',{});S.ins=h('div',{style:'min-width:0'});
 /* the tree is drawn for its width: when the space it has changes enough, draw it again */
 try{new ResizeObserver(()=>{if(gw.state&&gw.tree==='grove'&&gw.B&&gbWidth()!==gw.B.width)growPaint()}).observe(S.scroll)}catch(e){}
 S.card.append(S.bar,S.mode,S.stage);S.stage.append(S.left,S.ins);S.left.append(S.scroll,S.legend);S.tree.append(S.card);
 gw.el.append(S.start,S.head,S.verdict,S.rail,S.agents,S.tree,S.two,S.error);return gw.slots=S}
const gwSet=(slot,...k)=>{slot.replaceChildren();gwPut(slot,...k)};
function growPaint(){if(!gw.el)return;const s=gw.state;const S=gwSlots();
 if(!s){gwSet(S.start,gwStartCard(),gw.busy?h('p',{class:'row muted',style:'margin-top:12px'},h('span',{class:'think'},h('i'),h('i'),h('i')),'Reading the branch'):null,gw.error?blocked(gw.error):null);
  for(const k of ['head','verdict','rail','agents','two','error'])S[k].replaceChildren();S.tree.hidden=true;return}
 S.start.replaceChildren();S.tree.hidden=false;
 const v=gw.view;const c=s.change;
 gwSet(S.head,h('div',{class:'gw-head'},h('div',{style:'min-width:0'},h('span',{class:'label'},'Grow · '+(c?c.branch+' → '+c.base:'reading')),h('h2',{},c?c.title:'Reading the branch'),
   h('div',{class:'sub'},c?((c.pr?'#'+c.pr+' · ':'')+c.files+' files · +'+c.adds+' −'+c.dels+(c.untraced?' · '+c.untraced+' small parts not traced':'')+(s.spec?' · spec: '+s.spec.source:'')):'')),
  h('div',{style:'text-align:right'},h('div',{class:'gw-clock'},gw.saved?'saved '+ago(gw.saved)+' · took '+gwFmt(s.ms):gwFmt(s.done?s.ms:Date.now()-gw.t0)),s.done||!gw.busy?h('button',{class:'btn ghost sm',style:'margin-top:6px',disabled:gw.busy,on:{click:()=>{gw.state=null;gw.saved=null;gw.svg=null;gw.B=null;gw.seen=new Set();gw.pinned=null;growPaint()}}},'New grow'):null)));
 gwSet(S.verdict,s.blocked?h('div',{class:'gw-result bad'},h('div',{},h('div',{class:'big'},'Stopped: '+s.blocked.code),h('div',{class:'sub'},s.blocked.detail+'. Fix: '+s.blocked.action))):null,s.done?gwResult():null);
 gwSet(S.rail,h('div',{class:'gw-rail'+(s.done?' quiet':''),role:'list','aria-label':'Phases'},GW.phases.map((p,i)=>{const cls=i<s.phase||s.done?'done':i===s.phase?'on':'';const st=s.phaseAt[i],en=s.phaseAt[i+1]??(s.done?s.ms:null);
  return h('div',{class:'ph '+cls,role:'listitem'},h('b',{},p),h('span',{},st===undefined?'waiting':i===4&&s.modeBy?GW.modes.find(m=>m.id===s.mode).label.toLowerCase():en!=null?((en-st)/1000).toFixed(1)+' s':'now'))})));
 const rules=s.agents.filter(a=>a.by==='rules'&&a.done&&a.ok),live=s.agents.filter(a=>!rules.includes(a)&&(!s.done||!a.ok||a.by!=='rules'));
 const traced=(n=>n+' part'+(n===1?'':'s')+' traced from source')(rules.reduce((n,a)=>n+a.units.length,0));
 if(s.done&&!live.some(a=>!a.ok))gwSet(S.agents,rules.length||live.length?h('p',{class:'gw-agline'},'✓ rules · '+rules.length+' lane'+(rules.length===1?'':'s')+' · '+traced+live.map(a=>' · ✓ '+(a.model||a.by)+' · '+a.brief).join('')):null);
 else gwSet(S.agents,live.length||rules.length?h('div',{class:'gw-agents','aria-live':'polite'},rules.length?h('div',{class:'gw-ag'},h('b',{},'✓ rules · '+rules.length+' lane'+(rules.length===1?'':'s')),h('span',{},traced)):null,live.map(a=>h('div',{class:'gw-ag'+(a.done?(a.ok?'':' bad'):' live')},h('b',{},(a.done?(a.ok?'✓ ':'✕ '):'')+(a.by==='rules'?'rules':a.model||a.by)+' · '+a.brief),h('span',{title:a.note},a.note)))):null);
 const nj=(s.journeys||[]).length;
 gwSet(S.bar,h('div',{class:'gw-bar'},h('span',{class:'gw-eyebrow',style:'margin:0'},(nj?nj+' journey'+(nj===1?'':'s')+' · ':'')+s.units.filter(u=>!u.root).length+' part'+(s.units.filter(u=>!u.root).length===1?'':'s')+' · '+(n=>n+' dependenc'+(n===1?'y':'ies'))(s.units.filter(u=>u.root).length)),
  h('span',{class:'row',style:'gap:10px'},gw.tree==='outline'?h('label',{class:'small muted',style:'display:inline-flex;gap:6px;align-items:center'},h('input',{type:'checkbox',checked:gw.onlyGaps,on:{change:e=>{gw.onlyGaps=e.target.checked;growPaint()}}}),'Only gaps'):null,
   h('span',{class:'seg2',role:'group','aria-label':'View'},['grove','outline'].map(t=>h('button',{'aria-pressed':String(gw.tree===t),'data-testid':'grow-view-'+t,on:{click:()=>{gw.tree=t;try{localStorage.setItem('gw-tree',t)}catch(e){}growPaint()}}},t==='grove'?'Grove':'Outline'))))));
 gwSet(S.mode,s.scenarios.length||s.asked?gwModes():null);
 if(gw.tree==='grove'){if(S.left.firstChild!==S.scroll)S.left.replaceChildren(S.scroll,S.legend);
  /* the tree is drawn for the width it gets, so it waits until it is on the page */
  if(!S.scroll.isConnected||!S.scroll.clientWidth){if(!gw.waiting){gw.waiting=true;requestAnimationFrame(()=>{gw.waiting=false;growPaint()})}}
  else{gbPaint();if(S.scroll.firstChild!==gw.svg)S.scroll.replaceChildren(gw.svg,gw.B.tip)}
  gwSet(S.legend,s.scenarios.length?gwKey():null)}
 else{gw.M=gbModel();S.left.replaceChildren(gwOutline())}
 gwSet(S.ins,gwInspector());
 gwSet(S.two,h('div',{class:'gw-two'},gbJourneys(),h('div',{style:'display:grid;gap:18px;min-width:0'},gwSpec(),gwExt())));
 gwSet(S.error,gw.error?blocked(gw.error):null)}
${BONSAI_JS}
`;
