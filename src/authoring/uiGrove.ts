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
.gw-modes.set{gap:6px}.gw-modes.set button{flex:0 1 auto;padding:4px 10px;min-height:28px;border-color:var(--line);display:inline-flex;gap:6px;align-items:center}.gw-modes.set button b{font-size:12.5px}.gw-modes.set button span{display:none}
.gw-modes.set button[aria-pressed=true]{border-color:var(--forest);box-shadow:none;background:var(--sel)}
.gw-modes.set button[aria-disabled=true]{cursor:help}.gw-modes.set button[aria-disabled=true]:not([aria-pressed=true]){color:var(--ink3)}.gw-modes.set button[aria-disabled=true]:not([aria-pressed=true]):hover{border-color:var(--line2);color:var(--ink)}
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
.gw-result.bad{background:var(--verm-bg);color:var(--ink)}.gw-result.quiet{background:var(--sel);color:var(--ink)}.gw-result.quiet .sub{opacity:1;color:var(--ink3)}
@media (prefers-color-scheme:dark){.gw-result{background:color-mix(in srgb,var(--moss) 14%,var(--paper));color:var(--ink);border:1px solid color-mix(in srgb,var(--moss) 30%,var(--line2))}.gw-result.bad{background:var(--verm-bg);border-color:color-mix(in srgb,var(--verm) 40%,var(--line2))}.gw-chip.min{background:var(--moss-bg);color:var(--moss)}}
.gw-result .btn.ghost{background:transparent;color:inherit;border-color:currentColor;opacity:.9}
.gw-empty{font-size:13px;color:var(--muted);margin:6px 0}
@media (max-width:760px){.gw-head>div:last-child{text-align:left!important;display:flex;gap:12px;align-items:center}}
@media (max-width:640px){.gw-ol thead{display:none}.gw-ol tr.u td[data-h]::before{content:attr(data-h);display:block;font:500 10px/14px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.gw-ol tr.u{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 12px;padding:10px 8px;border-bottom:1px solid var(--line)}.gw-ol tr.u td{padding:0;border:0;background:none!important}.gw-ol tr.u.sel,.gw-ol tr.u:hover{background:var(--sel)}.gw-ol tr.u td:first-child{grid-column:1/-1}.gw-ol tr.grp td{display:block}.gw-ol .gw-chip{white-space:nowrap}.gw-rail{grid-template-columns:repeat(3,minmax(0,1fr))}.gw-ln{grid-template-columns:1fr}.gw-head h2{font-size:20px;line-height:26px}.gw-sgroup .list{padding-left:8px}}
@media (prefers-reduced-motion:reduce){.gw-ag.live b::before{animation:none}}
${BONSAI_CSS}
/* ---------- The page around the tree: after the tree's own styles, so these win where they meet ---------- */
.gw-code{font:.92em/1 var(--mono);background:var(--code);border-radius:4px;padding:1px 4px}
/* legend marks: small drawings of what the tree draws, in its wood and leaf colours, light and dark */
.gw-sw{display:inline-block;flex:none;overflow:visible;vertical-align:-2px;--sw-wood:#6E5E50;--sw-lit:#8F7D6B;--sw-shade:#4C4037;--sw-cut:#DCC8A6;--sw-rim:color-mix(in srgb,var(--ochre) 34%,var(--ink3))}
@media (prefers-color-scheme:dark){.gw-sw{--sw-wood:#6E5F50;--sw-lit:#8A7864;--sw-shade:#4A3F35;--sw-cut:#B9A684;--sw-rim:color-mix(in srgb,var(--ochre) 40%,var(--ink3))}}
.gw-sw .lf{stroke-width:1.1;stroke-linejoin:round}.gw-sw .lf.pass{fill:var(--moss);stroke:var(--moss)}.gw-sw .lf.fail{fill:var(--verm);stroke:var(--verm)}.gw-sw .lf.run{fill:var(--gold);stroke:var(--gold)}
.gw-sw .lf.in{fill:var(--paper);stroke:var(--moss)}.gw-sw .lf.none{fill:var(--paper);stroke:var(--moss);stroke-dasharray:2 1.3}.gw-sw .lf.pre{fill:var(--paper);stroke:var(--line2)}.gw-sw .lf.bud{fill:var(--moss-bg);stroke:var(--moss);stroke-width:.9}
.gw-sw .rib{fill:none;stroke:var(--paper);stroke-width:.7;opacity:.55}.gw-sw .rib.o{stroke:var(--moss);opacity:.35}
.gw-sw .wd{fill:var(--sw-wood)}.gw-sw .wl{fill:var(--sw-lit);stroke:var(--sw-shade);stroke-width:.8}.gw-sw .cf{fill:var(--sw-cut);stroke:var(--sw-shade);stroke-width:.6}.gw-sw .rim{fill:var(--sw-rim)}
.gw-sw .stem{fill:none;stroke:var(--sw-wood);stroke-width:1.2;stroke-linecap:round}.gw-sw .soil{stroke:var(--sw-shade);stroke-width:1;opacity:.7}
.gw-sw .dirt{fill:color-mix(in srgb,var(--sw-wood) 22%,var(--paper))}.gw-sw .pot{fill:color-mix(in srgb,var(--ochre) 26%,var(--line2))}
.gw-sw .rt{fill:none;stroke:var(--sw-wood);stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}
.gw-sw .tl{fill:none;stroke:var(--muted);stroke-width:1.3;stroke-linecap:round}.gw-sw .te{fill:var(--paper);stroke:var(--muted);stroke-width:1.1}
.gw-sw .case{fill:none;stroke:var(--paper);stroke-width:3.2;stroke-linecap:round;opacity:.9}.gw-sw .rte{fill:none;stroke:var(--ink);stroke-width:1.3;stroke-linecap:round;stroke-dasharray:2 3}.gw-sw .rte.bad{stroke:var(--verm)}
.gw-sw .ring{fill:none;stroke:var(--ink);stroke-width:1}.gw-sw .crk{fill:none;stroke:var(--verm);stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.gw-g{display:inline-flex;flex:none;align-items:center;line-height:0}.gb-gs .gw-sw{vertical-align:0}
.gw-legend{display:grid;gap:4px;margin:6px 6px 2px;font:12px/18px var(--sans);color:var(--ink3)}
.gw-lg{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;min-width:0}
.gw-li{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;min-width:0}.gw-li .bad{color:var(--verm-ink)}
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
/* the choice: Minimum is recommended while it is open; drawn, so the chip's text is unchanged. Only the recommended card carries
   the accent (gold is the leaf for running); the others are plain until pointed at or focused, and both show a ring */
.gw-modes.ask b[data-rec]::after{content:'Recommended';display:inline-block;margin-left:8px;padding:0 6px;border-radius:4px;background:var(--forest);color:var(--on-forest);font:500 10px/17px var(--mono);letter-spacing:.06em;text-transform:uppercase;vertical-align:1px}
.gw-modes.ask button{align-content:start;border-color:var(--line2);transition:box-shadow .15s,border-color .15s}.gw-modes.ask button.rec,.gw-modes.ask button[aria-pressed=true]{border-color:var(--forest);box-shadow:inset 0 0 0 1px var(--forest)}
.gw-modes.ask button:hover{border-color:var(--ink3);box-shadow:0 0 0 3px color-mix(in srgb,var(--ink3) 26%,transparent)}.gw-modes.ask button.rec:hover{border-color:var(--forest);box-shadow:inset 0 0 0 1px var(--forest),0 0 0 3px color-mix(in srgb,var(--ink3) 26%,transparent)}
.gw-modes button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
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
.gw .gw-cmp{table-layout:fixed}.gw .gw-cmp th:first-child{width:56%}.gw .gw-cmp th.n,.gw .gw-cmp td.n{width:14.6%;text-align:right;padding:4px 0 6px 12px}.gw .gw-cmp td.n{padding:7px 0 7px 12px}
.gw .gw-cmp .jt{display:grid;grid-template-columns:2ch minmax(0,1fr);gap:0 4px;align-items:baseline}.gw .gw-cmp .jt .no{margin:0}
.gw-cmp .sh{display:none}
@media (min-width:1061px),(max-width:640px){.gw-cmp .lg{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.gw-cmp .sh{display:inline}}
/* a path breaks between hops, or inside a long file path after a slash; each arrow goes with the hop after it */
.gw .gw-path{gap:4px 6px}.gw .gw-path .hop{display:inline-flex;align-items:baseline;gap:6px;max-width:100%;min-width:0}
.gw .gw-path .hop button{white-space:normal;text-align:left;min-width:0}.gw .gw-path .sep{flex:none}
/* a journey's state in words: each count whole, wrapping between counts */
.gw .gb-hd .st .tks{display:flex;flex-wrap:wrap;justify-content:flex-end;column-gap:.5em;min-width:0;max-width:100%}.gw .gb-hd .st .tk{display:inline-block;white-space:nowrap}
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
@media (min-width:761px){.gw-head>div:last-child{margin-left:auto}}
/* in the Outline, the spec card alone takes the Outline's measure, centred under it, not half the page */
.gw-two.solo{grid-template-columns:minmax(0,1000px);justify-content:center}
.gw-clock>span{white-space:nowrap}.gw .gb-hd .tt .by{white-space:nowrap}
/* a phone: the page's own lines sit in from the edge, like the text inside the cards */
@media (max-width:480px){.gw-head,.gw-rail,.gw-agline{padding-left:16px;padding-right:16px}.gw .card{padding:16px}.gw .gw-tree{padding:12px 11px 8px}.gw-result{padding:16px}
 .gw-head>div:last-child{justify-content:space-between;width:100%}.gw-head .gw-clock{min-width:0}.gw-head>div:last-child>.btn{margin-top:0!important;flex:none}.gw-agline{overflow-wrap:break-word}}
/* a line of facts: each one whole, its dot going with it; a code path breaks only after a slash */
.gw .nw,.gw-facts .tk{white-space:nowrap}.gw-facts .tk.wr{white-space:normal}.gw-loc{font:12.5px/18px var(--mono)}
/* the Outline stands alone: one centred column the width of a page of text, its view switch on the same right edge */
.gw-tree.olv>*{max-width:960px;margin-left:auto;margin-right:auto}.gw .gw-tree.olv .gb-ol{max-width:none}
.gw-stage.solo{grid-template-columns:minmax(0,1fr)}
/* beside the tree the inspector is never taller than the tree: what does not fit scrolls inside it */
.gw-insw{min-width:0}
@media (min-width:1061px){.gw-stage>.gw-insw{align-self:stretch;contain:size;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}}
/* the mode area keeps its height while a choice is pruned, then closes */
.gw-modearea{display:flow-root}
/* the inspector's cards: a failure first, in the run's words, then the claim as what the run did with it */
.gw-ins h3.gw-jt{font:500 17px/24px var(--sans)}.gw-ins h3.gw-st{font-family:var(--sans);font-weight:500}
.gw-via{font:11.5px/16px var(--mono);color:var(--muted);margin:0 0 4px}
.gw-ins .gb-ols{padding:6px 4px;font-size:13.5px}.gw-ins .err{font:12px/17px var(--mono);color:var(--verm-ink);background:var(--verm-bg);padding:6px 8px;border-radius:6px;overflow-wrap:break-word;margin:0 0 6px 34px}
.gw .err .k,.gw-broke .k{font-weight:400}.gw .err b{font-weight:600}.gw-broke span{font:12.5px/18px var(--mono);color:var(--verm-ink)}.gw-broke b{color:inherit;font-weight:600}
.gw-claim{display:grid;gap:2px;margin-top:12px;font-size:13px;line-height:19px;color:var(--ink2)}.gw-claim .gw-eyebrow{margin:0}.gb-olin .gw-claim{margin:0}
.gw-jst{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font:11.5px/16px var(--mono);color:var(--muted)}.gw-jst .tks{display:flex;flex-wrap:wrap;column-gap:.5em}.gw-jst .tk{white-space:nowrap}
.gw-jst .f{color:var(--verm-ink)}.gw-jst .p{color:var(--moss)}.gw-jst .r{color:var(--gold)}
.gw-lnk{all:unset;cursor:pointer;display:inline-block;margin-top:8px;font-size:13px;line-height:18px;color:var(--ink3);text-decoration:underline;text-underline-offset:3px}.gw-lnk:hover{color:var(--ink)}.gw-lnk:focus-visible{outline:2px solid var(--ink);outline-offset:2px;border-radius:2px}
.gw-one{margin:6px 0 0}
/* the Journeys card under the tree is half the page wide: there a journey's state goes under its title, so the title is not squeezed */
.gw-jcard{container-type:inline-size}
@container (max-width:720px){.gw-jcard .gb-hd .st{grid-row:auto;grid-column:2;display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;padding-top:2px;white-space:normal}.gw-jcard .gb-hd .st .tks,.gw-jcard .gb-hd .st .gb-gs{justify-content:flex-start}}`;

export const GROVE_JS = String.raw`
/* ---------- Grow: the change's tree, live ---------- */
const GW=${CONST};
const gw={el:null,svg:null,B:null,M:null,seen:new Set(),state:null,view:null,events:0,id:null,busy:false,error:null,log:null,tree:'grove',pinned:null,hov:null,open:{},refocus:null,preview:null,selCrit:null,onlyGaps:false,base:'',prove:true,agent:true,t0:0,raf:0};
try{const v=localStorage.getItem('gw-tree');if(v==='outline'||v==='grove')gw.tree=v}catch(e){}
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
function gwRich(t){const p=String(t==null?'':t).split(gwBT);if(p.length%2===0){const last=p.pop();p[p.length-1]+=gwBT+last}
 return p.length<3?[p.join('')]:p.map((x,i)=>i%2?h('code',{class:'gw-code'},...gwCodeText(x)):x).filter(x=>x!=='')}
const gwPlain=t=>String(t==null?'':t).split(gwBT).join('');
/* A scenario titled by the route it is sent through ("POST /api/grow: Reader leaves mid-grow") reads as a test of that one
   endpoint: the route moves to a small line of its own, "via POST /api/grow", and the title is what happens. */
const gwVIA=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\S+): (.+)$/s;
const gwVia=t=>{const m=gwVIA.exec(String(t==null?'':t));return m?{via:m[1]+' '+m[2],title:m[3]}:{via:null,title:String(t==null?'':t)}};
/* A line of facts: each fact whole, and the dot between two goes with the fact after it, so no line ends on a dot. A fact given
   as a list of nodes may wrap inside, but never right after its dot. */
function gwFacts(list,cls){const el=h('span',{class:'gw-facts'+(cls?' '+cls:'')});let i=0;
 for(const f of list){if(f===null||f===undefined||f===false||f==='')continue;if(i)el.append(' ');el.append(h('span',{class:Array.isArray(f)?'tk wr':'tk'},i?'· ':'',...[].concat(f)));i++}return el}
/* A failure in the run's own words, the step first: "Broke at <step>: <message>". */
function gwBroke(r,max){const w=String(r&&r.why||'').trim();const i=w.indexOf(': ');const cut=t=>max?gwCut(t,max):t;
 return !w?[h('b',{},'Failed'),', with no reason recorded']:i>0?[h('span',{class:'k'},'Broke at '),h('b',{},w.slice(0,i)),': '+cut(w.slice(i+2))]:[h('span',{class:'k'},'Broke: '),cut(w)]}
/* What a scenario claims, said as what the run did with it: proved once it passed, checked while it runs or after it broke,
   and only to be checked before it runs. */
const gwClaim=x=>{const r=gw.state.run[x.id];return r&&r.st==='pass'?'What it proved':r&&(r.st==='fail'||r.st==='run')?'What it checks':'What it will check'};
/* A pointer that cannot hover is a finger: what a mouse does by pointing, it does by tapping. */
const gwTouch=()=>{try{return matchMedia('(hover: none)').matches}catch(e){return false}};
const gwML=id=>(GW.modes.find(m=>m.id===id)||{label:id}).label;
/* Which mode grows what a mode leaves out: "Max grows them", or "Standard grows 2, Max grows 5". */
function gwGrows(list){const by={};for(const x of list)by[x.mode]=(by[x.mode]||0)+1;const ks=GW.modes.map(m=>m.id).filter(k=>by[k]);const n=list.length;
 return ks.length===1?gwML(ks[0])+' grows '+(n===1?'it':'them'):ks.map(k=>gwML(k)+' grows '+by[k]).join(', ')}
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
 if(k==='cut')return gwSvg(16,12,sv('g',{transform:'rotate(-16 8 6)'},sv('path',{d:'M1 4.1 L12.2 4.6 L12.2 7.4 L1 7.9 Z',class:'wd'}),sv('ellipse',{cx:12.2,cy:6,rx:1.5,ry:1.9,class:'cf'})));
 if(k==='root')return gwSvg(18,12,sv('rect',{x:0,y:5,width:18,height:7,class:'dirt'}),sv('path',{d:'M.5 5 L17.5 5',class:'soil'}),sv('path',{d:'M1 2.6 C5.6 2.8 9.8 5.4 16.8 10.4 C17 10.6 16.7 11 16.4 10.9 C9.2 7.4 5.4 6 1 6.2 Z',class:'wd'}));
 if(k==='ext')return gwSvg(18,13,sv('path',{d:'M1 8.6 L9.6 8.6 L9 13 L1.6 13 Z',class:'pot'}),sv('rect',{x:.4,y:6.2,width:10,height:2.6,rx:.7,class:'rim'}),sv('path',{d:'M1.6 4.9 L8.6 4.9 Q12.4 4.9 12.4 8.6 L12.4 12.4',class:'rt'}));
 if(k==='stop')return gwSvg(20,10,sv('path',{d:'M1 5 L5 5',class:'tl'}),sv('path',{d:'M7 5 L10 5',class:'tl',opacity:.6}),sv('path',{d:'M12 5 L14 5',class:'tl',opacity:.35}),sv('circle',{cx:17.2,cy:5,r:1.9,class:'te'}));
 if(k==='route')return gwSvg(32,10,sv('rect',{x:0,y:2.3,width:32,height:5.4,rx:2.7,class:'wd'}),sv('path',{d:'M2.6 5 L29.4 5',class:'case'}),sv('path',{d:'M2.6 5 L20.6 5',class:'rte'}),sv('path',{d:'M23 5 L29.4 5',class:'rte bad'}));
 if(k==='knot')return gwSvg(14,10,sv('ellipse',{cx:7,cy:5,rx:4.5,ry:2.5,class:'wl'}));
 if(k==='lit')return gwSvg(16,12,sv('ellipse',{cx:8,cy:6,rx:4.5,ry:2.5,class:'wl'}),sv('ellipse',{cx:8,cy:6,rx:6.6,ry:4.4,class:'ring'}));
 if(k==='crack')return gwSvg(14,12,sv('ellipse',{cx:7,cy:6,rx:4.8,ry:3,class:'wl'}),sv('path',{d:'M5 3.3 L7.4 5.4 L6 6.6 L8.6 8.8',class:'crk'}));
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
/* The inspector: whatever is pinned (a journey, a scenario or a part); otherwise the part being traced while it runs,
   and once it is done the first failing journey, else the headline one. For a journey it says only what the list does not:
   its title, where it starts, its path and its failure; the Journeys card below is the one list of its scenarios. */
function gwInspector(){const s=gw.state,v=gw.view;const M=gw.M||gbModel();
 const card=h('aside',{class:'gw-ins','aria-label':'Inspector','data-testid':'grow-inspector'});
 let pin=gw.pinned,who='Pinned',live=false;
 /* while the choice is open, the panel helps make it: how many scenarios each mode proves on each journey */
 if(!pin&&s.asked&&!s.modeBy&&M.J.length){const order=gw.order&&gw.order.length?gw.order:M.J.map(j=>j.id);const upto=(list,m)=>list.filter(x=>gbRank[x.mode]<=gbRank[m]).length;
  const loose=s.scenarios.filter(x=>!M.J.some(j=>(M.leaves[j.id]||[]).includes(x)));
  /* beside the tree the panel is narrow, so the columns are headed Min, Std and Max there; a reader of the page hears the names */
  const SH={min:'Min',std:'Std',max:'Max'};const th=m=>h('th',{class:'n',scope:'col'},h('span',{class:'lg'},m.label),h('span',{class:'sh','aria-hidden':'true',title:m.label},SH[m.id]||m.label));
  gwPut(card,h('span',{class:'who'},'Before you choose'),h('h3',{},'What each mode proves'),
   h('table',{class:'gw-cmp'},h('thead',{},h('tr',{},h('th',{scope:'col'},'Journey'),GW.modes.map(th))),
    h('tbody',{},order.map((jid,i)=>{const j=M.J.find(q=>q.id===jid);if(!j)return null;const ls=M.leaves[jid]||[];return h('tr',{'data-ol':'j:'+jid,on:{mouseenter:()=>gbLit2('j:'+jid),mouseleave:()=>gbLit2(null)}},h('td',{},h('div',{class:'jt'},h('b',{class:'no'},String(i+1)),h('span',{},...gwRich(j.title)))),GW.modes.map(m=>h('td',{class:'n'},String(upto(ls,m.id)))))}),
     loose.length?h('tr',{},h('td',{class:'muted'},'Part checks and existing flows'),GW.modes.map(m=>h('td',{class:'n'},String(upto(loose,m.id))))):null,
     h('tr',{class:'tot'},h('td',{},'Scenarios'),GW.modes.map(m=>h('td',{class:'n'},String(v.counts[m.id])))))),
   h('p',{class:'small muted',style:'margin:10px 0 0'},gwTouch()?'Tap a mode to see it on the tree: what it keeps stays, what it cuts fades. Tap it again to choose; nothing runs until you do.':'Point at a mode to see it on the tree: what it keeps stays, what it cuts fades. Nothing runs until you pick.'));return card}
 if(!pin){if(!s.done&&s.focus&&!(s.asked&&!s.modeBy)){pin='u:'+s.focus;live=true;const ag=s.agents.find(a=>!a.done&&a.unit===s.focus);who='Following '+(ag?(ag.by==='rules'?'the rules':ag.by)+' · '+ag.brief:'the latest event')}
  else if(M.J.length){const order=gw.order&&gw.order.length?gw.order:M.J.map(j=>j.id);const failing=order.find(id=>(M.leaves[id]||[]).some(x=>s.run[x.id]&&s.run[x.id].st==='fail'));pin='j:'+(failing||order[0]);who=failing?'The first failing journey':'The headline journey'}}
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
 gwPut(card,head,gwPartCard(id,phone&&!live));
 return card}
/* A part: the journeys that cross it, how deep tracing went and what each look found, how each layer is proved, and its own
   checks. In the Outline it opens in place under its row, so it leaves out the name the row already shows. A look that found
   nothing says only that; a file the note already names is not named again beside it. */
function gwPartCard(id,inline){const s=gw.state,v=gw.view;const M=gw.M||gbModel();const u=gwUnit(id);if(!u)return null;const d=s.depth[id]||{};const dp=v.depth[id]||{pips:[],score:0};
 const on=M.J.filter(j=>j.units.includes(id));const own=s.scenarios.filter(x=>x.unit===id&&!M.J.some(j=>(M.leaves[j.id]||[]).includes(x)));
 const seen=new Set();
 const said=e=>{const loc=e.loc&&!/^[-—–\s]*$/.test(e.loc)?e.loc:'';const file=loc.replace(/:\d+(:\d+)?$/,'');let note=(e.note||'').trim();let at=loc;
  if(file&&note.includes(file)){note=note.replace(file,loc);at=''}if(at&&seen.has(at))at='';if(loc)seen.add(loc);
  return at||note?h('small',{},gwFacts([at?gwCodeText(at):null,note?[note]:null])):null};
 /* its own checks: the ones this mode runs as rows; the ones a bigger mode grows as one line, so a part with many of them does
    not grow the panel past the tree */
 const ownIn=own.filter(gwIn),ownOut=own.filter(x=>!gwIn(x));
 return [inline?null:h('h3',{},u.label),inline?null:h('div',{class:'where'},gwFacts([u.root?'what it depends on':'part',u.unitKind,gwCodeText(u.loc)])),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},on.length?'On '+on.length+' journey'+(on.length===1?'':'s'):'On no journey'),
   on.length?on.map(j=>{const i=(gw.order||[]).indexOf(j.id)+1,n=(M.leaves[j.id]||[]).filter(gwIn).length;return h('button',{class:'gb-ols',on:{click:()=>{gw.pinned='j:'+j.id;gw.pinList=null;gw.refocus='j:'+j.id;growPaint()}}},h('span',{class:'no'},i?String(i):''),h('span',{class:'t'},...gwRich(j.title)),h('span',{class:'bx'},h('span',{class:'gw-n'},n+' scenario'+(n===1?'':'s'))))}):h('p',{class:'small muted',style:'margin:0'},u.root?'No journey in this change reaches it.':'Changed, but nothing in this change reaches it. Max checks it on its own.')),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'How deep it went'),h('div',{class:'row',style:'gap:6px 10px;margin-bottom:6px;flex-wrap:wrap'},h('span',{class:'gw-pips'},dp.pips.map(p=>h('i',{class:p}))),h('b',{style:'font-weight:500;font-size:13px'},dp.pips.filter(p=>p==='ok').length+' of 5 found'+((n=>n?' · '+n+' looked, nothing there':'')(dp.pips.filter(p=>p==='none').length))),dp.pips.includes('stop')?h('span',{class:'gw-badge nf'},'trace stops'):null),
   GW.steps.map(([k,label])=>{const e=d[k];const st=e?e.status:'wait';return h('div',{class:'gw-dp '+st},h('span',{class:'m'},{ok:'✓',none:'○',stop:'✕',wait:'·'}[st]),h('span',{class:'n'},label,e&&e.by!=='rules'?h('span',{class:'by'},e.by):null,e?said(e):null))})),
  (s.cells[id]||[]).length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'How each layer is proved'),h('div',{class:'gw-lay'},(s.cells[id]||[]).flatMap(c=>[h('span',{class:'gw-chip '+c.status},GW.layers[c.layer]),h('span',{},c.reason,h('small',{},c.adapter==='none'?'no adapter':'adapter: '+c.adapter))]))):null,
  own.length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Checked on its own'),ownIn.map(x=>gbItem(x,{class:'gb-ols',on:{click:()=>{gw.pinned='s:'+x.id;gw.pinList=null;growPaint()}}},[gwBadge(x)])),
   ownOut.length?h('p',{class:'small muted gw-one'},gwFacts([ownOut.length+' part check'+(ownOut.length===1?'':'s'),gwGrows(ownOut)])):null):null]}
