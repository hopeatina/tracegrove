/**
 * The Discover tab's live view of `tracegrove grow`: the change's tree growing as events arrive
 * (branches for what people use, gold roots for what it depends on, a dashed red root where tracing
 * had to stop), an outline for large trees, an inspector that follows the tracer, the spec mapped both
 * ways, scenarios with mock and real lanes, and everything an agent wrote with its proof state.
 * The page renders the server's folded state; it never invents progress.
 *
 * The tree is drawn as a bonsai: a tapered trunk with movement seeded by the branch name, limbs as
 * filled ribbons that leave the trunk low and wide and climb shorter, foliage pads that sit on the
 * limbs, one leaf per scenario on its own twig, surface roots at the base, gold roots below the soil.
 * Labels sit in two columns off the tree, joined by hairline leaders, like a botanical plate.
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
.gw-rail.quiet{gap:4px;margin-bottom:14px}.gw-rail.quiet .ph{border-top-width:2px;padding-top:4px}.gw-rail.quiet .ph b{font-size:11.5px;color:var(--muted)}.gw-rail.quiet .ph span{font-size:11px}
.gw-stage{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:0 18px;align-items:start}
@media (max-width:1060px){.gw-stage{grid-template-columns:minmax(0,1fr)}}
.gw-tree{padding:12px 12px 6px;min-width:0}
.gw-tree .gw-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center;margin:0 4px 6px}
.gw-tree .seg2{display:inline-flex;border:1px solid var(--line2);border-radius:8px;overflow:hidden}
.gw-tree .seg2 button{border:0;background:var(--paper);min-height:32px;padding:0 12px;font-size:13px;color:var(--ink3)}
.gw-tree .seg2 button[aria-pressed=true]{background:var(--sel);color:var(--ink);font-weight:500}
.gw-legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin:2px 6px 6px;font:11.5px/16px var(--mono);color:var(--muted)}
.gw-legend i{display:inline-block;width:9px;height:9px;border-radius:2px 9px;vertical-align:-1px;margin-right:5px;border:1.5px solid var(--moss);background:var(--moss-bg)}
.gw-legend i.pass{background:var(--moss)}.gw-legend i.fail{background:var(--verm);border-color:var(--verm)}.gw-legend i.none{background:var(--paper);border-style:dashed}.gw-legend i.out{background:none;border-color:var(--line2)}.gw-legend i.gold{border-radius:50%;background:var(--gold);border-color:var(--gold)}
.gw-svg{display:block;width:100%;height:auto;overflow:visible}
.gw-svg .ground{stroke:var(--line2);stroke-width:1}
.gw-svg .soil{fill:url(#gw-soil);opacity:.5}
.gw-svg .glbl{font:500 10.5px var(--mono);letter-spacing:.08em;fill:var(--muted)}
.gw-svg .mk{fill:none;stroke:#fff;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1}
.gw-svg .mk.on{stroke-dashoffset:0}
.gw-svg .wood{fill:var(--trunk);transition:fill .3s}
.gw-svg .grain{fill:none;stroke:var(--paper);stroke-width:.8;opacity:.13;stroke-linecap:round}
.gw-svg .lit{fill:var(--paper);opacity:.09}
.gw-svg .edge{fill:none;stroke:var(--gold);stroke-width:1.4;opacity:0;transition:opacity .3s}
.gw-svg .unit.tracing .edge{opacity:1}
.gw-svg .root .wood{fill:var(--gold)}
.gw-svg .rootlet{fill:none;stroke:var(--gold);stroke-width:.9;opacity:.7;stroke-linecap:round}
.gw-svg .dead{fill:none;stroke:var(--verm);stroke-width:2.2;stroke-dasharray:6 6;stroke-linecap:round;opacity:0;transition:opacity .4s}
.gw-svg .dead.on{opacity:1}
.gw-svg .pad{opacity:0;transform-box:fill-box;transform-origin:center;transform:scale(.4)}
.gw-svg .pad.on{opacity:1;transform:scale(var(--k,1));transition:transform .6s}
.gw-svg .pad .back{fill:color-mix(in srgb,var(--moss) 20%,var(--paper));transition:fill .5s}
.gw-svg .pad .shade{fill:var(--moss);opacity:.11}
.gw-svg .pad.proved .back{fill:var(--new);opacity:.55}
.gw-svg .pad.failed .back{fill:var(--verm-bg)}
.gw-svg .pad.running .back{animation:gwpad 1.4s ease-in-out infinite}
@keyframes gwpad{0%,100%{fill:color-mix(in srgb,var(--moss) 20%,var(--paper))}50%{fill:var(--gold-bg)}}
.gw-svg .unit.sel .pad{filter:drop-shadow(0 0 6px var(--gold))}
.gw-svg .twig{fill:none;stroke:var(--trunk);stroke-width:1.1;stroke-linecap:round;opacity:.9}
.gw-svg .leader{fill:none;stroke:var(--line2);stroke-width:1;stroke-dasharray:1.5 3;opacity:0}.gw-svg .leader.on{opacity:1}
.gw-svg .lbl{opacity:0}.gw-svg .lbl.on{opacity:1}
.gw-svg .lbl text{font:500 12.5px var(--mono);fill:var(--ink)}
.gw-svg .lbl text.k{font:11px var(--mono);fill:var(--muted)}
.gw-svg .unit.sel .lbl text:first-child{fill:var(--gold);font-weight:600}
.gw-svg .deadlbl{font:500 11px var(--mono);fill:var(--verm);opacity:0;transition:opacity .45s}.gw-svg .deadlbl.on{opacity:1}
.gw-svg .pip{stroke-width:1.4}.gw-svg .pip.ok{fill:var(--moss);stroke:var(--moss)}.gw-svg .pip.none{fill:var(--paper);stroke:var(--moss)}.gw-svg .pip.stop{fill:var(--verm);stroke:var(--verm)}.gw-svg .pip.wait{fill:var(--line);stroke:var(--line2)}
.gw-svg .hit{cursor:pointer;outline:none}.gw-svg .hit:focus-visible .lbl text:first-child{text-decoration:underline}
.gw-svg .lf{stroke-width:1.1;transition:fill .4s,stroke .4s,opacity .4s}
.gw-svg .lf .rib{fill:none;stroke:var(--paper);stroke-width:.8;opacity:.55}
.gw-svg .lf.in{fill:var(--moss-bg);stroke:var(--moss)}.gw-svg .lf.pass{fill:var(--moss);stroke:var(--moss)}.gw-svg .lf.fail{fill:var(--verm);stroke:var(--verm)}
.gw-svg .lf.run{fill:var(--gold);stroke:var(--gold);animation:leaf 1s ease-in-out infinite}.gw-svg .lf.out{fill:none;stroke:var(--line2);opacity:.7}.gw-svg .lf.none{fill:var(--paper);stroke:var(--moss);stroke-dasharray:2.5 1.5}
.gw-svg .lf.in .rib,.gw-svg .lf.none .rib,.gw-svg .lf.out .rib{stroke:var(--moss);opacity:.35}
.gw-svg .cursor{fill:var(--gold);stroke:var(--paper);stroke-width:2}.gw-svg .halo{fill:var(--gold);opacity:.22}
.gw-svg.dim .unit:not(.hl){opacity:.18}
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
.gw-mini i.pass{background:var(--moss)}.gw-mini i.fail{background:var(--verm);border-color:var(--verm)}.gw-mini i.out{background:none;border-color:var(--line2)}.gw-mini i.run{background:var(--gold);border-color:var(--gold)}.gw-mini i.not_run,.gw-mini i.none{background:var(--paper);border-style:dashed}
.gw-chip{display:inline-flex;align-items:center;min-height:20px;padding:0 7px;border-radius:5px;font:500 11.5px/16px var(--mono);background:var(--sel);color:var(--ink2);border:1px solid transparent}
.gw-chip.built{background:var(--moss-bg);color:var(--moss)}.gw-chip.indirect{background:var(--gold-bg);color:var(--gold)}.gw-chip.missing{background:var(--verm-bg);color:var(--verm-ink)}
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
.gw-badge.run{background:var(--gold-bg);color:var(--gold)}.gw-badge.code,.gw-badge.cov{background:var(--indigo-bg);color:var(--indigo)}
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
.gw-sc summary:hover{background:var(--sel)}.gw-sc .t{flex:1;min-width:0}.gw-sc .body{display:grid;gap:6px;padding:2px 4px 12px 30px}
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
@media (max-width:760px){.gw-scrollx{overflow-x:auto;margin:0 -12px;padding:0 12px}.gw-scrollx .gw-svg{min-width:760px}.gw-head>div:last-child{text-align:left!important;display:flex;gap:12px;align-items:center}}
@media (max-width:640px){.gw-ol thead{display:none}.gw-ol tr.u{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 12px;padding:10px 8px;border-bottom:1px solid var(--line)}.gw-ol tr.u td{padding:0;border:0;background:none!important}.gw-ol tr.u.sel,.gw-ol tr.u:hover{background:var(--sel)}.gw-ol tr.u td:first-child{grid-column:1/-1}.gw-ol tr.grp td{display:block}.gw-ol .gw-chip{white-space:nowrap}.gw-rail{grid-template-columns:repeat(3,minmax(0,1fr))}.gw-ln{grid-template-columns:1fr}.gw-head h2{font-size:20px;line-height:26px}.gw-sgroup .list{padding-left:8px}}
@media (prefers-reduced-motion:reduce){.gw-svg .pad.on{transition:none}.gw-svg .lf.run,.gw-svg .pad.running .back,.gw-ag.live b::before{animation:none}}
`;

export const GROVE_JS = String.raw`
/* ---------- Grow: the change's tree, live ---------- */
const GW=${CONST};
const gw={el:null,svg:null,G:null,state:null,view:null,events:0,id:null,busy:false,error:null,log:null,tree:'grove',pinned:null,selCrit:null,onlyGaps:false,base:'',prove:true,agent:true,t0:0,raf:0,amp:12,ph:0};
try{const v=localStorage.getItem('gw-tree');if(v==='outline'||v==='grove')gw.tree=v;else if(window.innerWidth<700)gw.tree='outline'}catch(e){if(window.innerWidth<700)gw.tree='outline'}
function growPanel(){if(!gw.el)gw.el=h('section',{class:'gw','aria-label':'Grow this change','data-testid':'grow'});
 const branch=ui.source||state.git.current||'';if(!gw.busy&&!gw.state&&state.git.isRepo&&branch&&gw.lastFor!==branch){gw.lastFor=branch;growLast(branch)}
 growPaint();return gw.el}
