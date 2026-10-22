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
.gw-head h2{margin:4px 0 0;font:400 24px/30px var(--serif);letter-spacing:-.01em;max-width:none;text-wrap:balance}
.gw-head .sub{font:13px/20px var(--mono);color:var(--ink3);overflow-wrap:break-word}
.gw-clock{font:500 13px/18px var(--mono);color:var(--muted)}
/* the meta on the right stays inside the column, its last glyph and the button's edge clear of it; its facts wrap whole, so a
   line never ends on a dot */
.gw-head>.gw-meta{min-width:0;max-width:100%;text-align:right;padding-right:2px}.gw-head .gw-clock .gw-facts{justify-content:flex-end}
.gw-rail{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-bottom:18px}
.gw-rail .ph{border-top:3px solid var(--line);padding-top:6px;min-width:0;display:grid;grid-template-rows:1fr auto}
.gw-rail .ph b{display:block;font:500 12.5px/16px var(--sans);color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gw-rail .ph span{font:11.5px/16px var(--mono);color:var(--muted)}
.gw-rail .ph.done{border-color:var(--moss)}.gw-rail .ph.done b{color:var(--ink2)}
.gw-rail .ph.on{border-color:var(--gold)}.gw-rail .ph.on b{color:var(--ink)}
.gw-rail.quiet .ph b{color:var(--muted)}.gw-rail.quiet .ph.done{border-color:color-mix(in srgb,var(--moss) 55%,var(--line))}
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
.gw-ol .nm{font:500 13px/18px var(--mono);color:var(--ink);overflow-wrap:break-word}.gw-ol .loc{font:11.5px/16px var(--mono);color:var(--muted);overflow-wrap:break-word}
.gw-pips{display:inline-flex;gap:3px;vertical-align:middle}.gw-pips i{width:9px;height:9px;border-radius:50%;border:1.5px solid var(--line2);background:var(--line)}
.gw-pips i.ok{background:var(--moss);border-color:var(--moss)}.gw-pips i.none{background:var(--paper);border-color:var(--moss)}.gw-pips i.stop{background:var(--paper);border:1.5px dashed var(--ink3)}
.gw-chip{display:inline-flex;align-items:center;min-height:20px;padding:0 7px;border-radius:5px;font:500 11.5px/16px var(--mono);background:var(--sel);color:var(--ink2);border:1px solid transparent}
.gw-chip.built{background:var(--moss-bg);color:var(--moss)}.gw-chip.indirect{background:var(--gold-bg);color:var(--gold)}.gw-chip.missing{background:none;color:var(--ink3);border:1px dashed var(--line2)}
.gw-chip.agent{background:var(--gold-bg);color:var(--gold);border-color:var(--gold)}.gw-chip.min{background:var(--forest);color:var(--on-forest)}
.gw-chips{display:flex;flex-wrap:wrap;gap:4px}
.gw-eyebrow{display:block;font:500 11px/16px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.gw-ins{padding:6px 4px 4px 0;min-width:0}
@media (max-width:1060px){.gw-ins{padding:14px 4px 4px;border-top:1px solid var(--line);margin-top:8px}}
.gw-ins .who{font:12px/16px var(--mono);color:var(--muted)}.gw-ins h3{margin:2px 0;font:500 16px/22px var(--mono);overflow-wrap:break-word;text-wrap:balance}.gw-ins .where{font:12px/18px var(--mono);color:var(--ink3);overflow-wrap:break-word}
.gw-ins .sec{margin-top:14px}
.gw-dp{display:grid;grid-template-columns:18px minmax(0,1fr);gap:2px 8px;padding:5px 0;border-bottom:1px solid var(--line)}
.gw-dp:last-child{border:0}.gw-dp .m{font:600 13px/20px var(--mono);text-align:center}.gw-dp.ok .m,.gw-dp.none .m{color:var(--moss)}.gw-dp.stop .m{color:var(--ink3)}.gw-dp.wait .m{color:var(--line2)}
.gw-dp .n{font-size:13px;line-height:20px;min-width:0}.gw-dp small{display:block;font:11.5px/16px var(--mono);color:var(--ink3);overflow-wrap:anywhere}
.gw-dp .by{font:10.5px/14px var(--mono);color:var(--gold);margin-left:6px}
.gw-lay{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 10px;align-items:start;font-size:13px}.gw-lay small{display:block;font:11px/15px var(--mono);color:var(--muted)}
.gw-strip{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}
.gw-cc{display:inline-flex;align-items:center;gap:7px;min-height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);font:500 12.5px/16px var(--mono);color:var(--ink2)}
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
.gw-modes{display:flex;flex-wrap:wrap;gap:8px}.gw-hintrow{display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline}.gw-hintrow .gw-more{color:var(--muted)}
.gw-cmp{width:100%;border-collapse:collapse;font-size:13px;line-height:18px;margin-top:6px}.gw-cmp th{font:11px/16px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:400;text-align:left;padding:4px 6px 6px 0}
.gw-cmp td{padding:7px 6px 7px 0;border-top:1px solid var(--line);vertical-align:top}.gw-cmp .n{text-align:right;font-family:var(--mono);width:4.2em}.gw-cmp .no{font-family:var(--mono);font-weight:500;margin-right:8px}.gw-cmp tr.tot td{font-weight:500;border-top:1px solid var(--line2)}
.gw-modes button{flex:1 1 180px;text-align:left;padding:10px 12px;border-radius:10px;border:1px solid var(--line2);background:var(--paper);display:grid;gap:2px}
.gw-modes button b{font-weight:500;font-size:14px}.gw-modes button span{font-size:12.5px;line-height:17px;color:var(--ink3)}
.gw-modes button[aria-pressed=true]{border-color:var(--forest);box-shadow:inset 0 0 0 1px var(--forest)}
/* once a mode is set its cards stay as they were asked, so the tree under them never moves; the chosen one keeps its ring, the
   others go quiet and preview what they would grow. Only a phone, where the three cards stack, folds them into chips */
.gw-modes.set button{align-content:start;border-color:var(--line)}.gw-modes.set button[aria-pressed=true]{border-color:var(--forest);box-shadow:inset 0 0 0 1px var(--forest);background:var(--sel)}
.gw-modes.set button[aria-disabled=true]{cursor:help}.gw-modes.set button[aria-disabled=true]:not([aria-pressed=true]) b{color:var(--ink3)}.gw-modes.set button[aria-disabled=true]:not([aria-pressed=true]):hover{border-color:var(--line2)}.gw-modes.set button[aria-disabled=true]:not([aria-pressed=true]):hover b{color:var(--ink)}
.gw-modes.wait button{align-content:start;border-color:var(--line);cursor:default;opacity:1}.gw-modes.wait button b{color:var(--ink3)}.gw-modes.wait button span{color:var(--muted)}
@media (max-width:640px){.gw-modes.set{gap:6px}.gw-modes.set button{flex:0 1 auto;padding:4px 10px;min-height:28px;display:inline-flex;gap:6px;align-items:center}.gw-modes.set button b{font-size:12.5px}.gw-modes.set button span{display:none}
 .gw-modes.set button[aria-pressed=true]{box-shadow:none}}
.gw-sgroup{border-bottom:1px solid var(--line)}.gw-sgroup:last-child{border-bottom:0}
.gw-sgroup>summary{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 4px;cursor:pointer;list-style:none}.gw-sgroup>summary::-webkit-details-marker{display:none}
.gw-sgroup>summary:hover{background:var(--sel)}.gw-sgroup>summary .n{font:500 13px/18px var(--mono);color:var(--ink);flex:1;min-width:0;overflow-wrap:anywhere}.gw-sgroup>summary .c{font:11.5px/16px var(--mono);color:var(--muted);white-space:nowrap}
.gw-sgroup>summary .car{width:14px;color:var(--muted);font-size:11px;flex:none}.gw-sgroup[open]>summary .car{transform:rotate(90deg)}
.gw-sgroup .list{padding:0 0 8px 24px}
.gw-lanes{display:grid;gap:4px;margin-top:2px}.gw-ln{display:grid;grid-template-columns:118px auto minmax(0,1fr);gap:8px;align-items:center;font-size:12px}.gw-ln .note{color:var(--muted);line-height:16px}
.gw-xi{display:grid;gap:3px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px;line-height:19px}.gw-xi:last-child{border:0}
.gw-xi .hd{display:flex;justify-content:space-between;gap:8px}.gw-xi .k{font:500 11px/16px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
.gw-xi .path{font:11.5px/16px var(--mono);color:var(--muted);overflow-wrap:anywhere}.gw-xi .need{color:var(--ink2)}
.gw-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start;margin-top:18px}
@media (max-width:1060px){.gw-two{grid-template-columns:minmax(0,1fr)}}
.gw-result{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 24px;align-items:center;padding:16px 20px;border-radius:12px;background:var(--forest);color:var(--on-forest);margin:0 0 18px}
.gw-result .big{font:400 22px/28px var(--serif)}.gw-result .sub{font-size:13px;line-height:19px;opacity:.85;max-width:760px}
/* beside a tree the band keeps one height from proving to verdict (two lines under its headline), so the verdict landing does
   not move the tree under it */
@media (min-width:1061px){.gw-result>div:first-child>.sub{min-height:38px}}
.gw-result.bad{background:var(--verm-bg);color:var(--ink)}.gw-result.quiet{background:var(--sel);color:var(--ink)}.gw-result.quiet .sub{opacity:1;color:var(--ink3)}
@media (prefers-color-scheme:dark){.gw-result{background:color-mix(in srgb,var(--ink) 5%,var(--paper));color:var(--ink);border:1px solid var(--line2)}.gw-result.bad{background:var(--verm-bg);border-color:color-mix(in srgb,var(--verm) 40%,var(--line2))}.gw-chip.min{background:var(--moss-bg);color:var(--moss)}}
/* a verdict with a failure in it never reads as all clear: a vermilion rule down its left edge, light or dark */
.gw-result.failed{box-shadow:inset 4px 0 0 var(--verm)}
.gw-result .btn.ghost{background:transparent;color:inherit;border-color:currentColor;opacity:.9}
.gw-empty{font-size:13px;color:var(--muted);margin:6px 0}
@media (max-width:760px){.gw-head>.gw-meta{text-align:left;display:flex;gap:12px;align-items:center}.gw-head .gw-clock .gw-facts{justify-content:flex-start}}
@media (max-width:640px){.gw-ol thead{display:none}.gw-ol tr.u td[data-h]::before{content:attr(data-h);display:block;font:500 10px/14px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.gw-ol tr.u{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 12px;padding:10px 8px;border-bottom:1px solid var(--line)}.gw-ol tr.u td{padding:0;border:0;background:none!important}.gw-ol tr.u.sel,.gw-ol tr.u:hover{background:var(--sel)}.gw-ol tr.u td:first-child{grid-column:1/-1}.gw-ol tr.grp td{display:block}.gw-ol .gw-chip{white-space:nowrap}.gw-rail{grid-template-columns:repeat(3,minmax(0,1fr))}.gw-ln{grid-template-columns:1fr}.gw-head h2{font-size:20px;line-height:26px}.gw-sgroup .list{padding-left:8px}}
@media (prefers-reduced-motion:reduce){.gw-ag.live b::before{animation:none}}
${BONSAI_CSS}
/* ---------- The page around the tree: after the tree's own styles, so these win where they meet ---------- */
.gw-code{font:.92em/1 var(--mono);background:var(--code);border-radius:4px;padding:1px 4px}
/* legend marks: small drawings of what the tree draws, in its wood and leaf colours, light and dark */
.gw-sw{display:inline-block;flex:none;overflow:visible;vertical-align:-2px;--sw-wood:#6E5E50;--sw-lit:#8F7D6B;--sw-shade:#4C4037;--sw-cut:#DCC8A6;--sw-crs:color-mix(in srgb,#9C8975 50%,#F4ECDF);--sw-rim:color-mix(in srgb,var(--ochre) 34%,var(--ink3));--sw-sap:#E9A23B;--sw-core:#FFF3D6;--sw-red:#D63A28}
@media (prefers-color-scheme:dark){.gw-sw{--sw-wood:#6E5F50;--sw-lit:#8A7864;--sw-shade:#4A3F35;--sw-cut:#B9A684;--sw-crs:color-mix(in srgb,#93826E 50%,#F4ECDF);--sw-rim:color-mix(in srgb,var(--ochre) 40%,var(--ink3));--sw-sap:#F2B24C;--sw-core:#FFF6E0;--sw-red:#F05A45}}
.gw-sw .lf{stroke-width:1.1;stroke-linejoin:round}.gw-sw .lf.pass{fill:var(--moss);stroke:var(--moss)}.gw-sw .lf.fail{fill:var(--verm);stroke:var(--verm)}.gw-sw .lf.run{fill:var(--gold);stroke:var(--gold)}
.gw-sw .lf.in{fill:var(--paper);stroke:var(--moss)}.gw-sw .lf.none{fill:var(--paper);stroke:var(--moss);stroke-dasharray:2 1.3}.gw-sw .lf.pre{fill:var(--paper);stroke:var(--line2)}.gw-sw .lf.bud{fill:var(--moss-bg);stroke:var(--moss);stroke-width:.9}
/* on a dark page a leaf still to prove is the tree's pale leaf, a lightened cushion green, never the page showing through */
@media (prefers-color-scheme:dark){.gw-sw .lf.in,.gw-sw .lf.none{fill:color-mix(in oklab,color-mix(in srgb,var(--moss) 56%,var(--paper)) 84%,#fff)}}
.gw-sw .rib{fill:none;stroke:var(--paper);stroke-width:.7;opacity:.55}.gw-sw .rib.o{stroke:var(--moss);opacity:.35}
.gw-sw .wd{fill:var(--sw-wood)}.gw-sw .wl{fill:var(--sw-lit);stroke:var(--sw-shade);stroke-width:.8}.gw-sw .cf{fill:var(--sw-cut);stroke:var(--sw-shade);stroke-width:.6}.gw-sw .cal{fill:var(--sw-lit);stroke:var(--sw-shade);stroke-width:.6}.gw-sw .cres{fill:none;stroke:var(--sw-crs);stroke-width:.8;stroke-linecap:round}.gw-sw .rim{fill:var(--sw-rim)}
.gw-sw .stem{fill:none;stroke:var(--sw-wood);stroke-width:1.2;stroke-linecap:round}.gw-sw .soil{stroke:var(--sw-shade);stroke-width:1;opacity:.7}
.gw-sw .dirt{fill:color-mix(in srgb,var(--sw-wood) 22%,var(--paper))}.gw-sw .pot{fill:color-mix(in srgb,var(--ochre) 26%,var(--line2))}
.gw-sw .rt{fill:none;stroke:var(--sw-wood);stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}
.gw-sw .tl{fill:none;stroke:var(--muted);stroke-width:1.3;stroke-linecap:round}.gw-sw .te{fill:var(--paper);stroke:var(--muted);stroke-width:1.1}
.gw-sw .rglow{fill:none;stroke:var(--sw-sap);stroke-width:3.6;stroke-linecap:round;opacity:.5;filter:blur(.7px)}.gw-sw .rte{fill:none;stroke:var(--sw-sap);stroke-width:2;stroke-linecap:round}.gw-sw .rcore{fill:none;stroke:var(--sw-core);stroke-width:.6;stroke-linecap:round;opacity:.9}.gw-sw .rte.bad{stroke:url(#gw-swred);stroke-width:2.8;stroke-linecap:butt}.gw-sw .rs{stop-color:var(--sw-red)}.gw-sw .rte.rest{stroke:var(--muted);stroke-width:1.3;stroke-dasharray:1.2 2.4}
.gw-sw .k0{fill:var(--sw-shade);opacity:.5}.gw-sw .k1{fill:var(--sw-wood)}.gw-sw .k2{fill:var(--sw-lit);opacity:.85}.gw-sw .kglow{fill:var(--gold);opacity:.6}.gw-sw .kbad{fill:var(--verm);opacity:.5}
.gw-sw .stk{fill:none;stroke:var(--sw-shade);stroke-width:.8;stroke-dasharray:1 1.4}.gw-sw .tag{fill:var(--paper);stroke:var(--line2);stroke-width:.8}
.gw-sw .stk.sd{stroke:color-mix(in srgb,var(--sw-shade) 60%,var(--ochre));stroke-width:1.1;stroke-dasharray:none;stroke-linecap:round}.gw-sw .tag.dsh{stroke:var(--muted);stroke-dasharray:1.8 1.1}.gw-sw .un{opacity:.5}.gw-sw .bed{fill:color-mix(in srgb,var(--sw-wood) 30%,var(--paper))}.gw-sw .rg{fill:none;stroke:var(--sw-shade);stroke-width:.4;opacity:.8}
/* (on a dark page the faded bark of an unused store and a pruned stub are lifted and edged with a fine light line, so they
   never sink into the page) */
@media (prefers-color-scheme:dark){.gw-sw .un{opacity:.9}.gw-sw .wd.un{fill:#A08C76}.gw-sw .cutg .wd{fill:#9A866F}.gw-sw .wd.un,.gw-sw .cutg .wd{stroke:#D9CBB8;stroke-width:.55;stroke-opacity:.7}.gw-sw .dirt{fill:color-mix(in srgb,var(--sw-wood) 45%,var(--paper))}}
.gw-sw .ring{fill:none;stroke:var(--ink);stroke-width:1}
.gw-sw .ntg{fill:color-mix(in srgb,var(--moss) 8%,var(--paper));stroke:var(--moss);stroke-width:.9}.gw-sw .ntn{font:500 6.6px var(--mono);fill:var(--moss);text-anchor:middle;dominant-baseline:central}.gw-sw .crk{fill:none;stroke:var(--verm);stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.gw-g{display:inline-flex;flex:none;align-items:center;line-height:0}.gb-gs .gw-sw{vertical-align:0}
.gw-legend{display:grid;gap:6px;margin:8px 6px 2px;font:12px/17px var(--sans);color:var(--ink3)}
.gw-li .bad{color:var(--verm-ink)}
.gw-cap{margin:8px 6px 2px}
.gw-howto{margin:4px 6px 2px;font:12.5px/18px var(--sans);color:var(--ink3)}
.gw-howto>summary{display:inline-flex;align-items:baseline;gap:6px;min-height:28px;padding:4px 0;cursor:pointer;list-style:none;color:var(--ink3)}
.gw-howto>summary::-webkit-details-marker{display:none}.gw-howto>summary::before{content:'▸';flex:none;font-size:10px;color:var(--muted)}.gw-howto[open]>summary::before{content:'▾'}
.gw-howto>summary:hover{color:var(--ink)}.gw-howto p{margin:0 0 6px;max-width:74ch}
/* the journeys a phone's tree numbers instead of naming: number and title side by side, a long title wrapping beside its number */
.gw-names{list-style:none;margin:8px 6px 10px;padding:0;display:grid;gap:6px;font:13px/19px var(--sans);color:var(--ink2)}
.gw-names li{display:grid;grid-template-columns:2.5ch minmax(0,1fr);align-items:baseline;column-gap:4px}
.gw-names .no{font:600 12px/19px var(--mono);color:var(--muted)}
.gw-names button{all:unset;cursor:pointer;border-radius:4px;overflow-wrap:anywhere}.gw-names button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}.gw-names button[aria-pressed=true]{text-decoration:underline;text-underline-offset:3px}
/* the choice: Minimum is recommended while it is open; drawn, so the chip's text is unchanged. Recommended is not chosen: its
   card has a dashed forest border and the badge, and no fill. Only a chosen card has the solid ring and the fill. The others
   are plain until pointed at or focused */
.gw-modes.ask b[data-rec]::after{content:'Recommended';display:inline-block;margin-left:8px;padding:0 6px;border-radius:4px;background:var(--forest);color:var(--on-forest);font:500 10px/17px var(--mono);letter-spacing:.06em;text-transform:uppercase;vertical-align:1px}
.gw-modes.ask button{align-content:start;border-color:var(--line2);transition:box-shadow .15s,border-color .15s}
.gw-modes.ask button.rec:not([aria-pressed=true]){border:1.5px dashed var(--forest);padding:9.5px 11.5px;background:var(--paper);box-shadow:none}
.gw-modes.ask button[aria-pressed=true]{border-color:var(--forest);box-shadow:inset 0 0 0 1px var(--forest);background:var(--sel)}
.gw-modes.ask button:hover{border-color:var(--ink3);box-shadow:0 0 0 3px color-mix(in srgb,var(--ink3) 26%,transparent)}.gw-modes.ask button.rec:not([aria-pressed=true]):hover{border-color:var(--forest);box-shadow:0 0 0 3px color-mix(in srgb,var(--ink3) 26%,transparent)}
.gw-modes button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
/* on a phone a chosen mode folds to a chip: the line under the chips says what the chosen mode, or the one pointed at, proves */
.gw-mdesc{display:none;margin:-2px 0 0;font:12.5px/18px var(--sans);color:var(--ink3);max-width:60ch}.gw-mdesc b{font-weight:500;color:var(--ink2)}
@media (max-width:640px){.gw-mdesc{display:block}}
/* a criterion's state, in the leaf palette: proved moss, partly proved half moss, failed red, needs you a gold mark of its own */
.gw-sd{display:inline-block;flex:none;width:9px;height:9px;border-radius:50%;background:var(--line2)}
.gw-sd.proved{background:var(--moss)}.gw-sd.agent{background:var(--gold)}.gw-sd.run{background:var(--gold);box-shadow:0 0 0 2px var(--gold-bg)}
.gw-sd.part{background:linear-gradient(90deg,var(--moss) 50%,var(--paper) 50%);border:1.5px solid var(--moss)}
.gw-sd.toprove{background:var(--paper);border:1.5px solid var(--moss)}.gw-sd.code{background:var(--paper);border:1.5px dashed var(--moss)}
.gw-sd.open{background:var(--paper);border:1.5px solid var(--ink3)}.gw-sd.failed{background:var(--verm)}
.gw-sd.needs{width:10px;height:9px;border-radius:0;background:var(--gold);clip-path:polygon(50% 0,100% 100%,0 100%)}
.gw-sum{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}
.gw-sp{display:inline-flex;align-items:center;gap:6px;min-height:22px;padding:0 8px;border-radius:5px;border:1px solid transparent;font:500 11.5px/16px var(--mono);background:var(--sel);color:var(--ink2);white-space:nowrap}
.gw-sp.proved,.gw-sp.part,.gw-sp.toprove,.gw-sp.code{background:var(--moss-bg);color:var(--moss)}.gw-sp.failed{background:var(--verm-bg);color:var(--verm-ink)}
.gw-sp.agent,.gw-sp.run,.gw-sp.needs{background:var(--gold-bg);color:var(--gold)}.gw-sp.open{background:none;border-color:var(--line2);color:var(--ink3)}
.gw-cdet .gw-sp{margin-top:1px}
.gw-chip .gw-sd{margin-right:5px;width:8px;height:8px}.gw-chip .gw-sd.needs{width:9px;height:8px}
/* the table that helps choose a mode: fixed columns, numbers under their headers */
.gw .gw-cmp{table-layout:fixed}.gw .gw-cmp th:first-child{width:56%}.gw .gw-cmp th.n,.gw .gw-cmp td.n{width:14.6%;text-align:right;padding:4px 6px 6px 6px}.gw .gw-cmp td.n{padding:7px 6px 7px 6px}
/* pointing at a mode card lights its column: what that mode proves on each journey */
.gw .gw-cmp .is-preview{background:var(--sel);color:var(--ink)}.gw .gw-cmp th.is-preview{border-radius:6px 6px 0 0}.gw .gw-cmp tr:last-child td.is-preview{border-radius:0 0 6px 6px}
@media (prefers-color-scheme:dark){.gw .gw-cmp .is-preview{background:color-mix(in srgb,var(--ink) 8%,var(--paper))}}
.gw .gw-cmp th.n,.gw .gw-cmp td.n{transition:background-color .15s}
.gw .gw-cmp .jt{display:grid;grid-template-columns:2ch minmax(0,1fr);gap:0 4px;align-items:baseline}.gw .gw-cmp .jt .no{margin:0}
.gw-cmp .sh{display:none}
@media (min-width:1061px),(max-width:640px){.gw-cmp .lg{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.gw-cmp .sh{display:inline}}
/* A list whose items each carry their own leading separator (a path's arrows, the dots between counts or facts): a line breaks
   only between items, and the separator of an item that starts a line sits just left of the box, where it is clipped. So no
   line starts or ends on a separator, and an item is never parted from its separator. */
.gw-sl{--sw:1.25em;margin-left:calc(-1 * var(--sw));clip-path:inset(-6px -6px -6px calc(var(--sw) - 4px))}
.gw-sl>:first-child{padding-left:var(--sw)}
.gw-sl .sp{display:inline-block;flex:none;width:var(--sw);text-align:center;white-space:nowrap;color:var(--muted);font-weight:400}
/* a path breaks between hops, or inside a long file path after a slash */
.gw .gw-path .hop{display:inline-flex;align-items:baseline;max-width:100%;min-width:0}
.gw .gw-path .hop button{white-space:normal;text-align:left;min-width:0}
/* a journey's state in words: each count whole, wrapping between counts */
.tks.gw-sl{--sw:1.6em}
.gw .gb-hd .st .tks{display:flex;flex-wrap:wrap;justify-content:flex-start;column-gap:0;min-width:0}.gw .gb-hd .st .tk{display:inline-block;white-space:nowrap}
.gw .gb-hd .st .gb-gs{justify-content:flex-end}
/* folds: the marker stays with its words */
.gw .gb-olf>summary{flex-wrap:nowrap;align-items:baseline;gap:8px}.gw .gb-olf>summary::before{flex:none}.gw .gb-olf>summary>.sm{min-width:0}
/* the Outline: one column, the same width as a page of text; what is selected opens in place */
.gw-stage.ol{grid-template-columns:minmax(0,1fr)}
.gw .gb-ol{max-width:960px}
.gw-stop{grid-column:2/-1;justify-self:start;white-space:normal;overflow-wrap:break-word;font:12px/17px var(--sans);color:var(--ink3);border-left:2px dashed var(--line2);padding:1px 0 1px 8px;margin-top:2px}.gw-stop b{font:500 11px/17px var(--mono);color:var(--ink2)}
.gw-olcard{margin:2px 8px 12px 38px;padding:4px 14px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper)}
.gw-olcard .sec:first-child{margin-top:8px}
.gw-ol tr.det>td{padding:2px 8px 14px;border-bottom:1px solid var(--line);background:var(--sel)}.gw-ol tr.det .gw-olcard{margin:0}
.gw-mocknote{font:12px/18px var(--sans);color:var(--ink3);margin:10px 6px 0}.gw-mocknote .gw-chip{margin-right:6px}
.gw-rail .ph b{white-space:normal;overflow:visible}
@media (max-width:640px){.gw-ol tr.det{display:block}.gw-ol tr.det>td{display:block;padding:8px}.gw-olcard{margin:2px 0 12px;padding:4px 10px 10px}.gw .gb-hd .st .tks,.gw .gb-hd .st .gb-gs{justify-content:flex-start}.gw .gb-hd .st{white-space:normal;min-width:0}}
/* a long title pushes the clock and New grow onto their own line: they keep to the right edge, as beside a short one */
@media (min-width:761px){.gw-head>.gw-meta{margin-left:auto}}
/* in the Outline, the spec card alone takes the Outline's measure, centred under it, not half the page */
.gw-two.solo{grid-template-columns:minmax(0,1000px);justify-content:center}
.gw-clock .tk{white-space:nowrap}.gw .gb-hd .tt .by{white-space:nowrap}
/* a phone: the page's own lines sit in from the edge, like the text inside the cards */
@media (max-width:480px){.gw-head,.gw-rail,.gw-agline{padding-left:16px;padding-right:16px}.gw .card{padding:16px}.gw .gw-tree{padding:12px 11px 8px}.gw-result{padding:16px}
 .gw-head>.gw-meta{justify-content:space-between;width:100%}.gw-head .gw-clock{min-width:0}.gw-head>.gw-meta>.btn{margin-top:0!important;flex:none}.gw-agline{overflow-wrap:break-word}}
/* a line of facts: each one whole, its dot going with it; a code path breaks only after a slash */
.gw .nw,.gw-facts .tk{white-space:nowrap}.gw-facts .tk.wr{white-space:normal}.gw-loc{font:12.5px/18px var(--mono)}
.gw-facts{display:flex;flex-wrap:wrap;align-items:baseline}.gw-facts>.tk{display:inline-flex;align-items:baseline;min-width:0;max-width:100%}.gw-facts>.tk>.tc{min-width:0}
/* the Outline stands alone: one centred column the width of a page of text, its view switch on the same right edge */
.gw-tree.olv>*{max-width:960px;margin-left:auto;margin-right:auto}.gw .gw-tree.olv .gb-ol{max-width:none}
.gw-stage.solo{grid-template-columns:minmax(0,1fr)}
/* beside the tree the inspector is never taller than the tree: what does not fit scrolls inside it */
.gw-insw{min-width:0}
@media (min-width:1061px){.gw-stage>.gw-insw{align-self:stretch;contain:size;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;padding-bottom:18px}
 /* while more of it waits below, its last lines fade out, so a cut line reads as "scroll for more", never as a clipped one */
 .gw-stage>.gw-insw.more{-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 56px),transparent 100%);mask-image:linear-gradient(to bottom,#000 calc(100% - 56px),transparent 100%)}}
.gw-dpmore{all:unset;cursor:pointer;display:inline-block;margin-top:4px;font:12px/18px var(--sans);color:var(--ink3);text-decoration:underline;text-underline-offset:3px}.gw-dpmore:hover{color:var(--ink)}.gw-dpmore:focus-visible{outline:2px solid var(--ink);outline-offset:2px;border-radius:2px}
/* the mode area keeps its height while a choice is pruned, then closes */
.gw-modearea{display:flow-root}
/* the inspector's cards: a failure first, in the run's words, then the claim as what the run did with it */
.gw-ins h3.gw-jt{font:500 17px/24px var(--sans)}.gw-ins h3.gw-st{font-family:var(--sans);font-weight:500}
.gw-via{font:11.5px/16px var(--mono);color:var(--muted);margin:0 0 4px}
.gw-ins .gb-ols{padding:6px 4px;font-size:13.5px}.gw-ins .err{font:12px/17px var(--mono);color:var(--verm-ink);background:var(--verm-bg);padding:6px 8px;border-radius:6px;overflow-wrap:break-word;margin:0 4px 6px 34px}
.gw .err .k,.gw-broke .k{font-weight:400}.gw .err b{font-weight:600}.gw-broke span{font:12.5px/18px var(--mono);color:var(--verm-ink)}.gw-broke b{color:inherit;font-weight:600}
.gw-claim{display:grid;gap:2px;margin-top:12px;font-size:13px;line-height:19px;color:var(--ink2)}.gw-claim .gw-eyebrow{margin:0}.gb-olin .gw-claim{margin:0}
.gw-jst{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font:11.5px/16px var(--mono);color:var(--muted)}.gw-jst .tks{display:flex;flex-wrap:wrap;column-gap:0}.gw-jst .tk{white-space:nowrap}
.gw-jst .f{color:var(--verm-ink)}.gw-jst .p{color:var(--moss)}.gw-jst .r{color:var(--gold)}
.gw-lnk{all:unset;cursor:pointer;display:inline-block;margin-top:8px;font-size:13px;line-height:18px;color:var(--ink3);text-decoration:underline;text-underline-offset:3px}.gw-lnk:hover{color:var(--ink)}.gw-lnk:focus-visible{outline:2px solid var(--ink);outline-offset:2px;border-radius:2px}
.gw-one{margin:6px 0 0}
/* the Journeys card under the tree is half the page wide: there a journey's state goes under its title, so the title is not squeezed */
.gw-jcard{container-type:inline-size}
@container (max-width:720px){.gw-jcard .gb-hd .st{grid-row:auto;grid-column:2;display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;padding-top:2px;white-space:normal}.gw-jcard .gb-hd .st .tks,.gw-jcard .gb-hd .st .gb-gs{justify-content:flex-start}}
/* the Outline's journey: its title takes the whole measure, its leaves and counts on the line under where it starts, as in the
   Journeys card; the rule between two journeys sits on the same edges as the section rules */
.gw .gb-ol .gb-hd{grid-template-columns:24px minmax(0,1fr)}
.gw .gb-ol .gb-hd .st{grid-row:auto;grid-column:2;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:2px 10px;padding-top:2px;white-space:normal}.gw .gb-ol .gb-hd .st .tks,.gw .gb-ol .gb-hd .st .gb-gs{justify-content:flex-start}
.gw .gb-ol>.gb-olb{border-bottom:0;position:relative}.gw .gb-ol>.gb-olb+.gb-olb::before{content:'';position:absolute;left:6px;right:6px;top:0;border-top:1px solid var(--line)}
/* Max's part checks, rolled up part by part: one row says the part, its leaves, how many checks, their state in the journeys'
   words and the journeys it is on; it opens to the checks themselves */
.gw .gb-bpf>summary{min-height:34px;padding-top:7px;padding-bottom:7px}.gw .gb-bpf>summary>.sm{display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;min-width:0}
.gw .gb-bpf .pn{font:500 12.5px/18px var(--mono);color:var(--ink2);overflow-wrap:anywhere}.gw .gb-bpf .pn.rn{font-family:var(--sans);font-size:13.5px;overflow-wrap:break-word}.gw .gb-bpf .gw-facts{font:11.5px/18px var(--mono);color:var(--muted);min-width:0}
.gw .gb-bpf .gw-facts .f{color:var(--verm-ink)}.gw .gb-bpf .gw-facts .p{color:var(--moss)}.gw .gb-bpf .gw-facts .r{color:var(--gold)}
.gw .gb-bpl{padding:0 0 6px 18px}
/* one failure sentence everywhere: "Broke at <check>: <message>", the colon held to the check, and the hop on the route under it */
.gw .gw-onroute{display:block;margin-top:3px;font-weight:400;color:var(--ink2)}.gw .gw-onroute .nw{font-weight:500;color:inherit}
/* a path breaks only between hops (each arrow with the hop after it), and a file:line reference moves to the next line whole;
   either breaks after a slash only when it cannot fit on a line of its own */
.gw-ref{display:inline-block;max-width:100%;white-space:normal}
/* where a leaf sits on a pad, drawn with the tree's own pad and leaf */
svg.gw-svg.gb.gw-lpad{display:inline-block;flex:none;width:42px;height:30px;overflow:visible;vertical-align:middle}
.gw-lpad .lp-pad.dim{opacity:.42}.gw-lpad .lp-st.tr{stroke-width:2.6}
.gw-lpad .lp-pad{fill:var(--pad);stroke:var(--pad-edge);stroke-width:.8;stroke-linejoin:round}.gw-lpad .lp-band{fill:var(--pad-shade);opacity:.55}
.gw-lpad .lp-lf{fill:var(--moss);stroke:color-mix(in srgb,var(--moss) 70%,#000);stroke-width:.8;stroke-linejoin:round}.gw-lpad .lp-lf.dim{fill:none;stroke:var(--pad-edge);stroke-width:.9;opacity:.75}
.gw-lpad .lp-st{fill:none;stroke:var(--wood);stroke-width:1.2;stroke-linecap:round}.gw-lpad .lp-st.dim{opacity:.45}
/* a one-journey tree on a phone: the badges on its other pads, keyed under the journey */
.gw-names li.pol .no{color:var(--ink3)}.gw-names .pt{color:var(--ink3)}.gw-names .gw-jst{display:inline-flex;margin-left:2px}
/* each journey's state under its name, in the words its pad's label uses on a wide screen, a failure first and red */
.gw-names .jn{min-width:0}.gw-names .jn>button{display:block}.gw-names .jn>.gw-jst{display:flex;margin:1px 0 0}
/* A path is a list of its hops, each whole: every hop after the first starts with its arrow, so a line the path wraps onto
   starts with "›", flush with the first line, and no line ends on an arrow (see gbPathEl, gwHops) */
.gw .gw-hp{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px .45em;list-style:none;margin:0;padding:0}
.gw .gw-hp>li{display:inline-flex;align-items:baseline;flex-wrap:nowrap;min-width:0;max-width:100%;margin:0;padding:0}
.gw .gw-hp>li+li::before{content:'›';content:'›' / '';flex:none;margin-right:.45em;color:var(--muted);font-weight:400}
.gw .gw-hp .hl,.gw .gw-hp button{min-width:0}
.gw .gb-olx>.gb-path.gw-hp{margin-left:0}
@media (max-width:640px){.gw .gb-olx>.gb-path.gw-hp{margin-left:36px}.gw .gb-jr>.gb-olx>.gb-path.gw-hp{margin-left:50px}}
/* the key is a grid: each row's name in a column of its own, its items on tracks every row shares (the same container, the same
   track sizes), so the key's columns line up at any width; an item's mark sits right against its words, which wrap inside the
   item and never off the edge. A narrow key puts a row's name over its items */
.gw .gw-legend{container-type:inline-size;min-width:0}
.gw .gw-legend .gw-lg{display:grid;grid-template-columns:7.5rem minmax(0,1fr);gap:4px 12px;align-items:start;min-width:0}
.gw .gw-legend .gw-lg>.lh{font-weight:500;color:var(--ink2);line-height:22px;padding-top:1px;overflow-wrap:break-word}
.gw .gw-legend .lgi{display:grid;grid-template-columns:repeat(auto-fill,minmax(9.25rem,1fr));gap:4px 12px;align-items:center;min-width:0}
.gw .gw-li{display:grid;grid-template-columns:26px minmax(0,1fr);gap:6px;align-items:center;min-height:22px;min-width:0;max-width:100%;white-space:normal}
.gw .gw-li>:first-child{justify-self:end}.gw .gw-li>span:last-child{min-width:0;overflow-wrap:break-word}
.gw .gw-legend .gw-lg.where .gw-li{grid-template-columns:42px minmax(0,1fr);min-height:32px}
/* what the chosen mode pruned: the cut mark, then the modes side by side, the table across the rest of the row */
.gw .gw-legend .gw-lg.mode .lgi{align-items:start}
/* the modes compared: a block of its own under the key, its heading the panel's, its table on the key's first column */
.gw .gw-legend .gw-lgcmp{margin-top:18px;min-width:0;max-width:34rem}.gw .gw-legend .gw-lgh{margin:0 0 4px;font:500 12.5px/18px var(--sans);color:var(--ink2)}
/* the key's table is narrow at every width, so it always shows Min/Std/Max */
.gw .gw-cmp.key .lg{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.gw .gw-cmp.key .sh{display:inline}
.gw .gw-cmp.key{margin-top:0}.gw .gw-cmp.key th:first-child{width:auto}.gw .gw-cmp.key td{padding-top:4px;padding-bottom:4px}.gw .gw-cmp.key td.n{padding-top:4px;padding-bottom:4px}
.gw .gw-cmp .is-chosen{color:var(--ink);font-weight:600}.gw .gw-cmp th.is-chosen{box-shadow:inset 0 -2px 0 var(--forest)}
@container (max-width:520px){.gw .gw-legend .gw-lg{grid-template-columns:minmax(0,1fr);gap:2px}.gw .gw-legend .lgi{grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))}}
/* a mode's card counts what it adds off the journeys, as the tree's shoots and the Outline's sections count it */
.gw .gw-modes button .gw-madd{display:block;margin-top:3px;font:11.5px/16px var(--mono);color:var(--muted)}.gw .gw-modes button .gw-madd span{font:inherit;color:inherit;line-height:inherit}
.gw .gw-mdesc .gw-madd{display:block;font:11.5px/16px var(--mono);color:var(--muted)}
@media (max-width:640px){.gw .gw-modes.set button .gw-madd{display:none}}
/* titles and headings break into lines of even length, so none ends on one word alone */
.gw .gw-ins h3,.gw .gw-names .jn>button,.gw .gw-names li>span:last-child,.gw .gw-cmp .jt>span,.gw .gb-olh,.gw .gw-result .big,.gw .gw-olcard h3{text-wrap:balance}
/* a failure names the check it broke at, in quotes and bold, the message after it plain */
.gw .err b,.gw-broke b{overflow-wrap:break-word}
/* Max's part checks as a table: the part's name in a column as wide as the longest, its leaves in one as wide as the most any
   part has, then its counts and journeys, so every row's leaves and counts start on the same edges. A phone puts the counts
   under the name and leaves */
.gw .gb-bpx .gb-bpf>summary>.sm{display:grid;grid-template-columns:minmax(0,var(--bpn,16ch)) var(--bpl,auto) minmax(0,1fr);gap:2px 14px;align-items:center;font:12.5px/18px var(--mono)}
.gw .gb-bpx .gb-bpf .gb-gs{flex-wrap:nowrap;width:var(--bpl,auto)}
@media (max-width:640px){.gw .gb-bpx .gb-bpf>summary>.sm{grid-template-columns:minmax(0,var(--bpn,16ch)) var(--bpl,auto);gap:2px 12px}.gw .gb-bpx .gb-bpf>summary>.sm>.gw-facts{grid-column:1/-1}}
.gw .gb-olx>.gb-sub{margin-left:12px}
.gw .gw-cap{text-wrap:pretty}
.gw .gw-names li.pol .gw-jst{display:flex;margin:1px 0 0}
/* a row's state sits on its right edge, joined to its title by a dotted leader, so the eye keeps to the row across the measure;
   a narrow screen puts the state under the title instead and draws none */
.gb-ols>.ld,.gb-olr>.ld{display:none}
@media (min-width:641px){.gw .gb-olx .gb-ols,.gw .gb-ol .gb-olr{grid-template-columns:20px minmax(0,max-content) minmax(24px,1fr) auto}
 .gw .gb-olx .gb-ols>.ld,.gw .gb-ol .gb-olr>.ld{display:block;align-self:start;margin-top:14px;border-bottom:1.5px dotted var(--line2)}
 .gw .gb-ol .gb-olr>.ld{margin-top:12px}}
/* the Outline standing alone is one column the width of a page of text, so each row's state stays near its title */
.gw-tree.olv>*{max-width:48rem}.gw-two.solo{grid-template-columns:minmax(0,calc(48rem + 40px))}
/* a mode card's count says what it counts; drawn by the stylesheet, so the card's text stays its name and its count. A phone's
   chips keep to the number */
.gw .gw-modes button b .mn::after{content:' ' attr(data-u);font-weight:400;color:var(--ink3)}
@media (max-width:640px){.gw .gw-modes.set button b .mn{display:inline}.gw .gw-modes.set button b .mn::after{content:none}}
/* the card previewed looks one way before a choice and after it, whichever card it is: a solid edge with a soft ring round it.
   The recommended card trades its dashed edge for it while previewed and keeps its badge; the chosen card is never previewed */
.gw .gw-modes button.pv:not([aria-pressed=true]){border-color:var(--ink3);box-shadow:0 0 0 3px color-mix(in srgb,var(--ink3) 32%,transparent)}
.gw .gw-modes.ask button.rec.pv:not([aria-pressed=true]){border:1px solid var(--ink3);padding:10px 12px}.gw .gw-modes button.pv:not([aria-pressed=true]) b{color:var(--ink)}
/* the verdict: one line of its own above the tree, its mark and word first, then what it rests on, then the way to the evidence.
   It holds its height from the first paint, so the tree does not move when it lands */
.gw-call{display:flex;align-items:center;gap:8px 14px;min-height:44px;margin:0 0 14px;padding:4px 0 4px 14px;box-shadow:inset 4px 0 0 var(--line2);min-width:0}
.gw-call.bad{box-shadow:inset 4px 0 0 var(--verm)}.gw-call.open{box-shadow:inset 4px 0 0 var(--ochre)}.gw-call.ok{box-shadow:inset 4px 0 0 var(--moss)}
.gw-call .gw-vp{flex:none;display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border-radius:6px;background:var(--sel);color:var(--ink3);font:600 12px/16px var(--sans);letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
.gw-call.bad .gw-vp{background:var(--verm-bg);color:var(--verm-ink)}.gw-call.open .gw-vp{background:var(--ochre-bg);color:var(--ochre-ink)}.gw-call.ok .gw-vp{background:var(--moss-bg);color:var(--ink)}
.gw-call .gw-vt{flex:0 1 auto;min-width:0;font:300 20px/28px var(--serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gw-call.wait .gw-vt{font:14px/20px var(--sans);color:var(--ink3)}
.gw-call .gw-vc{flex:none;display:inline-flex;align-items:center;min-height:20px;padding:0 7px;border-radius:5px;border:1px solid var(--line2);font:500 11.5px/16px var(--mono);white-space:nowrap}
.gw-call .gw-vm{flex:none;font-size:13px;color:var(--ink3);white-space:nowrap}
.gw-call .gw-vgo{flex:none;margin-left:auto}
@media (max-width:640px){.gw-call{flex-wrap:wrap}.gw-call .gw-vt{white-space:normal;flex-basis:100%;order:2;font-size:18px;line-height:24px}.gw-call .gw-vc,.gw-call .gw-vm{order:3}.gw-call .gw-vgo{order:4;margin-left:0;min-height:44px}}/* What happened: a scenario's run, step by step, in the panel beside the tree, which widens for it; under 1060 px a sheet */
@media (min-width:1061px){.gw-stage.wide{grid-template-columns:minmax(0,1fr) min(640px,46vw)}}
.gw-hap+.gw-dre{margin-left:14px}
/* on a phone, the ways into what happened are 44 px tall like every other target */
@media (max-width:640px){.gw-dre,.gw-hap{display:inline-flex;align-items:center;min-height:44px;padding:0 4px}.gw-result .gw-rsteps{min-height:44px}}
.gw-dr{border:1px solid var(--line);border-radius:12px;padding:16px 18px 14px;background:var(--paper);min-width:0;margin-bottom:4px}
.gw-drh{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:10px;align-items:start}
.gw-drh .mk{font:600 17px/28px var(--mono);text-align:center}.gw-drh .mk.fail{color:var(--verm)}.gw-drh .mk.pass{color:var(--moss)}.gw-drh .mk.none{color:var(--ink3)}
.gw-drh h2{margin:0;font:400 21px/28px var(--serif);letter-spacing:-.01em;max-width:none;text-wrap:balance;overflow-wrap:break-word}
.gw-drh h2:focus:not(:focus-visible){outline:none}
.gw-drh .meta{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;margin-top:6px;font:12.5px/18px var(--mono);color:var(--ink3)}
.gw-drh .w{font-weight:600;color:var(--ink2)}.gw-drh .w.fail{color:var(--verm-ink)}.gw-drh .w.pass{color:var(--moss)}
.gw-drx{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line2);border-radius:8px;background:var(--paper);color:var(--ink3);font:18px/1 var(--sans);cursor:pointer;padding:0}
.gw-drx:hover{color:var(--ink);border-color:var(--ink3)}
.gw-drpg{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px;line-height:18px;color:var(--ink3)}
.gw-drpg button{width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line2);border-radius:8px;background:var(--paper);color:var(--ink);font:18px/1 var(--sans);cursor:pointer;padding:0}
.gw-drpg button:disabled{color:var(--muted);cursor:default;opacity:.5}
.gw-drc{margin-top:12px}
.gw-drc .gw-chip.ok{background:var(--moss-bg);color:var(--moss)}.gw-drc .gw-chip.bad{background:var(--verm-bg);color:var(--verm-ink)}
.gw-drc .gw-chip.standin{background:var(--gold-bg);color:var(--gold)}.gw-drc .gw-chip.none{background:none;border:1px dashed var(--line2);color:var(--ink3)}
.gw-drhist{margin:8px 0 0;font-size:13px;line-height:18px;color:var(--ink3)}
.gw-drs{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:2px}
.gw-drs button{display:grid;grid-template-columns:20px 16px minmax(0,1fr) auto;gap:1px 8px;align-items:start;width:100%;padding:6px 10px;border:1px solid transparent;border-radius:8px;background:none;text-align:left;font:inherit;font-size:14px;line-height:20px;color:var(--ink);cursor:pointer}
.gw-drs button:hover,.gw-drs button[aria-pressed=true]{background:var(--sel)}.gw-drs button[aria-pressed=true]{border-color:var(--line2)}
.gw-drs .n{font:500 12px/20px var(--mono);color:var(--muted);text-align:right}
.gw-drs .sm{font:600 13px/20px var(--mono);text-align:center}.gw-drs .sm.pass{color:var(--moss)}.gw-drs .sm.fail{color:var(--verm)}.gw-drs .sm.warn{color:var(--gold)}.gw-drs .sm.none{color:var(--ink3)}
.gw-drs button.fail .t{color:var(--verm-ink);font-weight:500}.gw-drs .t{min-width:0;overflow-wrap:break-word}
.gw-drs .ms{font:12px/20px var(--mono);color:var(--muted);white-space:nowrap;text-align:right}
.gw-drs .sx{grid-column:3/-1;display:grid;gap:1px;font:12px/18px var(--mono);color:var(--ink3);overflow-wrap:anywhere;margin-bottom:2px}
.gw-drs .sx .bad{color:var(--verm-ink);font-weight:600}
.gw-dr1{margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--stone);font-size:14px;line-height:20px;color:var(--ink)}
.gw-dr1 .gw-eyebrow{margin-bottom:2px}
.gw-drt{display:flex;flex-wrap:wrap;gap:0 2px;margin-top:14px;border-bottom:1px solid var(--line)}
.gw-drt button{border:0;border-bottom:2px solid transparent;background:none;padding:6px 10px;margin-bottom:-1px;min-height:34px;font:inherit;font-size:13px;color:var(--ink3);cursor:pointer}
.gw-drt button:hover{color:var(--ink)}.gw-drt button[aria-selected=true]{border-bottom-color:var(--ink);color:var(--ink);font-weight:500}
.gw-drp{padding-top:6px;display:grid;gap:2px}
.gw-drg{padding:7px 10px;border-radius:8px;min-width:0}.gw-drg.cur{background:var(--stone)}
.gw-drg .hd{font:500 12px/18px var(--mono);color:var(--ink3);margin-bottom:3px;overflow-wrap:anywhere}
.gw-drg .sub{font:12.5px/18px var(--mono);color:var(--ink2);overflow-wrap:anywhere}.gw-drg .meta{font:12px/18px var(--mono);color:var(--muted)}
.gw-drg pre{margin:4px 0 0;max-height:240px;overflow:auto;padding:8px 10px;border-radius:6px;background:var(--code);font:12px/17px var(--mono);white-space:pre-wrap;overflow-wrap:anywhere}
.gw-dra{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center}
.gw-drw{margin:6px 0 0;font-size:12.5px;line-height:18px;color:var(--ink3)}
.gw-drerr{margin:14px 0 0;color:var(--verm-ink)}
.gw-drf{margin-top:14px;padding-top:10px;border-top:1px solid var(--line);font-size:12.5px;line-height:18px;color:var(--ink3)}.gw-drf p{margin:0 0 4px}
.gw-drn{margin-top:14px;padding:10px 12px;border-radius:8px;border:1px dashed var(--line2);display:grid;gap:2px;font-size:14px;line-height:20px}.gw-drn span{color:var(--ink3);font-size:13px}
.gw-drsec{margin-top:14px}.gw-drsec p{margin:0 0 4px;font-size:14px;line-height:20px}
@media (max-width:1060px){.gw-insw.dr{position:fixed;inset:0;z-index:19;overflow-y:auto;overscroll-behavior:contain;background:var(--paper)}
 html:has(.gw-insw.dr:not([hidden])){overflow:hidden}
 .gw-insw.dr .gw-dr{border:0;border-radius:0;padding:0 16px 28px;max-width:760px;margin:0 auto}
 .gw-insw.dr .gw-drh{position:sticky;top:0;z-index:1;background:var(--paper);padding:12px 0 10px;border-bottom:1px solid var(--line)}
 .gw-dr .btn,.gw-drs button,.gw-drt button{min-height:44px}.gw-drx,.gw-drpg button{width:44px;height:44px}.gw-drt button{padding:0 12px}.gw-drs button{padding:12px 10px}}
`;

export const GROVE_JS = String.raw`
/* ---------- Grow: the change's tree, live ---------- */
const GW=${CONST};
const gw={dr:null,el:null,svg:null,B:null,M:null,seen:new Set(),state:null,view:null,events:0,id:null,busy:false,error:null,log:null,tree:'grove',pinned:null,hov:null,open:{},refocus:null,preview:null,selCrit:null,onlyGaps:false,base:'',prove:true,agent:true,t0:0,raf:0};
try{const v=localStorage.getItem('gw-tree');if(v==='outline'||v==='grove')gw.tree=v}catch(e){}
/* The selection lives in the address, so a link can bring it back: #grow/<id> is what is selected (a scenario, a journey or a
   part), #grow/<scenario>/happened/step-<n> is the run that scenario made, open in the Run tab at step n, and
   #grow/<scenario>/steps/step-<n> is that run in the drawer beside the tree, at step n. */
const gwHASH=/^#grow\/([A-Za-z0-9_.-]+)(\/happened(?:\/step-(\d+))?|\/steps(?:\/step-(\d+))?)?$/;
function gwWant(){const m=gwHASH.exec(location.hash);if(!m)return false;const n=m[3]||m[4];
 gw.want={id:m[1],happened:!!m[2]&&m[2].startsWith('/happened'),steps:!!m[2]&&m[2].startsWith('/steps'),step:n?Math.max(0,Number(n)-1):null};return true}
if(gwWant())tab='Discover';
window.addEventListener('hashchange',()=>{if(!gwWant())return;if(tab!=='Discover'){tab='Discover';render()}else growPaint()});
function growPanel(){if(!gw.el)gw.el=h('section',{class:'gw','aria-label':'Grow this change','data-testid':'grow'});
 const branch=ui.source||state.git.current||'';if(!gw.busy&&!gw.state&&state.git.isRepo&&branch&&gw.lastFor!==branch){gw.lastFor=branch;growLast(branch)}
 growPaint();return gw.el}
/* A saved grow of this branch comes back on reload, marked as saved, instead of an empty start card. */
async function growLast(branch){try{const r=await fetch('/api/grow/last?branch='+encodeURIComponent(branch));const d=r.ok?await r.json():null;
 if(d&&!gw.busy&&!gw.state){gw.state=d.state;gw.view=d.view;gw.log=d.log;gw.saved=d.at;growPaint()}}catch(e){}}
async function growStart(){
 if(gw.busy)return;gw.busy=true;gw.picking=null;gw.saved=null;gw.error=null;gw.state=null;gw.view=null;gw.events=0;gw.id=null;gw.log=null;gw.pinned=null;gw.hov=null;gw.selCrit=null;gw.svg=null;gw.B=null;gw.seen=new Set();gw.t0=Date.now();growPaint();growTick();
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
async function growPick(mode){if(!gw.id)return;try{await api('/api/grow/mode',{id:gw.id,mode})}catch(e){gw.picking=null;gbPaint();toast(e.error||'Could not choose')}}
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
/* a step's time to a tenth of a second; a step quicker than that says so, never "0.0 s" */
const gwStep=ms=>ms<100?'<0.1 s':(ms/1000).toFixed(1)+' s';
const gwDur=ms=>ms<1000?Math.round(ms)+' ms':(ms/1000).toFixed(1)+' s';
const gwCut=(t,n)=>t.length>n?t.slice(0,n-1)+'…':t;
const gwQuiet=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
/* A pointer resting where a control appears is not pointing at it: a mode is previewed on hover only once the pointer has moved. */
document.addEventListener('pointermove',e=>{if(e.movementX||e.movementY)gw.armed=true},{passive:true});
/* ---------- Words and marks the whole page shares ---------- */
const gwBT=String.fromCharCode(96);
/* A file path or a route breaks only after a slash between two of its segments: never inside a name, and never between a
   method and its path. */
function gwCodeText(t){const p=String(t==null?'':t).split(/(?<=[^\s\/]\/)(?=[^\s\/])/);return p.flatMap((x,i)=>i?[h('wbr'),h('span',{class:'nw'},x)]:[h('span',{class:'nw'},x)])}
/* Every title the page prints goes through here: text between backticks is inline code, set as code without its backticks. */
/* In plain words a route named in a title ("POST /seats") is one thing: it never breaks between its method and its path. */
const gwROUTE=/((?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/\S*)/;
const gwWords=x=>x.split(gwROUTE).map((y,i)=>i%2?h('span',{class:'nw'},y):y).filter(y=>y!=='');
function gwRich(t){const p=String(t==null?'':t).split(gwBT);if(p.length%2===0){const last=p.pop();p[p.length-1]+=gwBT+last}
 return p.length<3?gwWords(p.join('')):p.flatMap((x,i)=>i%2?[h('code',{class:'gw-code'},...gwCodeText(x))]:gwWords(x)).filter(x=>x!=='')}
const gwPlain=t=>String(t==null?'':t).split(gwBT).join('');
/* A scenario titled by the route it is sent through ("POST /api/grow: Reader leaves mid-grow") reads as a test of that one
   endpoint: the route moves to a small line of its own, "via POST /api/grow", and the title is what happens. */
const gwVIA=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\S+): (.+)$/s;
const gwVia=t=>{const m=gwVIA.exec(String(t==null?'':t));return m?{via:m[1]+' '+m[2],title:m[3]}:{via:null,title:String(t==null?'':t)}};
/* A line of facts: each fact whole, and the dot between two goes with the fact after it; a line breaks only between facts, and
   the dot of a fact that starts a line is clipped (see .gw-sl), so no line starts or ends on a dot. A fact given as a list of
   nodes may wrap inside its own box, beside its dot, so its second line starts under its first word, never at the dot. */
function gwFacts(list,cls){const el=h('span',{class:'gw-facts gw-sl'+(cls?' '+cls:'')});let i=0;
 for(const f of list){if(f===null||f===undefined||f===false||f==='')continue;const wr=Array.isArray(f);
  const k=wr?f.flat(Infinity).filter(x=>x!==null&&x!==undefined&&x!==false&&x!==''):[f];if(!k.length)continue;
  el.append(h('span',{class:wr?'tk wr':'tk'},i?h('span',{class:'sp'},' · '):null,h('span',{class:'tc'},...k)));i++}return el}
/* A file:line reference (or any path) kept whole: it moves to the next line as one piece, and breaks after a slash only when it
   cannot fit on a line of its own. */
const gwRef=t=>h('span',{class:'gw-ref'},...gwCodeText(t));
/* A note in the tracer's words, with the file references in it kept whole. */
const gwREF=/((?:[\w.@-]+\/)+[\w.@-]+(?::\d+(?::\d+)?)?|[\w.@-]+\.\w+:\d+(?::\d+)?)/;
function gwNote(t){return String(t==null?'':t).split(gwREF).map((x,i)=>i%2?gwRef(x):x).filter(x=>x!=='')}
/* A path of hops, in plain words: a list of hops, each whole, every one after the first led by its arrow, so a line breaks only
   between hops and a line it wraps onto starts with the arrow (see .gw-hp). The tree's card uses it too; a hop may carry a
   class of its own (cls[i]); a hop too long for a card is cut in its middle, its whole name the title. */
function gwHops(labels,cls){return [h('ol',{class:'gw-hops gw-hp'},labels.map((l,i)=>{const t=gwPlain(l),cut=t.split('/').map(p=>gbMid(p,44)).join('/');return h('li',{class:'gw-hop'+(cls&&cls[i]?' '+cls[i]:'')},h('span',{class:'hl',title:cut!==t?t:null},...gwCodeText(cut)))}))]}
/* A failure in the run's own words, one sentence wherever it is said (a card, a row, the Outline, the tree's card):
   "Broke at check “<check>”: <message>", the check's name in bold between quotes, so a check that reads as a sentence never
   reads as broken English, and the closing quote and colon held to its last word so no line starts with them; then, when the
   run names the hop, "On the route: at|after <hop>" on a line of its own. When the scenario's run (sid) recorded the check that
   broke, the message is what that check expected and got, in the verdict's words (view.said, from the server): a grow saved
   before its runs said it that way reads the same as the verdict above it. */
function gwBroke(r,max,sid){const w=String(r&&r.why||'').trim();const i=w.indexOf(': ');const cut=t=>max?gwCut(t,max):t;
 const said=sid&&gw.view&&gw.view.said&&gw.view.said[sid]||null;
 const route=r&&r.hop?h('span',{class:'gw-onroute'},'On the route: '+(r.after?'after ':'at '),...gwCodeText(r.hop)):null;
 if(!w&&!said)return [h('b',{},'Failed'),', with no reason recorded',route];
 if(i<=0)return [h('span',{class:'k'},'Broke: '),cut(said||w),route];
 const step=w.slice(0,i),sp=step.lastIndexOf(' ');
 return [h('span',{class:'k'},'Broke at check '),sp>0?h('b',{},'“'+step.slice(0,sp+1)):null,h('span',{class:'nw'},h('b',{},(sp>0?'':'“')+step.slice(sp+1)+'”'),':'),' '+cut(said||w.slice(i+2)),route]}
/* What a scenario claims, said as what the run did with it: proved once it passed, checked while it runs or after it broke,
   and only to be checked before it runs. */
const gwClaim=x=>{const r=gw.state.run[x.id];return r&&r.st==='pass'?'What it proved':r&&(r.st==='fail'||r.st==='run')?'What it checks':'What it will check'};
/* A device that cannot hover is worked with a finger: what a mouse does by pointing, it does by tapping, and the page's words say
   Tap where a mouse's say Point at. Asked at every paint, and the page paints again when the answer changes (a tablet docked to
   a keyboard and mouse, say); a mouse click on a touch screen still acts as a mouse (see gwModes). */
const gwHoverQ=(()=>{try{return matchMedia('(hover: none)')}catch(e){return null}})();
const gwTouch=()=>!!(gwHoverQ&&gwHoverQ.matches);
try{if(gwHoverQ)gwHoverQ.addEventListener('change',()=>{if(gw.state)growPaint()})}catch(e){}
const gwML=id=>(GW.modes.find(m=>m.id===id)||{label:id}).label;
/* Which mode grows what a mode leaves out: "Max grows them", or "Standard grows 2, Max grows 5". */
/* Where a list mixes kinds, a mode's share is broken down the way the Outline's sections count it, so "Max grows 17" never
   stands unexplained: "Standard grows 3; Max grows 17: 13 part checks and 4 existing flows". */
function gwGrows(list){const by={};for(const x of list)by[x.mode]=(by[x.mode]||0)+1;const ks=GW.modes.map(m=>m.id).filter(k=>by[k]);const n=list.length;
 const kind=n?gwKindOf():null,mixed=!!kind&&new Set(list.map(kind)).size>1;
 const say=k=>{const g=list.filter(x=>x.mode===k),kk=new Set(g.map(kind));if(!mixed||kk.size===1&&kk.has('j'))return gwML(k)+' grows '+(ks.length===1?(n===1?'it':'them'):g.length);return gwML(k)+' grows '+(kk.size===1?gwKinds(g,kind):g.length+': '+gwKinds(g,kind))};
 const parts=ks.map(say);return parts.join(parts.some(t=>t.includes(':')||t.includes(' and '))?'; ':', ')}
/* What a scenario is, as the Outline's sections count it: one on a journey, a part checked on its own, or an existing flow the
   change reaches. By id, so a model drawn from an earlier state still answers for this one. */
/* from the state as it is now: the mode cards render before the tree repaints, so the last drawn model can predate the drafts */
function gwKindOf(){const M=gbModel();const onJ=new Set(M.J.flatMap(j=>(M.leaves[j.id]||[]).map(x=>x.id)));return x=>onJ.has(x.id)?'j':x.scenarioKind==='regression'?'reg':'own'}
const gwKN={own:['part check','part checks'],reg:['existing flow','existing flows']};
const gwKW=(k,n)=>k==='j'?n+' on the journeys':n+' '+gwKN[k][n===1?0:1];
/* What a part is checked by off the journeys, said one way wherever it is said (the inspector, the tree's card for a knot, the
   key and the Outline): its own checks are part checks, the existing flows through it are existing flows, and a count never
   holds the one under the other's name. The mode that grows them leads: "7 in Max · 3 part checks · 4 existing flows". */
const gwOwnKind=x=>x.scenarioKind==='regression'?'reg':'own';
function gwOwnWords(list){const c={own:0,reg:0};for(const x of list)c[gwOwnKind(x)]++;return ['own','reg'].filter(k=>c[k]).map(k=>gwKW(k,c[k]))}
function gwOwnHead(list){const k=new Set(list.map(gwOwnKind));return k.size>1?GB_W.own+' and '+GB_W.reg.toLowerCase():k.has('reg')?GB_W.reg:GB_W.own}
/* a root's own checks are checks of its calls (a service) or its uses (a store), never part checks: "Max checks 3 calls to
   GitHub", in the card, the inspector and the Outline alike */
const gwRootW=u=>u.layer==='ext'?['call','calls',' to ','Calls to ']:['use','uses',' of ','Uses of '];
function gwRootFacts(u,list){const ms=GW.modes.filter(m=>list.some(x=>x.mode===m.id)).map(m=>m.label),w=gwRootW(u),n=list.length;return [gbAnd(ms)+(ms.length===1?' checks ':' check ')+n+' '+(n===1?w[0]:w[1])+w[2]+u.label]}
function gwOwnFacts(list){if(!list.length)return [];const ms=GW.modes.filter(m=>list.some(x=>x.mode===m.id)).map(m=>m.label);return [list.length+' in '+gbAnd(ms),...gwOwnWords(list)]}
/* "13 part checks and 4 existing flows"; "3 on the journeys, 13 part checks and 4 existing flows" */
function gwKinds(list,kind){const c={j:0,own:0,reg:0};for(const x of list)c[kind(x)]++;const w=['j','own','reg'].filter(k=>c[k]).map(k=>gwKW(k,c[k]));return w.length<2?w.join(''):w.slice(0,-1).join(', ')+' and '+w[w.length-1]}
/* What a mode adds that grows off the journeys, so its count adds up to the tree's shoots and the Outline's sections:
   "+13 part checks · +4 existing flows", led by what it adds on the journeys when it adds both. Nothing when it adds none. */
function gwAdds(id){const s=gw.state;if(!s||!s.scenarios.length)return null;const kind=gwKindOf(),c={j:0,own:0,reg:0};for(const x of s.scenarios)if(x.mode===id)c[kind(x)]++;if(!c.own&&!c.reg)return null;
 const p=id===GW.modes[0].id?'':'+';return h('small',{class:'gw-madd'},gwFacts(['j','own','reg'].filter(k=>c[k]).map(k=>p+gwKW(k,c[k]))))}
/* One phrasing for what a mode leaves out, wherever it is said: "Pruned by Minimum: 2 (Standard grows them)". Where the count
   is already in view, without it: "Pruned by Minimum (Max grows them)". */
const gwPruned=(list,mode,bare)=>'Pruned by '+gwML(mode)+(bare?'':': '+list.length)+' ('+gwGrows(list)+')';
/* The legend's marks are the tree's own, drawn small: a leaf in each state (a failed one with its bite), a part's sprig, a
   pruned stub with its cut face, a root in the soil and one over the rim, where tracing stops, a scenario's route on the wood,
   and the files on it. */
const gwF=v=>Math.round(v*100)/100;
const gwCub=(p,t)=>{const u=1-t;return [0,1].map(k=>u*u*u*p[0][k]+3*u*u*t*p[1][k]+3*u*t*t*p[2][k]+t*t*t*p[3][k])};
function gwLeafD(L,W,bite){const a=-L/2,b=L/2,P=q=>gwF(q[0])+' '+gwF(q[1]);const up=[[a,0],[a+.22*L,-.62*W],[b-.32*L,-.62*W],[b,0]];let top='M'+P(up[0])+' C'+P(up[1])+' '+P(up[2])+' '+P(up[3]);
 if(bite){const c=[L*.12,-W*.66],r=W*.5,pts=[];for(let i=0;i<=18;i++){const q=gwCub(up,i/18),d=Math.hypot(q[0]-c[0],q[1]-c[1]);pts.push(d<r?[c[0]+(q[0]-c[0])/(d||1)*r,c[1]+(q[1]-c[1])/(d||1)*r]:q)}top='M'+pts.map(P).join(' L')}
 return top+' C'+P([b-.32*L,.62*W])+' '+P([a+.22*L,.62*W])+' '+P([a,0])+'Z'}
const gwSvg=(w,hh,...k)=>sv('svg',{class:'gw-sw',width:gwF(w*1.2),height:gwF(hh*1.2),viewBox:'0 0 '+w+' '+hh,'aria-hidden':'true',focusable:'false'},...k);
function gwSw(k){
 if(['pass','fail','run','in','none','pre'].includes(k))return gwSvg(16,12,sv('g',{transform:'translate(8 6) rotate(-24)'},sv('path',{d:gwLeafD(13,6.4,k==='fail'),class:'lf '+k}),sv('path',{d:'M-4.6 0 L4.2 0',class:'rib'+(['pass','fail','run'].includes(k)?'':' o')})));
 if(k==='bud')return gwSvg(16,12,sv('path',{d:'M3 11.5 C4.6 9 6.2 7.4 9.6 4.6',class:'stem'}),sv('g',{transform:'translate(11.8 3.3) rotate(-38)'},sv('path',{d:gwLeafD(5.8,3,false),class:'lf bud'})),sv('g',{transform:'translate(5.6 5.8) rotate(-128)'},sv('path',{d:gwLeafD(5.2,2.8,false),class:'lf bud'})));
 /* an existing flow's graft bud: a swelling of the bark with a bud tip at its crown, as the tree draws it (gbPaint); a shoot's
    count of the checks its leaves do not show: a small bud tied to its tip, the number in its round body; where a leaf or a
    branch that had grown was cut, the callus it heals with on the bark; and where a shoot that had grown was cut, its callus
    as the tree lays it, on the bark beside the boss of the knot it grew from, along the grain */
 if(k==='graft')return gwSvg(20,10,sv('path',{d:'M0 4.1 C7 4.3 13 4.5 20 4.7 L20 7.3 C13 7.5 7 7.7 0 7.9 Z',class:'wd'}),sv('ellipse',{cx:10,cy:6,rx:4.6,ry:2.3,class:'wl'}),
  sv('g',{transform:'translate(10 2.1) rotate(-90)'},sv('path',{d:gwLeafD(3.4,1.7,false),class:'lf bud'})));
 if(k==='ntag')return gwSvg(22,12,sv('path',{d:'M1 6 L5 6',class:'ntg'}),sv('path',{d:'M18.8 6 C16.1 7.84 13.64 11.4 10.4 11.4 A5.4 5.4 0 0 1 10.4 .6 C13.64 .6 16.1 4.16 18.8 6 Z',class:'ntg'}),sv('text',{x:10.4,y:6.3,class:'ntn'},'+N'));
 if(k==='cut')return gwSvg(16,12,sv('g',{class:'cutg'},sv('path',{d:'M0 3.4 L16 2.9 L16 9.1 L0 9.6 Z',class:'wd'}),sv('ellipse',{cx:8,cy:6.3,rx:3.6,ry:2.3,class:'cal'}),sv('path',{d:'M5.3 6.9 A2.9 1.8 0 0 1 10.7 6.9',class:'cres'})));
 if(k==='scar')return gwSvg(22,12,sv('path',{d:'M0 3.4 C7.3 3.2 14.7 3 22 2.9 L22 9.1 C14.7 9.2 7.3 9.4 0 9.6 Z',class:'wd'}),
  sv('ellipse',{cx:16.5,cy:5.3,rx:2.8,ry:1.8,class:'cal'}),sv('path',{d:'M14.26 5.3 A2.24 1.44 0 0 1 18.74 5.3',class:'cres'}),
  sv('ellipse',{cx:8.5,cy:6.8,rx:4.3,ry:3.1,class:'k0'}),sv('ellipse',{cx:8,cy:6.2,rx:3.9,ry:2.8,class:'k1'}),sv('ellipse',{cx:7.3,cy:5.4,rx:2.2,ry:1.3,class:'k2'}));
 /* a store's root as the pot shows it: sunk in the soil with the soil's lip over its lower edge, its name on a small tag
    on a solid stake pushed into the soil beside its tip */
 if(k==='root')return gwSvg(22,14,sv('path',{d:'M.5 6.5 C4.6 6.6 8.8 7.1 13.8 8.3 C14.2 8.5 14 8.9 13.6 9 C8.6 9 4.6 9.2 .5 9.6 Z',class:'wd'}),sv('path',{d:'M16.6 11 L16.6 4.6',class:'stk sd'}),
  sv('rect',{x:0,y:8.6,width:22,height:5.4,class:'dirt'}),sv('path',{d:'M.5 8.6 L21.5 8.6',class:'soil'}),sv('rect',{x:12.6,y:1,width:8,height:3.8,rx:1,class:'tag'}));
 /* a store no journey uses as the pot shows it: faded bark running out from the foot, partly sunk in the soil and tapering
    to a cut face, its dashed tag's stake pushed into the cut face */
 if(k==='unused'){const d='M.5 6.4 C6 6.8 11 7.2 17 6.9 L17 10.7 C11 10.6 6 11.2 .5 11.6 Z';return gwSvg(22,14,sv('path',{d,class:'bed'}),sv('path',{d,class:'wd un'}),
  sv('rect',{x:0,y:9.2,width:22,height:4.8,class:'dirt'}),sv('path',{d:'M.5 9.2 L21.5 9.2',class:'soil'}),
  sv('ellipse',{cx:17,cy:8.8,rx:1.3,ry:1.9,class:'cf'}),sv('path',{d:'M16.8 7.6 A.6 1.2 0 0 1 16.8 10',class:'rg'}),
  sv('path',{d:'M17 8.8 L17 4.6',class:'stk sd'}),sv('rect',{x:10.6,y:.9,width:10.4,height:3.7,rx:1,class:'tag dsh'}))}
 if(k==='ext')return gwSvg(18,13,sv('path',{d:'M1 8.6 L9.6 8.6 L9 13 L1.6 13 Z',class:'pot'}),sv('rect',{x:.4,y:6.2,width:10,height:2.6,rx:.7,class:'rim'}),sv('path',{d:'M1.6 4.9 L8.6 4.9 Q12.4 4.9 12.4 8.6 L12.4 12.4',class:'rt'}));
 if(k==='stop')return gwSvg(20,10,sv('path',{d:'M1 5 L5 5',class:'tl'}),sv('path',{d:'M7 5 L10 5',class:'tl',opacity:.6}),sv('path',{d:'M12 5 L14 5',class:'tl',opacity:.35}),sv('circle',{cx:17.2,cy:5,r:1.9,class:'te'}));
 /* the route as the tree draws it inside the wood, in three marks: the amber glow with its cream core, the wood turned red
    just past the hop where it broke (feathered in and out), and the small grey dots where it never got, drawn as the tree
    draws them (one stroke of round dots, .rdots with .sap.rest) */
 if(k==='route'||k==='rbad'||k==='rrest')return gwSvg(22,10,sv('path',{d:'M0 2.4 C7.3 2.8 14.7 3.3 22 3.7 L22 6.3 C14.7 6.7 7.3 7.2 0 7.6 Z',class:'wd'}),
  k==='route'?[sv('path',{d:'M2 5 L20 5',class:'rglow'}),sv('path',{d:'M2 5 L20 5',class:'rte'}),sv('path',{d:'M2 5 L20 5',class:'rcore'})]:k==='rbad'?[sv('defs',{},sv('linearGradient',{id:'gw-swred',gradientUnits:'userSpaceOnUse',x1:7,y1:0,x2:21,y2:0},...[[0,0],[.3,1],[.7,1],[1,0]].map(([o,v])=>sv('stop',{offset:o,class:'rs','stop-opacity':v})))),sv('path',{d:'M2 5 L7.4 5',class:'rglow'}),sv('path',{d:'M2 5 L7.4 5',class:'rte'}),sv('path',{d:'M7 5 L21 5',class:'rte bad'})]:[sv('path',{d:'M3.4 5 L20 5',class:'rdots'})]);
 /* a knot: a boss on the bark, lit gold from inside when its route is lit, cracked red where a hop broke */
 const kn=(...x)=>gwSvg(20,10,sv('path',{d:'M0 3.1 C7 3.3 13 3.5 20 3.7 L20 6.3 C13 6.5 7 6.7 0 6.9 Z',class:'wd'}),...x,sv('ellipse',{cx:10.5,cy:5.6,rx:4.3,ry:3.1,class:'k0'}),sv('ellipse',{cx:10,cy:5,rx:3.9,ry:2.8,class:'k1'}),sv('ellipse',{cx:9.3,cy:4.2,rx:2.2,ry:1.3,class:'k2'}));
 if(k==='knot')return kn();
 if(k==='lit')return kn(sv('ellipse',{cx:10,cy:5,rx:5.6,ry:4.2,class:'kglow'}));
 if(k==='crack'){const g=kn(sv('ellipse',{cx:10,cy:5,rx:5.6,ry:4.2,class:'kbad'}));g.append(sv('path',{d:'M5.4 5 L8 3.9 L10 5.9 L12.2 4.1 L14.6 5',class:'crk'}));return g}
 return null}
/* A criterion's state as a bucket: every criterion lands in exactly one, so the counts always add up to the criteria. */
const gwCB=st=>{const c=st.cls;return c==='pass'?'proved':c==='warn'?'agent':c==='fail'?'failed':c==='miss'?'needs':c==='open'?'open':c==='run'?'run':c==='cov'?(/ of /.test(st.text)?'part':'toprove'):c==='code'?'code':'wait'};
const gwCBO=['proved','agent','part','run','toprove','code','wait','open','failed','needs'];
const gwCBL=(b,n)=>b==='needs'?(n===1?'needs you':'need you'):{proved:'proved',agent:'agent-checked',part:'partly proved',run:'running',toprove:'to prove',code:'found in code',wait:'not traced yet',open:'not proven yet',failed:'failed'}[b];
const gwCBT={proved:'Every scenario serving it passed',agent:'Passed, resting on agent-written work nobody has reviewed yet',part:'Some of the scenarios serving it passed; the rest did not run',run:'A scenario serving it is running',toprove:'Scenarios serve it; none has run',code:'Found in the code; no scenario serves it yet',wait:'Not traced yet',open:'Scenarios serve it, but none of them ran',failed:'A scenario serving it failed',needs:'Not found in this change: say whether it is built, or take it out of the spec'};
const gwSD=b=>h('span',{class:'gw-sd '+b,'aria-hidden':'true'});
function gwBuckets(){const n={};for(const c of gw.view.criteria){const b=gwCB(c.status);n[b]=(n[b]||0)+1}return gwCBO.filter(b=>n[b]).map(b=>[b,n[b]])}
/* A criterion as a chip that carries its state's mark, wherever criteria are listed. */
function gwCrit(id){const c=gw.view.criteria.find(q=>q.id===id);const b=c?gwCB(c.status):'wait';return h('span',{class:'gw-chip',title:c?gwPlain(c.text)+' · '+c.status.text:id},gwSD(b),id)}
/* The chip on a scenario that runs both ways, and the line that says what it means. */
const gwMockChip=()=>h('span',{class:'gw-chip',title:'Runs against a stand-in on every PR, and against the real provider sandbox when its key is set'},'mock + sandbox');
const gwMockNote=()=>h('p',{class:'gw-mocknote'},gwMockChip(),'runs against a stand-in on every PR, and against the provider’s real sandbox when its key is set.');
/* Pointing at a row lights its part of the tree; leaving one view for the other lets go of whatever was lit, so nothing stays highlighted by a row that is gone. */
function gwCalm(){gw.hov=null;gw.hovEl=null;for(const el of document.querySelectorAll('[data-sid].hl'))el.classList.remove('hl');if(gw.B&&gw.B.tip)gw.B.tip.hidden=true}
/* The modes side by side, wherever the page compares them (the panel before a choice, the key under the tree after one): a row
   per journey or kind of scenario, a column per mode with its count, the chosen mode's column marked, and the column of the
   mode pointed at lit (see gwModes). Beside the tree the columns are headed Min, Std and Max; a reader of the page hears the
   names. */
function gwCmp(first,rows,cls){const s=gw.state,SH={min:'Min',std:'Std',max:'Max'};const cc=m=>'n'+(gw.preview===m.id?' is-preview':'')+(s.modeBy&&s.mode===m.id?' is-chosen':'');
 const th=m=>h('th',{class:cc(m),'data-m':m.id,scope:'col'},h('span',{class:'lg'},m.label),h('span',{class:'sh','aria-hidden':'true',title:m.label},SH[m.id]||m.label));
 return h('table',{class:'gw-cmp'+(cls?' '+cls:'')},h('thead',{},h('tr',{},h('th',{scope:'col'},first),GW.modes.map(th))),
  h('tbody',{},rows.filter(Boolean).map(r=>h('tr',Object.assign({},r.attrs||{},r.tot?{class:'tot'}:{}),h('td',r.cls?{class:r.cls}:{},r.label),GW.modes.map(m=>h('td',{class:cc(m),'data-m':m.id},String(r.n(m.id))))))))}
/* What each mode proves, in one table wherever the page compares the modes (the panel before a choice, the key under the tree
   after it): a row per journey, by its number and name on the tree, then the part checks and the existing flows, then In all.
   Pointing at a journey's row lights it on the tree; only the panel's rows are stops for the arrow keys. */
function gwModeTable(cls){const s=gw.state,v=gw.view,M=gw.M||gbModel();const order=gw.order&&gw.order.length?gw.order:M.J.map(j=>j.id);const upto=(list,m)=>list.filter(x=>gbRank[x.mode]<=gbRank[m]).length;
 const kind=gwKindOf(),own=s.scenarios.filter(x=>kind(x)==='own'),reg=s.scenarios.filter(x=>kind(x)==='reg');
 return gwCmp(GB_W.scen,[...order.map((jid,i)=>{const j=M.J.find(q=>q.id===jid);if(!j)return null;const ls=M.leaves[jid]||[];return {attrs:{'data-ol':cls?null:'j:'+jid,on:{mouseenter:()=>gbLit2('j:'+jid),mouseleave:()=>gbLit2(null)}},label:h('div',{class:'jt'},h('b',{class:'no'},String(i+1)),h('span',{},...gwRich(j.title))),n:m=>upto(ls,m)}}),
  own.length?{cls:'muted',label:GB_W.own,n:m=>upto(own,m)}:null,reg.length?{cls:'muted',label:GB_W.reg,n:m=>upto(reg,m)}:null,{tot:true,label:GB_W.all,n:m=>v&&v.counts?v.counts[m]:upto(s.scenarios,m)}],cls)}
/* The inspector: whatever is pinned (a journey, a scenario or a part); otherwise the part being traced while it runs,
   and once it is done the first failing journey, else the headline one. For a journey it says only what the list does not:
   its title, where it starts, its path and its failure; the Journeys card below is the one list of its scenarios. */
function gwInspector(){const s=gw.state,v=gw.view;const M=gw.M||gbModel();
 const card=h('aside',{class:'gw-ins','aria-label':'Inspector','data-testid':'grow-inspector'});
 let pin=gw.pinned,who='Pinned',live=false;
 /* while the choice is open, the panel helps make it: how many scenarios each mode proves on each journey */
 if(!pin&&s.asked&&!s.modeBy&&M.J.length){gwPut(card,h('span',{class:'who'},'Before you choose'),h('h3',{},GB_W.modes),gwModeTable(),
   h('p',{class:'small muted',style:'margin:10px 0 0'},gwTouch()?'Tap a mode to see it on the tree: what it keeps stays, what it cuts fades. Tap it again to choose; nothing runs until you do.':'Point at a mode to see it on the tree: what it keeps stays, what it cuts fades. Nothing runs until you pick.'));return card}
 if(!pin){if(!s.done&&s.focus&&!(s.asked&&!s.modeBy)){pin='u:'+s.focus;live=true;const ag=s.agents.find(a=>!a.done&&a.unit===s.focus);who='Following '+(ag?(ag.by==='rules'?'the rules':ag.by)+' · '+ag.brief:'the latest event')}
  else if(M.J.length){const hd=gbHead(M,M.J),failing=(M.leaves[hd.id]||[]).some(x=>s.run[x.id]&&s.run[x.id].st==='fail');pin='j:'+hd.id;who=failing?'The first failing journey':'The headline journey'}}
 if(!pin){gwPut(card,h('span',{class:'gw-eyebrow'},'Inspector'),h('p',{class:'gw-empty'},'Follows the tracer as it works. Select a journey, a leaf or a knot to pin it.'));return card}
 /* under the tree (a tablet or a phone) the Journeys card comes straight after and opens a journey or a scenario in place, and
    a phone draws a tapped leaf's card under the tree: there the panel steps aside rather than say the same things again */
 const stacked=gbNarrowList(),phone=!!(gw.B&&gw.B.L&&gw.B.L.narrow),fromList=!!gw.pinned&&gw.pinList===gw.pinned;
 if(stacked&&!live&&(pin.startsWith('j:')||pin.startsWith('s:')&&(fromList||phone)))return null;
 /* a scenario opened in place in a list leaves the panel its journey */
 if(pin.startsWith('s:')&&fromList){const x=gwScen(pin.slice(2));const j=x&&M.J.find(q=>(M.leaves[q.id]||[]).includes(x));if(j){pin='j:'+j.id;who='Its journey'}}
 const head=h('div',{class:'row',style:'justify-content:space-between'},h('span',{class:'who'},who),gw.pinned?h('button',{class:'btn ghost sm',on:{click:()=>{gw.refocus=gw.pinned;gw.pinned=null;gw.pinList=null;growPaint()}}},s.done?'Unpin':'Follow'):null);
 if(pin.startsWith('j:')){gwPut(card,head,gbJourneyCard(pin.slice(2)));return card}
 if(pin.startsWith('s:')){gwPut(card,head,gbScenarioCard(pin.slice(2)));return card}
 const id=pin.startsWith('u:')?pin.slice(2):pin;if(!gwUnit(id))return card;
 /* a phone's tapped knot already has its name and place in the card under the tree */
 gwPut(card,head,gwPartCard(id,phone&&!live,live));
 return card}
/* A part: the journeys that cross it, how deep tracing went and what each look found, how each layer is proved, and its own
   checks. In the Outline it opens in place under its row, so it leaves out the name the row already shows. A look that found
   nothing says only that; a file the note already names is not named again beside it. */
function gwPartCard(id,inline,live){const s=gw.state,v=gw.view;const M=gw.M||gbModel();const u=gwUnit(id);if(!u)return null;const d=s.depth[id]||{};const dp=v.depth[id]||{pips:[],score:0};
 const on=M.J.filter(j=>j.units.includes(id)),nums=on.map(j=>(gw.order||[]).indexOf(j.id)+1).filter(Boolean).sort((x,y)=>x-y);const own=M.buds[id]||[];
 const seen=new Set();
 const said=e=>{const loc=e.loc&&!/^[-—–\s]*$/.test(e.loc)?e.loc:'';const file=loc.replace(/:\d+(:\d+)?$/,'');let note=(e.note||'').trim();let at=loc;
  if(file&&note.includes(file)){note=note.replace(file,loc);at=''}if(at&&seen.has(at))at='';if(loc)seen.add(loc);
  return at||note?h('small',{},gwFacts([at?[gwRef(at)]:null,note?gwNote(note):null])):null};
 /* while it follows the tracer, the panel shows three of the five looks, around the latest (from the first, once all five are
    in), so it stays shorter than the tree */
 const rows=GW.steps.map(([k,label])=>{const e=d[k];const st=e?e.status:'wait';return h('div',{class:'gw-dp '+st},h('span',{class:'m'},{ok:'✓',none:'○',stop:'✕',wait:'·'}[st]),h('span',{class:'n'},label,e&&e.by!=='rules'?h('span',{class:'by'},e.by):null,e?said(e):null))});
 const last=GW.steps.reduce((a,st,ix)=>d[st[0]]?ix:a,-1),from=last>=rows.length-1?0:Math.max(0,Math.min(rows.length-3,last-1)),few=!!live&&!gw.depthAll&&rows.length>3;
 /* its own checks: the ones this mode runs as rows; the ones a bigger mode grows as one line, so a part with many of them does
    not grow the panel past the tree */
 const ownIn=own.filter(gwIn),ownOut=own.filter(x=>!gwIn(x));
 return [inline?null:h('h3',{},u.label),inline?null:h('div',{class:'where'},gwFacts([u.root?'what it depends on':'part',u.unitKind,[gwRef(u.loc)]])),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},u.root?gbFeeds(nums):nums.length?'On journey'+(nums.length===1?' ':'s ')+gbAnd(nums):'On no journey'),
   on.length?on.map(j=>{const i=(gw.order||[]).indexOf(j.id)+1,n=(M.leaves[j.id]||[]).filter(gwIn).length;return h('button',{class:'gb-ols',on:{click:()=>{gw.pinned='j:'+j.id;gw.pinList=null;gw.refocus='j:'+j.id;growPaint()}}},h('span',{class:'no'},i?String(i):''),h('span',{class:'t'},...gwRich(j.title)),h('span',{class:'bx'},h('span',{class:'gw-n'},n+' scenario'+(n===1?'':'s'))))}):h('p',{class:'small muted',style:'margin:0'},u.root?'No journey in this change reaches it.':'Changed, but nothing in this change reaches it. Max checks it on its own.')),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'How deep it went'),h('div',{class:'row',style:'gap:6px 10px;margin-bottom:6px;flex-wrap:wrap'},h('span',{class:'gw-pips'},dp.pips.map(p=>h('i',{class:p}))),h('b',{style:'font-weight:500;font-size:13px'},dp.pips.filter(p=>p==='ok').length+' of 5 found'+((n=>n?' · '+n+' looked, nothing there':'')(dp.pips.filter(p=>p==='none').length))),dp.pips.includes('stop')?h('span',{class:'gw-badge nf'},'trace stops'):null),
   few?rows.slice(from,from+3):rows,
   live&&rows.length>3?h('button',{class:'gw-dpmore','data-ol':'dp:more','aria-expanded':String(!few),on:{click:()=>{gw.depthAll=!gw.depthAll;gw.refocus='dp:more';growPaint()}}},few?'Show all '+rows.length+' looks':'Show only the latest 3'):null),
  (s.cells[id]||[]).length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'How each layer is proved'),h('div',{class:'gw-lay'},(s.cells[id]||[]).flatMap(c=>[h('span',{class:'gw-chip '+c.status},GW.layers[c.layer]),h('span',{},...gwNote(c.reason),h('small',{},c.adapter==='none'?'no adapter':'adapter: '+c.adapter))]))):null,
  /* the rows this mode runs, under their kind when the part has both (one flat list, as h flattens its children only once);
     then what a bigger mode adds, in the one line the tree's card and the Outline print for this part */
  own.length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},gwOwnHead(own)),['own','reg'].flatMap(k=>{const g=ownIn.filter(x=>gwOwnKind(x)===k);return g.length?[new Set(ownIn.map(gwOwnKind)).size>1?h('div',{class:'gb-sub'},gwOwnHead(g)):null,
    ...g.map(x=>gbItem(x,{class:'gb-ols',on:{click:()=>{gw.pinned='s:'+x.id;gw.pinList=null;growPaint()}}},[gwBadge(x)]))]:[]}),
   ownOut.length?h('p',{class:'small muted gw-one','data-testid':'grow-own-line'},gwFacts(gwOwnFacts(ownOut))):null):null]}
function gwBadge(x){const r=gw.state.run[x.id];if(!gwIn(x))return h('span',{class:'gw-badge'},x.mode==='max'?'max':'standard');
 if(!r)return h('span',{class:'gw-badge'},'drafted');if(r.st==='run')return h('span',{class:'gw-badge run'},'running');if(r.st==='pass')return h('span',{class:'gw-badge pass'},'passed '+gwDur(r.ms));
 if(r.st==='fail')return h('span',{class:'gw-badge fail'},'failed');return h('span',{class:'gw-badge'+(x.flow?'':' nf'),title:r.why||''},x.flow?'to prove':'no flow yet')}
/* The spec as a strip of criteria: one chip each, its mark the status; the chosen one opens below and lights its parts in the
   tree. Above the strip, every criterion is counted once, as chips with the same marks. */
function gwSpec(){const s=gw.state,v=gw.view;const card=h('section',{class:'card','aria-label':'Spec','data-testid':'grow-spec'});
 const open=gw.selCrit?v.criteria.find(c=>c.id===gw.selCrit):null;const ob=open?gwCB(open.status):null;
 const notes=[...s.drift.length?[h('div',{class:'gw-flag'},h('b',{},'In the code, not in the spec'),h('span',{},'Changed here, but no criterion covers '+(s.drift.length===1?'it':'them')+'. Confirm '+(s.drift.length===1?'it is':'they are')+' intended, or add '+(s.drift.length===1?'it':'them')+' to the spec.'),s.drift.map(d=>h('span',{class:'gw-loc'},h('span',{class:'nw'},d.what),' ',h('span',{class:'gw-ref muted'},...gwCodeText(d.loc)))))]:[],
  ...s.stops.map(x=>h('div',{class:'gw-flag red'},h('b',{},'Tracing stopped at '+((gwUnit(x.unit)||{}).label||x.unit)),h('span',{},...gwNote(x.why),' ',h('span',{class:'gw-loc gw-ref muted'},...gwCodeText(x.at)))))];
 const sum=v.criteria.length?gwBuckets():[];
 gwPut(card,h('span',{class:'gw-eyebrow',style:'margin:0'},'Spec'),
  h('p',{class:'small muted',style:'margin:4px 0 0'},s.spec?'From '+s.spec.source+', '+s.spec.via:s.specMissing?'No spec: '+s.specMissing:'Looking in the PR, linked issues and commits'),
  sum.length?h('div',{class:'gw-sum','data-testid':'grow-spec-summary','aria-label':v.criteria.length+' criteria'},sum.map(([b,n])=>h('span',{class:'gw-sp '+b,title:gwCBT[b]},gwSD(b),n+' '+gwCBL(b,n)))):null,
  v.criteria.length?h('div',{class:'gw-strip',role:'group','aria-label':'Criteria'},v.criteria.map(c=>h('button',{class:'gw-cc','aria-pressed':gw.selCrit===c.id?'true':'false',title:gwPlain(c.text)+' · '+c.status.text,on:{click:()=>{gw.selCrit=gw.selCrit===c.id?null:c.id;growPaint()}}},gwSD(gwCB(c.status)),c.id))):null,
  open?h('div',{class:'gw-cdet'},h('span',{class:'id'},open.id),h('span',{},...gwRich(open.text),h('small',{},s.unbuilt[open.id]?s.unbuilt[open.id]:open.units.length?'in '+open.units.map(id=>(gwUnit(id)||{}).label).join(', '):'No part of the change matched its words yet.')),h('span',{class:'gw-sp '+ob,title:gwCBT[ob]},gwSD(ob),open.status.text)):
   v.criteria.length?h('p',{class:'gw-empty',style:'margin:6px 0 0'},'Pick a criterion to see which parts serve it; '+(gw.tree==='outline'?'the list highlights them.':'the tree lights them.')):null,
  s.dropped.length?h('div',{class:'gw-flag red'},h('b',{},s.dropped.length+' agent claim'+(s.dropped.length===1?'':'s')+' dropped'),h('span',{},s.dropped.slice(0,3).map(x=>x.why).join('; ')+(s.dropped.length>3?'; and more':''))):null,
  notes.length?h('details',{class:'gw-notes',open:notes.some(n=>n.classList.contains('red'))?true:null},h('summary',{},notes.length+' note'+(notes.length===1?'':'s')+': '+[s.drift.length?s.drift.length+' in the code, not in the spec':null,s.stops.length?'tracing stopped '+s.stops.length+'×':null].filter(Boolean).join(' · ')),notes):null);
 return card}
function gwLanes(x){const s=gw.state;const r=s.run[x.id],v=s.real[x.id];
 const mock=!r?h('span',{class:'gw-badge'},'waiting'):r.st==='run'?h('span',{class:'gw-badge run'},'running'):r.st==='pass'?h('span',{class:'gw-badge pass'},'passed '+gwDur(r.ms)):r.st==='fail'?h('span',{class:'gw-badge fail'},'failed'):h('span',{class:'gw-badge'+(x.flow?'':' nf')},x.flow?'to prove':'no flow yet');
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
/* scenarios that did not run, in the tree's words: no flow yet when nothing proves them, to prove when one exists */
/* A verdict's counts each stay whole on a line ("1 failed", never "1" ending one line and "failed" starting the next); the
   words are the same, so its text reads as before. */
const gwClauses=t=>String(t).split(', ').flatMap((c,i)=>i?[', ',h('span',{class:'nw'},c)]:[c]);
function gwNotRun(){const s=gw.state;const nr=s.scenarios.filter(x=>s.run[x.id]&&s.run[x.id].st==='not_run');const nf=nr.filter(x=>!x.flow).length,rest=nr.length-nf;
 return (nf?', '+nf+' with no flow yet':'')+(rest?', '+rest+' to prove':'')}
/* The spec's line in the verdict counts each criterion once, in the spec panel's words. A count of none is left out, except
   "0 need you": it is the one that says nothing waits on the reader. */
function gwSpecLine(){const s=gw.state;if(!s.criteria.length)return 'No spec to check against. ';const B=Object.fromEntries(gwBuckets());
 return 'Spec: '+(B.proved||0)+' of '+gw.view.criteria.length+' criteria proved'+['agent','part','run','toprove','code','wait','open','failed'].map(b=>B[b]?', '+B[b]+' '+gwCBL(b,B[b]):'').join('')+', '+(B.needs||0)+' '+gwCBL('needs',B.needs||0)+'. '}
/* ---------- From a scenario to its run ---------- */
/* A scenario that ran opens the Run tab at its own run and flow, the ones the grow recorded for it (never "the latest run"), at
   the step that broke, or at its first step when it passed: the way History opens a run. One whose run never reached its
   checks (the app did not start, say) is not tested yet, and opens that run too, to show why. */
const gwRan=x=>{const r=gw.state&&x&&gw.state.run[x.id];return !!(r&&r.run&&(r.st==='pass'||r.st==='fail'||r.st==='not_run'))};
async function gwOpenRun(sid,at,quiet){const s=gw.state;const x=s&&gwScen(sid),r=s&&s.run[sid];const say=t=>{if(!quiet)toast(t)};
 if(!x||!gwRan(x)){say('No run was recorded for this scenario.');return false}
 /* the grow saved its runs beside the config it ran with (dogfood/tracegrove.config.yaml saves them in dogfood/), so they are
    read from there; "not saved" is said only when that folder has no such run */
 const flow=r.flow||x.flow,cfg=s.flows&&s.flows.config||null,sub=cfg&&cfg.lastIndexOf('/')>0?cfg.slice(0,cfg.lastIndexOf('/')):null;let run;
 try{run=await api('/api/runs/'+encodeURIComponent(r.run)+(cfg?'?config='+encodeURIComponent(cfg):''))}
 catch(e){say(e&&e.error==='run not found'?'The run '+r.run+' is not saved in '+(sub||'this folder')+' any more.':'The run '+r.run+' could not be read'+(e&&e.error?': '+e.error:'')+'.');return false}
 const c=(run.cases||[]).find(k=>k.caseId===flow)||((run.cases||[]).length===1?run.cases[0]:null);
 if(!c){say('The run '+r.run+' has no record of '+(flow||'this scenario')+'.');return false}
 const steps=c.steps.filter(k=>k.declared!==false);const bad=k=>k&&(k.result==='failed'||k.result==='cancelled'||(k.checks==='fail'&&k.result==='completed'));
 let i=c.failure?steps.findIndex(k=>k.name===c.failure.step||k.id===c.failure.step):-1;if(i<0||!bad(steps[i]))i=steps.findIndex(bad);
 if(typeof at==='number'&&at>=0&&at<steps.length)i=at;
 ui.runName=r.run;ui.runAt={name:r.run,config:cfg};ui.run=run;ui.sel=c.caseId;ui.step=Math.max(0,i);gw.happened={sid:sid,run:r.run,flow:c.caseId};gw.pinned='s:'+sid;
 /* the list of runs the Run tab offers may predate this grow */
 try{state=await api('/api/overview')}catch(e){}
 openTab('Run');return true}
/* "Open the runs" opens the first failure's run at its failing step; with no failure, the latest run this grow made. It is
   never a dead end: when that run is not saved here any more (a grow proved in a worktree of its own, say), it says so and
   tries the next failure's run, then the newest run this grow saved, and at last opens the Run tab as it is. A grow whose
   config is in a subfolder stays here instead: this folder's Run tab would only offer to plant a config it already has. */
async function gwOpenRuns(){const s=gw.state;if(!s){openTab('Run');return}
 const fails=s.scenarios.filter(x=>s.run[x.id]&&s.run[x.id].st==='fail'&&gwRan(x));
 const ran=s.scenarios.filter(x=>gwRan(x)&&fails.indexOf(x)<0).sort((a,b)=>String(s.run[b.id].run).localeCompare(String(s.run[a.id].run)));
 const tries=fails.concat(ran);
 for(let i=0;i<tries.length;i++)if(await gwOpenRun(tries[i].id,undefined,i>0))return;
 if(!state.hasConfig&&s.flows&&s.flows.config){if(!tries.length)toast('This grow saved no run to open.');return}
 openTab('Run')}
/* The link every place a scenario is shown gives it once it has a run: its card, its row opened in place, a phone's card. */
function gwHappened(x){return gwRan(x)?h('button',{class:'gw-lnk gw-hap',type:'button','data-hap':x.id,'aria-label':'See what happened: '+gwPlain(gwVia(x.title).title),on:{click:e=>{e.stopPropagation();gwOpenRun(x.id)}}},'See what happened ›'):null}
/* ---------- What happened: one scenario's run, step by step, beside the tree ---------- */
/* The drawer reads the run the grow recorded for a scenario from that run's verified bundle (GET /api/runs/<run>/happened, which
   needs the session token) and shows its steps, what each one recorded, one sentence for how it broke, and the evidence behind
   it. It takes the inspector's place beside the tree, which stays drawn and lit; under 1060 px it is a sheet over the page. A
   scenario with no run says why, what it would prove and where it starts. The address names it: #grow/<id>/steps/step-<n>. */
const gwDrW={fail:'Failed',pass:'Passed',none:'Not tested yet'},gwDrM={pass:'✓',fail:'✗',warn:'!',none:'–'};
/* a scenario this grow ran, or one it left untested once it is done, has a drawer; one cut by the mode or still running has not */
const gwDrCan=x=>{const s=gw.state,r=x&&s&&s.run[x.id];return !!x&&gwIn(x)&&!(r&&r.st==='run')&&(gwRan(x)||!!s.done)};
function gwDrOpen(sid,step,quiet,keep){const s=gw.state,x=s&&gwScen(sid);if(!gwDrCan(x))return;const ran=gwRan(x);
 gw.dr={sid:sid,step:typeof step==='number'&&step>=0?step:null,tab:'checked',data:null,err:null,loading:ran,run:ran?s.run[sid].run:null};
 gw.dr.focus=!keep;gw.pinned='s:'+sid;if(!keep)gw.drScroll=true;if(ran)gwDrLoad(gw.dr);if(!quiet)growPaint()}
async function gwDrLoad(d){const s=gw.state,r=s.run[d.sid],x=gwScen(d.sid);const flow=r.flow||x.flow||'',cfg=s.flows&&s.flows.config||null,sub=cfg&&cfg.lastIndexOf('/')>0?cfg.slice(0,cfg.lastIndexOf('/')):null;
 let out=null,err=null;
 /* the run is read for the flow the grow recorded it ran, never for whichever flow the run holds */
 if(!flow)err='This grow did not record which flow made the run '+r.run+', so it is not read as this scenario.';
 else try{const res=await fetch('/api/runs/'+encodeURIComponent(r.run)+'/happened?case='+encodeURIComponent(flow)+(cfg?'&config='+encodeURIComponent(cfg):''),{headers:{'x-tracegrove-token':TOKEN}});
  const j=await res.json().catch(()=>null);
  if(res.ok&&j&&Array.isArray(j.steps))out=j;else err=j&&j.error==='run not found'?'The run '+r.run+' is not saved in '+(sub||'this folder')+' any more.':j&&j.error==='the run has no record of that flow'?'The run '+r.run+' has no record of '+flow+'.':'The run '+r.run+' could not be read'+(j&&j.error?': '+j.error:'')+'.'}
 catch(e){err='The run '+r.run+' could not be read.'}
 if(gw.dr!==d)return;d.loading=false;d.data=out;d.err=err;if(out&&(d.step===null||d.step>=out.steps.length))d.step=out.at;
 if(tab==='Discover')growPaint()}
/* Under 1060 px the drawer is a sheet that covers the page: Tab and Shift+Tab go round its own controls, and focus that lands
   behind it (on the tree or a row it hides) comes back to its heading */
const gwDrSheet=()=>{try{return matchMedia('(max-width:1060px)').matches}catch(e){return false}};
function gwDrLoop(e,el){const f=[...el.querySelectorAll('button,[href],input,select,textarea,[tabindex]')].filter(x=>!x.disabled&&x.getAttribute('tabindex')!=='-1'&&x.offsetParent!==null);
 if(!f.length)return;const a=document.activeElement,first=f[0],last=f[f.length-1];
 if(e.shiftKey&&(a===first||!el.contains(a)||f.indexOf(a)<0&&a===el.querySelector('#gw-dr-title'))){e.preventDefault();last.focus()}
 else if(!e.shiftKey&&(a===last||!el.contains(a))){e.preventDefault();first.focus()}}
/* another dialog open over the page (the command palette, the keyboard list) keeps its own focus and its own Escape */
const gwOverlay=t=>!!document.querySelector('.pal-back')||!!(t&&t.closest&&t.closest('[aria-modal="true"]:not(.gw-dr)'));
document.addEventListener('focusin',e=>{if(!gw.dr||tab!=='Discover'||!gw.slots||!gwDrSheet())return;const box=gw.slots.ins,el=box.querySelector('.gw-dr');
 if(!el||!box.isConnected||box.contains(e.target)||gwOverlay(e.target))return;const t=el.querySelector('#gw-dr-title');if(t)t.focus({preventScroll:true})});
/* Close returns to the panel, and focus to the link that opened the drawer */
function gwDrClose(){const d=gw.dr;if(!d)return;gw.dr=null;gw.refocus=d.from||'d:'+d.sid;growPaint()}
/* Escape closes the open drawer wherever focus is, on the page body too (as when a link opened it); a key something else used,
   or one pressed while another dialog is open over the page, is left alone */
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||e.defaultPrevented||gwOverlay(e.target)||!gw.dr||tab!=='Discover'||!gw.slots||!gw.slots.ins.isConnected||!gw.slots.ins.querySelector('.gw-dr'))return;e.preventDefault();gwDrClose()});
/* The drawer's head and the step it opened on (with no run, its buttons) both come into view: the page scrolls as little as it
   can, and the panel beside the tree, or the sheet under its head, scrolls inside itself */
function gwDrReveal(){const S=gw.slots,box=S&&S.ins,el=box&&box.querySelector('.gw-dr');if(!el||!el.isConnected)return;const m=8;
 const hd=el.querySelector('.gw-drh'),st=el.querySelector('.gw-drs [aria-pressed=true]')||el.querySelector('.gw-dra')||hd;const sheet=getComputedStyle(box).position==='fixed';
 if(box.scrollHeight>box.clientHeight+1){const r=box.getBoundingClientRect(),a=hd.getBoundingClientRect(),b=st.getBoundingClientRect();let dy=0;
  if(sheet){if(b.top<a.bottom)dy=b.top-a.bottom-m;else if(b.bottom>r.bottom-m)dy=Math.min(b.bottom-(r.bottom-m),b.top-a.bottom-m)}
  else if(a.top<r.top)dy=a.top-r.top;else if(b.bottom>r.bottom-m)dy=Math.min(b.bottom-(r.bottom-m),a.top-r.top);
  if(dy)box.scrollTop+=dy}
 if(sheet)return;const a=hd.getBoundingClientRect(),b=st.getBoundingClientRect(),vh=innerHeight;let wy=0;
 if(a.top<m)wy=a.top-m;else if(b.bottom>vh-m)wy=Math.min(b.bottom-(vh-m),a.top-m);
 if(wy)window.scrollBy({top:wy,behavior:'instant'})}
function gwDrCopy(){const url=location.href;try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(()=>toast('Copied the link to this step.'),()=>toast('Link: '+url));return}}catch(e){}toast('Link: '+url)}
/* "Write this flow" puts the scenario's claim in the Intent box below the tree, where drafting writes flows */
function gwDrWrite(x){ui.intent=gwPlain(x.proves||gwVia(x.title).title);gw.dr=null;render();const box=document.getElementById('intent');
 if(box){box.value=ui.intent;box.focus({preventScroll:true});box.scrollIntoView({block:'center'})}toast('Its claim is in the Intent box below. Draft it there to write the flow.')}
/* The way in, wherever a scenario is shown beside "See what happened ›" (which opens the Run tab) */
function gwDrEntry(x){if(!gwDrCan(x))return null;const ran=gwRan(x);
 return h('button',{class:'gw-lnk gw-dre',type:'button','data-dr':x.id,'aria-label':(ran?'What happened, step by step: ':'Why it is not tested yet: ')+gwPlain(gwVia(x.title).title),on:{click:e=>{e.stopPropagation();gwDrOpen(x.id)}}},ran?'Step by step ›':'Why not tested yet ›')}
/* With several failures, the drawer of one pages to the next in the order the verdict counts them: "Failure 1 of 3" */
function gwDrPager(x){const s=gw.state,f=s.scenarios.filter(q=>gwIn(q)&&s.run[q.id]&&s.run[q.id].st==='fail'&&gwRan(q)),i=f.indexOf(x);if(i<0||f.length<2)return null;
 const go=k=>()=>{if(f[k])gwDrOpen(f[k].id)};
 return h('div',{class:'gw-drpg','data-testid':'grow-happened-pager'},h('button',{type:'button','aria-label':'Previous failure','data-testid':'grow-happened-prev',disabled:i<=0,on:{click:go(i-1)}},'‹'),
  h('span',{},'Failure '+(i+1)+' of '+f.length),h('button',{type:'button','aria-label':'Next failure','data-testid':'grow-happened-next',disabled:i>=f.length-1,on:{click:go(i+1)}},'›'))}
/* every stand-in call the run recorded, each once: a watch step reads all the calls its stand-in has had so far, so two watch
   steps on one route both hold the earlier calls */
const gwDrCalls=steps=>{const seen=new Set();return steps.flatMap(q=>q.calls||[]).filter(c=>{const k=JSON.stringify([c.standIn,c.method,c.path,c.at,c.key]);if(seen.has(k))return false;seen.add(k);return true})};
/* the route a step sent: its path as the runner recorded sending it, else as its flow declares it, which says so when it names a
   saved value ("{invoiceId}") */
const gwDrPath=q=>q.method+' '+(q.request&&q.request.path?q.request.path:q.path+(/\{[A-Za-z_]\w*\}/.test(q.path)?' (as declared)':''));
/* a response body as it was recorded; JSON is laid out to read, the same text */
const gwDrPretty=t=>{try{return JSON.stringify(JSON.parse(t),null,2)}catch(e){return t}};
const gwDrRuns=n=>n===1?'its 1 saved run':n+' saved runs';
/* whether the flow held before, from the runs saved beside this one, and that no run of the base branch is recorded to compare */
function gwDrHist(hs){if(!hs||!hs.saved)return null;const s=gw.state,base=s.change&&s.change.base;const all=hs.saved===1?'its 1 saved run':'all '+hs.saved+' saved runs';
 return (hs.failed===hs.saved?'Failed in '+all:hs.passed===hs.saved?'Passed in '+all:'Passed '+hs.passed+' of '+hs.saved+' saved runs')+(base?'; no run on '+base+' is recorded.':'.')}
function gwDrawer(){const d=gw.dr,s=gw.state,M=gw.M||gbModel();const x=gwScen(d.sid);if(!x)return null;const r=s.run[x.id];const T=gwVia(x.title);
 const j=M.J.find(q=>(M.leaves[q.id]||[]).includes(x)),n=j?(gw.order||[]).indexOf(j.id)+1:0;const st=r&&r.st==='fail'?'fail':r&&r.st==='pass'?'pass':'none';
 /* under 1060 px it is a sheet over the page: a dialog that keeps Tab inside it */
 const sheet=gwDrSheet();
 const el=h('section',{class:'gw-dr','aria-label':'What happened','data-testid':'grow-happened',role:sheet?'dialog':null,'aria-modal':sheet?'true':null,on:{keydown:e=>{if(e.key==='Escape'){if(gwOverlay(e.target))return;e.preventDefault();e.stopPropagation();gwDrClose()}else if(e.key==='Tab'&&gwDrSheet())gwDrLoop(e,el)}}});
 const place=j?(n?'Journey '+n+', ':'')+gbROLEW[gbPol(x)]:x.scenarioKind==='regression'?'existing flow':'part check';
 gwPut(el,h('div',{class:'gw-drh'},h('span',{class:'mk '+st,'aria-hidden':'true'},{fail:'✗',pass:'✓',none:'○'}[st]),
  h('div',{style:'min-width:0'},h('h2',{id:'gw-dr-title',tabindex:'-1','data-testid':'grow-happened-title'},...gwRich(T.title)),
   h('div',{class:'meta'},h('span',{class:'w '+st},gwDrW[st]),x.mode==='min'?h('span',{class:'gw-chip min'},'minimum'):h('span',{class:'gw-chip'},gwML(x.mode).toLowerCase()),h('span',{},place),
    h('span',{},x.criteria.length?'promise'+(x.criteria.length>1?'s ':' ')+x.criteria.join(', '):'no promise')),gwDrPager(x)),
  h('button',{class:'gw-drx',type:'button','aria-label':'Close what happened','data-testid':'grow-happened-close',on:{click:gwDrClose}},'×')));
 if(!gwRan(x)){gwPut(el,gwDrNone(x,r,j,M));return el}
 if(d.loading){gwPut(el,h('p',{class:'row muted',style:'margin:14px 0 0'},h('span',{class:'think'},h('i'),h('i'),h('i')),'Reading run '+d.run));return el}
 if(!d.data){gwPut(el,h('p',{class:'gw-drerr',role:'alert'},d.err||'The run could not be read.'),gwDrActs(x,null));return el}
 const D=d.data,steps=D.steps,all=gwDrCalls(steps),cur=d.step,hs=D.history;
 const hist=gwDrHist(hs);
 /* each step, and under it what it recorded: the answer the run contradicts, the stand-in calls made while it ran (placed by
    their own timestamps), and for a watch step what it expected and got, and how long it waited */
 const ol=h('ol',{class:'gw-drs','aria-label':'Steps'},steps.map((q,i)=>{const k=q.checks==='fail'&&q.result==='completed'?'fail':kind(q.result);const con=!!D.contradicts&&D.contradicts.at===i;const sx=[];
  if(q.answer&&(con||k==='fail'&&q.method!=='STANDIN'))sx.push(['answered '+gwCut(q.answer,200),'']);
  for(const c of all)if(c.during===q.id)sx.push([c.standIn+' ← '+(c.amount!=null?c.amount:c.method+' '+c.path),con?'bad':'']);
  if(con)sx.push(['◀ contradicts its answer','bad']);
  if(q.method==='STANDIN'||q.watch){for(const c of q.checked||[])sx.push([c.says,c.held===false?'bad':'']);
   if(q.watch&&q.durationMs!=null)sx.push(['waited '+q.durationMs+' ms of its '+q.watch.deadlineMs+' ms deadline'+(q.watch.everyMs!=null?', polling every '+q.watch.everyMs+' ms':'')+(q.method==='STANDIN'?' (not app time)':''),''])}
  return h('li',{},h('button',{type:'button',class:k,'aria-pressed':String(cur===i),'data-testid':'grow-happened-step-'+(i+1),on:{click:()=>{d.step=i;gw.refocus='t:grow-happened-step-'+(i+1);growPaint()}}},
   h('span',{class:'n'},String(i+1)),h('span',{class:'sm '+k},gwDrM[k]||'–',h('span',{class:'sr'},' '+(LABEL[k]||q.result))),h('span',{class:'t'},q.name),h('span',{class:'ms'},q.durationMs!=null?q.durationMs+' ms':''),
   sx.length?h('span',{class:'sx'},sx.map(([t,c])=>h('span',{class:c||null},t))):null))}));
 /* the evidence, in tabs that appear only when they have something to show */
 const answered=steps.map((q,i)=>[q,i]).filter(([q])=>q.answer);const nCheck=steps.filter(q=>(q.checked||[]).length).length;
 const tabs=[['checked','We checked',nCheck],['answered','App answered',answered.length],['called','Called out',all.length],['requests','Requests',steps.length]].filter(t=>t[2]>0);
 const key=tabs.some(t=>t[0]===d.tab)?d.tab:tabs.length?tabs[0][0]:null;const pick=k=>{d.tab=k;gw.refocus='t:grow-happened-tab-'+k;growPaint()};
 const list=key?h('div',{class:'gw-drt',role:'tablist','aria-label':'Evidence',on:{keydown:e=>{const o=tabs.map(t=>t[0]),i=o.indexOf(key);let m=-1;
   if(e.key==='ArrowRight')m=(i+1)%o.length;else if(e.key==='ArrowLeft')m=(i-1+o.length)%o.length;else if(e.key==='Home')m=0;else if(e.key==='End')m=o.length-1;if(m<0)return;e.preventDefault();pick(o[m])}}},
  tabs.map(t=>h('button',{type:'button',role:'tab',id:'gw-drt-'+t[0],'aria-selected':String(t[0]===key),'aria-controls':'gw-drp',tabindex:t[0]===key?'0':'-1','data-testid':'grow-happened-tab-'+t[0],on:{click:()=>pick(t[0])}},t[1]+' '+t[2]))):null;
 const grp=(i,...kids)=>h('div',{class:'gw-drg'+(i===cur?' cur':'')},h('div',{class:'hd'},'Step '+(i+1)+' · '+steps[i].name),...kids);
 let body=[];
 if(key==='checked')body=steps.map((q,i)=>(q.checked||[]).length?grp(i,stepChecked(q.checked)):null);
 else if(key==='answered')body=answered.map(([q,i])=>grp(i,h('div',{class:'sub'},gwDrPath(q)+(q.status!=null?' → '+q.status:'')),h('pre',{},gwDrPretty(q.answer)))).concat(steps.some(q=>q.method==='STANDIN')?[h('p',{class:'gw-drw'},'Watch steps get no answer from the app; they read what the stand-in recorded.')]:[]);
 else if(key==='called')body=steps.flatMap((q,i)=>all.filter(c=>c.during===q.id).map(c=>grp(i,stepCalls([c])))).concat(all.filter(c=>!steps.some(q=>q.id===c.during)).map(c=>h('div',{class:'gw-drg'},h('div',{class:'hd'},'Outside every step’s recorded time'),stepCalls([c]))));
 else if(key==='requests')body=steps.map((q,i)=>grp(i,h('div',{class:'sub'},q.method==='STANDIN'||q.watch?'watch '+(q.method==='STANDIN'?q.path:q.method+' '+q.path)+(q.watch?' · '+(q.watch.everyMs!=null?'every '+q.watch.everyMs+' ms, ':'')+'up to '+q.watch.deadlineMs+' ms · '+(q.watch.polls!=null?q.watch.polls+' poll'+(q.watch.polls===1?'':'s'):'polls not recorded'):'')
   :gwDrPath(q)+(q.request&&q.request.body?' '+q.request.body+(q.request.declared?' (body as declared)':''):'')+(q.request?' · as '+q.request.as:'')),
  h('div',{class:'meta'},q.method==='STANDIN'||q.watch?(q.durationMs!=null?'took '+q.durationMs+' ms':'its time was not recorded'):[q.durationMs!=null?'step '+q.durationMs+' ms':null,q.httpMs!=null?'HTTP '+q.httpMs+' ms':null,q.httpMs!=null?'app time not recorded':null,q.status!=null?'answered '+q.status:null].filter(Boolean).join(' · ')||'its times were not recorded')));
 gwPut(el,h('div',{class:'gw-chips gw-drc','data-testid':'grow-happened-chips'},D.chips.map(c=>h('span',{class:'gw-chip'+(c.tone?' '+c.tone:'')},c.t))),hist?h('p',{class:'gw-drhist'},hist):null,ol,
  h('div',{class:'gw-dr1','data-testid':'grow-happened-oneline'},h('span',{class:'gw-eyebrow'},'In one line'),D.oneLine),
  list,key?h('div',{class:'gw-drp',id:'gw-drp',role:'tabpanel','aria-labelledby':'gw-drt-'+key,'data-testid':'grow-happened-panel'},body):null,
  gwDrActs(x,D),
  D.foot.length?h('div',{class:'gw-drf','data-testid':'grow-happened-foot'},h('span',{class:'gw-eyebrow'},'Not recorded'),D.foot.map(t=>h('p',{},t))):null);
 return el}
/* Rerun, compare with the last run that passed, heal, the Run tab at this run and step, and a link to this step */
function gwDrActs(x,D){const s=gw.state,d=gw.dr,r=s.run[x.id];const fail=!!r&&r.st==='fail';const flow=r&&r.flow||x.flow;const cfg=s.flows&&s.flows.config||null;const away=!state.hasConfig&&!!cfg&&cfg.indexOf('/')>0;
 const hs=D&&D.history;const why=[];
 if(away)why.push('This grow ran with '+cfg+', so rerun and compare it from that folder.');
 else if(fail&&hs&&!hs.lastPass)why.push('Compare with last pass: it never passed in '+gwDrRuns(hs.saved)+'.');
 return [h('div',{class:'gw-dra'},
   h('button',{class:'btn sm',type:'button','data-testid':'grow-happened-rerun',disabled:!flow||away||!!ui.running||!!state.compileError,on:{click:()=>{openTab('Run');runNow(flow)}}},'Rerun'),
   fail?h('button',{class:'btn ghost sm',type:'button','data-testid':'grow-happened-compare',disabled:!(hs&&hs.lastPass)||away,on:{click:()=>{const c=ui.comparison;c.baseline=hs.lastPass;c.candidate=d.run;openTab('Compare')}}},'Compare with last pass'):null,
   fail?h('button',{class:'btn ghost sm',type:'button','data-testid':'grow-happened-heal',on:{click:()=>openTab('Heal')}},'Heal'):null,
   h('button',{class:'btn ghost sm',type:'button','data-testid':'grow-happened-runtab',on:{click:()=>gwOpenRun(x.id,d.step===null?undefined:d.step)}},'Run tab ↗'),
   h('button',{class:'btn ghost sm',type:'button','data-testid':'grow-happened-copy',on:{click:gwDrCopy}},'Copy link')),
  why.length?h('p',{class:'gw-drw','data-testid':'grow-happened-why'},why.join(' ')):null]}
/* A scenario with no run: why, what it would prove and where it starts, and the way to write its flow */
function gwDrNone(x,r,j,M){const why=String(r&&r.why||(x.flow?'This grow did not run its flow':'No flow proves this yet')).replace(/([^.!?])$/,'$1.');const u=M.U[x.unit]||{};
 const at=j?gbStarts(j,M):null;if(at&&typeof at[0]==='string')at[0]=at[0].charAt(0).toUpperCase()+at[0].slice(1);
 return [h('div',{class:'gw-drn','data-testid':'grow-happened-none'},h('b',{},why),h('span',{},'Nothing has run, so there are no steps, checks or calls to show.')),
  x.proves?h('div',{class:'gw-drsec'},h('span',{class:'gw-eyebrow'},'It would prove'),h('p',{},...gwRich(x.proves))):null,
  h('div',{class:'gw-drsec'},h('span',{class:'gw-eyebrow'},'Where it starts'),at?h('p',{},...at):null,u.label&&!(j&&j.entry===x.unit)?h('p',{},'Part: ',...gwCodeText(gwPlain(u.label))):null,
   x.layers&&x.layers.length?h('p',{class:'gw-drw'},'Layers it crosses: '+x.layers.map(l=>GW.layers[l]||l).join(', ')):null),
  x.realKey?h('div',{class:'gw-drsec','data-testid':'grow-happened-realkey'},h('span',{class:'gw-eyebrow'},'To run it for real'),h('p',{},'A real run needs '+x.realKey+'.')):null,
  h('div',{class:'gw-dra'},x.flow?null:h('button',{class:'btn sm',type:'button','data-testid':'grow-happened-write',on:{click:()=>gwDrWrite(x)}},'Write this flow'),
   h('button',{class:'btn ghost sm',type:'button','data-testid':'grow-happened-copy',on:{click:gwDrCopy}},'Copy link'))]}
/* The address follows the selection: the run a scenario opened while the Run tab still shows it, else what is selected here. */
function gwSyncHash(){if(gw.want)return;const hp=gw.happened;let want='';
 if(tab==='Run'&&hp&&ui.runName===hp.run&&ui.sel===hp.flow)want='#grow/'+hp.sid+'/happened/step-'+((ui.step||0)+1);
 else if(tab==='Discover'&&gw.state&&gw.dr&&gw.pinned==='s:'+gw.dr.sid)want='#grow/'+gw.dr.sid+'/steps'+(gw.dr.run&&gw.dr.step!==null?'/step-'+(gw.dr.step+1):'');
 else if(tab==='Discover'&&gw.state&&gw.pinned&&/^[sju]:/.test(gw.pinned))want='#grow/'+gw.pinned.slice(2);
 const cur=location.hash;if(want===cur||(!want&&!/^#grow\//.test(cur)))return;
 const url=new URL(location.href);url.hash=want;history.replaceState(null,'',url.href)}
/* An address that names a selection brings it back once the grow it belongs to is on the page. */
function gwRestore(){const w=gw.want,s=gw.state;if(!w||!s||gw.busy)return;gw.want=null;
 const k=s.scenarios.some(x=>x.id===w.id)?'s:'+w.id:(s.journeys||[]).some(j=>j.id===w.id)?'j:'+w.id:s.units.some(u=>u.id===w.id)?'u:'+w.id:null;
 if(!k)return;gw.pinned=k;if(gw.tree==='outline')gw.pinList=k;
 if(w.happened&&k.startsWith('s:'))gwOpenRun(w.id,w.step);
 else if(w.steps&&k.startsWith('s:'))gwDrOpen(w.id,w.step,true);else gw.dr=null}
/* The verdict, worked out once on the server (growVerdict) for this page, grow --json and the exit code: its own line above the
   tree, outside the result band. Its mark and word, then what it rests on: the first failure's promise and how it broke
   ("Removing a seat never charges the card" failed: expected 2 charges, got 3), with its promise; or what is not tested yet.
   Then the way to what happened. Until the scenarios have run its place is kept, saying so. */
function gwCall(){const s=gw.state,V=gw.view&&gw.view.verdict;if(!V||s.blocked)return null;
 if(!s.done)return h('div',{class:'gw-call wait','data-testid':'grow-verdict'},h('span',{class:'gw-vp'},'◌ No verdict yet'),h('span',{class:'gw-vt'},'It comes once the scenarios have run.'));
 const f=V.first,tone=V.verdict==='not ready'?'bad':V.verdict==='ready'?'ok':'open';
 return h('div',{class:'gw-call '+tone,'data-testid':'grow-verdict',role:'status'},h('span',{class:'gw-vp'},V.mark+' '+V.word),
  h('span',{class:'gw-vt',title:V.text},V.text.charAt(0).toUpperCase()+V.text.slice(1)),
  f&&f.promise?h('span',{class:'gw-vc'},'promise'+(f.promise.indexOf(',')>=0?'s ':' ')+f.promise):null,
  f&&V.more?h('span',{class:'gw-vm'},'and '+V.more+' more failed'):null,
  f&&f.run?h('button',{class:'btn sm gw-vgo',type:'button','data-testid':'grow-verdict-open',on:{click:()=>gwOpenRun(f.scenario)}},'See what happened ›'):null)}
/* The first failure's run, step by step, beside the tree: from the result band, above the fold */
function gwResultSteps(){const V=gw.view&&gw.view.verdict,f=V&&V.first,x=f&&gwScen(f.scenario);if(!x||!gwRan(x)||!gwDrCan(x)||gw.state.run[x.id].st!=='fail')return null;
 return h('button',{class:'btn ghost sm gw-rsteps',type:'button','data-testid':'grow-result-steps','aria-label':'What happened, step by step: '+gwPlain(gwVia(x.title).title),on:{click:()=>{gwDrOpen(x.id);if(gw.dr)gw.dr.from='t:grow-result-steps'}}},'Step by step ›')}
function gwResult(){const s=gw.state,v=gw.view;const t=v.summary;const fail=s.scenarios.find(x=>s.run[x.id]&&s.run[x.id].st==='fail');const sub=h('div',{class:'sub'});
 gwPut(sub,gwSpecLine(),fail?['First failure: ',gwRich(gwVia(fail.title).title),'. ']:null,(t.toReview?t.toReview+' agent-written piece'+(t.toReview===1?'':'s')+' to review. ':'')+(gw.log?'Log: '+gw.log:''));
 return h('div',{class:'gw-result'+(t.failed||fail?' failed':''),'data-testid':'grow-result'},h('div',{},h('div',{class:'big'},gwClauses(t.passed+' of '+t.scenarios+' scenarios proved'+(t.failed?', '+t.failed+' failed':'')+gwNotRun())),sub),
  h('div',{class:'row'},fail?h('button',{class:'btn ghost sm',on:{click:()=>openTab('Heal')}},'Heal the failure'):null,gwResultSteps(),h('button',{class:'btn ghost sm','data-testid':'grow-open-runs',on:{click:()=>gwOpenRuns()}},'Open the runs')))}
/* Until the verdict, its place says where the grow is, so the tree does not jump when the verdict arrives */
function gwProving(){const s=gw.state,v=gw.view;const box=(big,sub)=>h('div',{class:'gw-result quiet','aria-live':'polite'},h('div',{},h('div',{class:'big'},big),h('div',{class:'sub'},sub)));
 if(!s.modeBy||s.phase<5){const n=s.scenarios.length;return s.phase>=4&&n?box(n+' scenario'+(n===1?'':'s')+' drafted','Nothing has run yet.'):box('Growing the tree','Now: '+String(GW.phases[s.phase]||GW.phases[0]).toLowerCase()+'.')}
 const ids=s.scenarios.filter(x=>gwIn(x)).map(x=>x.id);const n=v.counts[s.mode]||ids.length;
 const done=ids.filter(id=>s.run[id]&&s.run[id].st!=='run').length,bad=ids.filter(id=>s.run[id]&&s.run[id].st==='fail').length;
 return box('Proving '+n+' scenario'+(n===1?'':'s')+' in '+GW.modes.find(m=>m.id===s.mode).label,done+' of '+n+' landed'+(bad?', '+bad+' failed':'')+'. Each leaf turns as its run lands.')}
/* How much to prove sits right above the tree it prunes; hovering a choice previews the cut. */
function gwModes(){const s=gw.state,v=gw.view;const asked=s.asked&&!s.modeBy;const locked=!!s.modeBy;
 const cur=locked?s.mode:(gw.picking||null),lbl=id=>GW.modes.find(m=>m.id===id).label;
 /* the choice opens with the whole drafted tree: no mode is chosen or previewed until the pointer moves onto a chip or a chip takes focus,
    so a pointer that happens to rest where a chip appears previews nothing */
 if(asked&&gw.askFor!==(gw.id||'saved')){gw.askFor=gw.id||'saved';gw.armed=false;if(gw.preview){gw.preview=null}}
 const said=asked?'Choose how much to prove. Tracing is done; nothing runs until you pick.':locked?'Mode: '+lbl(s.mode)+(s.modeBy==='you'?', your choice.':s.modeBy==='flag'?', set at start.':', the default.'):'You choose once scenarios are drafted.';
 /* pointing at a mode previews it on the tree, and a line beside the hint says what it keeps and cuts; the hint itself stays.
    A finger cannot point: a tap previews a mode, and while the choice is open a second tap on the same mode chooses it */
 const touch=gwTouch();
 const idle=locked?(touch?'Tap another mode to see what it grows; a new grow proves it.':'Point at another mode to see what it grows; a new grow proves it.'):asked?(touch?'Tap a mode to see it on the tree; tap it again to choose it.':'Point at a mode to see it on the tree.'):'';
 /* what a mode proves, in its card's words: on a phone, where a chosen mode folds to a chip, the line under the chips says it */
 const blurb=id=>(GW.modes.find(m=>m.id===id)||{blurb:''}).blurb;const desc=id=>id?[h('b',{},lbl(id)+':'),' '+blurb(id),gwAdds(id)]:[];
 /* the mode pointed at lights its column in the panel's table, and its words under the chips; letting go puts back the chosen one */
 const mark=id=>{if(!gw.el)return;for(const c of gw.el.querySelectorAll('.gw-cmp [data-m]'))c.classList.toggle('is-preview',c.getAttribute('data-m')===id);
  /* the card previewed looks the same before a choice and after it: one ring, whichever card it is */
  for(const b of gw.el.querySelectorAll('.gw-modes [data-m]'))b.classList.toggle('pv',!!id&&b.getAttribute('data-m')===id&&!(locked&&id===cur));
  const d=gw.el.querySelector('.gw-mdesc');if(d)d.replaceChildren(...desc(id||cur))};
 const say=id=>{mark(id);const el=gw.el&&gw.el.querySelector('[data-testid="grow-mode-preview"]');if(!el)return;if(!id||id===cur&&locked){el.textContent=idle;return}
  const n=v.counts[id],all=s.scenarios.length;
  if(!locked){el.textContent='Preview · '+lbl(id)+' keeps '+n+' of the '+all+' drafted'+(all>n?' and cuts '+(all-n):'')+'.'+(touch?' Tap it again to choose it.':'');return}
  /* what a bigger mode adds, itemised as the tree draws it: on the journeys, and the part checks and existing flows on shoots */
  const c=v.counts[cur],more=s.scenarios.filter(x=>gbRank[x.mode]<=gbRank[id]&&gbRank[x.mode]>gbRank[cur]),kind=gwKindOf();
  el.textContent='Preview · '+lbl(id)+' grows '+n+(n>c?': '+(n-c)+' more than '+lbl(cur)+(more.length===n-c&&new Set(more.map(kind)).size>1?' ('+gwKinds(more,kind)+')':'')+', as ghosts on the tree.':n<c?': it keeps '+n+' of these '+c+' and cuts '+(c-n)+'.':', the same as '+lbl(cur)+'.')};
 const look=id=>{if((asked||locked)&&gw.preview!==id){gw.preview=id;gbPaint();say(id)}},away=()=>{gw.tapped=null;if(gw.preview){gw.preview=null;gbPaint();say(null)}};
 return h('div',{class:'gb-mode'},h('div',{class:'gw-modes'+(asked?' ask':locked?' set':' wait'),'data-testid':'grow-modes',role:'group','aria-label':'How much to prove'},GW.modes.map(m=>h('button',{class:[asked&&m.id==='min'?'rec':'',gw.preview===m.id&&!(locked&&m.id===cur)?'pv':''].filter(Boolean).join(' ')||null,'data-m':m.id,'data-testid':'grow-mode-'+m.id,'aria-pressed':String(locked?s.mode===m.id:gw.picking===m.id),disabled:!asked&&!locked,'aria-disabled':locked?'true':null,title:locked&&m.id!==s.mode?'Preview what '+m.label+' grows. To prove it, start a new grow in '+m.label+'.':asked&&m.id==='min'?'Recommended: the critical journeys end to end and every spec criterion':null,
   on:{click:e=>{if(!asked){if(locked&&touch&&e.pointerType!=='mouse'){if(gw.tapped===m.id)away();else{gw.tapped=m.id;look(m.id)}}return}if(touch&&e.pointerType!=='mouse'&&gw.tapped!==m.id){gw.tapped=m.id;look(m.id);return}gw.tapped=null;gw.picking=m.id;gw.preview=null;growPick(m.id);gbPaint()},mouseenter:()=>{if(gw.armed)look(m.id)},pointermove:e=>{if(e.movementX||e.movementY)gw.armed=true;if(gw.armed&&gw.preview!==m.id)look(m.id)},focus:()=>look(m.id),mouseleave:()=>{if(!touch)away()},blur:away}},
   /* the Recommended tag is drawn by the stylesheet, so the chip's text stays its name, count and blurb */
   h('b',{'data-rec':asked&&m.id==='min'?'':null},m.label,s.scenarios.length?[' · ',h('span',{class:'mn','data-u':v.counts[m.id]===1?'scenario':'scenarios'},String(v.counts[m.id]))]:null),h('span',{},m.blurb),gwAdds(m.id)))),
  locked?h('p',{class:'gw-mdesc'},...desc(gw.preview||cur)):null,
  h('div',{class:'gw-hintrow'},h('p',{class:'small muted','data-testid':'grow-mode-hint',style:'margin:0'},said),h('span',{class:'small muted gw-more','data-testid':'grow-mode-preview','aria-live':'polite'},idle)))}
/* Under the tree, top down: on a phone, the journeys its numbers stand for; then one line of what each leaf's look means and one
   of the wood (roots, where tracing stops, a scenario's route and the files on it), each with the tree's own mark; what the mode
   pruned; and, folded, how to read a branch and a pad. */
/* A one-journey tree on a phone badges its other two pads R (what it refuses) and F (how it fails); under the journey's name,
   each says what it holds: its riskiest scenario and their state, as the pad's label says it on a wide screen. A pad the mode
   cut keeps its row, saying so, as its badge stays on the tree, faded. */
/* The leaves a pad of the tree holds, as the tree drew it (gbBuild): the journey's own pad (pol null) or its guard or failure pad.
   A key row counts what its pad holds, so it says what the pad's label says on a wide screen and nothing is counted twice. */
function gwPadLeaves(jid,pol){const B=gw.B;if(!B||!B.padsOf||!B.pad)return null;const pid=(B.padsOf[jid]||[]).find(q=>B.pad[q]&&(B.pad[q].pol||null)===pol);return pid?B.pad[pid].leaves:null}
function gwPolKeys(one){const s=gw.state,M=gw.M,B=gw.B;if(!M||!M.J.length)return [];
 /* a tree of two journeys grows the headline journey's guards or failures on a branch of its own too, lettered the same */
 const j=one?M.J[0]:B&&B.pad&&B.padsOf?M.J.find(q=>(B.padsOf[q.id]||[]).some(pid=>B.pad[pid]&&B.pad[pid].pol)):null;if(!j)return [];const n=gbOrderOf(M).indexOf(j)+1;
 const vis=s.modeBy?s.mode:null,inMode=x=>!s.modeBy||gwIn(x);
 return [['guard','R','What it refuses'],['failure','F','How it fails']].map(([p,b,t])=>{const list=B&&B.padsOf?gwPadLeaves(j.id,p)||[]:one?(M.leaves[j.id]||[]).filter(x=>gbPol(x)===p):[],inm=list.filter(inMode);if(!list.length)return null;
  return h('li',{class:'pol'+(inm.length?'':' cut')},h('span',{class:'no','aria-hidden':'true'},b),h('span',{},h('span',{class:'pt'},(one?'':'Journey '+n+' · ')+(one?t:t.toLowerCase())),' · ',...gwRich(gwVia(gbOrd(inm.length?inm:list)[0].title).title),' ',h('span',{class:'gw-jst'},gbToks(gbTok(list,j,vis,inMode)))))}).filter(Boolean)}
/* Where a leaf sits on a pad, drawn small with the tree's own pad and leaf: the one it names solid, the other two faint. */
function gwPadMark(pos){const lf=(k,tr)=>sv('path',{d:gbLeafD(9,4.6),transform:tr,class:'lp-lf'+(pos===k?'':' dim')});
 /* the tree's pad: a crest cushion over two shoulder cushions, each with its shaded underside */
 const dome=(x0,x1,top,base)=>{const m=(x0+x1)/2,w=x1-x0,h=base-top;return 'M'+x0+' '+base+' C'+x0+' '+gwF(top+h*.18)+' '+gwF(x0+w*.2)+' '+top+' '+m+' '+top+' C'+gwF(x1-w*.2)+' '+top+' '+x1+' '+gwF(top+h*.18)+' '+x1+' '+base+' Q'+m+' '+gwF(base+1.4)+' '+x0+' '+base+'Z'};
 const band=(x0,x1,base)=>{const m=(x0+x1)/2;return 'M'+gwF(x0+.4)+' '+gwF(base-.2)+' Q'+m+' '+gwF(base-5)+' '+gwF(x1-.4)+' '+gwF(base-.2)+' Q'+m+' '+gwF(base+1.4)+' '+gwF(x0+.4)+' '+gwF(base-.2)+'Z'};
 const C=[[4,18.5,14,22.4],[29.5,44,13,22.4],[13,35,7.6,21.6]];
 return sv('svg',{class:'gw-svg gb gw-lpad',width:42,height:30,viewBox:'0 0 48 34','aria-hidden':'true',focusable:'false'},
  sv('path',{d:'M11.2 19.8 L9.4 21',class:'lp-st'+(pos==='hang'?'':' dim')}),
  ...C.flatMap(([x0,x1,t,b])=>[sv('path',{d:dome(x0,x1,t,b),class:'lp-pad'}),sv('path',{d:band(x0,x1,b),class:'lp-band'})]),
  lf('crest','translate(24 5.2) rotate(-90)'),lf('shoulder','translate(42.4 11.2) rotate(-34)'),lf('hang','translate(5.6 23.4) rotate(145)'))}
/* A row of the key: its name, then its items on the key's shared tracks. Nothing when it has no items. */
function gwKeyRow(head,items,cls){const k=items.flat(Infinity).filter(Boolean);return k.length?h('div',{class:'gw-lg'+(cls?' '+cls:''),role:'group','aria-label':head},h('span',{class:'lh'},head),h('div',{class:'lgi'},k)):null}
/* Where a one-journey tree grows a leaf: the happy path on the crown, and what it refuses or how it fails on a branch of its
   own, each with its own pad; drawn small with the tree's trunk, branch and pads, the one it names solid, the other faint. */
function gwBranchMark(on){const lf=(k,tr)=>sv('path',{d:gbLeafD(9,4.6),transform:tr,class:'lp-lf'+(on===k?'':' dim')});
 const dome=(x0,x1,top,base)=>{const m=(x0+x1)/2,w=x1-x0,h=base-top;return 'M'+x0+' '+base+' C'+x0+' '+gwF(top+h*.2)+' '+gwF(x0+w*.2)+' '+top+' '+m+' '+top+' C'+gwF(x1-w*.2)+' '+top+' '+x1+' '+gwF(top+h*.2)+' '+x1+' '+base+' Q'+m+' '+gwF(base+1.4)+' '+x0+' '+base+'Z'};
 const pad=(k,x0,x1,t,b)=>sv('path',{d:dome(x0,x1,t,b),class:'lp-pad'+(on===k?'':' dim')});
 return sv('svg',{class:'gw-svg gb gw-lpad',width:42,height:30,viewBox:'0 0 48 34','aria-hidden':'true',focusable:'false'},
  sv('path',{d:'M11 34 C11.6 28 9.6 22 11.4 13',class:'lp-st tr'}),sv('path',{d:'M11 24.4 C17 23.6 23.6 21.8 31 18.6',class:'lp-st'+(on==='branch'?'':' dim')}),
  pad('crown',1.6,21,6,14.4),pad('branch',26,46,11,19.4),lf('crown','translate(11.4 3.2) rotate(-90)'),lf('branch','translate(36 8.4) rotate(-90)'))}
/* The key under the tree is a grid: a row for each kind of mark (where a leaf sits, the leaf, the route, the knot, the ground and,
   once a mode is chosen, what it pruned), its name in a column of its own and its items on tracks every row shares, so its
   columns line up at any width. Each mark is the tree's own, drawn small. */
function gwKey(){const s=gw.state;const M=gw.M,B=gw.B,row=gwKeyRow;
 const one=!!M&&M.J.length===1,narrow=!!(B&&B.L&&B.L.narrow);const it=(k,t)=>h('span',{class:'gw-li'},gwSw(k),h('span',{},t));
 const onJ=x=>!!M&&M.J.some(j=>(M.leaves[j.id]||[]).includes(x));const out=s.scenarios.filter(x=>!gwIn(x));
 const budl=M?s.scenarios.filter(x=>!onJ(x)&&(!s.modeBy||gwIn(x))):[];const crack=!!(B&&Object.values(B.knot||{}).some(k=>k.classList.contains('wound')));
 const roots=B&&B.L&&B.L.roots?B.L.roots.filter(r=>r.id).map(r=>M.U[r.id]).filter(Boolean):[];
 /* the mode the tree's pads count in: the chosen one, or the one being chosen */
 const vis=s.modeBy?s.mode:s.asked&&gw.picking?gw.picking:null,inMode=x=>!vis||gbRank[x.mode]<=gbRank[vis];
 const names=narrow&&M&&(gw.order||[]).length?h('ol',{class:'gw-names','aria-label':'The journeys on the tree'},(gw.order||[]).map((id,i)=>{const j=M.J.find(q=>q.id===id);const t=j?j.title:'';
  /* under its name, the journey's state as its pad's label says it on a wide screen: a failure first, in red */
  const toks=j?gbTok(gwPadLeaves(j.id,null)||M.leaves[j.id]||[],j,vis,inMode):null;
  return h('li',{},h('span',{class:'no','aria-hidden':'true'},String(i+1)),h('span',{class:'jn'},h('button',{'aria-pressed':String(gw.pinned==='j:'+id),'aria-label':'Journey '+(i+1)+': '+gwPlain(t),on:{click:()=>{gw.pinned=gw.pinned==='j:'+id?null:'j:'+id;growPaint()}}},...gwRich(t)),
   toks&&toks.length?h('span',{class:'gw-jst'},gbToks(toks)):null))}),gwPolKeys(one)):null;
 /* where a leaf sits is the tree's main code: on a journey's pad the happy path stands on the crest, what it refuses on a
    shoulder, how it fails hangs beneath. A one-journey tree grows its happy path as the crown and what it refuses and how it
    fails as branches of their own; one of those it has no branch for sits on the crown's pad as on any other */
 const pm=(k,t)=>h('span',{class:'gw-li'},gwPadMark(k),h('span',{},t)),bm=(k,t)=>h('span',{class:'gw-li'},gwBranchMark(k),h('span',{},t));
 let where=null;if(M&&M.J.length>1){/* the headline journey's guards or failures may grow on a branch of their own (a tree of two journeys) */
  const P=gw.B&&gw.B.pad?Object.values(gw.B.pad):[],br=p=>P.some(q=>q.pol===p),pad=p=>P.length?P.some(q=>!q.pol&&(q.leaves||[]).some(x=>gbPol(x)===p)):true;
  where=row('Where a leaf sits',[pm('crest','happy path'),pad('guard')?pm('shoulder','what it refuses'):null,br('guard')?bm('branch','what it refuses, on a branch of its own'):null,pad('failure')?pm('hang','how it fails'):null,br('failure')?bm('branch','how it fails, on a branch of its own'):null],'where')}
 else if(one){const j=M.J[0],crown=gwPadLeaves(j.id,null)||M.leaves[j.id]||[],own=p=>!!(gw.B&&gw.B.padsOf&&gwPadLeaves(j.id,p)),on=p=>crown.some(x=>gbPol(x)===p);
  where=row('Where a leaf sits',[bm('crown','happy path, on the crown'),own('guard')?bm('branch','what it refuses, on a branch of its own'):on('guard')?pm('shoulder','what it refuses'):null,
   own('failure')?bm('branch','how it fails, on a branch of its own'):on('failure')?pm('hang','how it fails'):null],'where')}
 const leaves=row('Leaf',[it('pass','passed'),it('fail','failed'),it('run','running'),it('in','to prove'),it('none','no flow yet')]);
 const route=row('Route',[it('route','a scenario’s route'),it('rbad',[h('span',{class:'bad'},'red'),': where it broke']),it('rrest','grey: never reached')]);
 /* the files on the route, and what Max grows from a file's knot: a shoot of its part checks and the existing flows through it,
    named as the Outline names them */
 /* the marks Max grows are keyed whenever the change has them, in whichever mode the tree is: a shoot of a file's part checks,
    the count on a shoot whose leaves do not show them all, and an existing flow's graft bud */
 const offJ=M?s.scenarios.filter(x=>!onJ(x)):[],shoots=B&&B.shoots?[...new Set(Object.values(B.shoots))]:[];
 const knot=row('Knot',[it('knot','a file it passes through'),it('lit','on the lit route'),crack?it('crack','where it failed'):null,offJ.some(x=>x.scenarioKind!=='regression')?it('bud','a shoot: '+GB_W.own.toLowerCase()):null,
  shoots.some(g=>g.cntAt&&(g.list||[]).length>(g.slots||[]).length)?it('ntag','more checks on a shoot than it has leaves'):null,offJ.some(x=>x.scenarioKind==='regression')?it('graft','a graft bud: an existing flow'):null]);
 const lz=new Set((B&&B.L&&B.L.roots||[]).filter(r=>r.loose).map(r=>r.id)),lzu=new Set([...lz].map(id=>M.U[id]));
 const ground=row('Ground',[roots.some(u=>u.layer!=='ext'&&!lzu.has(u))?it('root','a root in the repo'):null,lzu.size?it('unused','a store no journey uses'):null,roots.some(u=>u.layer==='ext')?it('ext','over the rim: a service outside'):null,s.stops.length?it('stop','where tracing stops'):null]);
 /* once a mode is chosen, what it cut: the cut mark, and the modes side by side, each kind of scenario counted in each, as the
    panel compared them before the choice. The column of a mode pointed at lights here too */
 /* (only a cut of what had grown leaves a mark, a callus that heals over it: one only ever previewed, or chosen away before it
    grew, shrinks back and leaves none, and then the key shows none) */
 const heal=!!(B&&B.svg&&B.svg.querySelector('.heal.on:not(.shscar)')),scar=!!(B&&B.svg&&[...B.svg.querySelectorAll('.shscar.on')].some(e=>e.style.display!=='none'&&e.getBoundingClientRect().width>0));
 const cut=s.modeBy&&(heal||scar)?row('Pruned',[heal?it('cut','healed where '+gwML(s.mode)+' pruned what had grown'):null,scar?it('scar','where a shoot was cut'):null],'mode'):null;
 /* then, its own block under the key, the modes side by side as the panel compared them before the choice */
 const cmp=s.modeBy?h('div',{class:'gw-lgcmp',role:'group','aria-label':GB_W.modes},h('h4',{class:'gw-lgh'},GB_W.modes),gwModeTable('key')):null;
 const how=h('details',{class:'gw-howto',open:gw.howOpen?true:null,on:{toggle:e=>{gw.howOpen=e.currentTarget.open}}},h('summary',{},'How to read the tree'),
  h('p',{},one?'One journey, end to end: the crown is its happy path; what it refuses and how it fails grow as its branches.':'Each branch is a journey, end to end, fed from the roots it depends on; each leaf is one of its scenarios; each knot a file it passes through.'),
  h('p',{},'On a pad, the happy path sits on the crest, what it refuses on the shoulders, and how it fails hangs beneath.'));
 return [names,h('div',{class:'gw-legend','aria-label':'Legend'},where,leaves,route,knot,ground,cut,cmp),how]}
/* The page, top down: the verdict once there is one, the phases (quiet when done), the tracers, the tree with its inspector, then the journeys and the spec side by side, then what the agent built.
   Everything paints into fixed slots so the tree's SVG stays where it is between paints: moving a node resets its transitions, and the limbs would snap instead of grow. */
function gwSlots(){if(gw.slots)return gw.slots;const S={};for(const k of ['start','head','call','verdict','rail','agents','tree','two','error'])S[k]=h('div',{});
 S.card=h('section',{class:'card gw-tree','aria-label':'Tree'});S.bar=h('div',{});S.mode=h('div',{class:'gw-modearea'});S.stage=h('div',{class:'gw-stage'});S.left=h('div',{style:'min-width:0'});S.scroll=h('div',{class:'gb-wrap'});S.legend=h('div',{});S.ins=h('div',{class:'gw-insw'});
 /* the tree is drawn for its width: when the space it has changes enough, draw it again */
 try{new ResizeObserver(()=>{if(gw.state&&gw.tree==='grove'&&gw.B&&gbWidth()!==gw.B.width)growPaint()}).observe(S.scroll)}catch(e){}
 S.ins.addEventListener('scroll',gwInsFade,{passive:true});try{new ResizeObserver(gwInsFade).observe(S.ins)}catch(e){}
 S.card.append(S.bar,S.mode,S.stage);S.stage.append(S.left,S.ins);S.left.append(S.scroll,S.legend);S.tree.append(S.card);
 gw.el.append(S.start,S.head,S.call,S.verdict,S.rail,S.agents,S.tree,S.two,S.error);return gw.slots=S}
const gwSet=(slot,...k)=>{slot.replaceChildren();gwPut(slot,...k)};
/* beside the tree the inspector scrolls inside the tree's height: while more of it is below, its foot fades */
function gwInsFade(){const el=gw.slots&&gw.slots.ins;if(!el)return;el.classList.toggle('more',!el.hidden&&el.scrollHeight-el.scrollTop-el.clientHeight>4)}
function growPaint(){if(!gw.el)return;const s=gw.state;const S=gwSlots();
 /* a repaint rebuilds controls; whatever had focus gets it back afterwards, by its key or its test id */
 const fa=document.activeElement,held=fa&&fa!==document.body&&gw.el.contains(fa)?(fa.getAttribute('data-ol')||(fa.getAttribute('data-dr')?'d:'+fa.getAttribute('data-dr'):null)||(fa.getAttribute('data-testid')?'t:'+fa.getAttribute('data-testid'):null)):null;
 if(!s){gwSet(S.start,gwStartCard(),gw.busy?h('p',{class:'row muted',style:'margin-top:12px'},h('span',{class:'think'},h('i'),h('i'),h('i')),'Reading the branch'):null,gw.error?blocked(gw.error):null);
  for(const k of ['head','call','verdict','rail','agents','two','error'])S[k].replaceChildren();S.tree.hidden=true;gw.dr=null;S.ins.classList.remove('dr');S.stage.classList.remove('wide');return}
 S.start.replaceChildren();S.tree.hidden=false;gwRestore();
 const v=gw.view;const c=s.change;
 gwSet(S.head,h('div',{class:'gw-head'},h('div',{style:'min-width:0'},h('span',{class:'label'},'Grow · '+(c?c.branch+' → '+c.base:'reading')),h('h2',{},c?c.title:'Reading the branch'),
   h('div',{class:'sub'},c?gwFacts([c.pr?'#'+c.pr:null,c.files+' files','+'+c.adds+' −'+c.dels,c.untraced?c.untraced+' small parts not traced':null,s.spec?['spec: '+s.spec.source]:null]):'')),
  h('div',{class:'gw-meta'},h('div',{class:'gw-clock'},gw.saved?gwFacts(['saved '+ago(gw.saved),'took '+gwFmt(s.ms)]):gwFmt(s.done?s.ms:Date.now()-gw.t0)),s.done||!gw.busy?h('button',{class:'btn ghost sm',style:'margin-top:6px',disabled:gw.busy,on:{click:()=>{gw.state=null;gw.saved=null;gw.svg=null;gw.B=null;gw.seen=new Set();gw.pinned=null;growPaint()}}},'New grow'):null)));
 gwSet(S.call,gwCall());
 gwSet(S.verdict,s.blocked?h('div',{class:'gw-result bad'},h('div',{},h('div',{class:'big'},'Stopped: '+s.blocked.code),h('div',{class:'sub'},s.blocked.detail+'. Fix: '+s.blocked.action))):null,s.done?gwResult():s.blocked?null:gwProving());
 gwSet(S.rail,h('div',{class:'gw-rail'+(s.done?' quiet':''),role:'list','aria-label':'Phases'},GW.phases.map((p,i)=>{const cls=i<s.phase||s.done?'done':i===s.phase?'on':'';const st=s.phaseAt[i],en=s.phaseAt[i+1]??(s.done?s.ms:null);
  return h('div',{class:'ph '+cls,role:'listitem'},h('b',{},p),h('span',{},st===undefined?'waiting':i===4&&s.modeBy?GW.modes.find(m=>m.id===s.mode).label.toLowerCase():en!=null?gwStep(en-st):'now'))})));
 const rules=s.agents.filter(a=>a.by==='rules'&&a.done&&a.ok),live=s.agents.filter(a=>!rules.includes(a)&&(!s.done||!a.ok||a.by!=='rules'));
 /* what the rules traced, counted as the header counts it: changed parts, and the dependencies they reach */
 const tids=new Set(rules.flatMap(a=>a.units||[])),tp=[...tids].filter(id=>{const u=gwUnit(id);return !u||!u.root}).length,td=tids.size-tp;
 const traced='traced from source: '+tp+' part'+(tp===1?'':'s')+(td?', '+td+' dependenc'+(td===1?'y':'ies'):'');
 /* once every lane has finished well, the strip folds to its one line: when tracing ends, not when the verdict lands, so the
    tree does not move under a reader watching its leaves turn */
 if(!live.some(a=>!a.done||!a.ok))gwSet(S.agents,rules.length||live.length?h('p',{class:'gw-agline'},gwFacts(['✓ rules',rules.length+' lane'+(rules.length===1?'':'s'),[traced],...live.flatMap(a=>['✓ '+(a.model||a.by),[a.brief]])])):null);
 else gwSet(S.agents,live.length||rules.length?h('div',{class:'gw-agents','aria-live':'polite'},rules.length?h('div',{class:'gw-ag'},h('b',{},'✓ rules · '+rules.length+' lane'+(rules.length===1?'':'s')),h('span',{},traced)):null,live.map(a=>h('div',{class:'gw-ag'+(a.done?(a.ok?'':' bad'):' live')},h('b',{},(a.done?(a.ok?'✓ ':'✕ '):'')+(a.by==='rules'?'rules':a.model||a.by)+' · '+a.brief),h('span',{title:a.note},a.note)))):null);
 const nj=(s.journeys||[]).length;
 gwSet(S.bar,h('div',{class:'gw-bar'},h('span',{class:'gw-eyebrow',style:'margin:0'},gwFacts([nj?nj+' journey'+(nj===1?'':'s'):null,(n=>n+' part'+(n===1?'':'s'))(s.units.filter(u=>!u.root).length),(n=>n+' dependenc'+(n===1?'y':'ies'))(s.units.filter(u=>u.root).length)])),
  h('span',{class:'row',style:'gap:10px'},
   h('span',{class:'seg2',role:'group','aria-label':'View'},['grove','outline'].map(t=>h('button',{'aria-pressed':String(gw.tree===t),'data-testid':'grow-view-'+t,'data-ol':'v:'+t,on:{click:()=>{if(gw.tree!==t)gwCalm();gw.tree=t;gw.refocus='v:'+t;gw.reveal=t==='outline'?gw.pinned:null;try{localStorage.setItem('gw-tree',t)}catch(e){}growPaint()}}},t==='grove'?'Grove':'Outline'))))));
 /* the mode area holds one height from the first paint of a grow to its verdict: its three cards are there (waiting) while the
    tree grows, asked when it is drafted, and stay once one is chosen, so nothing above the tree moves it. Only on a phone,
    where the cards stack, does a choice fold them into chips: the area keeps its height while the dropped leaves fall, then
    closes */
 const ask=!!(s.asked&&!s.modeBy);if(gw.modeAsk&&!ask&&s.modeBy&&S.mode.offsetHeight&&!gwQuiet()){const h0=S.mode.offsetHeight;S.mode.style.transition='';S.mode.style.height=h0+'px';clearTimeout(gw.modeT);
  gw.modeT=setTimeout(()=>{S.mode.style.height='auto';const to=S.mode.offsetHeight;S.mode.style.height=h0+'px';void S.mode.offsetHeight;S.mode.style.transition='height .45s cubic-bezier(.3,.7,.3,1)';S.mode.style.height=to+'px';
   gw.modeT=setTimeout(()=>{S.mode.style.height='';S.mode.style.transition=''},500)},1500)}
 gw.modeAsk=ask;
 gwSet(S.mode,s.scenarios.length||s.asked||!s.done&&!s.blocked?gwModes():null);
 if(gw.tree==='grove'){if(S.left.firstChild!==S.scroll)S.left.replaceChildren(S.scroll,S.legend);
  /* the tree is drawn for the width it gets, so it waits until it is on the page */
  if(!S.scroll.isConnected||!S.scroll.clientWidth){if(!gw.waiting){gw.waiting=true;requestAnimationFrame(()=>{gw.waiting=false;growPaint()})}}
  else{gbPaint();if(S.scroll.firstChild!==gw.svg)S.scroll.replaceChildren(gw.svg,gw.B.tip)}
  gwSet(S.legend,s.scenarios.length?gwKey():null)}
 else S.left.replaceChildren(gbOutline());
 /* the Outline already lists every journey and opens what is selected in place, so it stands alone at a readable width; only
    while the choice is open does the panel stay beside it, with what each mode proves */
 /* the drawer follows what is pinned: another scenario opens in it, anything else closes it. While it is open it takes the
    panel's place, beside the Outline too, and the panel widens for it */
 if(gw.dr&&gw.pinned!=='s:'+gw.dr.sid){const p=gw.pinned;gw.dr=null;if(p&&p.startsWith('s:'))gwDrOpen(p.slice(2),null,true,true)}
 const drOn=!!(gw.dr&&gwScen(gw.dr.sid));
 const alone=gw.tree==='outline'&&!(s.asked&&!s.modeBy)&&!drOn;S.stage.classList.toggle('ol',alone);S.card.classList.toggle('olv',alone);
 if(alone)S.ins.replaceChildren();else gwSet(S.ins,drOn?gwDrawer():gwInspector());S.ins.hidden=alone||!S.ins.firstChild;S.stage.classList.toggle('solo',!S.ins.firstChild);
 S.ins.classList.toggle('dr',drOn);S.stage.classList.toggle('wide',drOn);
 requestAnimationFrame(gwInsFade);
 /* the Outline is the journey list, so it is not repeated below it */
 gwSet(S.two,gw.tree==='outline'?(()=>{const x=gwExt();return h('div',{class:'gw-two'+(x?'':' solo')},gwSpec(),x)})():h('div',{class:'gw-two'},gbJourneys(),h('div',{style:'display:grid;gap:18px;min-width:0'},gwSpec(),gwExt())));
 gwSet(S.error,gw.error?blocked(gw.error):null);
 /* focus stays where it was across a repaint: on the row, button or part of the tree that was used, or what was let go of */
 const find=k=>k.startsWith('d:')?gw.el.querySelector('[data-dr="'+k.slice(2).replace(/["\\]/g,'')+'"]'):k.startsWith('t:')?gw.el.querySelector('[data-testid="'+k.slice(2).replace(/["\\]/g,'')+'"]'):[...gw.el.querySelectorAll('[data-ol]')].find(e=>e.getAttribute('data-ol')===k)||(gw.tree==='grove'&&gw.svg?[...gw.svg.querySelectorAll('[data-k]')].find(e=>e.getAttribute('data-k')===k):null);
 if(!gw.refocus&&held&&!gw.el.contains(document.activeElement))gw.refocus=held;
 if(gw.refocus){const k=gw.refocus;gw.refocus=null;const el=find(k);if(el)el.focus({preventScroll:true})}
 /* an opened drawer takes focus on its heading, and keeps asking for it until its run is read and the heading is on the page
    (a page drawn before the grow panel is placed has it a frame later) */
 if(drOn&&gw.dr.focus){const d=gw.dr,t=S.ins.querySelector('#gw-dr-title');if(t&&t.isConnected){t.focus({preventScroll:true});if(!d.loading)d.focus=false}
  else if(!d.loading)requestAnimationFrame(()=>{const u=gw.dr===d&&d.focus&&gw.slots.ins.querySelector('#gw-dr-title');if(u&&u.isConnected){d.focus=false;u.focus({preventScroll:true})}})}
 /* once its run is read, an opened drawer comes into view: its head and the step it opened on */
 if(gw.drScroll&&!drOn)gw.drScroll=false;
 if(gw.drScroll&&!gw.dr.loading){gw.drScroll=false;const d=gw.dr;requestAnimationFrame(()=>{if(gw.dr===d)gwDrReveal()})}
 /* switching to the Outline with something pinned brings its row into view */
 if(gw.reveal){const el=find(gw.reveal);gw.reveal=null;if(el)el.scrollIntoView({block:'nearest'})}
 gwSyncHash()}
${BONSAI_JS}
`;