function gwBadge(x){const r=gw.state.run[x.id];if(!gwIn(x))return h('span',{class:'gw-badge'},x.mode==='max'?'max':'standard');
 if(!r)return h('span',{class:'gw-badge'},'drafted');if(r.st==='run')return h('span',{class:'gw-badge run'},'running');if(r.st==='pass')return h('span',{class:'gw-badge pass'},'passed '+gwDur(r.ms));
 if(r.st==='fail')return h('span',{class:'gw-badge fail'},'failed');return h('span',{class:'gw-badge'+(x.flow?'':' nf'),title:r.why||''},x.flow?'to prove':'no flow yet')}
/* The spec as a strip of criteria: one chip each, its mark the status; the chosen one opens below and lights its parts in the
   tree. Above the strip, every criterion is counted once, as chips with the same marks. */
function gwSpec(){const s=gw.state,v=gw.view;const card=h('section',{class:'card','aria-label':'Spec','data-testid':'grow-spec'});
 const open=gw.selCrit?v.criteria.find(c=>c.id===gw.selCrit):null;const ob=open?gwCB(open.status):null;
 const notes=[...s.drift.length?[h('div',{class:'gw-flag'},h('b',{},'In the code, not in the spec'),h('span',{},'Changed here, but no criterion covers '+(s.drift.length===1?'it':'them')+'. Confirm '+(s.drift.length===1?'it is':'they are')+' intended, or add '+(s.drift.length===1?'it':'them')+' to the spec.'),s.drift.map(d=>h('span',{class:'gw-loc'},h('span',{class:'nw'},d.what),' ',h('span',{class:'muted'},...gwCodeText(d.loc)))))]:[],
  ...s.stops.map(x=>h('div',{class:'gw-flag red'},h('b',{},'Tracing stopped at '+((gwUnit(x.unit)||{}).label||x.unit)),h('span',{},x.why+' ',h('span',{class:'gw-loc muted'},...gwCodeText(x.at)))))];
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
/* scenarios that did not run, in the tree's words: no flow yet when nothing proves them, not run when one exists */
function gwNotRun(){const s=gw.state;const nr=s.scenarios.filter(x=>s.run[x.id]&&s.run[x.id].st==='not_run');const nf=nr.filter(x=>!x.flow).length,rest=nr.length-nf;
 return (nf?', '+nf+' with no flow yet':'')+(rest?', '+rest+' not run':'')}
/* The spec's line in the verdict counts each criterion once, in the spec panel's words. */
function gwSpecLine(){const s=gw.state;if(!s.criteria.length)return 'No spec to check against. ';const B=Object.fromEntries(gwBuckets());
 return 'Spec: '+(B.proved||0)+' of '+gw.view.criteria.length+' criteria proved, '+(B.agent||0)+' agent-checked'+['part','run','toprove','code','wait','open','failed'].map(b=>B[b]?', '+B[b]+' '+gwCBL(b,B[b]):'').join('')+', '+(B.needs||0)+' '+gwCBL('needs',B.needs||0)+'. '}
function gwResult(){const s=gw.state,v=gw.view;const t=v.summary;const fail=s.scenarios.find(x=>s.run[x.id]&&s.run[x.id].st==='fail');const sub=h('div',{class:'sub'});
 gwPut(sub,gwSpecLine(),fail?['First failure: ',gwRich(gwVia(fail.title).title),'. ']:null,(t.toReview?t.toReview+' agent-written piece'+(t.toReview===1?'':'s')+' to review. ':'')+(gw.log?'Log: '+gw.log:''));
 return h('div',{class:'gw-result','data-testid':'grow-result'},h('div',{},h('div',{class:'big'},t.passed+' of '+t.scenarios+' scenarios proved'+(t.failed?', '+t.failed+' failed':'')+gwNotRun()),sub),
  h('div',{class:'row'},fail?h('button',{class:'btn ghost sm',on:{click:()=>openTab('Heal')}},'Heal the failure'):null,h('button',{class:'btn ghost sm',on:{click:()=>openTab('Run')}},'Open the runs')))}
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
 const say=id=>{const el=gw.el&&gw.el.querySelector('[data-testid="grow-mode-preview"]');if(!el)return;if(!id||id===cur&&locked){el.textContent=idle;return}
  const n=v.counts[id],all=s.scenarios.length;
  if(!locked){el.textContent='Preview · '+lbl(id)+' keeps '+n+' of the '+all+' drafted'+(all>n?' and cuts '+(all-n):'')+'.'+(touch?' Tap it again to choose it.':'');return}
  const c=v.counts[cur];el.textContent='Preview · '+lbl(id)+' grows '+n+(n>c?': '+(n-c)+' more than '+lbl(cur)+', as ghosts on the tree.':n<c?': it keeps '+n+' of these '+c+' and cuts '+(c-n)+'.':', the same as '+lbl(cur)+'.')};
 const look=id=>{if((asked||locked)&&gw.preview!==id){gw.preview=id;gbPaint();say(id)}},away=()=>{gw.tapped=null;if(gw.preview){gw.preview=null;gbPaint();say(null)}};
 return h('div',{class:'gb-mode'},h('div',{class:'gw-modes'+(asked?' ask':' set'),'data-testid':'grow-modes',role:'group','aria-label':'How much to prove'},GW.modes.map(m=>h('button',{class:asked&&m.id==='min'?'rec':null,'data-testid':'grow-mode-'+m.id,'aria-pressed':String(locked?s.mode===m.id:gw.picking===m.id),disabled:!asked&&!locked,'aria-disabled':locked?'true':null,title:locked&&m.id!==s.mode?'Preview what '+m.label+' grows. To prove it, start a new grow in '+m.label+'.':asked&&m.id==='min'?'Recommended: the critical journeys end to end and every spec criterion':null,
   on:{click:e=>{if(!asked)return;if(touch&&e.pointerType!=='mouse'&&gw.tapped!==m.id){gw.tapped=m.id;look(m.id);return}gw.tapped=null;gw.picking=m.id;gw.preview=null;growPick(m.id);gbPaint()},mouseenter:()=>{if(gw.armed)look(m.id)},pointermove:e=>{if(e.movementX||e.movementY)gw.armed=true;if(gw.armed&&gw.preview!==m.id)look(m.id)},focus:()=>look(m.id),mouseleave:()=>{if(!touch)away()},blur:away}},
   /* the Recommended tag is drawn by the stylesheet, so the chip's text stays its name, count and blurb */
   h('b',{'data-rec':asked&&m.id==='min'?'':null},m.label+' · '+v.counts[m.id]),h('span',{},m.blurb)))),
  h('div',{class:'gw-hintrow'},h('p',{class:'small muted','data-testid':'grow-mode-hint',style:'margin:0'},said),h('span',{class:'small muted gw-more','data-testid':'grow-mode-preview','aria-live':'polite'},idle)))}