/* A saved grow of this branch comes back on reload, marked as saved, instead of an empty start card. */
async function growLast(branch){try{const r=await fetch('/api/grow/last?branch='+encodeURIComponent(branch));const d=r.ok?await r.json():null;
 if(d&&!gw.busy&&!gw.state){gw.state=d.state;gw.view=d.view;gw.log=d.log;gw.saved=d.at;growPaint()}}catch(e){}}
async function growStart(){
 if(gw.busy)return;gw.busy=true;gw.saved=null;gw.error=null;gw.state=null;gw.view=null;gw.events=0;gw.id=null;gw.log=null;gw.pinned=null;gw.selCrit=null;gw.svg=null;gw.G=null;gw.t0=Date.now();growPaint();growTick();
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
const gwAt=(a,now)=>a.unit||(a.units.length?a.units[Math.floor(now/1600)%a.units.length]:null);
const gwSel=()=>gw.pinned||gw.state.focus||(gw.state.done?(gw.state.units.find(u=>gw.view.gaps[u.id])||gw.state.units[0]||{}).id:null);
const gwPut=(el,...k)=>{for(const x of k.flat(Infinity))if(x!==null&&x!==undefined&&x!==false)el.append(x)};
const gwDur=ms=>ms<1000?Math.round(ms)+' ms':(ms/1000).toFixed(1)+' s';
const gwCut=(t,n)=>t.length>n?t.slice(0,n-1)+'…':t;
/* The state of a part's scenarios in the chosen mode, for its pad and its summary line. */
function gwUnitRun(id){const s=gw.state;const sc=s.scenarios.filter(x=>x.unit===id&&gwIn(x));const st=x=>{const r=s.run[x.id];return r?r.st:'in'};
 const n={pass:0,fail:0,run:0,none:0,in:0};for(const x of sc){const k=st(x);n[k==='not_run'?'none':k]=(n[k==='not_run'?'none':k]||0)+1}
 return {sc,n,cls:n.fail?'failed':n.run?'running':sc.length&&n.pass===sc.length?'proved':''}}

/* Growth runs through the Web Animations API, once per element: unlike a CSS transition it survives the page re-rendering around the tree. */
const gwQuiet=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
function gwGrow(el,frames,ms,delay,ease){if(!el||el.__grown)return;el.__grown=true;if(gwQuiet()||!el.animate)return;el.animate(frames,{duration:ms,delay:delay||0,easing:ease||'cubic-bezier(.2,.7,.2,1)',fill:'backwards'})}
/* ----- Geometry: a bonsai from the change's parts ----- */
const gwHash=s=>{let x=2166136261;for(let i=0;i<s.length;i++)x=Math.imul(x^s.charCodeAt(i),16777619);return (x>>>0)/4294967296};
/* The trunk's movement: an S-curve whose amplitude and phase come from the branch name, so each change has its own posture and keeps it between runs. */
const gwSway=(X,GY,TOP,y)=>{const f=Math.max(0,GY-y)/Math.max(1,GY-TOP);return X+gw.amp*Math.sin(f*Math.PI*1.25+gw.ph)+gw.amp*.35*Math.sin(f*Math.PI*2.9+gw.ph*2)};
const gwCubic=(p,t)=>{const u=1-t;return [u*u*u*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t*t*t*p[3][0],u*u*u*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t*t*t*p[3][1]]};
const gwPts=(p,n)=>Array.from({length:n+1},(_,i)=>gwCubic(p,i/n));
const gwD=pts=>'M'+pts.map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' L');
const gwNorm=(pts,i)=>{const n=pts.length-1;const a=pts[Math.max(0,i-1)],b=pts[Math.min(n,i+1)];const dx=b[0]-a[0],dy=b[1]-a[1],m=Math.hypot(dx,dy)||1;return [-dy/m,dx/m]};
/* A limb as a filled ribbon: width wf(t) across a sampled centreline, the left edge out and the right edge back. */
function gwRibbon(pts,wf){const L=[],R=[];const n=pts.length-1;for(let i=0;i<=n;i++){const [nx,ny]=gwNorm(pts,i);const w=wf(i/n)/2;L.push([pts[i][0]+nx*w,pts[i][1]+ny*w]);R.push([pts[i][0]-nx*w,pts[i][1]-ny*w])}
 return gwD(L)+' L'+R.reverse().map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' L')+'Z'}
