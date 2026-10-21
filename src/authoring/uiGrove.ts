/**
 * The Discover tab's live view of `tracegrove grow`: the change's tree growing as events arrive
 * (branches for what people use, gold roots for what it depends on, a dashed red root where tracing
 * had to stop), an outline for large trees, an inspector that follows the tracer, the spec mapped both
 * ways, scenarios with mock and real lanes, and everything an agent wrote with its proof state.
 * The page renders the server's folded state; it never invents progress.
 */
import { DEPTH_STEPS, LAYER_LABEL, MODES, PHASES, PHASE_SHORT, EXTENSION_STATE } from './growState.ts';

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
.gw-main{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:18px;align-items:start}
@media (max-width:1060px){.gw-main{grid-template-columns:minmax(0,1fr)}}
.gw-side{display:grid;gap:18px;min-width:0}
.gw-tree{padding:12px 12px 6px;min-width:0}

.gw-tree .gw-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center;margin:0 4px 6px}
.gw-tree .seg2{display:inline-flex;border:1px solid var(--line2);border-radius:8px;overflow:hidden}
.gw-tree .seg2 button{border:0;background:var(--paper);min-height:32px;padding:0 12px;font-size:13px;color:var(--ink3)}
.gw-tree .seg2 button[aria-pressed=true]{background:var(--sel);color:var(--ink);font-weight:500}
.gw-svg{display:block;width:100%;height:auto;overflow:visible}
.gw-svg .ground{stroke:var(--line2);stroke-width:1}
.gw-svg .glbl{font:500 10.5px var(--mono);letter-spacing:.08em;fill:var(--muted)}
.gw-svg .br{fill:none;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1),stroke .3s,opacity .3s}
.gw-svg .br.on{stroke-dashoffset:0}
.gw-svg .br.trunk{stroke:var(--trunk)}
.gw-svg .br.branch{stroke:var(--trunk);stroke-width:3.4}
.gw-svg .br.root{stroke:var(--gold);stroke-width:2.8}
.gw-svg .br.tracing{stroke:var(--gold)}
.gw-svg .br.dead{stroke:var(--verm);stroke-width:2.2;stroke-dasharray:6 6;stroke-dashoffset:0;opacity:0}
.gw-svg .br.dead.on{opacity:1}
.gw-svg .lbl{opacity:0;transition:opacity .45s}.gw-svg .lbl.on{opacity:1}
.gw-svg .lbl text{font:500 12.5px var(--mono);fill:var(--ink)}
.gw-svg .lbl text.k{font:11px var(--mono);fill:var(--muted)}
.gw-svg .lbl.sel text:first-child{fill:var(--gold);font-weight:600}
.gw-svg .deadlbl{font:500 11px var(--mono);fill:var(--verm);opacity:0;transition:opacity .45s}.gw-svg .deadlbl.on{opacity:1}
.gw-svg .pip{stroke-width:1.4}.gw-svg .pip.ok{fill:var(--moss);stroke:var(--moss)}.gw-svg .pip.none{fill:var(--paper);stroke:var(--moss)}.gw-svg .pip.stop{fill:var(--verm);stroke:var(--verm)}.gw-svg .pip.wait{fill:var(--line);stroke:var(--line2)}
.gw-svg .hit{cursor:pointer;outline:none}.gw-svg .hit:focus-visible .lbl text:first-child{text-decoration:underline}
.gw-svg .lf{stroke-width:1.2;transition:fill .4s,stroke .4s,opacity .4s}
.gw-svg .lf.in{fill:var(--moss-bg);stroke:var(--moss)}.gw-svg .lf.pass{fill:var(--moss);stroke:var(--moss)}.gw-svg .lf.fail{fill:var(--verm);stroke:var(--verm)}
.gw-svg .lf.run{fill:var(--gold);stroke:var(--gold);animation:leaf 1s ease-in-out infinite}.gw-svg .lf.out{fill:none;stroke:var(--line2);opacity:.7}.gw-svg .lf.none{fill:var(--paper);stroke:var(--ink3);stroke-dasharray:2 2}
.gw-svg .lf.sprout{animation:sprout .5s cubic-bezier(.2,.8,.3,1.3) both}
@keyframes sprout{from{transform:scale(0)}to{transform:scale(1)}}
.gw-svg .cursor{fill:var(--gold);stroke:var(--paper);stroke-width:2}
.gw-svg.dim .br.branch:not(.hl),.gw-svg.dim .br.root:not(.hl),.gw-svg.dim .lbl:not(.hl),.gw-svg.dim .lf:not(.hl){opacity:.22}
.gw-svg .more{font:12px var(--mono);fill:var(--muted)}
.gw-ol{width:100%;border-collapse:collapse;font-size:13px}
.gw-ol th{font:500 11px/16px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
.gw-ol td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
.gw-ol tr.u{cursor:pointer}.gw-ol tr.u:hover td,.gw-ol tr.u.sel td{background:var(--sel)}
.gw-ol tr.grp td{font:500 11px/16px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding-top:14px}
.gw-ol .nm{font:500 13px/18px var(--mono);color:var(--ink);overflow-wrap:anywhere}.gw-ol .loc{font:11.5px/16px var(--mono);color:var(--muted);overflow-wrap:anywhere}
.gw-pips{display:inline-flex;gap:3px;vertical-align:middle}.gw-pips i{width:9px;height:9px;border-radius:50%;border:1.5px solid var(--line2);background:var(--line)}
.gw-pips i.ok{background:var(--moss);border-color:var(--moss)}.gw-pips i.none{background:var(--paper);border-color:var(--moss)}.gw-pips i.stop{background:var(--verm);border-color:var(--verm)}
.gw-mini{display:inline-flex;gap:3px;flex-wrap:wrap}.gw-mini i{width:8px;height:8px;border-radius:2px 8px;background:var(--moss-bg);border:1px solid var(--moss)}
.gw-mini i.pass{background:var(--moss)}.gw-mini i.fail{background:var(--verm);border-color:var(--verm)}.gw-mini i.out{background:none;border-color:var(--line2)}.gw-mini i.run{background:var(--gold);border-color:var(--gold)}
.gw-chip{display:inline-flex;align-items:center;min-height:20px;padding:0 7px;border-radius:5px;font:500 11.5px/16px var(--mono);background:var(--sel);color:var(--ink2);border:1px solid transparent}
.gw-chip.built{background:var(--moss-bg);color:var(--moss)}.gw-chip.indirect{background:var(--gold-bg);color:var(--gold)}.gw-chip.missing{background:var(--verm-bg);color:var(--verm-ink)}
.gw-chip.agent{background:var(--gold-bg);color:var(--gold);border-color:var(--gold)}.gw-chip.min{background:var(--forest);color:var(--on-forest)}
.gw-chips{display:flex;flex-wrap:wrap;gap:4px}
.gw-eyebrow{display:block;font:500 11px/16px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.gw-ins .who{font:12px/16px var(--mono);color:var(--muted)}.gw-ins h3{margin:2px 0;font:500 16px/22px var(--mono);overflow-wrap:anywhere}.gw-ins .where{font:12px/18px var(--mono);color:var(--ink3);overflow-wrap:anywhere}
.gw-ins .sec{margin-top:14px}
.gw-dp{display:grid;grid-template-columns:18px minmax(0,1fr);gap:2px 8px;padding:5px 0;border-bottom:1px solid var(--line)}
.gw-dp:last-child{border:0}.gw-dp .m{font:600 13px/20px var(--mono);text-align:center}.gw-dp.ok .m,.gw-dp.none .m{color:var(--moss)}.gw-dp.stop .m{color:var(--verm)}.gw-dp.wait .m{color:var(--line2)}
.gw-dp .n{font-size:13px;line-height:20px;min-width:0}.gw-dp small{display:block;font:11.5px/16px var(--mono);color:var(--ink3);overflow-wrap:anywhere}
.gw-dp .by{font:10.5px/14px var(--mono);color:var(--gold);margin-left:6px}
.gw-lay{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 10px;align-items:start;font-size:13px}.gw-lay small{display:block;font:11px/15px var(--mono);color:var(--muted)}
.gw-cr{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:8px;align-items:start;width:100%;text-align:left;padding:8px 6px;border:0;border-bottom:1px solid var(--line);background:none;font-size:13px;line-height:19px}
.gw-cr:hover,.gw-cr.sel{background:var(--sel)}.gw-cr .id{font:600 12px/19px var(--mono);color:var(--ink3)}.gw-cr small{display:block;color:var(--muted);font-size:12px}
.gw-badge{display:inline-flex;align-items:center;white-space:nowrap;min-height:20px;padding:0 7px;border-radius:5px;font:500 11.5px/16px var(--mono);background:var(--sel);color:var(--ink3)}
.gw-badge.pass{background:var(--moss-bg);color:var(--moss)}.gw-badge.fail,.gw-badge.miss{background:var(--verm-bg);color:var(--verm-ink)}.gw-badge.warn{background:var(--gold-bg);color:var(--gold)}
.gw-badge.run{background:var(--gold-bg);color:var(--gold)}.gw-badge.code,.gw-badge.cov{background:var(--indigo-bg);color:var(--indigo)}
.gw-flag{display:grid;gap:2px;padding:9px 10px;border-radius:8px;background:var(--gold-bg);font-size:13px;line-height:19px;margin-top:8px}.gw-flag b{font-weight:500;color:var(--ink)}.gw-flag span{color:var(--ink2)}
.gw-flag.red{background:var(--verm-bg)}
.gw-agents{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
.gw-ag{display:grid;gap:1px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);min-width:0;flex:1 1 220px;max-width:100%}
.gw-ag b{font:500 12.5px/18px var(--mono);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gw-ag span{font:11.5px/16px var(--mono);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gw-ag.live{border-color:var(--gold)}.gw-ag.live b::before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gold);margin-right:7px;animation:pulse 1.1s ease-in-out infinite}
.gw-ag.bad{border-color:var(--verm)}
.gw-modes{display:flex;flex-wrap:wrap;gap:8px}
.gw-modes button{flex:1 1 180px;text-align:left;padding:10px 12px;border-radius:10px;border:1px solid var(--line2);background:var(--paper);display:grid;gap:2px}
.gw-modes button b{font-weight:500;font-size:14px}.gw-modes button span{font-size:12.5px;line-height:17px;color:var(--ink3)}
.gw-modes button[aria-pressed=true]{border-color:var(--forest);box-shadow:inset 0 0 0 1px var(--forest)}
.gw-modes.ask button{border-color:var(--gold)}
.gw-sgroup{margin-top:16px}.gw-sgroup h4{display:flex;justify-content:space-between;margin:0 0 6px;font:500 11px/16px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.gw-sc{display:grid;gap:5px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);margin-bottom:8px}
.gw-sc.failed{border-color:var(--verm)}.gw-sc .rw{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.gw-sc .t{font-weight:500;font-size:14px;line-height:20px}
.gw-sc .p{font-size:13px;line-height:19px;color:var(--ink3)}.gw-sc .err{font:12px/17px var(--mono);color:var(--verm-ink);background:var(--verm-bg);padding:6px 8px;border-radius:6px;overflow-wrap:anywhere}
.gw-lanes{display:grid;gap:4px;margin-top:2px}.gw-ln{display:grid;grid-template-columns:118px auto minmax(0,1fr);gap:8px;align-items:center;font-size:12px}.gw-ln .note{color:var(--muted);line-height:16px}
.gw-xi{display:grid;gap:3px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px;line-height:19px}.gw-xi:last-child{border:0}
.gw-xi .hd{display:flex;justify-content:space-between;gap:8px}.gw-xi .k{font:500 11px/16px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
.gw-xi .path{font:11.5px/16px var(--mono);color:var(--muted);overflow-wrap:anywhere}.gw-xi .need{color:var(--ink2)}
.gw-result{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 24px;align-items:center;padding:16px 20px;border-radius:12px;background:var(--forest);color:var(--on-forest);margin-top:18px}
.gw-result .big{font:400 22px/28px var(--serif)}.gw-result .sub{font-size:13px;line-height:19px;opacity:.85;max-width:760px}
.gw-result.bad{background:var(--verm-bg);color:var(--ink)}
.gw-empty{font-size:13px;color:var(--muted);margin:6px 0}
@media (max-width:640px){.gw-rail{grid-template-columns:repeat(3,minmax(0,1fr))}.gw-ln{grid-template-columns:1fr}.gw-head h2{font-size:20px;line-height:26px}}
@media (prefers-reduced-motion:reduce){.gw-svg .br{transition:none}.gw-svg .lf.sprout,.gw-svg .lf.run,.gw-ag.live b::before{animation:none}}
`;

export const GROVE_JS = String.raw`
/* ---------- Grow: the change's tree, live ---------- */
const GW=${CONST};
const gw={el:null,svg:null,G:null,state:null,view:null,events:0,id:null,busy:false,error:null,log:null,tree:'grove',pinned:null,selCrit:null,onlyGaps:false,base:'',prove:true,agent:true,t0:0,raf:0};
try{const v=localStorage.getItem('gw-tree');if(v==='outline')gw.tree='outline'}catch(e){}
function growPanel(){if(!gw.el)gw.el=h('section',{class:'gw','aria-label':'Grow this change','data-testid':'grow'});growPaint();return gw.el}
async function growStart(){
 if(gw.busy)return;gw.busy=true;gw.error=null;gw.state=null;gw.view=null;gw.events=0;gw.id=null;gw.log=null;gw.pinned=null;gw.selCrit=null;gw.svg=null;gw.G=null;gw.t0=Date.now();growPaint();growTick();
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
function growTick(){cancelAnimationFrame(gw.raf);const step=now=>{growCursors(now);if(gw.busy||(gw.state&&!gw.state.done))gw.raf=requestAnimationFrame(step)};gw.raf=requestAnimationFrame(step)}
const gwFmt=ms=>{const s=Math.max(0,ms)/1000;const m=Math.floor(s/60);return String(m).padStart(2,'0')+':'+(s%60).toFixed(1).padStart(4,'0')};
const gwUnit=id=>gw.state.units.find(u=>u.id===id);
const gwScen=id=>gw.state.scenarios.find(s=>s.id===id);
const gwRank={min:0,std:1,max:2};
const gwIn=s=>gwRank[s.mode]<=gwRank[gw.state.mode];
const gwSel=()=>gw.pinned||gw.state.focus;
const gwPut=(el,...k)=>{for(const x of k.flat(Infinity))if(x!==null&&x!==undefined&&x!==false)el.append(x)};
const gwCut=(t,n)=>t.length>n?t.slice(0,n-1)+'…':t;

/* Layout for any tree: limbs alternate sides, the lowest reaching widest, so they nest and never cross. */
function gwLayout(units){
 const br=units.filter(u=>!u.root).slice(0,14),rt=units.filter(u=>u.root).slice(0,8);
 const crown=br.length%2===1&&br.length>2?br[br.length-1]:null;const sides=br.filter(u=>u!==crown);
 const per=[sides.filter((_,i)=>i%2===0),sides.filter((_,i)=>i%2===1)];const most=Math.max(1,per[0].length,per[1].length);
 const X=500,STEP=66,TOP=crown?150:96,GY=TOP+Math.max(190,(most-1)*STEP+90),L={};
 /* Tips sit in two neat label columns; the lowest limb leaves the trunk lowest and lands lowest, so limbs nest and never cross. */
 per.forEach((list,side)=>{const dir=side===0?-1:1,n=list.length,xt=X+dir*250;
  list.forEach((u,j)=>{const lift=n>1?j/(n-1):.5;const yt=Math.round(GY-44-side*STEP/2-j*STEP);const ya=Math.round(GY-70-lift*(GY-70-TOP-30)-side*12);
   L[u.id]={d:'M'+X+' '+ya+' C'+(X+dir*70)+' '+(ya-26)+' '+(xt-dir*110)+' '+yt+' '+xt+' '+yt,tip:[xt+dir*12,yt+4],anchor:dir<0?'end':'start',w:3.6-lift*1.4}})});
 if(crown)L[crown.id]={d:'M'+X+' '+(TOP+10)+' C'+(X-2)+' '+(TOP-30)+' '+(X+8)+' '+(TOP-60)+' '+(X+4)+' '+(TOP-92),tip:[X+4,TOP-108],anchor:'middle',crown:true,w:2.2};
 const deep=Math.ceil(rt.length/2);
 rt.forEach((u,j)=>{const dir=j%2===0?-1:1,k=Math.floor(j/2);const xt=X+dir*(240-k*20),yt=GY+56+k*62;
  L[u.id]={d:'M'+(X+dir*4)+' '+(GY+3)+' C'+(X+dir*40)+' '+(GY+40)+' '+(xt-dir*100)+' '+yt+' '+xt+' '+yt,tip:[xt+dir*12,yt+4],anchor:dir<0?'end':'start',w:2.8,
   dead:'M'+xt+' '+yt+' C'+(xt-dir*14)+' '+(yt+20)+' '+(xt-dir*30)+' '+(yt+34)+' '+(xt-dir*54)+' '+(yt+46),deadAt:[xt-dir*58,yt+50],dir:-dir}});
 const H=rt.length?GY+56+(deep-1)*62+70:GY+40;
 return {L,H,X,GY,TOP:crown?TOP:TOP+20,hidden:units.length-br.length-rt.length}}
function gwBuild(){
 const s=gw.state;const lay=gwLayout(s.units);
 const svg=sv('svg',{class:'gw-svg',viewBox:'0 0 1000 '+lay.H,role:'img','aria-label':'The change as a tree: branches are what people use, roots are what it depends on'});
 svg.append(sv('line',{x1:40,y1:lay.GY,x2:960,y2:lay.GY,class:'ground'}),sv('text',{x:44,y:lay.GY-10,class:'glbl'},'BRANCHES · WHAT PEOPLE USE'),sv('text',{x:44,y:lay.GY+22,class:'glbl'},'ROOTS · WHAT IT DEPENDS ON'));
 const G={lay,ids:Object.keys(lay.L).join(','),br:{},lbl:{},pips:{},dead:{},deadLbl:{},leaves:{},cur:{},gBr:sv('g',{}),gLf:sv('g',{}),gCur:sv('g',{})};
 const tr=(f,w)=>sv('path',{d:'M'+lay.X+' '+(lay.GY+4)+' C'+(lay.X-4)+' '+(lay.GY-(lay.GY-lay.TOP)*f*.35)+' '+(lay.X+5)+' '+(lay.GY-(lay.GY-lay.TOP)*f*.7)+' '+lay.X+' '+(lay.GY-(lay.GY-lay.TOP)*f),class:'br trunk',pathLength:1,style:'stroke-width:'+w});
 G.trunks=[tr(1,5),tr(.62,9),tr(.28,13)];G.gBr.append(...G.trunks);
 s.units.forEach((u,i)=>{const g=lay.L[u.id];if(!g)return;
  const hit=sv('g',{class:'hit','data-unit':u.id,tabindex:0,role:'button','aria-label':u.label+', '+(u.root?'root':'branch')});
  hit.append(sv('path',{d:g.d,stroke:'transparent','stroke-width':18,fill:'none'}));
  G.br[u.id]=sv('path',{d:g.d,class:'br '+(u.root?'root':'branch'),pathLength:1,style:'stroke-width:'+g.w.toFixed(1)});hit.append(G.br[u.id]);
  const lb=sv('g',{class:'lbl'});const [x,y]=g.tip;
  lb.append(sv('text',{x,y,'text-anchor':g.anchor},sv('title',{},u.label),(i+1)+'  '+gwCut(u.label,26)),sv('text',{x,y:y+15,'text-anchor':g.anchor,class:'k'},gwCut(u.unitKind+' · '+u.loc.split('/').pop(),32)));
  const px=g.anchor==='end'?x-50:g.anchor==='middle'?x-25:x;G.pips[u.id]=GW.steps.map((_,k)=>{const c=sv('circle',{cx:px+5+k*10,cy:y+27,r:3.6,class:'pip wait'});lb.append(c);return c});
  G.lbl[u.id]=lb;hit.append(lb);G.gBr.append(hit);
  if(g.dead){G.dead[u.id]=sv('path',{d:g.dead,class:'br dead'});G.deadLbl[u.id]=sv('text',{x:g.deadAt[0],y:g.deadAt[1],'text-anchor':g.dir<0?'start':'end',class:'deadlbl'},'tracing stopped here');G.gBr.append(G.dead[u.id],G.deadLbl[u.id])}});
 if(lay.hidden>0)G.gBr.append(sv('text',{x:960,y:lay.GY-10,'text-anchor':'end',class:'more'},'+'+lay.hidden+' more in Outline'));
 svg.append(G.gBr,G.gLf,G.gCur);
 const pick=e=>{const t=e.target.closest('[data-unit]');if(t){gw.pinned=t.getAttribute('data-unit');growPaint()}};
 svg.addEventListener('click',pick);svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){pick(e);e.preventDefault()}});
 gw.svg=svg;gw.G=G}
function gwLeaf(u,i){const p=gw.G.br[u.id];const len=p.getTotalLength();const f=Math.min(.96,.48+i*.075);
 const a=p.getPointAtLength(len*f-2),b=p.getPointAtLength(len*f+2),m=p.getPointAtLength(len*f);const along=Math.atan2(b.y-a.y,b.x-a.x),side=i%2?1:-1,out=along+side*Math.PI/2.6,off=u.root?9:5;
 return {x:m.x+Math.cos(out)*off,y:m.y+Math.sin(out)*off,rot:out*180/Math.PI}}
function gwPaintGrove(){
 const s=gw.state;if(!gw.svg||gw.G.ids!==Object.keys(gwLayout(s.units).L).join(','))gwBuild();
 const G=gw.G,v=gw.view,sel=gwSel();const hl=gw.selCrit?((v.criteria.find(c=>c.id===gw.selCrit)||{}).units||[]):null;
 gw.svg.classList.toggle('dim',!!hl);
 const busy=new Set(s.agents.filter(a=>!a.done&&a.unit&&(s.phase===2||s.phase===3||s.phase===5)).map(a=>a.unit));
 for(const t of G.trunks)t.classList.toggle('on',s.trunkAt!==null);
 for(const u of s.units){if(!G.br[u.id])continue;G.br[u.id].classList.add('on');G.br[u.id].classList.toggle('tracing',busy.has(u.id));G.br[u.id].classList.toggle('hl',!!hl&&hl.includes(u.id));
  G.lbl[u.id].classList.add('on');G.lbl[u.id].classList.toggle('sel',sel===u.id);G.lbl[u.id].classList.toggle('hl',!!hl&&hl.includes(u.id));
  (v.depth[u.id]?v.depth[u.id].pips:[]).forEach((st,k)=>G.pips[u.id][k].setAttribute('class','pip '+st));
  const stopped=s.stops.some(x=>x.unit===u.id);if(G.dead[u.id]){G.dead[u.id].classList.toggle('on',stopped);G.deadLbl[u.id].classList.toggle('on',stopped)}}
 const per={};
 for(const sc of s.scenarios){const u=gwUnit(sc.unit);if(!u||!G.br[u.id])continue;const i=per[u.id]=(per[u.id]??-1)+1;let n=G.leaves[sc.id];
  if(!n){const p=gwLeaf(u,i);n=u.root?sv('circle',{cx:p.x.toFixed(1),cy:p.y.toFixed(1),r:4.6}):sv('path',{d:'M0 0 C4 -6 11 -6 14 0 C11 6 4 6 0 0Z',transform:'translate('+p.x.toFixed(1)+' '+p.y.toFixed(1)+') rotate('+p.rot.toFixed(0)+')'});
   n.append(sv('title',{},sc.title));n.style.transformBox='fill-box';n.style.transformOrigin='center';G.leaves[sc.id]=n;G.gLf.append(n);n.classList.add('sprout')}
  const r=s.run[sc.id];const st=!gwIn(sc)?'out':r?(r.st==='not_run'?'none':r.st):'in';
  n.setAttribute('class','lf '+st+(n.classList.contains('sprout')?' sprout':'')+(hl&&sc.criteria.includes(gw.selCrit)?' hl':''))}}
function growCursors(now){if(!gw.svg||!gw.state||gw.tree!=='grove')return;const s=gw.state;const G=gw.G;const keep=new Set();
 if(s.phase===2||s.phase===3||s.phase===5)for(const a of s.agents){if(a.done||!a.unit||!G.br[a.unit])continue;keep.add(a.id);const p=G.br[a.unit];const len=p.getTotalLength();
  const f=((now/1600)+a.id.charCodeAt(1)*.23)%1;const pt=p.getPointAtLength(len*(.15+.85*f));const c=G.cur[a.id]||(G.cur[a.id]=G.gCur.appendChild(sv('circle',{r:5,class:'cursor'})));c.setAttribute('cx',pt.x);c.setAttribute('cy',pt.y)}
 for(const id in G.cur)if(!keep.has(id)){G.cur[id].remove();delete G.cur[id]}}
function gwOutline(){const s=gw.state,v=gw.view,sel=gwSel();
 const row=u=>{if(gw.onlyGaps&&!v.gaps[u.id])return null;const d=v.depth[u.id]||{pips:[],score:0};
  const crit=v.criteria.filter(c=>c.units.includes(u.id)).map(c=>c.id);const drift=s.drift.some(x=>x.unit===u.id);
  const lv=s.scenarios.filter(x=>x.unit===u.id).map(x=>{const r=s.run[x.id];return h('i',{class:!gwIn(x)?'out':r?r.st:'',title:x.title})});
  return h('tr',{class:'u'+(sel===u.id?' sel':''),tabindex:0,'data-unit':u.id,on:{click:()=>{gw.pinned=u.id;growPaint()},keydown:e=>{if(e.key==='Enter'){gw.pinned=u.id;growPaint()}}}},
   h('td',{},h('div',{class:'nm'},(s.units.indexOf(u)+1)+' '+u.label),h('div',{class:'loc'},u.unitKind+' · '+u.loc)),
   h('td',{},h('span',{class:'gw-pips','aria-label':d.score+' of 5 checks'},d.pips.map(p=>h('i',{class:p}))),h('div',{class:'loc'},d.score+'/5')),
   h('td',{},h('div',{class:'gw-chips'},(s.cells[u.id]||[]).map(c=>h('span',{class:'gw-chip '+c.status,title:c.reason},GW.layers[c.layer])))),
   h('td',{class:'loc'},crit.length?crit.join(' '):drift?h('span',{class:'gw-chip indirect'},'not in spec'):'—'),
   h('td',{},h('span',{class:'gw-mini'},lv)))};
 const br=s.units.filter(u=>!u.root).map(row).filter(Boolean),rt=s.units.filter(u=>u.root).map(row).filter(Boolean);
 return h('div',{class:'scroll'},h('table',{class:'gw-ol','data-testid':'grow-outline'},h('thead',{},h('tr',{},['Part','Depth','Layers','Spec','Scenarios'].map(t=>h('th',{},t)))),
  h('tbody',{},!br.length&&!rt.length?h('tr',{},h('td',{colspan:5,class:'gw-empty'},gw.onlyGaps?'No gaps.':'Parts appear here as they are found.')):null,
   br.length?[h('tr',{class:'grp'},h('td',{colspan:5},'Branches · what people use')),br]:null,rt.length?[h('tr',{class:'grp'},h('td',{colspan:5},'Roots · what it depends on')),rt]:null)))}
function gwInspector(){const s=gw.state,v=gw.view,id=gwSel();
 const card=h('section',{class:'card gw-ins','aria-label':'Inspector','data-testid':'grow-inspector'});
 if(!id){gwPut(card,h('span',{class:'gw-eyebrow'},'Inspector'),h('p',{class:'gw-empty'},s.done?'Select a branch or root to see how deep tracing went.':'Follows the tracer as it works. Select a branch or root to pin it.'));return card}
 const u=gwUnit(id);if(!u)return card;const d=s.depth[id]||{};const dp=v.depth[id]||{pips:[],score:0};
 const ag=s.agents.find(a=>!a.done&&a.unit===id);
 gwPut(card,h('div',{class:'row',style:'justify-content:space-between'},h('span',{class:'who'},gw.pinned?'Pinned':'Following '+(ag?(ag.by==='rules'?'the rules':ag.by)+' · '+ag.brief:'the latest event')),gw.pinned?h('button',{class:'btn ghost sm',on:{click:()=>{gw.pinned=null;growPaint()}}},'Follow'):null),
  h('h3',{},u.label),h('div',{class:'where'},(u.root?'root':'branch')+' · '+u.unitKind+' · '+u.loc),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'How deep it went'),h('div',{class:'row',style:'gap:10px;margin-bottom:6px'},h('span',{class:'gw-pips'},dp.pips.map(p=>h('i',{class:p}))),h('b',{style:'font-weight:500;font-size:13px'},dp.score+' of 5 checks'),dp.pips.includes('stop')?h('span',{class:'gw-badge miss'},'stopped'):null),
   GW.steps.map(([k,label])=>{const e=d[k];const st=e?e.status:'wait';return h('div',{class:'gw-dp '+st},h('span',{class:'m'},{ok:'✓',none:'○',stop:'✕',wait:'·'}[st]),h('span',{class:'n'},label,e&&e.by!=='rules'?h('span',{class:'by'},e.by):null,e?h('small',{},e.loc+' · '+e.note):null))})),
  (s.cells[id]||[]).length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'How each layer is proved'),h('div',{class:'gw-lay'},(s.cells[id]||[]).flatMap(c=>[h('span',{class:'gw-chip '+c.status},GW.layers[c.layer]),h('span',{},c.reason,h('small',{},c.adapter==='none'?'no adapter':'adapter: '+c.adapter))]))):null,
  (()=>{const sc=s.scenarios.filter(x=>x.unit===id);return sc.length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Scenarios'),sc.map(x=>h('div',{class:'row',style:'justify-content:space-between;gap:8px;font-size:13px;padding:3px 0;'+(gwIn(x)?'':'opacity:.55')},h('span',{style:'min-width:0'},x.title),gwBadge(x)))):null})());
 return card}
function gwBadge(x){const r=gw.state.run[x.id];if(!gwIn(x))return h('span',{class:'gw-badge'},x.mode==='max'?'max':'standard');
 if(!r)return h('span',{class:'gw-badge'},'drafted');if(r.st==='run')return h('span',{class:'gw-badge run'},'running');if(r.st==='pass')return h('span',{class:'gw-badge pass'},'passed '+(r.ms/1000).toFixed(1)+' s');
 if(r.st==='fail')return h('span',{class:'gw-badge fail'},'failed');return h('span',{class:'gw-badge',title:r.why||''},x.flow?'not run':'no flow yet')}
function gwSpec(){const s=gw.state,v=gw.view;const card=h('section',{class:'card','aria-label':'Spec','data-testid':'grow-spec'});
 const t=v.summary;
 gwPut(card,h('div',{class:'row',style:'justify-content:space-between'},h('span',{class:'gw-eyebrow',style:'margin:0'},'Spec'),s.criteria.length?h('span',{class:'small muted'},t.proved+' proved · '+t.agentChecked+' agent-checked · '+t.needYou+' need you'):null),
  h('p',{class:'small muted',style:'margin:4px 0 8px'},s.spec?'From '+s.spec.source+', '+s.spec.via:s.specMissing?'No spec: '+s.specMissing:'Looking in the PR, linked issues and commits'),
  v.criteria.length?v.criteria.map(c=>h('button',{class:'gw-cr'+(gw.selCrit===c.id?' sel':''),'aria-pressed':gw.selCrit===c.id?'true':'false',on:{click:()=>{gw.selCrit=gw.selCrit===c.id?null:c.id;growPaint()}}},
   h('span',{class:'id'},c.id),h('span',{},c.text,h('small',{},s.unbuilt[c.id]?s.unbuilt[c.id]:c.units.length?'in '+c.units.map(id=>(gwUnit(id)||{}).label).join(', '):'')),h('span',{class:'gw-badge '+c.status.cls},c.status.text))):null,
  s.drift.map(d=>h('div',{class:'gw-flag'},h('b',{},'In the code, not in the spec: '+d.what),h('span',{},d.why+' ',h('span',{class:'mono small muted'},d.loc)))),
  s.stops.map(x=>h('div',{class:'gw-flag red'},h('b',{},'Tracing stopped at '+((gwUnit(x.unit)||{}).label||x.unit)),h('span',{},x.why+' ',h('span',{class:'mono small muted'},x.at)))),
  s.dropped.length?h('div',{class:'gw-flag red'},h('b',{},s.dropped.length+' agent claim'+(s.dropped.length===1?'':'s')+' dropped'),h('span',{},s.dropped.slice(0,3).map(x=>x.why).join('; ')+(s.dropped.length>3?'; and more':''))):null);
 return card}
function gwScenarios(){const s=gw.state,v=gw.view;const card=h('section',{class:'card','aria-label':'Scenarios','data-testid':'grow-scenarios'});
 const asked=s.asked&&!s.modeBy;const locked=!!s.modeBy;
 gwPut(card,h('div',{class:'row',style:'justify-content:space-between;margin-bottom:10px'},h('span',{class:'gw-eyebrow',style:'margin:0'},'Scenarios'),h('span',{class:'small muted'},s.scenarios.length?s.scenarios.filter(gwIn).length+' in '+GW.modes.find(m=>m.id===s.mode).label.toLowerCase()+' · '+s.scenarios.length+' drafted':'Drafted after tracing')),
  h('div',{class:'gw-modes'+(asked?' ask':''),role:'group','aria-label':'How much to prove'},GW.modes.map(m=>h('button',{'aria-pressed':String((locked?s.mode:(gw.picking||'min'))===m.id),disabled:!asked,
   on:{click:()=>{gw.picking=m.id;growPick(m.id)}}},h('b',{},m.label+' · '+v.counts[m.id]),h('span',{},m.blurb)))),
  h('p',{class:'small muted',style:'margin:8px 0 0'},asked?'Choose how much to prove. Tracing is done; nothing runs until you pick.':locked?'Mode: '+GW.modes.find(m=>m.id===s.mode).label+(s.modeBy==='you'?', your choice.':s.modeBy==='flag'?', set at start.':', the default.'):'You choose once scenarios are drafted.'));
 const groups=[['happy','Happy path'],['sad','Sad path'],['edge','Edge cases'],['regression','Regression']];
 for(const [k,label] of groups){const all=s.scenarios.filter(x=>x.scenarioKind===k);if(!all.length)continue;const vis=all.filter(gwIn),hid=all.length-vis.length;
  gwPut(card,h('div',{class:'gw-sgroup'},h('h4',{},h('span',{},label),h('span',{},vis.length+(hid?' · +'+hid+' in a larger mode':''))),vis.map(gwCard),!vis.length?h('p',{class:'gw-empty'},hid+' drafted for '+(k==='regression'?'Max':'Standard')):null))}
 return card}
function gwCard(x){const s=gw.state;const r=s.run[x.id];const u=gwUnit(x.unit);
 return h('div',{class:'gw-sc'+(r&&r.st==='fail'?' failed':'')},h('div',{class:'rw'},h('span',{class:'t'},x.title),gwBadge(x)),h('span',{class:'p'},x.proves),
  h('div',{class:'gw-chips'},x.mode==='min'?h('span',{class:'gw-chip min'},'minimum'):null,x.criteria.map(c=>h('span',{class:'gw-chip'},c)),x.layers.map(l=>h('span',{class:'gw-chip'},GW.layers[l])),
   u?h('span',{class:'gw-chip',title:u.loc},u.label):null,x.flow?h('span',{class:'gw-chip built',title:'Runs this existing flow'},x.flow):null,x.by!=='rules'?h('span',{class:'gw-chip agent'},'by '+x.by):null,
   x.ext.filter(e=>s.ext[e]&&s.ext[e].state!=='proven').map(e=>h('span',{class:'gw-chip agent',title:s.ext[e].path},'agent-written '+s.ext[e].extKind))),
  x.variants.length?gwLanes(x):null,r&&r.st==='fail'?h('div',{class:'err'},r.why||'failed'):null,r&&r.st==='not_run'&&r.why?h('span',{class:'small muted'},r.why):null)}
function gwLanes(x){const s=gw.state;const r=s.run[x.id],v=s.real[x.id];
 const mock=!r?h('span',{class:'gw-badge'},'waiting'):r.st==='run'?h('span',{class:'gw-badge run'},'running'):r.st==='pass'?h('span',{class:'gw-badge pass'},'passed '+(r.ms/1000).toFixed(1)+' s'):r.st==='fail'?h('span',{class:'gw-badge fail'},'failed'):h('span',{class:'gw-badge'},'not run');
 const real=x.mockOnly?h('span',{class:'gw-badge'},'mock only'):!v?h('span',{class:'gw-badge'},r&&r.st==='pass'?'next':'after mock'):v.st==='pass'?h('span',{class:'gw-badge pass'},'passed '+(v.ms/1000).toFixed(1)+' s'):h('span',{class:'gw-badge warn'},v.na?'mock only':'skipped');
 const note=x.mockOnly||(v&&v.note)||(x.realKey?'Runs against the provider sandbox when '+x.realKey+' is set':'No sandbox known for this provider yet');
 return h('div',{class:'gw-lanes'},h('div',{class:'gw-ln'},h('span',{class:'gw-chip'},'mock · stand-in'),mock,h('span',{class:'note'},'Every PR. Can fail, slow down or hang up on purpose.')),h('div',{class:'gw-ln'},h('span',{class:'gw-chip'},'real · sandbox'),real,h('span',{class:'note'},note)))}
function gwExt(){const s=gw.state;if(!s.extOrder.length)return null;const ids=s.extOrder;
 return h('section',{class:'card','aria-label':'Built by the agent','data-testid':'grow-agent-written'},h('div',{class:'row',style:'justify-content:space-between'},h('span',{class:'gw-eyebrow',style:'margin:0'},'Built by the agent'),
  h('span',{class:'small muted'},ids.filter(x=>s.ext[x].state==='proven').length+' proven · '+ids.filter(x=>s.ext[x].state==='review').length+' need review · '+ids.filter(x=>['unproven','draft'].includes(s.ext[x].state)).length+' not used for proof')),
  ids.map(x=>{const e=s.ext[x];const cls=e.state==='proven'?'pass':e.state==='review'?'warn':e.state==='draft'?'miss':'';
   return h('div',{class:'gw-xi'},h('div',{class:'hd'},h('span',{class:'k'},e.extKind),h('span',{class:'gw-badge '+cls},GW.ext[e.state]+(e.state==='proven'&&e.provenBy?' by '+((gwScen(e.provenBy)||{}).title||e.provenBy):''))),h('b',{style:'font-weight:500'},e.name),h('span',{class:'path'},e.path),h('span',{},e.why),h('span',{class:'need'},e.need))}))}
function gwStartCard(){const g=state.git;const a=state.agent.settings;const name=a.provider==='claude'?'Claude':a.provider==='codex'?'Codex':null;const available=!!(name&&state.agent.detected[a.provider]);
 if(!available)gw.agent=false;
 const branch=ui.source||g.current||'';
 return h('div',{class:'card gw-start','data-testid':'grow-start'},h('span',{class:'label'},'Grow a change'),
  h('h1',{style:'margin:0;font-size:26px;line-height:32px;max-width:none'},branch&&branch!==g.base?'What does '+branch+' change, and is it proved?':'Pick a branch to grow'),
  h('p',{class:'small muted',style:'margin:0'},'tracegrove reads the branch and its spec, grows the change as a tree, traces every part five ways, drafts happy, sad and edge scenarios, and proves them with real flows.'),
  h('div',{class:'opts'},h('label',{},h('input',{type:'checkbox',checked:gw.prove,on:{change:e=>{gw.prove=e.target.checked}}}),'Prove with real flows'),
   h('label',{title:available?'':'No agent installed; the rules trace everything'},h('input',{type:'checkbox',checked:gw.agent&&available,disabled:!available,on:{change:e=>{gw.agent=e.target.checked}}}),available?'Trace with '+name+' ('+(a.model||'CLI default')+')':'Rules only (no agent installed)'),
   h('label',{},'against ',h('input',{class:'mono',style:'min-height:34px;padding:0 8px;border:1px solid var(--line2);border-radius:6px;background:var(--paper);color:var(--ink);width:200px',value:gw.base||g.base||'',placeholder:g.base||'main',on:{input:e=>{gw.base=e.target.value}}}))),
  h('div',{class:'row'},h('button',{class:'btn','data-testid':'grow-go',disabled:gw.busy||!g.isRepo||!branch||branch===g.base,on:{click:growStart}},'Grow '+(branch||'this branch')),
   !g.isRepo?h('span',{class:'small muted'},'Not a git repo: grow compares a branch with its base.'):branch===g.base?h('span',{class:'small muted'},'This is the base branch. Pick a feature branch below.'):null))}
function growPaint(){if(!gw.el)return;const s=gw.state;const kids=[];
 if(!s){kids.push(gwStartCard());if(gw.busy)kids.push(h('p',{class:'row muted',style:'margin-top:12px'},h('span',{class:'think'},h('i'),h('i'),h('i')),'Reading the branch'));if(gw.error)kids.push(blocked(gw.error));gw.el.replaceChildren(...kids);return}
 const v=gw.view;const c=s.change;
 kids.push(h('div',{class:'gw-head'},h('div',{style:'min-width:0'},h('span',{class:'label'},'Grow · '+(c?c.branch+' → '+c.base:'reading')),h('h2',{},c?c.title:'Reading the branch'),
   h('div',{class:'sub'},c?((c.pr?'#'+c.pr+' · ':'')+c.files+' files · +'+c.adds+' −'+c.dels+(c.untraced?' · '+c.untraced+' small parts not traced':'')+(s.spec?' · spec: '+s.spec.source:'')):'')),
  h('div',{style:'text-align:right'},h('div',{class:'gw-clock'},gwFmt(s.done?s.ms:Date.now()-gw.t0)),s.done||!gw.busy?h('button',{class:'btn ghost sm',style:'margin-top:6px',disabled:gw.busy,on:{click:()=>{gw.state=null;growPaint()}}},'New grow'):null)));
 kids.push(h('div',{class:'gw-rail',role:'list','aria-label':'Phases'},GW.phases.map((p,i)=>{const cls=i<s.phase||s.done?'done':i===s.phase?'on':'';const st=s.phaseAt[i],en=s.phaseAt[i+1]??(s.done?s.ms:null);
  return h('div',{class:'ph '+cls,role:'listitem'},h('b',{},p),h('span',{},st===undefined?'waiting':i===4&&s.modeBy?GW.modes.find(m=>m.id===s.mode).label.toLowerCase():en!=null?((en-st)/1000).toFixed(1)+' s':'now'))})));
 const rules=s.agents.filter(a=>a.by==='rules'&&a.done&&a.ok),live=s.agents.filter(a=>!rules.includes(a)&&(!s.done||!a.ok||a.by!=='rules'));
 if(live.length||rules.length)kids.push(h('div',{class:'gw-agents','aria-live':'polite'},rules.length?h('div',{class:'gw-ag'},h('b',{},'✓ rules · '+rules.length+' lanes'),h('span',{},rules.reduce((n,a)=>n+a.units.length,0)+' parts traced from source')):null,live.map(a=>h('div',{class:'gw-ag'+(a.done?(a.ok?'':' bad'):' live')},h('b',{},(a.done?(a.ok?'✓ ':'✕ '):'')+(a.by==='rules'?'rules':a.model||a.by)+' · '+a.brief),h('span',{title:a.note},a.note)))));
 const tree=h('section',{class:'card gw-tree','aria-label':'Tree'},h('div',{class:'gw-bar'},h('span',{class:'gw-eyebrow',style:'margin:0'},s.units.length+' part'+(s.units.length===1?'':'s')+' · '+s.units.filter(u=>!u.root).length+' branches · '+s.units.filter(u=>u.root).length+' roots'),
  h('span',{class:'row',style:'gap:10px'},gw.tree==='outline'?h('label',{class:'small muted',style:'display:inline-flex;gap:6px;align-items:center'},h('input',{type:'checkbox',checked:gw.onlyGaps,on:{change:e=>{gw.onlyGaps=e.target.checked;growPaint()}}}),'Only gaps'):null,
   h('span',{class:'seg2',role:'group','aria-label':'View'},['grove','outline'].map(t=>h('button',{'aria-pressed':String(gw.tree===t),'data-testid':'grow-view-'+t,on:{click:()=>{gw.tree=t;try{localStorage.setItem('gw-tree',t)}catch(e){}growPaint()}}},t==='grove'?'Grove':'Outline'))))));
 if(gw.tree==='grove'){gwPaintGrove();tree.append(gw.svg)}else tree.append(gwOutline());
 kids.push(h('div',{class:'gw-main'},h('div',{style:'display:grid;gap:18px;min-width:0'},tree,gwScenarios()),h('div',{class:'gw-side'},gwInspector(),gwSpec(),gwExt())));
 if(s.blocked)kids.push(h('div',{class:'gw-result bad'},h('div',{},h('div',{class:'big'},'Stopped: '+s.blocked.code),h('div',{class:'sub'},s.blocked.detail+'. Fix: '+s.blocked.action))));
 if(s.done){const t=v.summary;const fail=s.scenarios.find(x=>s.run[x.id]&&s.run[x.id].st==='fail');
  kids.push(h('div',{class:'gw-result','data-testid':'grow-result'},h('div',{},h('div',{class:'big'},t.passed+' of '+t.scenarios+' scenarios proved'+(t.failed?', '+t.failed+' failed':'')+(t.notRun?', '+t.notRun+' not run yet':'')),
   h('div',{class:'sub'},(s.criteria.length?'Spec: '+t.proved+' of '+t.criteria+' criteria proved, '+t.agentChecked+' agent-checked, '+t.needYou+' need you. ':'No spec to check against. ')+(fail?'First failure: '+fail.title+'. ':'')+(t.toReview?t.toReview+' agent-written piece'+(t.toReview===1?'':'s')+' to review. ':'')+(gw.log?'Log: '+gw.log:''))),
   h('div',{class:'row'},fail?h('button',{class:'btn ghost sm',on:{click:()=>openTab('Heal')}},'Heal the failure'):null,h('button',{class:'btn ghost sm',on:{click:()=>openTab('Run')}},'Open the runs'))))}
 if(gw.error)kids.push(blocked(gw.error));
 gw.el.replaceChildren(...kids)}
`;