/* Under the tree, top down: on a phone, the journeys its numbers stand for; then one line of what each leaf's look means and one
   of the wood (roots, where tracing stops, a scenario's route and the files on it), each with the tree's own mark; what the mode
   pruned; and, folded, how to read a branch and a pad. */
function gwKey(){const s=gw.state;const drafted=s.scenarios.length,inm=s.scenarios.filter(gwIn).length;const M=gw.M,B=gw.B;
 const one=!!M&&M.J.length===1,narrow=!!(B&&B.L&&B.L.narrow);const it=(k,t)=>h('span',{class:'gw-li'},gwSw(k),h('span',{},t));
 const onJ=x=>!!M&&M.J.some(j=>(M.leaves[j.id]||[]).includes(x));const out=s.scenarios.filter(x=>!gwIn(x));const outJ=out.filter(onJ).length;
 const buds=!!M&&s.scenarios.some(x=>!onJ(x)&&(!s.modeBy||gwIn(x)));const crack=!!(B&&Object.values(B.knot||{}).some(k=>k.classList.contains('wound')));
 const roots=B&&B.L&&B.L.roots?B.L.roots.filter(r=>r.id).map(r=>M.U[r.id]).filter(Boolean):[];
 const names=narrow&&M&&(gw.order||[]).length?h('ol',{class:'gw-names','aria-label':'The journeys on the tree'},(gw.order||[]).map((id,i)=>{const j=M.J.find(q=>q.id===id);const t=j?j.title:'';
  return h('li',{},h('span',{class:'no','aria-hidden':'true'},String(i+1)),h('button',{'aria-pressed':String(gw.pinned==='j:'+id),'aria-label':'Journey '+(i+1)+': '+gwPlain(t),on:{click:()=>{gw.pinned=gw.pinned==='j:'+id?null:'j:'+id;growPaint()}}},...gwRich(t)))})):null;
 const leaves=h('div',{class:'gw-lg'},it('pass','passed'),it('fail','failed'),it('run','running'),it('in','to prove'),it('none','no flow yet'),buds?it('bud','part checked on its own'):null,it('cut','pruned'));
 const route=h('div',{class:'gw-lg'},h('span',{class:'gw-li'},gwSw('route'),h('span',{},'the route a scenario runs · ',h('span',{class:'bad'},'red where it broke'))),it('knot','a file on the route'),it('lit','on the lit route'),crack?it('crack','where it failed'):null);
 const ground=roots.length||s.stops.length?h('div',{class:'gw-lg'},roots.some(u=>u.layer!=='ext')?it('root','a root in the repo'):null,roots.some(u=>u.layer==='ext')?it('ext','over the rim: a service outside'):null,s.stops.length?it('stop','where tracing stops'):null):null;
 const cap=s.modeBy&&out.length?h('div',{class:'gb-cap gw-cap'},gwML(s.mode)+' keeps '+inm+' of the '+drafted+' drafted. '+gwPruned(out,s.mode)+'.'+(outJ?' On the tree, '+(outJ===out.length?(outJ===1?'it is the cut stub on its journey.':'they are the cut stubs and stems on the journeys.'):outJ===1?'1 of them is the cut stub on its journey.':outJ+' of them are the cut stubs and stems on the journeys.'):'')):null;
 const how=h('details',{class:'gw-howto',open:gw.howOpen?true:null,on:{toggle:e=>{gw.howOpen=e.currentTarget.open}}},h('summary',{},'How to read the tree'),
  h('p',{},one?'One journey, end to end: the crown is its happy path; what it refuses and how it fails grow as its branches.':'Each branch is a journey, end to end, fed from the roots it depends on; each leaf is one of its scenarios; each knot a file it passes through.'),
  h('p',{},'On a pad, the happy path sits on the crest, what it refuses on the shoulders, and how it fails hangs beneath.'));
 return [names,h('div',{class:'gw-legend','aria-label':'Legend'},leaves,route,ground),cap,how]}