/* A line that follows the centreline at a fraction k of the width: the wood grain. */
const gwGrain=(pts,wf,k)=>gwD(pts.map((q,i)=>{const [nx,ny]=gwNorm(pts,i);const w=wf(i/(pts.length-1))/2*k;return [q[0]+nx*w,q[1]+ny*w]}));
/* A band between two fractions of the width: the side the light falls on. */
function gwBand(pts,wf,k1,k2){const n=pts.length-1;const A=[],B=[];for(let i=0;i<=n;i++){const [nx,ny]=gwNorm(pts,i);const w=wf(i/n)/2;A.push([pts[i][0]+nx*w*k1,pts[i][1]+ny*w*k1]);B.push([pts[i][0]+nx*w*k2,pts[i][1]+ny*w*k2])}return gwD(A)+' L'+B.reverse().map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' L')+'Z'}
/* A gentle wiggle across a sampled centreline, so no limb is a clean bezier. */
const gwWiggle=(pts,seed,a)=>pts.map((q,i)=>{const t=i/(pts.length-1);const [nx,ny]=gwNorm(pts,i);const d=a*Math.sin(t*6.3+seed*6)*Math.sin(t*Math.PI);return [q[0]+nx*d,q[1]+ny*d]});
const gwAlong=(pts,f)=>{const n=pts.length-1;const i=Math.min(n-1,Math.max(0,Math.floor(f*n)));const t=f*n-i;const a=pts[i],b=pts[i+1];return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,ang:Math.atan2(b[1]-a[1],b[0]-a[0])}};
/* Layout for any tree: limbs alternate sides; the lowest leaves the trunk lowest and reaches widest, the highest shortest, so the silhouette tapers and limbs never cross. */
function gwLayout(units){
 const br=units.filter(u=>!u.root).slice(0,14),rt=units.filter(u=>u.root).slice(0,8);
 const crown=br.length%2===1?br[br.length-1]:null;const sides=br.filter(u=>u!==crown);
 const per=[sides.filter((_,i)=>i%2===0),sides.filter((_,i)=>i%2===1)];const most=Math.max(1,per[0].length,per[1].length);
 const X=500,STEP=66,TOP=crown?130:80,GY=TOP+(sides.length?Math.max(230,(most-1)*STEP+140):150),L={};
 per.forEach((list,side)=>{const dir=side===0?-1:1,n=list.length,col=X+dir*266;
  list.forEach((u,j)=>{const lift=n>1?j/(n-1):.5,seed=gwHash(u.id);
   const yt=Math.round(GY-96-side*STEP/2-j*STEP);const ya=Math.round(GY-40-lift*(GY-40-TOP-40)*.78-side*16);const xa=gwSway(X,GY,TOP,ya);
   const reach=232-lift*92-side*10+seed*16,xt=X+dir*reach;
   const p=[[xa-dir*8,ya],[xa+dir*(44+lift*18),ya+20-lift*44],[xt-dir*(92-lift*22),yt+38-lift*22],[xt,yt]];
   L[u.id]={pts:gwWiggle(gwPts(p,28),seed,2.2),w0:Math.max(4.5,9.6-lift*4.2),w1:1.5,tip:[xt,yt],col,anchor:dir<0?'end':'start',dir,lift,seed}})});
 if(crown){const y0=TOP+10,cx=gwSway(X,GY,TOP,y0),seed=gwHash(crown.id);const p=[[cx,y0+8],[cx-4,TOP-26],[cx+11,TOP-54],[cx+5,TOP-92]];
  L[crown.id]={pts:gwWiggle(gwPts(p,20),seed,1.6),w0:5.2,w1:1.5,tip:[cx+5,TOP-92],col:cx+62,anchor:'start',dir:1,lift:1,seed,crown:true}}
 const deep=Math.ceil(rt.length/2);
 rt.forEach((u,j)=>{const dir=j%2===0?-1:1,k=Math.floor(j/2),seed=gwHash(u.id);const xt=X+dir*(232-k*20),yt=GY+56+k*62;
  const p=[[X+dir*2,GY+2],[X+dir*(32+seed*16),GY+40+k*8],[xt-dir*96,yt-6],[xt,yt]];
  L[u.id]={pts:gwWiggle(gwPts(p,24),seed,2),w0:5.6,w1:1.2,tip:[xt,yt],col:X+dir*266,anchor:dir<0?'end':'start',dir,root:true,seed,
   dead:'M'+xt+' '+yt+' C'+(xt-dir*14)+' '+(yt+20)+' '+(xt-dir*30)+' '+(yt+34)+' '+(xt-dir*54)+' '+(yt+46),deadAt:[xt-dir*60,yt+64]}});
 const H=rt.length?GY+56+(deep-1)*62+70:GY+48;
 const ys=Object.values(L).filter(g=>!g.root&&!g.crown).map(g=>g.pts[0][1]);
 return {L,H,X,GY,TOP,top:crown?TOP+10:Math.min(GY-40,...ys)-12,hidden:units.length-br.length-rt.length}}