/* The page, top down: the verdict once there is one, the phases (quiet when done), the tracers, the tree with its inspector, then the journeys and the spec side by side, then what the agent built.
   Everything paints into fixed slots so the tree's SVG stays where it is between paints: moving a node resets its transitions, and the limbs would snap instead of grow. */
function gwSlots(){if(gw.slots)return gw.slots;const S={};for(const k of ['start','head','verdict','rail','agents','tree','two','error'])S[k]=h('div',{});
 S.card=h('section',{class:'card gw-tree','aria-label':'Tree'});S.bar=h('div',{});S.mode=h('div',{class:'gw-modearea'});S.stage=h('div',{class:'gw-stage'});S.left=h('div',{style:'min-width:0'});S.scroll=h('div',{class:'gb-wrap'});S.legend=h('div',{});S.ins=h('div',{class:'gw-insw'});
 /* the tree is drawn for its width: when the space it has changes enough, draw it again */
 try{new ResizeObserver(()=>{if(gw.state&&gw.tree==='grove'&&gw.B&&gbWidth()!==gw.B.width)growPaint()}).observe(S.scroll)}catch(e){}
 S.card.append(S.bar,S.mode,S.stage);S.stage.append(S.left,S.ins);S.left.append(S.scroll,S.legend);S.tree.append(S.card);
 gw.el.append(S.start,S.head,S.verdict,S.rail,S.agents,S.tree,S.two,S.error);return gw.slots=S}