function gwBuild(){
 const s=gw.state;const seed=gwHash((s.change&&s.change.branch)||'grove');gw.amp=(9+8*seed)*Math.min(1,.45+.06*s.units.filter(u=>!u.root).length);gw.ph=(gwHash('ph'+((s.change&&s.change.branch)||''))-.5)*.9;
 const lay=gwLayout(s.units);
 const svg=sv('svg',{class:'gw-svg',viewBox:'0 0 1000 '+lay.H,role:'img','aria-label':'The change as a bonsai: branches are what people use, roots are what it depends on'});
 const defs=sv('defs',{},sv('linearGradient',{id:'gw-soil',x1:0,y1:0,x2:0,y2:1},sv('stop',{offset:0,'stop-color':'var(--soil)'}),sv('stop',{offset:1,'stop-color':'var(--soil)','stop-opacity':0})));
 svg.append(defs,sv('rect',{x:40,y:lay.GY,width:920,height:26,class:'soil'}),sv('line',{x1:40,y1:lay.GY,x2:960,y2:lay.GY,class:'ground'}),
  sv('text',{x:960,y:lay.GY-10,'text-anchor':'end',class:'glbl'},'↑ BRANCHES · WHAT PEOPLE USE'),sv('text',{x:960,y:lay.GY+22,'text-anchor':'end',class:'glbl'},'↓ ROOTS · WHAT IT DEPENDS ON'));
 const G={lay,ids:Object.keys(lay.L).join(','),unit:{},mask:{},pad:{},lbl:{},leader:{},pips:{},dead:{},deadLbl:{},leaves:{},per:{},cur:{},gTrunk:sv('g',{}),gUnits:sv('g',{}),gCur:sv('g',{})};
 /* The trunk: one tapered ribbon with a flared base, three grain lines, revealed from the soil up by a mask. */
 const tpts=[];for(let y=lay.GY+8;y>=lay.top;y-=5)tpts.push([gwSway(lay.X,lay.GY,lay.TOP,y),y]);tpts.push([gwSway(lay.X,lay.GY,lay.TOP,lay.top),lay.top]);
 const nb=s.units.filter(u=>!u.root).length,kt=Math.min(1,.5+.045*nb);const tw=t=>(6+16*Math.pow(1-t,1.15)+15*Math.exp(-t*14))*kt;
 G.mask.trunk=sv('path',{d:gwD(tpts),class:'mk','stroke-width':64,pathLength:1});
 defs.append(sv('mask',{id:'gw-mk-trunk',maskUnits:'userSpaceOnUse'},G.mask.trunk));
 const trunk=sv('g',{mask:'url(#gw-mk-trunk)'},sv('path',{d:gwRibbon(tpts,tw),class:'wood'}),sv('path',{d:gwBand(tpts.slice(4),t=>tw(t),-.62,-.3),class:'lit'}),[-.1,.38].map(k=>sv('path',{d:gwGrain(tpts.slice(5),tw,k),class:'grain'})));
 /* Surface roots at the base, two each side, so the trunk stands rather than floats. */
 [-1,1].forEach(dir=>[0,1].forEach(j=>{const p=[[lay.X+dir*(2+j*3),lay.GY-14+j*6],[lay.X+dir*(16+j*6),lay.GY-6+j*4],[lay.X+dir*(30+j*10),lay.GY+1+j*3],[lay.X+dir*(44+j*18),lay.GY+8+j*4]];trunk.append(sv('path',{d:gwRibbon(gwWiggle(gwPts(p,12),j+dir,.8),t=>((j?7:9)*Math.pow(1-t,1.3)+1)*kt),class:'wood'}))}));
 if(!s.units.some(u=>lay.L[u.id]&&lay.L[u.id].crown)){const ax=gwSway(lay.X,lay.GY,lay.TOP,lay.top);G.tuft=sv('g',{class:'pad tuft'},sv('ellipse',{cx:ax-9,cy:lay.top-2,rx:14,ry:8,class:'back'}),sv('ellipse',{cx:ax+4,cy:lay.top-8,rx:16,ry:9,class:'back'}),sv('ellipse',{cx:ax+12,cy:lay.top-1,rx:11,ry:6,class:'back'}));trunk.append(G.tuft)}
 G.gTrunk.append(trunk);
 s.units.forEach((u,i)=>{const g=lay.L[u.id];if(!g)return;
  const unit=sv('g',{class:'unit hit'+(g.root?' root':''),'data-unit':u.id,tabindex:0,role:'button','aria-label':u.label+', '+(g.root?'root':'branch')});
  const centre=gwD(g.pts);
  unit.append(sv('path',{d:centre,stroke:'transparent','stroke-width':22,fill:'none'}));
  G.mask[u.id]=sv('path',{d:centre,class:'mk','stroke-width':g.root?26:40,pathLength:1});defs.append(sv('mask',{id:'gw-mk-'+u.id,maskUnits:'userSpaceOnUse'},G.mask[u.id]));
  const wf=t=>g.w0+(g.w1-g.w0)*Math.pow(t,.8)+.4*Math.sin(t*19+g.seed*9);
  const limb=sv('g',{mask:'url(#gw-mk-'+u.id+')'},sv('path',{d:gwRibbon(g.pts,wf),class:'wood'}),sv('path',{d:centre,class:'edge'}));
  if(g.root)[.45,.72].forEach((f,k)=>{const m=gwAlong(g.pts,f);const dir=g.dir,dy=k?-1:1;limb.append(sv('path',{d:'M'+m.x.toFixed(1)+' '+m.y.toFixed(1)+' c'+(dir*6)+' '+(dy*8)+' '+(dir*14)+' '+(dy*12)+' '+(dir*26)+' '+(dy*14),class:'rootlet'}))});
  else limb.append(sv('path',{d:gwGrain(g.pts.slice(0,22),wf,-.3),class:'grain'}));
  unit.append(limb);
  /* A foliage pad sits on the outer third of each limb: a soft cloud behind, a shade in front, scaled by how many scenarios it carries. */
  if(!g.root){const blobs=g.crown?[[.72,-6,20,13],[.86,-10,24,15],[.98,-4,22,13],[.9,4,16,9]]:[[.62,-5,22,10],[.75,-10,27,13],[.87,-9,30,14],[.98,-3,24,12],[.8,2,20,8]];
   const at=([f,dy,rx,ry])=>{const m=gwAlong(g.pts,f);return {cx:m.x,cy:m.y+dy,rx,ry}};
   const pad=sv('g',{class:'pad'},blobs.map(b=>sv('ellipse',{...at(b),class:'back'})),blobs.slice(1,3).map(b=>{const e=at(b);return sv('ellipse',{cx:e.cx+4,cy:e.cy+5,rx:e.rx*.7,ry:e.ry*.6,class:'shade'})}),blobs.slice(1,3).map(b=>{const e=at(b);return sv('ellipse',{cx:e.cx-5,cy:e.cy-5,rx:e.rx*.55,ry:e.ry*.45,class:'lit'})}));
   G.pad[u.id]=pad;unit.insertBefore(pad,limb)}
  G.leaves[u.id]=sv('g',{});limb.append(G.leaves[u.id]);
  /* Labels in a column off the tree, joined to the tip by a hairline leader. */
  const [x,y]=g.tip;const lx=g.col;const dir=g.dir;
  G.leader[u.id]=sv('path',{d:'M'+(x+dir*(g.root?14:26)).toFixed(1)+' '+(g.root?y:y-4)+' L'+(lx-dir*8)+' '+(g.root?y:y-4),class:'leader'});unit.append(G.leader[u.id]);
  const lb=sv('g',{class:'lbl'});
  lb.append(sv('text',{x:lx,y:y,'text-anchor':g.anchor},sv('title',{},u.label),(i+1)+'  '+gwCut(u.label,26)),sv('text',{x:lx,y:y+15,'text-anchor':g.anchor,class:'k'},gwCut(u.unitKind+' · '+u.loc.split('/').pop(),32)));
  const px=g.anchor==='end'?lx-50:lx;G.pips[u.id]=GW.steps.map((_,k)=>{const c=sv('circle',{cx:px+5+k*10,cy:y+27,r:3.6,class:'pip wait'});lb.append(c);return c});
  G.lbl[u.id]=lb;unit.append(lb);
  if(g.dead){G.dead[u.id]=sv('path',{d:g.dead,class:'dead'});G.deadLbl[u.id]=sv('text',{x:g.deadAt[0],y:g.deadAt[1],'text-anchor':dir<0?'end':'start',class:'deadlbl'},'tracing stopped here');unit.append(G.dead[u.id],G.deadLbl[u.id])}
  G.unit[u.id]=unit;G.gUnits.append(unit)});
 if(lay.hidden>0)G.gUnits.append(sv('text',{x:960,y:lay.GY-28,'text-anchor':'end',class:'more'},'+'+lay.hidden+' more in Outline'));
 svg.append(G.gTrunk,G.gUnits,G.gCur);
 const pick=e=>{const t=e.target.closest('[data-unit]');if(t){gw.pinned=t.getAttribute('data-unit');growPaint()}};
 svg.addEventListener('click',pick);svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){pick(e);e.preventDefault()}});
 G.fresh=true;gw.svg=svg;gw.G=G}
/* Where the i-th scenario of a part grows: on a short twig off the outer third of the limb, mostly on top, as pads grow; a nodule along a root. */
function gwTwig(g,i){const f=g.root?.42+((i*.37+g.seed)%1)*.5:.66+((i*.41+g.seed)%1)*.32;const m=gwAlong(g.pts,f);
 if(g.root){const [nx,ny]=[-Math.sin(m.ang),Math.cos(m.ang)];const side=i%2?1:-1;return {x:m.x,y:m.y,ex:m.x+nx*side*5,ey:m.y+ny*side*5,rot:0}}
 const up=g.dir<0?1:-1;const side=(i%3===2)?-up:up;const out=m.ang+side*(Math.PI/2.4+(((i*.29+g.seed)%1)-.5)*.7);const len=7+(i%3)*3;
 return {x:m.x,y:m.y,ex:m.x+Math.cos(out)*len,ey:m.y+Math.sin(out)*len,rot:out*180/Math.PI,k:1+(i%3)*.12}}
function gwPaintGrove(){
 const s=gw.state;if(!gw.svg||gw.G.ids!==Object.keys(gwLayout(s.units).L).join(','))gwBuild();
 const G=gw.G,v=gw.view,sel=gwSel();const hl=gw.selCrit?((v.criteria.find(c=>c.id===gw.selCrit)||{}).units||[]):null;
 gw.svg.classList.toggle('dim',!!hl);
 const busy=new Set(s.agents.filter(a=>!a.done&&(s.phase===2||s.phase===3||s.phase===5)).map(a=>gwAt(a,Date.now())).filter(Boolean));
 if(s.trunkAt!==null){G.mask.trunk.classList.add('on');gwGrow(G.mask.trunk,[{strokeDashoffset:1},{strokeDashoffset:0}],1400,0);if(G.tuft){G.tuft.classList.add('on');gwGrow(G.tuft,[{opacity:0,transform:'scale(.4)'},{opacity:1,transform:'scale(1)'}],900,1100,'cubic-bezier(.2,.8,.3,1.15)')}}
 for(const u of s.units){const unit=G.unit[u.id];if(!unit)continue;const g=G.lay.L[u.id];
  const i=s.units.indexOf(u),wait=G.fresh?300+i*90:120;
  G.mask[u.id].classList.add('on');gwGrow(G.mask[u.id],[{strokeDashoffset:1},{strokeDashoffset:0}],1200,wait);
  G.lbl[u.id].classList.add('on');gwGrow(G.lbl[u.id],[{opacity:0},{opacity:1}],450,wait+700);G.leader[u.id].classList.add('on');gwGrow(G.leader[u.id],[{opacity:0},{opacity:1}],450,wait+700);
  unit.classList.toggle('tracing',busy.has(u.id));unit.classList.toggle('sel',sel===u.id);unit.classList.toggle('hl',!!hl&&hl.includes(u.id));
  (v.depth[u.id]?v.depth[u.id].pips:[]).forEach((st,k)=>G.pips[u.id][k].setAttribute('class','pip '+st));
  const stopped=s.stops.some(x=>x.unit===u.id);if(G.dead[u.id]){G.dead[u.id].classList.toggle('on',stopped);G.deadLbl[u.id].classList.toggle('on',stopped);if(stopped){gwGrow(G.dead[u.id],[{opacity:0},{opacity:1}],500,wait+1100);gwGrow(G.deadLbl[u.id],[{opacity:0},{opacity:1}],500,wait+1400)}}
  if(G.pad[u.id]){const run=gwUnitRun(u.id);const pad=G.pad[u.id];const k=Math.min(1.35,.82+.09*s.scenarios.filter(x=>x.unit===u.id).length);pad.classList.add('on');pad.style.setProperty('--k',String(k));gwGrow(pad,[{opacity:0,transform:'scale(.4)'},{opacity:1,transform:'scale('+k+')'}],1000,wait+500,'cubic-bezier(.2,.8,.3,1.15)');
   for(const c of ['proved','failed','running'])pad.classList.toggle(c,run.cls===c)}
  G.per[u.id]=-1}
 for(const sc of s.scenarios){const u=gwUnit(sc.unit);if(!u||!G.unit[u.id])continue;const g=G.lay.L[u.id];const i=G.per[u.id]=(G.per[u.id]??-1)+1;let n=G.leaves[sc.id];
  if(!n){const p=gwTwig(g,i);
   if(g.root){n=sv('circle',{cx:0,cy:0,r:4.4});n.append(sv('title',{},sc.title));G.leaves[u.id].append(sv('g',{transform:'translate('+p.ex.toFixed(1)+' '+p.ey.toFixed(1)+')'},n))}
   else{G.leaves[u.id].append(sv('path',{d:'M'+p.x.toFixed(1)+' '+p.y.toFixed(1)+' L'+p.ex.toFixed(1)+' '+p.ey.toFixed(1),class:'twig'}));
    n=sv('g',{},sv('path',{d:'M0 0 C3.5 -4.4 10 -5 14 0 C10 5 3.5 4.4 0 0Z'}),sv('path',{d:'M1.5 0 L12 0',class:'rib'}),sv('title',{},sc.title));
    G.leaves[u.id].append(sv('g',{transform:'translate('+p.ex.toFixed(1)+' '+p.ey.toFixed(1)+') rotate('+p.rot.toFixed(0)+') scale('+p.k.toFixed(2)+')'},n))}
   n.style.transformBox='fill-box';n.style.transformOrigin=g.root?'center':'left center';G.leaves[sc.id]=n;gwGrow(n,[{transform:'scale(0)'},{transform:'scale(1)'}],500,G.fresh?900+s.units.indexOf(u)*90+i*60:0,'cubic-bezier(.2,.8,.3,1.3)')}
  const r=s.run[sc.id];const st=!gwIn(sc)?'out':r?(r.st==='not_run'?'none':r.st):'in';
  n.setAttribute('class','lf '+st)}}