const gwSet=(slot,...k)=>{slot.replaceChildren();gwPut(slot,...k)};
function growPaint(){if(!gw.el)return;const s=gw.state;const S=gwSlots();
 /* a repaint rebuilds controls; whatever had focus gets it back afterwards, by its key or its test id */
 const fa=document.activeElement,held=fa&&fa!==document.body&&gw.el.contains(fa)?(fa.getAttribute('data-ol')||(fa.getAttribute('data-testid')?'t:'+fa.getAttribute('data-testid'):null)):null;
 if(!s){gwSet(S.start,gwStartCard(),gw.busy?h('p',{class:'row muted',style:'margin-top:12px'},h('span',{class:'think'},h('i'),h('i'),h('i')),'Reading the branch'):null,gw.error?blocked(gw.error):null);
  for(const k of ['head','verdict','rail','agents','two','error'])S[k].replaceChildren();S.tree.hidden=true;return}
 S.start.replaceChildren();S.tree.hidden=false;
 const v=gw.view;const c=s.change;
 gwSet(S.head,h('div',{class:'gw-head'},h('div',{style:'min-width:0'},h('span',{class:'label'},'Grow · '+(c?c.branch+' → '+c.base:'reading')),h('h2',{},c?c.title:'Reading the branch'),
   h('div',{class:'sub'},c?gwFacts([c.pr?'#'+c.pr:null,c.files+' files','+'+c.adds+' −'+c.dels,c.untraced?c.untraced+' small parts not traced':null,s.spec?['spec: '+s.spec.source]:null]):'')),
  h('div',{style:'text-align:right'},h('div',{class:'gw-clock'},gw.saved?[h('span',{},'saved '+ago(gw.saved)),' · ',h('span',{},'took '+gwFmt(s.ms))]:gwFmt(s.done?s.ms:Date.now()-gw.t0)),s.done||!gw.busy?h('button',{class:'btn ghost sm',style:'margin-top:6px',disabled:gw.busy,on:{click:()=>{gw.state=null;gw.saved=null;gw.svg=null;gw.B=null;gw.seen=new Set();gw.pinned=null;growPaint()}}},'New grow'):null)));
 gwSet(S.verdict,s.blocked?h('div',{class:'gw-result bad'},h('div',{},h('div',{class:'big'},'Stopped: '+s.blocked.code),h('div',{class:'sub'},s.blocked.detail+'. Fix: '+s.blocked.action))):null,s.done?gwResult():s.blocked?null:gwProving());
 gwSet(S.rail,h('div',{class:'gw-rail'+(s.done?' quiet':''),role:'list','aria-label':'Phases'},GW.phases.map((p,i)=>{const cls=i<s.phase||s.done?'done':i===s.phase?'on':'';const st=s.phaseAt[i],en=s.phaseAt[i+1]??(s.done?s.ms:null);
  return h('div',{class:'ph '+cls,role:'listitem'},h('b',{},p),h('span',{},st===undefined?'waiting':i===4&&s.modeBy?GW.modes.find(m=>m.id===s.mode).label.toLowerCase():en!=null?((en-st)/1000).toFixed(1)+' s':'now'))})));
 const rules=s.agents.filter(a=>a.by==='rules'&&a.done&&a.ok),live=s.agents.filter(a=>!rules.includes(a)&&(!s.done||!a.ok||a.by!=='rules'));
 /* what the rules traced, counted as the header counts it: changed parts, and the dependencies they reach */
 const tids=new Set(rules.flatMap(a=>a.units||[])),tp=[...tids].filter(id=>{const u=gwUnit(id);return !u||!u.root}).length,td=tids.size-tp;
 const traced='traced from source: '+tp+' part'+(tp===1?'':'s')+(td?', '+td+' dependenc'+(td===1?'y':'ies'):'');
 if(s.done&&!live.some(a=>!a.ok))gwSet(S.agents,rules.length||live.length?h('p',{class:'gw-agline'},gwFacts(['✓ rules',rules.length+' lane'+(rules.length===1?'':'s'),[traced],...live.flatMap(a=>['✓ '+(a.model||a.by),[a.brief]])])):null);
 else gwSet(S.agents,live.length||rules.length?h('div',{class:'gw-agents','aria-live':'polite'},rules.length?h('div',{class:'gw-ag'},h('b',{},'✓ rules · '+rules.length+' lane'+(rules.length===1?'':'s')),h('span',{},traced)):null,live.map(a=>h('div',{class:'gw-ag'+(a.done?(a.ok?'':' bad'):' live')},h('b',{},(a.done?(a.ok?'✓ ':'✕ '):'')+(a.by==='rules'?'rules':a.model||a.by)+' · '+a.brief),h('span',{title:a.note},a.note)))):null);
 const nj=(s.journeys||[]).length;
 gwSet(S.bar,h('div',{class:'gw-bar'},h('span',{class:'gw-eyebrow',style:'margin:0'},gwFacts([nj?nj+' journey'+(nj===1?'':'s'):null,(n=>n+' part'+(n===1?'':'s'))(s.units.filter(u=>!u.root).length),(n=>n+' dependenc'+(n===1?'y':'ies'))(s.units.filter(u=>u.root).length)])),
  h('span',{class:'row',style:'gap:10px'},
   h('span',{class:'seg2',role:'group','aria-label':'View'},['grove','outline'].map(t=>h('button',{'aria-pressed':String(gw.tree===t),'data-testid':'grow-view-'+t,'data-ol':'v:'+t,on:{click:()=>{if(gw.tree!==t)gwCalm();gw.tree=t;gw.refocus='v:'+t;gw.reveal=t==='outline'?gw.pinned:null;try{localStorage.setItem('gw-tree',t)}catch(e){}growPaint()}}},t==='grove'?'Grove':'Outline'))))));
 /* choosing a mode folds its three cards into chips; the area keeps its height while the dropped leaves fall, then closes, so
    the tree holds still while it is cut */
 const ask=!!(s.asked&&!s.modeBy);if(gw.modeAsk&&!ask&&s.modeBy&&S.mode.offsetHeight&&!gwQuiet()){const h0=S.mode.offsetHeight;S.mode.style.transition='';S.mode.style.height=h0+'px';clearTimeout(gw.modeT);
  gw.modeT=setTimeout(()=>{S.mode.style.height='auto';const to=S.mode.offsetHeight;S.mode.style.height=h0+'px';void S.mode.offsetHeight;S.mode.style.transition='height .45s cubic-bezier(.3,.7,.3,1)';S.mode.style.height=to+'px';
   gw.modeT=setTimeout(()=>{S.mode.style.height='';S.mode.style.transition=''},500)},1500)}
 gw.modeAsk=ask;
 gwSet(S.mode,s.scenarios.length||s.asked?gwModes():null);
 if(gw.tree==='grove'){if(S.left.firstChild!==S.scroll)S.left.replaceChildren(S.scroll,S.legend);
  /* the tree is drawn for the width it gets, so it waits until it is on the page */
  if(!S.scroll.isConnected||!S.scroll.clientWidth){if(!gw.waiting){gw.waiting=true;requestAnimationFrame(()=>{gw.waiting=false;growPaint()})}}
  else{gbPaint();if(S.scroll.firstChild!==gw.svg)S.scroll.replaceChildren(gw.svg,gw.B.tip)}
  gwSet(S.legend,s.scenarios.length?gwKey():null)}
 else S.left.replaceChildren(gbOutline());
 /* the Outline already lists every journey and opens what is selected in place, so it stands alone at a readable width; only
    while the choice is open does the panel stay beside it, with what each mode proves */
 const alone=gw.tree==='outline'&&!(s.asked&&!s.modeBy);S.stage.classList.toggle('ol',alone);S.card.classList.toggle('olv',alone);
 if(alone)S.ins.replaceChildren();else gwSet(S.ins,gwInspector());S.ins.hidden=alone||!S.ins.firstChild;S.stage.classList.toggle('solo',!S.ins.firstChild);
 /* the Outline is the journey list, so it is not repeated below it */
 gwSet(S.two,gw.tree==='outline'?(()=>{const x=gwExt();return h('div',{class:'gw-two'+(x?'':' solo')},gwSpec(),x)})():h('div',{class:'gw-two'},gbJourneys(),h('div',{style:'display:grid;gap:18px;min-width:0'},gwSpec(),gwExt())));
 gwSet(S.error,gw.error?blocked(gw.error):null);
 /* focus stays where it was across a repaint: on the row, button or part of the tree that was used, or what was let go of */
 const find=k=>k.startsWith('t:')?gw.el.querySelector('[data-testid="'+k.slice(2).replace(/["\\]/g,'')+'"]'):[...gw.el.querySelectorAll('[data-ol]')].find(e=>e.getAttribute('data-ol')===k)||(gw.tree==='grove'&&gw.svg?[...gw.svg.querySelectorAll('[data-k]')].find(e=>e.getAttribute('data-k')===k):null);
 if(!gw.refocus&&held&&!gw.el.contains(document.activeElement))gw.refocus=held;
 if(gw.refocus){const k=gw.refocus;gw.refocus=null;const el=find(k);if(el)el.focus({preventScroll:true})}
 /* switching to the Outline with something pinned brings its row into view */
 if(gw.reveal){const el=find(gw.reveal);gw.reveal=null;if(el)el.scrollIntoView({block:'nearest'})}}
${BONSAI_JS}
`;