function growCursors(now){if(!gw.svg||!gw.state||gw.tree!=='grove')return;const s=gw.state;const G=gw.G;const keep=new Set();
 if(s.phase===2||s.phase===3||s.phase===5)for(const a of s.agents){const at=gwAt(a,now+performance.timeOrigin);if(a.done||!at||!G.lay.L[at])continue;keep.add(a.id);const pts=G.lay.L[at].pts;
  const f=((now/1600)+a.id.charCodeAt(1)*.23)%1;const pt=gwAlong(pts,.12+.86*f);const c=G.cur[a.id]||(G.cur[a.id]=G.gCur.appendChild(sv('g',{},sv('circle',{r:11,class:'halo'}),sv('circle',{r:4.5,class:'cursor'}))));c.setAttribute('transform','translate('+pt.x.toFixed(1)+' '+pt.y.toFixed(1)+')')}
 for(const id in G.cur)if(!keep.has(id)){G.cur[id].remove();delete G.cur[id]}}
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
function gwInspector(){const s=gw.state,v=gw.view,id=gwSel();
 const card=h('aside',{class:'gw-ins','aria-label':'Inspector','data-testid':'grow-inspector'});
 if(!id){gwPut(card,h('span',{class:'gw-eyebrow'},'Inspector'),h('p',{class:'gw-empty'},s.done?'Select a branch or root to see how deep tracing went.':'Follows the tracer as it works. Select a branch or root to pin it.'));return card}
 const u=gwUnit(id);if(!u)return card;const d=s.depth[id]||{};const dp=v.depth[id]||{pips:[],score:0};
 const ag=s.agents.find(a=>!a.done&&a.unit===id);
 gwPut(card,h('div',{class:'row',style:'justify-content:space-between'},h('span',{class:'who'},gw.pinned?'Pinned':s.done&&!s.focus?(v.gaps[id]?'The first part with a gap':'The first part'):'Following '+(ag?(ag.by==='rules'?'the rules':ag.by)+' · '+ag.brief:'the latest event')),gw.pinned?h('button',{class:'btn ghost sm',on:{click:()=>{gw.pinned=null;growPaint()}}},'Follow'):null),
  h('h3',{},u.label),h('div',{class:'where'},(u.root?'root':'branch')+' · '+u.unitKind+' · '+u.loc),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'How deep it went'),h('div',{class:'row',style:'gap:10px;margin-bottom:6px'},h('span',{class:'gw-pips'},dp.pips.map(p=>h('i',{class:p}))),h('b',{style:'font-weight:500;font-size:13px'},dp.score+' of 5 checked · '+dp.pips.filter(p=>p==='ok').length+' found'),dp.pips.includes('stop')?h('span',{class:'gw-badge miss'},'stopped'):null),
   GW.steps.map(([k,label])=>{const e=d[k];const st=e?e.status:'wait';return h('div',{class:'gw-dp '+st},h('span',{class:'m'},{ok:'✓',none:'○',stop:'✕',wait:'·'}[st]),h('span',{class:'n'},label,e&&e.by!=='rules'?h('span',{class:'by'},e.by):null,e?h('small',{},e.loc+' · '+e.note):null))})),
  (s.cells[id]||[]).length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'How each layer is proved'),h('div',{class:'gw-lay'},(s.cells[id]||[]).flatMap(c=>[h('span',{class:'gw-chip '+c.status},GW.layers[c.layer]),h('span',{},c.reason,h('small',{},c.adapter==='none'?'no adapter':'adapter: '+c.adapter))]))):null,
  (()=>{const sc=s.scenarios.filter(x=>x.unit===id);return sc.length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Scenarios'),sc.map(x=>h('div',{class:'row',style:'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap;gap:8px;font-size:13px;padding:3px 0;'+(gwIn(x)?'':'opacity:.55')},h('span',{style:'min-width:0;flex:1'},x.title),gwBadge(x)))):null})());
 return card}
function gwBadge(x){const r=gw.state.run[x.id];if(!gwIn(x))return h('span',{class:'gw-badge'},x.mode==='max'?'max':'standard');
 if(!r)return h('span',{class:'gw-badge'},'drafted');if(r.st==='run')return h('span',{class:'gw-badge run'},'running');if(r.st==='pass')return h('span',{class:'gw-badge pass'},'passed '+gwDur(r.ms));
 if(r.st==='fail')return h('span',{class:'gw-badge fail'},'failed');return h('span',{class:'gw-badge',title:r.why||''},x.flow?'not run':'no flow yet')}
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
/* Scenarios grouped by part. Only the selected part and parts with a failure start open; the rest show their count and leaves. */
function gwScenarios(){const s=gw.state,v=gw.view;const card=h('section',{class:'card','aria-label':'Scenarios','data-testid':'grow-scenarios'});
 const asked=s.asked&&!s.modeBy;const locked=!!s.modeBy;const sel=gwSel();
 gwPut(card,h('div',{class:'row',style:'justify-content:space-between;margin-bottom:10px'},h('span',{class:'gw-eyebrow',style:'margin:0'},'Scenarios'),h('span',{class:'small muted'},s.scenarios.length?s.scenarios.filter(gwIn).length+' in '+GW.modes.find(m=>m.id===s.mode).label.toLowerCase()+' · '+s.scenarios.length+' drafted':'Drafted after tracing')),
  h('div',{class:'gw-modes'+(asked?' ask':locked?' set':''),'data-testid':'grow-modes',role:'group','aria-label':'How much to prove'},GW.modes.map(m=>h('button',{'data-testid':'grow-mode-'+m.id,'aria-pressed':String((locked?s.mode:(gw.picking||'min'))===m.id),disabled:!asked,
   on:{click:()=>{gw.picking=m.id;growPick(m.id)}}},h('b',{},m.label+' · '+v.counts[m.id]),h('span',{},m.blurb)))),
  h('p',{class:'small muted','data-testid':'grow-mode-hint',style:'margin:8px 0 0'},asked?'Choose how much to prove. Tracing is done; nothing runs until you pick.':locked?'Mode: '+GW.modes.find(m=>m.id===s.mode).label+(s.modeBy==='you'?', your choice.':s.modeBy==='flag'?', set at start.':', the default.'):'You choose once scenarios are drafted.'));
 const parts=[];for(const x of s.scenarios){let g=parts.find(p=>p.unit===x.unit);if(!g)parts.push(g={unit:x.unit,list:[]});g.list.push(x)}
 for(const g of parts){const u=gwUnit(g.unit);const vis=g.list.filter(gwIn),hid=g.list.length-vis.length;if(!u)continue;const run=gwUnitRun(u.id);
  const words=[run.n.pass?run.n.pass+' passed':null,run.n.fail?run.n.fail+' failed':null,run.n.run?run.n.run+' running':null,run.n.none?run.n.none+' no flow':null,run.n.in&&!s.done?run.n.in+' drafted':null].filter(Boolean).join(' · ');
  gwPut(card,h('details',{class:'gw-sgroup',open:(sel===u.id||run.n.fail>0)?true:null},h('summary',{},h('span',{class:'car'},'▶'),h('span',{class:'n'},(s.units.indexOf(u)+1)+'  '+u.label),
    h('span',{class:'gw-mini'},g.list.map(x=>{const r=s.run[x.id];return h('i',{class:!gwIn(x)?'out':r?r.st:'',title:x.title})})),h('span',{class:'c'},(words||vis.length+' in this mode')+(hid?' · +'+hid+' in a larger mode':''))),
   h('div',{class:'list'},vis.map(gwCard),!vis.length?h('p',{class:'gw-empty'},hid+' drafted for a larger mode'):null)))}
 return card}
function gwCard(x){const s=gw.state;const r=s.run[x.id];const st=r?r.st:'';
 const dot=h('i',{class:'gw-dot '+(st==='pass'?'pass':st==='fail'?'fail':st==='run'?'run':'')});
 return h('details',{class:'gw-sc'+(st==='fail'?' failed':''),open:st==='fail'?true:null},h('summary',{},dot,h('span',{class:'gw-kind'},x.scenarioKind),h('span',{class:'t'},x.title),
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
/* The page, top down: the verdict once there is one, the phases (quiet when done), the tracers, the tree with its inspector, then the spec and the scenarios side by side, then what the agent built.
   Everything paints into fixed slots so the tree's SVG stays where it is between paints: moving a node resets its transitions, and the limbs would snap instead of grow. */
function gwSlots(){if(gw.slots)return gw.slots;const S={};for(const k of ['start','head','verdict','rail','agents','tree','two','error'])S[k]=h('div',{});
 S.card=h('section',{class:'card gw-tree','aria-label':'Tree'});S.bar=h('div',{});S.stage=h('div',{class:'gw-stage'});S.left=h('div',{style:'min-width:0'});S.scroll=h('div',{class:'gw-scrollx'});S.legend=h('div',{});S.ins=h('div',{style:'min-width:0'});
 S.scroll.addEventListener('scroll',()=>{if(Date.now()-(gw.autoScroll||0)>150)S.scroll.__touched=true});
 S.card.append(S.bar,S.stage);S.stage.append(S.left,S.ins);S.left.append(S.scroll,S.legend);S.tree.append(S.card);
 gw.el.append(S.start,S.head,S.verdict,S.rail,S.agents,S.tree,S.two,S.error);return gw.slots=S}
const gwSet=(slot,...k)=>{slot.replaceChildren();gwPut(slot,...k)};
function growPaint(){if(!gw.el)return;const s=gw.state;const S=gwSlots();
 if(!s){gwSet(S.start,gwStartCard(),gw.busy?h('p',{class:'row muted',style:'margin-top:12px'},h('span',{class:'think'},h('i'),h('i'),h('i')),'Reading the branch'):null,gw.error?blocked(gw.error):null);
  for(const k of ['head','verdict','rail','agents','two','error'])S[k].replaceChildren();S.tree.hidden=true;return}
 S.start.replaceChildren();S.tree.hidden=false;
 const v=gw.view;const c=s.change;
 gwSet(S.head,h('div',{class:'gw-head'},h('div',{style:'min-width:0'},h('span',{class:'label'},'Grow · '+(c?c.branch+' → '+c.base:'reading')),h('h2',{},c?c.title:'Reading the branch'),
   h('div',{class:'sub'},c?((c.pr?'#'+c.pr+' · ':'')+c.files+' files · +'+c.adds+' −'+c.dels+(c.untraced?' · '+c.untraced+' small parts not traced':'')+(s.spec?' · spec: '+s.spec.source:'')):'')),
  h('div',{style:'text-align:right'},h('div',{class:'gw-clock'},gw.saved?'saved '+ago(gw.saved)+' · took '+gwFmt(s.ms):gwFmt(s.done?s.ms:Date.now()-gw.t0)),s.done||!gw.busy?h('button',{class:'btn ghost sm',style:'margin-top:6px',disabled:gw.busy,on:{click:()=>{gw.state=null;gw.saved=null;gw.svg=null;gw.G=null;growPaint()}}},'New grow'):null)));
 gwSet(S.verdict,s.blocked?h('div',{class:'gw-result bad'},h('div',{},h('div',{class:'big'},'Stopped: '+s.blocked.code),h('div',{class:'sub'},s.blocked.detail+'. Fix: '+s.blocked.action))):null,s.done?gwResult():null);
 gwSet(S.rail,h('div',{class:'gw-rail'+(s.done?' quiet':''),role:'list','aria-label':'Phases'},GW.phases.map((p,i)=>{const cls=i<s.phase||s.done?'done':i===s.phase?'on':'';const st=s.phaseAt[i],en=s.phaseAt[i+1]??(s.done?s.ms:null);
  return h('div',{class:'ph '+cls,role:'listitem'},h('b',{},p),h('span',{},st===undefined?'waiting':i===4&&s.modeBy?GW.modes.find(m=>m.id===s.mode).label.toLowerCase():en!=null?((en-st)/1000).toFixed(1)+' s':'now'))})));
 const rules=s.agents.filter(a=>a.by==='rules'&&a.done&&a.ok),live=s.agents.filter(a=>!rules.includes(a)&&(!s.done||!a.ok||a.by!=='rules'));
 const traced=(n=>n+' part'+(n===1?'':'s')+' traced from source')(rules.reduce((n,a)=>n+a.units.length,0));
 if(s.done&&!live.some(a=>!a.ok))gwSet(S.agents,rules.length||live.length?h('p',{class:'gw-agline'},'✓ rules · '+rules.length+' lane'+(rules.length===1?'':'s')+' · '+traced+live.map(a=>' · ✓ '+(a.model||a.by)+' · '+a.brief).join('')):null);
 else gwSet(S.agents,live.length||rules.length?h('div',{class:'gw-agents','aria-live':'polite'},rules.length?h('div',{class:'gw-ag'},h('b',{},'✓ rules · '+rules.length+' lane'+(rules.length===1?'':'s')),h('span',{},traced)):null,live.map(a=>h('div',{class:'gw-ag'+(a.done?(a.ok?'':' bad'):' live')},h('b',{},(a.done?(a.ok?'✓ ':'✕ '):'')+(a.by==='rules'?'rules':a.model||a.by)+' · '+a.brief),h('span',{title:a.note},a.note)))):null);
 gwSet(S.bar,h('div',{class:'gw-bar'},h('span',{class:'gw-eyebrow',style:'margin:0'},s.units.length+' part'+(s.units.length===1?'':'s')+' · '+(n=>n+' branch'+(n===1?'':'es'))(s.units.filter(u=>!u.root).length)+' · '+(n=>n+' root'+(n===1?'':'s'))(s.units.filter(u=>u.root).length)),
  h('span',{class:'row',style:'gap:10px'},gw.tree==='outline'?h('label',{class:'small muted',style:'display:inline-flex;gap:6px;align-items:center'},h('input',{type:'checkbox',checked:gw.onlyGaps,on:{change:e=>{gw.onlyGaps=e.target.checked;growPaint()}}}),'Only gaps'):null,
   h('span',{class:'seg2',role:'group','aria-label':'View'},['grove','outline'].map(t=>h('button',{'aria-pressed':String(gw.tree===t),'data-testid':'grow-view-'+t,on:{click:()=>{gw.tree=t;try{localStorage.setItem('gw-tree',t)}catch(e){}growPaint()}}},t==='grove'?'Grove':'Outline'))))));
 if(gw.tree==='grove'){gwPaintGrove();if(S.left.firstChild!==S.scroll)S.left.replaceChildren(S.scroll,S.legend);if(S.scroll.firstChild!==gw.svg)S.scroll.replaceChildren(gw.svg);
  /* On a narrow screen the tree is wider than the page: keep the trunk centred until the reader scrolls it themselves (a re-render resets scroll positions). */
  requestAnimationFrame(()=>{if(S.scroll.__touched)return;gw.autoScroll=Date.now();S.scroll.scrollLeft=Math.max(0,(S.scroll.scrollWidth-S.scroll.clientWidth)/2)});
  gwSet(S.legend,h('div',{class:'gw-legend'},h('span',{},h('i',{class:'pass'}),'leaf passed'),h('span',{},h('i',{class:'fail'}),'failed'),h('span',{},h('i',{}),'drafted'),h('span',{},h('i',{class:'none'}),'no flow yet'),h('span',{},h('i',{class:'out'}),'larger mode'),h('span',{},h('i',{class:'gold'}),'tracing'),h('span',{},'pips: how deep each part was checked')))}
 else S.left.replaceChildren(gwOutline());
 gwSet(S.ins,gwInspector());
 gwSet(S.two,h('div',{class:'gw-two'},gwScenarios(),h('div',{style:'display:grid;gap:18px;min-width:0'},gwSpec(),gwExt())));
 gwSet(S.error,gw.error?blocked(gw.error):null);
 if(gw.G)gw.G.fresh=false}
`;
