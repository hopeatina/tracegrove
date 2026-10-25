import { TREE_GEOMETRY_JS, TREE_MATERIAL_CSS } from './uiTreeGeometry.ts';
/**
 * The bonsai the Discover tab draws for a grown change. Its shape comes from the change's end-to-end
 * journeys, not its files: a branch per journey, a leaf per scenario, files as knots in the wood, the
 * repository as the pot, and what the change depends on as roots in its soil.
 *
 * The wood is one material. The trunk is the change, so every journey grows from it, even one that shares
 * no code with the others. The headline journey (the first that failed, else the one the spec names most, else
 * the one with the most scenarios) is the crown, the smallest pad, at the apex; the others branch below it,
 * the one with the most scenarios lowest (branches on the outside of curves, alternating, the apex leaning back
 * over the roots). A change with one journey grows that journey's
 * guards and failures as branches of their own. Pads are clumps of foliage, one per leaf: the happy path on
 * the crest, guards on the shoulders, failures hanging beneath. The route a journey's sap takes, from its
 * roots up the trunk and along its branch, shows while it runs and when you point at it. Choosing a mode
 * prunes the tree: the leaves it will not prove fall, and a branch left with none is cut back to a stub.
 *
 * Everything drawn is a fact from the folded state: a knot is a changed part, a leaf turns green only
 * when its flow passed, and a jin (bleached stub) is changed code that no journey in the change reaches.
 */

export const BONSAI_CSS = String.raw`
.gb-wrap{position:relative;min-width:0}
/* a phone's card opens under the key, and what follows the key makes room for it (gbTip) */
.gw-tree .gw-keyrow{margin-bottom:var(--gb-tiph,0px)}
${TREE_MATERIAL_CSS}
.gb .w{fill:var(--wood)}.gb .w.old{fill:var(--wood-old)}.gb .lt{fill:var(--wood-lit)}.gb .sh{fill:var(--wood-shade)}
.gb .grain{fill:none;stroke:var(--wood-shade);stroke-width:.8;stroke-linecap:round;opacity:.32}
.gb .jin{fill:var(--paper);stroke:var(--wood-old);stroke-width:.9;stroke-linejoin:round}
.gb .vein{display:none;fill:none}.gb .vein.live{display:inline;stroke:var(--gold);stroke-width:1.4;stroke-linecap:round;stroke-dasharray:3 5;animation:gbflow 1s linear infinite}
@keyframes gbflow{to{stroke-dashoffset:-16}}
.gb .kn .k1{fill:var(--wood-lit);opacity:.28;transition:fill .2s,opacity .2s}.gb .kn .k2{fill:color-mix(in srgb,var(--wood-lit) 62%,var(--cut));opacity:.42;filter:blur(1px)}.gb .kn .kc{fill:var(--wood-shade);opacity:.42;filter:blur(.4px)}
.gb .kn .ring{fill:none;stroke:var(--ink);stroke-width:1;opacity:0;transition:opacity .2s}
/* a lit knot glows from inside the bark; no annotation ring is drawn on the wood */
.gb .kn .halo{fill:none;stroke:var(--gold);stroke-width:1.5;opacity:0;transition:opacity .2s}.gb .kn.on .halo,.gb .kn:hover .halo{opacity:1}.gb .kn.trace .halo{opacity:1}.gb .kn.on .k1{fill:color-mix(in srgb,var(--gold) 45%,var(--wood-lit));opacity:.5}
.gb .kn .crack{display:none;fill:none;stroke:var(--verm);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.gb .kn.wound:not(.wmute) .crack{display:inline}.gb .kn.wound:not(.wmute) .halo{opacity:.75;stroke:var(--verm)}.gb .kn.wound.on:not(.wmute) .halo{opacity:1}
.gb .klbl{font:500 10px var(--mono);fill:var(--ink2);paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round;opacity:0;transition:opacity .2s;pointer-events:none}.gb .klbl.on{opacity:1}.gb .klbl.wound:not(.wmute){opacity:1;fill:var(--verm-ink)}.gb .klbl.brk:not(.wmute){opacity:1;fill:var(--ink)}.gb .kld{fill:none;stroke:var(--ink3);stroke-width:.8;opacity:0;transition:opacity .2s;pointer-events:none}.gb .klbl.on+.kld,.gb .klbl.wound:not(.wmute)+.kld,.gb .klbl.brk:not(.wmute)+.kld{opacity:.8}
.gb .vein,.gb .tw,.gb .sap,.gb .leader,.gb .grain{pointer-events:none}.gb .hitc,.gb .hitp{fill:transparent;stroke:none}.gb-lf.cut .hitp,.gb-lf.gone .hitp,.gb-gr.cut .hitp,.gb-gr.gone .hitp{display:none}.gb .hitl{fill:none;stroke:transparent;stroke-linecap:round}
.gb [data-k]{cursor:pointer;outline:none}
.gb .kn:focus-visible .ring{opacity:1;stroke:var(--ink)}.gb .rt:focus-visible .rring{opacity:1;stroke:var(--ink);stroke-width:3}.gw-svg.gb:focus{outline:none}.gb .filsh{fill:color-mix(in srgb,var(--wood) 55%,#000);opacity:.3;filter:blur(1px)}
.gb-lf:focus-visible .blade{stroke:var(--ink);stroke-width:2}.gb-lf:focus-visible .hitc{stroke:var(--ink);stroke-width:1.1;stroke-dasharray:2 2}
.gb .pghost{transition:d .5s ease}.gb .pfill{stroke:none;transition:fill .25s}.gb .cush.ccr .pfill{fill:var(--fol-lo)}
/* foliage has no outline: a cushion is its clumps, lit on top and shaded under (the pad's focus ring still shows over it) */
.gb .jg.crown .pad:focus-visible .cush.ccr .pfill{stroke:var(--ink);stroke-width:2}.gb .cush.csh .pfill{fill:var(--fsh-lo)}
.gb .pcs{fill:none;stroke:color-mix(in srgb,var(--fol-lo) 62%,#000);stroke-width:1.1;stroke-linecap:round;opacity:.3}.gb .cush.csh .pcs{stroke:color-mix(in srgb,var(--fsh-lo) 62%,#000)}
/* each small lobe's lit top edge, and the cushion's shaded underside */
.gb .pch{fill:none;stroke:color-mix(in srgb,var(--fol-hi) 70%,#fff);stroke-width:1.1;stroke-linecap:round;opacity:.5}.gb .cush.csh .pch{stroke:color-mix(in srgb,var(--fsh-hi) 70%,#fff);opacity:.4}
.gb .pund{pointer-events:none}
/* a cushion that loses its last kept leaf shrinks away into the wood it grew on */
.gb .cush,.gb .tw.fk{transform-box:fill-box;transform-origin:50% 100%;transition:opacity .45s,transform .45s}.gb .cush.off,.gb .tw.fk.off{opacity:0;transform:scale(.25)}
.gb .pclu,.gb .ptufts{pointer-events:none;transition:opacity .25s}.gb .ptex{opacity:.3}.gb .stl{fill:var(--pad-lit)}.gb .sts{fill:var(--pad-shade)}.gb .ptuft.gone,.gb .tw.gone{display:none}
.gb.dim .jg:not(.hl) .pclu,.gb.dim .jg:not(.hl) .ptufts,.gb .jg.pv-cut .pclu,.gb .jg.pv-cut .ptufts,.gb .jg.crown.pruned .pclu,.gb .jg.crown.pruned .ptufts,.gb .jg.pruned.pv-back .pclu,.gb .jg.pruned.pv-back .ptufts{opacity:.12}
.gb .pghost{fill:none;stroke:none}.gb .pad.pv-grow .pghost{fill:var(--fol);fill-opacity:.32;stroke:var(--moss);stroke-width:1;stroke-dasharray:3 3}
.gb .pad:focus-visible .pfill{stroke:var(--ink);stroke-width:1.5}.gb .pad.back .pclu{opacity:.55}
.gb .pad .bud0{display:none;fill:var(--pad-shade);stroke:var(--moss);stroke-width:.8}.gb .pad.bare .bud0{display:inline}.gb .pad.bare .cush{display:none}
.gb .cush.idle .pclu{opacity:.12}.gb .jg.pruned{display:none}.gb .jg.crown.pruned{display:inline}.gb .jg.crown.pruned .pfill,.gb .cush.idle .pfill,.gb .jg.pv-cut .pfill{fill:var(--pad-dim)}.gb .jg.pv-cut .brg,.gb .jg.pv-cut .tw{opacity:.55}
.gb .jg.pruned.pv-back{display:inline}.gb .jg.pruned.pv-back .pfill{fill:var(--pad-dim)}.gb .jg.pruned.pv-back .brg,.gb .jg.pruned.pv-back .tw{opacity:.55}
/* dimming never thins the wood or makes foliage see-through: what is not lit turns pale, opaque, so nothing shows through a pad */
.gb.dim .jg:not(.hl) .pfill{fill:var(--pad-dim)}.gb.dim .jg:not(.hl) .gb-lf:not(.pv-add){opacity:.32}.gb.dim .kn:not(.on):is(:not(.wound),.wmute){opacity:.55}.gb.lfdim .jg.hl .gb-lf:not(.hl):not(.sel):not(.pv-add){opacity:.45}
.gb .heal{display:none}.gb .heal.on{display:inline}.gb .mlbl{font:600 10.5px var(--mono);fill:var(--muted)}
.gb .cutmk{display:none;fill:none;stroke:var(--cutc);stroke-width:1.6;stroke-dasharray:3 2.5;stroke-linecap:round}.gb .cuttag{display:none;font:600 10.5px var(--mono);fill:var(--cutc)}.gb .cutmk.on,.gb .cuttag.on{display:inline}
.gb .tw{fill:var(--wood)}.gb .tw.shoot{fill:var(--shoot)}.gb .bud .bpet{fill:none;stroke:var(--shoot);stroke-width:.9;stroke-linecap:round}.gb .budg .cutk{display:none;fill:none;stroke:var(--cutc);stroke-width:1.3;stroke-linecap:round}
/* a shoot a mode would cut is grey with the tick across its foot; one it would add is a ghost, stem and all */
.gb .budg.pre .tw.shoot,.gb .budg.pv-out .tw.shoot{fill:color-mix(in srgb,var(--ink3) 40%,var(--paper))}.gb .budg.pre path.tipbud,.gb .budg.pv-out path.tipbud{fill:var(--paper);stroke:color-mix(in srgb,var(--ink3) 50%,var(--paper))}.gb .budg.pre .bpet,.gb .budg.pv-out .bpet{stroke:color-mix(in srgb,var(--ink3) 50%,var(--paper))}
.gb .budg.pre .cutk,.gb .budg.pv-out .cutk{display:inline}.gb .budg.fall .cutk{display:none}.gb .budg.pv-add{opacity:.45}.gb path.tipbud{fill:var(--moss-bg);stroke:var(--moss);stroke-width:.8}.gb .tw.old{fill:var(--wood-old)}
.gb .tipbud path{fill:var(--moss-bg);stroke:var(--moss);stroke-width:1}.gb .shn{font:500 9.5px var(--mono);fill:var(--ink3)}.gb .shtag .sbud{fill:color-mix(in srgb,var(--moss) 14%,var(--paper));stroke:var(--shoot);stroke-width:1;stroke-linejoin:round}.gb .shtag .shn{fill:var(--moss)}
/* an existing flow Max re-checks: a graft bud ringed into the bark at its knot, in the state its run is in */
.gb .gb-gr{cursor:pointer;transition:opacity .3s}.gb .gb-gr.gone{display:none}.gb .gb-gr:focus{outline:none}
.gb .gb-gr .gring{fill:var(--wood-lit);stroke:var(--wood-shade);stroke-width:.6}.gb .gb-gr .ghalo{fill:var(--wood-shade);opacity:.32;filter:blur(.6px)}.gb .gb-gr .gcres{fill:color-mix(in srgb,var(--knot-lit) 55%,#fff);opacity:.85}
.gb .gb-gr .gtip{fill:var(--moss-bg);stroke:var(--moss);stroke-width:.7}.gb .gb-gr.under .gsw{display:none}.gb .gb-gr.none .gtip{fill:var(--paper);stroke-dasharray:1.2 .9}.gb .gb-gr.pass .gtip{fill:var(--moss);stroke:var(--moss)}.gb .gb-gr.pass.warn .gtip{stroke:var(--gold)}
.gb .gb-gr.fail .gtip{fill:var(--verm);stroke:var(--verm)}.gb .gb-gr.fail .gring{stroke:var(--verm)}.gb .gb-gr.run .gtip{fill:var(--gold);stroke:var(--gold)}
.gb .gb-gr.pre .gtip,.gb .gb-gr.pv-out .gtip{fill:var(--paper);stroke:color-mix(in srgb,var(--ink3) 50%,var(--paper));stroke-dasharray:none}.gb .gb-gr.pv-add{opacity:.5}.gb .gb-gr.pv-add .gtip{fill:color-mix(in srgb,var(--moss) 40%,#fff);stroke:var(--moss);stroke-dasharray:1.2 .9}.gb .gb-gr.pv-add .gring{stroke:var(--moss);stroke-width:.8;stroke-dasharray:1.6 1.1}.gb .gb-gr.pv-add .ghalo{opacity:.12}.gb.dim .gb-gr.pv-add{opacity:.5}
.gb .gb-gr.hl .gring{stroke:var(--gold);stroke-width:1.1;filter:drop-shadow(0 0 1.5px var(--gold))}.gb .gb-gr:focus-visible .gring{stroke:var(--ink);stroke-width:1.4}.gb.dim .gb-gr:not(.hl):not(.pv-add){opacity:.35}
.gb .budg.pre .shn,.gb .budg.pv-out .shn{opacity:.5}
/* its legend swatch (gbGraftSw) */
.gw-sw .gr{fill:var(--paper);stroke:var(--moss);stroke-width:1.2}
.gb-lf{transition:transform .45s cubic-bezier(.2,.7,.2,1),opacity .3s}
.gb-lf .blade{stroke-width:.9;stroke-linejoin:round;transition:fill .35s,stroke .35s}
.gb-lf .rib{fill:none;stroke:var(--paper);stroke-width:.8;opacity:.7}.gb .gb-lf .halo{fill:var(--paper);opacity:.9}.gb-lf.pv-add .halo{opacity:0}.gb-lf.pre .halo,.gb-lf.pv-out .halo{opacity:.55}.gb-lf.fail .halo{fill:color-mix(in srgb,var(--verm) 24%,var(--paper));opacity:1}
.gb-lf .bb,.gb-lf .nec{display:none}.gb-lf.fail .bb,.gb-lf.fail .nec{display:inline}.gb-lf.fail .bn{display:none}.gb-lf .nec{fill:none;stroke:#6B3A1E;stroke-width:1.3;stroke-linecap:round}
.gb-lf .pet{fill:none;stroke:color-mix(in srgb,var(--wood) 70%,var(--moss));stroke-width:1.1;stroke-linecap:round}.gb-lf.hang .pet{stroke:var(--wood);stroke-width:1.3}
.gb .scar{cursor:pointer}.gb.dim .jg:not(.hl) .scar,.gb.lfdim .jg.hl .scar{opacity:.4}.gb-lf .nick{display:none;fill:none;stroke:var(--cutc);stroke-width:1.3;stroke-linecap:round}
.gb-lf.in .blade{fill:var(--moss-bg);stroke:var(--moss)}
.gb-lf.pass .blade{fill:var(--moss);stroke:color-mix(in srgb,var(--moss) 70%,#000)}.gb-lf.pass.warn .blade{stroke:var(--gold);stroke-width:1.6}
.gb-lf.fail .blade{fill:var(--verm);stroke:color-mix(in srgb,var(--verm) 45%,#000);stroke-width:1.1}
.gb-lf.run .blade{fill:var(--gold);stroke:var(--gold)}.gb-lf.run .gb-lfi{animation:gbpulse 1s ease-in-out infinite}
.gb-lf.idle .blade{fill:var(--paper);stroke:var(--moss);stroke-width:1.2}
.gb-lf.none .blade{fill:color-mix(in srgb,var(--paper) 70%,transparent);stroke:var(--moss);stroke-width:1.2;stroke-dasharray:2.4 1.6}
.gb-lf.pre .blade{fill:var(--paper);stroke:var(--line2)}
.gb-lf.in .rib,.gb-lf.idle .rib,.gb-lf.none .rib,.gb-lf.pre .rib{stroke:var(--moss);opacity:.3}
/* on a dark page a passed leaf is the bright solid one, so a leaf still to prove is an outline: the passed leaf's green as a rim
   over a neutral fill a step off the page, never pale like a passed leaf and never a hole in the pad */
@media (prefers-color-scheme:dark){.gb-lf.in .blade,.gb-lf.idle .blade{fill:var(--leaf-prove);stroke:var(--moss);stroke-width:1.5}.gb-lf.none .blade{fill:var(--leaf-pend);stroke:color-mix(in srgb,var(--moss) 70%,#fff);stroke-width:1.2}.gb-lf.pre .blade{fill:var(--paper);stroke:var(--ink3)}.gb .ptex{opacity:.3}.gb .lip-hi{opacity:.6}
 .gb-lf.idle .rib,.gb-lf.none .rib{opacity:.5}}
.gb-lf .gb-lfi{transform-box:fill-box;transform-origin:center}
/* one preview grammar: what the mode keeps stays as it is, what it cuts fades in place with a nick at its stalk, what it
   adds appears as a dashed ghost */
.gb-lf.pv-out .blade,.gb-lf.pre .blade{fill:color-mix(in srgb,var(--ink3) 30%,var(--paper));stroke:color-mix(in srgb,var(--ink3) 50%,var(--paper));stroke-dasharray:none;stroke-width:.8}.gb-lf.pv-out .rib,.gb-lf.pre .rib{opacity:0}
.gb-lf.pv-out .bb,.gb-lf.pre .bb,.gb-lf.pv-out .nec,.gb-lf.pre .nec{display:none}.gb-lf.pv-out .bn,.gb-lf.pre .bn{display:inline}.gb-lf.pv-out .nick,.gb-lf.pre .nick{display:inline}
.gb-lf.pv-add .blade{fill:var(--moss);fill-opacity:.3;stroke:var(--moss);stroke-width:1;stroke-dasharray:2.2 1.5}.gb-lf.pv-add .rib{opacity:0}
/* (a ghost is at half strength: a journey's leaf on its own, a part check with the ghost of its shoot) */
.gb-lf.pv-add:not(.bud){opacity:.5}.gb .budg:not(.pv-add) .gb-lf.bud.pv-add{opacity:.5}
/* a leaf being pruned falls with its twig, cut at the wood (gbPaint); the tick at its stalk has done its work */
.gb-lf.cut .nick{display:none}.gb-lf.cut .hitc{display:none}.gb-lf.gone .gb-lfi{display:none}.gb-lf.gone .hitc{display:none}.gb-lf.bud.gone{display:none}
.gb-lf.hl .gb-lfi,.gb-lf.sel .gb-lfi{filter:drop-shadow(0 0 1.8px var(--gold)) drop-shadow(0 0 .6px var(--gold))}.gb-lf.hl .blade{stroke-width:1.4}.gb-lf.sel .hitc{stroke:var(--gold);stroke-width:1.5;stroke-opacity:.6}
.gb .bud .blade{stroke-width:1.25}.gb .bud.none .blade{stroke-dasharray:2 1.4}
.gb .bmore{font:600 9.5px var(--mono);fill:var(--muted)}
/* the snip: two blades closing at the cut, gone in a moment */
.gb .snip{fill:none;stroke:var(--ink);stroke-width:1.4;stroke-linecap:round;pointer-events:none;transform-box:fill-box;transform-origin:50% 50%;animation:gbsnip .32s ease-out both}@keyframes gbsnip{0%{opacity:0;transform:scale(1.6)}25%{opacity:1;transform:scale(1)}to{opacity:0}}
@keyframes gbpulse{50%{transform:scale(1.2)}}
.gb.dim .bud:not(.hl):not(.pv-add),.gb.dim .lbl:not(.hl),.gb.dim .bmore{opacity:.3}
/* a previewed mode's ghosts are not part of what is pinned: the dimming leaves them out (the rules above), so each stays at
   the one half strength it has whatever is pinned, and can be counted */
/* one cut mark everywhere, asked, previewed or being pruned: a tick in neutral ink, never red (red is failed and broken) */
.gb-lf.cut .nick,.gb .budg.snap .cutk{stroke:var(--cutc)}
/* where a cut that grew has healed: a small roll of callus in the bark's own tones, a step lighter than the bark, with a thin lit
   crescent on its lip; never a pale disc, and always under the knots, so it never reads as a boss or as one */
.gb .heal .cal{fill:var(--wood-lit);stroke:var(--wood-shade);stroke-width:.5}
/* a cut that healed is a pale ring of callus round the bark of the cut, about the girth of what was cut: seen at 1x */
.gb .heal.scar .cal,.gb .heal.shscar .cal{stroke:color-mix(in srgb,var(--wood-lit) 30%,#F4ECDF);stroke-width:1.3}.gb .heal .cres{fill:none;stroke:color-mix(in srgb,var(--knot-lit) 50%,#F4ECDF);stroke-width:.7;stroke-linecap:round}.gb .shscar{pointer-events:none}
/* a failed leaf: no pale lining in its bite, a dark outline and a dark midrib, and round it a soft red halo, the red mixed toward
   the page rather than made clear, so over green it stays red and never turns brown */
.gb-lf.fail:not(.pv-out):not(.pv-add) .halo{opacity:1;fill:none;stroke:color-mix(in srgb,var(--verm) 66%,var(--paper));stroke-width:3.2;stroke-linejoin:round}.gb-lf.fail:not(.pv-out):not(.pv-add) .blade{stroke:#5a1a14;stroke-width:1}.gb-lf.fail:not(.pv-out):not(.pv-add) .rib{stroke:#5a1a14;opacity:1;stroke-width:.9}
/* to prove: a solid outline over a pale fill, with its midrib; no flow yet: a dashed outline round nothing */
.gb-lf.in:not(.pv-out):not(.pv-add):not(.bud) .blade,.gb-lf.idle:not(.pv-out):not(.pv-add):not(.bud) .blade{fill:color-mix(in srgb,var(--moss) 16%,var(--paper));stroke:var(--moss);stroke-width:1.2;stroke-dasharray:none}
.gb-lf.none:not(.pv-out):not(.pv-add):not(.bud) .blade{fill:none;stroke:var(--moss);stroke-width:1;stroke-dasharray:2.2 1.6}.gb-lf.none:not(.pv-out):not(.pv-add):not(.bud) .rib{opacity:0}
@media (prefers-color-scheme:dark){.gb-lf.fail:not(.pv-out):not(.pv-add) .blade{fill:#ef6b5b;stroke:#2a0d0a}.gb-lf.fail:not(.pv-out):not(.pv-add) .rib{stroke:#f2b3a8}.gb-lf.fail:not(.pv-out):not(.pv-add) .nec{stroke:#2a0d0a}
 /* on a dark page a leaf still to prove stays an outline, a pass-green rim over a neutral fill a step off the page; one with no
    flow yet is filled with a lightened cushion green under its dashed rim: a leaf, never a hole */
 .gb-lf.in:not(.pv-out):not(.pv-add):not(.bud) .blade,.gb-lf.idle:not(.pv-out):not(.pv-add):not(.bud) .blade{fill:var(--leaf-prove);stroke:var(--moss);stroke-width:1.5;stroke-dasharray:none}
 .gb-lf.none:not(.pv-out):not(.pv-add):not(.bud) .blade{fill:var(--leaf-pend);stroke:color-mix(in srgb,var(--moss) 70%,#fff);stroke-width:1;stroke-dasharray:2.2 1.6}}
.gb-lf.hl:not(.pv-out):not(.pv-add):not(.bud) .blade{stroke-width:1.4}
.gb .lbl text.t{font:400 13px var(--sans);fill:var(--ink2)}.gb .lbl text.t.v{font:400 12.5px var(--sans);fill:var(--ink2)}.gb .lbl text.t.v.out{fill:var(--muted);text-decoration:line-through}.gb .lbl text.st{font:11px var(--mono);fill:var(--muted)}.gb .lbl tspan.x{fill:var(--cutc)}
.gb .lbl tspan.code{font-family:var(--mono);font-size:.92em}
.gb .lbl text.eb{font:500 10px var(--mono);letter-spacing:.08em;fill:var(--muted)}.gb .st .f{fill:var(--verm-ink)}.gb .st .p{fill:var(--moss)}.gb .st .r{fill:var(--gold)}.gb .st .n{fill:var(--muted)}
.gb .lbl.hl text.t,.gb .lbl.sel text.t{font-weight:600;fill:var(--ink)}.gb .lbl.pruned{display:none}.gb .lbl.back text.t{fill:var(--ink3)}
.gb .lbl .num{font:600 11px var(--mono);fill:var(--muted)}
.gb .leader{fill:none;stroke:var(--line2);stroke-width:1}
.gb .badge circle{fill:var(--paper);stroke:var(--ink3);stroke-width:1}.gb .badge text{font:600 11px var(--mono);fill:var(--ink);text-anchor:middle;dominant-baseline:central}.gb.nw .badge text{font-size:14px}.gb.nw .klbl{font-size:12.8px;stroke-width:3.8px}.gb.nw .mlbl,.gb.nw .cuttag{font-size:13.4px}.gb.nw .note{font-size:14.7px}
.gb .badge.fail circle{stroke:var(--verm);fill:var(--verm-bg)}.gb .badge.sel circle{stroke:var(--ink);stroke-width:2}.gb .badge.pruned{display:none}
/* the repository's seal is pressed into the clay: no chip, only its letters cut into the middle of the face, darker than the
   clay at three to one or more, with a light edge a pixel below where the cut catches the light; like a potter's mark */
.gb .seal text{font-family:var(--mono);font-weight:500;letter-spacing:.03em}.gb .seal .sm{fill:color-mix(in srgb,var(--pot-dk) 50%,#000)}.gb .seal .sl{fill:color-mix(in srgb,var(--pot) 50%,#fff);opacity:.45}
/* (on a dark page the cut shows the paler clay inside it, at least three to one against the face, with no edge) */
@media (prefers-color-scheme:dark){.gb .seal .sm{fill:color-mix(in srgb,var(--pot) 28%,#fff)}.gb .seal .sl{display:none}}
.gb .stake{fill:none;stroke:var(--stake);stroke-linecap:round}.gb .tag{fill:var(--paper);stroke:color-mix(in srgb,var(--line2) 70%,var(--ink3));stroke-width:.9}.gb .rt.hl .stake,.gb .rt.sel .stake{stroke:color-mix(in srgb,var(--stake) 60%,var(--ink))}.gb .rt.hl .tag,.gb .rt.sel .tag{stroke:var(--ink3)}.gb .pot{fill:var(--pot)}.gb .pot-inc{fill:none;stroke:var(--pot-dk);stroke-width:.9;opacity:.75}.gb .pot-inc.lit{stroke:#fff;stroke-width:.7;opacity:.28}.gb .lip-hi{fill:none;stroke:#fff;stroke-width:1;opacity:.55;stroke-linecap:round}.gb .lip-lo{fill:none;stroke:color-mix(in srgb,var(--pot-dk) 70%,#000);stroke-width:1;opacity:.8;stroke-linecap:round}.gb .gl{fill:var(--soil-lit);opacity:.9}.gb .gd{fill:#000;opacity:.18}.gb .pot-ft{fill:var(--pot-ft)}.gb .soil{fill:var(--soil-c)}.gb .soilx,.gb .seal,.gb .rhi,.gb .rcutg,.gb .ptag{pointer-events:none}
@media (prefers-color-scheme:dark){.gb .gl{fill:#5A4A3E;opacity:1}.gb .gd{opacity:.3}}
.gb .rring{fill:none;stroke:var(--paper);stroke-width:3;opacity:0;transition:opacity .2s}.gb .rt.hl .rring{opacity:1}.gb .rt.sel .rring{opacity:1;stroke:var(--ink);stroke-width:1.6}
.gb .rt.hl .w,.gb .rt.sel .w{fill:var(--wood-lit)}.gb .rt.hl .rlbl,.gb .rt.sel .rlbl{fill:var(--ink);font-weight:600}.gb.dim .rt:not(.hl):not(.sel){opacity:.32}
.gb .rt.loose .w{fill:var(--wood-old);opacity:.7}.gb .rcut{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.6;opacity:.85}.gb .rt.loose .rlbl{fill:var(--muted)}.gb .rt.loose .tag{stroke-dasharray:3 2}.gb .rt.wound:not(.wmute) .w{stroke:var(--verm);stroke-width:1.2}.gb .rt.wound:not(.wmute) .rlbl{fill:var(--verm-ink)}
.gb .rlbl{font:10.5px var(--mono);fill:var(--ink2);paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round}.gb .rlbl.tg{stroke:none;font-weight:500}.gb .rlbl.nt{fill:var(--muted)}.gb .rlbl .nt{fill:var(--muted);font-weight:400}
.gb .tail{fill:none;stroke-width:1.4;stroke-dasharray:3 4;stroke-linecap:round}.gb .tailend{fill:var(--paper);stroke:var(--muted);stroke-width:1.1;opacity:.6}
/* every root is wood: a fine darker edge parts a finger from the one behind it, and its upper side catches the light. A service's root is
   lifted in the dark so it never fades into the night; a severed root is half-faded bark with a pale cut face and two rings */
.gb .nbf .w,.gb .rt .w{stroke:color-mix(in srgb,var(--wood-shade) 70%,#000);stroke-width:.6;stroke-opacity:.7;stroke-linejoin:round}.gb .nbf .w{stroke-width:.8;stroke-opacity:.85}.gb .nbf .rhi{opacity:.62}.gb .rbed{fill:var(--soil-c)}.gb .rhi{fill:var(--wood-lit);opacity:.42}.gb .rt.ext:not(.hl):not(.sel) .w{fill:var(--rt-ext)}
.gb .rt.loose .w{fill:var(--rt-cut);opacity:.6;stroke-opacity:.5}.gb .rt.loose .rlim{opacity:.3}.gb .rcut{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.55;opacity:.95}.gb .rring2{fill:none;stroke:var(--wood-shade);stroke-width:.4;opacity:.7}.gb .rt.loose .tag{stroke:var(--muted);stroke-width:1;stroke-dasharray:3 2}.gb .rlim{fill:var(--wood-lit);opacity:.5;pointer-events:none}.gb .rlbl.tg .nt{fill:var(--muted)}
/* (on a dark page the roots and the nebari are lifted a step above the trunk's wood and the soil, and every root
   carries a brighter rim light along its upper edge, so the ground never sinks into the night) */
@media (prefers-color-scheme:dark){.gb .rt.loose .w{opacity:.7}.gb .rt.ext .w{stroke:color-mix(in srgb,var(--rt-ext) 55%,#fff);stroke-opacity:.9;stroke-width:.8}.gb .nbf .w,.gb .rt.store:not(.hl):not(.sel) .w{fill:#7D6C5A}.gb .rlim{fill:#D6C2A8;opacity:.55}}
 /* the lit route is sap in the wood: an amber band about three tenths of the girth wide with a soft halo round it and a fine
    cream core along its spine, so it reads as a glow on the bark on a light page and a dark one; where it broke, the wood
    itself is red (gbRed), a band about half the girth, feathered in and out */
.gw-svg.gb{--sap:#E9A23B;--sap-core:#FFF3D6;--sap-red:#D63A28}
@media (prefers-color-scheme:dark){.gw-svg.gb{--sap:#F2B24C;--sap-core:#FFF6E0;--sap-red:#F05A45}}
.gb .sapu{fill:var(--sap);stroke:var(--sap);stroke-width:3;stroke-linejoin:round;opacity:.5;filter:blur(1.5px);pointer-events:none}
.gb .sapr{fill:var(--sap);opacity:.95;pointer-events:none}
.gb .sap{fill:none;stroke:var(--sap-core);stroke-width:1;stroke-linecap:round;stroke-linejoin:round;opacity:.9;pointer-events:none}
.gb .sap.bad{display:none}.gb .sapred{pointer-events:none}.gb .rs{stop-color:var(--sap-red)}
/* past a break: round grey dots (r 1.6, every 5), each ringed dark so they read on bark; the part of a journey a leaf's own
   scenario does not run is a faint trace; a file the run never reached is a plain grey knot with a muted name */
.gb .sap.faint{opacity:.25;animation:none}
/* where the route never ran: small round mid-grey dots with no ring, quieter than the gold route and the red break, and
   under the faint knots past the break (gbBuild cuts them out round each knot). The key's swatch is drawn the same way */
.gb .sap.rest,.gw-sw .rdots{fill:none;stroke:#9a948a;stroke-width:3;stroke-dasharray:0 7;stroke-linecap:round;opacity:.8;animation:none}.gb .sap.resto{display:none}.gw-sw .rdots{stroke-width:2.1;stroke-dasharray:0 4.8}
@media (prefers-color-scheme:dark){.gb .sap.rest,.gw-sw .rdots{stroke:#a39e93;opacity:.7}}
.gb .kn.unreached .halo,.gb .kn.unreached:hover .halo{opacity:0}.gb .kn.unreached .k1{fill:color-mix(in srgb,var(--muted) 60%,var(--wood))}.gb .kn.unreached .k2{fill:var(--muted);opacity:.5}.gb .kn.unreached,.gb.dim .kn.unreached:not(.on){opacity:.4}
.gb .klbl.unreached,.gb .klbl.oos{fill:var(--muted)}.gb .klbl.pt{font-weight:700}.gb .klbl.pt:not(.wound){fill:var(--ink)}.gb .klbl.rest:not(.wound):not(.brk){fill:var(--ink3)}
.gb .klbl.nofit,.gb .klbl.nofit+.kld{display:none}
/* while something is lit, the other names fade where they stand; a knot with no clean place for its name carries a numbered
   pip, and the name stands under that number in the key beside the tree */
.gb .klbl.kdim{opacity:.26}.gb .klbl.kdim+.kld{opacity:.2}
.gb .kpip{opacity:0;transition:opacity .2s;pointer-events:none}.gb .kpip.none{display:none}.gb .kpip.on{opacity:1}.gb .kpip.kdim{opacity:.26}.gb .kpip.wound:not(.wmute),.gb .kpip.brk:not(.wmute){opacity:1}
/* (a pip is dark with a light figure, a mark set in the wood: never read as a journey's number, which is light) */
.gb .kpip circle{fill:var(--ink2);stroke:var(--paper);stroke-width:.8}.gb .kpip .kpn{font:700 7.2px var(--mono);fill:var(--paper);text-anchor:middle;dominant-baseline:central}.gb.nw .kpip .kpn{font-size:9.2px}
.gb .kpip.pt circle{fill:var(--ink)}.gb .kpip.wound:not(.wmute) circle{fill:var(--verm-ink)}
.gb-tip .gb-kn{display:inline-block;flex:none;width:13px;height:13px;margin-right:3px;border-radius:50%;background:var(--ink2);font:700 8px/13px var(--mono);text-align:center;color:var(--paper);align-self:center}
.gb .tiplead{fill:none;stroke:var(--ink3);stroke-width:.9;pointer-events:none;paint-order:stroke}
.gb .bead{fill:var(--gold);stroke:var(--paper);stroke-width:1.5}.gb .halo{fill:var(--gold);opacity:.22}
.gb .note{font:11.5px var(--mono);fill:var(--muted)}
/* the small words that name a pointed pad's cushions (gbPadLbl): small capitals in the panel's grey, on a paper halo */
.gb .padlbl{font-family:var(--sans);font-weight:500;font-variant:small-caps;letter-spacing:.04em;fill:var(--ink3);stroke:var(--paper);stroke-linejoin:round;paint-order:stroke;dominant-baseline:central;pointer-events:none}
/* A card is as wide as its longest piece that cannot break (a file and line, a route), within 280 to 380 px (gbTip); its
   prose is set in the page's sans and only paths and routes in mono, so no word ever runs past its edge */
.gb-tip{position:absolute;z-index:3;width:280px;max-width:380px;pointer-events:none;background:var(--paper);border:1px solid var(--line2);border-radius:10px;padding:9px 12px;box-shadow:0 8px 28px rgb(0 0 0 / .14);font:13px/18px var(--sans);color:var(--ink);overflow-wrap:break-word}
.gb-tip.below{width:auto;max-width:none;right:0;box-shadow:none;pointer-events:auto}.gb-tip[hidden]{display:none}.gb-tip b{display:block;font-weight:500}.gb-tip .k{font:11px/16px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.gb-tip>.k{display:block}
.gb-tip .st{font:12.5px/17px var(--sans);margin-top:3px}.gb-tip .st.pass{color:var(--moss)}.gb-tip .st.fail{color:var(--verm-ink)}.gb-tip .st.run{color:var(--gold)}
.gb-tip .m,.gb-tip .gw-onroute>.nw{font-family:var(--mono);font-size:.92em}.gb-tip b.m{font-weight:500}.gb-tip .st b.m{font-weight:600}
.gb-tip .path{font:11.5px/16px var(--mono);color:var(--ink3);margin-top:4px}.gb-tip .path .gw-hop.hit .hl{color:var(--ink)}.gb-tip .path .gw-hop.un .hl{color:var(--muted);opacity:.75}
.gb-tip .st b{display:inline;font-weight:600}.gb-tip .st .k{font:inherit;text-transform:none;letter-spacing:0;color:inherit}.gb-tip.dock{max-width:none;box-shadow:none;border-color:var(--line)}.gb-docked>*{visibility:hidden}
/* a phone's card under the drawing closes with a button a thumb can hit, or a tap anywhere off it */
.gb-tip .gb-x{position:absolute;top:0;right:0;width:44px;height:44px;border:0;border-radius:0 10px 0 10px;background:none;color:var(--ink3);font:300 24px/44px var(--sans);text-align:center;cursor:pointer;padding:0}
.gb-tip .gb-x:hover{background:var(--sel);color:var(--ink)}.gb-tip .gb-x:focus-visible{outline:2px solid var(--ink);outline-offset:-4px}.gb-tip.below>.k,.gb-tip.below>b:first-of-type{margin-right:34px}
.gb-key{display:flex;flex-wrap:wrap;gap:4px 14px;margin:2px 6px;font:12px/18px var(--sans);color:var(--ink3)}
.gb-key i,i.gb-g{display:inline-block;flex:none;width:11px;height:7px;border-radius:7px 1px;vertical-align:0;margin-right:5px;border:1.2px solid var(--moss);background:var(--moss)}
.gb-key i.fail,i.gb-g.fail{background:var(--verm);border-color:var(--verm)}.gb-key i.none,i.gb-g.none{background:var(--paper);border-style:dashed}.gb-key i.in,i.gb-g.in{background:var(--paper)}i.gb-g.pre{opacity:.5}
.gb-key i.run,i.gb-g.run{background:var(--gold);border-color:var(--gold)}.gb-key i.cut,i.gb-g.cut{width:13px;height:6px;border-radius:1px;background:#6E5E50;border:0;border-right:3px solid #DCC8A6}
.gb-key i.bud,i.gb-g.bud{width:8px;height:5px;border-radius:5px 1px;background:var(--paper);border-style:dashed;transform:rotate(-30deg)}.gb-key i.crack{width:10px;height:10px;border-radius:50%;background:#3B322B;border:1.5px solid var(--verm)}
i.gb-g{margin:0}.gb-gs{display:inline-flex;flex-wrap:wrap;gap:3px;align-items:center}
.gb-names{margin:6px 6px 2px 22px;padding:0;font:13px/19px var(--sans);color:var(--ink2)}.gb-names li{padding:1px 0}
.gb-cap{font:12.5px/18px var(--sans);color:var(--ink3);margin:2px 6px 8px}
.gb-mode{display:grid;gap:8px;margin:0 4px 10px}
.gb-jr,.gb-olb{border-bottom:1px solid var(--line)}.gb-jr:last-of-type,.gb-olb:last-of-type{border-bottom:0}.gb-olb{padding-bottom:10px}
.gb-hd{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:2px 12px;align-items:start;width:100%;text-align:left;border:0;background:none;padding:10px 6px;border-radius:8px;cursor:pointer;color:var(--ink);list-style:none;font:inherit}
.gb-hd::-webkit-details-marker{display:none}.gb-jr>.gb-hd{position:relative;padding-left:20px}.gb-jr>.gb-hd::before{content:'▸';position:absolute;left:6px;top:13px;font-size:11px;line-height:16px;color:var(--muted)}.gb-jr[open]>.gb-hd::before{content:'▾'}.gb-jr>.gb-olx{padding-left:56px}.gb-hd:hover,.sel>.gb-hd{background:var(--sel)}.gb-olb>.gb-hd[aria-pressed=true]{box-shadow:inset 3px 0 0 var(--ink)}
.gb-hd .no{font:600 13px/22px var(--mono);color:var(--muted);text-align:center;grid-row:span 2}
.gb-hd .tt{font:500 15px/22px var(--sans);min-width:0;overflow-wrap:break-word;text-wrap:balance}.gb-hd .tt .by{font:11px/16px var(--mono);color:var(--gold);margin-left:6px;display:inline-block}/* an atomic inline, so it wraps on its own and never takes the title's last word with it */
.gb-hd .wh{grid-column:2;font:11.5px/16px var(--mono);color:var(--muted);overflow-wrap:break-word}
.gb-hd .st{grid-column:3;grid-row:1/span 2;display:grid;justify-items:end;gap:6px;padding-top:4px;font:11.5px/16px var(--mono);color:var(--muted);white-space:nowrap}
.gb-hd .st .f{color:var(--verm-ink)}.gb-hd .st .p{color:var(--moss)}.gb-hd .st .r{color:var(--gold)}
.gb-olx{display:grid;gap:1px;padding:0 6px 6px 42px;min-width:0}.gb-olx>.gb-path{margin:0 0 2px}.gb-olx>.gb-sub:first-of-type{margin-top:8px}
.gb-ols,.gb-olr{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:2px 10px;align-items:start;width:100%;min-height:36px;padding:8px;border:0;border-radius:6px;background:none;text-align:left;font:14px/20px var(--sans);color:var(--ink);cursor:pointer}
/* one row everywhere: the leaf in a column of its own, centred on the title's first line, the chips on one right edge */
.gb-ols>.gw-g{justify-self:center;margin-top:5px}.gb-olr>.gw-g{justify-self:center;margin-top:3px}.gb-ols>.no{font:600 12px/20px var(--mono);color:var(--muted);text-align:center}
.gb-ols:hover,.gb-ols.hl,.gb-ols.sel,.gb-olr:hover,.gb-olr.sel{background:var(--sel)}.gb-ols.sel,.gb-olr.sel{box-shadow:inset 3px 0 0 var(--ink)}
.gb-ols .t,.gb-olr .t{min-width:0;overflow-wrap:break-word;text-wrap:pretty}.gb-ols .t small,.gb-olr .t small{display:block;font:11.5px/16px var(--mono);color:var(--muted)}
.gb-ols .bx{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;align-items:center;min-height:20px}.gb-ols .gw-n{font:11.5px/20px var(--mono);color:var(--muted);white-space:nowrap}
.gb-ols.cut{cursor:default;color:var(--ink3);min-height:30px}.gb-ols.cut .t{text-decoration:line-through;text-decoration-color:var(--muted)}
.gb-olx .err{font:12px/17px var(--mono);color:var(--verm-ink);background:var(--verm-bg);padding:6px 8px;border-radius:6px;overflow-wrap:break-word;margin:0 8px 4px 38px}
.gb-olin{display:grid;gap:8px;padding:2px 8px 12px 38px;font-size:13px;line-height:19px;color:var(--ink3)}
.gb-rstep{margin:8px 0 0;font:12px/18px var(--mono);color:var(--ink2)}.gb-rstep p{margin:0}.gb-rstep .muted{color:var(--ink3)}.gb-hapr .gb-ract,.gb-ract{margin-left:16px}
.gb-hapr{margin:-4px 8px 6px 38px;line-height:18px}.gb-hapr .gw-lnk{margin-top:0}.gw-ins .gb-hapr{margin:-2px 4px 6px 34px}
.gb-olf>summary{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;min-height:36px;padding:6px 8px;border-radius:6px;list-style:none;cursor:pointer;font:13px/18px var(--sans);color:var(--ink3)}
.gb-olf>summary::-webkit-details-marker{display:none}.gb-olf>summary::before{content:'▸';width:10px;color:var(--muted);font-size:11px}.gb-olf[open]>summary::before{content:'▾'}.gb-olf>summary:hover{background:var(--sel)}
/* the Outline's sections: a plain heading over a rule; mono capitals are kept for the groups inside them */
.gb-olh{font:600 18px/24px var(--sans);letter-spacing:-.005em;color:var(--ink);margin:30px 6px 8px;padding-top:18px;border-top:1px solid var(--line2)}.gb-olh .sm{font-weight:400;color:var(--muted)}
.gb-ol>.gb-olh:first-child{margin-top:6px;padding-top:0;border-top:0}
.gb-olsec{margin:30px 6px 0;padding-top:10px;border-top:1px solid var(--line2)}.gb-olf.gb-olsec>summary{padding-left:0;font:600 18px/24px var(--sans);letter-spacing:-.005em;color:var(--ink)}.gb-olsec>summary .more{font-weight:400;color:var(--muted)}
.gb-olr .rg,.gb-key i.root{display:inline-block;position:relative;width:13px;height:4px;border:0;border-radius:3px 1px 1px 3px;background:#7A6A5B;margin-right:5px}.gb-olr .rg{margin:0}.gb-olr .rg.ext::after,.gb-key i.root.ext::after{content:'';position:absolute;right:-2px;top:2px;width:3px;height:7px;background:inherit;border-radius:0 0 2px 2px}
.gb-key i.stop{width:12px;height:0;border:0;border-top:1.5px dashed var(--muted);border-radius:0;background:none;vertical-align:3px}
.gb-key i.kroute{width:14px;height:0;border:0;border-top:1.4px dashed var(--ink);border-radius:0;background:none;vertical-align:3px}.gb-key i.kring{width:9px;height:6px;border-radius:50%;background:none;border:1.5px solid var(--ink3)}
.gb-names .gb-nm{all:unset;cursor:pointer;border-radius:4px}.gb-names .gb-nm:focus-visible{outline:2px solid var(--ink);outline-offset:2px}.gb-names .gb-nm[aria-pressed=true]{text-decoration:underline;text-underline-offset:3px}
.gb-olr .fd{font:11.5px/16px var(--mono);color:var(--muted);white-space:nowrap}.gb-olr .t .rc{display:block;font:12.5px/18px var(--sans);color:var(--ink3);margin-top:2px}.gb-olr .t .un{color:var(--muted)}.gb-olr .gw-chip{grid-column:2/-1;justify-self:start}
.gb-ol>.gb-sub{margin:12px 6px 2px}
.gb-olkey{display:flex;flex-wrap:wrap;gap:2px 18px;margin:-2px 6px 8px;font:12px/18px var(--sans);color:var(--ink3)}.gw .gb-olkey .gw-li{display:inline-flex;gap:5px;min-height:20px}
.gb-pk{display:flex;flex-wrap:wrap;gap:4px 14px;margin:8px 6px;font:12px/18px var(--sans);color:var(--ink3)}
.gb-sub{font:500 11px/16px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:14px 4px 4px}.gb-sub.code{text-transform:none;letter-spacing:0;color:var(--ink3)}
.gb-loose{font-size:13px;line-height:19px;color:var(--ink3);padding:10px 4px 2px}
.gb-path{font:12px/18px var(--mono);color:var(--ink3)}
.gb-path button{border:0;background:none;padding:0 2px;font:inherit;color:var(--ink2);text-decoration:underline dotted;text-underline-offset:3px;cursor:pointer;min-height:24px}
.gb-path .hop.un button{color:var(--muted);opacity:.55;text-decoration-color:color-mix(in srgb,var(--muted) 60%,transparent)}.gb-path .rootp{color:var(--ink3);text-decoration-style:dashed}.gb-path .bad{color:var(--verm-ink);font-weight:600}
@media (max-width:640px){.gb-hd{grid-template-columns:22px minmax(0,1fr)}.gb-hd .st{grid-row:auto;grid-column:2;justify-items:start}.gb-olx{padding-left:4px}.gb-olx>.gb-path{margin-left:36px}.gb-jr>.gb-olx{padding-left:4px}
 /* a row's chips stack on its right edge, so a second chip never squeezes the title into a sliver */
 .gb-ols .bx{flex-direction:column;align-items:flex-end;gap:4px}}
/* a phone's narrow column puts a row's chips, and a root's journeys, under its title rather than squeeze the title beside them */
@media (max-width:420px){.gb-ols,.gb-olr{grid-template-columns:20px minmax(0,1fr)}.gb-ols .bx{grid-column:2;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-start}.gb-olr .fd{grid-column:2;justify-self:start;white-space:normal}}
@media (prefers-reduced-motion:reduce){.gb-lf,.gb-lf .blade,.gb .vein,.gb .pfill,.gb .pband,.gb .pghost,.gb .cush,.gb .tw.fk,.gb .pclu,.gb .ptufts,.gb .gb-gr,.gb .kn .k1,.gb .kn .ring,.gb .kn .halo,.gb .klbl,.gb .kld,.gb .rring{transition:none}.gb-lf.run .gb-lfi,.gb .vein.live,.gb .sap{animation:none}.gb-lf.cut .gb-lfi{display:none}}
`;

export const BONSAI_JS = String.raw`
/* ---------- The bonsai: journeys grown from one trunk ---------- */
const gbRank={min:0,std:1,max:2};
/* The page's words for what the tree shows, one set wherever they are said: the tree's cards and small labels, the key, the
   panel, the lists and the Outline. */
const GB_W={happy:'happy path',guard:'what it refuses',failure:'how it fails',refuses:'refuses',fails:'fails',modes:'What each mode proves',scen:'Scenarios',all:'In all',own:'Part checks',reg:'Existing flows'};
const gbSURF={ui:'browser',cli:'terminal',api:'http',jobs:'job'};
const gbWHERE={browser:'in a browser',terminal:'in a terminal',http:'over HTTP',job:'as a job'};
const gbCAPS=[1,2,3,4,6,9,12,16,20,25,30,36,42,49,56,64,81,100];
const gbCap=n=>gbCAPS.find(c=>c>=n)||n;
${TREE_GEOMETRY_JS}
/* The change as journeys: each journey's scenarios are its leaves; a part's own checks and the regressions are buds on its knot.
   A log saved before journeys existed falls back to one journey per surface the change touches, and says so. */
function gbModel(){const s=gw.state;const U={};for(const u of s.units)U[u.id]=u;
 let J=(s.journeys||[]).map(j=>({id:j.id,title:j.title,by:j.titleBy,entry:j.entry,surface:j.surface,units:j.units.filter(id=>U[id])}));let legacy=false;
 if(!J.length&&s.scenarios.length){legacy=true;
  J=s.units.filter(u=>!u.root&&gbSURF[u.layer]).map((u,i)=>({id:'L'+(i+1),title:u.label,by:'rules',entry:u.id,surface:gbSURF[u.layer],units:[u.id,...s.units.filter(r=>r.root&&r.parent===u.id).map(r=>r.id)]}))}
 const leaves={},buds={};for(const j of J)leaves[j.id]=[];
 for(const x of s.scenarios){const j=x.scenarioKind!=='regression'&&x.level!=='part'?(x.journey?J.find(q=>q.id===x.journey):legacy?J.find(q=>q.entry===x.unit):null):null;
  if(j)leaves[j.id].push(x);else(buds[x.unit]=buds[x.unit]||[]).push(x)}
 const P={};const find=a=>P[a]===a?a:(P[a]=find(P[a]));for(const j of J)P[j.id]=j.id;const own={};
 for(const j of J)for(const id of j.units){if(U[id].root)continue;if(own[id])P[find(j.id)]=find(own[id]);else own[id]=j.id}
 const groups={};for(const j of J)(groups[find(j.id)]=groups[find(j.id)]||[]).push(j);
 const crit=j=>new Set(leaves[j.id].flatMap(x=>x.criteria));const weight=j=>j.units.filter(id=>!U[id].root).length||1;
 /* One tree: the trunk is the change itself, so every journey grows from it. Journeys that share code run up it in adjacent
    strands through the same knots; one that shares nothing still leaves the same trunk, its own parts all on its branch. */
 const trees=J.length?[{js:J.slice(),leaves:J.reduce((n,j)=>n+leaves[j.id].length,0),groups:Object.keys(groups).length}]:[];
 const inJ=new Set(J.flatMap(j=>j.units));
 return {U,J,legacy,leaves,buds,crit,weight,trees,jin:s.units.filter(u=>!u.root&&!inJ.has(u.id)),strays:s.units.filter(u=>u.root&&!inJ.has(u.id))}}

/* Journeys are numbered by what they prove (spec criteria, then scenarios, then parts), the same in the tree and the lists. */
function gbOrder(M){const imp=(a,b)=>M.crit(b).size-M.crit(a).size||M.leaves[b.id].length-M.leaves[a.id].length||M.weight(b)-M.weight(a)||(a.id<b.id?-1:1);return M.J.slice().sort(imp)}
/* The headline journey of js: the first in that order that failed, else the first. The tree's crown and the panel's
   "first failing" or "headline" journey are this one, so the most prominent place on the drawing holds the news. */
function gbHead(M,js){const s=gw.state,o=gbOrder(M).filter(j=>js.includes(j));return o.find(j=>(M.leaves[j.id]||[]).some(x=>s.run[x.id]&&s.run[x.id].st==='fail'))||o[0]||js[0]}

/* What a scenario proves, for where its leaf sits: the happy path, a guard (a caller or input the journey must refuse),
   or a way it fails. */
const gbPol=x=>x.polarity||(x.scenarioKind==='happy'?'happy':x.scenarioKind==='sad'?'failure':'guard');
const gbOrd=list=>list.map((x,i)=>({x,i})).sort((a,b)=>gbRank[a.x.mode]-gbRank[b.x.mode]||a.i-b.i).map(o=>o.x);
/* The grow's clock: the animation timeline's time, which is when the next frame is drawn as of, not the wall clock. A busy
   page can draw a frame as of a time well before a build that ran in it, so a piece judged grown by the wall clock could
   show with no animation while the wood under it is drawn as of earlier; judged by this clock it never is. */
const gbNow=()=>{const t=document.timeline?document.timeline.currentTime:null;return t==null?performance.now():Math.min(Number(t),performance.now())};
/* When an animation started, kept for the whole grow, so a rebuild continues it instead of restarting it. */
function gbT(k,delay){const G=gw.seen.gt||(gw.seen.gt={});if(G[k]===undefined)G[k]=gbNow()+delay;return G[k]}
/* When something that grows on wood shows: kept once it has shown, but one not shown yet waits for its wood as the latest
   build places it, so a rebuild never brings it in ahead of the wood under it */
function gbTA(k,delay){const G=gw.seen.gt||(gw.seen.gt={}),now=gbNow(),t=now+delay;if(G[k]===undefined||(G[k]>now&&t>G[k]))G[k]=t;return G[k]}
/* A piece of wood's reveal, kept for the whole grow by the piece's own key: when it started, over how long, from what
   fraction of its length. A rebuild carries it on where it had got to, never from its base again; one that had grown out
   stays grown however the rebuild draws it, since what grew on it (a cushion, a leaf, a name) is kept where it now sits and
   must never stand past the wood. One whose base the wood has not reached yet in this build (a leaf's twig moved onto a
   riser drafted under it, which is still growing) is new wood there: it waits for that wood as if new. */
function gbWood(k,delay,ms,len,lag){const G=gw.seen.gw||(gw.seen.gw={}),now=gbNow();let r=G[k];
 if(!r||(delay>0&&r.t0<now+delay-1))r=G[k]={t0:now+delay,ms,f0:0,len,lg:(lag||0)/(len||1)};return r}
/* how much of its length a reveal has uncovered at time t, on its ease-out; and when the wood shows its whole girth at fraction
   f: when its front, a tip that widens to the wood's girth behind it (gbGrowRun), is that taper's length (lg) past f */
const gbWF=(r,t)=>{const u=Math.max(0,Math.min(1,(t-r.t0)/r.ms));return r.f0+(1-r.f0)*(1-Math.pow(1-u,2.2))};
const gbWT=(r,f)=>(f=Math.min(1,f+(r.lg||0)),f<=r.f0?r.t0:r.t0+r.ms*(1-Math.pow(1-Math.min(1,(f-r.f0)/(1-r.f0||1)),1/2.2)));
/* Growth runs on the page clock: an animation starts at the moment given, on the same clock as the wood's reveal, not
   when the browser next gets round to starting it, so a slow build or paint never lets a leaf, cushion or name fall out of
   step with the wood it grows on. The wood's reveal (a clip path) runs on the page's own thread, but a fade or a swell may
   run on the compositor, which goes on while a busy page holds the wood back; so whatever comes in (held at its start
   before it, fill backwards) is also hidden until the page's own clock reaches its start, and never shows ahead of its wood. */
function gbPlay(el,kf,o,t0){const a=el.animate(o.fill==='backwards'?kf.map((k,i)=>i?k:Object.assign({visibility:'hidden'},k)):kf,Object.assign({},o,{delay:0}));try{a.startTime=t0}catch(e){a.effect.updateTiming({delay:t0-gbNow()})}return a}
/* When the growing wood has reached a point: the first piece that carries it, on the same ease-out its reveal runs on. */
function gbWoodAt(B,p,pad){let t=Infinity;for(const g of B.grow){const P=g.pts;if(!P||P.length<2)continue;const A=gbLen(P),T=A[A.length-1]||1;let bd=Infinity,bf=0;
 for(let i=1;i<P.length;i++){const a=P[i-1],b=P[i],vx=b[0]-a[0],vy=b[1]-a[1],u=Math.max(0,Math.min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/(vx*vx+vy*vy||1))),d=Math.hypot(p[0]-a[0]-vx*u,p[1]-a[1]-vy*u);if(d<bd){bd=d;bf=(A[i-1]+(A[i]-A[i-1])*u)/T}}
 if(bf>.01&&bd<=Math.max(...g.w)/2+pad)t=Math.min(t,gbWT(g,bf))}return t}
/* How a cushion grows: from a speck at its fork, quickly opaque and fast at first, easing as it fills out. GB_CU is its scale
   through the growth; gbCuAt(v) the fraction of the growth at which it reaches scale v, which a leaf (v .85) or a name (.5)
   waits for. */
const GB_CU=[[0,.08],[.2,.42],[.45,.74],[.7,.92],[1,1]];
function gbCuAt(v){for(let i=1;i<GB_CU.length;i++){const [a,p]=GB_CU[i-1],[b,q]=GB_CU[i];if(q>=v)return a+(b-a)*(v-p)/((q-p)||1)}return 1}
/* A pruned piece falls: snipped at p (its collar, where it leaves the wood), it tips th degrees about the cut and drops
   (dx, dy) along a short arc, sideways first, then down, as it fades; GB_FALL ms on an ease-in, gathering speed. */
const GB_FALL=500,GB_BACK=360,GB_EASEIN='cubic-bezier(.42,0,1,1)';
/* the snip comes first: two blades close across the collar at p, the cut along u, and only GB_SNIP ms later does the piece
   start to fall, so a cut reads as a cut and then a fall */
const GB_SNIP=180;
function gbSnip(parent,p,u,lag){if(!parent||gwQuiet())return;const n=[-u[1],u[0]],q=(a,b)=>[p[0]+u[0]*a+n[0]*b,p[1]+u[1]*a+n[1]*b];
 const e=sv('path',{class:'snip',d:'M'+gbP(q(-4.5,-4))+' L'+gbP(q(1.5,0))+' M'+gbP(q(-4.5,4))+' L'+gbP(q(1.5,0))});e.style.animationDelay=gbF(lag)+'ms';parent.append(e);setTimeout(()=>e.remove(),lag+420)}
function gbFallK(p,dx,dy,th){const T=(x,y,r)=>'translate('+gbF(x)+'px,'+gbF(y)+'px) translate('+gbF(p[0])+'px,'+gbF(p[1])+'px) rotate('+gbF(r)+'deg) translate('+gbF(-p[0])+'px,'+gbF(-p[1])+'px)';
 return [{offset:0,transform:T(0,0,0),opacity:1},{offset:.4,transform:T(.45*dx,.16*dy,.7*th),opacity:.85},{offset:1,transform:T(dx,dy,th),opacity:0}]}
/* What was only ever a preview's ghost was never grown, so a mode that drops it does not cut it: it shrinks back into p
   (its collar) as it fades, in GB_BACK ms on the same ease-in, and leaves no mark. */
/* A healed cut: a small roll of callus at c, in the bark's own tones, rx along the grain t and ry across it (six by four at
   the least, so it reads as a mark and not a speck), with a thin lit crescent along its lip on the side n it was cut from.
   Never a pale disc: it reads as bark, and a knot always stands over it. */
function gbCal(c,t,n,rx,ry,cls,...kids){const ang=Math.atan2(t[1],t[0])*180/Math.PI,cr=[];for(let i=0;i<=8;i++){const th=Math.PI*i/8;cr.push([c[0]+(t[0]*Math.cos(th)*rx+n[0]*Math.sin(th)*ry)*.8,c[1]+(t[1]*Math.cos(th)*rx+n[1]*Math.sin(th)*ry)*.8])}
 return sv('g',{class:'heal '+cls},sv('ellipse',{cx:gbF(c[0]),cy:gbF(c[1]),rx:gbF(rx),ry:gbF(ry),transform:'rotate('+gbF(ang)+' '+gbP(c)+')',class:'cal'}),sv('path',{d:gbLine(cr),class:'cres'}),...kids)}
function gbBackK(p){const T=k=>'translate('+gbF(p[0])+'px,'+gbF(p[1])+'px) scale('+k+') translate('+gbF(-p[0])+'px,'+gbF(-p[1])+'px)';return [{offset:0,transform:T(1),opacity:1},{offset:1,transform:T(.04),opacity:0}]}
function gbCu(f){const T=k=>'translate('+gbF(f[0])+'px,'+gbF(f[1])+'px) scale('+k+') translate('+gbF(-f[0])+'px,'+gbF(-f[1])+'px)';return GB_CU.map(([o,k],i)=>({offset:o,transform:T(k),opacity:i?1:0}))}

/* A pad is grown, not stamped: dense cushions of foliage on the wood that carries them. The happy path sits on the crest,
   the highest cushion; guards on a shoulder cushion to either side, the first on the outer one, and a shoulder grows only
   for a guard (or a crown's happy path, below), so no cushion is ever empty; the ways it fails hang on short stems from the wood under the pad. A crest with
   shoulders stands clear above them on its leaves' own twigs, so which tier a leaf is on reads at a glance. A crown is the
   same cushions round the leader's top, in tiers too: a crown of three or more happy paths and no guards deals them between its
   crest and one or two smaller shoulders below it, so the apex is a crest on its riser, never one flat cloud (beside a desktop
   tree; on a phone it stays one crest). On a pad one rule
   sizes every cushion: its area grows with the leaves it holds (its width with their square root); how wide each pad is, the
   tree decides (gbTree). A single journey's own guard or failure pad holds all its leaves in one cushion. Leaves lie inside their cushion, apart, each turned along the twig it
   grows on; in each group the minimum's leaves come first. Coordinates are the pad's own: x from its middle, y up from the
   lowest underside. */
const GB_PET=3.5;
/* the shortest distance between two segments: two leaves' midribs, so leaves are kept apart blade from blade */
function gbSegD(a,b,c,d){const P=(p,q,r)=>{const dx=r[0]-q[0],dy=r[1]-q[1],l=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p[0]-q[0])*dx+(p[1]-q[1])*dy)/l));return Math.hypot(p[0]-q[0]-t*dx,p[1]-q[1]-t*dy)};
 const s=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);if(s(a,b,c)*s(a,b,d)<0&&s(c,d,a)*s(c,d,b)<0)return 0;return Math.min(P(a,c,d),P(b,c,d),P(c,a,b),P(d,a,b))}
function gbPadGeo(list,H,dir,seed,crown,K,pol,lmin,tier){const z=Math.max(.6,Math.pow(H/560,.75));
 /* every leaf on a tree is the same size, so no leaf reads as bigger news than another; leaves are the data, so they lead:
    about nineteen pixels long beside a desktop tree, never under about eleven on a phone (lmin, from gbBuild) */
 const L0=Math.max(13,Math.min(19,17.5*z,H*.032)),L=Math.max(L0,lmin||0),W=L*.52,gap=16,d=dir||1;
 const g={happy:[],guard:[],failure:[]};for(const x of gbOrd(list))g[gbPol(x)].push(x);
 const one=!!pol||(!g.happy.length&&(crown||!g.guard.length));
 const mk=(role,sd,lv)=>({role,sd,lv,ids:lv.map(x=>x.id),hang:[],a:0,h:0,b:0,x:0,seat:0,limf:null,pos:[],body:[]});
 const crest=one||g.happy.length||crown?mk('crest',0,one?gbOrd(list):g.happy):null;
 const sides={};sides[d]=[];sides[-d]=[];if(!one)g.guard.forEach((x,i)=>sides[i%2?-d:d].push(x));
 /* (a crown with no guards and three or more happy paths: every other one to a shoulder, the first of those on the outer one,
    so its crest keeps the most; on a phone, where the upper trunk's names need the room, the crown stays one crest) */
 const hap=tier&&crown&&!one&&!g.guard.length&&g.happy.length>=3;if(hap){const lv=crest.lv;crest.lv=lv.filter((_,i)=>i%2===0);crest.ids=crest.lv.map(x=>x.id);lv.filter((_,i)=>i%2).forEach((x,i)=>sides[i%2?-d:d].push(x))}
 const sIn=sides[-d].length?mk('shoulder',-d,sides[-d]):null,sOut=sides[d].length?mk('shoulder',d,sides[d]):null;if(hap)for(const c of [sIn,sOut])if(c)c.hap=true;
 const cs=[sIn,crest,sOut].filter(Boolean),shs=[sIn,sOut].filter(Boolean);
 /* a journey's failures hang under its outer shoulder, or under its crest when it has none; a crown's under its shoulders, or
    from a branchlet just under its crest */
 if(!one){const hc=crown&&shs.length?[sOut,sIn].filter(Boolean):[sOut||crest];g.failure.forEach((x,i)=>hc[i%hc.length].hang.push(x))}
 /* and a scenario whose run failed hangs too, under the cushion it grew in, as the caption says: never among the leaves that
    passed (a cushion keeps at least one leaf, so a cushion all of whose leaves failed keeps them, and one that already has
    the ways it fails hanging under it keeps its failed runs among its leaves, in red, as there is no room under it for
    more); the cushion keeps the size
    it had with them, so a run failing never shrinks it */
 const ran=gw.state&&gw.state.run||{},bad=x=>{const r=ran[x.id];return !!r&&r.st==='fail'};
 if(one)for(const c of cs){const f=c.lv.filter(bad);if(!f.length||f.length===c.lv.length||c.hang.length)continue;c.lv=c.lv.filter(x=>!bad(x));c.ids=c.lv.map(x=>x.id);c.hang.push(...f);c.held=f.length}
 for(const c of cs){c.hs=c.role==='shoulder'?c.sd:d;c.limf=c.role==='shoulder'?(crown?.14:.1):shs.length||crown?null:.1}
 /* A cushion's shape, its own from its pad's id so no two are stamped alike: each end a round cap (about three tenths of
    its height across, each its own), an underside that bows down slightly between them (six to ten hundredths of its
    height), and over them a low dome whose highest point sits a little to one side. Every join is tangent, so nothing
    flares to a point. About 2.8 times as wide as it is tall, a shoulder flatter, the crown's crest fuller (2.6). v runs
    from -1 to 1 across it. */

 const ar=c=>c.role==='shoulder'?.62:crown?.77:.71;
 for(const c of cs){const r=gbRng(gbHash('hull:'+seed+':'+c.role+c.sd));c.rL=.27+.07*r();c.rR=.27+.07*r();c.pk=(r()-.5)*.36;c.bul=.06+.04*r()}
 const cap=(c,v)=>{const sd=v<0?-1:1,rho=(sd<0?c.rL:c.rR)*c.h,xe=c.a-rho,x=Math.max(-c.a,Math.min(c.a,v*c.a)),yc=-(rho+c.bul*c.h);return {sd,rho,xe,x,yc}};
 const tY=(c,v)=>{const q=cap(c,v),ax=Math.abs(q.x);if(ax>q.xe)return q.yc-Math.sqrt(Math.max(0,q.rho*q.rho-(ax-q.xe)*(ax-q.xe)));
   const L0=cap(c,-1),R0=cap(c,1),xl=-L0.xe,xr=R0.xe,f=(q.x-xl)/((xr-xl)||1),base=(L0.yc-L0.rho)*(1-f)+(R0.yc-R0.rho)*f,xp=c.pk*Math.min(L0.xe,R0.xe),u=q.x<xp?(q.x-xp)/((xp-xl)||1):(q.x-xp)/((xr-xp)||1);
   return base-Math.max(0,c.h+base)*(1+Math.cos(Math.PI*Math.max(-1,Math.min(1,u))))/2},
  bY=(c,v)=>{const q=cap(c,v),ax=Math.abs(q.x);if(ax>q.xe)return q.yc+Math.sqrt(Math.max(0,q.rho*q.rho-(ax-q.xe)*(ax-q.xe)));return -c.bul*c.h*(1-Math.cos(Math.PI*ax/(q.xe||1)))/2};
 const size=(c,k)=>{c.a=k*Math.sqrt((c.lv.length+(c.held||0)+.5)/ar(c));c.h=c.a*ar(c)};
 /* a leaf leans out along its twig: on a crest they fan from the wood under it, a little out from the trunk; on a shoulder
    lower, out over its own side; on a crown they fan from the leader */
 const ang=(c,px,id)=>{const v=Math.max(-1,Math.min(1,px/c.a)),j=(gbHash('lf:'+id)-.5)*12;let t;
  if(c.role==='shoulder'){const w=(v*c.sd+1)/2;t=-90+c.sd*(c.sd===d||crown?56+12*w:50+12*w)}else if(crown)t=-90+50*v;else t=-90+46*v+12*d;return (t+j)*Math.PI/180};
 /* inside: the whole blade within the cushion, and its foot above the wood the cushion lies on, so its twig can rise to it */
 const SP=[[.5,0],[-.5,0],[0,.5],[0,-.5],[.25,.45],[.25,-.45],[-.25,.45],[-.25,-.45]];
 const inside=(c,p,th,m)=>{const u=[Math.cos(th),Math.sin(th)];if(c.limf!==null&&p[1]-u[1]*(L/2+GB_PET)>-(c.limf*c.h+1))return false;
  for(const [s,t] of SP){const x=p[0]+u[0]*s*L-u[1]*t*W,y=p[1]+u[1]*s*L+u[0]*t*W,v=x/c.a;if(Math.abs(v)>=.97||y<tY(c,v)+m||y>bY(c,v)-m)return false}return true};
 /* leaves are set out in rows (one row arched with its dome), a row spread to about half its cushion's width so a crown made
    larger than its leaves need still reads full, and then relaxed: each pair pushed apart until they stand a leaf and a tenth
    apart, blade clear of blade, each drawn back inside its cushion */
 const place=c=>{const n=c.lv.length;c.pos=[];if(!n)return true;const r=gbRng(gbHash('lv:'+seed+':'+c.role+c.sd));
  const per=Math.max(1,Math.floor((1.7*c.a-L)/(1.15*L))+1),rows=Math.ceil(n/per),P=[];
  for(let i=0;i<n;i++){const row=Math.floor(i/per),k=i%per,m=Math.min(per,n-row*per),sp=Math.min(1.6*c.a/m,Math.max(1.2*L,m>1?c.a/(m-1):0));const q=m>1?(k-(m-1)/2)/((m-1)/2):0;P.push([(k-(m-1)/2)*sp+(row%2?sp*.3:0)+(r()-.5)*2,-c.h*(rows===1?(m>2?.48+.18*(1-q*q):.56):.7-.4*row/(rows-1))+(r()-.5)*2])}
  const D=1.1*L,core=[0,-c.h*(c.limf===null?.5:.58)],th=i=>ang(c,P[i][0],c.lv[i].id),seg=i=>{const t=th(i),u=[Math.cos(t)*L/2,Math.sin(t)*L/2];return [[P[i][0]-u[0],P[i][1]-u[1]],[P[i][0]+u[0],P[i][1]+u[1]]]};
  const ok=(i,j)=>{const a=seg(i),b=seg(j);return Math.hypot(P[j][0]-P[i][0],P[j][1]-P[i][1])>=D-.4&&gbSegD(a[0],a[1],b[0],b[1])>=W+1.6};
  for(let it=0;it<90;it++){let moved=false;
   for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){if(ok(i,j))continue;const dx=P[j][0]-P[i][0],dy=P[j][1]-P[i][1],m=Math.hypot(dx,dy)||.01,f=Math.max(.5,(D-m)/2+.3)/m;P[i][0]-=dx*f;P[i][1]-=dy*f;P[j][0]+=dx*f;P[j][1]+=dy*f;moved=true}
   for(let i=0;i<n;i++)for(let k=0;k<16&&!inside(c,P[i],th(i),2);k++){P[i][0]+=(core[0]-P[i][0])*.14;P[i][1]+=(core[1]-P[i][1])*.14;moved=true}
   if(!moved)break}
  c.pos=P.map((p,i)=>[p[0],p[1],th(i)]);for(let i=0;i<n;i++){if(!inside(c,P[i],th(i),1.5))return false;for(let j=i+1;j<n;j++)if(!ok(i,j))return false}return true};
 /* the smallest size at which every cushion holds its leaves, or the larger one the tree asks for (K); never so small that a
    leaf stands more than about a third of its crest's height */
 let k=Math.max(K||0,L*1.22);const fit=k=>{for(const c of cs)size(c,k);return cs.every(place)};for(let i=0;i<48&&!fit(k);i++)k*=1.05;
 /* the clumps a cushion is heaped from: a row along its crest, two more than its leaves (three to seven), each a little
    larger or smaller than the next, whose tops scallop its edge; and a lower row in front */
 for(const c of cs){const r=gbRng(gbHash('cl:'+seed+':'+c.role+c.sd)),kt=Math.max(3,Math.min(7,c.lv.length+2)),sp=1.56*c.a/(kt-1),R=Math.min(c.h*.5,.64*sp);c.body=[];
  for(let i=0;i<kt;i++){const v=(i/(kt-1)*2-1)*.7+(r()-.5)*.08,rr=R*(.82+.36*r());c.body.push([v*c.a,tY(c,v)+rr-c.h*(.05+.06*r()),rr,0])}
  const kf=Math.max(2,Math.min(4,kt-1));for(let i=0;i<kf;i++){const v=(i/(kf-1)*2-1)*.52+(r()-.5)*.12,rr=c.h*.44*(.86+.26*r());c.body.push([v*c.a,-c.h*.34+(r()-.5)*c.h*.08,rr,1])}}
 /* a journey's crest stands clear above its shoulders, which reach out from under its flanks; a crown's guard shoulders hang
    lower and further out to either side of its crest, its happy ones tucked in under the crest's flank, so the apex stays
    compact */
 const hs=Math.max(0,...shs.map(c=>c.h));if(crest&&shs.length){for(const c of shs){c.x=c.sd*(c.hap?crest.a*.3+c.a*.55:crown?crest.a*.5+c.a*.74:crest.a*.46+c.a*.62);c.seat=c.limf*c.h}crest.b=-(hs+gap);crest.seat=null}
 else{if(!crest&&shs.length===2)for(const c of shs)c.x=c.sd*c.a*1.02;for(const c of cs)c.seat=(c.limf||.2)*c.h}
 const lo=Math.min(...cs.map(c=>c.x-c.a)),hi=Math.max(...cs.map(c=>c.x+c.a)),PW=hi-lo;for(const c of cs){c.x-=(lo+hi)/2;c.u=PW/2+d*c.x}
 /* a failure's stem is short, never more than half as long as the crest is tall */
 const Hc=crest?crest.h:hs;
 const G={L,L0,W,PW,PH:0,z,cs,crown:!!crown,one,gap,need:k,Hc,d,slot:new Map(),tuft:new Map(),cOf:new Map(),drop:4,tY,bY};cs.forEach((c,i)=>{for(const id of [...c.ids,...c.hang.map(x=>x.id)])G.cOf.set(id,i)});
 /* each leaf in place, and the tuft of foliage in front of its foot, which tucks its stalk in */
 G.lay=()=>{for(const c of cs){c.bot=c.b;c.pos.forEach((p,i)=>{const id=c.lv[i].id,u=[Math.cos(p[2]),Math.sin(p[2])];
   G.slot.set(id,[c.x+p[0],c.b+p[1],p[2]*180/Math.PI,1,0]);G.tuft.set(id,[c.x+p[0]-u[0]*(L/2-.5),c.b+p[1]-u[1]*(L/2-.5)+.5,.3*L+1.2,.17*L+1])})}
  /* how far below its lowest underside the pad reaches: its failures' stems and leaves (set exactly once they hang) */
  G.PH=Math.max(...cs.map(c=>c.h-c.b));G.drop=cs.some(c=>c.hang.length)?3+.5*Hc+GB_PET+L+2:4};
 /* A cushion's outline: the dome, with the tops of the clumps along its crest standing a little proud of it in round
    scallops; the underside clean, its own shallow curve. Sampled closer toward the ends, where it turns round. */
 const sil=(c,on)=>{const N=40,top=[],bot=[];if(!on){const p=[c.x,c.b-c.h*.3];for(let i=0;i<=N;i++){top.push(p.slice());bot.push(p.slice())}return {top,bot,on:false,x0:p[0],x1:p[0]}}
  const cl=c.body.filter(q=>!q[3]),ve=1-.6*Math.min(c.rL,c.rR)*c.h/c.a;for(let i=0;i<=N;i++){const v=-Math.cos(Math.PI*i/N),x=v*c.a,t0=tY(c,v),e=Math.abs(v)>ve?Math.min(1,Math.pow((Math.abs(v)-ve)/(1-ve),1.5)):0;let t=t0;
   for(const q of cl){const dx=x-q[0];if(Math.abs(dx)<q[2]){const y=q[1]-Math.sqrt(q[2]*q[2]-dx*dx);t=Math.min(t,y+e*(t0-y))}}
   const b=bY(c,v);top.push([c.x+x,c.b+t]);bot.push([c.x+x,c.b+b])}
  return {top,bot,on:true,x0:c.x-c.a,x1:c.x+c.a}};
 G.shape=keep=>({cs:cs.map(c=>sil(c,!c.ids.length||c.ids.some(keep)))});
 /* seat the cushions on their wood: each moves by its own amount, then the lowest underside is y=0 again (returned, so the
    caller moves the pad's origin by it) */
 G.seat=dys=>{cs.forEach((c,k)=>{if(c.seat!==null)c.b+=dys[k]||0});if(crest&&crest.seat===null)crest.b=Math.min(...shs.map(c=>c.b-c.h))-gap;const m=Math.max(...cs.map(c=>c.b));for(const c of cs)c.b-=m;G.lay();return m};
 G.lay();return G}
/* a silhouette edge's height at x, between its samples */
function gbAtX(e,x){if(x<=e[0][0])return e[0][1];for(let i=1;i<e.length;i++)if(e[i][0]>=x){const a=e[i-1],b=e[i],f=(x-a[0])/((b[0]-a[0])||1);return a[1]+(b[1]-a[1])*f}return e[e.length-1][1]}
/* a cushion's outline as a path: its crest drawn through the midpoints of its samples, so the scallops are round */
/* A twig from point i of the wood C (widths cw) to a leaf's foot E, arriving along the leaf's direction u, so the leaf goes
   on where the twig ends. It leaves its wood growing the way the wood grows, or straight up off it when the leaf is behind. */
function gbTwigTo(C,cw,i,E,u){const n=C.length-1,S=C[i],a=C[Math.max(0,i-1)],b=C[Math.min(n,i+1)],tl=Math.hypot(b[0]-a[0],b[1]-a[1])||1;let t=[(b[0]-a[0])/tl,(b[1]-a[1])/tl];
 const v=[E[0]-S[0],E[1]-S[1]],m=Math.hypot(v[0],v[1])||1;if(t[0]*v[0]+t[1]*v[1]<0)t=[0,-1];const q=[.4*t[0]+.6*v[0]/m,.4*t[1]+.6*v[1]/m],ql=Math.hypot(q[0],q[1])||1;
 const pts=gbBez([S,[S[0]+q[0]/ql*.35*m,S[1]+q[1]/ql*.35*m],[E[0]-u[0]*.35*m,E[1]-u[1]*.35*m],E],12),w0=Math.min(3,Math.max(1.6,.45*(cw[i]||3)));
 return {pts,w:pts.map((_,j)=>w0+(1-w0)*j/12),bi:i}}
/* A forked twig under a cushion: off point i of the wood C (widths Cw) it rises from the wood's top, forks three and a half
   pixels under the cushion's lowest edge yl (or just over the wood, where the wood runs closer) and ends in two tips inside
   the cushion (h its height, a its half-width), the main stem's leaning back toward dir's other side about twenty-two
   degrees, the side tip's out toward dir about twenty-eight; lean moves the fork along. Returns the main stem, ending in its own tip, and the side tip, which forks off it
   (c) at its point bi. */
function gbTwFork(C,Cw,i,yl,h,a,dir,lean){const S=C[i],wc=Cw[i]||2,F=[S[0]+dir*lean,Math.min(S[1]-wc/2-1.5,yl+3.5)],T1=[F[0]-dir*.4*(F[1]-yl+.3*h),yl-.3*h],T2=[F[0]+dir*.53*(F[1]-yl+.22*h),yl-.22*h];
 const m=gbResample(gbSmooth([S,F,T1],2),12),w0=Math.min(2.6,Math.max(1.5,.45*wc)),n=m.length-1;let fi=m.findIndex(q=>q[1]<=F[1]+.5);if(fi<1||fi>n-2)fi=Math.max(1,Math.min(n-2,Math.round(n/2)));
 const mw=m.map((_,j)=>w0+(1-w0)*j/n),P=m[fi],sp=gbBez([P,[P[0]+(T2[0]-P[0])*.45,P[1]-1.5],[T2[0]-(T2[0]-P[0])*.15,T2[1]+(P[1]-T2[1])*.3],T2],8),s0=Math.max(1,mw[fi]*.85);
 const main={pts:m,w:mw,bi:i,fi,fk:1};return [main,{pts:sp,w:sp.map((_,j)=>s0+(1-s0)*j/8),bi:fi,c:main,fk:2}]}
/* Every leaf grows on a twig of its own, off the wood that carries its cushion, from the point of that wood it can rise most
   nearly straight at. A failure hangs beneath its cushion from a twig that shows, never on a thread: the twig leaves the
   wood under the cushion and runs out four pixels under its underside to the leaf, and the leaf's own stem of ten pixels
   leaves that twig's underside, at thirty to forty-five degrees, out and down (the twig is wood of the pad's, the stem the
   leaf's). Only where no such place is clear of the wood, the cushions and the other leaves, however long the twig runs,
   does it sit on the cushion's lower rim instead: a short stem (about two fifths of a
   leaf, eight pixels beside a desktop tree) ends inside the cushion, so about three tenths of its blade lies over the rim,
   and the wood under the cushion rises to it behind the foliage. (A leaf's own twig leaves its wood where that runs no more
   than about nine pixels under the cushion, where it can, so no twig shows as a long stilt under the pad.) Either way the leaf and its twig stay inside the cushion's
   ends, the blade's middle at least a leaf's width in from each, so nothing trails past the pad. The first nearest the wood's end. car(k,hang) is the wood under cushion k ({pts,w,lo,dir}). Sets each hanging leaf's slot and the
   pad's drop; returns the twigs, each with its leaf and its cushion. */
function gbLeafTwigs(g,o,car){const out=[],r=g.L/2+GB_PET;
 /* each leaf's midrib, so a failure's leaf keeps a blade's width clear of every other */
 const rib=(m,th)=>{const u=[Math.cos(th)*g.L/2,Math.sin(th)*g.L/2];return [[m[0]-u[0],m[1]-u[1]],[m[0]+u[0],m[1]+u[1]]]},ribs=[...g.slot.values()].filter(sl=>!sl[4]).map(sl=>rib([o[0]+sl[0],o[1]+sl[1]],sl[2]*Math.PI/180));
 g.cs.forEach((c,k)=>{const X=o[0]+c.x,Wd=c.ids.length?car(k,0):null;
  if(Wd){const C=Wd.pts;const fs=c.ids.map(id=>{const sl=g.slot.get(id),th=sl[2]*Math.PI/180,u=[Math.cos(th),Math.sin(th)];return {id,u,E:[o[0]+sl[0]-u[0]*r,o[1]+sl[1]-u[1]*r]}});
   for(const f of fs){if(f.i===undefined){let bs=1e9;for(let i=Wd.lo;i<C.length;i++){const S=C[i],v=[f.E[0]-S[0],f.E[1]-S[1]],m=Math.hypot(v[0],v[1]);if(Math.abs(S[0]-X)>c.a*.95||m<5||v[1]>-2)continue;
      const a=Math.acos(Math.max(-1,Math.min(1,(v[0]*f.u[0]+v[1]*f.u[1])/m)))*180/Math.PI,sc=a+.25*Math.max(0,m-28)+.6*Math.max(0,10-m)+3*Math.max(0,S[1]-(Wd.w[i]||2)/2-(o[1]+c.b)-9);if(sc<bs){bs=sc;f.i=i}}
     if(f.i===undefined){let bd=1e9;for(let i=Wd.lo;i<C.length;i++){const dd=Math.hypot(C[i][0]-f.E[0],C[i][1]-f.E[1]);if(dd<bd){bd=dd;f.i=i}}}}
    out.push({id:f.id,k,...gbTwigTo(C,Wd.w,f.i,f.E,f.u)})}}
  const Wh=c.hang.length?car(k,1):null;if(!Wh)return;const C=Wh.pts,sp=Math.max(g.W+5,1.1*g.L);
  const n=c.hang.length;
  /* one leaf's place at a stem's angle fall: where (q), and how well it hangs (lv: 0 to 2 beneath the cushion's flat
     underside, 3 and 4 only inside its ends, 5 on its rim, 6 from the wood's end) */
  const place1=(x,j,fall,pk)=>{const st=Math.min(.5*g.Hc,.42*g.L),th=(Wh.dir>0?fall:180-fall)*Math.PI/180,u=[Math.cos(th),Math.sin(th)],cv=q=>Math.max(-1,Math.min(1,(q-X)/c.a));
   const yT=q=>o[1]+c.b+g.tY(c,cv(q)),yB=q=>o[1]+c.b+g.bY(c,cv(q)),inC=q=>Math.abs(q[0]-X)<c.a*.97&&q[1]>yT(q[0])+2.5&&q[1]<yB(q[0])-1.5,
    span=R=>{const hw=g.W/2*Math.abs(Math.sin(th));return Math.min(R[0][0],R[1][0])-hw>=X-c.a+8&&Math.max(R[0][0],R[1][0])+hw<=X+c.a-8},
    span0=R=>{const hw=g.W/2*Math.abs(Math.sin(th));return Math.min(R[0][0],R[1][0])-hw>=X-c.a&&Math.max(R[0][0],R[1][0])+hw<=X+c.a},
    /* (one that hangs beneath it hangs under its flat underside, half a pixel in from where each round end begins, never under
       an end that has already turned up, where it would read as past the pad) */
    spanB=R=>{const hw=g.W/2*Math.abs(Math.sin(th));return Math.min(R[0][0],R[1][0])-hw>=X-c.a+c.rL*c.h+.5&&Math.max(R[0][0],R[1][0])+hw<=X+c.a-c.rR*c.h-.5};
   /* the stem ending at x=xe, lifted by t from just under the rim (0) to where its blade crosses the rim three tenths along
      (1); its start inside the cushion, joined to the nearest point of the wood under it behind the foliage */
   const at=(xe,t)=>{const lo=yB(xe)+1,hi=yB(xe+u[0]*(GB_PET+.3*g.L))-u[1]*(GB_PET+.3*g.L),E=[xe,lo+(Math.min(lo,hi)-lo)*t],S0=[xe-u[0]*st,E[1]-u[1]*st];
    let i=-1,bd=1e9;for(let ii=Math.max(1,Wh.lo);ii<C.length;ii++){const d=Math.hypot(C[ii][0]-S0[0],C[ii][1]-S0[1]);if(d<bd){bd=d;i=ii}}return {i,S:C[i],E,S0,m:[E[0]+u[0]*r,E[1]+u[1]*r]}};
   const ok=(p,sp)=>{if(p.i<0||!inC(p.S0)||Math.hypot(p.E[0]-p.S[0],p.E[1]-p.S[1])>.5*g.Hc-.5)return false;for(let f=.25;f<1;f+=.25)if(!inC([p.S[0]+(p.S0[0]-p.S[0])*f,p.S[1]+(p.S0[1]-p.S[1])*f]))return false;const R=rib(p.m,th);return (sp||span)(R)&&!ribs.some(b=>gbSegD(R[0],R[1],b[0],b[1])<g.W+1)};
   /* where: under the cushion (a crown's outer half), as far over the rim as it lies a blade's width clear of every other
      leaf, near its share of the way out (one at three fifths, more spread from three quarters in); else, as before, a step
      in from the wood's end for each, from the wood itself */
   const vt=pk?2:n===1?.6:.75-.5*j/(n-1);
   /* (below: the twig's run four pixels under the cushion's lowest underside; it leaves the wood at least six pixels in from
      the leaf and no more than about four fifths of a leaf, so it never runs out under the pad as a bare wire, at the point
      nearest the leaf whose twig neither crosses that wood nor lies more than a quarter under a
      cushion, and neither the stem nor the blade touches the wood or a cushion, nor runs past the cushion's ends) */
   const inK=(p,m)=>g.cs.some(cc=>{const Xk=o[0]+cc.x,v=Math.max(-1,Math.min(1,(p[0]-Xk)/cc.a));return Math.abs(p[0]-Xk)<cc.a+m&&p[1]>o[1]+cc.b+g.tY(cc,v)-m&&p[1]<o[1]+cc.b+g.bY(cc,v)+m}),
    onW=(p,m)=>C.some((q,ii)=>Math.hypot(q[0]-p[0],q[1]-p[1])<(Wh.w[ii]||2)/2+m);
   const below=(xs,cap,sp)=>{const wJ=1.3,yR=o[1]+c.b+4+wJ/2,E0=[xs,yR+wJ/2-.35],E=[xs+u[0]*10,E0[1]+u[1]*10],m=[E[0]+u[0]*r,E[1]+u[1]*r],R=rib(m,th);
    if(g.crown&&(m[0]-X)*Wh.dir<=.5||!sp(R)||ribs.some(b=>gbSegD(R[0],R[1],b[0],b[1])<g.W+1))return null;
    for(let f=0;f<=1.001;f+=.1){const p=[E0[0]+(R[1][0]-E0[0])*f,E0[1]+(R[1][1]-E0[1])*f];if(inK(p,1.5)||onW(p,1+(f*(10+g.L)>10?g.W/2:0)))return null}
    let best=null;for(let ii=C.length-1;ii>=Math.max(1,Wh.lo);ii--){const S=C[ii],dx=(xs-S[0])*Wh.dir;if(dx<6)continue;if(dx>cap)break;
     const dy=yR-S[1],d=Math.min(.6*dx,Math.max(3,1.3*Math.abs(dy))),K=[S[0]+Wh.dir*d,yR],J=[xs+Wh.dir*.5,yR];
     const run=gbResample([...gbBez([S,[S[0]+Wh.dir*d*.35,S[1]+dy*.75],[K[0]-Wh.dir*d*.3,yR],K],8),J],Math.max(4,Math.round(dx/2)));
     const w0=Math.min(2.2,Math.max(1.6,.45*(Wh.w[ii]||3))),lim=(Wh.w[ii]||3)/2+2,far=run.filter(p=>Math.hypot(p[0]-S[0],p[1]-S[1])>lim);
     if(far.some(p=>onW(p,.6))||run.some(p=>Math.abs(p[0]-X)>c.a))continue;const hid=run.filter(p=>inK(p,0)).length/run.length;if(hid>.25)continue;
     best={i:ii,S,run,w0};break}
    if(!best)return null;const stem=gbBez([E0,[E0[0]+u[0]*3.3,E0[1]+u[1]*3.3],[E0[0]+u[0]*6.6,E0[1]+u[1]*6.6],E],5),nr=best.run.length;
    return {i:best.i,S:best.S,E,S0:best.S,m,run:best.run,rw:best.run.map((_,jj)=>best.w0+(wJ-best.w0)*jj/(nr-1)),stem,sw:stem.map((_,jj)=>1.2-.25*jj/(stem.length-1))}};
   let q=null,qs=-1e9;const bel=(cap,sp,v0,dv)=>{for(let v=v0;v<=1.001;v+=dv||g.L/(4*c.a)){const p=below(X+Wh.dir*v*c.a,cap,sp);if(!p)continue;const sc=-Math.abs(v-vt)*c.a/g.L;if(sc>qs){qs=sc;q=p}}},fd=pk?.25/c.a:g.L/(12*c.a),sB=pk===2?span0:spanB;bel(Math.max(14,.8*g.L),sB,g.crown?.1:-.3,pk?fd:0);
   const rim=(v0,v1,dv,sp,ts)=>{for(let v=v0;v<=v1;v+=dv){const xe=X+Wh.dir*v*c.a;for(const t of ts||[1,.75]){const p=at(xe,t);if(!ok(p,sp)||g.crown&&(p.m[0]-X)*Wh.dir<=0)continue;const sc=t-.05*Math.abs(v-vt)*c.a/g.L;if(sc>qs){qs=sc;q=p}break}}};
   /* (where there is no room for that, beneath it on a longer run under its flat underside, from as far in as its other end
      where it must (a crown's still hanging out from its middle), a finer step at a time; else beneath it anywhere inside its ends: a phone's small
      crown, where two failures share one crest) */
   /* (or, where no twig can run out to it, on its stem straight off the wood under the cushion where that wood shows: the
      stem leaving the wood's underside clear of every cushion, the leaf no further under the cushion than a leaf's length) */
   const hangW=sp=>{const lowY=o[1]+c.b;for(let ii=Math.max(1,Wh.lo);ii<C.length;ii++){const S=C[ii],wS=Wh.w[ii]||2,E0=[S[0],S[1]+wS/2-.35],v=(S[0]-X)*Wh.dir/c.a;if(inK(E0,2))continue;
     const E=[E0[0]+u[0]*10,E0[1]+u[1]*10],m=[E[0]+u[0]*r,E[1]+u[1]*r],R=rib(m,th),nr=[-u[1],u[0]],top=Math.min(m[1]-Math.abs(u[1])*g.L/2,m[1]-Math.abs(nr[1])*g.W/2);
     if(top-lowY>g.L-.5||g.crown&&(m[0]-X)*Wh.dir<=.5||!sp(R)||ribs.some(b=>gbSegD(R[0],R[1],b[0],b[1])<g.W+1))continue;
     let cl=true;for(let f=0;f<=1.001&&cl;f+=.05){const p=[E0[0]+(R[1][0]-E0[0])*f,E0[1]+(R[1][1]-E0[1])*f];if(Math.hypot(p[0]-E0[0],p[1]-E0[1])<2)continue;if(inK(p,1.5)||onW(p,1+(f*(10+g.L)>10?g.W/2:0)))cl=false}
     if(!cl)continue;const sc=-Math.abs(v-vt)*c.a/g.L-(top-lowY)/g.L;if(sc>qs){qs=sc;q={i:ii,S:E0,E,S0:E0,m}}}};
   let lv=pk===2?3:0;if(!q){lv=Math.max(lv,1);bel(1e9,sB,-.88,fd)}if(!q){lv=pk===2?4:2;hangW(sB)}if(!q){lv=3;bel(1e9,span0,-.88,fd)}if(!q){lv=4;hangW(span0)}
   /* (only where nothing can hang beneath it, on its rim; where the cushion's ends leave no room there, further in, a finer
      step at a time, a crown's leaf still out from its middle; else well over it, anywhere inside its ends) */
   if(!q){lv=5;rim(g.crown?.1:-.3,.88,g.L/(4*c.a))}if(!q)rim(-.88,(g.crown?.1:-.3)-1e-6,g.L/(12*c.a));if(!q)rim(-.88,.88,g.L/(12*c.a),span0,[1,.75]);
   /* (else from the wood itself; a leaf that then hangs clear beneath its cushion does so on a stem of ten pixels) */
   if(!q){lv=6;const tx=C[C.length-1][0]-Wh.dir*(.12*g.L+j*sp);let i=C.length-1;while(i>Wh.lo&&(C[i][0]-tx)*Wh.dir>0)i--;const S=C[i],put=l=>{const E=[S[0]+u[0]*l,S[1]+u[1]*l];return {i,S,E,S0:S,m:[E[0]+u[0]*r,E[1]+u[1]*r]}};
    q=put(st);const R=rib(q.m,th),inn=p=>Math.abs(p[0]-X)<c.a&&p[1]>yT(p[0])&&p[1]<yB(p[0]);let n0=0;for(let f=0;f<=1.001;f+=.1)if(inn([R[0][0]+(R[1][0]-R[0][0])*f,R[0][1]+(R[1][1]-R[0][1])*f]))n0++;if(!n0)q=put(10)}
   return {q,th,u,st,lv}};
  /* and set there */
  const set1=(x,P)=>{const {q,th,u,st}=P,{i,S,E,S0}=q;ribs.push(rib(q.m,th));
   g.slot.set(x.id,[E[0]+u[0]*r-o[0],E[1]+u[1]*r-o[1],th*180/Math.PI,1,1]);if(q.run){const rr={k,pts:q.run,w:q.rw,bi:i,hang:1,sec:x.id};out.push(rr,{id:x.id,k,pts:q.stem,w:q.sw,bi:q.run.length-1,c:rr,hang:1});return}
   const stem=gbBez([S0,[S0[0]+u[0]*st*.33,S0[1]+u[1]*st*.33],[S0[0]+u[0]*st*.66,S0[1]+u[1]*st*.66],E],6);
   const pts=Math.hypot(S0[0]-S[0],S0[1]-S[1])>.5?[...gbBez([S,[S[0]+(S0[0]-S[0])*.3,S[1]+(S0[1]-S[1])*.6],[S0[0]-u[0]*2,S0[1]-u[1]*2],S0],4),...stem.slice(1)]:stem;
   out.push({id:x.id,k,pts,w:pts.map((_,jj)=>1.9-.8*jj/(pts.length-1)),bi:i,hang:1})};
  /* each in turn at its own angle (thirty-three to forty-three degrees), or, where that leaves it no room beneath the
     cushion's flat underside, as steep or as shallow as a stem may hang; and where one still finds none, the cushion's
     failures set the other way round, if that hangs them better */
  const lay=(ord,fa,pk)=>{let worst=0;for(const j of ord){const x=c.hang[j];let P=null;for(const f of pk?[ord.indexOf(j)?44:31]:fa?[fa]:[33+10*gbHash('hg:'+x.id),44,31]){const t=place1(x,j,f,pk);if(!P||t.lv<P.lv)P=t;if(P.lv<=2)break}worst=Math.max(worst,P.lv);set1(x,P)}return worst};
  /* (and where they still crowd each other off it, all of them as steep as a stem may hang, which sets them closest; else
     packed from the outside in, each as far out as it hangs clear of the last, a fraction of a pixel at a time: the first
     as shallow as a stem may hang, the rest as steep, which lets each lie closest under the one before; and last so packed
     anywhere beneath it inside its ends, as a phone's small crown may need) */
  const r0=ribs.length,o0=out.length,ord=c.hang.map((_,j)=>j),rv=ord.slice().reverse();let w=lay(ord);
  if(w>2&&n>1)for(const [od,fa,pk] of [[rv,0],[ord,44],[rv,44],[ord,0,1],[ord,0,2]]){const a={r:ribs.splice(r0),o:out.splice(o0),s:c.hang.map(x=>g.slot.get(x.id))},w2=lay(od,fa,pk);
   if(w2<w){w=w2;if(w<=2)break}else{ribs.splice(r0);out.splice(o0);ribs.push(...a.r);out.push(...a.o);c.hang.forEach((x,jj)=>g.slot.set(x.id,a.s[jj]))}}});
 g.drop=Math.max(4,...[...g.slot.values()].filter(sl=>sl[4]).map(sl=>sl[1]+g.L/2+2));return out}
/* Chaikin's corners, so a route through the wood bends like sap, not like a circuit trace. */
function gbSmooth(pts,k){let p=pts;for(let it=0;it<(k||2);it++){if(p.length<3)return p;const o=[p[0]];for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1];o.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75])}o.push(p[p.length-1]);p=o}return p}
/* Inline code in a title, set in mono without its backticks. */
const gbBT=String.fromCharCode(96);
function gbRich(el,line){const parts=String(line).split(gbBT);if(parts.length<2){el.textContent=line;return el}parts.forEach((t,i)=>{if(t)el.append(i%2?sv('tspan',{class:'code'},t):document.createTextNode(t))});return el}
const gbPlain=t=>String(t||'').split(gbBT).join('');

/* One tree, in its own coordinates: soil at y=0, the trunk planted at x=0, about H tall, its first branch to side S.
   Proportions are a bonsai's: the trunk about a sixth as wide as the tree is tall, the first branch at a third of the
   height on the outside of a bend, branches alternating and shortening upward, the apex back over the roots. A branch
   is a journey. When fewer than two journeys branch, the headline journey's own failure and guard paths grow as its
   first branches, so a one-journey change is still a whole tree and every pad stands for something real. */
function gbTree(M,js,H,S,key,sap,strict,dmin){const U=M.U;const nc=j=>M.leaves[j.id]?M.crit(j).size:0,nl=j=>(M.leaves[j.id]||[]).length;
 /* the headline journey is the crown; of the others, the one with the most scenarios grows lowest */
 const big=(a,b)=>nl(b)-nl(a)||nc(b)-nc(a)||M.weight(b)-M.weight(a)||(a.id<b.id?-1:1);
 const apex=js.length===1?js[0]:gbHead(M,js);const A=sap?[]:(M.leaves[apex.id]||[]);
 const items=js.filter(j=>j!==apex).sort(big).map(j=>({id:j.id,j,pol:null,w:M.weight(j)}));
 /* a change with a single journey grows that journey's failures and guards as branches. With two, the other journey's
    branch leaves one side of the trunk bare, so the headline journey's larger group of them (its guards or its failures)
    grows there as a short branch of its own: the canopy is a whole triangle and that side carries data, not a filler
    limb. With three or more, every branch is a journey and a journey's failures sit under its own pad */
 const maxV=js.length===1?2:js.length===2?1:0;let left=A.length,nv=0;const nP=p=>A.filter(x=>gbPol(x)===p).length;
 for(const p of js.length===2?['failure','guard'].sort((a,b)=>nP(b)-nP(a)):['failure','guard']){if(nv>=maxV)break;const n=A.filter(x=>gbPol(x)===p).length;if(n&&n<left){left-=n;nv++;items.push({id:apex.id+'~'+p,j:apex,pol:p,w:Math.max(.6,M.weight(apex)*n/A.length)})}}
 const m=items.length,lit=!m;const vp=new Set(items.filter(it=>it.pol).map(it=>it.pol));
 const carry={};for(const j of js)for(const id of j.units)if(!U[id].root)carry[id]=(carry[id]||0)+1;
 const ownOf=j=>j.units.filter(id=>!U[id].root&&carry[id]===1);
 const depth=id=>{let s=0,n=0;for(const j of js){const i=j.units.indexOf(id);if(i>=0){s+=i/Math.max(1,j.units.length-1);n++}}return n?s/n:0};
 const ownA=apex.units.filter(id=>!U[id].root&&carry[id]===1).sort((a,b)=>depth(b)-depth(a));
 /* The branch of the headline journey's refusals or failures grows from the knot where most of its scenarios break (the
    hop the run says broke) or, where none broke, end (the last hop of their route): its height and collar are that knot's,
    and it leaves on the outside of the trunk's bend there. Its knot stands where the headline journey's own parts would set
    it on the upper trunk, deepest lowest, above the other journeys' branches; as the tree's first branch it stands where a
    first branch does, its knot with it. One branch to a knot; one whose knot is shared, or a root, takes a height as any other branch. The
    other branches fill the remaining heights, heaviest lowest. */
 const endOf=x=>{const w=gbWound(M,apex,x),ix=apex.units.indexOf(x.unit),real=apex.units.filter(id=>!U[id].root);return w||(x.scenarioKind!=='happy'&&ix>=0?x.unit:real[real.length-1])};
 const anc=items.map(it=>{if(!it.pol)return null;const n=new Map();for(const x of A)if(gbPol(x)===it.pol){const e=endOf(x);n.set(e,(n.get(e)||0)+1)}let a=null,an=0;for(const [id,c] of n)if(c>an){a=id;an=c}return a&&ownA.includes(a)?a:null});
 anc.forEach((a,i)=>{if(a&&anc.indexOf(a)<i)anc[i]=null});
 /* (a lone branch stands a little under halfway up, so a small tree's canopy, from the crown's top to the cushion's underside, is
    about three fifths of its height, as a grown tree's is) */
 let h1=m>=7?.27:m===1?.46:.31;const lad=[];for(let i=0,h=h1;i<m;i++){lad.push(h);h+=(.86-h)*.4}
 const hs=items.map(()=>0);{let q=0;items.forEach((it,i)=>{if(!anc[i])hs[i]=lad[q++]});const npH=hs.filter((h,i)=>!anc[i]),n=ownA.length,lo0=npH.length?Math.max(...lad)+.06:.35;
  let floor=npH.length?Math.max(...npH)+.12:null;
  for(const i of items.map((_,i)=>i).filter(i=>anc[i]).sort((a,b)=>ownA.indexOf(anc[a])-ownA.indexOf(anc[b]))){const ix=ownA.indexOf(anc[i]),t=n===1?(lo0+.85)/2:lo0+(.85-lo0)*ix/(n-1);
   hs[i]=floor===null?h1:Math.min(.72,Math.max(floor,t));floor=hs[i]+.2}}
 const ord=items.map((_,i)=>i).sort((a,b)=>hs[a]-hs[b]),side=items.map(()=>S);ord.forEach((i,r)=>{side[i]=r%2?-S:S});const back=items.map((_,i)=>m>=3&&ord.indexOf(i)%3===2);
 /* the bare wood a branch shows before its pad: room for each of its own parts' knots, about a knot's length apart */
 const bare=it=>it.pol?Math.max(.025*H,14):Math.max(.025*H,10+19*Math.min(4,ownOf(it.j).length));
 /* Pads first, each as wide as the leaves it holds. Then the trunk is as tall as the pads need: the leader runs into the
    crown, whose underside clears the highest pad below it, so there is no bare pole and no pad sits on another. */
 const leavesOf=pd=>pd.pol?A.filter(x=>gbPol(x)===pd.pol):pd.crown?A.filter(x=>!vp.has(gbPol(x))):(M.leaves[pd.jid]||[]);
 const padList=[{id:apex.id,jid:apex.id,pol:null,crown:true,i:-1,b:null},...items.map((it,i)=>({id:it.id,jid:it.j.id,pol:it.pol,crown:false,i,b:null}))];
 /* one rule sizes every cushion on the tree: the size the most crowded of them needs to hold its leaves apart, so a bigger
    cushion always means more scenarios; the crown's shoulders reach out on the side away from the first branch, so the
    canopy balances over the roots */
 const pgeo=(pd,K)=>gbPadGeo(pd.leaves,H,pd.crown?(m?-S:0):side[pd.i],gbHash('pad:'+key+':'+pd.id),pd.crown,K,pd.pol,M.lmin,!M.nw);
 for(const pd of padList)pd.leaves=leavesOf(pd);
 const cpd=padList[0];
 const sizePads=()=>{for(const pd of padList)pd.geo=pgeo(pd,0);
 /* The canopy is a scalene triangle, the lowest branch the heaviest and the apex the lightest. Each pad is as wide as its
    leaves ask, clamp(n x 1.6 leaves, 3.2, 12 leaves) (two pitches of eight tenths of a leaf each), times its tier: 1 at the lowest branch, .7 at the apex; never narrower
    than holds its leaves. Then no pad is wider than the one below it (where the upper one is wider than its tier asks, to
    hold its leaves, the lower grows to match), nor (beside a desktop tree) is any of its cushions wider than the widest
    cushion of a pad below it, the apex is at most three quarters across the widest pad below it, and the
    crown's crest is at most three quarters across the widest cushion below it (the pad with that cushion grows to match, and those under it with it). A pad's
    width is linear in its size, so each is drawn at the size that gives it its width. */
 if(m){const hOf=pd=>pd.crown?1:hs[pd.i],hLo=Math.min(...padList.map(hOf)),up=padList.slice().sort((a,b)=>hOf(b)-hOf(a)),tier=pd=>1-.3*(hOf(pd)-hLo)/((1-hLo)||1);
  const want=pd=>{const L=pd.geo.L,n=pd.geo.cs.reduce((a,c)=>a+c.ids.length,0);return Math.max(3.2*L,Math.min(12*L,n*1.6*L))*tier(pd)};
  const fit=new Map(padList.map(pd=>[pd,{k:pd.geo.need,PW:pd.geo.PW}])),wd=new Map(padList.map(pd=>[pd,Math.max(want(pd),pd.geo.PW)]));
  const ca=pd=>Math.max(...pd.geo.cs.map(c=>c.a));
  for(let it=0;it<8;it++){for(let q=1;q<up.length;q++)wd.set(up[q],Math.max(wd.get(up[q]),wd.get(up[q-1])));
   if(up.length>1){const lo=up[up.length-1],w0=wd.get(up[0]),wm=Math.max(...up.slice(1).map(pd=>wd.get(pd)));if(w0>.75*wm)wd.set(lo,Math.max(wd.get(lo),w0/.75*1.002))}
   for(const pd of padList){const f=fit.get(pd);pd.geo=pgeo(pd,f.k*wd.get(pd)/f.PW)}
   /* (and beside a desktop tree, cushion by cushion, from the top down: no pad's widest cushion is wider than the widest
      of a pad under it, the lower growing to match; a phone's narrow tree has no room to widen its lower pads) */
   let ok=true,mx=0;if(!M.nw)for(const pd of up){const a=ca(pd);if(a<mx*.999){wd.set(pd,wd.get(pd)*mx/a*1.002);ok=false}mx=Math.max(mx,a)}
   const c0=cpd.geo.cs.find(c=>c.role==='crest'),bm=Math.max(0,...padList.slice(1).flatMap(pd=>pd.geo.cs.map(c=>c.a)));
   if(c0&&c0.a>.75*bm){const lo=up.slice(1).reduce((a,pd)=>ca(pd)>ca(a)?pd:a);wd.set(lo,wd.get(lo)*c0.a/(.75*ca(lo))*1.002);ok=false}
   if(ok)break}}};sizePads();
 let crc,gap,inC,lift;
 /* the crown clears the pads below it; when it stands clear of them to the side it need only rise above their middle, so the
    upper trunk is not a bare pole (tried first, and kept only if nothing then overlaps) */
 const clear=pd=>pd.geo.PH*(strict?1:.5)+pd.geo.L*(strict?.75:0)+gap+inC+lift;
 const needOf=()=>{crc=cpd.geo.cs.find(c=>c.role==='crest');gap=.022*H;inC=.32*crc.h-crc.bot-.035*H;lift=.02*H+6;let need=lit?.84*H:m<=1?.22*H:m<=2?.27*H:.38*H;
 if(!lit){for(const pd of padList.slice(1))if(!back[pd.i])need=Math.max(need,clear(pd)/(1-hs[pd.i]));
  for(let i=0;i<m;i++)for(let j=i+1;j<m;j++)if(side[i]===side[j]&&!back[i]&&!back[j]){const a=hs[i]<=hs[j]?i:j,c=a===i?j:i;need=Math.max(need,(padList[a+1].geo.PH+padList[c+1].geo.drop+gap)/((hs[c]-hs[a])||.01))}
  /* and no branch reaches further from the trunk than about two thirds of the tree's height (to the top of its crown): a
     long journey makes a taller tree, not a longer whip */
  for(const pd of padList.slice(1))if(!back[pd.i])need=Math.max(need,(bare(items[pd.i])+pd.geo.PW)/.62-.6*cpd.geo.PH)}
 return need};let need=needOf();
 /* the wood is sized from the data: the trunk's girth from how many scenarios the tree carries, so a handful of leaves stands
    on a slender trunk, and the trunk at least about twelve girths tall, so a small tree grows tall and light, never squat
    (from the leaf's own size, not the larger one a phone may give it). Never under an eighth of its pot's length (dmin, from
    gbLayout once the pot is chosen), so the pot never dwarfs it */
 const nL=js.reduce((a,j)=>a+nl(j),0),Dd=Math.max(dmin||0,cpd.geo.L0*Math.max(1,Math.min(3,.45*Math.sqrt(nL))));
 /* (a phone's larger leaves make larger pads than the drawing's height allows for: there the trunk grows as tall as they need;
    and a trunk thickened for its pot grows as tall as twelve of its girths, whatever the drawing's height) */
 /* (a crown in tiers stands its crest on its riser above its shoulders: the trunk grows that much taller, so the shoulders
    take no room from the upper trunk's knots) */
 const tl=cpd.geo.cs.some(c=>c.hap)?Math.max(0,-crc.bot):0;
 /* (and a trunk grown taller than its leaves alone would make it thickens with it: never more than fourteen girths tall, so
    with its flare its foot is at least a ninth of its height and it never reads as a pole; a phone's trunk, grown taller for
    its larger leaves, keeps the girth the drawing's height gives it) */
 const htOf=need=>Math.max(M.lmin?need:0,Math.min(.92*H+tl,sap?need:Math.max(need,12.5*Dd+tl)),sap||!dmin?0:12.1*Dd+tl);
 let Ht=htOf(need);
 /* (and a crest raised on its riser over its shoulders takes the room it needs at the top from the bare trunk under the
    lowest branch, not by making the tree taller: every branch, and the knots between them, keeps its place under the crown,
    and the trunk below the lowest branch is that much shorter, never under a fifth of the tree's height or three and a half
    girths, nor so short that the parts every journey shares, whose knots stand there, fit fewer knots than before, nor the
    trunk under twelve and a half girths) */
 if(tl>0&&!lit&&!sap&&m&&!M.lmin){const Hf=Ht,nc=Object.keys(carry).filter(id=>carry[id]>1).length,kt=Math.max(21,1.1*Dd),n0=Math.floor((Math.max(.16,h1-.05)-.09)*Hf/kt)+1,
   core=nc>1?(Math.min(nc,n0)-1)*kt+.14*(Hf-tl)+6:0,cut=Math.min(tl,Hf-12.5*Dd,Math.min(...hs)*Hf-Math.max(.2*(Hf-tl),3.5*Dd,core));
  if(cut>1){Ht=Hf-cut;for(let i=0;i<m;i++)hs[i]=(hs[i]*Hf-cut)/Ht;h1=(h1*Hf-cut)/Ht;sizePads();Ht=Math.max(Ht,needOf())}}
 const D=sap?Ht*.05:Math.max(Dd,Math.min(Ht,M.lmin?.92*H+tl:Ht)/14);
 let cp;if(lit)cp=[[0,0],[.07,0],[.3,.1*S],[.62,-.03*S],[1,.12*S]];
 else{const mv=Math.min(1.5,H/Ht);cp=[[0,0],[.07,0],[h1*.55,-.02*S]];let last=-1;ord.forEach(i=>{if(back[i])return;cp.push([hs[i],side[i]*.05*Math.pow(1-hs[i],.7)*mv]);last=i});
  /* with one or two branches the apex leans a little away from the first, so the tree's mass stays over its roots: the
     crown's middle within about a tenth of the trunk's height of the nebari */
  /* and above it the leader keeps moving, in bends that shrink toward the top, so the upper trunk is never a straight pole */
  if(last>=0&&hs[last]<.8){const h0=hs[last],q=1-h0;cp.push([h0+q*.32,-side[last]*.03*mv]);if(q>.32)cp.push([h0+q*.66,side[last]*.012*mv])}cp.push([1,m<=2?-S*.035:.008*S])}
 const tp=gbResample(gbSpline(cp.map(([t,x])=>[x*Ht,-t*Ht]),14),96);
 /* the leader runs on into its crown leaning a little away from its first branch, but never turning more than ten degrees
    from the way it was going, so it never hooks back on itself */
 {const top=tp[tp.length-1],tq=tp[tp.length-4],at=Math.atan2(top[1]-tq[1],top[0]-tq[0]),ao=Math.atan2(-.035,-S*.012),dd=Math.atan2(Math.sin(ao-at),Math.cos(ao-at)),a=at+Math.max(-.1745,Math.min(.1745,dd)),tx=Math.hypot(.012*H,.035*H);
  for(let i=1;i<=4;i++)tp.push([top[0]+Math.cos(a)*tx*i/4,top[1]+Math.sin(a)*tx*i/4])}
 const ty=tp.map(p=>-p[1]/Ht);
 const wts=items.map(it=>it.w),wA=Math.max(.5,M.weight(apex)-items.filter(it=>it.pol).reduce((a,it)=>a+it.w,0));
 const Wat=t=>{let w=wA;items.forEach((it,i)=>{w+=wts[i]*Math.max(0,Math.min(1,(hs[i]-t+.02)/.04))});return w};
 /* the trunk tapers in one continuous line from a flared base into the crown, w = w0(1 - .68t)^.85, so the leader still has
    about a third of the base's girth where it enters the crown: never a wire. Each branch takes a little of the girth with it
    (six parts in a hundred, eased over the joint), and the wood swells slightly where it leaves. */
 /* (the foot flares over the bottom seventh, smoothly, so it reads as the trunk spreading into its roots, measured where it
    shows, above the soil: one caliper up it is three quarters wider than the trunk above its flare, two calipers up a
    quarter, so it narrows by more than a third over that one caliper, and by about a third more to the seventh's top; and
    where it meets the soil it spreads once more into its roots, half as wide again as one caliper up, over less than half a
    caliper, so the foot flares at the soil, not above it; under the soil it holds the width it has there) */
 const base=t=>{const tc=Math.min(1,Math.max(0,t));return lit?(.3+.7*Math.pow(Math.max(0,1-t),1.05)):Math.pow(1-.68*tc,.85)},s0=9,fP=1.7,fX=Math.log(3)/(Math.pow(2,fP)-1),fL=D/Math.pow(fX,1/fP),fA=.75*Math.exp(fX),fS=.45*D,fF=t=>{const z=Math.max(0,t*Ht-s0);return 1+fA*Math.exp(-Math.pow(z/fL,fP))+.27*Math.exp(-Math.pow(z/fS,2))};
 const Tw=t=>{let w=D*base(t);
  if(!lit)for(const h of hs){const u=Math.max(0,Math.min(1,(t-h)/.05));w*=1-.06*u*u*(3-2*u)}
  for(const h of hs)w*=1+.05*Math.exp(-Math.pow((t-h-.006)/.025,2));w*=fF(t);if(t>1)w*=Math.max(.5,1-(t-1)*5);return Math.max(1.6,w)};
 const tw=ty.map(Tw);
 /* A branch leaves the trunk at a third of its width or less, carries its own parts as knots on the bare wood before its
    pad, and runs on under the pad, where three to five branchlets fork up into the foliage they carry. */
 const br=items.map((it,i)=>{const h=hs[i],dir=side[i];const k=gbNear(ty,h);const P0=tp[k],Tk=tw[k];const pd=padList[i+1],g=pd.geo;
  /* a branch leaves at about four tenths of the trunk's girth there (never under .36 of it or over .45, the heavier journey
     the thicker): that is its girth where it meets the trunk, its collar, and it holds it for a caliper and a half of its own
     past the trunk's side (a refusals' branch, short and high on a thinner trunk, on out under its pad to where its first
     twigs fork from it, under its inner cushion, so it never reads as a wire); only then it tapers, fastest there, along the
     rest of its run to about .15 of the trunk's girth in its pad, never to a thread */
  const b=Tk*Math.max(.3601,Math.min(.45,.45*Math.sqrt(it.w/Wat(h-.04))));
  const inner=Tk/2+(back[i]?.03*H:bare(it));
  /* the branch runs out under its pad and ends inside its outer cushion, so the foliage is held by wood all the way out and
     no wood pokes out past it */
  const cl=g.cs[g.cs.length-1],R=inner+cl.u+(cl.seat===null&&cl.hang.length?.6*cl.a:0),rise=back[i]?.34:.08+.05*h,dr=back[i]?-.06:.07*(1-h);
  const rb=gbRng(gbHash(key+':bend:'+it.id));const b1=back[i]?0:.04+.04*rb(),b2=back[i]?0:.05*rb();
  const cpb=back[i]?[P0,[P0[0]+dir*.3*R,P0[1]+dr*R],[P0[0]+dir*.66*R,P0[1]+dr*.3*R],[P0[0]+dir*R,P0[1]-rise*R]]
   :[P0,[P0[0]+dir*.22*R,P0[1]+(dr+b1)*R*.9],[P0[0]+dir*.5*R,P0[1]+(dr*.4-b2)*R],[P0[0]+dir*.76*R,P0[1]-rise*R*.45+b1*R*.3],[P0[0]+dir*R,P0[1]-rise*R]];
  const ph=gbRng(gbHash(key+':'+it.id))()*6.28;const raw=back[i]?gbBez(cpb,44):gbResample(gbSmooth(cpb,3),44);
  const pts=raw.map((q,ii)=>{const t=ii/44,n=gbNorm(raw,ii),d=.012*R*Math.sin(t*7+ph)*Math.sin(t*Math.PI);return[q[0]+n[0]*d,q[1]+n[1]*d]});
  const cx0=P0[0]+dir*(inner+g.PW/2),xIn=Math.min(...g.cs.filter(c=>c.seat!==null).map(c=>(cx0+c.x-P0[0])*dir-.66*c.a),inner+g.PW/2);
  const wOf=a=>{const l=a[a.length-1],iIn=pts.findIndex(q=>(q[0]-P0[0])*dir>=xIn),d0=Math.min(.6*l,Math.max(Tk/2+1.5*b,it.pol&&iIn>0?a[iIn]:0)),run=Math.max(1,l-d0),end=.15*Tk;return a.map(d=>{const v=Math.max(0,Math.min(1,(d-d0)/run));return Math.max(2.5,end+(b-end)*Math.pow(1-v,1.3))})};
  let acc=gbLen(pts),len=acc[acc.length-1],w=wOf(acc);
  /* Each cushion sits on ramified wood: the branch runs out under every cushion it carries, its top seven pixels under the
     cushion's lowest edge, and two or three forked twigs rise from it into the foliage between, the leaves' own twigs
     among them; its own end turns up into the outer cushion and ends inside it, so the foliage is held by wood all the way out,
     never on posts. A crest with shoulders stands clear above them on its riser. */
  const GT=7,cx=P0[0]+dir*(inner+g.PW/2),tip=pts[pts.length-1];const near=X=>{let ii=1,bd=1e9;for(let jj=1;jj<pts.length;jj++){const dd=Math.abs(pts[jj][0]-X);if(dd<bd){bd=dd;ii=jj}}return ii};
  let oy=tip[1];const dys=g.cs.map(c=>{if(c.seat===null)return 0;const ii=near(cx+c.x);return pts[ii][1]-w[ii]/2-GT-(oy+c.b)});oy+=g.seat(dys);const o=[cx,oy];
  if(cl.seat!==null){const x0=cx+cl.x-dir*.45*cl.a,up=tip[1]-(o[1]+cl.b-.3*cl.h),span=(tip[0]-x0)*dir;
   if(up>0&&span>1){for(const q of pts){const f=Math.max(0,Math.min(1,(q[0]-x0)*dir/span));q[1]-=up*f*f*(3-2*f)}acc=gbLen(pts);len=acc[acc.length-1];w=wOf(acc)}}
  /* A crest raised over shoulders stands on a riser: a secondary branch leaving the wood further in and rising out at about
     sixty degrees toward the crest's foot: just under the crest (its top four to nine pixels under the crest's underside) it
     forks, a thinner leader running on into the crest's foot, from which its leaves' twigs fork, and two side forks of
     unequal length curving out about twenty-five and thirty degrees either way into the crest, so the crest sits on one limb
     that ramifies under it, never on stilts. */
  const cr=g.cs.find(c=>c.role==='crest'&&c.seat===null);let rz=null;
  if(cr){
   const yb=o[1]+cr.b,E0=[o[0]+cr.x+dir*.06*cr.a,yb-.36*cr.h],ri=near(E0[0]-dir*Math.min(.62*(pts[near(E0[0])][1]-E0[1]),.6*cr.a)),S0=pts[ri],dx=E0[0]-S0[0],dy=S0[1]-E0[1];
   const rp=gbBez([S0,[S0[0]+dx*.5,S0[1]-dy*.3],[E0[0]-dx*.12,E0[1]+dy*.45],E0],14),w0=Math.max(3,w[ri]*.68);
   let jF=3;for(let j=3;j<=12;j++)if(rp[j][1]-Math.max(1.8,w0*(1-.2*j/14))/2>=yb+4.5)jF=j;const wF=w0*(1-.2*jF/14);
   rz={pts:rp,w:rp.map((_,j)=>j<=jF?Math.max(1.8,w0*(1-.2*j/14)):Math.max(1.8,wF*.72*(1-.45*(j-jF)/(14-jF)))),bi:ri,lo:rp.findIndex(q=>q[1]<yb+2),jF};
   const tF=q=>q[1]-Math.max(1.8,wF*.72)/2,fF=Math.max(0,Math.min(1,(tF(rp[jF])-yb-6)/((tF(rp[jF])-tF(rp[jF+1]))||1))),F=[rp[jF][0]+(rp[jF+1][0]-rp[jF][0])*fF,rp[jF][1]+(rp[jF+1][1]-rp[jF][1])*fF],dq=[rp[jF+1][0]-rp[jF-1][0],rp[jF+1][1]-rp[jF-1][1]],dm=Math.hypot(dq[0],dq[1])||1;
   rz.fks=[[-dir,30,.5],[dir,24,.4]].map(([sd,an,lf])=>{const a=sd*an*Math.PI/180,u=[(dq[0]*Math.cos(a)-dq[1]*Math.sin(a))/dm,(dq[0]*Math.sin(a)+dq[1]*Math.cos(a))/dm],l=lf*cr.h+(F[1]-yb),T=[F[0]+u[0]*l,F[1]+u[1]*l],
    q=gbBez([F,[F[0]+u[0]*l*.4,F[1]+u[1]*l*.4],[T[0]-u[0]*l*.25,T[1]-u[1]*l*.25-.12*l],T],10),w1=Math.max(1.5,wF*.6);
    return {pts:q,w:q.map((_,j)=>w1+(1.1-w1)*j/10),bi:fF>0?jF+1:jF,c:rz,fk:1}})}
  /* each cushion's forked twigs: off the branch under a seated one, two (three under three leaves or more, or a wide one)
     spread across where the wood's top runs four and a half to seven and a half pixels under it (where it runs lower all
     along, the stretch of it nearest), so each shows as a short fork under the cushion and never as a stilt; a raised crest's are its
     riser's forks. They are the cushion's own wood: its leaves' twigs still leave the branch (or riser) between them, and
     they go with the cushion when a mode keeps none of its leaves */
  const fk={};g.cs.forEach((c,k)=>{if(c.seat===null||!c.ids.length)return;const yl=o[1]+c.b,xc=cx+c.x,n=c.ids.length>=3||c.a>2.4*g.L?3:2,ex=b0(),V=[];
   /* (read along the wood between its points, so a short stretch at the right depth is found where the wood climbs steeply) */
   for(let ii=ex+1;ii<pts.length-1;ii++)for(let f=0;f<1;f+=.25){const p=[pts[ii][0]+(pts[ii+1][0]-pts[ii][0])*f,pts[ii][1]+(pts[ii+1][1]-pts[ii][1])*f],wi=w[ii]+(w[ii+1]-w[ii])*f,gp=p[1]-wi/2-yl;if(Math.abs(p[0]-xc)<=.66*c.a&&gp>=4.5)V.push({p,wi,ii:f?ii+1:ii,gp})}
   if(!V.length)return;let Vn=V.filter(q=>q.gp<=7.5);if(!Vn.length){const m=Math.min(...V.map(q=>q.gp));Vn=V.filter(q=>q.gp<=m+1)}Vn.sort((a,b)=>(a.p[0]-b.p[0])*dir);
   const pick=(n===2?[.15,.85]:[.08,.5,.92]).map(f=>Vn[Math.round(f*(Vn.length-1))]).filter((v,j,A)=>A.indexOf(v)===j),tf=(q,ln)=>{const pr=gbTwFork([q.p],[q.wi],0,yl,c.h,c.a,dir,ln);pr[0].bi=q.ii;return pr};
   fk[k]=pick.length>1?pick.map((q,j)=>tf(q,2*j-(pick.length-1))):[tf(pick[0],-3),tf(pick[0],3)]});
  const twigs=gbLeafTwigs(g,o,(k,hang)=>!hang&&g.cs[k]===cr&&rz?{pts:rz.pts,w:rz.w,lo:Math.max(1,rz.lo),dir}:{pts,w,lo:b0(),dir});
  for(const t of twigs){if(rz&&!t.hang&&g.cs[t.k]===cr)t.c=rz;t.at=(t.c?t.c.bi:t.bi)/(pts.length-1)}
  for(const k in fk)for(const pr of fk[k])for(const t of pr){t.k=+k;t.at=(t.c&&t.fk===1?t.c.bi:t.fk===1?t.bi:t.c.bi)/(pts.length-1)}
  twigs.unshift(...Object.values(fk).flat(2));if(rz){for(const t of rz.fks){t.k=g.cs.indexOf(cr);t.at=rz.bi/(pts.length-1)}twigs.unshift({pts:rz.pts,w:rz.w,bi:rz.bi,k:g.cs.indexOf(cr),at:rz.bi/(pts.length-1),lb:1},...rz.fks)}
  function b0(){return Math.max(1,acc.findIndex(d=>d>=Tk*.5))+2}
  return {it,j:it.j,id:it.id,pol:it.pol,i,h,dir,k,back:back[i],pts,w,len,acc,R,inner,exit:Math.max(1,acc.findIndex(d=>d>=Tk*.5)),tip:pts[pts.length-1],b,Tk,o,twigs}});
 const pads={},origin={};for(const pd of padList){pads[pd.id]=pd;if(!pd.crown){pd.b=br[pd.i];origin[pd.id]=pd.b.o}}
 /* The leader runs on into the crown and ends a third of the way up inside its crest, and the crest's leaves take their
    twigs from it. The crown's shoulders sit lower to either side, each on a branchlet the leader puts out just under it,
    rising at about forty degrees and levelling out through the cushion's foot; with no shoulders, its failures hang from a
    short branchlet through the foot of its crest, cut where no more than three tenths of it lies inside, so most of it shows. */
 const cg=cpd.geo,te=tp[tp.length-1],co=[te[0]-crc.x,te[1]+crc.h*.32-crc.b];origin[apex.id]=co;
 const ctw=[],cc=[];const leaderAt=y=>{let ki=tp.length-1;for(let ii=tp.length-1;ii>0;ii--)if(tp[ii][1]>=y){ki=ii;break}return ki};
 /* The leader never ends in a blunt cap: it tapers on into its crest and, just under the cushion's foot, forks into fine twigs
    that fan up into the foliage, the leader itself the middle one, each from about a third of its girth there down to a hair;
    the fork stands as far under the crest as a branch's twigs stand under theirs, so the crest sits on ramified wood too. */
 if(!sap){const n1=tp.length-1,yc=co[1]+crc.b,kB=Math.max(2,Math.min(n1-2,leaderAt(yc+.3*crc.h+9))),kF=Math.max(kB+1,Math.min(n1-1,leaderAt(yc+4))),wF=tw[kB],acL=gbLen(tp),aB=acL[kB];
  /* (one smooth taper, three of its girths long at least, from the foot of the crest to a round tip a hair across, never a step where the twigs fork: while the crest
     has not yet come out, the leader's end shows, and it reads as a growing shoot, not a split spike) */
  let kS=kB;while(kS>2&&acL[n1]-acL[kS]<3*tw[kS])kS--;
  const wS=tw[kS],aS=acL[kS],aN=(acL[n1]-aS)||1,wt=1.1;
  for(let i=kS+1;i<=n1;i++){const u=(acL[i]-aS)/aN;tw[i]=Math.min(tw[i],wt+(wS-wt)*(1-u*u))}
  const d0=[tp[kF+1][0]-tp[kF-1][0],tp[kF+1][1]-tp[kF-1][1]],dm=Math.hypot(d0[0],d0[1])||1,rf=gbRng(gbHash(key+':fork'));
  for(const sd of [-1,1]){const th=sd*(30+10*rf())*Math.PI/180,u=[(d0[0]*Math.cos(th)-d0[1]*Math.sin(th))/dm,(d0[0]*Math.sin(th)+d0[1]*Math.cos(th))/dm],len=crc.h*(.5+.16*rf())+9,S0=tp[kF];
   const E=[S0[0]+u[0]*len*.8,S0[1]+u[1]*len*.8-len*.25],fp=gbBez([S0,[S0[0]+u[0]*len*.4,S0[1]+u[1]*len*.4],[E[0]-u[0]*len*.1,E[1]+len*.15],E],10);
   ctw.push({pts:fp,w:fp.map((_,j)=>Math.max(1,wF*.3*(1-j/10)+j/10)),k:cg.cs.indexOf(crc),bi:kF,fork:1})}}
 cg.cs.forEach((c,k)=>{const cr=c===crc;if(cr&&!c.hang.length)return;const sd=cr?cg.d:c.sd,yb=co[1]+c.b,X=co[0]+c.x,hg=c.hang.length>1;
  /* (a shoulder's branchlet runs out level under it, its top seven pixels under the cushion's foot, and turns up into it; two
     forked twigs rise from the level stretch into the foliage, and its leaves' twigs leave the branchlet where it has risen
     into the cushion; one that hangs two failures or more turns up into it on its inner side, so its outer underside is
     clear for them, its forks rising from that inner stretch where the underside over it is still near its foot, each leant
     toward the cushion's middle as far as keeps both its tips three pixels inside the foliage) */
  let t2,ki;if(cr){ki=leaderAt(yb+9);const e=[X+sd*c.a*.62,yb+cg.bY(c,.62*sd)-3.5],a0=tp[ki],dx=e[0]-a0[0],dy=a0[1]-e[1];const F=gbBez([a0,[a0[0]+dx*.3,a0[1]-dy*.6],[e[0]-dx*.4,e[1]+dy*.05],e],120),A=gbLen(F),i0=F.findIndex(q=>q[1]<yb+cg.bY(c,Math.max(-1,Math.min(1,(q[0]-X)/c.a)))),Lc=i0>0?Math.min(A[120],A[i0]/.7):A[120];
   t2=gbResample(F.filter((_,jj)=>A[jj]<=Lc+1e-6),12)}
  else{ki=leaderAt(yb+9+11*Math.max(.7,cg.z));const a0=tp[ki],e=[X+sd*c.a*(hg?-.6:.35),yb-c.limf*c.h],m=[sd*Math.max(sd*(X-sd*(hg?.95:.2)*c.a),sd*a0[0]+8),yb+9],d1=Math.abs(m[0]-a0[0]),d2=Math.abs(e[0]-m[0]);
   t2=gbResample([...gbBez([a0,[a0[0]+sd*d1*.35,a0[1]-(a0[1]-m[1])*.85],[m[0]-sd*d1*.3,m[1]],m],10),...gbBez([m,[m[0]+sd*d2*.45,m[1]],[e[0]-sd*d2*.1,e[1]+(m[1]-e[1])*.55],e],10).slice(1)],12)}
  const w2=t2.map((_,jj)=>Math.max(1.2,tw[ki]*.55*Math.pow(1-jj/12,.9)+jj/12*1.2));
  ctw.push({pts:t2,w:w2,k,bi:ki,lb:1});cc[k]={pts:t2,w:w2,bi:ki,dir:sd,lo:Math.max(0,t2.findIndex(q=>q[1]<yb-1))};
  if(!cr){let V=[];t2.forEach((q,jj)=>{if((hg?Math.abs(q[0]-X)<c.a&&cg.bY(c,(q[0]-X)/c.a)>-2.5:Math.abs(q[0]-X)<c.a*.7)&&q[1]-w2[jj]/2>=yb+4.5)V.push(jj)});const gp=jj=>t2[jj][1]-w2[jj]/2-yb,Vn=V.filter(jj=>gp(jj)<=7.5);if(Vn.length)V=Vn;else if(V.length){const m=Math.min(...V.map(gp));V=V.filter(jj=>gp(jj)<=m+1)}
   if(V.length){const pick=[V[Math.round(.15*(V.length-1))],V[Math.round(.85*(V.length-1))]].filter((v,j,A)=>A.indexOf(v)===j);
    (pick.length>1?pick.map((jj,j)=>[jj,2*j-1]):[[pick[0],-3],[pick[0],3]]).forEach(([jj,ln])=>{let f=gbTwFork(t2,w2,jj,yb,c.h,c.a,sd,ln);for(let l=ln+.5;hg&&l<=ln+8&&!f.every(t=>{const q=t.pts[t.pts.length-1],u=(q[0]-X)/c.a;return Math.abs(u)<1&&q[1]<=yb+cg.bY(c,u)-3});l+=.5)f=gbTwFork(t2,w2,jj,yb,c.h,c.a,sd,l);for(const t of f){if(t.fk===1)t.c=cc[k];t.k=k;ctw.push(t)}})}}});
 /* the crest's leaves' twigs leave the leader inside it */
 for(const t of gbLeafTwigs(cg,co,(k,hang)=>{const c=cg.cs[k];if(c===crc&&!hang)return {pts:tp,w:tw,lo:leaderAt(co[1]+c.b-1),dir:1,gap:null};const q=cc[k];return q?{pts:q.pts,w:q.w,lo:hang?0:q.lo,dir:q.dir,gap:null}:null})){if(!t.c&&(t.hang||cg.cs[t.k]!==crc))t.c=cc[t.k];ctw.push(t)}
 const cdrop=cg.drop;
 /* Knots: parts the journeys share sit low on the trunk (most shared lowest, callee below caller); a journey's own parts sit
    on the bare wood of its branch, deepest nearest the trunk (a lone one toward the outer end of it, clear of the crotch,
    where a shoot of its own can grow; and, where the bare wood reaches that far, past the limb's first sixth, so a long limb
    under a wide pad can still put one out); the headline journey's own parts on the upper trunk. */
 /* knots keep their distance along the wood, about two of their own lengths; where more files share a stretch than fit, the
    last knot there swells into a burl that holds the rest, and its card names every one */
 /* (on the trunk a knot keeps about a girth and a quarter from the next, the girth above the foot's flare, so two bosses never
    touch and the flare spreads no knots up the trunk) */
 const knots=[],more={};const KG=21;const tacc=gbLen(tp);const KT=k=>Math.max(KG,1.25*tw[k]/fF(ty[k]));
 const onTrunk=(ids,t)=>{const k=gbNear(ty,t);knots.push({id:ids[0],ids,on:'t',k,p:tp[k],n:gbNorm(tp,k),w:tw[k],t})};
 const fitN=(t0,t1)=>{const k0=gbNear(ty,t0),k1=gbNear(ty,t1);return Math.max(1,Math.floor((tacc[k1]-tacc[k0])/KT(Math.round((k0+k1)/2)))+1)};
 const group=(list,n)=>list.length<=n?list.map(id=>[id]):[...list.slice(0,n-1).map(id=>[id]),list.slice(n-1)];
 const core=lit?[]:Object.keys(carry).filter(id=>carry[id]>1).sort((a,b)=>carry[b]-carry[a]||depth(b)-depth(a));
 const c0=.09,c1=Math.max(.16,h1-.05);group(core,fitN(c0,c1)).forEach((ids,i,a)=>onTrunk(ids,a.length===1?.16:c0+(c1-c0)*i/(a.length-1)));
 const fr=hs.filter((h,i)=>!back[i]&&!anc[i]);const shB=cc.filter(Boolean).map(q=>q.bi),hi=Math.min(lit?.74:.95,1-(inC+8+cdrop)/Ht,...shB.map(bi=>(-tp[bi][1]-.85*tw[bi]-14)/Ht)),lo=Math.min(hi-.12,lit?.1:(fr.length?Math.max(...fr)+.06:.35));
 /* (and none in the crotch of a branchlet the leader puts out for a crown's shoulder: clear of its fillet and a boss below it) */
 /* (a refusals' branch holds its knot at its collar; the parts deeper than it sit below, clear of its fillet, the rest above) */
 {const pk=br.filter(b=>anc[b.i]).sort((a,b)=>a.h-b.h);let pI=-1,pH=null,pD=0,used=0;
  for(const b of [...pk,null]){const ix=b?ownA.indexOf(anc[b.i]):ownA.length,ids=ownA.slice(pI+1,ix),dl=b?(KT(b.k)+1.5*b.b)/Ht:0;
   if(ids.length){let a=pH===null?lo+(b?.04:0):pH+pD,z=b?b.h-dl:hi;if(pk.length&&pH===null&&z-a<.04*ids.length)a=Math.max(.1,z-.05*ids.length);if(z<a)z=a=(a+z)/2;
    group(ids,Math.max(1,Math.min(5-used,fitN(a,z)))).forEach((g,i,arr)=>{used++;onTrunk(g,arr.length===1?(a+z)/2:a+(z-a)*i/(arr.length-(b?0:1)))})}
   if(b){const k=b.k;used++;knots.push({id:anc[b.i],ids:[anc[b.i]],on:'t',k,p:tp[k],n:gbNorm(tp,k),w:tw[k],t:ty[k],pin:b.dir,pinB:b.id});pI=ix;pH=b.h;pD=dl}}}
 /* never closer than that along the trunk, and none pushed into the crown: one that would be joins the burl below it */
 const kTop=gbNear(ty,hi);const tk=knots.filter(q=>q.on==='t').sort((a,b)=>a.k-b.k);
 /* (a refusals' knot holds its place at its branch's collar: the one below it gives way downward instead) */
 const kmv=(q,k)=>{q.k=k;q.p=tp[k];q.n=gbNorm(tp,k);q.w=tw[k]};
 for(let i=1;i<tk.length;i++){if(tk[i].pin){let k=tk[i-1].k;if(!tk[i-1].pin)while(k>1&&tacc[tk[i].k]-tacc[k]<KT(k))k--;if(k!==tk[i-1].k)kmv(tk[i-1],k);continue}
  let k=tk[i].k;while(k<tp.length-6&&tacc[k]-tacc[tk[i-1].k]<KT(tk[i-1].k))k++;if(k!==tk[i].k)kmv(tk[i],k)}
 for(let i=tk.length-1;i>0;i--)if(tk[i].k>kTop+2&&!tk[i].pin){tk[i-1].ids.push(...tk[i].ids);knots.splice(knots.indexOf(tk[i]),1)}
 /* and a trunk past five knots is a ladder of names: two helper files side by side on it grow together into a burl, the
    nearest pair first, until it holds five or no two helpers stand side by side (a knot that still finds no place for its
    name is a pip, gbKnotNames); the burl leads with the one that held more, and sits between them, weighted by how many
    files each held */
 {const tier=q=>gbKTier(M,q.ids),help=q=>tier(q)===3,row=()=>knots.filter(q=>q.on==='t').sort((a,b)=>a.k-b.k);let tr=row();
  while(tr.length>5){let best=null;for(let i=1;i<tr.length;i++){const a=tr[i-1],b=tr[i];if(help(a)&&help(b)&&(!best||b.k-a.k<best.b.k-best.a.k))best={a,b}}
   if(!best)break;const {a,b}=best,lead=a.pin?a:b.pin?b:a.ids.length>=b.ids.length?a:b,o=lead===a?b:a,k=lead.pin?lead.k:Math.round((a.k*a.ids.length+b.k*b.ids.length)/(a.ids.length+b.ids.length));
   lead.ids.push(...o.ids);lead.k=k;lead.p=tp[k];lead.n=gbNorm(tp,k);lead.w=tw[k];knots.splice(knots.indexOf(o),1);tr=row()}
  /* and a knot that found no place for its name beside it when this tree was drawn at this width (gbBuild) grows into the
     nearest knot of its own kind beside it on the trunk (else the nearest, but never two journeys' starts nor two collars),
     so a wide screen names every knot on the trunk beside it, never by a pip; the burl leads as above */
  for(const id of M.kfold||[]){tr=row();const o=tr.find(q=>q.ids.includes(id));if(!o)continue;const to=tier(o),i=tr.indexOf(o),ok=q=>q!==o&&!(q.pin&&o.pin)&&(to||tier(q)),
    nb=[tr[i-1],tr[i+1]].filter(q=>q&&ok(q)),x=nb.filter(q=>tier(q)===to).sort((a,b)=>Math.abs(a.k-o.k)-Math.abs(b.k-o.k))[0]||nb.sort((a,b)=>Math.abs(a.k-o.k)-Math.abs(b.k-o.k))[0];if(!x)continue;
   const tx=tier(x),lead=x.pin?x:o.pin?o:tx!==to?(tx<to?x:o):x,f=lead===x?o:x,k=lead.pin?lead.k:Math.round((x.k*x.ids.length+o.k*o.ids.length)/(x.ids.length+o.ids.length));
   lead.ids.push(...f.ids);lead.k=k;lead.p=tp[k];lead.n=gbNorm(tp,k);lead.w=tw[k];knots.splice(knots.indexOf(f),1)}}
 for(const b of br){if(b.pol)continue;const own=ownOf(b.j).sort((x,y)=>depth(y)-depth(x));const a0=Math.max(b.Tk/2+8,Math.min(.16*b.len,b.inner-8)),a1=Math.max(a0+4,b.inner-4);const fit=Math.min(4,Math.max(1,Math.floor((a1-a0)/KG)+1));
  group(own,fit).forEach((ids,i,a)=>{const d=a.length===1?a0+(a1-a0)*.7:a0+(a1-a0)*i/(a.length-1);const k=gbNear(b.acc,d);knots.push({id:ids[0],ids,on:'b'+b.i,bid:b.id,k,p:b.pts[k],n:gbNorm(b.pts,k),w:b.w[k]})})}
 /* A knot is a boss the wood grew round, not a stud sewn on it: it stands out of the outside of the wood's bend (where the
    wood runs nearly straight, on alternate sides), a quarter to two fifths of the girth off the centre line, and swells the
    outline there. Its size follows how many scenarios run through its files, with a little of its own, as no two grow alike. Two bosses nearer than a girth and a fifth grow
    together into one burl. */
 for(const q of knots)if(q.on==='t')q.t=ty[q.k];
 const nScn=id=>js.reduce((n,j)=>n+(j.units.includes(id)?(M.leaves[j.id]||[]).length:0),0)+(M.buds[id]||[]).length,maxS=Math.max(1,...knots.map(q=>q.ids.reduce((s,id)=>s+nScn(id),0)));
 const wood=q=>{if(q.on==='t')return {pts:tp,w:tw,acc:tacc,up:-S};const b=br.find(x=>x.id===q.bid);return {pts:b.pts,w:b.w,acc:b.acc,up:gbNorm(b.pts,q.k)[1]<0?1:-1}};
 const boss=(q,alt)=>{const P=wood(q),n1=P.pts.length-1,k=q.k,a=P.pts[Math.max(0,k-6)],c=P.pts[Math.min(n1,k+6)],b=P.pts[k],n=gbNorm(P.pts,k),bend=[b[0]-(a[0]+c[0])/2,b[1]-(a[1]+c[1])/2],cv=bend[0]*n[0]+bend[1]*n[1];
  q.side=q.pin?q.pin*(Math.sign(n[0])||1):Math.abs(cv)>1.2?Math.sign(cv):alt;q.p=b;q.n=n;q.w=P.w[k];q.tg=[n[1],-n[0]];q.off=q.side*(.3+.1*gbHash('kn:'+key+':'+q.id))*q.w;q.bp=[b[0]+n[0]*q.off,b[1]+n[1]*q.off];
  q.sz=Math.max(.7,Math.min(1.2,.72+.48*Math.sqrt(q.ids.reduce((s,id)=>s+nScn(id),0)/maxS)))*(q.ids.length>1?1.12:1)*(.93+.14*gbHash('ks:'+key+':'+q.id));q.ra=Math.min(7.5,q.w*.14+3.8,Math.max(2.6,q.w*.6))*q.sz;q.rb=q.ra/1.35;
  /* (a refusals' knot is its branch's collar: the boss sits just under where the branch leaves, its centre within its own
     radius and a few px of the branch's first point, so its name can leave it under the limb) */
  if(q.pin&&q.kc===undefined){q.kc=k;const dd=Math.sqrt(Math.max(0,Math.pow(q.ra+5,2)-q.off*q.off));let k2=k;while(k2>1&&tacc[k]-tacc[k2-1]<=dd)k2--;if(k2!==k){q.k=k2;boss(q,alt)}}};
 for(const on of [...new Set(knots.map(q=>q.on))]){let alt=null;const row=knots.filter(q=>q.on===on).sort((a,b)=>a.k-b.k);
  for(const q of row){if(alt===null)alt=q.on==='t'?wood(q).up:-wood(q).up;boss(q,alt);alt=-q.side}
  for(let i=1;i<row.length;i++){const a=row[i-1],b=row[i];if(Math.hypot(a.bp[0]-b.bp[0],a.bp[1]-b.bp[1])<1.2*Math.max(a.w,b.w)){const [x,y]=b.pin&&!a.pin?[b,a]:[a,b];x.ids.push(...y.ids);knots.splice(knots.indexOf(y),1);row.splice(row.indexOf(y),1);i--;boss(x,x.side)}}}
 /* a burl is named for the most important file in it: where a journey starts (the headline journey's start before any other's),
    so the hop a journey begins at is always the name on its knot */
 for(const q of knots)if(q.ids.length>1){const e=q.ids.find(id=>id===apex.entry)||q.ids.find(id=>M.J.some(j=>j.entry===id));if(e&&e!==q.ids[0]){q.ids=[e,...q.ids.filter(id=>id!==e)];q.id=e}}
 /* the outline swells over the boss on its own side, about as far as the boss stands proud of the wood */
 const bx=tp.map(()=>0);for(const b of br)b.bx=b.pts.map(()=>0);
 for(const q of knots){const P=wood(q),arr=q.on==='t'?bx:br.find(x=>x.id===q.bid).bx,amp=Math.max(1.2+q.rb*.3,Math.abs(q.off)+q.rb*.92-q.w/2+1),sg=q.ra*1.15;
  for(let j=0;j<arr.length;j++)arr[j]+=q.side*amp*Math.exp(-Math.pow((P.acc[j]-P.acc[q.k])/sg,2))}
 /* Veins: each pad's strand up the trunk's centre line, peeling off into its branch, so a running journey shows one stroke
    in the middle of its wood, never strands side by side */
 const lanes=[...br.filter(b=>b.dir<0).sort((a,b)=>a.h-b.h).map(b=>b.id),apex.id,...br.filter(b=>b.dir>0).sort((a,b)=>b.h-a.h).map(b=>b.id)];
 const veins={};for(const id of lanes){const b=br.find(x=>x.id===id);const kTop2=b?b.k:tp.length-1;
  const trunk=tp.slice(0,kTop2+1);
  veins[id]={jid:pads[id].jid,trunk,branch:b?b.pts.slice(b.exit,Math.round(.55*(b.pts.length-1))):[],pad:origin[id]}}
 if(!strict&&!lit){const bx=(pd,o)=>{const g=pd.geo;return pd.crown?[o[0]-g.PW/2-g.L*.6,o[1]-g.PH-6,o[0]+g.PW/2+g.L*.6,o[1]+g.drop+4]:[o[0]-g.PW/2-g.L*.5,o[1]-g.PH-6,o[0]+g.PW/2+g.L*.5,o[1]+g.drop+4]};
  const c=bx(cpd,origin[apex.id]);if(padList.slice(1).some(pd=>{const q=bx(pd,origin[pd.id]);return Math.min(c[2],q[2])+10>Math.max(c[0],q[0])&&Math.min(c[3],q[3])+10>Math.max(c[1],q[1])}))return gbTree(M,js,H,S,key,sap,true,dmin)}
 let x0=Infinity,x1=-Infinity,y0=0;const grow=(x,y)=>{x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y)};
 tp.forEach((q,i)=>{grow(q[0]-tw[i]/2,q[1]);grow(q[0]+tw[i]/2,q[1])});for(const b of br)b.pts.forEach(q=>grow(q[0],q[1]-b.b));
 for(const pd of padList){const o=origin[pd.id],g=pd.geo;grow(o[0]-g.PW/2-g.L*.5,o[1]-g.PH-6);grow(o[0]+g.PW/2+g.L*.5,o[1]+g.drop+4)}
 return {js,apex,items,br,tp,tw,bx,ty,pads,padList,origin,knots,more,veins,lanes,ctw,H,Ht,D,S,lit,hs,h1,x0,x1,y0,cx0:x0,cx1:x1,cy0:y0,key}}

/* The whole drawing: trees placed side by side in one pot, labels beside their pads, roots in the soil. */
function gbLayout(M,width,sap){const s=gw.state;const brn=(s.change&&s.change.branch)||'grove';const S=gbHash('side:'+brn)<.5?-1:1;const narrow=width<720;M.nw=narrow;
 /* a phone draws the tree on a canvas a quarter wider and lets the drawing scale down whole, so its proportions hold instead
    of the trunk being squashed to fit; its text is set larger to match */
 if(narrow&&!sap)width*=GB_NK;
 const trees0=sap?[{js:[{id:'sap',title:'',entry:null,units:s.units.filter(u=>!u.root).map(u=>u.id)}],leaves:0}]:M.trees;
 const main=trees0[0];const nj=main?main.js.length:1;let H0=sap?220:Math.max(300,Math.min(nj===1?780:900,width*(nj===1?.76:.86)));if(narrow)H0=Math.max(H0,width*1.3);
 /* a journey's name in at most three lines beside its pad, then its status */
 /* a pad's label: an eyebrow (journey number and where it starts, or which of its paths this is), the journey's name in
    at most three lines, or a guard or failure pad's own scenarios, then its status */
 const wrap=(title,max,nl)=>{const words=String(title||'').split(/\s+/).filter(Boolean);const lines=[''];let i=0;
  for(;i<words.length;i++){const w=words[i],l=lines[lines.length-1];if(!l||gbPlain(l+' '+w).length<=max)lines[lines.length-1]=l?l+' '+w:w;else if(lines.length<nl)lines.push(w);else break}
  if(i<words.length){let l=lines[nl-1];while(gbPlain(l).length>max-1&&l.includes(' '))l=l.slice(0,l.lastIndexOf(' '));if((l.split(gbBT).length-1)%2)l+=gbBT;lines[nl-1]=l.replace(/[\s,.;:]+$/,'')+'…'}
  for(let k=0;k<lines.length-1;k++)if((lines[k].split(gbBT).length-1)%2){lines[k]+=gbBT;lines[k+1]=gbBT+lines[k+1]}
  return lines};
 /* a journey's pad: its name in up to three lines, so it is cut only when it is very long (the whole of it is in the card); a single journey's guard or failure pad: its riskiest one, then how many more */
 /* its state can need a second line once it has run (failed, passed, no flow yet, pruned), so a pad with three or more
    scenarios keeps room for one */
 const lblOf=(title,list,n)=>{if(narrow||sap)return null;let lines;
  if(list){list=gbOrd(list);lines=wrap(list[0].title,30,3)}
  else lines=wrap(title,30,3);
  return {lines,hgt:lines.length*16+32+(n>=3?14:0),w:Math.max(...lines.map(l=>gbW(gbPlain(l),7.1)),150)+18}};
 let L=null;const Hmin=sap?0:Math.min(H0,400);let dmin=0,dr=0;
 for(let pass=0;pass<6;pass++){
  const trees=trees0.map((t,i)=>gbTree(M,t.js,i?H0*Math.max(.5,Math.min(.75,Math.sqrt((t.leaves||1)/Math.max(1,main.leaves||1)))):H0,i%2?-S:S,brn+':'+i,sap,false,i?0:dmin));
  /* label boxes, local to each tree */
  for(const T of trees){T.lbl={};for(const pd of T.padList){const j=T.js.find(q=>q.id===pd.jid);const l=pd.pol?lblOf('',pd.leaves,pd.leaves.length):lblOf(j.title,null,pd.leaves.length);const o=T.origin[pd.id],g=pd.geo,b=pd.b;
    /* on a phone the tree carries numbers, outside the canopy on a short leader */
    if(!l){if(narrow&&!sap){/* beside the pad, below its shoulder leaves, on a leader that starts outside the foliage; a one-journey tree's
      guard and failure pads get a letter (R, F) the key under the tree explains */const sd=b?b.dir:-(T.S||S),ax=o[0]+sd*(g.PW/2+3),ay=o[1]-g.PH*(b?.15:.55),bx=ax+sd*(g.L*.35+13),by=ay;(T.badge=T.badge||{})[pd.pol?'p:'+pd.id:pd.jid]=pd.pol?{x:bx,y:by,ax,ay,pid:pd.id,jid:pd.jid,pol:pd.pol}:{x:bx,y:by,ax,ay};T.x0=Math.min(T.x0,bx-12);T.x1=Math.max(T.x1,bx+12);T.y0=Math.min(T.y0,by-14)}continue}
    const n=l.lines.length;
    if(!b){const y=o[1]-g.PH-g.L*.6-13-16*n;T.lbl[pd.id]={...l,x:o[0],y,anchor:'middle',dir:0,pol:pd.pol,jid:pd.jid};T.y0=Math.min(T.y0,y-30);T.x0=Math.min(T.x0,o[0]-l.w/2);T.x1=Math.max(T.x1,o[0]+l.w/2)}
    else{const x=o[0]+b.dir*(g.PW/2+16),ay=o[1]-g.PH*.45;T.lbl[pd.id]={...l,x,y:ay-l.hgt/2+24,anchor:b.dir<0?'end':'start',dir:b.dir,ax:o[0]+b.dir*g.PW/2,ay,pol:pd.pol,jid:pd.jid};T.y0=Math.min(T.y0,ay-l.hgt/2-6);if(b.dir<0)T.x0=Math.min(T.x0,x-l.w);else T.x1=Math.max(T.x1,x+l.w)}}
   for(const dir of [-1,1]){const ls=Object.values(T.lbl).filter(l=>l.dir===dir).sort((a,b)=>a.y-b.y);for(let i=1;i<ls.length;i++)if(ls[i].y<ls[i-1].y+ls[i-1].hgt+8)ls[i].y=ls[i-1].y+ls[i-1].hgt+8}}
  /* place: the main tree at 0, the others on the side its first branch does not reach */
  const xs=[0];let edgeL=trees[0].x0,edgeR=trees[0].x1;
  trees.forEach((T,i)=>{if(!i)return;const d=i%2?-S:S;if(d>0){const x=edgeR+30-T.x0;xs.push(x);edgeR=x+T.x1}else{const x=edgeL-30-T.x1;xs.push(x);edgeL=x+T.x0}});
  const T0=trees[0];const lone=T0.lit&&trees.length===1;
  /* one CSS pixel in drawing units: a phone's canvas is drawn wider and scaled down whole */
  const kpx=narrow&&!sap?GB_NK:1;
  /* the pot is chosen for the tree as a grower would choose one for an informal upright: about two thirds as long as the
     tree is tall (up to seven tenths for a tree that spreads wider than it is tall), but never so long that the trunk is
     under an eighth of it, so the pot never dwarfs the trunk; about as deep as the trunk is thick at its foot, and never
     shorter than its roots need */
  const tall=Math.max(-T0.cy0,T0.Ht,1),spread=T0.cx1-T0.cx0;
  let potL=lone?Math.max(.4*H0,96):Math.max(narrow?110:150,Math.min(760,T0.D/.122,tall*(.6+.1*Math.max(0,Math.min(1,spread/tall-1)))));
  /* the pot sits under the canopy's mass, the trunk off its centre, so a heavy first branch does not hang off one end; never
     so far off it that the nebari has no room to spread on its short side */
  let potC=trees.length===1?(lone?0:Math.max(-potL*.2+12,Math.min(potL*.2-12,(T0.cx0+T0.cx1)/2*.85))):(Math.min(...xs)+Math.max(...xs))/2;
  if(trees.length>1)potL=Math.max(potL,Math.max(...xs)-Math.min(...xs)+.5*H0);
  /* roots: one per thing the change depends on, alternating sides. A store in the repo runs along the soil and sinks into it;
     a third party runs over the rim and down the pot, out of the repo; one that no journey uses lies apart, severed. */
  const deps=[];const taken=new Set();
  trees.forEach((T,i)=>{const ids=[...new Set(T.js.flatMap(j=>(j.units||[]).filter(id=>M.U[id]&&M.U[id].root)))].filter(id=>!taken.has(id));if(!i)for(const u of M.strays)ids.push(u.id);
   ids.slice(0,6).forEach((id,k)=>{taken.add(id);deps.push({id,i,d:k%2?T.S:-T.S,r:Math.floor(k/2),T,ext:M.U[id].layer==='ext',loose:!T.js.some(j=>(j.units||[]).includes(id))})})});
  /* the nebari: five surface roots (four on a slender literati, or a small tree of one branch, which stands on them though no
     store or service roots under it) radiating from the trunk's foot, each leaving it about a third
     of the foot's girth thick (q.w0) and thinning to a hair, out to six to three quarters of the way to the rim (q.r, of the
     pot's half-length), undulating a little as it goes; the back ones a little higher, the front ones lower and laid over
     them. On a side a named root leaves on, they stay at the shortest, so the named root runs on past them */
  const nbSpec=(T,i)=>{const live=new Set(deps.filter(q=>q.i===i&&!q.loose).map(q=>q.d));
   const sp=T.items.length<=1?[[-1,.72,0,.34,-1],[1,.64,0,.31,-1],[1,.68,1,.36,0],[-1,.61,1,.33,0]]
    :[[-1,.74,0,.36,-1.2],[1,.68,0,.32,-1],[-T.S,.62,0,.31,1.6],[1,.65,1,.38,0],[-1,.61,1,.34,0]];
   return sp.map(([d,r,f,w0,ln])=>({d,r:live.has(d)?Math.min(r,.62):r,f,w0,ln}))};
  /* half the foot's width where it meets the soil, from the trunk as drawn */
  const halfAt=T=>{let k=0;while(k<T.tp.length-1&&T.tp[k][1]>-8)k++;return T.tw[k]/2};
  const looseLen=Math.max(70,Math.min(90,.22*tall))*kpx,bareW=22*Math.sqrt(kpx);
  /* the pot's ends hold the nebari, a third party's root running out to the rim, a store's root, and an unused store's root
     running out from the nebari with its tag staked in its cut end */
  {let A=Infinity,Bz=-Infinity;trees.forEach((T,i)=>{const X=xs[i],busyD=d=>deps.some(q=>q.i===i&&q.d===d&&!q.loose);for(const d of [-1,1]){const rch=halfAt(T),dp=deps.filter(q=>q.i===i&&q.d===d);
    /* (and on a side no named root runs along, a stretch of bare soil past the nebari) */
    let nd=rch+18*kpx;if(dp.some(q=>q.ext))nd=Math.max(nd,rch+30*kpx);if(dp.some(q=>!q.ext&&!q.loose))nd=Math.max(nd,rch+26*kpx);
    else if(!dp.some(q=>q.ext))nd=Math.max(nd,rch+bareW+22*kpx);
    /* (an unused store's root on this side: its run past the foot and the stake in its cut end, and room for its tag between
       the trunk and the rim, the tag slid along its stake toward the trunk as far as it stands sixteen pixels clear of it) */
    for(const q of deps)if(q.i===i&&q.loose&&(busyD(q.d)&&!busyD(-q.d)?-q.d:q.d)===d){const tw=gbW(gwCut(M.U[q.id].label,22)+' · unused',8.6*kpx*.61)+10*kpx;nd=Math.max(nd,halfAt(T)+looseLen+12*kpx,halfAt(T)+16*kpx+tw-10*kpx)}
    if(d<0)A=Math.min(A,X-nd);else Bz=Math.max(Bz,X+nd)}});
   /* (a pot short at one end slides that way first, as far as the other end has room to spare, before it grows) */
   let a=potC-potL/2,b=potC+potL/2;if(!lone&&(a>A||b<Bz)){if(a>A){const k=Math.min(a-A,Math.max(0,b-Bz));a-=k;b-=k}if(b<Bz){const k=Math.min(Bz-b,Math.max(0,A-a));a+=k;b+=k}a=Math.min(a,A);b=Math.max(b,Bz);potL=b-a;potC=(a+b)/2}
   /* (and on each side of each trunk, room for its nebari: six tenths of the half-length and ten units more to the rim) */
   if(!lone)for(let it=0;it<3;it++)for(const X of xs){if(X-a<.3*(b-a)+10)a=(X-.3*b-10)/.7;if(b-X<.3*(b-a)+10)b=(X-.3*a+10)/.7;potL=b-a;potC=(a+b)/2}}
  /* four fifths as deep as the trunk is thick at its foot, so the pot balances the tree; a lone literati keeps its small round
     bowl */
  let D=lone?22:Math.max(22,Math.min(52,.8*T0.D));const fh=lone?3.4:Math.max(4,Math.min(8,.16*D));
  let x0=Math.min(edgeL,potC-potL/2-10),x1=Math.max(edgeR,potC+potL/2+10),y0=Math.min(...trees.map(T=>T.y0));
  /* the soil: a low mound inside the pot, highest at the trunk, that the roots lie in and sink into */
  const pa=potC-potL/2,pb=potC+potL/2;
  const sy=x=>{let m=0;for(const X of xs)m=Math.max(m,Math.exp(-Math.pow((x-X)/(.3*potL),2)));return -3-(lone?3.4:6)*m};
  /* a root is not a ruled wedge: it swells and narrows a little along its run, lies half sunk, and its tip goes under */
  /* the ground a front root lies on: nearer the eye than the soil's far edge, so lower in the drawing */
  const fy=x=>{const a=sy(x)+.7;return a+.5*(-1-a)};
  const knobs=(seed,n)=>{const r=gbRng(seed),ph=r()*6.28,ph2=r()*6.28;return Array.from({length:n+1},(_,i)=>[1+.13*Math.sin(i*.95+ph),.55*Math.sin(i*.6+ph2)])};
  const tpr=lone?5:Math.max(5,.02*potL),wallX=(dd,y)=>{const k=tpr*Math.max(0,y-2)/Math.max(1,D-2);return dd>0?pb-k:pa+k};
  const roots=[];
  /* the nebari, unnamed, are laid first, back fingers before front ones, so the named roots lie over them */
  trees.forEach((T,i)=>{const X=xs[i],hb=halfAt(T),G=2*hb;const fs0=[];nbSpec(T,i).forEach((q,k)=>{const n=24,kb=knobs(gbHash('nb'+i+':'+k),n);const a=X+q.d*hb*(q.f?.2:.55),rim=q.d>0?pb-X:X-pa,e=X+q.d*Math.max(.6*potL/2,Math.min(q.r*potL/2,rim-10,2.02*G));const pts=[],w=[];
    /* a root of its own: thick where it leaves the foot, its upper edge climbing the trunk there (a buttress), easing out to a
       hair (about four hundredths of the girth, never past a pixel and a third); most of it above the soil's surface near the
       foot (the nearer ground for a front one), sinking as it goes, its tip going under altogether */
    const tipW=Math.min(1.3,.04*G),g0=q.f?.55:.6;
    for(let ii=0;ii<=n;ii++){const t=ii/n,x=a+(e-a)*(1-Math.pow(1-t,1.25)),kw=1+(kb[ii][0]-1)*Math.min(1,t/.25),ww=Math.max(tipW,tipW+(G*q.w0-tipW)*Math.pow(1-t,1.15)*kw);
     pts.push([x,(q.f?fy(x)-.22*ww:sy(x)+.7-.5*ww+q.ln*kpx*Math.sin(Math.PI*Math.min(1,t/.8)))+(t>g0?Math.pow((t-g0)/(1-g0),1.5)*(ww*.85+1.2):0)+kb[ii][1]*.35*Math.min(1,t/.2)]);w.push(ww)}
    fs0.push({id:null,tree:i,d:q.d,pts,w,front:!!q.f})});fs0.sort((a,b)=>a.front-b.front);roots.push(...fs0)});
  for(const q of deps){const {id,i,d,r,T,ext,loose}=q;const X=xs[i],D0=T.D;const rim=d>0?pb:pa;const reach=Math.abs(rim-X);const kb=knobs(gbHash('rt:'+id),30);let pts=null,w=null;
   const wS=.3*D0;
   if(ext){/* a finger that runs along the soil to the rim, a third sunk, climbs over the lip and down the pot's side, and thins
      there to a fine root about two pixels wide where tracing loses it */
    const xa=X+d*.1*D0,xr=rim-d*3,wR=3.6*kpx;const run=[];for(let ii=0;ii<=18;ii++){const t=ii/18,x=xa+(xr-xa)*(1-Math.pow(1-t,1.25)),we=wS+(wR-wS)*Math.pow(t,.7);
     run.push([x,sy(x)+.7+.3*we-we/2-Math.pow(1-t,3)*.1*D0+(ii<16?kb[ii][1]*.4:0)])}
    pts=gbResample(gbSmooth([...run,[rim+d*1.2,-2.9-.5*kpx],[rim+d*4.4,-1.6],[rim+d*6.6,1.6],[rim+d*6.4,5.8],[wallX(d,D*.34)+d*3.4,D*.34],[wallX(d,D*.62)+d*2.4,D*.62]],3),30);
    let iR=pts.findIndex(p=>d*(p[0]-xr)>=0);if(iR<1)iR=18;
    w=pts.map((p,ii)=>ii<=iR?Math.max(wR,(wS+(wR-wS)*Math.pow(ii/iR,.7))*(ii<iR*.8?kb[ii][0]:1)):3.4*kpx+(2*kpx-3.4*kpx)*(ii-iR)/Math.max(1,30-iR))}
   else if(!loose){/* a store's: a finger along the soil whose tip goes under, where its tag is staked */
    const len=Math.max(16,Math.min(reach-14,(.2+.07*r)*potL+8)),xa=X+d*.1*D0;pts=[];w=[];
    for(let ii=0;ii<=22;ii++){const t=ii/22,x=xa+d*len*(1-Math.pow(1-t,1.2)),ww=Math.max(.9,D0*(.25-.2*Math.pow(t,.8))*kb[ii][0]);
     pts.push([x,sy(x)+.7+.3*ww-ww/2-Math.pow(1-t,3)*.1*D0+(t>.75?Math.pow((t-.75)/.25,1.5)*(ww*.5+1.4):0)]);w.push(ww)}}
   roots.push({id,tree:i,d,pts,w,ext,loose,stop:s.stops.some(x=>x.unit===id)})}
  /* what a name or a tag stands clear of: the wood (trunk, branches, twigs, roots) and the foliage */
  const woodP=[],padB=[];
  trees.forEach((T,i)=>{const X=xs[i];const add=(pts,w)=>{if(!pts||!w)return;for(let k=0;k<pts.length;k+=2)woodP.push([pts[k][0]+X,pts[k][1],(w[k]||1)/2,null])};
   add(T.tp,T.tw);for(const b of T.br||[]){add(b.pts,b.w);for(const t of b.twigs||[])add(t.pts,t.w)}for(const t of T.ctw||[])add(t.pts,t.w);
   for(const pd of T.padList||[]){const o=T.origin&&T.origin[pd.id],g=pd.geo;if(o&&g)padB.push([o[0]+X-g.PW/2,o[1]-g.PH-6,o[0]+X+g.PW/2,o[1]+g.drop+2,o[1]+2])}
   for(const kn of T.knots||[])if(kn.p)woodP.push([kn.p[0]+X,kn.p[1],7,null])});
  for(const r of roots)if(r.pts)for(let k=0;k<r.pts.length;k+=2)woodP.push([r.pts[k][0],r.pts[k][1],r.w[k]/2,r]);
  const bgap=(b,q)=>Math.hypot(Math.max(b[0]-q[2],0,q[0]-b[2]),Math.max(b[1]-q[3],0,q[1]-b[3]));
  const clr=(b,own,body,tg)=>{let c=1e9;for(const q of woodP)if((q[3]!==own||!own)&&!(tg&&q[3]&&q[1]-q[2]>=b[3]+4))c=Math.min(c,Math.hypot(Math.max(b[0]-q[0],0,q[0]-b[2]),Math.max(b[1]-q[1],0,q[1]-b[3]))-q[2]);for(const q of padB)c=Math.min(c,bgap(b,body?[q[0],q[1],q[2],q[4]]:q));return c};
  /* the pot is the repository: its name pressed into the middle of the face, in full while it fits. A short project name
     also carries its folder's ("tg · tracegrove"). Its type steps down to about seven pixels first, then the name breaks
     after a hyphen onto two lines, and only then is its end cut; never its middle. A monospace letter is six tenths of its
     size, and three hundredths more apart */
  let repo='';try{const dn=String(state.dir||'').split('/').pop()||'';repo=(state.config&&state.config.project)||dn;if(repo.length<4&&dn&&dn!==repo)repo+=' · '+dn}catch(e){}
  /* (between the shadow under the lip and the incised band above the foot, its walls' taper and a margin either side) */
  const seal=repo&&potL>60?(()=>{const top=Math.min(8,D*.24)+1,bot=D-4.4,mid=(top+bot)/2,ax=potC,room=lone?potL*.62:wallX(1,bot)-wallX(-1,bot)-14*kpx,cw=f=>f*.63;
   const sizes=[9.4,9,8.6,8.2,7.8,7.4,7].map(f=>f*kpx),sm=sizes[sizes.length-1],fit=ls=>sizes.find(f=>Math.max(...ls.map(l=>l.length))*cw(f)<=room),two=q=>q*1.12+q*.75<=bot-top;
   const out=(lines,f)=>({lines,fs:f,x:ax,y:lone?D*.5+f*.35:mid+(lines.length-1)*f*.56+f*.35,an:'middle',lh:f*1.12,room});
   let f=fit([repo]);if(f)return out([repo],f);
   /* two lines need the face's height */
   if(!lone&&two(sm)){let best=null;for(let i=1;i<repo.length-1;i++)if(/[-_./]/.test(repo[i-1])){const ls=[repo.slice(0,i),repo.slice(i)],n=Math.max(ls[0].length,ls[1].length);if(!best||n<best.n)best={ls,n}}
    if(best){const ok=sizes.filter(two),g=ok.find(q=>best.n*cw(q)<=room);if(g)return out(best.ls,g);
     const m=ok[ok.length-1];if(m&&best.ls[0].length*cw(m)<=room){const n=Math.max(2,Math.floor(room/cw(m)));return out([best.ls[0],best.ls[1].length>n?best.ls[1].slice(0,n-1)+'…':best.ls[1]],m)}}}
   const m=sm,n=Math.max(2,Math.floor(room/cw(m)));return out([repo.slice(0,n-1)+'…'],m)})():null;
  const fs=narrow?11*GB_NK:10.5,cw=fs*.61,tfs=8.6*kpx,tcw=tfs*.61;
  /* names: a third party's at the rim its root goes over, just outside the pot on that side and reading outward from the root,
     level with where it comes down past the lip; and "trace stops", a label of its own, beside the open end of the tail,
     reading outward too. The same at every width: the drawing makes room for them (the tree is drawn smaller), so neither
     ever sits on the pot */
  const rl=[],taken2=[];const zxOf=d=>wallX(d,D+11)+d*1.9,zy=D+13.2+fs*.35;
  for(const r of roots){if(!r.id||!r.ext)continue;const d=r.d,t=gwCut(M.U[r.id].label,22),w0=gbW(t,cw),zx=zxOf(d);
   const y=Math.max(fs*.5,D*.24),yt=y-fs*.75,yb=y+fs*.45;let edge=d>0?pb+1.5:pa-1.5;r.pts.forEach((q,ii)=>{if(q[1]>yt-2&&q[1]<yb+2)edge=d>0?Math.max(edge,q[0]+r.w[ii]/2):Math.min(edge,q[0]-r.w[ii]/2)});const x=edge+d*6*kpx;
   rl.push({r,x,y:y+fs*.35,anchor:d>0?'start':'end',t,face:false,bare:true});if(d>0)x1=Math.max(x1,x+w0+8);else x0=Math.min(x0,x-w0-8);
   if(r.stop){const nx=zx+d*5.5*kpx,w1=gbW('trace stops',cw);rl.push({r,x:nx,y:zy,anchor:d>0?'start':'end',t:'trace stops',note:true});if(d>0)x1=Math.max(x1,nx+w1+8);else x0=Math.min(x0,nx-w1-8)}}
  /* a store's name on a plant tag: a small rounded tag standing about twelve units above the soil on a wooden stake pushed into
     it, never within sixteen pixels of the wood. A live store's stake stands on its root, at its tip or back along it. A
     store no journey uses is a faded root running out from the nebari seventy to ninety pixels past the foot, partly sunk
     in the soil, its end cut and the stake pushed into the cut face, the tag over the root's end. Its tag reads "<store> · unused" on one line at every width: the type steps down to eight
     pixels, then the store's name is cut at its end, and " · unused" always stays */
  /* (where the pot has no clear stretch wide enough, the tag leans out past the rim on its stake, away from the trunk) */
  const tagAt=(sx,lab,out,f,lean)=>{f=f||tfs;const ww=gbW(lab,f*.61)+10*kpx,th=f*1.45,gy=sy(sx),bot=gy-11;const lo=pa-10+ww/2,hi=pb+10-ww/2,pre=lean?sx+lean*(ww/2-6*kpx):sx,cx=out?sx+out*ww/2:lo>hi?(pa+pb)/2:Math.max(lo,Math.min(hi,pre));
   const x=Math.max(sx-ww/2+5*kpx,Math.min(sx+ww/2-5*kpx,cx));const box=[x-ww/2,bot-th,x+ww/2,bot];return {x,ww,th,gy,bot,top:bot-th,box,sx,f}};
  /* (clearance from the wood and from where a pad's leaves may hang, a root lying low in the soil counting as the soil the
     tag already stands twelve units clear of; between places that both fall short, the one further from the pad's own body wins) */
  const score=(g,own)=>{const tk=Math.min(...taken2.map(q=>bgap(g.box,q))),c=Math.min(clr(g.box,own,0,1),tk);return c+.25*Math.max(0,Math.min(clr(g.box,own,1,1),tk)-c)};
  for(const r of roots){if(!r.id||r.ext)continue;const T=trees[r.tree],X=xs[r.tree],t=gwCut(M.U[r.id].label,22);let best=null;const ok=16*kpx;
   if(!r.loose){const lab=t,n=r.pts.length;for(let ii=n-1;ii>=Math.floor(n*.45);ii-=2){const g=tagAt(r.pts[ii][0]+r.d*(ii===n-1?2:0),lab);g.c=score(g,r);g.t=t;if(!best||g.c>best.c+.5)best=g;if(g.c>=ok)break}
    if(best&&best.c<ok)ov:for(let ii=n-1;ii>=Math.floor(n*.45);ii-=2)for(const f of [.4,.7,1]){const g=tagAt(r.pts[ii][0],lab,r.d*f);g.c=score(g,r);g.t=t;if(g.c>best.c+.5)best=g;if(g.c>=ok)break ov}}
   else{const busy=d=>deps.some(q=>q.i===r.tree&&q.d===d&&!q.loose);let sides=[r.d,-r.d].filter(d=>!busy(d));if(!sides.length)sides=[r.d];
    const full=M.U[r.id].label,vars=[...[8.6,8.3,8].map(f=>[t,f*kpx]),...[16,12,9].filter(n=>n<full.length).map(n=>[gwCut(full,n),8*kpx])],whole=vars.slice(0,3),cut=vars.slice(3);
    /* the root's cut end stands its run past the foot (shortened toward seventy pixels, and never past the rim, where the
       tag has no room), and the stake stands in it */
    const hb=halfAt(T),cutAt=(d,len)=>{const c=X+d*(hb+len);return d>0?Math.min(c,pb-9*kpx):Math.max(c,pa+9*kpx)},lens=[...new Set([looseLen,80*kpx,70*kpx].filter(l=>l<=looseLen+.01))];
    /* (the whole name where it stands well clear, then where it is merely clear, then in smaller type, then leaning out past
       the rim; and only then a cut name) */
    const look=(vs,need,lean)=>{for(const [vt,f] of vs)for(const d of sides)for(const len of lens){const sc=cutAt(d,len);
      for(const o of lean?[.4,.7,1]:[0]){const g=tagAt(sc,vt+' · unused',d*o,f,o?0:d);g.c=score(g,r);g.s0=sc;g.d=d;g.t=vt;if(!best||g.c>best.c+.5)best=g;if(g.c>=need)return g}}return null};
    const hit=look(whole.slice(0,1),ok)||look(whole.slice(0,1),6*kpx)||look(whole.slice(1),6*kpx)||look(whole.slice(0,1),ok,1)||look(cut,6*kpx);if(hit)best=hit;
    if(!best){const d=r.d,sc=cutAt(d,looseLen);best=tagAt(sc,t+' · unused',0,tfs,d);best.s0=sc;best.d=d;best.t=t}
    /* the root: bark from under the foot to its cut end, thick where it leaves and tapering, its centre a little under the
       soil's surface where it leaves the nebari; over its last stretch it lifts, so the cut face stands out of the soil */
    const d=best.d,sc=best.s0,xa=X+d*hb*.5,n=24,kb=knobs(gbHash('cut:'+r.id),n),wa=Math.max(8.5*kpx,.64*hb),wc=Math.max(7*kpx,.36*hb);r.d=d;r.pts=[];r.w=[];
    for(let ii=0;ii<=n;ii++){const t=ii/n,x=xa+(sc-xa)*t,ww=(wa+(wc-wa)*Math.pow(t,.7))*(ii<n-1?1+.06*(kb[ii][0]-1)/.13:1),dy=Math.min(1.4,.7+.2*ww);
     /* (and between, it dives into the soil and runs on under it, so it reads as a root gone down into the pot, never a log
        laid along the soil: what shows is where it leaves the nebari and the cut end it surfaces at) */
     const dive=t>.1&&t<.82?(ww*.8+2*kpx)*Math.pow(Math.sin(Math.PI*(t-.1)/.72),.7):0;
     r.pts.push([x,sy(x)+dive+(t<=.72?dy:dy+(.7-.28*ww-dy)*Math.pow((t-.72)/.28,1.4))]);r.w.push(ww)}}
   if(!best)continue;taken2.push(best.box);
   rl.push({r,x:best.x,y:best.top+best.th/2+best.f*.36,anchor:'middle',t:best.t,unused:!!r.loose,tag:true,fs:best.f,ww:best.ww,th:best.th,sx:best.sx,gy:best.gy,bot:best.bot,top:best.top,
    box:[best.box[0]-16*kpx,best.box[1]-16*kpx,best.box[2]+16*kpx,best.gy+2],tb:[best.box[0],best.box[1],best.box[2],best.gy+2]});x0=Math.min(x0,best.box[0]-6);x1=Math.max(x1,best.box[2]+6)}
  const stopX=rl.some(l=>l.r.stop&&l.r.ext);
  const yb=Math.max(0,...rl.filter(l=>l.below||l.note).map(l=>l.y+5));
  /* (an unused store's root leaves from under the nebari, so it is drawn first) */
  roots.sort((a,b)=>(b.loose?1:0)-(a.loose?1:0));
  L={trees,xs,potL,potC,D,fh,kpx,fy,roots,rl,fs,sy,wallX,seal,x0,x1,y0:y0-8,y1:Math.max(yb,D+fh+(lone?10:12)+(stopX?10:0)),narrow,S,H0,lone};
  /* a pot made longer for its roots and tags than its trunk allows: the trunk is drawn again, an eighth of it (a few times at
     most, at the same size) */
  if(!lone&&!sap&&T0.D<.121*potL&&dr<3){dmin=.124*potL;dr++;pass--;continue}
  /* too wide: a lower tree has smaller pads and labels, down to the height where its leaves reach their smallest; below
     that only the trunk would shrink and the pads pile into each other, so past it the drawing scales down whole instead */
  const need=L.x1-L.x0+24;if(need<=width||pass===5||H0<=Hmin)break;H0=Math.max(Hmin,H0*Math.max(.55,Math.min(.96,Math.pow((width-24)/need,1.4))));}
 return L}

/* Wood grows out along its own spine: the finished, textured wood is uncovered from its base to its tip by one clip per
   piece (its fill, its light and its grain alike): a band down the centre line, sampled close enough to follow every bend,
   whole up to one caliper behind where the grow's clock has the wood, and from there tapering smoothly along the spine to
   a round tip a tenth of the wood's girth, a half circle round the spine where the clock has it. So the growing front is a
   shoot's tip, rounded and tapered and following the curve, never a flat or slanted cut nor the wood's whole girth pushed
   up as a stub, while whatever grows on the wood (a knot, a twig, a leaf, a name) waits for it to show its whole girth
   there (gbWood's lag, a caliper). On the inside of a bend the band reaches no further than the bend's centre
   allows, as the wood's own edge does, so it never folds over itself.
   The clip is the element's own style, animated on the page clock, the same clock every leaf, cushion, knot and name keys
   on, so whatever frame the browser paints (a screenshot's too) shows the wood and what grows on it at one moment. (An SVG
   mask redrawn each frame is not: the browser can paint the wood with the mask of a frame or more before.) An animated clip
   is placed in its element's own box, so each clipped element holds an empty rect over the whole drawing, which puts that
   box's corner at the drawing's. Its keyframes are close enough, a longer piece having more, that the band's points,
   moving straight from one to the next, keep to the spine between them. */
function gbGrowRun(B){const P=B.grow;if(!P.length||!B.svg.animate)return;const [vx,vy,W,VH]=B.vb;
 for(const g of P){if(!g.pts)continue;const A=gbLen(g.pts),T=A[A.length-1]||1,n=g.pts.length-1,bx=g.el.__bx;
  /* how far out the band may reach on each side of the spine at each of its points: on the inside of a bend, no further than
     the wood's own edge there and a little, or nine tenths of the way to the bend's centre if that is further */
  const lim=g.pts.map((b,i)=>{const a=g.pts[Math.max(0,i-3)],c=g.pts[Math.min(n,i+3)],t1=[b[0]-a[0],b[1]-a[1]],t2=[c[0]-b[0],c[1]-b[1]],m1=Math.hypot(t1[0],t1[1]),m2=Math.hypot(t2[0],t2[1]);let l=1e9,r=1e9;
   if(m1&&m2){const th=Math.asin(Math.max(-1,Math.min(1,(t1[0]*t2[1]-t1[1]*t2[0])/(m1*m2))));if(Math.abs(th)>1e-3){const rad=(m1+m2)/2/Math.abs(th),h=Math.max(Math.min(g.w[i]/2,.85*rad)+1.5,.9*rad);if(th>0)l=h;else r=h}}return [l,r]});
  /* along the spine at distance d (before its base or past its end, straight on): the point, the tangent and normal, the
     wood's half-width, and how far out the band reaches on each side */
  const at=d=>{let j=1,hi=n;while(j<hi){const m=(j+hi)>>1;if(A[m]<d)j=m+1;else hi=m}
   const u=(d-A[j-1])/((A[j]-A[j-1])||1),a=g.pts[j-1],b=g.pts[j],m=Math.hypot(b[0]-a[0],b[1]-a[1])||1,t=[(b[0]-a[0])/m,(b[1]-a[1])/m],k=u<.5?j-1:j,w=g.w[j-1]+(g.w[j]-g.w[j-1])*Math.max(0,Math.min(1,u)),H=w*.62+4+(bx&&bx[k]?Math.abs(bx[k]):0);
   return {p:[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],t,n:[-t[1],t[0]],w:w/2,hl:Math.min(H,lim[k][0]),hr:Math.min(H,lim[k][1]),bl:bx&&bx[k]>0?bx[k]:0,br:bx&&bx[k]<0?-bx[k]:0}};
  const NB=Math.max(8,Math.min(64,Math.ceil(T/7))),NT=12,NC=15,NP=2*(NB+NT)+NC;
  /* the growing end is a shoot's tip a tenth of the wood's girth there across, never the girth of the wood below pushed up
     as a stub: behind it the wood widens smoothly to its whole girth over one caliper of it (that girth, eased in and out,
     so neither the tip nor where the taper meets the whole wood shows a corner) */
  const shape=f=>{const L=[],R=[],e=f*T;if(f<=0){const q=at(0);return 'M'+Array(NP).fill(gbP([q.p[0]-vx,q.p[1]-vy])).join(' L')+' Z'}
   const q=at(e),Lt=Math.max(2,2*q.w),rt=Math.min(q.w+.4,Math.max(.5,.2*q.w));
   /* (the band's points: NB along the whole wood behind the taper, and NT across the taper itself, so it keeps its shape) */
   const ts=Math.max(-2,e-Lt),ds=[];for(let i=0;i<NB;i++)ds.push(-2+(ts+2)*i/(NB-1));for(let i=1;i<=NT;i++)ds.push(ts+(e-ts)*i/NT);
   for(const d of ds){const o=at(d),u=(e-d)/Lt,tq=u>=1?1e9:rt+(o.w+.4-rt)*u*u*(3-2*u);L.push([o.p[0]+o.n[0]*Math.min(o.hl,tq),o.p[1]+o.n[1]*Math.min(o.hl,tq)]);R.push([o.p[0]-o.n[0]*Math.min(o.hr,tq),o.p[1]-o.n[1]*Math.min(o.hr,tq)])}
   /* past the front: a half circle round the spine there, the tip's half-width */
   const cap=[];for(let i=0;i<NC;i++){const th=Math.PI/2-Math.PI*i/(NC-1),h=rt*Math.sin(th);cap.push([q.p[0]+q.n[0]*h+q.t[0]*Math.cos(th)*rt,q.p[1]+q.n[1]*h+q.t[1]*Math.cos(th)*rt])}
   return 'M'+[...L,...cap,...R.reverse()].map(q=>gbP([q[0]-vx,q[1]-vy])).join(' L')+' Z'};
  const K=Math.max(24,Math.min(72,Math.ceil(T/6))),us=[],kf=[];for(let i=0;i<=K;i++)us.push(i/K);
  us.sort((a,b)=>a-b);for(const u of us)kf.push({clipPath:"path('"+shape(u||g.f0?g.f0+(1-g.f0)*(1-Math.pow(1-u,2.2)):0)+"')",offset:u});
  const cw=sv('g',{});g.el.before(cw);cw.append(g.el);g.cw=cw;g.an=[];
  g.a=[cw,...(g.el.__also||[])].map(e=>{const r=sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'none'});e.append(r);g.an.push(r);return gbPlay(e,kf,{duration:g.ms,fill:'both'},g.t0)})}
 /* once every piece has grown out, by the grow's clock, the clips go, and the wood is just wood */
 const end=Math.max(...P.map(g=>g.t0+g.ms));const done=()=>{if(gbNow()<end+60){requestAnimationFrame(done);return}for(const g of P){for(const a of g.a||[])a.cancel();for(const r of g.an||[])r.remove();if(g.cw)g.cw.replaceWith(g.el)}};setTimeout(done,Math.max(0,end-performance.now())+60)}

/* Build the SVG once per shape; later paints only move leaves and toggle classes. */
function gbBuild(M,width,key,sap){const s=gw.state;M.kfold=(gw.kfold&&gw.kfold[key])||[];let L=gbLayout(M,width,sap);
 /* a phone scales the drawing to fit its width, so a wide tree is laid out again with leaves large enough to read there,
    about eleven pixels and up; beside a desktop tree a crowded one is laid out again with leaves of eighteen and up */
 if(!sap){const lo=L.narrow?11.5:18.2;for(let i=0;i<3;i++){const f=width/Math.max(width,L.x1-L.x0+24),lf=Math.min(...L.trees.flatMap(T=>T.padList.map(pd=>pd.geo.L)));if(lf*f>=lo)break;M.lmin=Math.max(M.lmin||0,lo/f*1.02);L=gbLayout(M,width,sap)}M.lmin=0}const quiet=gwQuiet(),now=gbNow();const N=gw.gbN=(gw.gbN||0)+1;
 const W=Math.max(width,L.x1-L.x0+24),vx=(L.x0+L.x1)/2-W/2,vy=L.y0-14,VH=L.y1-vy+8;
 const svg=sv('svg',{class:'gw-svg gb'+(L.narrow&&!sap?' nw':''),tabindex:'-1',viewBox:gbF(vx)+' '+gbF(vy)+' '+gbF(W)+' '+gbF(VH),role:'group','aria-label':'The change as a bonsai: each branch is an end-to-end journey, each leaf one of its scenarios, knots are the files it passes through, roots what it depends on'});
 const defs=sv('defs',{});const clipId='gb-wood'+N,softId='gb-soft'+N;const clip=sv('clipPath',{id:clipId});
 defs.append(clip,sv('filter',{id:softId,x:'-10%',y:'-10%',width:'120%',height:'120%'},sv('feGaussianBlur',{stdDeviation:'2.2'})));svg.append(defs);
 /* foliage is lit from above: the crest lighter, the body its own green, the underside in shade */
 const padG='gb-pad'+N;defs.append(sv('pattern',{id:padG+'s',patternUnits:'userSpaceOnUse',width:31,height:23},...[[10.0,3.5,-58,'s',1.6],[11.3,1.3,59,'s',1.2],[13.0,5.5,38,'s',1.7],[29.4,14.5,-55,'s',1.5],[30.3,1.1,-36,'s',1.2],[3.7,7.1,-24,'s',1.7],[5.8,2.2,-54,'s',1.7],[15.4,12.2,10,'s',2.0],[11.2,5.7,-24,'l',1.3],[17.8,12.1,17,'l',1.4],[30.4,2.7,37,'s',1.4],[28.9,9.7,-51,'l',1.7],[27.1,7.2,19,'s',1.7],[14.1,19.3,-1,'s',1.8],[1.9,16.1,44,'s',1.5],[20.7,0.5,48,'s',1.7],[15.3,5.0,3,'s',1.3],[12.1,20.0,-50,'s',1.5],[8.6,3.1,40,'l',1.4],[12.9,8.3,27,'l',1.3],[5.5,5.3,-11,'s',1.9],[5.7,6.5,-33,'s',1.5],[17.6,21.9,61,'l',1.8],[22.9,10.5,30,'s',1.5],[14.9,9.2,-22,'s',1.3],[5.0,7.8,-57,'s',1.7]].map(([x,y,a,c,rx])=>sv('ellipse',{cx:x,cy:y,rx,ry:rx*.5,transform:'rotate('+a+' '+x+' '+y+')',class:'st'+c}))));
 /* each clump of foliage lit on its top and in its own shade beneath, the crest's a step lighter than its shoulders' */
 for(const [k,v] of [['cr','fol'],['sh','fsh']])defs.append(sv('linearGradient',{id:padG+k,x1:.3,y1:0,x2:.45,y2:1},sv('stop',{offset:.08,style:'stop-color:var(--'+v+'-hi)'}),sv('stop',{offset:.5,style:'stop-color:var(--'+v+')'}),sv('stop',{offset:.92,style:'stop-color:var(--'+v+'-lo)'})),
  /* a tuft: lit along its top, where it crosses the leaf, and gone into the cushion below */
  sv('linearGradient',{id:padG+'t'+k,x1:0,y1:0,x2:0,y2:1},sv('stop',{offset:.1,style:'stop-color:var(--'+v+'-hi)'}),sv('stop',{offset:.55,style:'stop-color:var(--'+v+')'}),sv('stop',{offset:1,style:'stop-color:var(--'+v+');stop-opacity:0'})),
  /* (and two more greens for the small lobes, one a little yellower and lighter, one a little bluer and deeper, so a cushion
     is two or three greens heaped, never one flat colour) */
  sv('linearGradient',{id:padG+k+'1',x1:.3,y1:0,x2:.45,y2:1},sv('stop',{offset:.08,style:'stop-color:color-mix(in oklab,var(--'+v+'-hi) 82%,#e8f0a0)'}),sv('stop',{offset:.6,style:'stop-color:color-mix(in oklab,var(--'+v+') 85%,#c8d870)'}),sv('stop',{offset:.95,style:'stop-color:var(--'+v+'-lo)'})),
  sv('linearGradient',{id:padG+k+'2',x1:.3,y1:0,x2:.45,y2:1},sv('stop',{offset:.08,style:'stop-color:var(--'+v+')'}),sv('stop',{offset:.55,style:'stop-color:color-mix(in oklab,var(--'+v+'-lo) 85%,#2f6a5a)'}),sv('stop',{offset:.95,style:'stop-color:color-mix(in oklab,var(--'+v+'-lo) 75%,#000)'})),
  sv('linearGradient',{id:padG+'u'+k,x1:0,y1:0,x2:0,y2:1},sv('stop',{offset:.45,style:'stop-color:color-mix(in srgb,var(--'+v+'-lo) 55%,#000);stop-opacity:0'}),sv('stop',{offset:1,style:'stop-color:color-mix(in srgb,var(--'+v+'-lo) 55%,#000);stop-opacity:.55'})));
 /* the traced route is drawn over everything, but where it runs inside a pad it shows faintly, as sap under foliage */
 const rmId='gb-rm'+N,rMask=sv('mask',{id:rmId,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)},sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'#fff'}));defs.append(rMask);
 const B={vb:[vx,vy,W,VH],key,L,svg,grow:[],anim:[],pad:{},padsOf:{},brEl:{},leaf:{},clump:{},bud:{},budG:{},knot:{},klbl:{},root:{},lbl:{},vein:{},pos:{},nav:[],navEl:{},cur:{},jinEl:{}};
 const lay=n=>{const g=sv('g',{class:n});svg.append(g);return g};
 /* a shoot grows out from under the bark, so it is drawn before the wood */
 const gPot=lay('pots'),gBack=lay('back'),gRoot=lay('roots'),gJin=lay('jins'),gBud=lay('buds'),gWood=lay('wood');
 const gLight=sv('g',{'clip-path':'url(#'+clipId+')',filter:'url(#'+softId+')'}),gGrain=sv('g',{'clip-path':'url(#'+clipId+')'});svg.append(gLight,gGrain);
 /* Max's shoots, and the stubs a crowded knot puts out, lie over the trunk: each leaves its knot's boss at the bark, out of a
    small swollen collar, never from under the wood */
 const gShoot=lay('shoots');
 /* a root that goes over the rim lies on the soil, but starts behind the trunk: the trunks mask it */
 const gSoil=lay('soil'),gRootX=lay('rootsx'),rxId='gb-rx'+N,rxMask=sv('mask',{id:rxId,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)},sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'#fff'}));defs.append(rxMask);gRootX.setAttribute('mask','url(#'+rxId+')');
 /* the traced route is drawn over the wood, so it is never lost under a branch; inside a pad it shows faintly (the mask),
    as sap under foliage */
 const gFront=lay('front'),gScar=lay('scars'),gSap=sv('g',{class:'sapl',mask:'url(#'+rmId+')'});svg.append(gSap);B.gScar=gScar;const gKn=lay('knots'),gVein=lay('veins'),gLbl=lay('labels'),gKl=lay('klabels'),gCur=lay('cur');
 B.gCur=gCur;B.gBud=gBud;B.gShoot=gShoot;B.gWood=gWood;B.gKn=gKn;B.defs=defs;B.N=N;
 /* the lit route inside the wood: its halo, its amber body, the grey dots past a break, the red wood where it broke, the cream
    core along its spine; and the red's own spine, unpainted, which a card keeps clear of (gbLight) */
 B.sapU=sv('path',{class:'sapu',d:''});B.sapR=sv('path',{class:'sapr',d:''});B.sap=sv('path',{class:'sap',d:''});B.sapX=sv('path',{class:'sap rest',d:''});B.gRed=sv('g',{class:'sapred','clip-path':'url(#'+clipId+')'});B.sapW=sv('path',{class:'sap bad',d:''});gSap.append(B.sapU,B.sapR,B.sapX,B.gRed,B.sap,B.sapW);
 B.lead=sv('path',{class:'tiplead',d:''});gCur.append(B.lead);
 /* an animation that has not finished yet: started at its first build, continued by any rebuild; a piece of wood keeps its
    reveal (gbWood) in el.__r, whose clock everything that grows on it reads */
 const anim=(k,el,delay,ms,kind)=>{if(kind==='grow'){const len=gbLen(el.__pts),lw=el.__w,r=el.__r=gbWood(k,delay,ms,len[len.length-1]||1,Math.max(...lw));if(!quiet&&now<r.t0+r.ms)B.grow.push({el,t0:r.t0,ms:r.ms,f0:r.f0,lg:r.lg,pts:el.__pts,w:el.__w,floor:el.__floor});return r}
  if(quiet)return;const t0=k===null?now+delay:gbTA(k,delay);if(now-t0>=ms)return;B.anim.push([el,t0-now,ms,kind])};
 const piece=(id,pts,w,cls,parent,delay,ms,floor,bx)=>{const d=gbRib(pts,w,0,pts.length-1,floor,bx);const p=sv('path',{d,class:cls});p.__pts=pts;p.__w=w;p.__floor=floor;p.__bx=bx;parent.append(p);clip.append(sv('path',{d}));anim('wood:'+id,p,delay,ms,'grow');return p};
 /* bark: the lit side and the shaded side, softened so they read as roundness, not as stripes; and a few strands of grain */
 const shade=(pts,w,from,parent)=>{const s1=gbSide(pts);parent.append(sv('path',{d:gbBand(pts,w,s1*.2,s1*.98,from),class:'lt'}),sv('path',{d:gbBand(pts,w,-s1*.38,-s1*1.06,from),class:'sh'}))};
 /* the grain parts round a knot's boss (bs: [index, offset from the centre line, radius]) the way bark flows round a burl,
    bowing out over about a boss's length to either side and closing again behind it */
 const grain=(pts,w,seed,parent,bs,from)=>{const r=gbRng(seed),acc=gbLen(pts),fs=w[0]<12?[-.38,.3]:[-.6,-.2,.22,.58];for(const f of fs){const ph=r()*6.28,a=Math.max(from||0,Math.floor(pts.length*(.02+.08*r()))),e=Math.floor(pts.length*(.7+.25*r()));
   const q=pts.slice(a,e).map((p,i)=>{const n=gbNorm(pts,i+a),hw=w[i+a]*.5;let o=hw*(f+.07*Math.sin(i*.25+ph));
    for(const [bk,bo,R] of bs||[]){const s=acc[i+a]-acc[bk],dl=o-bo,R1=R+1.8;if(Math.abs(s)>2.8*R1||Math.abs(dl)>=R1)continue;let sg=dl?Math.sign(dl):-Math.sign(bo)||1;if(Math.abs(bo+sg*R1)>.92*hw)sg=-sg;o+=(bo+sg*R1-o)*Math.exp(-Math.pow(s/(1.25*R1),2))}
    return[p[0]+n[0]*o,p[1]+n[1]*o]}).filter((_,i)=>i%2===0);if(q.length>2)parent.append(sv('path',{d:gbLine(gbSmooth(q,1)),class:'grain'}))}};
 /* Every limb is grown the same way, whatever it carries: it starts on its parent's centre line and is uncovered from there,
    fading in across the parent so no butt end lies on it; two fillets sweep from the parent's edge into its own (half again
    its girth along the parent on the crotch side, eight tenths on the other); a collar swells where it leaves; and it wears
    the parent's bark, lit on one side and shaded on the other, with grain along it. P is the parent ({pts,w,k}), gU the group
    under the parent's bark (the fillets and collar), gS the group over it (the crotch's shade). Returns the limb's wood, its
    group, and the group under its own bark where a limb off it puts its fillets. */
 const limb=(id,pts,w,P,cls,g,gU,gS,delay,ms,o)=>{o=o||{};const acc=gbLen(pts),Tk=P.w[P.k],b=w[0],n0=pts.length-1,eo=Math.max(1,Math.min(n0-3,acc.findIndex(d=>d>=Tk*.5)));
  const mid='gb-lm'+N+'-'+(B.lm=(B.lm||0)+1),e0=pts[gbNear(acc,Tk*.2)],e1=pts[gbNear(acc,Tk*.5+1)];
  defs.append(sv('linearGradient',{id:mid+'g',gradientUnits:'userSpaceOnUse',x1:gbF(e0[0]),y1:gbF(e0[1]),x2:gbF(e1[0]),y2:gbF(e1[1])},sv('stop',{offset:'0','stop-color':'#fff','stop-opacity':'0'}),sv('stop',{offset:'1','stop-color':'#fff','stop-opacity':'1'})),
   sv('mask',{id:mid,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)},sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'url(#'+mid+'g)'})));
  const wg=sv('g',{class:'brg',mask:'url(#'+mid+')'});g.append(wg);const el=piece(id,pts,w,cls,wg,delay,ms,undefined,o.bx);const fg=sv('g',{});wg.append(fg);
  if(!o.flat){const bl=sv('g',{'clip-path':'url(#'+clipId+')',filter:'url(#'+softId+')'}),gr=sv('g',{'clip-path':'url(#'+clipId+')'}),lw=sv('g',{},bl,gr);wg.append(lw);shade(pts,w,eo,bl);if(b>4.5)grain(pts,w,gbHash('grain:'+id),gr,o.bs,eo);el.__also=[lw]}
  /* the fillets: round the collar on either side with a radius of 1.2 of the limb's base girth, from the parent's edge that
     far past the limb's edge into the limb's edge that far past the parent's, round a corner pulled toward the crotch; closed
     through both centre lines so they are part of the same wood */
  const pp=P.pts,k=P.k,n1=pp.length-1,c=pp[k],cd=[pts[eo+2][0]-c[0],pts[eo+2][1]-c[1]],pn=gbNorm(pp,k),sgn=pn[0]*cd[0]+pn[1]*cd[1]>0?1:-1;
  const ptg=[pp[Math.min(n1,k+1)][0]-pp[Math.max(0,k-1)][0],pp[Math.min(n1,k+1)][1]-pp[Math.max(0,k-1)][1]],cn=gbNorm(pts,eo),fw=cn[0]*ptg[0]+cn[1]*ptg[1]>0?1:-1;
  const pA=gbLen(pp),sk=pA[k],at=(Q,A2,W2,s0)=>{let i=1;while(i<Q.length-1&&A2[i]<s0)i++;const i0=i-1,t=Math.max(0,Math.min(1,(s0-A2[i0])/((A2[i]-A2[i0])||1))),n=gbNorm(Q,t<.5?i0:i);return {q:[Q[i0][0]+(Q[i][0]-Q[i0][0])*t,Q[i0][1]+(Q[i][1]-Q[i0][1])*t],n,w:W2[i0]+(W2[i]-W2[i0])*t}};
  const rF=1.2*b,hwL=at(pts,acc,w,Tk/2).w/2,sL=Tk/2+rF,pE=s0=>{const e=at(pp,pA,P.w,s0);return [e.q[0]+e.n[0]*e.w/2*sgn,e.q[1]+e.n[1]*e.w/2*sgn]},bE=(s0,s1)=>{const e=at(pts,acc,w,s0);return [e.q[0]+e.n[0]*e.w/2*s1,e.q[1]+e.n[1]*e.w/2*s1]};
  const fil=(a,bb,cc)=>{const m2=[(a[0]+bb[0])/2,(a[1]+bb[1])/2],ctl=[cc[0]+(m2[0]-cc[0])*.45,cc[1]+(m2[1]-cc[1])*.45];return 'M'+gbP(a)+' Q'+gbP(ctl)+' '+gbP(bb)+' L'+gbP(at(pts,acc,w,sL).q)+' L'+gbP(c)+'Z'};
  const fA=[pE(sk+hwL+rF),bE(sL,fw),bE(Tk/2,fw)],fB=[pE(sk-hwL-rF),bE(sL,-fw),bE(Tk/2,-fw)];
  /* the collar: the wood swells round the limb where it leaves, half again its girth across */
  const ca=Math.atan2(pts[eo+2][1]-pts[eo][1],pts[eo+2][0]-pts[eo][0])*180/Math.PI,col=sv('ellipse',{cx:gbF(pts[eo][0]),cy:gbF(pts[eo][1]),rx:gbF(.5*b),ry:gbF(.65*b),transform:'rotate('+gbF(ca)+' '+gbP(pts[eo])+')',class:cls});
  /* (all that it lays on its parent is kept on it, el.__on: a cut flush at the parent takes it away with the limb) */
  /* (what it lays on its parent, kept as outlines too, so a shoot and its leaves keep off it: B.lay) */
  {const lay=B.lay||(B.lay=[]),q2=(a,bb,cc)=>{const m2=[(a[0]+bb[0])/2,(a[1]+bb[1])/2],ct=[cc[0]+(m2[0]-cc[0])*.45,cc[1]+(m2[1]-cc[1])*.45],P=[];for(let t=0;t<=1.001;t+=.125)P.push([(1-t)*(1-t)*a[0]+2*(1-t)*t*ct[0]+t*t*bb[0],(1-t)*(1-t)*a[1]+2*(1-t)*t*ct[1]+t*t*bb[1]]);P.push(at(pts,acc,w,sL).q,c);return P};
   lay.push(q2(...fA),q2(...fB));const cr=ca*Math.PI/180,E=[];for(let i=0;i<12;i++){const t=i*Math.PI/6,x=.5*b*Math.cos(t),y=.65*b*Math.sin(t);E.push([pts[eo][0]+x*Math.cos(cr)-y*Math.sin(cr),pts[eo][1]+x*Math.sin(cr)+y*Math.cos(cr)])}lay.push(E)}
  /* (the collar, the fillets and the crotch's shade come in as the limb starts and are whole by the time its front leaves
     the parent's edge, so the fork never shows the page, or the parent's lit side, as a seam while the limb grows out: the
     front's own clock, not the later one its whole girth keeps, gbWood's lag) */
  const r0=el.__r,fd=Math.max(40,Math.min(240,r0?gbWT(Object.assign({},r0,{lg:0}),Math.min(1,Tk/2/(acc[n0]||1)))-r0.t0:240));
  const U=gU||fg,on=[col,sv('ellipse',{cx:gbF(pts[eo][0]),cy:gbF(pts[eo][1]),rx:gbF(.5*b),ry:gbF(.65*b),transform:'rotate('+gbF(ca)+' '+gbP(pts[eo])+')'})];U.append(col);clip.append(on[1]);anim('col:'+id,col,delay,fd,'fade');
  for(const f of [fil(...fA),fil(...fB)]){const fp=sv('path',{d:f,class:cls}),fc=sv('path',{d:f});U.append(fp);clip.append(fc);on.push(fp,fc);anim('fil:'+id+f.length,fp,delay,fd,'fade');
   /* the crotch sits in the shade of the limb above it, so the parent's lit side does not run on into it as a pale wedge */
   if(gS){const fs=sv('path',{d:f,class:'filsh'});gS.append(fs);on.push(fs);anim('filsh:'+id+f.length,fs,delay,fd,'fade')}}
  el.__par=pp;el.__pw=P.w;el.__pk=k;el.__col=col;el.__on=on;return {el,wg,fg}};
 /* a branchlet that carries a cushion is bark like its limb: lit on one side, shaded on the other, growing with it */
 const barkOn=(tw,parent)=>{if(sap)return;clip.append(sv('path',{d:tw.getAttribute('d')}));const bl=sv('g',{'clip-path':'url(#'+clipId+')',filter:'url(#'+softId+')'}),lw=sv('g',{},bl);parent.append(lw);shade(tw.__pts,tw.__w,0,bl);tw.__also=[lw]};
 const ribFlat=(pts,w)=>{const A=[],Z=[];pts.forEach((q,i)=>{const n=gbNorm(pts,i),h=w[i]/2;A.push([q[0]+n[0]*h,q[1]+n[1]*h]);Z.push([q[0]-n[0]*h,q[1]-n[1]*h])});return 'M'+A.map(gbP).join(' L')+' L'+Z.reverse().map(gbP).join(' L')+'Z'};
 /* the pot: an unglazed rectangle, about as deep as the trunk is thick, with a two-unit lip and splayed feet, or a small round
    bowl for a lone literati; inside it a mound of bare soil, which the roots lie in and the trunk rises out of */
 const pc=L.potC,pl=L.potL,D=L.D,lone=L.lone,pa=pc-pl/2,pb=pc+pl/2,fh=L.fh||5,kx=L.kpx||1;
 /* its walls lean in toward the foot, the bottom about ninety-six hundredths of the top (L.wallX is the same line) */
 const tp=Math.max(5,.02*pl),ww=y=>tp*Math.max(0,y-2)/Math.max(1,D-2);
 const gid='gb-pot'+N,vid='gb-potv'+N,sid='gb-potsh'+N,soid='gb-soil'+N;const pw=lone?pl/2:pl/2;
 /* unglazed clay lit from the left like the wood, a shadow under the lip, and a soft shadow on the ground */
 defs.append(sv('linearGradient',{id:gid,gradientUnits:'userSpaceOnUse',x1:gbF(pc-pw),y1:'0',x2:gbF(pc+pw),y2:'0'},sv('stop',{offset:0,style:'stop-color:var(--pot-lit)'}),sv('stop',{offset:.4,style:'stop-color:var(--pot)'}),sv('stop',{offset:1,style:'stop-color:var(--pot-dk)'})),
  sv('linearGradient',{id:gid+'l',gradientUnits:'userSpaceOnUse',x1:gbF(pc-pw),y1:'0',x2:gbF(pc+pw),y2:'0'},sv('stop',{offset:0,style:'stop-color:color-mix(in srgb,var(--pot-lit) 70%,#fff)'}),sv('stop',{offset:.4,style:'stop-color:var(--pot-lit)'}),sv('stop',{offset:1,style:'stop-color:var(--pot)'})),
  sv('linearGradient',{id:vid,x1:0,y1:0,x2:0,y2:1},sv('stop',{offset:0,style:'stop-color:#000;stop-opacity:.2'}),sv('stop',{offset:1,style:'stop-color:#000;stop-opacity:0'})),
  sv('radialGradient',{id:sid},sv('stop',{offset:0,style:'stop-color:#000;stop-opacity:.16'}),sv('stop',{offset:1,style:'stop-color:#000;stop-opacity:0'})),
  sv('linearGradient',{id:soid,gradientUnits:'userSpaceOnUse',x1:'0',y1:'-9',x2:'0',y2:'3'},sv('stop',{offset:0,style:'stop-color:var(--soil-lit)'}),sv('stop',{offset:1,style:'stop-color:var(--soil-c)'})));
 if(lone){const r=pl/2;gPot.append(sv('ellipse',{cx:gbF(pc),cy:gbF(D+3.5),rx:gbF(r*.8),ry:3.5,fill:'url(#'+sid+')'}),sv('path',{class:'pot-ft',d:'M'+gbF(pc-r*.3)+' '+gbF(D)+' L'+gbF(pc+r*.3)+' '+gbF(D)+' L'+gbF(pc+r*.27)+' '+gbF(D+3.4)+' L'+gbF(pc-r*.27)+' '+gbF(D+3.4)+'Z'}),
   sv('path',{fill:'url(#'+gid+')',d:'M'+gbF(pc-r)+' 1 L'+gbF(pc+r)+' 1 Q'+gbF(pc+r*.96)+' '+gbF(D)+' '+gbF(pc+r*.55)+' '+gbF(D+2)+' L'+gbF(pc-r*.55)+' '+gbF(D+2)+' Q'+gbF(pc-r*.96)+' '+gbF(D)+' '+gbF(pc-r)+' 1Z'}),
   sv('rect',{x:gbF(pc-r+1),y:2.2,width:gbF(2*r-2),height:5,fill:'url(#'+vid+')'}))}
 else{const f=Math.max(12,.075*pl),sh=Math.min(8,D*.24);
  /* splayed feet under the ends: tucked under the pot, their outer sides leaning out, so it stands wide and steady */
  const foot=(xo,dd)=>{const xi=xo-dd*f,yb=D+fh;return 'M'+gbF(xi)+' '+gbF(D-1)+' L'+gbF(xo)+' '+gbF(D-1)+' L'+gbF(xo+dd*.55*fh)+' '+gbF(yb-1.2)+' Q'+gbF(xo+dd*.62*fh)+' '+gbF(yb)+' '+gbF(xo+dd*(.62*fh-1.4))+' '+gbF(yb)+
   ' L'+gbF(xi+dd*1.6)+' '+gbF(yb)+' C'+gbF(xi+dd*.4)+' '+gbF(yb)+' '+gbF(xi)+' '+gbF(D+fh*.55)+' '+gbF(xi)+' '+gbF(D-1)+'Z'};
  gPot.append(sv('ellipse',{cx:gbF(pc),cy:gbF(D+fh+.6),rx:gbF(pl/2+10),ry:4.4,fill:'url(#'+sid+')'}),sv('path',{class:'pot-ft',d:foot(pa+.085*pl,-1)}),sv('path',{class:'pot-ft',d:foot(pb-.085*pl,1)}),
   sv('path',{class:'pot-b',fill:'url(#'+gid+')',d:'M'+gbF(pa+.5)+' 2 L'+gbF(pb-.5)+' 2 L'+gbF(pb-ww(D-2))+' '+gbF(D-2)+' Q'+gbF(pb-tp)+' '+gbF(D)+' '+gbF(pb-tp-2)+' '+gbF(D)+' L'+gbF(pa+tp+2)+' '+gbF(D)+' Q'+gbF(pa+tp)+' '+gbF(D)+' '+gbF(pa+ww(D-2))+' '+gbF(D-2)+'Z'}),
   sv('path',{fill:'url(#'+vid+')',d:'M'+gbF(pa+1)+' 2 L'+gbF(pb-1)+' 2 L'+gbF(pb-1-ww(2+sh))+' '+gbF(2+sh)+' L'+gbF(pa+1+ww(2+sh))+' '+gbF(2+sh)+'Z'}),
   /* a fine incised band just above the foot, as on a Tokoname pot */
   sv('path',{class:'pot-inc',d:'M'+gbF(pa+ww(D-3.4)+.8)+' '+gbF(D-3.4)+' L'+gbF(pb-ww(D-3.4)-.8)+' '+gbF(D-3.4)}),sv('path',{class:'pot-inc lit',d:'M'+gbF(pa+ww(D-2.6)+.9)+' '+gbF(D-2.6)+' L'+gbF(pb-ww(D-2.6)-.9)+' '+gbF(D-2.6)}))}
 const soilD=lift=>{const xa=pa+1.5,xb=pb-1.5,n=48;let d='M'+gbF(xa)+' 2.4';for(let i=0;i<=n;i++){const x=xa+(xb-xa)*i/n;d+=' L'+gbF(x)+' '+gbF(L.sy(x)+lift)}return d+' L'+gbF(xb)+' 2.4Z'};
 /* the soil is granular: a fine scatter of lighter and darker grains */
 defs.append(sv('pattern',{id:soid+'g',patternUnits:'userSpaceOnUse',width:11,height:7},...[[1.5,1.4,.75,'gl'],[6,3.6,.6,'gd'],[8.8,1,.55,'gl'],[3.4,5.2,.5,'gd'],[9.6,5.6,.65,'gl']].map(([x,y,r,c])=>sv('circle',{cx:x,cy:y,r,class:c}))));
 gPot.append(sv('path',{class:'soil',style:'fill:url(#'+soid+')',d:soilD(0)}),sv('path',{class:'grit',style:'fill:url(#'+soid+'g)',d:soilD(0)}));
 /* over the roots and the trunk's foot, the soil again, so they sink into it rather than sit on it; then the lip. Its surface
    is soft where wood goes into it: a band of the same soil blurred over the line the hard soil starts at, so a root or the
    trunk's foot fades into the ground over two pixels instead of stopping at a ruled edge */
 const ssId='gb-ss'+N,scId='gb-sc'+N;defs.append(sv('filter',{id:ssId,x:'-5%',y:'-200%',width:'110%',height:'500%'},sv('feGaussianBlur',{stdDeviation:'.75'})),sv('clipPath',{id:scId},sv('rect',{x:gbF(pa+1.5),y:gbF(vy),width:gbF(Math.max(1,pl-3)),height:gbF(3-vy)})));
 const soft=(f,a,b)=>{const n=Math.max(2,Math.ceil((b-a)/4));let top='',bot='';for(let k=0;k<=n;k++){const x=a+(b-a)*k/n,y=f(x);top+=(k?' L':'M')+gbF(x)+' '+gbF(y-.8);bot=' L'+gbF(x)+' '+gbF(y+2)+bot}
  return sv('g',{class:'ssoft','clip-path':'url(#'+scId+')'},sv('path',{class:'soil',style:'fill:url(#'+soid+')',filter:'url(#'+ssId+')',d:top+bot+'Z'}))};
 gSoil.append(soft(x=>L.sy(x)+.7,pa+1.5,pb-1.5),sv('path',{class:'soil',style:'fill:url(#'+soid+')',d:soilD(.7)}),sv('path',{class:'grit',style:'fill:url(#'+soid+'g)',d:soilD(.7)}));
 /* the nebari's front roots come toward the eye from the front of the trunk's foot, so they lie over it and over the soil's
    far edge, on the nearer ground, and sink a unit into it there */
 const gNbF=sv('g',{class:'nbfront'});gSoil.append(gNbF);
 /* the air: everything but the soil, the lip and the pot. Moss, a stake's foot and a root's hover ring are cut off where they
    would go into the ground, and so is the bark detail drawn over the wood (a knot's fibres), so none of it shows in the soil */
 const airId='gb-air'+N,lx=2.5;{let g='M'+gbF(pa-lx)+' -1';for(let i=0;i<=48;i++){const x=pa+1.5+(pl-3)*i/48;g+=' L'+gbF(x)+' '+gbF(Math.min(-1,L.sy(x)+.7))}
  g+=' L'+gbF(pb+lx)+' -1 L'+gbF(pb+lx)+' '+gbF(D+fh+2)+' L'+gbF(pa-lx)+' '+gbF(D+fh+2)+'Z';
  defs.append(sv('clipPath',{id:airId},sv('path',{'clip-rule':'evenodd',d:'M'+gbF(vx-10)+' '+gbF(vy-10)+' L'+gbF(vx+W+10)+' '+gbF(vy-10)+' L'+gbF(vx+W+10)+' '+gbF(vy+VH+10)+' L'+gbF(vx-10)+' '+gbF(vy+VH+10)+'Z '+g})));
  defs.append(sv('clipPath',{id:airId+'p'},sv('path',{'clip-rule':'evenodd',d:'M'+gbF(vx-10)+' '+gbF(vy-10)+' L'+gbF(vx+W+10)+' '+gbF(vy-10)+' L'+gbF(vx+W+10)+' '+gbF(vy+VH+10)+' L'+gbF(vx-10)+' '+gbF(vy+VH+10)+'Z M'+gbF(pa-lx)+' -1 L'+gbF(pb+lx)+' -1 L'+gbF(pb+lx)+' '+gbF(D+fh+2)+' L'+gbF(pa-lx)+' '+gbF(D+fh+2)+'Z'})));
  const kl=svg.querySelector(':scope>g.knots');if(kl&&!kl.hasAttribute('clip-path'))kl.setAttribute('clip-path','url(#'+airId+')')}
 /* the lip, over the soil's edge: a rim about four units deep standing out past the wall, the clay a step lighter than the
    body, a fine highlight along its top and a dark line where it overhangs the wall */
 gSoil.append(sv('g',{class:'lip'},sv('rect',{class:'lip-b',x:gbF(pa-lx),y:-1.2,width:gbF(pl+2*lx),height:4.2,rx:1.4,fill:'url(#'+gid+'l)'}),
  sv('path',{class:'lip-hi',d:'M'+gbF(pa-lx+1)+' -.6 L'+gbF(pb+lx-1)+' -.6'}),sv('path',{class:'lip-lo',d:'M'+gbF(pa-lx+.7)+' 2.6 L'+gbF(pb+lx-.7)+' 2.6'})));
 /* the pot is the repository: its name pressed into the middle of the clay's face: no chip, just letters cut into it, a
    shade darker than the clay at three to one or more, their lower edge catching the light */
 if(L.seal){const q=L.seal,n=q.lines.length;
  const tx=(dx,dy,c)=>q.lines.map((t,i)=>sv('text',{x:gbF(q.x+dx),y:gbF(q.y-(n-1-i)*q.lh+dy),'text-anchor':q.an,class:c,style:'font-size:'+gbF(q.fs)+'px'},t));
  gPot.append(sv('g',{class:'seal','aria-hidden':'true','data-room':gbF(q.room)},...tx(0,.7,'sl'),...tx(0,0,'sm')))}
 /* roots: the nebari first, then the named ones over them; a third party's goes over the lip, so it is drawn after it */
 L.roots.forEach((r,i)=>{if(!r.pts)return;const id='r'+i+(r.id?':'+r.id:'');const g=sv('g',r.id?{class:'rt dep'+(r.ext?' ext':' store')+(r.loose?' loose':'')+(r.stop?' stop':''),'data-k':'u:'+r.id,tabindex:-1,role:'button','aria-label':M.U[r.id].label+', what the change depends on'+(r.loose?', on no journey':'')+(r.stop?', where tracing stops':'')}:{class:'nbf'+(r.front?' fr':'')});
  if(!r.ext)g.setAttribute('clip-path','url(#'+airId+'p)');
  /* an unused store's root is partly sunk: only what stands above the soil's surface shows, its cut end lifting out of it */
  const body=r.loose?sv('g',{class:'rsev','clip-path':'url(#'+airId+')'}):g;if(r.loose)g.append(body);
  const pts=r.pts,n=pts.length;const wd=piece(id,pts,r.w,'w',body,r.tree*250+80,520),delay=gbWT(wd.__r,1)-520-now;if(r.id){(B.rootE=B.rootE||{})[r.id]=delay+520;(B.rootR=B.rootR||{})[r.id]=wd.__r}
  /* a root's upper side catches the light, which parts each finger from the one behind it, and its upper edge carries a fine
     rim light, so on a dark page it stands off the soil and the night */
  if(!r.loose){const m=gbNorm(pts,Math.floor(n*.35)),up=m[1]<0?1:-1,hl=sv('path',{class:'rhi',d:gbBand(pts.slice(0,r.ext?Math.ceil(n*.62):n),r.w,up*.25,up*.9)}),rim=sv('path',{class:'rlim',d:gbBand(pts,r.w,up*.74,up*1.04)});g.append(hl,rim);anim('rhi:'+id,hl,delay+520,300,'fade');anim('rlim:'+id,rim,delay+520,300,'fade')}
  else{const m=gbNorm(pts,Math.floor(n*.5)),up=m[1]<0?1:-1,rim=sv('path',{class:'rlim',d:gbBand(pts,r.w,up*.7,up*1.02)});body.append(rim);anim('rlim:'+id,rim,delay+520,300,'fade')}
  /* its far end is cut: a face of pale wood with two growth rings, cut on a slant so it shows */
  if(r.loose)wd.before(sv('path',{d:wd.getAttribute('d'),class:'rbed'}));
  if(r.loose){const c=pts[n-1],w0=r.w[n-1],a=Math.atan2(c[1]-pts[n-3][1],c[0]-pts[n-3][0])*180/Math.PI,rx=w0*.42,ry=w0*.54,arc=(k,a0,a1)=>{const p=t=>[c[0]+Math.cos(t)*rx*k,c[1]+Math.sin(t)*ry*k];return 'M'+gbP(p(a0))+' A'+gbF(rx*k)+' '+gbF(ry*k)+' 0 1 1 '+gbP(p(a1))};
   body.append(sv('g',{class:'rcutg',transform:'rotate('+gbF(a)+' '+gbP(c)+')'},sv('ellipse',{class:'rcut',cx:gbF(c[0]),cy:gbF(c[1]),rx:gbF(rx),ry:gbF(ry)}),sv('path',{class:'rring2',d:arc(.64,-2.2,1.9)}),sv('path',{class:'rring2',d:arc(.3,-1.4,2.6)})))}
  if(r.id){body.insertBefore(sv('path',{d:wd.getAttribute('d'),class:'rring','clip-path':'url(#'+airId+')'}),body.firstChild);
   g.append(sv('path',{d:gbLine(pts),class:'hitl','stroke-width':14}));
   if(r.stop){const e=pts[n-1];const z=r.ext?[L.wallX(r.d,D+11)+r.d*1.9,D+11]:[e[0]+r.d*2,e[1]+7];const gid='gb-fade'+N+'-'+i;
    defs.append(sv('linearGradient',{id:gid,gradientUnits:'userSpaceOnUse',x1:gbF(e[0]),y1:gbF(e[1]),x2:gbF(z[0]),y2:gbF(z[1])},sv('stop',{offset:0,style:'stop-color:var(--muted);stop-opacity:1'}),sv('stop',{offset:1,style:'stop-color:var(--muted);stop-opacity:.15'})));
    const tl=sv('g',{class:'tailg'},sv('path',{class:'tail',d:'M'+gbP(e)+' L'+gbP(z),stroke:'url(#'+gid+')'}),sv('circle',{class:'tailend',cx:gbF(z[0]),cy:gbF(z[1]+2.2),r:1.9}));g.append(tl);anim('tail:'+id,tl,delay+520,300,'fade')}
   B.root[r.id]=g;B.pos[r.id]=pts[Math.min(n-1,Math.floor(n*(r.ext?.5:.6)))];B.nav.push('u:'+r.id);B.navEl['u:'+r.id]=g}
  /* a store's plant tag: a small rounded tag on a wooden stake pushed into the soil, its foot cut off at the soil; an unused
     store's stake is pushed into its root's cut face */
  if(r.id&&!r.ext){const l=L.rl.find(q=>q.r===r&&q.tag);if(l){const ft=r.loose?pts[n-1][1]:l.gy+3.6*kx;
   const tg=sv('g',{class:'ptag'},sv('path',{class:'stake','clip-path':'url(#'+airId+')','stroke-width':gbF(1.35*kx),d:'M'+gbP([l.sx,ft])+' L'+gbP([l.sx,l.bot+1])}),sv('rect',{class:'tag',x:gbF(l.x-l.ww/2),y:gbF(l.top),width:gbF(l.ww),height:gbF(l.th),rx:gbF(2.6*kx)}));g.append(tg);anim('stake:'+id,tg,delay+560,300,'fade')}}
  if(!r.id&&r.front){const T=L.trees[r.tree],a=pts[0][0],e=pts[n-1][0],dd=e>a?1:-1,fid='gb-nbm'+N+'-'+i;
   /* it grows out of the trunk's surface: faded in over its first stretch, which lies over the trunk */
   defs.append(sv('linearGradient',{id:fid+'g',gradientUnits:'userSpaceOnUse',x1:gbF(a),y1:'0',x2:gbF(a+dd*.36*T.D),y2:'0'},sv('stop',{offset:0,style:'stop-color:#000'}),sv('stop',{offset:1,style:'stop-color:#fff'})),
    sv('mask',{id:fid,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)},sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'url(#'+fid+'g)'})));
   g.setAttribute('mask','url(#'+fid+')');gNbF.append(g);
   const x0=Math.max(pa+1.5,Math.min(a,e)-1),x1=Math.min(pb-1.5,Math.max(a,e)+2),m=Math.max(2,Math.ceil((x1-x0)/4));let top='',bot='';
   for(let k=0;k<=m;k++){const x=x0+(x1-x0)*k/m;top+=(k?' L':'M')+gbF(x)+' '+gbF(Math.min(L.fy(x),-1));bot=' L'+gbF(x)+' -1'+bot}
   gNbF.append(soft(x=>Math.min(L.fy(x),-1),x0,x1),sv('path',{class:'soil',style:'fill:url(#'+soid+')',d:top+bot+'Z'}),sv('path',{class:'grit',style:'fill:url(#'+soid+'g)',d:top+bot+'Z'}));return}
  (r.id?gRootX:gRoot).append(g)});
 /* and over the named roots' lower edges the soil once more, so they lie in it, a unit deep, rather than on it */
 {const gx=sv('g',{class:'soilx'});for(const r of L.roots){if(!r.id||!r.pts)continue;let a=1e9,b=-1e9;r.pts.forEach((p,ii)=>{if(p[0]>pa+1.5&&p[0]<pb-1.5&&p[1]+r.w[ii]/2>L.sy(p[0])+.7){a=Math.min(a,p[0]-r.w[ii]/2);b=Math.max(b,p[0]+r.w[ii]/2)}});
   const l=L.rl.find(q=>q.r===r&&q.tag);if(l){a=Math.min(a,l.sx-2);b=Math.max(b,l.sx+2)}if(b<a)continue;a=Math.max(pa+1.5,a-1);b=Math.min(pb-1.5,b+1);const n=Math.max(2,Math.ceil((b-a)/4));let top='',bot='';
   for(let k=0;k<=n;k++){const x=a+(b-a)*k/n,y=L.sy(x);top+=(k?' L':'M')+gbF(x)+' '+gbF(y+.7);bot=' L'+gbF(x)+' '+gbF(Math.max(y+.7,Math.min(y+4.2,-1)))+bot}
   gx.append(soft(x=>L.sy(x)+.7,a,b),sv('path',{class:'soil',style:'fill:url(#'+soid+')',d:top+bot+'Z'}),sv('path',{class:'grit',style:'fill:url(#'+soid+'g)',d:top+bot+'Z'}))}
  gRootX.after(gx)}
 for(const l of L.rl){const t=sv('text',{x:gbF(l.x),y:gbF(l.y),'text-anchor':l.anchor,class:'rlbl'+(l.tag?' tg':'')+(l.note?' nt':''),style:'font-size:'+gbF(l.fs||L.fs)+'px'},l.t,l.unused?sv('tspan',{class:'nt'},' · unused'):null);(B.root[l.r.id]||gRoot).append(t);anim('rl:'+l.r.id,t,(B.rootE||{})[l.r.id]!==undefined?B.rootE[l.r.id]+40:l.r.tree*250+560,300,'fade')}
 let lightAt=0;
 /* What a leaf or a cushion waits for: when its own twig has grown (B.twEnd), and when the first of a cushion's leaves' twigs
    starts, the fork they leave the wood at and when the last ends (B.cuS); where a riser or branchlet has started, for the
    twigs off it (lbS); and where each growing branch has reached, by when (B.brAt). Times are the page clock's. */
 B.twEnd={};B.cuS={};B.brAt={};const lbS=new Map(),lbAt=(pts,i,d)=>{const r=lbS.get(pts),a=gbLen(pts);return r===undefined?d:gbWT(r,a[i]/(a[a.length-1]||1))-now};
 const twRec=(pid,t,r,tpp)=>{if(t.k===undefined)return;if(t.sec){t.r0=r;t.p0=tpp[0];return}if(!t.id)return;B.twEnd[t.id]=r.t0+r.ms;const C=B.cuS[pid]=B.cuS[pid]||{},q=C[t.k]=C[t.k]||{s:Infinity,e:0,f:[],fh:[]},rn=t.c&&t.c.sec&&t.c.r0?t.c:null;q.s=Math.min(q.s,rn?rn.r0.t0:r.t0);q.e=Math.max(q.e,r.t0+r.ms);(t.hang?q.fh:q.f).push(rn?rn.p0:tpp[0])};
 /* trees */
 L.trees.forEach((T,ti)=>{const X=L.xs[ti];const sh=q=>[q[0]+X,q[1]];const base=ti*250;const tp=T.tp.map(sh);
  /* every piece keeps its reveal by its own key for the whole grow, so a rebuild (a journey joined, a scenario was drafted)
     carries on what was growing and never grows again what was already seen */
  const gk='@'+ti;
  /* (a sapling, the trunk that rises while the first journey is still being traced, grows slowly enough to be seen growing:
     the tree that replaces it carries its reveal on, so it is still rising as the first branches leave it) */
  const tdur=sap?2400:1100;const tkw=piece('t'+gk,tp,T.tw,'w',gWood,base,tdur,1.5,T.bx);rxMask.append(sv('path',{d:gbRib(tp,T.tw,0,tp.length-1,undefined,T.bx),fill:'#000'}));if(!sap){/* the growth mask goes outside the softening, so the growing end stays crisp */const tcid='gb-tc'+N+'-'+ti;defs.append(sv('clipPath',{id:tcid},sv('path',{d:gbRib(tp,T.tw,0,tp.length-1,1.5,T.bx)})));const tl=sv('g',{}),tli=sv('g',{'clip-path':'url(#'+tcid+')',filter:'url(#'+softId+')'}),tgr=sv('g',{});tl.append(tli);gLight.after(tl);gGrain.append(tgr);/* (the shade side starts above the flare: in the spread foot it would read as a dark hollow between two legs, where the
   foot is one solid base) */const fl=(()=>{const a=gbLen(tp),L=a[a.length-1]||1,iT=a.findIndex(v=>v>=L*.22),wT=T.tw[Math.max(0,iT)]||T.tw[0];let i=2;while(i<tp.length-2&&T.tw[i]>wT*1.12)i++;return i})();shade(tp,T.tw,fl,tli);grain(tp,T.tw,gbHash('grain:'+T.key),tgr,T.knots.filter(q=>q.on==='t').map(q=>[q.k,q.off,q.rb]));tkw.__also=[tl,tgr]}lightAt=Math.max(lightAt,base+tdur);
  /* times on this tree are read off its trunk's own reveal (a rebuild part way through keeps that clock): when the growing
     front passes a point of it, so a branch, twig, knot or cushion first seen in a later build keeps step with its wood */
  const tr=tkw.__r,accT=gbLen(tp),LT=accT[accT.length-1]||1,atK=k=>gbWT(tr,accT[Math.max(0,Math.min(tp.length-1,k))]/LT)-now,at=t=>atK(gbNear(T.ty,t)),tEnd=gbWT(tr,1)-now;
  /* while the change is still being traced the tree is a sapling, with a bud at its tip */
  if(sap){const tt=tp[tp.length-1],t0=tp[tp.length-4],a=Math.atan2(tt[1]-t0[1],tt[0]-t0[0])*180/Math.PI;const bd=sv('g',{class:'tipbud'});
   for(const da of [-34,30])bd.append(sv('path',{d:gbLeafD(11,5.6),transform:'translate('+gbP(tt)+') rotate('+gbF(a+da)+') translate(5.5 0)'}));gWood.append(bd);anim('tipbud:'+ti,bd,tEnd-160,320,'fade')}
  /* jin: changed parts no journey reaches, as bleached deadwood on the back of the main trunk */
  if(!ti&&!sap){M.jin.slice(0,3).forEach((u,i)=>{const t=.15+.075*i,k=gbNear(T.ty,t),p=tp[k],d=i%2?T.S:-T.S,len=.07*T.H;const a=55*Math.PI/180;
    const pts=gbBez([p,[p[0]+d*len*.35,p[1]-len*.1],[p[0]+d*len*.7,p[1]-len*.5],[p[0]+d*Math.cos(a)*len,p[1]-Math.sin(a)*len]],10);const w=pts.map((q,ii)=>Math.max(1.4,5.2*(1-ii/10*.75)));
    const g=sv('g',{class:'jn','data-k':'u:'+u.id,tabindex:-1,role:'button','aria-label':u.label+': changed, but no journey in this change reaches it'});
    piece('j'+ti+'-'+u.id+gk,pts,w,'jin',g,at(t),500);g.append(sv('circle',{cx:gbF(pts[10][0]),cy:gbF(pts[10][1]),r:9,class:'hitc'}));gJin.append(g);B.jinEl[u.id]=g;B.pos[u.id]=pts[10];B.nav.push('u:'+u.id);B.navEl['u:'+u.id]=g})}
  /* one group per pad: its branch, branchlets, knots, foliage and leaves, so dimming or pruning a journey treats it as one thing */
  const JG={};for(const pd of [...T.padList.slice(1).sort((a,b)=>a.b.h-b.b.h),T.padList[0]]){const back=pd.b&&pd.b.back;const jg=sv('g',{class:'jg'+(pd.crown?' crown':''),'data-pad':pd.id});(back?gBack:gFront).append(jg);JG[pd.id]=jg}
  /* branches: the wood fades in from the trunk's edge so the joint has no seam, a collar fills the crotch, branchlets fork
     up into the pad, and pruning leaves a short stub with a flat cut */
  for(const b of T.br){const pts=b.pts.map(sh),id='b'+ti+':'+b.id,jg=JG[b.id];const delay=atK(b.k),ms=380+1.5*b.len;const old=b.back?' old':'';
   /* the branch is a limb off the trunk like any other, its knots' bosses swelling its outline and parting its grain */
   const bk=T.knots.filter(q=>q.bid===b.id).map(q=>[q.k,q.off,q.rb]);
   const lm=limb(id,pts,b.w,{pts:tp,w:T.tw,k:b.k},'w'+old,jg,b.back?null:gWood,b.back?null:gGrain,delay,ms,{bx:b.bx,bs:bk,flat:b.back}),wg=lm.wg;lightAt=Math.max(lightAt,delay+ms);
   /* where the growing branch has reached, by when (its reveal runs on an ease-out along its length) */
   const bR=lm.el.__r,bF=k=>gbWT(bR,Math.min(1,b.acc[k]/(b.len||1)))-now;B.brAt[b.id]=bF;
   b.twigs.forEach((t,tk)=>{const tpp=t.pts.map(sh);
    /* a twig starts once the growing wood has reached its base: the branch, or the riser it forks from; one first drawn
       after that (a scenario drafted later) starts growing then, never all at once */
    const ts=Math.max(0,t.c?lbAt(t.c.pts,t.bi,bF(t.c.bi)+320*t.bi/(t.c.pts.length-1)):bF(t.bi));
    /* the riser a raised crest stands on is a limb off the branch, grown the same way */
    if(t.lb)lbS.set(t.pts,limb('tw:'+id+':'+tk,tpp,t.w,{pts,w:b.w,k:t.bi},'w'+old,jg,lm.fg,b.back?null:wg,ts,320,{flat:b.back}).el.__r);
    else{const k='tw:'+id+':'+(t.id||(t.sec?'h'+t.sec:tk));const tw=sv('path',{d:gbRib(tpp,t.w),class:'tw'+(t.id?' lt':'')+(t.fk?' fk':'')+old});tw.__pts=tpp;tw.__w=t.w;if(t.fk)tw.__k=t.k;jg.append(tw);if(t.id)(B.ltw=B.ltw||{})[t.id]=[tw];else if(t.sec)(B.ltwr=B.ltwr||{})[t.sec]=tw;else if(!b.back&&!t.fk)barkOn(tw,jg);const r=anim(k,tw,ts,320,'grow');if(t.fk===1||t.sec)lbS.set(t.pts,r);twRec(b.id,t,r,tpp)}});
   /* where a pruning of it heals: cut flush where it left the trunk, no stub or peg, the cut rolled over with callus in the
      bark's own tones, a thin lit crescent on its outer lip; with how many scenarios the branch held */
   const pdl=T.pads[b.id].leaves.length;const cA=gbNear(b.acc,b.Tk/2),cq=pts[cA],cw=b.w[cA],cb=pts[Math.min(pts.length-1,cA+2)],cm=Math.hypot(cb[0]-cq[0],cb[1]-cq[1])||1,cn=[(cb[0]-cq[0])/cm,(cb[1]-cq[1])/cm];
   const t1=tp[Math.min(tp.length-1,b.k+1)],t2=tp[Math.max(0,b.k-1)],tm=Math.hypot(t1[0]-t2[0],t1[1]-t2[1])||1,ctg=[(t1[0]-t2[0])/tm,(t1[1]-t2[1])/tm],cry=Math.max(2,cw*.26),cc=[cq[0]-cn[0]*cry*.5,cq[1]-cn[1]*cry*.5];
   const stub=gbCal(cc,ctg,cn,Math.max(3,cw*.52),cry,'stub',sv('text',{x:gbF(cc[0]+b.dir*(cry+6)),y:gbF(cc[1]+4),'text-anchor':b.dir>0?'start':'end',class:'mlbl'},pdl+' pruned'),sv('circle',{cx:gbF(cc[0]),cy:gbF(cc[1]),r:14,class:'hitc'}));
   stub.setAttribute('data-k','j:'+b.j.id);stub.setAttribute('data-pad',b.id);gScar.append(stub);
   /* the cut a mode will make, shown while that mode is previewed */
   const qi=gbNear(b.acc,b.Tk/2+12),q=pts[qi],qn=gbNorm(pts,qi),qh=b.w[qi]/2+6;const cutmk=sv('path',{class:'cutmk',d:'M'+gbP([q[0]-qn[0]*qh,q[1]-qn[1]*qh])+' L'+gbP([q[0]+qn[0]*qh,q[1]+qn[1]*qh])});
   const cuttag=sv('text',{x:gbF(q[0]),y:gbF(q[1]-qh-5),'text-anchor':'middle',class:'cuttag'},'');gKn.append(cutmk,cuttag);
   jg.append(sv('path',{d:gbLine(pts.slice(b.exit,Math.round(.6*(pts.length-1)))),class:'hitl','stroke-width':16,'data-k':'j:'+b.j.id,'data-pad':b.id}));
   B.brEl[b.id]={g:wg,jg,stub,cutmk,cuttag,col:cq,on:lm.el.__on}}
  /* the leader forks into the crown */
  /* a branchlet starts once the leader has grown to it, out from under its bark, and a leaf's twig once its own wood has */
  T.ctw.forEach((t,tk)=>{const tpp=t.pts.map(sh),ak='ctw:'+ti+':'+(t.id||(t.sec?'h'+t.sec:tk))+gk,t0=Math.max(0,t.c?lbAt(t.c.pts,t.bi,atK(t.c.bi)+320*t.bi/(t.c.pts.length-1)):atK(t.bi));
   /* the branchlets that carry the crown's shoulders, or hang its failures, are limbs off the leader like any branch */
   if(t.lb)lbS.set(t.pts,limb(ak,tpp,t.w,{pts:tp,w:T.tw,k:t.bi},'w',JG[T.apex.id],gWood,gGrain,t0,320).el.__r);
   else{const tw=sv('path',{d:gbRib(tpp,t.w),class:'tw'+(t.id?' lt':'')+(t.fk||t.fork?' fk':'')});tw.__pts=tpp;tw.__w=t.w;(t.id||t.sec?JG[T.apex.id]:gBud).append(tw);if(t.id)(B.ltw=B.ltw||{})[t.id]=[tw];else if(t.sec)(B.ltwr=B.ltwr||{})[t.sec]=tw;else barkOn(tw,gBud);const r=anim(ak,tw,t0,320,'grow');if(t.fk===1||t.fork||t.sec)lbS.set(t.pts,r);twRec(T.apex.id,t,r,tpp)}});
  /* knots: a raised boss on the bark, its file named beside it when its journey is lit */
  const padBox=T.padList.map(pd=>{const o=sh(T.origin[pd.id]),g=pd.geo;return [o[0]-g.PW/2,o[1]-g.PH-6,o[0]+g.PW/2,o[1]+g.drop+2]});const placed=L.rl.map(l=>{if(l.box)return l.box;const w0=gbW(l.t+(l.r.stop&&!l.bare&&!l.note?' · trace stops':''),L.fs*.62),x0=l.anchor==='start'?l.x:l.anchor==='end'?l.x-w0:l.x-w0/2;return [x0-2,l.y-L.fs,x0+w0+2,l.y+3]});
  T.knots.forEach(kn=>{const q=sh(kn.p);placed.push([q[0]-6,q[1]-6,q[0]+6,q[1]+6])});
  /* and off the journeys' names and the phone's numbers */
  for(const pid in T.lbl){const l=T.lbl[pid],lx=l.x+X,a=l.anchor==='start'?lx:l.anchor==='end'?lx-l.w:lx-l.w/2;placed.push([a,l.y-29,a+l.w,l.y-29+l.hgt])}
  for(const jid in T.badge||{}){const q=T.badge[jid];placed.push([q.x+X-12,q.y-12,q.x+X+12,q.y+12])}const potBox=[L.potC-L.potL/2-4,L.narrow?-11:-16,L.potC+L.potL/2+4,L.D+40];placed.push(potBox);for(let k=0;k<tp.length-1;k+=2){const k2=Math.min(tp.length-1,k+2),hw=Math.max(T.tw[k],T.tw[k2])/2;padBox.push([Math.min(tp[k][0],tp[k2][0])-hw,Math.min(tp[k][1],tp[k2][1])-1,Math.max(tp[k][0],tp[k2][0])+hw,Math.max(tp[k][1],tp[k2][1])+1])}
  const ov=(r,q)=>Math.max(0,Math.min(r[2],q[2])-Math.max(r[0],q[0]))*Math.max(0,Math.min(r[3],q[3])-Math.max(r[1],q[1]));
  for(const b of T.br)for(let k=0;k<b.pts.length-1;k+=2){const q=sh(b.pts[k]),q2=sh(b.pts[Math.min(b.pts.length-1,k+2)]),hw=b.w[k]/2;padBox.push([Math.min(q[0],q2[0])-hw,Math.min(q[1],q2[1])-hw,Math.max(q[0],q2[0])+hw,Math.max(q[1],q2[1])+hw])}
  /* a cushion is opaque: a shoot or a name behind or over one hides it or its leaves, so it weighs as much as a name */
  const nPad=T.padList.length,hits=(r)=>padBox.reduce((a,q,i)=>a+ov(r,q)*(i<nPad?3:1),0)+placed.reduce((a,q)=>a+ov(r,q),0)*3;
  /* hairlines already drawn, and how many points of a new one land on something drawn */
  const segs=[],inBox=(p,q)=>p[0]>q[0]&&p[0]<q[2]&&p[1]>q[1]&&p[1]<q[3];
  /* (what the hairline starts in, its own knot and the wood under it, it cannot help crossing) */
  const segHit=(a,b,o)=>{let c=0;const sk=q=>q!==potBox&&o&&o[0]>q[0]-3&&o[0]<q[2]+3&&o[1]>q[1]-3&&o[1]<q[3]+3;const P=placed.filter(q=>!sk(q)),Q=padBox.filter(q=>!sk(q));
   for(let i=1;i<=9;i++){const t=i/10,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(P.some(q=>inBox(p,q))||Q.some(q=>inBox(p,q)))c++}return c};
  const rectSegs=r=>{let c=0;for(const [a,b] of segs)for(let i=0;i<=10;i++){const t=i/10;if(inBox([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],r))c++}return c};
  /* Max: a part's own checks grow as one unpruned shoot out of that part's knot, the growth a minimum prunes away (the existing
     flows that reach it are graft buds on the knot itself). A shoot grows as a grower lets one run: from its knot's boss, so
     only on the outside of the wood's bend; never at a fork or in its crotch (one and a half of its wood's girths clear of every
     fork, and off a limb's first 15 per cent); forty pixels from any other shoot; rising all the way and leaning no more than 35 degrees off
     upright, each at its own angle and length; and neither it nor its leaves lie on the wood. It holds its checks as small
     leaves set alternately along it, and its count says how many it holds, the same as its knot's. A knot with no such
     place keeps its checks as a dormant bud: the count alone, tied to its boss. A root's checks send up a sucker from the
     trunk above the flare; a part on no knot, a shoot under the crown. Its route back to the soil is the wood it grows from. */
  if(!sap&&!ti){const out=r=>Math.max(0,vx+4-r[0])+Math.max(0,r[2]-(vx+W-4))+Math.max(0,vy+2-r[1]),kq=L.narrow?GB_NK:1;
   const own=id=>(M.buds[id]||[]).filter(x=>x.scenarioKind!=='regression');
   /* the wood a shoot and its leaves keep off, and the forks it keeps clear of: a limb's foot on its parent, a twig's on its limb */
   const wS=[],fk=[],ribs=[[tp,T.tw,T.bx]],addW=(pts,w,bx)=>{for(let k=0;k<pts.length;k++)wS.push([pts[k][0],pts[k][1],(w[k]||1)/2]);if(bx!==0)ribs.push([pts,w,bx])};addW(tp,T.tw,0);
   for(const b of T.br){addW(b.pts.map(sh),b.w,b.bx);fk.push([tp[b.k],T.tw[b.k],b.w[0]]);for(const t of b.twigs||[]){addW(t.pts.map(sh),t.w);if(!(t.c&&t.c.sec))fk.push([sh(t.pts[0]),b.w[t.bi]||b.w[0],t.w[0]])}}
   for(const t of T.ctw||[]){addW(t.pts.map(sh),t.w);if(!(t.c&&t.c.sec))fk.push([sh(t.pts[0]),T.tw[t.bi]||1,t.w[0]])}
   const inW=(p,m)=>wS.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<q[2]+m);
   /* (the wood as drawn: each limb's outline with its swell over each boss, and the collar and fillets it lays on its parent) */
   const ribIn=(p,m)=>ribs.some(([P,w,bx])=>{for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1],dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;if(!l2)continue;const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2;if(t<-.1||t>1.1)continue;
    const j=t<.5?i:i+1,n=gbNorm(P,j),o=(p[0]-a[0])*n[0]+(p[1]-a[1])*n[1],e=bx&&bx[j]||0,h=(w[j]||1)/2;if(o<h+Math.max(e,0)+m&&o>-(h+Math.max(-e,0)+m))return true}return false});
   const layIn=(p,m)=>(B.lay||[]).some(P=>{let ins=false,dm=1e9;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j],dx=b[0]-a[0],dy=b[1]-a[1];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<dx*(p[1]-a[1])/dy+a[0])ins=!ins;const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));dm=Math.min(dm,Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t))}return ins||dm<m});
   const inWF=p=>ribIn(p,1)||fk.some(([f,pw,lw])=>Math.hypot(p[0]-f[0],p[1]-f[1])<pw/2+.9*(lw||0));
   const grow1=(pl,k0,wd,uids,kid,routeOf,lo,pref,bs,tf,limb,dp)=>{let best=null;const n1=pl.length-1,acc=gbLen(pl),step=acc[n1]/n1,jA=(gbHash('sha:'+kid)-.5)*12,jL=1+(gbHash('shl:'+kid)-.5)*.3;
    const c=uids.reduce((a,id)=>a+own(id).length,0),nl=Math.max(1,Math.min(c,4));
    /* a knot's shoot comes from its boss; a sucker or a shoot on no knot from the trunk, as near where it was asked as it can */
    /* (out of the boss's rim, at the bark; where nothing can grow from there, from a little deeper in the boss; and where its
       limb, held thick past its collar, is too deep to clear from there, from the boss's inner rim, over the limb's bark) */
    const inPad=r=>padBox.slice(0,nPad).reduce((a,q)=>a+ov(r,q),0)>.2*(r[2]-r[0])*(r[3]-r[1]);
    for(const bf of bs?[.8,.55,-.8]:[0]){if(best&&!best.o&&!inPad(best.r))break;best=null;
    for(const off of bs?[0]:[0,6,-6,12,-12,18,-18,24,-24,32,-32,40,-40,50,-50,60,-60,72,-72,84,-84]){const kk=Math.max(lo,Math.min(n1-2,k0+Math.round(off/step)));const a=pl[kk],n=gbNorm(pl,kk),wk=wd[kk];
     /* the outside of the bend: away from the middle of the chord across it; where the wood runs straight, the asked side */
     const ka=pl[Math.max(0,kk-6)],kb=pl[Math.min(n1,kk+6)],cv=(a[0]-(ka[0]+kb[0])/2)*n[0]+(a[1]-(ka[1]+kb[1])/2)*n[1];
     const side=bs?bs.side:Math.abs(cv)>1.2?Math.sign(cv):pref&&n[0]*pref<0?-1:1,ns=[n[0]*side,n[1]*side];
     const b0=bs?[bs.p[0]+ns[0]*bs.rb*bf,bs.p[1]+ns[1]*bs.rb*bf]:[a[0]+ns[0]*(wk/2-1.2),a[1]+ns[1]*(wk/2-1.2)];
     if(fk.some(([f])=>Math.hypot(b0[0]-f[0],b0[1]-f[1])<1.5*wk+2)||limb&&acc[kk]<.15*acc[n1])continue;
     if((B.shootGeo||[]).some(g=>Math.hypot(g.base[0]-b0[0],g.base[1]-b0[1])<40*kq))continue;
     /* it leans to the side its boss faces (or, where that runs it into the wood, the other), out of the wood first, then up */
     const sx0=Math.abs(ns[0])>.2?Math.sign(ns[0]):jA<0?-1:1;
     for(const sx of [sx0,-sx0])for(const be of [24,30,17,35,10])for(const lf of [1,.86,.74,.62]){const bb=Math.max(4,Math.min(35,be+jA*.5))*Math.PI/180,al=Math.min(66,be+34)*Math.PI/180,len=30*jL*lf;
      const tip=[b0[0]+sx*Math.sin(bb)*len,b0[1]-Math.cos(bb)*len],c1=[b0[0]+sx*Math.sin(al)*len*.42,b0[1]-Math.cos(al)*len*.42],c2=[tip[0]-sx*Math.sin(bb)*len*.28,tip[1]+Math.cos(bb)*len*.28],pts=gbBez([b0,c1,c2,tip],10);
      if(pts.some((q,i)=>i&&q[1]>pts[i-1][1]-.05)||pts.slice(3).some(q=>inW(q,.8)||ribIn(q,.8)||layIn(q,.8)))continue;
      if(gbShootSlots(pts,Math.min(4,Math.max(3,c))).slice(0,nl).some(q=>{const th=q[2]*Math.PI/180,s=q[3]||1;return [4,8,12,15].some(d=>{const p=[q[0]+Math.cos(th)*d*s,q[1]+Math.sin(th)*d*s];return inW(p,1.2)||ribIn(p,1.2)||layIn(p,1.2)})}))continue;
      const xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]),r=[Math.min(...xs)-9,Math.min(...ys)-9,Math.max(...xs)+9,Math.max(...ys)+5];
      const sc=hits(r)+out(r)*400+Math.abs(be-24)*.6+(1-lf)*40+Math.abs(off)*2+(sx===sx0?0:30);
      if(!best||sc<best.sc)best={sc,pts,b0,tip,r,kk,ns,o:out(r)}}}}
    /* no place to grow: a short stub of a shoot off its boss on the boss's own side (the outside of the bend), facing out and
       up, its checks' count the swollen bud at its tip */
    if(!best||best.o>0||inPad(best.r)){const d=dp(),lift=(v,md)=>{const lim=[55,83,108][md]*Math.PI/180,a=Math.max(-lim,Math.min(lim,Math.atan2(v[0],-v[1])));return [Math.sin(a),-Math.cos(a)]};
     /* (it faces out of its boss and up; on a limb's underside it turns aside and stands out about level, never back into the wood
        nor along the bark: no more than sixty degrees off the boss's own facing where it can, else seventy) */
     /* (of the ways out, and of a stub's few lengths, the one whose count, the bud at its tip, lies clearest: off the wood, the
        cushions, the pad names, the knots, the other shoots and the counts already set; and where it can, out of the way
        straight out from another knot's boss, where that knot's name leaves it) */
     const sb0=d.b||[d.q[0]-d.ns[0]*1.2,d.q[1]-d.ns[1]*1.2],tg=[-d.ns[1],d.ns[0]],hw=gbCntHW(c,kq),oth=[...(B.shootGeo||[]),...(B.shootRest||[])].flatMap(g=>g.pts||[]),kps=T.knots.map(q=>[sh(q.bp),q.ra,q.id,[q.n[0]*q.side,q.n[1]*q.side]]);
     const budHit=(sb,v,sl)=>{const e=[sb[0]+v[0]*sl,sb[1]+v[1]*sl],w=[-v[1],v[0]];let h=0;for(let s=0;s<=2.55*hw;s+=2.5)for(const o of s>.3*hw&&s<1.8*hw?[0,-.8*hw,.8*hw]:[0]){const p=[e[0]+v[0]*s+w[0]*o,e[1]+v[1]*s+w[1]*o];
      if(inWF(p)||layIn(p,1)||padBox.slice(0,nPad).some(q=>inBox(p,q))||placed.some(q=>inBox(p,q))||oth.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<5)||kps.some(([q,r])=>Math.hypot(q[0]-p[0],q[1]-p[1])<r+2))h++;
      else if(kps.some(([q,r,id,no])=>{const dx=p[0]-q[0],dy=p[1]-q[1],dd=Math.hypot(dx,dy);return id!==kid&&dd<r+30*kq&&dx*no[0]+dy*no[1]>.64*dd}))h+=.5}return h};
     /* (on a knot it may leave the boss's rim a little along the grain, either way, staying on the boss) */
     const sb1=bs?Math.hypot(sb0[0]-bs.p[0],sb0[1]-bs.p[1]):0,tm=bs&&bs.rb?Math.min(.5*(bs.ra||0),Math.sqrt(Math.max(0,Math.pow(bs.rb+.4,2)-sb1*sb1))):0;
          /* (and of those, the best that leaves its own knot's name a place: somewhere its name would sit beside the boss, off the
        wood, the cushions, the soil, the other shoots and counts and away from another knot's boss, that its count and stub keep
        clear of, with its leader too; where no way out leaves one, the best way out) */
     const kn2=bs&&T.knots.find(q=>q.id===kid),rts=(L.roots||[]).filter(r=>r.tree===undefined||r.tree===ti).flatMap(r=>r.pts.slice(1).map((q,i)=>[r.pts[i],q,Math.max(r.w[i]||1,r.w[i+1]||1)/2+2]));let nslots=null;
     const slotsOf=()=>{if(nslots)return nslots;nslots=[];if(!kn2)return nslots;const p=sh(kn2.bp),p0=sh(kn2.p),hf=((gw.slots&&gw.slots.scroll&&gw.slots.scroll.clientWidth)||width)/W,fs=10*kq,tw=Math.max(...kn2.ids.map(id=>gbKnotTxt(M,kn2.ids,id).length))*.62*fs;
      let v=[p[0]-p0[0],p[1]-p0[1]];const vm=Math.hypot(v[0],v[1]);v=vm>.5?[v[0]/vm,v[1]/vm]:[kn2.n[0],kn2.n[1]];const R=[p[0]+v[0]*kn2.ra,p[1]+v[1]*kn2.ra];
      const D8=[[1,0],[.7071,-.7071],[0,-1],[-.7071,-.7071],[-1,0],[-.7071,.7071],[0,1],[.7071,.7071]],D16=[...D8,...D8.map((a,i)=>{const c=D8[(i+1)%8],m=Math.hypot(a[0]+c[0],a[1]+c[1]);return [(a[0]+c[0])/m,(a[1]+c[1])/m]})];
      for(const len of [...new Set([8,13,19,26,35,46,59,74].map(l=>Math.min(l*kq,86/hf)))])for(const a of D16){if(a[0]*v[0]+a[1]*v[1]<(kn2.pinB?-.3:.2))continue;const A=[R[0]+a[0]*len,R[1]+a[1]*len],ax=Math.abs(a[0]);
       for(const sd of ax>.38?(ax<.4?[1,0]:[1]):[0]){let x0,yb;if(sd){x0=a[0]>0?A[0]+2:A[0]-2-tw;yb=A[1]+.28*fs}else{x0=A[0]-tw/2;yb=a[1]<0?A[1]-.22*fs-2:A[1]+.78*fs+2}
        const r=[x0-1.5,yb-.78*fs-1.5,x0+tw+1.5,yb+.22*fs+1.5],sy=x=>L.sy?L.sy(x):-3;if(r[0]<vx+3||r[2]>vx+W-3||r[1]<vy+2||r[3]>Math.min(sy(r[0]),sy(r[2]))-4||placed.some(q=>ov(r,q)>0)||padBox.slice(0,nPad).some(q=>ov(r,q)>0))continue;
        nslots.push({r,R,A,a,len,om:3.5/hf,fo:Math.min(5,4.8/hf),cm:Math.max(2.5,3/hf),ok:null})}}
      return nslots};
     /* (a place is open ground once: its leader off the wood past the boss, the name off the wood, the roots, the cushions, the
        other shoots and the ground about another knot's boss, where that knot's name goes) */
     const open=S=>{if(S.ok!==null)return S.ok;const {r,R,a,len}=S;let ok=true;for(let t=kn2.ra+1;t<=len&&ok;t+=2)if(inWF([R[0]+a[0]*t,R[1]+a[1]*t]))ok=false;
      for(let x=r[0];x<=r[2]+.01&&ok;x+=Math.max(1,Math.min(6,(r[2]-r[0])/2)))for(const y of [r[1],(r[1]+r[3])/2,r[3]]){const q=[Math.min(x,r[2]),y];if(inWF(q)||layIn(q,0)||oth.some(o=>Math.abs(o[0]-q[0])<4&&Math.abs(o[1]-q[1])<4)||rts.some(([a,b,rr])=>gbSegD(q,q,a,b)<rr)||kps.some(([c,rr,id])=>id!==kid&&Math.hypot(q[0]-c[0],q[1]-c[1])<rr+30*kq)){ok=false;break}}
      return S.ok=ok};
     const room=c=>{const S0=slotsOf();if(!S0.length)return true;const v=c.v,w=[-v[1],v[0]],e=[c.b[0]+v[0]*c.l*kq,c.b[1]+v[1]*c.l*kq],P=[e[0]+v[0]*2.55*hw,e[1]+v[1]*2.55*hw],at=(o,y)=>[o[0]+w[0]*y,o[1]+w[1]*y];
      /* (its count's box as the page measures it: the turned bud's own box, turned) */
      const hp=[at(e,-hw),at(e,hw),at(P,-hw),at(P,hw)];
      const bx=ps=>{let q=[1e9,1e9,-1e9,-1e9];for(const z of ps)q=[Math.min(q[0],z[0]),Math.min(q[1],z[1]),Math.max(q[2],z[0]),Math.max(q[3],z[1])];return q},cb=bx(hp),stb=bx([c.b,e]),grow=(q,m)=>[q[0]-m,q[1]-m,q[2]+m,q[3]+m];
      /* (the name's leader keeps off the whole of that box, as every leader keeps off every count's) */
      return S0.some(S=>{const g=grow(S.r,S.om),cbm=grow(cb,S.cm),inCnt=z=>z[0]>cbm[0]&&z[0]<cbm[2]&&z[1]>cbm[1]&&z[1]<cbm[3];if(ov(g,cb)>0||ov(g,grow(stb,1.3))>0)return false;for(let t=0;t<=S.len+.01;t+=1.2){const z=[S.R[0]+S.a[0]*t,S.R[1]+S.a[1]*t];if(inCnt(z)||t>=S.fo&&gbSegD(z,z,c.b,e)<2)return false}return open(S)})};
     let u=null,sl=9*kq,sb=sb0;for(const dm of [.5,.3,-1]){if(u)break;const seen=new Set(),cs=[];for(const md of [0,1,2])for(const th of [0,20,-20,40,-40,60,-60,80,-80,100,-100,120,-120,140,-140]){const a=th*Math.PI/180,v=lift([d.ns[0]*Math.cos(a)-d.ns[1]*Math.sin(a),d.ns[0]*Math.sin(a)+d.ns[1]*Math.cos(a)],md),ky=Math.round(Math.atan2(v[0],-v[1])*90/Math.PI);
      if(seen.has(ky))continue;seen.add(ky);if(v[0]*d.ns[0]+v[1]*d.ns[1]<dm)continue;
      for(const of of tm>.5?[0,1,-1]:[0]){const b=[sb0[0]+tg[0]*of*tm,sb0[1]+tg[1]*of*tm],q=[d.q[0]+tg[0]*of*tm,d.q[1]+tg[1]*of*tm];
       for(const l of [9,13,17,21,25]){if([4,6,8,10,12,14,16,18,20,22,24,26].filter(s=>s<=l+1).some(s=>inWF([q[0]+v[0]*s*kq,q[1]+v[1]*s*kq])))break;const sc=budHit(b,v,l*kq)*10+md*2+Math.abs(th)/20+(l-9)*.4+Math.abs(of)*3;cs.push({sc,v,l,b})}}}
      cs.sort((x,y)=>x.sc-y.sc);const bs2=cs.find(room)||cs[0];if(bs2){u=bs2.v;sl=bs2.l*kq;sb=bs2.b}}if(!u)u=lift(d.ns,0);let cal=null;
     /* (cut, it heals as a shoot does: a callus beside its knot along the grain, on the bark) */
     if(bs&&bs.ra){const k2=Math.max(1,Math.min(n1-1,k0+Math.max(1,Math.round((bs.ra+4.6)/step)))),a2=pl[k2],m2=gbNorm(pl,k2),sd=m2[0]*d.ns[0]+m2[1]*d.ns[1]<0?-1:1,o=Math.max(0,wd[k2]/2-2.2),g0=pl[k2+1],g1=pl[k2-1],gm=Math.hypot(g0[0]-g1[0],g0[1]-g1[1])||1;
      cal={c:[a2[0]+m2[0]*sd*o,a2[1]+m2[1]*sd*o],t:[(g0[0]-g1[0])/gm,(g0[1]-g1[1])/gm],n:[m2[0]*sd,m2[1]*sd]}}
     const spts=gbBez([sb,[sb[0]+u[0]*sl*.35,sb[1]+u[1]*sl*.35],[sb[0]+u[0]*sl*.7,sb[1]+u[1]*sl*.7],[sb[0]+u[0]*sl,sb[1]+u[1]*sl]],6);
     {const e=spts[spts.length-1],P=[e[0]+u[0]*2.55*hw,e[1]+u[1]*2.55*hw];placed.push([Math.min(e[0],P[0])-hw,Math.min(e[1],P[1])-hw,Math.max(e[0],P[0])+hw,Math.max(e[1],P[1])+hw])}
     (B.shootRest=B.shootRest||[]).push({uids,kid,c,dorm:1,base:sb,pts:spts,tip:spts[spts.length-1],u,ns:d.ns,tb:d.tb,cal,bid:bs&&bs.bid,boss:bs?{p:bs.p,ra:bs.ra,rb:bs.rb}:null});return}
    if(!best)return;placed.push(best.r);
    /* where a cut of it heals: beside its knot along the grain, on the side it leans to and the side it grew out of, clear of
       the boss and on the bark; with no knot, at its collar */
    const tgAt=k=>{const g0=pl[Math.min(n1,k+1)],g1=pl[Math.max(0,k-1)],gm=Math.hypot(g0[0]-g1[0],g0[1]-g1[1])||1;return [(g0[0]-g1[0])/gm,(g0[1]-g1[1])/gm]};let cal={c:best.b0,t:tgAt(best.kk),n:best.ns};
    if(bs&&bs.ra){const t0=tgAt(best.kk),v=[best.pts[2][0]-best.pts[0][0],best.pts[2][1]-best.pts[0][1]],sg=Math.sign(v[0]*t0[0]+v[1]*t0[1])||1,k2=Math.max(1,Math.min(n1-1,best.kk+sg*Math.max(1,Math.round((bs.ra+4.6)/step))));
     const a2=pl[k2],m2=gbNorm(pl,k2),sd=m2[0]*best.ns[0]+m2[1]*best.ns[1]<0?-1:1,o=Math.max(0,wd[k2]/2-2.2);cal={c:[a2[0]+m2[0]*sd*o,a2[1]+m2[1]*sd*o],t:tgAt(k2),n:[m2[0]*sd,m2[1]*sd]}}
    (B.shootGeo=B.shootGeo||[]).push({uids,kid,pts:best.pts,base:best.b0,ns:best.ns,tip:best.tip,cal,bid:bs&&bs.bid,boss:bs?{p:bs.p,ra:bs.ra,rb:bs.rb}:null,route:[...best.pts.slice().reverse(),...routeOf(best.kk)],tb:now+(tf||tAt)(best.kk)})};
   const tdown=k=>tp.slice(0,k+1).reverse();
   /* how far the bark stands off a boss's centre on its own side, where gbTree swells the outline over it */
   const bkR=kn=>Math.max(kn.w/2+1.2+.3*kn.rb-Math.abs(kn.off),.92*kn.rb+1);
   /* when the growing trunk passes a point of it, so nothing grows out of wood that is not there yet */
   const tAt=k=>at(T.ty[k]);
   /* the knots with most checks first, so a crowded stretch keeps the shoot that holds most */
   const cnt=ids=>ids.reduce((n,id)=>n+own(id).length,0),ks=T.knots.map(kn=>({kn,uids:kn.ids.filter(id=>own(id).length)})).filter(o=>o.uids.length).sort((a,b)=>cnt(b.uids)-cnt(a.uids)||a.kn.t-b.kn.t||a.kn.k-b.kn.k);
   for(const {kn,uids} of ks){const b=kn.bid?T.br.find(x=>x.id===kn.bid):null,bs={p:sh(kn.bp),side:kn.side,rb:kn.rb,ra:kn.ra,bid:kn.bid},ns=[kn.n[0]*kn.side,kn.n[1]*kn.side],e=bkR(kn)-1.2,dp=tf=>()=>({q:[bs.p[0]+ns[0]*bs.rb,bs.p[1]+ns[1]*bs.rb],b:[bs.p[0]+ns[0]*e,bs.p[1]+ns[1]*e],ns,tb:now+tf(kn.k)});
    if(b){const bp=b.pts.map(sh);grow1(bp,kn.k,b.w,uids,kn.id,kk=>[...bp.slice(0,kk+1).reverse(),...tdown(b.k)],2,0,bs,B.brAt[b.id],1,dp(B.brAt[b.id]||tAt))}
    else grow1(tp,kn.k,T.tw,uids,kn.id,tdown,2,0,bs,null,0,dp(tAt))}
   /* never from the soil, the flare or the root itself: a root's checks grow from the trunk just above where that root flares
      from it, at least 24 px over the soil and a caliper and a quarter (above the flare's widest), on the root's side */
   const lowK=Math.round(.2*(tp.length-1)),sy=x=>L.sy?L.sy(x):0,fl=Math.max(24*kq,1.25*(T.D||0))+2;let kF=0;while(kF<tp.length-3&&tp[kF][1]>sy(tp[kF][0])-fl)kF++;
   for(const r of L.roots){if(!r.id||r.tree!==ti||!own(r.id).length)continue;
    grow1(tp,kF,T.tw,[r.id],r.id,kk=>[...tdown(kk),...r.pts.slice(0,Math.floor(r.pts.length*.6))],kF,r.d,null,null,0,()=>{const n=gbNorm(tp,kF),sg=n[0]*r.d<0?-1:1,ns=[n[0]*sg,n[1]*sg],h=T.tw[kF]/2;return {q:[tp[kF][0]+ns[0]*h,tp[kF][1]+ns[1]*h],b:[tp[kF][0]+ns[0]*(h-1.2),tp[kF][1]+ns[1]*(h-1.2)],ns,tb:now+tAt(kF)}})}
   /* a changed part on no journey has no knot of its own: its shoot comes from the boss of the leader's knot nearest under the
      crown that has none yet (or the nearest, if all have) */
   const loose=Object.keys(M.buds).filter(id=>own(id).length&&![...B.shootGeo||[],...B.shootRest||[]].some(g=>g.uids.includes(id)));if(loose.length){const k0=Math.round(.86*(tp.length-1));
    const lk=T.knots.filter(q=>q.on==='t').sort((a,b)=>Math.abs(a.k-k0)-Math.abs(b.k-k0)),taken=q=>[...B.shootGeo||[],...B.shootRest||[]].some(g=>Math.hypot(g.base[0]-sh(q.bp)[0],g.base[1]-sh(q.bp)[1])<40*kq),kn=lk.find(q=>!taken(q))||lk[0];
    if(kn){const bs={p:sh(kn.bp),side:kn.side,rb:kn.rb,ra:kn.ra,bid:null},ns=[kn.n[0]*kn.side,kn.n[1]*kn.side],e=bkR(kn)-1.2;grow1(tp,kn.k,T.tw,loose,'lead:'+ti,tdown,2,0,bs,null,0,()=>({q:[bs.p[0]+ns[0]*bs.rb,bs.p[1]+ns[1]*bs.rb],b:[bs.p[0]+ns[0]*e,bs.p[1]+ns[1]*e],ns,tb:now+tAt(kn.k)}))}
    else{const n=gbNorm(tp,k0);grow1(tp,k0,T.tw,loose,'lead:'+ti,tdown,lowK,0,null,null,0,()=>({q:[tp[k0][0]+n[0]*T.tw[k0]/2,tp[k0][1]+n[1]*T.tw[k0]/2],ns:n,tb:now+tAt(k0)}))}}}
  T.knots.forEach((kn,ki)=>{const p0=sh(kn.p),n=kn.n;const many=kn.ids.length>1;const p=sh(kn.bp);
   /* A knot is a boss the wood grew round (gbTree sets it off the centre line on the outside of the bend, sizes it and swells
      the outline over it): the bark's own colour a step lighter, half again as long along the grain as across it, softly lit
      on its upper left, with a shadow only along its lower crescent away from the light, and the grain parting round it. Lit,
      a fine amber ring (red where it broke) just inside its boss, so nothing of it spills onto the bark round it */
   const ra=kn.ra,rb=kn.rb,ang=Math.atan2(n[1],n[0])*180/Math.PI+90,tg=[n[1],-n[0]];
   const lx=-.6*tg[0]-.8*tg[1],ly=-.6*n[0]-.8*n[1];const lo=[tg[0]*lx*ra*.32+n[0]*ly*rb*.42,tg[1]*lx*ra*.32+n[1]*ly*rb*.42];
   const E=(c,a,b,cls)=>sv('ellipse',{cx:gbF(c[0]),cy:gbF(c[1]),rx:gbF(a),ry:gbF(b),transform:'rotate('+gbF(ang)+' '+gbP(c)+')',class:cls});
   /* the crescent: a thin shadow along the body's edge on the side away from the light, thickest at its middle */
   const t0=Math.atan2(-ly/rb,-lx/ra),at2=(t,k,dx)=>{const c=Math.cos(t)*ra*k,d=Math.sin(t)*rb*k;return [p[0]+tg[0]*c+n[0]*d+lo[0]*dx,p[1]+tg[1]*c+n[1]*d+lo[1]*dx]},cres=[];
   for(let i=0;i<=10;i++)cres.push(at2(t0-1.3+2.6*i/10,1,0));for(let i=10;i>=0;i--)cres.push(at2(t0-1.3+2.6*i/10,.84,.45));
   const cr=[[-1,0],[-.45,.55],[0,-.45],[.45,.5],[1,0]].map(([u,v])=>[p[0]+tg[0]*u*(ra+4)+n[0]*v*2.2,p[1]+tg[1]*u*(ra+4)+n[1]*v*2.2]);
   const u=M.U[kn.id];const names=kn.ids.map(id=>(M.U[id]||{}).label||id);
   const glow=E(p,Math.max(1,ra-1.25),Math.max(1,rb-1.25),'halo');
   const g=sv('g',{class:'kn'+(many?' burl':''),'data-k':'u:'+kn.id,tabindex:-1,role:'button','aria-label':many?names.length+' parts of the change, grown together: '+names.join(', '):(u?u.label:kn.id)+', a part of the change'},
    E(p,ra,rb,'k1'),E([p[0]+lo[0],p[1]+lo[1]],ra*.7,rb*.58,'k2'),sv('path',{d:gbLine(cres)+'Z',class:'kc'}),glow,E(p,ra+2.4,rb+2.4,'ring'),sv('path',{d:gbLine(cr),class:'crack'}),
    sv('circle',{cx:gbF(p[0]),cy:gbF(p[1]),r:Math.max(9,ra+3),class:'hitc'}));
   g.__geo={p,p0,n,tg,ra,rb,side:kn.side,off:kn.off,w:kn.w};{const kb2=kn.bid?T.br.find(x=>x.id===kn.bid):null;g.__route=kb2?[...kb2.pts.slice(0,kn.k+1).map(sh).reverse(),...tp.slice(0,kb2.k+1).reverse()]:tp.slice(0,kn.k+1).reverse()}
   g.__ids=kn.ids;(kn.bid?JG[kn.bid]:gKn).append(g);for(const id of kn.ids){B.knot[id]=g;B.pos[id]=p0}B.nav.push('u:'+kn.id);B.navEl['u:'+kn.id]=g;g.__n=n;g.__w=kn.w;g.__on=kn.on;
   /* a knot shows once the growing wood has reached its boss, read off the reveal of the wood it sits on; not a time kept
      from an earlier build, as a rebuild that reshapes the trunk can move a knot onto wood that has not grown yet */
   const wa=gbWoodAt(B,p,2),kt=Math.max(wa<Infinity?wa-now:-Infinity,kn.bid&&B.brAt[kn.bid]?B.brAt[kn.bid](kn.k):atK(kn.k))+60;(B.kT=B.kT||{})[kn.id]=now+kt;anim(null,g,kt,300,'fade');
   if(u){const txt=gbKnotTxt(M,kn.ids,kn.id);
    /* A name goes on open ground beside its knot; every name on the tree is placed in one pass once everything it must
       keep clear of is known (gbKnotNames, after the pads, names and numbers are drawn) */
    (B.klq=B.klq||[]).push({id:kn.id,tree:ti,p,p0,n,tg,ra,rb,txt,w:kn.w,bid:kn.bid,pb:kn.pinB})}});
  /* Max: an existing flow the change reaches re-checks a part and grows nothing of its own: a graft bud, a small swelling of
     the bark by that part's knot, along the grain, half out of the wood on the boss's side, lit along its rim, with a tiny
     bud tip at its crown. One for each flow, up to five, strung along the grain about nine pixels apart, outward from the
     boss on one side, clear of every other knot; past five, the fifth carries the rest as a count, a bud swollen at its crown
     as a shoot's count is. A root's sit on the root out from the flare; a part on neither, on the leader */
  if(!sap&&!ti){B.graftR=[];const by=new Map(),oth=T.knots.map(q=>[sh(q.bp),q.ra,q]);
   for(const uid in M.buds)for(const x of M.buds[uid])if(x.scenarioKind==='regression'){const id=x.unit||uid,kn=T.knots.find(q=>q.ids.includes(id)),rt=!kn&&L.roots.find(r=>r.id===id&&r.tree===ti),kk=kn?'k:'+kn.id:rt?'r:'+id:'';if(!by.has(kk))by.set(kk,[]);by.get(kk).push(x)}
   for(const [kk,xs] of by){const kn=kk[0]==='k'?T.knots.find(q=>'k:'+q.id===kk):null,rt=kk[0]==='r'?L.roots.find(r=>'r:'+r.id===kk):null,b=kn&&kn.bid?T.br.find(x=>x.id===kn.bid):null;
    const P=b?b.pts.map(sh):rt?rt.pts:tp,W=b?b.w:rt?rt.w:T.tw,acc=gbLen(P),k0=kn?kn.k:Math.round((rt?.3:.8)*(P.length-1)),R=4,sd0=kn?Math.sign(kn.off)||1:0,gap=kn?kn.ra+R+1.7+(kn.pin?5:0):0;/* (a collar knot's a little further off, clear of its branch's foot) */
    const at=s0=>{const d=acc[k0]+s0;if(d<(b?b.Tk/2+R+1:4)||d>acc[acc.length-1]-4)return null;let j=1;while(j<P.length-1&&acc[j]<d)j++;const f=Math.min(1,(d-acc[j-1])/((acc[j]-acc[j-1])||1)),nn=gbNorm(P,j),wj=W[j-1]+(W[j]-W[j-1])*f;if(wj<4)return null;
     const sd=sd0||(nn[1]<0?1:-1),o=sd*(wj/2-1.2),c=[P[j-1][0]+(P[j][0]-P[j-1][0])*f+nn[0]*o,P[j-1][1]+(P[j][1]-P[j-1][1])*f+nn[1]*o];c.n=[nn[0]*sd,nn[1]*sd];c.t=[nn[1],-nn[0]];return c};
    /* strung along the grain outward from the boss, each as clear of the boss as of the next, on one side and, when that
       side is full, on the other; where the wood between its neighbours is short, the first tucked against the boss's own
       rim, then closer together, never nearer than two of their radii. A side that meets another knot is full: a bud never
       stands past a neighbour, nearer it than its own, nor on a branch's foot inside the trunk */
    const kel=kn&&B.knot[kn.ids[0]],route=kel?kel.__route:P.slice(0,k0+1).reverse(),want=Math.min(5,xs.length);let done=[];
    /* (a knot's shoot or dormant stub rises from it: its graft buds take the side of the boss away from it) */
    const sg=kn&&[...(B.shootGeo||[]),...(B.shootRest||[])].find(g=>g.kid===kn.id),sq=sg&&(sg.pts?sg.pts[Math.min(3,sg.pts.length-1)]:sg.tip),c1=sq&&at(gap),c2=sq&&at(-gap);
    const s1=!sq||!c2?1:!c1?-1:Math.hypot(c1[0]-sq[0],c1[1]-sq[1])>=Math.hypot(c2[0]-sq[0],c2[1]-sq[1])?1:-1;
    for(const [gb,g] of [[1.7,1],[.9,1],[-1,1],[-1,.3]]){const got=[];
     for(const sd of [s1,-s1])for(let i=0;got.length<want&&i<want;i++){const c=at(sd*(gap-1.7+gb+i*(2*R+g)));
      if(!c||oth.some(([q,r,o])=>o!==kn&&Math.hypot(q[0]-c[0],q[1]-c[1])<r+R+.6))break;if(got.some(q=>Math.hypot(q[0]-c[0],q[1]-c[1])<2*R+.2))continue;got.push(c)}
     if(got.length>done.length)done=got;if(done.length>=want)break}
    /* a bud is set once its knot is there, or once the root or the leader has grown to it */
    const tb=kn?B.kT[kn.id]+300:rt&&(B.rootR||{})[rt.id]?gbWT(B.rootR[rt.id],acc[k0]/(acc[acc.length-1]||1))+100:now+at(.8)+100;
    /* (each flow keeps its own bud to point at; those past the last swelling are under it, and it carries their count: the
       bud at its crown swollen, the number in its round body and its point on out of the wood) */
    const nS=done.length,more=xs.length-nS,kc=L.narrow?GB_NK:1;
    if(nS)xs.forEach((x,i)=>{const j=Math.min(i,nS-1),c=done[j],top=more>0&&j===nS-1;let cnt=null;
     if(top&&i===j){const hw=gbCntHW(more,kc),A=[c[0]+c.n[0]*3.4,c[1]+c.n[1]*3.4],bd=gbBudD(A,c.n,hw);cnt={at:A,ang:Math.atan2(c.n[1],c.n[0])*180/Math.PI,bud:gbBudD([0,0],[1,0],hw).d,x:bd.C[0],y:bd.C[1]+.33*9.5*kc,r:bd.r,more}}
     B.graftR.push({c:[c[0],c[1]],t:c.t,n:c.n,r:R,xid:x.id,kid:kn?kn.id:rt?rt.id:'lead',tree:ti,par:kn&&kn.bid?JG[kn.bid]:gKn,route:[[c[0],c[1]],...route],tb,cnt,under:i>j,grp:top?xs.slice(j).map(q=>q.id):null})})}}
  /* veins: the route each pad's sap takes, shown live while its journey runs and traced on hover. It rises out of the soil,
     never from under it, and ends where its wood goes in under its own pad's foliage (its clumps reach a little past the
     cushion's outline, so four pixels short of that); behind another pad's cushion it is hidden, and the wood clips it (gb-rc) */
  const inCu=(p,pd)=>{const o=sh(T.origin[pd.id]),g=pd.geo,m=4;return g.cs.some(c=>{const X=o[0]+c.x,Y=o[1]+c.b,v=Math.max(-1,Math.min(1,(p[0]-X)/c.a));return Math.abs(p[0]-X)<c.a+m&&p[1]>Y+g.tY(c,v)-m&&p[1]<Y+g.bY(c,v)+m})};
  const edge=(a,b,inn)=>{let lo=a,hi=b;for(let k=0;k<10;k++){const m=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2];if(inn(m))lo=m;else hi=m}return hi};
  for(const pid of T.lanes){const v=T.veins[pid];const tr=v.trunk.map(sh),bp=v.branch.map(sh);const o=sh(v.pad);const all=gbSmooth([...tr,...bp],2);
   const own=T.padList.find(pd=>pd.id===pid),sunk=p=>p[1]>L.sy(p[0])-.6,hid=p=>T.padList.some(pd=>pd!==own&&inCu(p,pd)),runs=[];let cur=[];
   for(let i=0;i<all.length;i++){const p=all[i],q=i?all[i-1]:null;if(sunk(p))continue;if(q&&sunk(q))cur.push(edge(q,p,sunk));
    if(own&&inCu(p,own)){if(q&&!sunk(q))cur.push(edge(p,q,z=>inCu(z,own)));break}
    if(hid(p)){if(q&&!sunk(q)&&!hid(q))cur.push(edge(p,q,hid));if(cur.length>1)runs.push(cur);cur=[];continue}
    if(q&&hid(q))cur.push(edge(q,p,hid));cur.push(p)}
   if(cur.length>1)runs.push(cur);
   const p1=sv('path',{d:runs.map(gbLine).join(' '),class:'vein'});gVein.append(p1);B.vein[pid]={els:[p1],jid:v.jid,pts:all,pad:o,tree:ti}}
  /* Pads, and their labels. Each cushion is a dense heap of clumps of foliage, every clump lit on its top and shaded beneath,
     the shoulders a step darker than the crest. The wood it grew from shows only through its lower edge, fading out a third of
     the way up. The leaves lie over it, and a tuft of foliage in front of each leaf's foot tucks its stalk in. */
  T.padList.forEach((pd,pi)=>{const o=sh(T.origin[pd.id]),g=pd.geo,jid=pd.jid;const back=pd.b&&pd.b.back;const jg=JG[pd.id];
   const shape=g.shape;const q0=shape(()=>true),pk='gb-pk'+N+'-'+ti+'-'+pi;
   const els={ghost:sv('path',{class:'pghost',d:gbPadD(o,q0)}),clip:sv('path',{d:gbPadD(o,q0)})};defs.append(sv('clipPath',{id:pk},els.clip));
   const cu=g.cs.map((c,k)=>{const d=gbCushD(o,q0.cs[k]),X=o[0]+c.x,Y=o[1]+c.b,ck=pk+'-'+k,cr=c.role==='crest'?'cr':'sh';defs.append(sv('clipPath',{id:ck},sv('path',{d})));
    const clu=sv('g',{'clip-path':'url(#'+ck+')',class:'pclu'});for(const [x,y,r] of c.body)clu.append(sv('circle',{cx:gbF(X+x),cy:gbF(Y+y),r:gbF(r),fill:'url(#'+padG+cr+')'}),sv('path',{class:'pcs',d:'M'+gbP([X+x-r*.92,Y+y+r*.38])+' A'+gbF(r)+' '+gbF(r)+' 0 0 0 '+gbP([X+x+r*.92,Y+y+r*.38])}));
    /* over the clumps, small lobes heaped along each one's upper rim, each in one of the three greens and lit along its top,
       so the cushion reads as dense clumped foliage, then its underside in shade */
    c.body.forEach(([x,y,r],i)=>{for(const [a,f,j] of [[-2.35,.6,0],[-1.6,.66,1],[-.85,.6,2],[-1.98,.25,3],[-1.22,.28,4]]){const hh=gbHash('lb:'+pd.id+':'+k+':'+i+':'+j),rr=r*(.34+.12*hh),a2=a+(hh-.5)*.3,lx=X+x+Math.cos(a2)*r*f,ly=Y+y+Math.sin(a2)*r*f;
     clu.append(sv('circle',{cx:gbF(lx),cy:gbF(ly),r:gbF(rr),fill:'url(#'+padG+cr+(['1','2',''][(i+j)%3])+')'}),sv('path',{class:'pch',d:'M'+gbP([lx-rr*.72,ly-rr*.45])+' A'+gbF(rr)+' '+gbF(rr)+' 0 0 1 '+gbP([lx+rr*.72,ly-rr*.45])}))}});
    clu.append(sv('path',{class:'ptex',d,fill:'url(#'+padG+'s)'}),sv('path',{class:'pund',d,fill:'url(#'+padG+'u'+cr+')'}));
    const el=sv('g',{class:'cush c'+cr},sv('path',{class:'pfill',d}),clu);return {el,gr:sv('g',{class:'cgr'},el)}});
   /* a cushion is opaque to its foot: the limb it grew on goes in under it and does not show through (a smear of wood
      across its base), and a leaf's twig ends under the foliage its leaf lies on */
   const mk=sv('path',{d:gbPadD(o,q0),fill:'#666'});rMask.append(mk);
   const pg=sv('g',{class:'pad'+(pd.crown?' crown':'')+(back?' back':''),'data-k':'j:'+jid,'data-pad':pd.id,tabindex:-1,role:'button'},els.ghost,...cu.map(q=>q.gr),sv('ellipse',{cx:gbF(o[0]),cy:gbF(o[1]-5),rx:6,ry:4.6,class:'bud0'}));
   jg.append(pg);const tg=sv('g',{class:'ptufts','clip-path':'url(#'+pk+')'});jg.append(tg);const lg=sv('g',{});jg.append(lg);const tf=B.tuft=B.tuft||{};
   /* the foliage round a leaf's foot: two small clumps behind the blade, so it sits in the cushion's depth, never under a tuft */
   for(const [id,q] of g.tuft){const k=g.cs[g.cOf.get(id)].role==='crest'?'cr':'sh',x=o[0]+q[0],y=o[1]+q[1],r=q[3]*1.1,dx=q[2]*.3,iy=y-Math.sqrt(Math.max(1,r*r-dx*dx))+(gbHash('tf:'+id)-.5);
    tf[id]=sv('path',{class:'ptuft t'+k,fill:'url(#'+padG+'t'+k+')',d:'M'+gbF(x-dx-r)+' '+gbF(y)+' A'+gbF(r)+' '+gbF(r)+' 0 0 1 '+gbF(x)+' '+gbF(iy)+' A'+gbF(r)+' '+gbF(r)+' 0 0 1 '+gbF(x+dx+r)+' '+gbF(y)+' A'+gbF(dx+r)+' '+gbF(r*.8)+' 0 0 1 '+gbF(x-dx-r)+' '+gbF(y)+'Z'});tg.append(tf[id])}
   /* A cushion grows out of the fork its leaves' twigs leave the wood at: it starts with the first of them and scales up from
      that point, its clumps and all, as they grow (gbCu), never a pale patch laid on the branch ahead of its wood. When the
      last has grown it is whole; the wood seen through its foot comes in after. Its end is kept from the first time it is
      drawn, so a leaf drafted later never makes a grown cushion shrink and grow again. */
   const cq=B.cuS[pd.id]||{},cS=q0.cs.map((c,k)=>{const q=cq[k];
    /* a cushion swells from the fork its twigs leave the wood at, so it starts no sooner than the wood is there (with no twig
       of it drawn yet, from its own foot: the shape's c is its outline, the layout's g.cs[k] has the foot) */
    if(!q||q.s===Infinity){const f=[o[0]+g.cs[k].x,o[1]+g.cs[k].b],w=gbWoodAt(B,f,2),s0=Math.max(now+(pd.b?B.brAt[pd.id]?B.brAt[pd.id](pd.b.pts.length-1):at(pd.b.h)+380+1.5*pd.b.len:tEnd),w<Infinity?w:-Infinity);return {s:s0,e:s0+380,f}}
    const fs=q.f.length?q.f:q.fh,f=[fs.reduce((a,p)=>a+p[0],0)/fs.length,fs.reduce((a,p)=>a+p[1],0)/fs.length],w=gbWoodAt(B,f,2),s1=w<Infinity?Math.max(q.s,w):q.s;return {s:s1,e:gbT('cue:'+pd.id+':'+k,Math.max(s1+380,q.e)-now),f}});
   /* its name comes once its first cushion is half grown */
   const lblAt=Math.min(...cS.map(c=>c.s+gbCuAt(.5)*(c.e-c.s)));
   /* the wood a leaf's sap runs through on its way down: its own twig, then its branch (or, for the crown, the leader or a
      branchlet off it) and the trunk */
   /* (and how thick the wood it leaves is, where it leaves it: a cut there heals on that wood's bark) */
   const hwAt=(P,W,q)=>{let bd=Infinity,bw=2;P.forEach((p,i)=>{const d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<bd){bd=d;bw=W[i]}});return bw/2};
   const lts={};for(const t0 of pd.b?pd.b.twigs:T.ctw)if(t0.id){const t=t0.c&&t0.c.sec?{pts:[...t0.c.pts.slice(0,-1),...t0.pts],bi:t0.c.bi,c:t0.c.c}:t0;lts[t0.id]={pts:t.pts.map(sh),bi:t.bi,c:t.c?{pts:t.c.pts.map(sh),bi:t.c.bi}:null,hw:t.c?hwAt(t.c.pts,t.c.w,t.pts[0]):pd.b?hwAt(pd.b.pts,pd.b.w,t.pts[0]):hwAt(T.tp,T.tw,t.pts[0])}}
   const rt={tp,br:pd.b?pd.b.pts.map(sh):null,bw:pd.b?pd.b.w[pd.b.exit]:0,exit:pd.b?pd.b.exit:0,k:pd.b?pd.b.k:tp.length-1,lt:lts};
   B.pad[pd.id]={el:pg,jg,o,geo:g,jid,pol:pd.pol,crown:pd.crown,b:pd.b,lg,tg,leaves:pd.leaves,cS,lblAt,gk,tree:ti,shape,els,cu,mk,sk:'*',rt,q0};(B.padsOf[jid]=B.padsOf[jid]||[]).push(pd.id);
   if(!quiet)cu.forEach((u,k)=>{const c=cS[k];if(now<c.e)B.anim.push([u.gr,c.s-now,c.e-c.s,'cu',c.f])})
   if(!sap&&!pd.pol){B.nav.push('j:'+jid);B.navEl['j:'+jid]=pg}});
  for(const pid in T.lbl){const l=T.lbl[pid],pd=T.pads[pid];const back=pd.b&&pd.b.back;const lx=l.x+X,ly=l.y;
   const gl=sv('g',{class:'lbl'+(back?' back':''),'data-k':'j:'+l.jid,'data-pad':pid});const eb=sv('text',{x:gbF(lx),y:gbF(ly-18),'text-anchor':l.anchor,class:'eb'},'');gl.append(eb);
   const tl=l.lines.map((line,i)=>gbRich(sv('text',{x:gbF(lx),y:gbF(ly+16*i),'text-anchor':l.anchor,class:'t'+(l.pol?' v':'')}),line));gl.append(...tl);
   const t2=sv('text',{x:gbF(lx),y:gbF(ly+16*l.lines.length+1),'text-anchor':l.anchor,class:'st'}),t3=sv('text',{x:gbF(lx),y:gbF(ly+16*l.lines.length+15),'text-anchor':l.anchor,class:'st'});gl.append(t2,t3);
   const mid=ly-29+l.hgt/2;if(l.dir&&Math.abs(mid-l.ay)>12)gl.append(sv('path',{class:'leader',d:'M'+gbF(l.ax+X+l.dir*3)+' '+gbF(l.ay)+' L'+gbF(lx-l.dir*4)+' '+gbF(mid)}));
   gLbl.append(gl);B.lbl[pid]={el:gl,eb,t2,t3,tl,w:l.w,pol:l.pol,jid:l.jid};const la=B.pad[pid].lblAt;if(!quiet&&now<la+300)B.anim.push([gl,la-now,300,'fade'])}
  /* on a phone the names go in the list under the tree; the tree carries their numbers, just outside each pad */
  /* each number sits just off the outer end of its own pad, level with the middle of the outer cushion, on a short
     leader that ends on the cushion's edge, the same rule for every pad */
  for(const jid in (T.badge||{})){const q=T.badge[jid];const pid=q.pid||(T.padList.find(pd=>pd.jid===jid&&!pd.pol)||{}).id,P=B.pad[pid];const kB=L.narrow?GB_NK:1,rB=10*kB;
   let bx=q.x+X,by=q.y,ax=q.ax+X,ay=q.ay;
   if(P&&P.q0&&P.q0.cs.length){const sd=(bx>=ax?1:-1),on=P.q0.cs.filter(c=>c.on!==false&&c.top.length);const c=on.length?on.reduce((a,c2)=>sd>0?(c2.x1>a.x1?c2:a):(c2.x0<a.x0?c2:a)):null;
    if(c){const xe=sd>0?c.x1:c.x0,xi=xe-sd*Math.min(6,(c.x1-c.x0)/4),ym=(gbAtX(c.top,xi)+gbAtX(c.bot,xi))/2;ax=P.o[0]+xe;ay=P.o[1]+ym;bx=ax+sd*(8*kB+rB);by=ay;
     bx=Math.max(vx+rB+3,Math.min(vx+W-rB-3,bx))}}
   (B.badgeR=B.badgeR||[]).push([bx-rB,by-rB,bx+rB,by+rB]);
   const sdl=bx>=ax?1:-1,ld=Math.abs(bx-ax)>rB+1?sv('path',{class:'leader',d:'M'+gbF(ax+sdl*.6)+' '+gbF(ay)+' L'+gbF(bx-sdl*rB)+' '+gbF(by)}):null;
   const gl=sv('g',q.pid?{class:'badge pol','data-k':'j:'+q.jid,'data-pad':q.pid}:{class:'badge','data-k':'j:'+jid},...(ld?[ld]:[]),sv('circle',{cx:gbF(bx),cy:gbF(by),r:gbF(rB)}),sv('text',{x:gbF(bx),y:gbF(by)},q.pol==='failure'?'F':q.pol?'R':''));
   gLbl.append(gl);if(q.pid)B.lbl[q.pid]={el:gl,num:gl.lastChild,badge:true,jid:q.jid,pid:q.pid};else B.lbl[jid]={el:gl,num:gl.lastChild,badge:true,jid};
   /* a number, like a name, waits for its pad */const la=P&&P.lblAt;if(!quiet&&la&&now<la+300)B.anim.push([gl,la-now,300,'fade'])}
  /* then every file's name, and the count on each shoot, in one placement pass */
  if(!sap)gbKnotNames(B,M,T,ti,{X,tp,vx,vy,W,VH,gKl,quiet,hf:((gw.slots&&gw.slots.scroll&&gw.slots.scroll.clientWidth)||width)/W,potBox:[L.potC-L.potL/2-4,L.narrow?-11:-16,L.potC+L.potL/2+4,L.D+40]});
 });
 if(L.trees.length&&M.jin.length>3&&!sap){const T=L.trees[0],p=T.tp[gbNear(T.ty,.4)];gJin.append(sv('text',{x:gbF(p[0]-T.S*28),y:gbF(p[1]),'text-anchor':T.S>0?'end':'start',class:'note'},'+'+(M.jin.length-3)+' changed, on no journey'))}
 /* the bark's light and grain are uncovered with the wood they lie on (gbGrowRun), never faded in after it */
 /* hover, focus, click and keys: one tab stop, arrows move between pads, knots and roots, and along a journey's leaves */
 const keyOf=e=>{const t=e.target.closest&&e.target.closest('[data-k]');return t?t.getAttribute('data-k'):null};
 svg.addEventListener('pointerover',e=>{const el=e.target.closest&&e.target.closest('[data-k]');if(el!==gw.hovEl){gw.hovEl=el;gbHover(el?el.getAttribute('data-k'):null,el)}});
 /* a tap on the card moves focus and the mouse off the drawing; redrawing the card then would pull its Close from under the
    finger and lose the tap, so with nothing lit nothing is done */
 svg.addEventListener('pointerleave',()=>{if(!gw.hov&&!gw.hovEl)return;gw.hovEl=null;gbHover(null)});
 svg.addEventListener('focusin',e=>{const k=keyOf(e);if(k){gbRove(e.target.closest('[data-k]'));gbHover(k,e.target.closest('[data-k]'))}});
 svg.addEventListener('focusout',e=>{if(!svg.contains(e.relatedTarget)&&(gw.hov||gw.hovEl))gbHover(null)});
 /* the browser moves a tap's click onto a target near the finger; the finger's own point is where the touch went down; a clear hit area round a small mark gives way to a leaf nearer the finger */
 svg.addEventListener('pointerdown',e=>{gw.tapAt=e.pointerType!=='mouse'?[e.clientX,e.clientY,e.timeStamp]:null},{passive:true});
 svg.addEventListener('click',e=>{const at=e.pointerType&&e.pointerType!=='mouse'&&gw.tapAt&&e.timeStamp-gw.tapAt[2]<1500?gw.tapAt:null,t0=at?document.elementFromPoint(at[0],at[1]):null,tt=t0&&svg.contains(t0)?t0:e.target;
  const tg=tt.closest?tt.closest('[data-k]'):null,nl=gbNearLeaf(e);let k=tg?tg.getAttribute('data-k'):null;if(nl&&(!tg||tt.classList.contains('gb-hit')||tg.classList.contains('gb-lf')||tg.classList.contains('pad')))k=nl;if(e.pointerType&&e.pointerType!=='mouse'){gw.hov=null;gw.hovEl=null}if(!k){if(gw.pinned){gw.pinned=null;growPaint()}return}gw.pinned=gw.pinned===k?null:k;if(gw.B&&gw.pinned&&!gw.B.L.narrow)gbTipOff(gw.B);growPaint()});
 svg.addEventListener('keydown',gbKeys);
 /* on a phone, a tap off the card under the drawing, on nothing that does a thing of its own, lets the card go (a tap whose
    target a repaint took away, such as a mark's hit area, was on the drawing) */
 if(!gw.tapOff){gw.tapOff=true;document.addEventListener('click',e=>{const B2=gw.B,t=e.target;if(!B2||!B2.tip||B2.tip.hidden||!B2.tip.classList.contains('below')||!gw.pinned||!(t instanceof Element))return;
  if(!t.isConnected||B2.tip.contains(t)||B2.svg.contains(t)||t.closest('button,a,summary,input,select,textarea,label,[data-ol],[data-k],[role=button],.gw-dr'))return;gw.pinned=null;gw.pinList=null;gw.hov=null;gw.hovEl=null;gbTipOff(B2);growPaint()})}
 /* the grey dots where a route never ran go under the knots they pass, which stand faint over them: each knot cuts them */
 {const kmId='gb-km'+N,km=sv('mask',{id:kmId,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)},sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'#fff'}));
  for(const e of B.klq||[])km.append(sv('circle',{cx:gbF(e.p[0]),cy:gbF(e.p[1]),r:gbF(e.ra+2.5),fill:'#000'}));defs.append(km);B.sapX.setAttribute('mask','url(#'+kmId+')')}
 B.tip=h('div',{class:'gb-tip',hidden:true,role:'status'});B.width=width;
 /* the traced route stays inside what it runs through: the wood (trunk, branches, forks, roots, twigs), never out over the foliage */
 {const rc=sv('clipPath',{id:'gb-rc'+N});for(const c of clip.children)rc.append(c.cloneNode());
  for(const el of svg.querySelectorAll('path.tw'))rc.append(sv('path',{d:el.getAttribute('d')}));
  defs.append(rc);gSap.setAttribute('clip-path','url(#gb-rc'+N+')');svg.querySelector('g.veins').setAttribute('clip-path','url(#gb-rc'+N+')');B.rclip=rc}
 gw.B=B;gw.svg=svg;
 /* On a wide screen every knot on the trunk is named beside it: one that finds no place for its name grows into its
    neighbour (gbTree) and the tree is drawn again with that, twice at most, before any of it shows; the fold is kept for
    this layout, so it is drawn so from then on */
 if(!sap&&!L.narrow&&(gw.kfd||0)<2){const P=B.kput=gbPutNames(B,true),miss=(B.klq||[]).filter(e=>!e.bid&&P.pip.has(e.id)).map(e=>e.id);
  if(miss.length){(gw.kfold=gw.kfold||{})[key]=[...M.kfold,...miss];gw.kfd=(gw.kfd||0)+1;try{return gbBuild(M,width,key,sap)}finally{gw.kfd--}}}
 /* queued against the clock the build began on, and started on it, never late by however long the build took */
 if(svg.animate)for(const [el,d0,ms,kind,f] of B.anim){if(kind==='fade')gbPlay(el,[{opacity:0},{opacity:1}],{duration:ms,fill:'backwards'},now+d0);else if(kind==='cu')gbPlay(el,gbCu(f),{duration:ms,fill:'backwards'},now+d0)}
 gbGrowRun(B);
 return B}
/* A tap within 22 px of a leaf's middle picks the nearest such leaf, so on a phone every leaf (and every leaf on a shoot) takes
   a finger 44 px across, and where two of those overlap the nearer leaf wins. */
function gbNearLeaf(e){const B=gw.B;if(!B||e.pointerType==='mouse')return null;let best=null,bd=22;const at=gw.tapAt&&e.timeStamp-gw.tapAt[2]<1500?gw.tapAt:[e.clientX,e.clientY];
 for(const [id,el] of [...Object.entries(B.leaf),...Object.entries(B.bud)]){if(el.classList.contains('gone')||el.classList.contains('cut')||!el.isConnected)continue;const t=el.querySelector('.hitp')||el.querySelector('.hitc');if(!t)continue;const r=t.getBoundingClientRect();if(!r.width)continue;const d=Math.hypot(r.left+r.width/2-at[0],r.top+r.height/2-at[1]);if(d<bd){bd=d;best='s:'+id}}return best}
/* where a finger works the page, a leaf's target is a circle 44 px across round its middle, under the leaf it belongs to */
function gbThumb(B,inner,cx,sc,cy,cl){if(!inner||!(B.L.narrow||gwTouch()))return;inner.prepend(sv('circle',{cx:cx||null,cy:cy||null,r:gbF(22/gbHf(B)/(sc||1)),class:'hitp'+(cl?' '+cl:'')}))}

/* The same leaf with a bite out of its upper edge: how a failed scenario looks, in any theme and on any ground. */
function gbLeafBite(L,W,edge){const a=-L/2,b=L/2;const up=[[a,0],[a+.22*L,-.62*W],[b-.32*L,-.62*W],[b,0]];const c=[L*.12,-W*.6],r=W*.5;
 const pts=gbBez(up,24).map(q=>{const d=Math.hypot(q[0]-c[0],q[1]-c[1]);return d<r?[c[0]+(q[0]-c[0])/(d||1)*r,c[1]+(q[1]-c[1])/(d||1)*r]:q});
 /* the bitten edge alone, for the browned rim a failed leaf has round its wound */
 if(edge){const e=pts.filter(q=>Math.abs(Math.hypot(q[0]-c[0],q[1]-c[1])-r)<.01);return e.length>1?'M'+e.map(gbP).join(' L'):''}
 return 'M'+pts.map(gbP).join(' L')+' C'+gbF(b-.32*L)+' '+gbF(.62*W)+' '+gbF(a+.22*L)+' '+gbF(.62*W)+' '+gbF(a)+' 0Z'}

/* A leaf: a stem (shown when it hangs), a paper halo so it reads on wood and pad alike, the blade and its midrib, and the
   bite a failed scenario takes out of it. */
function gbLeafEl(x,L,W,hang){const inner=sv('g',{class:'gb-lfi'},sv('circle',{r:gbF(Math.max(12,L*.62)),class:'hitc'}),sv('path',{d:gbLeafD(L+2.6,W+2.4),class:'halo'}),sv('path',{d:'M'+gbF(-L/2-GB_PET)+' 0 L'+gbF(-L/2+1.5)+' 0',class:'pet'}),sv('path',{d:gbLeafD(L,W),class:'blade bn'}),sv('path',{d:gbLeafBite(L,W),class:'blade bb'}),sv('path',{d:gbLeafBite(L,W,true),class:'nec'}),
  sv('path',{d:'M'+gbF(-L/2+1.6)+' 0 L'+gbF(L/2-2.4)+' 0',class:'rib'}));
 /* (the leaf's own frame, in which it opens out of its twig's tip and falls when it is pruned) */
 const st=-L/2-GB_PET,fr=sv('g',{class:'gb-lfg'},inner);const el=sv('g',{class:'gb-lf','data-k':'s:'+x.id,tabindex:-1,role:'button'},fr,
  sv('path',{d:'M'+gbF(st+.4)+' -2.6 L'+gbF(st+3.2)+' 2.6',class:'nick'}));el.__inner=inner;el.__g=fr;el.__nick=el.lastChild;return el}
/* drawing units per CSS px, so a hit area can be sized in px: every leaf and shoot leaf takes a pointer or a finger within
   about 12 px of its middle */
/* before the drawing is laid out it will fill the width it is drawn for, so that width stands in for its own */
const gbHf=B=>{const vb=B.svg.viewBox&&B.svg.viewBox.baseVal,w=B.svg.getBoundingClientRect().width||B.width;return vb&&vb.width&&w?w/vb.width:1};
function gbLeafState(x){const s=gw.state;const r=s.run[x.id];
 if(r){if(r.st==='pass')return x.ext.some(e=>s.ext[e]&&s.ext[e].state!=='proven')?'pass warn':'pass';if(r.st==='fail')return 'fail';if(r.st==='run')return 'run';return gwFlowOf(x)?'idle':'none'}
 /* (once a mode is chosen its pads say which leaves have no flow yet, gbTok, and from that same paint those leaves are drawn so) */
 return !s.modeBy&&gbRank[x.mode]>0?'pre':s.modeBy&&!gwFlowOf(x)?'none':'in'}
function gbStateWord(x){const s=gw.state;const r=s.run[x.id];if(r){if(r.st==='pass')return {c:'pass',t:'passed in '+gwDur(r.ms||0)+(x.ext.some(e=>s.ext[e]&&s.ext[e].state!=='proven')?', resting on agent-written work not yet reviewed':'')};
  if(r.st==='fail')return {c:'fail',t:'failed'+(r.hop?(r.after?', after ':' at ')+r.hop:'')+': '+(r.why||'see the run')+(r.hop?'':' (the run does not say which hop broke)')};if(r.st==='run')return {c:'run',t:'running now'};
  /* in the one word its row and card give it: a run that never reached its checks says why it could not run */
  const k=gwOpenKey(x),w=gwStW(k);return {c:'',t:k==='could'?w+String(r.why).replace(/^Could not run/,''):k==='ready'?w+(r.why?': '+r.why:''):w}}
 if(gbRank[x.mode]>gbRank[s.mode]&&s.modeBy)return {c:'',t:'pruned: proved in '+GW.modes.find(m=>m.id===x.mode).label};
 return {c:'',t:'drafted'+(x.flow?', runs '+x.flow:', no flow yet')+(s.modeBy?'':' · in '+GW.modes.find(m=>m.id===x.mode).label)}}
/* Where a failure happened, read from its message: the first part of the journey whose route or command it names. */
/* Where a failure happened: the route the run says broke (or was the last called before a failed check), else the first
   part of the journey whose route or command its message names. */
const gbSameRoute=(a,b)=>{const A=String(a).split(' '),Bq=String(b).split(' ');if(A.length<2||Bq.length<2||A[0]!==Bq[0])return false;const p=A[1].split('?')[0].split('/'),q=Bq[1].split('?')[0].split('/');return p.length===q.length&&p.every((s,i)=>s===q[i]||/^[:{[<]/.test(s))};
function gbWound(M,j,x){const r=gw.state.run[x.id];if(!r||r.st!=='fail')return null;
 if(r.hop)for(const id of j.units){const u=M.U[id];if(u&&u.unitKind==='route'&&gbSameRoute(u.label,r.hop))return id}
 if(!r.why)return null;for(const id of j.units){const u=M.U[id];if(u&&(r.why.includes(u.label)||(u.unitKind==='route'&&r.why.includes(u.label.split(' ').pop()))))return id}return null}
const gbModeName=id=>(GW.modes.find(m=>m.id===id)||{label:id}).label;
const gbSURFW={browser:'BROWSER',http:'HTTP',terminal:'CLI',job:'JOB'};
/* A pad's state in words, each with its colour: failed red, passed green, running gold, the rest muted. */
function gbTok(list,j,vis,inMode){const s=gw.state;if(!list.length)return [[(gbWHERE[j.surface]||'')+' · '+j.units.length+' part'+(j.units.length===1?'':'s'),'n']];
 const inm=list.filter(inMode),ran=inm.filter(x=>s.run[x.id]),c=k=>ran.filter(x=>s.run[x.id].st===k).length,pr=vis?list.length-inm.length:0;
 if(vis&&!inm.length){const lo=list.reduce((a,x)=>gbRank[x.mode]<gbRank[a]?x.mode:a,'max');return [['pruned in '+gbModeName(vis)+' · '+gbModeName(lo)+' grows '+(list.length===1?'it':'them'),'n']]}
 const T=[];if(c('fail'))T.push([c('fail')+' failed','f']);if(c('pass'))T.push([c('pass')+' passed','p']);if(c('run'))T.push([c('run')+' running','r']);
 const open=inm.filter(x=>{const r=s.run[x.id];return !r||r.st==='not_run'}),ow=k=>open.filter(x=>gwOpenKey(x)===k).length,cr=ow('could'),nf=ow('nf'),tp=ow('ready');
 /* what a mode would keep and cut is said only before one is picked; from the paint a mode is picked in, the pad says what it
    holds in that mode and what was pruned, its final words, never both */
 if(!ran.length&&!vis){const km='min',k=list.filter(x=>gbRank[x.mode]<=gbRank[km]).length;T.push(['keeps '+k,'n']);if(list.length>k)T.push(['cuts '+(list.length-k),'x'])}else{if(cr)T.push([cr+' '+gwStW('could'),'n']);if(tp)T.push([tp+' '+gwStW('ready'),'n']);if(nf)T.push([nf+' '+gwStW('nf'),'n'])}
 if(pr)T.push(['+'+pr+' pruned','n']);return T}
const gbNext=id=>GW.modes[Math.min(GW.modes.length-1,GW.modes.findIndex(m=>m.id===id)+1)].id;

function gbPaint(){const s=gw.state;const M=gbModel();const sap=!M.trees.length;const width=gbWidth();
 const pc=list=>['happy','guard','failure'].map(p=>list.filter(x=>gbPol(x)===p).length).join('.')+list.filter(x=>s.run[x.id]&&s.run[x.id].st==='fail').map(x=>'!'+x.id).join('');
 /* Max's shoots and graft buds are laid out with the wood, so the parts with checks of their own and the flows each re-checks key it too */
 const bk=Object.keys(M.buds).sort().map(u=>{const l=M.buds[u],r=l.filter(x=>x.scenarioKind==='regression').length;return u+(l.length>r?'o':'')+Math.min(5,r)}).join(',');
 const key=(sap?'sap:'+s.units.map(u=>u.id).join(','):M.trees.map(t=>t.js.map(j=>j.id+'='+j.units.join('+')+'#'+pc(M.leaves[j.id])).join(';')).join('|'))+'|jin='+M.jin.map(u=>u.id).join(',')+'|'+M.strays.map(u=>u.id).join(',')+'|'+(s.stops.map(x=>x.unit).join(','))+'|b='+bk+'|w='+width;
 /* a rebuild (the layout changed, say when the window is resized) keeps what was showing, so
    the leaves and shoots a mode drops still fall and fade rather than vanish */
 if(!gw.B||gw.B.key!==key){const O=gw.B;gw.prevIn={};gw.prevShown={};gw.prevBuds=O?O.budsShown:undefined;
  if(O){for(const id in O.leaf)gw.prevIn[id]=O.leaf[id].__in;for(const id in O.pad)gw.prevShown[id]=O.pad[id].shown}gbBuild(M,width,key,sap)}
 const B=gw.B;gw.M=M;const vis=s.modeBy?s.mode:s.asked&&gw.picking?gw.picking:null;/* a preview: before a mode is chosen, what each would keep; once one is set, what another would keep or add, as ghosts */const pv=gw.preview&&gw.preview!==(s.modeBy?s.mode:null)?gw.preview:null;let n=0;const quiet=gwQuiet();
 /* what has grown, for the whole grow: whatever the tree drew at rest, before a choice (at the ask, say) or in a chosen mode.
    Only that is cut when a mode drops it, and heals over; the rest was only ever a preview's ghost, and goes with no mark */
 const real=(gw.seen=gw.seen||new Set()).real||(gw.seen.real=new Set());
 const order=sap?[]:gbOrder(M);gw.order=order.map(j=>j.id);
 /* one tab stop into the tree: the first journey in the order the list and the inspector use */
 if(!B.roved){B.roved=true;const f=B.navEl['j:'+gw.order[0]]||B.navEl[B.nav[0]];if(f)gbRove(f)}
 const inMode=x=>!vis||gbRank[x.mode]<=gbRank[vis];
 const showBuds=pv?(pv==='max'||!vis||vis==='max'):vis?vis==='max':true;B.budsShown=showBuds;/* leaving a preview is not a pruning: its ghosts just go */const pvWas=B.pvWas;B.pvWas=pv;/* choosing a mode is a pruning even when it was being previewed */const mk=vis||'',chose=B.mk!==undefined&&B.mk!==mk;B.mk=mk;
 /* a pruning works down from the apex: everything this paint cuts, leaves, shoots and graft buds alike, is snipped in order of
    height, one about every 40 ms */
 const cutLag=new Map();if(!quiet){const c=[];
  for(const id in B.leaf){const el=B.leaf[id],x=el.__x;if(x&&el.__in===true&&!inMode(x)&&!(pv&&gbRank[x.mode]<=gbRank[pv]))c.push(['s:'+id,el.__y])}
  if(!pvWas||chose){for(const g of new Set(Object.values(B.shoots||{})))if(g.on&&!(showBuds&&((g.list||[]).some(inMode)||pv==='max')))c.push([g,g.base[1]]);
   for(const r of B.graftR||[]){const el=B.bud[r.xid];if(el&&el.__on&&el.__x&&!(showBuds&&(inMode(el.__x)||pv==='max')))c.push([el,r.c[1]])}}
  c.sort((a,b)=>a[1]-b[1]).forEach(([k],i)=>cutLag.set(k,Math.min(600,i*40)))}
 for(const j of order){n++;const all=M.leaves[j.id];let mainCut=false;
  for(const pid of B.padsOf[j.id]||[]){const P=B.pad[pid];const list=gbOrd(P.leaves);const g=P.geo;let shown=0,failed=false,cutN=0;const kept=new Set(),grown=new Set();
   list.forEach((x,i)=>{const sl=g.slot.get(x.id)||[0,-g.PH*.5,0];let el=B.leaf[x.id];const now=gbNow();
    if(!el){el=gbLeafEl(x,g.L,g.W,sl[4]);{const hc=el.__inner.querySelector('.hitc');if(hc)hc.setAttribute('r',gbF(Math.max(+hc.getAttribute('r'),12/gbHf(B)/(sl[3]||1))));gbThumb(B,el.__inner,0,sl[3])}P.lg.append(el);B.leaf[x.id]=el;el.__j=j.id;el.__p=pid;el.__in=(gw.prevIn||{})[x.id];
     /* a leaf opens out of its twig's tip, stalk first, once that twig has grown and its cushion is all but whole: never on
        bare wood, never in the air ahead of the wood that carries it */
     if(!quiet&&el.__g.animate){const ck=g.cOf.get(x.id),c=P.cS&&P.cS[ck],ci=list.slice(0,i).filter(q=>g.cOf.get(q.id)===ck).length;
      const t0=el.__t0=Math.max((B.twEnd||{})[x.id]||0,c?c.s+gbCuAt(.85)*(c.e-c.s):0)+ci*30;
      if(now<t0+170){const ps=-g.L/2-GB_PET,T=k=>'translate('+gbF(ps)+'px,0px) scale('+k+') translate('+gbF(-ps)+'px,0px)',tf=(B.tuft||{})[x.id];
       gbPlay(el.__g,[{transform:T(0)},{transform:T(1)}],{duration:170,easing:'cubic-bezier(.2,.9,.3,1.15)',fill:'backwards'},t0);gbPlay(el.__nick,[{opacity:0},{opacity:1}],{duration:120,fill:'backwards'},t0+150);
       if(tf&&tf.animate)gbPlay(tf,[{opacity:0},{opacity:1}],{duration:170,fill:'backwards'},t0)}}}
    el.style.transform='translate('+gbF(P.o[0]+sl[0])+'px,'+gbF(P.o[1]+sl[1])+'px) rotate('+gbF(sl[2])+'deg)'+(sl[3]&&sl[3]!==1?' scale('+sl[3]+')':'');el.__x=x;el.__y=P.o[1]+sl[1];
    const im=inMode(x);const was=el.__in;el.__in=im;let cls='gb-lf '+gbLeafState(x)+(sl[4]?' hang':'');const add=!im&&!!pv&&gbRank[x.mode]<=gbRank[pv];
    /* pruning, at its turn from the apex down. A leaf that grew, at rest before a choice or in a chosen mode, is snipped where
       its twig leaves the wood: twig and leaf tip 20 to 30 degrees about the cut and drop away along a short arc as they fade,
       in the grey the preview gave them, and the cut heals over (the callus below). One that was only ever a preview's ghost
       was never grown: it shrinks back into its collar as it fades, and leaves no mark */
    if(im&&(vis||!pv))real.add(x.id);
    /* (a ghost is drawn where the leaf grows, whole: one still falling when a preview ghosts it is let go of) */
    if(add){cls+=' pv-add';if(el.__fall){for(const a of el.__fall)a.cancel();el.__fall=null}}else if(!im){if(was===true&&!quiet&&el.__g.animate&&!(gbNow()<(el.__t0||0))){el.__cutAt=Date.now();for(const a of el.__g.getAnimations())a.cancel();const lag=el.__lag=cutLag.get('s:'+x.id)||0,tw=((B.ltw||{})[x.id]||[])[0],tq=P.rt.lt[x.id],fell=el.__fell=real.has(x.id);
      const pos=[P.o[0]+sl[0],P.o[1]+sl[1]],a=sl[2]*Math.PI/180,sc=sl[3]||1,ca=Math.cos(a),sa=Math.sin(a),piv=tq?tq.pts[0]:[pos[0]-ca*(g.L/2+GB_PET)*sc,pos[1]-sa*(g.L/2+GB_PET)*sc];
      const h=gbHash('fall:'+x.id),dir=ca>.2?1:ca<-.2?-1:h<.5?-1:1,th=dir*(20+10*gbHash('spin:'+x.id)),hf=gbHf(B),dx=dir*(6+10*h)/hf,dy=(40+40*gbHash('drop:'+x.id))/hf;
      /* the leaf moves in its own frame, so the same motion is put into it: the cut point, the drop and the turn seen from the leaf */
      const loc=q=>[(q[0]*ca+q[1]*sa)/sc,(-q[0]*sa+q[1]*ca)/sc],lp=loc([piv[0]-pos[0],piv[1]-pos[1]]),ld=loc([dx,dy]),ms=el.__cutMs=fell?GB_FALL:GB_BACK,o={duration:ms,delay:lag+(fell?GB_SNIP:0),easing:GB_EASEIN,fill:'forwards'};if(fell){const v=[piv[0]-pos[0],piv[1]-pos[1]],m=Math.hypot(v[0],v[1])||1;gbSnip(P.lg,piv,[-v[0]/m,-v[1]/m],lag)}
      el.__fall=fell?[el.__g.animate(gbFallK(lp,ld[0],ld[1],th),o)]:[el.__g.animate(gbBackK(lp),o)];if(tw&&tw.animate)el.__fall.push(tw.animate(fell?gbFallK(piv,dx,dy,th):gbBackK(piv),o));
      /* (it is cut until its own motion ends, on the clock that plays it, however long the rest of this paint takes) */
      /* (once it has fallen the motion is let go of, so a later preview's ghost of it shows where it grew, at its half strength) */
      {const f=el.__fall[0];f.finished.then(()=>{if(el.__fall&&el.__fall[0]===f&&el.__in===false){el.classList.replace('cut','gone');for(const a of el.__fall)a.cancel();el.__fall=null;gbPaint()}},()=>{})}}
     cls+=el.__fall&&el.__fall[0].playState!=='finished'?' cut pv-out':' gone'}else{el.__cutAt=0;if(el.__fall){for(const a of el.__fall)a.cancel();el.__fall=null}}
    if(pv&&!add){const keep=gbRank[x.mode]<=gbRank[pv];cls+=keep?' pv-in':' pv-out';if(!keep)cutN++}
    el.setAttribute('class',cls);el.setAttribute('aria-label','Scenario: '+x.title+', '+gbStateWord(x).t);
    if(im)kept.add(x.id);if(im||add)grown.add(x.id);
    /* a leaf that has gone takes its twig and the tuft at its foot with it */
    /* (while it falls the twig falls with it; its copy seen through the cushion's foot is cut away at once) */
    {const gone=cls.includes(' gone'),cut=cls.includes(' cut');((B.ltw||{})[x.id]||[]).forEach((e,k)=>e.classList.toggle('gone',gone||(cut&&k>0)));{const rn=(B.ltwr||{})[x.id];if(rn)rn.classList.toggle('gone',gone)}const tf=(B.tuft||{})[x.id];if(tf)tf.classList.toggle('gone',gone)}
    if(im){shown++;if(s.run[x.id]&&s.run[x.id].st==='fail')failed=true}});
   /* a pad the mode keeps nothing of is cut back: once its leaves have fallen, the branch drops away and leaves a stub */
   /* a cushion stays while it holds a leaf the mode keeps, and shrinks away when it holds none; a previewed mode's extra
      growth shows as a faint outline behind. The crown is the tree's apex and is never cut away: one the mode keeps nothing
      of keeps its whole outline, dimmed (.jg.crown.pruned), and so does each of its cushions the mode keeps nothing of
      (.cush.idle), so the leader and its branchlets end inside it, never bare */
   const kk=[...kept].join(','),gk=[...grown].join(',');if(P.sk!==kk+'|'+gk){P.sk=kk+'|'+gk;const q=P.shape(P.crown&&list.length?()=>true:id=>kept.has(id)),d=gbPadD(P.o,q);
    q.cs.forEach((c,k)=>{const u=P.cu[k],ids=g.cs[k].ids;u.el.classList.toggle('off',!c.on);u.el.classList.toggle('idle',P.crown&&kept.size>0&&ids.length>0&&!ids.some(id=>kept.has(id)))});
    /* (a cushion's forked twigs go with it) */
    for(const e of P.jg.querySelectorAll('.tw.fk'))e.classList.toggle('off',!(q.cs[e.__k]||{}).on);
    P.els.clip.setAttribute('d',d);if(P.rcp)P.rcp.setAttribute('d',d);P.mk.setAttribute('d',d);P.els.ghost.setAttribute('d',gk===kk?d:gbPadD(P.o,P.shape(id=>grown.has(id))))}
   /* a leaf cut after it grew in a chosen mode heals where its twig left the wood: a small callus on that bark, beside the
      collar (gbCal), where the bark shows; under a cushion the foliage covers it, and on a branch it lies under the branch's knots,
      which stay raised bosses over it. What was only ever previewed leaves nothing */
   /* (one for each cushion's cut leaves, and one for those that hung beneath it: where the twigs of a cushion left the wood
      heals as one cut, at the collar nearest their middle, so a branch is never studded with them) */
   {B.scar=B.scar||{};const grp=new Map();for(const x of list){const el=B.leaf[x.id],t=P.rt.lt[x.id];if(!el||!t)continue;
    if(!el.__cal){const p=t.pts,a=p[0],e=p[Math.min(p.length-1,2)],m=Math.hypot(e[0]-a[0],e[1]-a[1])||1,u=[(e[0]-a[0])/m,(e[1]-a[1])/m],o=Math.min(2.4,(t.hw||2)*.6);el.__cal={c:[a[0]+u[0]*o,a[1]+u[1]*o],u,hw:t.hw||2}}
    const c=el.__cal.c,hid=!!(P.mk.isPointInFill&&P.mk.isPointInFill(new DOMPoint(c[0],c[1])));if(!((el.classList.contains('cut')||el.classList.contains('gone'))&&real.has(x.id)&&!hid&&(shown||!P.b)))continue;
    const k0=g.cOf.get(x.id),k=k0+(g.cs[k0]&&g.cs[k0].hang.some(q=>q.id===x.id)?'h':'');(grp.get(k)||grp.set(k,[]).get(k)).push(x)}
   const rep=new Map();for(const xs of grp.values()){const C=xs.map(x=>B.leaf[x.id].__cal.c),m=[C.reduce((a,q)=>a+q[0],0)/C.length,C.reduce((a,q)=>a+q[1],0)/C.length];let bi=0;C.forEach((q,i)=>{if(Math.hypot(q[0]-m[0],q[1]-m[1])<Math.hypot(C[bi][0]-m[0],C[bi][1]-m[1]))bi=i});rep.set(xs[bi].id,xs)}
   for(const x of list){const el=B.leaf[x.id];if(!el||!el.__cal)continue;
    const cut=el.classList.contains('cut'),{c,u}=el.__cal,on=rep.has(x.id),more=on?rep.get(x.id).length-1:0;let sc=B.scar[x.id];
    if(!on){if(sc)sc.classList.remove('on');continue}
    const sw=Math.max(cut?el.__lag||0:0,(el.__t0||0)-gbNow()),scIn=q=>{if(!quiet&&q.animate&&(cut||sw>0))q.animate([{opacity:0},{opacity:1}],{duration:60,delay:sw,fill:'backwards'})};
    if(sc&&!sc.classList.contains('on'))scIn(sc);
    if(!sc){const rx=Math.max(4,1.25*el.__cal.hw+1);sc=gbCal(c,[-u[1],u[0]],u,rx,rx*.72,'scar',sv('circle',{cx:gbF(c[0]),cy:gbF(c[1]),r:9,class:'hitc'}));sc.setAttribute('data-k','s:'+x.id);sc.setAttribute('data-pad',pid);sc.setAttribute('tabindex','-1');sc.setAttribute('role','button');const k1=P.jg.querySelector(':scope>.kn');if(k1)k1.before(sc);else P.lg.append(sc);B.scar[x.id]=sc;scIn(sc)}
    sc.classList.add('on');sc.setAttribute('aria-label','Scenario: '+x.title+', '+gbStateWord(x).t+(more?'; and '+more+' more pruned here':''))}}
   const falling=list.some(x=>B.leaf[x.id]&&B.leaf[x.id].classList.contains('cut'));const pruned=!!vis&&list.length>0&&!shown;const bare=!list.length;const cut=pruned&&!falling;const back=cut&&!!pv&&list.some(x=>gbRank[x.mode]<=gbRank[pv]);
   P.el.setAttribute('class','pad'+(P.crown?' crown':'')+(P.b&&P.b.back?' back':'')+(bare?' bare':'')+(gk!==kk?' pv-grow':'')+(failed?' failed':'')+(gw.pinned==='j:'+j.id?' sel':''));
   P.el.setAttribute('aria-label',(P.pol?'Journey '+n+', '+(P.pol==='failure'?'the ways it fails':'what it refuses'):'Journey '+n+', '+j.title)+(pruned?', pruned in '+gbModeName(vis):''));
   /* a journey's branch the chosen mode keeps nothing of: cut flush at the trunk and dropped if it grew (at rest before a
      choice, or in a chosen mode), its callus left (the stub); taken back into its collar, with no mark, if it was only ever a
      preview's. Either way the collar and fillets it laid on the trunk go with it, so nothing of it stands proud of the bark */
   if((vis||!pv)&&shown>0)real.add('p:'+pid);const pfell=real.has('p:'+pid),E=B.brEl[pid];
   if(P.shown===undefined)P.shown=(gw.prevShown||{})[pid];if(cut&&!P.cutDone){P.cutDone=true;if(!quiet&&P.shown&&P.jg.animate&&!P.crown){P.jg.animate(pfell||!E?[{transform:'translateY(0)',opacity:1},{transform:'translateY(20px)',opacity:0}]:gbBackK(E.col),{duration:pfell||!E?450:GB_BACK,easing:'ease-in'}).onfinish=()=>{if(P.cutDone)P.jg.classList.add('pruned')}}else P.jg.classList.add('pruned')}
   if(!cut){P.cutDone=false;P.jg.classList.remove('pruned')}P.shown=!cut;
   const willCut=!!pv&&!P.crown&&list.length>0&&cutN===list.length;P.jg.classList.toggle('pv-cut',willCut);P.jg.classList.toggle('pv-back',back);
   if(E){const was=E.stub.classList.contains('on');E.stub.classList.toggle('on',cut&&!back&&pfell);for(const e of E.on||[])e.style.display=cut&&!back?'none':'';if(cut&&!was&&!quiet&&E.stub.animate)E.stub.animate([{opacity:0},{opacity:1}],{duration:300,delay:350,fill:'backwards'});
    E.cutmk.classList.toggle('on',willCut);E.cuttag.classList.toggle('on',willCut);if(willCut)E.cuttag.textContent='cut · '+list.length}
   P.pruned=pruned;P.cut=cut;if(!P.pol&&cut)mainCut=true}
  /* each label speaks for its own pad: the journey's name or its riskiest guard or failure, then their state, one colour per word;
     a journey is headed once, so the branch of what it refuses or how it fails, which hangs on that journey, says only which it is */
  for(const pid of B.padsOf[j.id]||[]){const P=B.pad[pid],lb=B.lbl[pid];if(lb&&lb.pid){const inm=P.leaves.filter(inMode);lb.el.setAttribute('class','badge pol'+(inm.some(x=>s.run[x.id]&&s.run[x.id].st==='fail')?' fail':'')+(inm.length?'':' pruned')+(gw.pinned==='j:'+j.id?' sel':''))}if(!lb||lb.badge)continue;const list=P.leaves;
   lb.eb.textContent=(P.pol?'':'JOURNEY '+n+' · ')+(P.pol==='guard'?'WHAT IT REFUSES':P.pol==='failure'?'HOW IT FAILS':(gbSURFW[j.surface]||'START'));
   /* the state fills one line as wide as the name above it, then a second */
   const tk=gbTok(list,j,vis,inMode),room=Math.max(20,Math.floor((lb.w-18)/6.7));const l1=[],l2=[];let used=0;
   for(const t of tk){const add=(l1.length?3:0)+t[0].length;if(!l2.length&&(used+add<=room||!l1.length)){l1.push(t);used+=add}else l2.push(t)}
   const line=ts=>ts.flatMap((t,i)=>(i?[sv('tspan',{class:'n'},' · ')]:[]).concat([sv('tspan',{class:t[1]},t[0])]));
   lb.t2.replaceChildren(...line(l1));lb.t3.replaceChildren(...line(l2));
   const fails=list.some(x=>inMode(x)&&s.run[x.id]&&s.run[x.id].st==='fail');
   lb.el.setAttribute('class','lbl'+((P.b&&P.b.back)||P.pruned?' back':'')+(P.cut&&!P.crown?' pruned':'')+(fails?' fail':'')+(gw.pinned==='j:'+j.id?' sel':''))}
  const bd=B.lbl[j.id];if(bd&&bd.badge){bd.num.textContent=String(n);bd.el.setAttribute('class','badge'+(all.some(x=>inMode(x)&&s.run[x.id]&&s.run[x.id].st==='fail')?' fail':'')+(mainCut?' pruned':'')+(gw.pinned==='j:'+j.id?' sel':''))}}
 /* Max: each part's shoot, placed with the tree (gbBuild). Pointing at a smaller mode keeps the shoots where they are,
    faded, as everything else it would cut. */
 /* (a shoot is its wood and leaves, fl, which grow and fall together, and its count, which does neither) */
 if(!B.shoots){B.shoots={};for(const rec of B.shootGeo||[]){const el=sv('g',{class:'budg'}),fl=sv('g',{class:'shf'});el.append(fl);B.gShoot.append(el);{const sw=rec.pts.map((_,i)=>2.4-1.7*i/10);const sd=gbRib(rec.pts,sw);
    /* this year's shoot: barked where it has hardened, green toward its tip, out of a small swollen collar on the bark */
    fl.append(sv('path',{d:sd,class:'tw shoot'}),sv('path',{d:gbRib(rec.pts.slice(0,7),sw.slice(0,7)),class:'tw'}),sv('ellipse',{cx:gbF(rec.pts[0][0]),cy:gbF(rec.pts[0][1]),rx:3.1,ry:2.4,class:'w'}));
    /* the tick across its foot: where a mode that drops it will cut */
    {const a=rec.pts[1],b=rec.pts[2],dd=Math.hypot(b[0]-a[0],b[1]-a[1])||1,tx=(b[0]-a[0])/dd,ty=(b[1]-a[1])/dd;fl.append(sv('path',{class:'cutk',d:'M'+gbP([a[0]+ty*3.2-tx*1.4,a[1]-tx*3.2-ty*1.4])+' L'+gbP([a[0]-ty*3.2+tx*1.4,a[1]+tx*3.2+ty*1.4])}))}if(B.rclip)B.rclip.append(sv('path',{d:gbRib(rec.pts,rec.pts.map(()=>3.2))}))}
   {const q=rec.pts[rec.pts.length-1],q0=rec.pts[rec.pts.length-2],ang=Math.atan2(q[1]-q0[1],q[0]-q0[0])*180/Math.PI;rec.tbud=sv('path',{d:gbLeafD(5,2.4),class:'tipbud',transform:'translate('+gbP(q)+') rotate('+gbF(ang)+')'});fl.append(rec.tbud)}
   rec.g=el;rec.fl=fl;for(const uid of rec.uids){B.shoots[uid]=rec;B.budG[uid]=rec}
   /* a shoot sprouts from its collar once the growing wood has passed its knot and the knot is there, never out of bare air;
      its leaves open after it, one by one, then its count */
   const now=gbNow(),kT=(B.kT||{})[rec.kid]!==undefined?B.kT[rec.kid]+300:0,ts=Math.max((rec.tb||0)+80,kT);rec.sp=ts+300;
   if(!quiet&&fl.animate&&now<ts+300){const b=rec.base,T=k=>'translate('+gbF(b[0])+'px,'+gbF(b[1])+'px) scale('+k+') translate('+gbF(-b[0])+'px,'+gbF(-b[1])+'px)';
    gbPlay(fl,[{transform:T(.05),opacity:0},{offset:.25,transform:T(.42),opacity:1},{transform:T(1),opacity:1}],{duration:300,easing:'cubic-bezier(.2,.7,.3,1)',fill:'backwards'},ts)}}
  /* a knot whose checks found no place to grow puts out a short stub of a shoot off its boss, out of the same swollen collar,
     its count the bud at its tip, once the knot is there */
  for(const rec of B.shootRest||[]){const el=sv('g',{class:'budg dorm'}),fl=sv('g',{class:'shf'});el.append(fl);B.gShoot.append(el);rec.g=el;rec.fl=fl;rec.slots=[];
   {const sw=rec.pts.map((_,i)=>2.2-.9*i/(rec.pts.length-1));fl.append(sv('path',{d:gbRib(rec.pts,sw),class:'tw shoot'}),sv('path',{d:gbRib(rec.pts.slice(0,4),sw.slice(0,4)),class:'tw'}),sv('ellipse',{cx:gbF(rec.pts[0][0]),cy:gbF(rec.pts[0][1]),rx:2.8,ry:2.2,class:'w'}))}
   for(const uid of rec.uids){B.shoots[uid]=rec;B.budG[uid]=rec}const kT=(B.kT||{})[rec.kid];rec.sp=Math.max((rec.tb||0)+80,kT!==undefined?kT+300:0);
   if(!quiet&&fl.animate&&gbNow()<rec.sp+200)gbPlay(fl,[{opacity:0},{opacity:1}],{duration:200,fill:'backwards'},rec.sp)}}
 for(const uid in M.buds){const g=B.budG[uid];if(!g)continue;g.list=g.list||[];}
 for(const g of new Set(Object.values(B.shoots)))g.list=[];
 for(const uid in M.buds){const g=B.budG[uid];if(g)g.list.push(...M.buds[uid].filter(x=>x.scenarioKind!=='regression'))}
 for(const g of new Set(Object.values(B.shoots))){const list=gbOrd(g.list);
  /* a shoot that took in its crowded neighbours carries a leaf more, and says how many more checks it holds */
  {const n=Math.min(4,Math.max(3,list.length));if(g.n!==n){g.n=n;g.slots=g.dorm?[]:gbShootSlots(g.pts,n);g.list0=null}
   /* the count of the checks its leaves do not show, so its leaves and its count hold just its own knot's checks, as the
      Outline rolls them up: a small bud past its own tip (a dormant bud's is all of them), tied to it, where the one placement
      pass put it (gbKnotNames); with no clear place it is left off, and the shoot's last leaf says how many more */
   if(!g.cnt){const at=g.cntAt;g.cnt=sv('text',{class:'shn',x:gbF(at?at.x:0),y:gbF(at?at.y:0),'text-anchor':'middle'},'');
    g.ctag=at?sv('g',{class:'shtag'},sv('path',{class:'sbud',d:at.bud,transform:'translate('+gbP(at.at)+') rotate('+gbF(at.ang)+')'}),g.cnt):sv('g',{class:'shtag',style:'display:none'},g.cnt);g.g.append(g.ctag);
    const now=gbNow(),t1=(g.sp||0)+(g.dorm?0:g.n*40+150);if(!quiet&&g.ctag.animate&&now<t1+200)gbPlay(g.ctag,[{opacity:0},{opacity:1}],{duration:200,fill:'backwards'},t1)}
   const more=list.length-Math.min(list.length,g.slots.length);g.cnt.textContent=more>0?'+'+more:'';g.ctag.style.display=g.cntAt&&more>0?'':'none';
   /* (where it shows, the count is the shoot's tip bud, swollen) */
   if(g.tbud)g.tbud.style.display=g.cntAt&&more>0?'none':''}
  list.forEach((x,i)=>{let el=B.bud[x.id];if(i>=g.slots.length){if(el)el.classList.add('gone');return}
   const q=g.slots[i];if(el&&el.__q!==q){el.style.transform='translate('+gbF(q[0])+'px,'+gbF(q[1])+'px) rotate('+gbF(q[2])+'deg)'+(q[3]&&q[3]!==1?' scale('+gbF(q[3])+')':'');el.__q=q}
   if(!el){const fr=sv('g',{class:'gb-lfg'},sv('g',{class:'gb-lfi'},sv('circle',{r:gbF(Math.max(8,12/gbHf(B)/(q[3]||1))),cx:8.5,class:'hitc'}),sv('path',{d:'M0 0 L3.6 0',class:'bpet'}),sv('path',{d:gbLeafD(11,5.6),transform:'translate(9 0)',class:'blade'})));gbThumb(B,fr.firstChild,8.5,q[3]);el=sv('g',{class:'gb-lf bud','data-k':'s:'+x.id,tabindex:-1,role:'button'},fr);
    el.style.transform='translate('+gbF(q[0])+'px,'+gbF(q[1])+'px) rotate('+gbF(q[2])+'deg)'+(q[3]&&q[3]!==1?' scale('+gbF(q[3])+')':'');el.__q=q;el.__u=g.uids[0];el.__base=g.base;g.fl.append(el);B.bud[x.id]=el;
    const now=gbNow(),t1=(g.sp||0)+i*40;if(!quiet&&fr.animate&&now<t1+170)gbPlay(fr,[{transform:'scale(.001)'},{transform:'scale(1)'}],{duration:170,easing:'cubic-bezier(.2,.9,.3,1.15)',fill:'backwards'},t1)}
   /* while a dropped shoot fades, its leaves stay on it */
   const fad=!showBuds&&!!(g.fade||(g.on===undefined?gw.prevBuds:g.on));const im=(showBuds||fad)&&(inMode(x)||pv==='max'||fad);const cut=!!pv&&pv!=='max'&&inMode(x);
   el.setAttribute('class','gb-lf bud'+(x.scenarioKind==='regression'?' reg':'')+' '+gbLeafState(x)+(im?'':' gone')+(im&&!inMode(x)&&!fad?' pv-add':'')+(im&&(cut||fad)?' pv-out':''));
   el.setAttribute('aria-label',(x.scenarioKind==='regression'?'Existing flow: ':'Part check: ')+x.title+', '+gbStateWord(x).t+(i===g.slots.length-1&&list.length>g.slots.length?'; and '+(list.length-g.slots.length)+' more checks here, in the Outline':''))});
  /* shoots a chosen mode drops wither and fade, rather than vanish */
  const any=list.some(inMode),on=showBuds&&(any||pv==='max'),was=g.on===undefined?gw.prevBuds:g.on;g.on=on;
  const stop=()=>{if(g.fade){g.fade.cancel();g.fade=null}if(g.cfade){g.cfade.cancel();g.cfade=null}};
  /* where a shoot that grew in a chosen mode heals once a mode drops it: a callus beside its knot (gbBuild's cal), under the boss */
  /* (laid just under its own knot, which may sit on a branch's wood above the scars layer: the knot stays a raised boss over it) */
  if(!g.scar){const q=g.cal||{c:g.base,t:[1,0],n:[0,-1]},ke=B.navEl['u:'+g.kid];g.scar=gbCal(q.c,q.t,q.n,4,2.9,'shscar');if(ke&&ke.parentNode&&ke.parentNode!==B.gKn)ke.before(g.scar);else B.gScar.append(g.scar)}
  if(any&&(vis==='max'||(!vis&&!pv)))real.add('sh:'+g.kid);const fell=real.has('sh:'+g.kid);
  if(on){g.g.style.display='';stop()}
  /* (one cut before it has sprouted never sprouts; one cut while sprouting falls from where it got to) */
  else if(was&&!quiet&&(!pvWas||chose)&&g.fl&&g.fl.animate&&!g.fade&&!(gbNow()<(g.sp||0)-300)){g.g.style.display='';const lag=cutLag.get(g)||0;for(const a of g.fl.getAnimations())a.cancel();
   /* a dropped shoot that grew, at rest before a choice or in a chosen mode, is snipped at its collar, at its turn from the apex down: its callus shows
      beside the knot at once, and the shoot, still in the grey the preview gave it, tips 20 to 30 degrees about the cut, away
      from the wood, and drops 40 to 80 px along a short arc as it fades, in half a second, gathering speed. One only ever
      a preview's ghost shrinks back into its collar as it fades, and leaves no mark. Its count does not
      fall: it just fades. Once gone the motion is let go of, so the shoot can show again (a later preview's ghost, say) */
   const sd=g.tip[0]>=g.base[0]?1:-1,th=sd*(20+10*gbHash('shf:'+g.kid)),hf=gbHf(B),dy=(40+40*gbHash('shy:'+g.kid))/hf,dx=sd*(6+10*gbHash('shx:'+g.kid))/hf;
   const lg2=lag+(fell?GB_SNIP:0);if(fell){const v=[g.tip[0]-g.base[0],g.tip[1]-g.base[1]],m=Math.hypot(v[0],v[1])||1;gbSnip(g.g,g.base,[v[0]/m,v[1]/m],lag)}
   g.fade=g.fl.animate(fell?gbFallK(g.base,dx,dy,th):gbBackK(g.base),{duration:fell?GB_FALL:GB_BACK,delay:lg2,easing:GB_EASEIN,fill:'forwards'});
   if(g.ctag&&g.ctag.animate){const yet=gbNow()<(g.sp||0)+g.n*40+150;for(const a of g.ctag.getAnimations())a.cancel();g.cfade=g.ctag.animate(yet?[{opacity:0},{opacity:0}]:[{opacity:1},{opacity:0}],{duration:yet?GB_FALL+lg2:120,delay:yet?0:lg2,easing:'ease-in',fill:'forwards'})}
   {const a=g.fade;a.onfinish=()=>{if(g.fade!==a)return;g.fade=null;if(!g.on)g.g.style.display='none';a.cancel();if(g.cfade){g.cfade.cancel();g.cfade=null}g.g.classList.remove('fall')}}}
  else if(!g.fade)g.g.style.display='none';
  /* the callus shows at the snip, and never before the growing wood has reached its knot */
  /* (and only on wood that stays: a shoot on a branch that is cut away goes with the branch) */
  const bp=g.bid?B.pad[g.bid]:null,heal=!on&&fell&&!(bp&&bp.pruned);if(heal&&!g.scarOn&&!quiet&&g.scar.animate){const w=Math.max(g.fade?cutLag.get(g)||0:0,(g.sp||0)-300-gbNow());if(g.fade||w>0)g.scar.animate([{opacity:0},{opacity:1}],{duration:60,delay:w,fill:'backwards'})}g.scarOn=heal;
  g.scar.classList.toggle('on',heal);g.g.classList.toggle('fall',!!g.fade&&!on);g.g.classList.toggle('pv-add',pv==='max'&&!any);g.g.classList.toggle('pv-out',(!!pv&&pv!=='max'&&any)||(!!g.fade&&!on));g.g.classList.toggle('pre',!s.modeBy&&!pv&&!list.some(x=>gbRank[x.mode]===0))}
 /* the existing flows: each a graft bud at the knot it re-checks (gbBuild), ringed in its run's state, there while Max is; a
    mode that drops them lets them fade as its shoots fall */
 {const regs=Object.values(M.buds).flat().filter(x=>x.scenarioKind==='regression');B.grafts=B.grafts||{};
  for(const r of B.graftR||[]){const x=regs.find(q=>q.id===r.xid);if(!x)continue;let el=B.bud[x.id];
   if(!el){const c=r.c,t=r.t||[1,0],n=r.n||[0,-1],ang=gbF(Math.atan2(t[1],t[0])*180/Math.PI),at=(a,b)=>[c[0]+t[0]*a+n[0]*b,c[1]+t[1]*a+n[1]*b],cr=[];
    /* the swelling, its lit rim on the outer side (a crescent), and the bud tip at its crown pointing out of the wood */
    for(let i=0;i<=8;i++){const q=Math.PI*(.12+.76*i/8);cr.push(at(-Math.cos(q)*r.r*.86,Math.sin(q)*2.5*.86))}for(let i=8;i>=0;i--){const q=Math.PI*(.12+.76*i/8);cr.push(at(-Math.cos(q)*r.r*.62,Math.sin(q)*2.5*.5))}
    const tip=at(0,2.2),ta=gbF(Math.atan2(n[1],n[0])*180/Math.PI);
    el=sv('g',{class:'gb-gr'+(r.under?' under':''),'data-k':'s:'+x.id,tabindex:-1,role:'button'},sv('circle',{cx:gbF(c[0]),cy:gbF(c[1]),r:gbF(Math.max(5.2,7/gbHf(B))),class:'hitc'}),
     sv('g',{class:'gsw'},sv('ellipse',{cx:gbF(c[0]),cy:gbF(c[1]),rx:gbF(r.r+.9),ry:3.4,transform:'rotate('+ang+' '+gbP(c)+')',class:'ghalo'}),sv('ellipse',{cx:gbF(c[0]),cy:gbF(c[1]),rx:gbF(r.r),ry:2.5,transform:'rotate('+ang+' '+gbP(c)+')',class:'gring'}),
      sv('path',{d:gbLine(cr)+'Z',class:'gcres'}),sv('path',{d:gbLeafD(3.4,1.5),class:'gtip',transform:'translate('+gbP(tip)+') rotate('+ta+')'}),
      r.cnt?sv('g',{class:'shtag'},sv('path',{class:'sbud',d:r.cnt.bud,transform:'translate('+gbP(r.cnt.at)+') rotate('+gbF(r.cnt.ang)+')'}),sv('text',{class:'shn',x:gbF(r.cnt.x),y:gbF(r.cnt.y),'text-anchor':'middle'},'+'+r.cnt.more)):null));
    /* (on a phone its 44 px target is a hit circle too: a graft bud is a swelling, never a drawn ring) */
    gbThumb(B,el,gbF(c[0]),1,gbF(c[1]),'hitc');
    el.__u=r.kid;el.__route=r.route;r.par.append(el);B.bud[x.id]=el;(B.grafts[r.kid]=B.grafts[r.kid]||[]).push(el);
    /* set into the bark once the wood it sits on has grown there and its knot is there */
    el.__x=x;const now=gbNow(),tb=r.tb||0;if(!quiet&&el.animate&&now<tb+300)gbPlay(el,[{opacity:0},{opacity:1}],{duration:300,fill:'backwards'},tb)}
   const im=showBuds&&(inMode(x)||pv==='max'),cut=!!pv&&pv!=='max'&&inMode(x),was=el.__on;el.__on=im;
   if(im){if(el.__fade){el.__fade.cancel();el.__fade=null}}
   else if(was&&!quiet&&(!pvWas||chose)&&el.animate&&!el.__fade&&!(gbNow()<(r.tb||0))){for(const q of el.getAnimations())q.cancel();const a=el.__fade=el.animate([{opacity:1},{opacity:0}],{duration:360,delay:cutLag.get(el)||0,easing:'ease-in',fill:'forwards'});a.onfinish=()=>{if(el.__fade===a){el.__fade=null;if(!el.__on)el.classList.add('gone')}a.cancel()}}
   /* a swelling that carries a count shows the worst of its flows: failed, then running, then not yet run */
   const rk=c=>{const i=['fail','run','none','idle','pre','in'].indexOf(c.split(' ')[0]);return i<0?9:i},st=r.grp?r.grp.map(id=>regs.find(q=>q.id===id)).filter(Boolean).map(gbLeafState).reduce((a,c)=>rk(c)<rk(a)?c:a,gbLeafState(x)):gbLeafState(x);
   el.setAttribute('class','gb-gr '+st+(r.under?' under':'')+(im||el.__fade?'':' gone')+(im&&!inMode(x)?' pv-add':'')+((im&&cut)||el.__fade?' pv-out':''));
   el.setAttribute('aria-label','Existing flow it re-checks: '+x.title+', '+gbStateWord(x).t)}}
 /* a failure cracks the knot it names, and that file's name stays up; a running journey's route flows gold */
 /* a hop that broke cracks its knot; one a check failed after was reached, so its knot stays whole and named, and the wood
    just past it is red */
 const wounds=new Set(),past=new Set(),live=new Set();B.fails=[];
 for(const j of M.J)for(const x of M.leaves[j.id]){const r=s.run[x.id];if(!r)continue;if(r.st==='run')live.add(j.id);if(r.st==='fail'&&inMode(x)){const w=gbWound(M,j,x);if(w){(r.after&&!B.root[w]?past:wounds).add(w);B.fails.push({x,xid:x.id,jid:j.id,unit:w,after:!!r.after})}}}
 const kw=(ids,S)=>ids.some(id=>S.has(id));
 for(const el of new Set(Object.values(B.knot))){el.classList.toggle('wound',kw(el.__ids,wounds));el.classList.toggle('brk',!kw(el.__ids,wounds)&&kw(el.__ids,past))}
 for(const id in B.klbl){const ids=B.knot[id]?B.knot[id].__ids:[];B.klbl[id].classList.toggle('wound',kw(ids,wounds));B.klbl[id].classList.toggle('brk',!kw(ids,wounds)&&kw(ids,past))}for(const id in B.root)B.root[id].classList.toggle('wound',wounds.has(id));
 for(const id in B.vein){const V=B.vein[id];for(const el of V.els)el.classList.toggle('live',live.has(V.jid))}
 gbLight();if(!gw.hov)gbPinTip()}
function gbWidth(){const S=gw.slots;const w=(S&&S.scroll&&S.scroll.clientWidth)||(gw.el&&gw.el.clientWidth)||window.innerWidth-48;return Math.max(320,Math.min(1240,Math.floor(w/40)*40))}

/* a knot's name: its file's, or for a burl the file in it that is lit (else its first) and how many more grew into it. It is
   said whole (sh -1) wherever its place beside its knot has room for that, measured (gbKnotNames); else shorter: 0, a burl's
   file's name is cut to 16 and a lone file's to 24; 1, a burl's "parts" go and a lone file's name is cut to 14; 2, the file's
   name is cut to 9 */
const gbKnotTxt=(M,ids,lead,sh)=>{const u=M.U[lead]||{},n=ids.length,c=sh<0?[40,40]:[[16,24],[16,14],[9,9]][sh||0];return gwCut(u.label||lead,n>1?c[0]:c[1])+(n>1?' +'+(n-1)+(sh>0?'':n>2?' parts':' part'):'')};
/* what a knot is, for who gets open ground first when it runs short: 0 where a journey starts, 1 an HTTP route, 2 a store or a
   job, 3 a helper file (a burl, its most important) */
const gbKTier=(M,ids)=>Math.min(...ids.map(id=>{const u=M.U[id]||{},kd=String(u.unitKind||'');return M.J.some(j=>j.entry===id)?0:kd==='route'||u.layer==='api'?1:/job|table|store|queue|cron|worker/.test(kd)||u.layer==='jobs'||u.layer==='data'?2:3}));
/* The names, placed once for the drawing (gbKnotNames) over everything Max grows on it, its shoots, their leaves and counts and
   the graft buds, whether they show or not, so no mode, preview, pick, prune, pin or hover ever moves one: they only light or
   fade a name where it stands; a pip's mark counts on from tree to tree, and every file in its knot answers to it */
function gbPutNames(B,bud){const out={slot:new Map(),pip:new Map(),num:new Map(),ext:0};let n=0;
 for(const run of B.kplace||[]){const r=run(bud,n);for(const [id,g] of r.slot)out.slot.set(id,g);for(const [id,q] of r.pip){out.pip.set(id,q);for(const u of q.ids)out.num.set(u,q.n)}n+=r.pip.size;out.ext=Math.max(out.ext,r.ext||0)}return out}
/* a pip's mark: a letter at every width, as journeys wear numbers, so the two are never read as one count */
const gbPipMark=(B,n)=>n<=26?String.fromCharCode(96+n):String(n);
/* Set each name where it was placed and light it: every file is named at rest; while something is lit its own names show and
   the rest fade, each where it stands, and a pip and its row in the key go with its name */
function gbPlaceNames(B){const P=B.knp=B.kput||(B.kput=gbPutNames(B,true));
 if(P.ext&&!B.kext){B.kext=P.ext;const v=B.svg.viewBox.baseVal;B.svg.setAttribute('viewBox',[v.x,v.y,v.width,v.height+P.ext].map(gbF).join(' '))}
 for(const id in B.klbl){const kl=B.klbl[id],g=P.slot.get(id),q=P.pip.get(id),at=g||q,show=!!(kl.__want||kl.__rest);kl.__fit=!!at;kl.__key=!!q;
  if(at&&kl.__at!==at){kl.__at=at;if(kl.__sh!==(at.sh||0)){kl.__sh=at.sh||0;const t=gbKnotTxt(gw.M,B.knot[id]?B.knot[id].__ids:[id],kl.__lead||id,kl.__sh);if(kl.textContent!==t)kl.textContent=t}kl.setAttribute('x',gbF(at.x));kl.setAttribute('y',gbF(at.yb));kl.setAttribute('text-anchor',at.anc);kl.__r=at.r;kl.__ld.setAttribute('d',g?'M'+g.pts.map(gbP).join(' L'):'');
   for(const el of [kl.__pip,kl.__kp])el.lastChild.textContent=q?gbPipMark(B,q.n):'';
   if(q)for(const [el,x,y] of [[kl.__kp,q.cx,q.cy],[kl.__pip,q.bx,q.by]]){const c=el.firstChild,t=el.lastChild;c.setAttribute('cx',gbF(x));c.setAttribute('cy',gbF(y));t.setAttribute('x',gbF(x));t.setAttribute('y',gbF(y))}}
  kl.classList.toggle('nofit',!at);kl.classList.toggle('on',!!at&&show);kl.classList.toggle('kdim',!!at&&!show);kl.classList.toggle('rest',!!at&&!!kl.__rest);
  const cl=[...kl.classList].filter(c=>c!=='klbl'&&c!=='nofit').join(' ');kl.__pip.setAttribute('class','kpip '+cl+(q?'':' none'));kl.__kp.setAttribute('class','kpip key '+cl+(q?'':' none'))}
 return P}
/* What hover, focus, a pin or a chosen criterion lights: a leaf lights its journey's path to the roots, a pad its whole
   journey, a knot every journey through it, a criterion the leaves that prove it. Everything else dims. */
function gbLit(){const s=gw.state,M=gw.M,B=gw.B;const k=gw.hov||gw.pinned||null;const out={leaves:new Set(),js:new Set(),units:new Set(),leaf:null,part:null,pad:null};
 if(gw.selCrit&&!gw.hov){for(const x of s.scenarios)if(x.criteria.includes(gw.selCrit)){out.leaves.add(x.id);const j=M.J.find(q=>M.leaves[q.id].includes(x));if(j)out.js.add(j.id)}}
 else if(k&&k.startsWith('s:')){const id=k.slice(2);const x=s.scenarios.find(q=>q.id===id);if(x){out.leaves.add(id);out.leaf=x;out.pad=(B.leaf[id]||{}).__p||null;const j=M.J.find(q=>M.leaves[q.id].includes(x));if(j)out.js.add(j.id);else out.part=x.unit}}
 else if(k&&k.startsWith('j:'))out.js.add(k.slice(2));
 else if(k){const id=k.startsWith('u:')?k.slice(2):k;out.part=id;for(const j of M.J)if(j.units.includes(id))out.js.add(j.id)}
 for(const jid of out.js){const j=M.J.find(q=>q.id===jid);if(!j)continue;j.units.forEach(u=>out.units.add(u));if(!out.leaf)M.leaves[jid].forEach(x=>out.leaves.add(x.id))}
 if(out.part)out.units.add(out.part);return out}
function gbLight(){const B=gw.B;if(!B)return;const L=gbLit();const any=!!(gw.hov||gw.pinned||gw.selCrit);const on=any&&(L.leaves.size>0||L.js.size>0||!!L.part);
 B.svg.classList.toggle('dim',on);B.svg.classList.toggle('lfdim',on&&!!L.leaf);
 for(const id in B.leaf){const el=B.leaf[id];el.classList.toggle('hl',L.leaves.has(id));el.classList.toggle('sel',gw.pinned==='s:'+id)}
 for(const id in B.bud){B.bud[id].classList.toggle('hl',L.leaves.has(id)||(L.part&&gw.state.scenarios.some(x=>x.id===id&&x.unit===L.part)))}
 /* a leaf lights only its own pad and the route that feeds it, and its row in the lists beside the tree; the journey's
    files are named on their knots */
 const onPad=(id,jid)=>L.pad?id===L.pad:L.js.has(jid);
 for(const id in B.pad){const P=B.pad[id],lit=onPad(id,P.jid);P.el.classList.toggle('hl',lit);P.jg.classList.toggle('hl',lit)}
 for(const id in B.lbl){B.lbl[id].el.classList.toggle('hl',B.lbl[id].badge?L.js.has(id):onPad(id,B.lbl[id].jid))}
 for(const el of document.querySelectorAll('[data-sid].hl'))el.classList.remove('hl');
 if(L.leaf)for(const el of document.querySelectorAll('[data-sid="'+L.leaf.id.replace(/["\\]/g,'')+'"]'))el.classList.add('hl');
 /* a leaf lights its own scenario's hops (gbRoute): a failed one's up to where it broke, and the files past the break are
    marked as never reached; the rest of its journey stays unlit */
 const R0=L.leaf&&on?gbRoute(L.leaf):null,litU=R0&&R0.lit?R0.lit:L.units,unU=R0&&R0.un?R0.un:new Set(),outU=R0&&R0.out?R0.out:new Set();
 /* (a knot lights only where the drawn sap passes through it: a hop the leaf's sap never runs past, up the leader above where
     its branch joins, keeps its name but not the glow) */
 const konU=R0&&R0.kon?R0.kon:null;
 for(const el of new Set(Object.values(B.knot))){const lit=el.__ids.some(id=>litU.has(id)&&(!konU||konU.has(id)));el.classList.toggle('on',lit);el.classList.toggle('unreached',!el.__ids.some(id=>litU.has(id))&&el.__ids.some(id=>unU.has(id)))}
 /* red is the focused failure's alone: a knot where a scenario broke shows it at rest, and while what is lit holds that
    scenario (the leaf itself, its pad or journey, the knot, a criterion it answers); otherwise it is a plain knot */
 const hk0=gw.hov&&gw.hov.startsWith('u:')?gw.hov.slice(2):null;
 const woundOn=e=>!on||(L.leaf?L.leaf.id===e.xid:gw.selCrit&&!gw.hov?L.leaves.has(e.xid):(!!hk0&&e.unit===hk0)||(L.js.has(e.jid)&&(!L.pad||(B.leaf[e.xid]||{}).__p===L.pad)));
 const mute=ids=>{const es=(B.fails||[]).filter(e=>ids.includes(e.unit));return es.length>0&&!es.some(woundOn)};
 for(const el of new Set(Object.values(B.knot)))el.classList.toggle('wmute',mute(el.__ids));
 for(const id in B.klbl)B.klbl[id].classList.toggle('wmute',mute(B.knot[id]?B.knot[id].__ids:[id]));for(const id in B.root)B.root[id].classList.toggle('wmute',mute([id]));
 const rootPart=L.part&&B.root[L.part]?gw.M.U[L.part]:null;
 const kp=gw.hov||gw.pinned||'',hk=kp.startsWith('u:')?kp.slice(2):null;
 /* Every file is named at rest, each name where it was placed once (gbKnotNames); what is lit only lights its names and fades
    the rest. Every hop of the lit route keeps its name, reached or not, as does where it broke. A burl reads with the file in
    it that is pointed at or lit first, in the place kept for it */
 for(const id in B.klbl){const kl=B.klbl[id],ids=B.knot[id]?B.knot[id].__ids:[id];
  const lit=on&&ids.some(q=>q===hk||litU.has(q)||(!!rootPart&&q===rootPart.parent)),un=on&&!lit&&ids.some(q=>unU.has(q)||outU.has(q));
  kl.__want=lit||un;kl.__rest=!on;
  if(ids.length>1){const lead=ids.find(q=>q===hk)||(L.leaf?ids.find(q=>q===L.leaf.unit):null)||(on?ids.find(q=>litU.has(q))||ids.find(q=>unU.has(q)):null)||id,t=gbKnotTxt(gw.M,ids,lead,kl.__sh);kl.__lead=lead;if(kl.textContent!==t)kl.textContent=t}
  kl.classList.toggle('unreached',on&&!ids.some(q=>litU.has(q))&&ids.some(q=>unU.has(q)));kl.classList.toggle('oos',on&&!ids.some(q=>litU.has(q)||unU.has(q))&&ids.some(q=>outU.has(q)));
  /* the knot pointed at, or the hop a leaf's scenario checks, stands out as its card's bold name does */
  kl.classList.toggle('pt',on&&ids.some(q=>q===hk||(!!L.leaf&&L.leaf.scenarioKind!=='happy'&&q===L.leaf.unit)))}
 gbPlaceNames(B);
 for(const id in B.root){B.root[id].classList.toggle('hl',litU.has(id));B.root[id].classList.toggle('sel',gw.pinned==='u:'+id)}
 /* The route (gbRoute) for a leaf; for a root, the sap it sends up the trunk to each journey it feeds */
 let d='',dx='',dw='',df='',dc='',ds='',sq=false;const x=L.leaf;const line=pts=>'M'+pts.map(gbP).join(' L');
 if(x){const R=R0||gbRoute(x);if(R){d=R.d;dx=R.dx;dw=R.dw;df=R.df||'';dc=R.dc||'';ds=R.ds||'';sq=!!R.sq}}
 else if(rootPart){const rr=B.L.roots.find(q=>q.id===L.part);if(rr){const up=rr.pts.slice().reverse();for(const jid of L.js){const pid=(B.padsOf[jid]||[]).find(q=>!B.pad[q].pol)||(B.padsOf[jid]||[])[0];const P=pid&&B.pad[pid];if(!P)continue;
   /* (up the root to where it forks from the trunk above the soil, then up the trunk: no spur down into the ground) */
   const sp=gbSpine(P.rt,P.o),f=gbFork(sp,rr);d+=(d?' ':'')+line(gbSmooth([...sp.slice(0,f.iJ),...f.out].reverse(),1))}if(!d)d=line(up)}}
 /* the wood where a scenario broke turns red only while that scenario's route is lit; at rest its knot's crack and its red
    name say where it broke, and the wood stays wood */
 /* the glow runs only where the sap ran: it ends at the break, or just past the hop a leaf's own scenario checks. Past a
    break the route is small grey dots, under the faint knots it never reached; past the hop it checks, plain wood. The glow
    and the red are bands inside the wood, sized from its girth (gbRibbon, gbRed) */
 if(!B.sapF){B.sapF=sv('path',{class:'sap faint',d:''});B.sapXo=sv('path',{class:'sap resto',d:''});B.sapX.before(B.sapF,B.sapXo)}
 B.sapX.setAttribute('d',dx);B.sapXo.setAttribute('d',dx);B.sapF.setAttribute('d',df);B.sapW.setAttribute('d',dw);
 /* (a spur up the leader to a reached hop above the route, gbSpur, is the same sap: its band and its core line) */
 if(!B.sapS){B.sapS=sv('path',{class:'sap spur',d:''});B.sap.after(B.sapS)}
 const rib=d?gbRibbon(B,d,.33,1.4,9,sq,sq&&dw?GB_REDK-.03:0)+(ds?' '+gbRibbon(B,ds,.33,1.4,9,false):''):'';B.sapU.setAttribute('d',rib);B.sapR.setAttribute('d',rib);B.sap.setAttribute('d',dc||d);B.sapS.setAttribute('d',d?ds:'');gbRed(B,dw)}
/* The wood a leaf's sap runs through on its way down: from where its stalk meets its cushion, down the twig that carries
   that cushion (or, for the outer cushion, to the branch's end inside it), along the branch's centre line to the trunk
   (round a fillet as wide as the branch, not a corner), and down the trunk's centre line. Without a cushion it joins the
   branch straight below. */
function gbSpine(R,at,id){const T=id!==undefined&&R.lt?R.lt[id]:null;const into=(p,q)=>gbSmooth([p,[p[0]+(q[0]-p[0])*.2,(p[1]+q[1])/2],q],2);let mid,K=R.k;
 /* down the leaf's own twig, then the riser or branchlet it forks from, then its branch, or straight into the leader; each
    place it passes from one piece of wood to the next is a join, rounded off as the wood there allows */
 const J=[],cr=Math.max(8,(R.bw||8)*1.1),tr=2,join=r=>J.push([mid.length-1,r]);
 if(T){mid=[at,...T.pts.slice(0,-1).reverse()];if(T.c){join(tr);mid.push(...T.c.pts.slice(0,T.bi).reverse());if(R.br){join(tr);mid.push(...R.br.slice(0,T.c.bi).reverse())}else K=T.c.bi}else if(R.br){join(tr);mid.push(...R.br.slice(0,T.bi).reverse())}else K=T.bi}
 else if(R.br){let bi=R.br.length-1,bd=1e9;for(let i=R.exit;i<R.br.length;i++){const dd=Math.abs(R.br[i][0]-at[0]);if(dd<bd){bd=dd;bi=i}}mid=into(at,R.br[bi]);join(tr);mid.push(...R.br.slice(0,bi).reverse())}
 else mid=into(at,R.tp[R.k]);
 join(R.br?cr:tr);const all=[...mid,...R.tp.slice(0,K).reverse()];return gbFillet(all,J)}
/* A polyline with each join (an index and a radius) rounded off: from about r before the corner to about r after it, a curve
   close to a circular arc tangent to both legs, so the turn is spread over the arc and never taken at a point. Each round stays
   between the joins either side of it. lead: where the result is past its last join (for a route, on the leader). */
function gbFillet(all,J){J=J.filter(([c])=>c>0&&c<all.length-1).sort((a,b)=>a[0]-b[0]);if(!J.length){const o=all.slice();o.lead=0;return o}const out=[];let from=0,lead=0;
 J.forEach(([c,r],k)=>{const lo=k?Math.ceil((J[k-1][0]+c)/2):0,hi=k<J.length-1?Math.floor((c+J[k+1][0])/2):all.length-1;
  const a0=Math.max(lo,from,gbBack(all,c,r)),a1=Math.min(hi,gbFwd(all,c,r));if(a0>=c||a1<=c){lead=out.length+c-from;return}
  const P0=all[a0],C=all[c],P3=all[a1],u=[C[0]-P0[0],C[1]-P0[1]],v=[P3[0]-C[0],P3[1]-C[1]],lu=Math.hypot(u[0],u[1])||1,lv=Math.hypot(v[0],v[1])||1;
  const ph=Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/(lu*lv)))),kk=ph<1e-3?2/3:4/3*Math.tan(ph/4)/Math.tan(ph/2);
  out.push(...all.slice(from,a0),...gbBez([P0,[P0[0]+kk*u[0],P0[1]+kk*u[1]],[P3[0]-kk*v[0],P3[1]-kk*v[1]],P3],12).slice(0,-1));from=a1;lead=out.length});
 out.push(...all.slice(from));out.lead=lead;return out}
/* A scenario's route: one path in the order its sap runs, from the foot of the leaf's stalk down its twig and its branch,
   round the collar where that branch meets the leader, then hop to hop down the leader's centre line to the last file its
   journey reaches, then out along every root the journey depends on. A leaf on a branch of its own joins the leader at that
   branch's collar, so its route runs on from that hop. A failed scenario's route is amber as far as it ran and no further;
   red is the wood just past the hop where it broke (from the edge of that hop's boss to short of the next boss), or across
   the hop's own boss when it broke at the hop, or the start of a root; grey dots beyond, where it never ran, to the last
   hop's knot and no further. A scenario that checks one hop runs to that hop, and the rest of its journey is just wood,
   unlit, with no dots: it was never meant to run there. When the run does not say where it broke, only the leaf is red. A
   part check's route is the wood its shoot grows from. Also returns the route's stretches as points: main, the amber's run
   along the leader, from where the leaf's own wood has joined it, a point to the pixel; the red stretch; and out, the hops
   past what it checks. sq: the amber ends square where the red begins, under the red's round start. ds: the spurs (gbSpur). */
function gbRoute(x){const R=gbRoute0(x);return R?gbSpur(x,R):R}
/* A hop the scenario reached on the leader above where its leaf's own wood joins the leader lights too: a spur of sap runs
   down the leader's centre line from just past that hop's knot to where the route (all of it amber there) comes down the
   leader, so every hop it reached is lit and none is skipped. Returns the route with the spur's points, its path ds, and the
   knots it passes added to those that light. */
function gbSpur(x,R){const B=gw.B,el=B.leaf[x.id]||B.bud[x.id],P=el&&B.pad[el.__p];if(!R.lit||!R.main||!R.main.length||!P||!P.rt||!P.rt.tp)return R;
 const tp=P.rt.tp,Mn=R.main,onM=q=>Mn.some(m=>Math.hypot(m[0]-q[0],m[1]-q[1])<1.2);let lo=-1;for(let i=0;i<tp.length;i++)if(onM(tp[i]))lo=i;if(lo<0)return R;
 const kOn=id=>{const kn=B.knot[id];return !!kn&&!B.root[id]&&kn.__on==='t'},at=id=>{const p=B.pos[id];let ci=-1,bd=4;if(p)tp.forEach((q,i)=>{const d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<bd){bd=d;ci=i}});return ci};
 let hi=-1;for(const id of R.lit)if(kOn(id)&&!(R.kon&&R.kon.has(id))){const ci=at(id);if(ci>lo)hi=Math.max(hi,ci)}if(hi<0)return R;
 const s=tp.slice(lo,gbFwd(tp,hi,3)+1).reverse(),kon=new Set(R.kon||[]);
 for(const id of R.lit)if(kOn(id)){const g=B.knot[id].__geo,p=B.pos[id];if(g&&p&&s.some((q,i)=>i>0&&gbSegD(p,p,s[i-1],q)<=g.ra+3))kon.add(id)}
 return {...R,spur:s,ds:'M'+s.map(gbP).join(' L'),kon}}
function gbRoute0(x){const B=gw.B,M=gw.M,L=B.L;const el=B.leaf[x.id]||B.bud[x.id];if(!el)return null;const line=pts=>'M'+pts.map(gbP).join(' L');
 const j=M.J.find(q=>M.leaves[q.id].includes(x));
 if(!j){if(el.__route)return {d:line(gbSmooth(el.__route,1)),dx:'',dw:'',df:''};const g=el.__base&&B.budG[x.unit];return g?{d:line(gbSmooth(g.route,1)),dx:'',dw:'',df:''}:null}
 const P=B.pad[el.__p];const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)(?:\s*rotate\(([-\d.]+)deg\))?/.exec(el.style.transform);if(!m||!P||!P.rt)return null;
 const ra=m[3]?(+m[3])*Math.PI/180:0,k0=P.geo.L/2+GB_PET,at=[+m[1]-Math.cos(ra)*k0,+m[2]-Math.sin(ra)*k0];
 const r=gw.state.run[x.id],w=r&&r.st==='fail'?gbWound(M,j,x):null;
 const nearI=(path,id)=>{const p=B.pos[id];if(!p)return -1;let ci=-1,bd=20;path.forEach((q,i)=>{const dd=Math.hypot(q[0]-p[0],q[1]-p[1]);if(dd<bd){bd=dd;ci=i}});return ci};
 const isK=id=>!!B.knot[id]&&!B.root[id];
 /* (the hops whose knots the drawn sap passes through, within three pixels of the boss: only those knots light) */
 const onK=Ps=>new Set(j.units.filter(id=>{if(!isK(id))return true;const g=(B.knot[id]||{}).__geo,p=B.pos[id];return !!g&&!!p&&Ps.some(P=>P.some((q,i)=>i>0&&gbSegD(p,p,P[i-1],q)<=g.ra+3))}));
 let pts=gbSpine(P.rt,at,x.id);const lead=pts.lead||0,onL=q=>{const o=q.slice(Math.min(lead,Math.max(0,q.length-2))),a=gbLen(o);return gbResample(o,Math.max(1,Math.ceil(a[a.length-1])))};const rr0=j.units.filter(id=>B.root[id]).map(id=>B.L.roots.find(q=>q.id===id)).filter(Boolean);
 /* with no root to run out along, the route ends at the last file it reaches, not in the soil */
 if(!rr0.length){let last=-1;for(const id of j.units){if(!B.knot[id])continue;const ci=nearI(pts,id);if(ci>=0)last=Math.max(last,ci)}
  if(last>=0)pts=pts.slice(0,gbFwd(pts,last,w&&r.after?48:8)+1)}
 /* The trunk hands the route to a root where the root flares from it on the soil line: the route leaves the trunk's centre
    line above the soil and turns through a fillet onto the root's centre line. It never runs down into the soil, and inside
    the pot it keeps to the soil's top. */
 let main=pts,rts=[];
 if(rr0.length){const J=rr0.map(rr=>({rr,...gbFork(pts,rr)}));
  const i0=Math.min(...J.map(o=>o.iJ));main=pts.slice(0,i0+1);
  rts=J.map(o=>({id:o.rr.id,pts:[...pts.slice(i0,o.iJ),...o.out]}))}
 const all=()=>line(main)+rts.map(q=>' '+line(q.pts)).join('');
 /* which hops are the scenario's own (gbReach): a happy path runs the whole journey; any other scenario runs from the
    journey's start to the hop it checks, and the rest of the journey is not its route */
 const ix=j.units.indexOf(x.unit),hop=ix>=0?{i:ix+1,n:j.units.length,label:(M.U[x.unit]||{}).label||x.unit}:null;
 const own=gbReach(M,j,x).own?j.units.slice(0,ix+1):null;
 const whole={d:all(),dx:'',dw:'',df:'',lit:new Set(j.units),un:new Set(),out:new Set(),hop,main:onL(main),kon:onK([main,...rts.map(q=>q.pts)])};
 /* past the hop it checks the journey is plain wood: no glow and no dots; its files are named, muted, as the card mutes them */
 if(!w){if(!own)return whole;const out=new Set(j.units.filter(id=>!own.includes(id)));
  if(B.root[x.unit])return {d:line(main)+rts.filter(t=>t.id===x.unit).map(t=>' '+line(t.pts)).join(''),dx:'',df:'',dw:'',lit:new Set(own),un:new Set(),out,hop,main:onL(main),kon:onK([main,...rts.filter(t=>t.id===x.unit).map(t=>t.pts)])};
  let ci=-1;for(const id of own)if(!B.root[id])ci=Math.max(ci,nearI(main,id));if(ci<0)return whole;
  const acc=gbLen(main),g=(B.knot[j.units[ix]]||{}).__geo||{};let i1=acc.findIndex(v=>v>=acc[ci]+(g.ra||5)+6);if(i1<0)i1=main.length-1;
  return {d:line(main.slice(0,i1+1)),dx:'',df:'',dw:'',lit:new Set(own),un:new Set(),out,hop,main:onL(main.slice(0,i1+1)),kon:onK([main.slice(0,i1+1)])}}
 const wi=j.units.indexOf(w),lit=new Set(j.units.slice(0,wi+1)),un=new Set(j.units.slice(wi+1).filter(id=>!B.root[w]||!B.root[id]));
 if(B.root[w]){const q=rts.find(t=>t.id===w);if(!q)return whole;const acc=gbLen(q.pts),ci=acc.findIndex(v=>v>Math.max(24,acc[acc.length-1]*.45));
  return {d:line(main)+rts.filter(t=>t!==q).map(t=>' '+line(t.pts)).join(''),dw:line(q.pts.slice(0,ci<0?q.pts.length:ci+1)),dx:ci<0?'':line(q.pts.slice(ci)),df:'',lit:new Set(j.units),un:new Set(),out:new Set(),hop,main:onL(main),red:q.pts.slice(0,ci<0?q.pts.length:ci+1),kon:onK([main,...rts.map(t=>t.pts)])}}
 const p=B.pos[w];if(!p)return whole;
 let ci=0,bd=1e9;main.forEach((q,i)=>{const dd=Math.hypot(q[0]-p[0],q[1]-p[1]);if(dd<bd){bd=dd;ci=i}});const acc=gbLen(main);
 /* the red: the wood just past the hop's boss, as long as about one and a half girths there and never into the next boss
    along the route (it stops four pixels short of it); where it broke at the hop, across the hop's own boss */
 const ga=((B.knot[w]||{}).__geo||{}).ra||5,G=gbGirth(B,main[ci])||8,nx=j.units.slice(wi+1).filter(isK).map(id=>({i:nearI(main,id),ra:((B.knot[id]||{}).__geo||{}).ra||5})).filter(o=>o.i>ci).sort((a,b)=>a.i-b.i)[0];
 let a0,a1;if(r.after){a0=acc[ci]+ga+1.5;a1=a0+Math.max(14,Math.min(30,1.5*G))}else{a0=acc[ci]-ga-4;a1=acc[ci]+ga+Math.max(6,Math.min(14,.6*G))}
 if(nx)a1=Math.min(a1,acc[nx.i]-nx.ra-4);a1=Math.max(a1,a0+6);
 let i0=acc.findIndex(v=>v>=a0),i1=acc.findIndex(v=>v>=a1);if(i0<0)i0=main.length-1;if(i1<0)i1=main.length-1;
 /* the amber runs to where the red begins and ends square there; the grey dots run on from the red's end to the last hop's
    knot, and no further: not on into the nebari, nor out along a root */
 let li=-1;for(const id of j.units.slice(wi+1))if(isK(id))li=Math.max(li,nearI(main,id));
 return {d:line(main.slice(0,i0+1)),dw:i1>i0?line(main.slice(i0,i1+1)):'',dx:li>i1?line(main.slice(i1,li+1)):'',df:'',lit,un,out:new Set(),hop,main:onL(main.slice(0,i0+1)),red:main.slice(i0,i1+1),sq:true,kon:onK([main.slice(0,i1+1)])}}
/* Which hops a scenario reaches: a failed one up to where it broke (all of them when it broke at a root), a happy path its
   whole journey, any other the journey from its start to the hop it checks. The rest it never reaches. The tree (gbRoute)
   and every card that names its path say the same. */
function gbReach(M,j,x){const r=gw.state.run[x.id],w=r&&r.st==='fail'?gbWound(M,j,x):null,U=j.units,isR=id=>!!(M.U[id]||{}).root;
 if(w){const wi=U.indexOf(w);return {lit:new Set(isR(w)?U:U.slice(0,wi+1)),un:new Set(isR(w)?[]:U.slice(wi+1))}}
 const ix=U.indexOf(x.unit);if(x.scenarioKind!=='happy'&&ix>=0&&ix<U.length-1)return {lit:new Set(U.slice(0,ix+1)),un:new Set(U.slice(ix+1)),own:true};
 return {lit:new Set(U),un:new Set()}}
/* Where the trunk hands a route to a root: the spine (from the top down) leaves the trunk's centre line above the soil, about
   a root's turn above where the root flares from it, and the way on runs round a fillet onto the root's centre line and out
   along it, keeping to the soil's top inside the pot. Returns that spine index and the way on from it. */
function gbFork(pts,rr){const L=gw.B.L,sy=q=>L.sy?L.sy(q):0,p0=L.potC-L.potL/2,p1=L.potC+L.potL/2,inPot=q=>q[0]>p0&&q[0]<p1,at0=pts.length-1,xT=pts[at0][0];
 const k1=gbFwd(rr.pts,0,12),q=rr.pts[k1],lvl=Math.min(q[1],sy(q[0])-1.5),rad=Math.max(6,Math.min(14,Math.abs(q[0]-xT)));let iJ=at0;while(iJ>0&&pts[iJ][1]>lvl-rad)iJ--;
 const a=pts[iJ],c=[a[0],lvl];return {iJ,out:[...gbBez([a,c,c,[q[0],lvl]],8),...rr.pts.slice(k1+1).map(p=>inPot(p)?[p[0],Math.min(p[1],sy(p[0])-1.5)]:p)]}}
/* How thick the wood is at a point: the widest piece whose body holds it (the trunk where a branch leaves it), else the
   nearest piece's girth. Read off every piece of wood the layout drew, once per drawing. */
function gbGirth(B,p){if(!B.wS){const S=B.wS=[],L=B.L,add=(pts,w,X)=>{if(!pts||!w)return;for(let i=0;i<pts.length;i++)S.push([pts[i][0]+(X||0),pts[i][1],w[i]||1])};
  L.trees.forEach((T,ti)=>{const X=L.xs[ti];add(T.tp,T.tw,X);for(const b of T.br||[]){add(b.pts,b.w,X);for(const t of b.twigs||[])add(t.pts,t.w,X)}for(const t of T.ctw||[])add(t.pts,t.w,X)});for(const r of L.roots||[])add(r.pts,r.w,0)}
 let best=0;for(const q of gbWNear(B,p)){const d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<q[2]/2+.5&&q[2]>best)best=q[2]}if(best)return best;
 let nd=1e9,nw=0;for(const q of B.wS){const d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<nd){nd=d;nw=q[2]}}return nw}
/* How far a point is from leaving the wood: the most room round it inside any piece of wood whose body holds it */
function gbRoom(B,p){if(!B.wS)gbGirth(B,p);let r=0;for(const q of gbWNear(B,p)){const d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(q[2]/2-d>r)r=q[2]/2-d}return r}
/* (only the wood near a point can hold it: its pieces are filed once per drawing in 8 px squares, and a point looks in the
   squares within half the widest girth of it, and one more each way) */
function gbWNear(B,p){const S=B.wS;let G=B.wG;if(!G){G=B.wG={m:new Map(),r:0};for(const q of S){const k=Math.floor(q[0]/8)+','+Math.floor(q[1]/8);let a=G.m.get(k);if(!a)G.m.set(k,a=[]);a.push(q);G.r=Math.max(G.r,q[2]/2+.5)}}
 const out=[],x0=Math.floor((p[0]-G.r)/8)-1,x1=Math.floor((p[0]+G.r)/8)+1,y0=Math.floor((p[1]-G.r)/8)-1,y1=Math.floor((p[1]+G.r)/8)+1;
 for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const a=G.m.get(x+','+y);if(a)for(const q of a)out.push(q)}return out}
/* a path's runs of points (only M and L, as the route is written) */
const gbSubs=d=>String(d||'').split('M').map(t=>t.trim()).filter(Boolean).map(t=>t.split(/\s*L\s*/).map(q=>q.trim().split(/\s+/).map(Number))).filter(q=>q.length>1&&q.every(v=>v.length===2&&v.every(isFinite)));
/* A route drawn inside the wood: a filled band along each run, k of the girth wide (between mn and mx), the width eased along
   it so it tapers where the wood does (widening at once where it enters thicker wood, narrowing over a few pixels where it
   leaves it) and never more than seven tenths of the wood it runs in, nor so wide that an edge would leave the wood (at a
   join, where it cuts the corner), with round ends; with sq, the last run's end is cut square (where the red begins). */
function gbRibbon(B,d,k,mn,mx,sq,ke){const ck=[d,k,mn,mx,!!sq,ke||0].join('|'),C=B.ribC||(B.ribC=new Map());if(C.has(ck))return C.get(ck);const r=gbRibbon0(B,d,k,mn,mx,sq,ke);C.set(ck,r);return r}
/* (a drawing's wood never changes, so each band is worked out once for it) */
function gbRibbon0(B,d,k,mn,mx,sq,ke){const subs=gbSubs(d);let out='',ri=0;for(const run of subs){const last=++ri===subs.length;const a=gbLen(run),n=Math.max(2,Math.ceil(a[a.length-1]/1.6)),P=gbResample(run,n);
  const G=P.map(q=>gbGirth(B,q)),wc=P.map((q,i)=>Math.max(.1,Math.min(.7*G[i],2*gbRoom(B,q)-.4))),w0=G.map((g,i)=>Math.min(wc[i],Math.max(mn,Math.min(mx,k*g))));
  /* (where the band ends square and hands on to the red, ke: over its last girth it widens to ke of the girth, so the amber
     meets the red at the red's own width) */
  if(sq&&last&&ke){const T=a[a.length-1],Lr=Math.max(6,G[n]);for(let i=0;i<=n;i++){const u=Math.max(0,Math.min(1,1-(T-T*i/n)/Lr)),s=u*u*(3-2*u);w0[i]=Math.min(wc[i],w0[i]+(Math.max(w0[i],ke*G[i])-w0[i])*s)}}
  const w=w0.map((_,i)=>{let s=0,c=0;for(let j=Math.max(0,i-4);j<=Math.min(n,i+4);j++){s+=w0[j];c++}return Math.min(wc[i],Math.max(w0[i],s/c))});
  /* where the wood is thin (a twig, or where a twig meets what carries it) each edge is checked against the wood as drawn,
     and drawn in toward the centre line until it is inside */
  const wd=B.wEls||(B.wEls=Array.from(B.svg.querySelectorAll('#gb-wood'+B.N+'>*,path.tw')).map(e=>{let b=null;try{b=e.getBBox()}catch(_){}return {e,b:b&&b.width+b.height>0?[b.x-1,b.y-1,b.x+b.width+1,b.y+b.height+1]:null}}));
  const inW=q=>{const pt=new DOMPoint(q[0],q[1]);return wd.some(({e,b})=>(!b||(q[0]>=b[0]&&q[0]<=b[2]&&q[1]>=b[1]&&q[1]<=b[3]))&&e.isPointInFill(pt))};
  const M=P.map((_,i)=>gbNorm(P,i)),H=w.map(v=>v/2),edge=(i,s)=>[P[i][0]+M[i][0]*H[i]*s,P[i][1]+M[i][1]*H[i]*s],thin=i=>wc[i]<2.5;
  for(let i=0;i<=n;i++)if(thin(i))for(let t=0;t<4&&H[i]>.02;t++){if(inW(edge(i,1))&&inW(edge(i,-1)))break;H[i]*=.5}
  /* (and between two edge points, where the wood turns a corner the chord between them could cut across) */
  for(let i=0;i<n;i++)if(thin(i)||thin(i+1))for(let t=0;t<4&&H[i]+H[i+1]>.04;t++){const ok=[1,-1].every(s=>{const a=edge(i,s),b=edge(i+1,s);return [.2,.4,.6,.8].every(f=>inW([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]))});if(ok)break;H[i]*=.5;H[i+1]*=.5}
  const Lf=P.map((_,i)=>edge(i,1)),Rt=P.map((_,i)=>edge(i,-1));
  const cap=(c,m,h,s)=>{const o=[];for(let i=1;i<6;i++){const th=Math.PI*i/6,t=[m[1]*s,-m[0]*s];o.push([c[0]+m[0]*h*Math.cos(th)*s+t[0]*h*Math.sin(th),c[1]+m[1]*h*Math.cos(th)*s+t[1]*h*Math.sin(th)])}return o};
  const e=P[n],me=gbNorm(P,n),b=P[0],mb=gbNorm(P,0);
  out+=(out?' ':'')+'M'+[...Lf,...(sq&&last?[]:cap(e,me,w[n]/2,1)),...Rt.reverse(),...cap(b,mb,w[0]/2,-1)].map(gbP).join(' L')+'Z'}return out}
/* Where it broke, the limb's own wood turns red: a crisp band GB_REDK of the girth wide on its centre line (the amber widens
   to meet it, gbRibbon), each end cut square across the limb, feathered in and out along its length (each stop set where
   the path itself reaches that share of its length), with no blur, inside the bark, in the wood's own group, so the bosses
   on either side stand over it */
const GB_REDK=.44;
function gbRed(B,dw){const g=B.gRed;if(!g)return;g.replaceChildren();let i=0;
 for(const run of gbSubs(dw)){const A=gbLen(run),T=A[A.length-1];if(!(T>2))continue;const n=Math.max(2,Math.ceil(T/1.2)),P=gbResample(run,n);
  const w0=P.map(q=>gbGirth(B,q)),w=w0.map((_,k)=>{let s=0,c=0;for(let j=Math.max(0,k-3);j<=Math.min(n,k+3);j++){s+=w0[j];c++}return s/c});
  const a=P[0],e=P[n],cx=e[0]-a[0],cy=e[1]-a[1],cl=cx*cx+cy*cy||1,on=f=>{const q=P[Math.round(f*n)];return Math.max(0,Math.min(1,((q[0]-a[0])*cx+(q[1]-a[1])*cy)/cl))};
  const id='gb-red'+B.N+'-'+(i++);let gr=B.defs.querySelector('#'+id);
  if(!gr){gr=sv('linearGradient',{id,gradientUnits:'userSpaceOnUse'},...[[0,0],[.28,1],[.72,1],[1,0]].map(([o,v])=>sv('stop',{offset:o,class:'rs','stop-opacity':v})));B.defs.append(gr)}
  for(const [k,v] of [['x1',a[0]],['y1',a[1]],['x2',e[0]],['y2',e[1]]])gr.setAttribute(k,gbF(v));
  const st=gr.querySelectorAll('stop');st[1].setAttribute('offset',gbF(on(.28)));st[2].setAttribute('offset',gbF(on(.72)));
  g.append(sv('path',{class:'sapw',d:gbBand(P,w,GB_REDK,-GB_REDK),fill:'url(#'+id+')'}))}}
/* Every file's name and every shoot's count, placed against one set of things to keep clear of: the wood (trunk, branches,
   twigs, roots), every cushion's outline and 4 px round it, every leaf with its stalk, the shoots and their leaves, the knots,
   the pot and the soil, the plant tags, and every other name and number. A count sits just off its shoot's tip. The names are
   placed once for the drawing (gbPutNames: per width, tree, and whether Max's shoots are on it), every file at once, so hover,
   focus and a pin only light a name or let it fade (gbLight) and none ever moves. */
/* the half width of a count's bud for '+n' at a drawing's text scale k: its round body holds the number with a little room */
function gbCntHW(n,k){return Math.max(5.6*k,('+'+n).length*.6*9.5*k/2+1.8*k)}
/* a count's bud: its round body from A along u, its point on away from A; d the path, C the body's centre, r its box as the
   page measures it (the bud's own box, turned along u) */
function gbBudD(A,u,hw){const v=[-u[1],u[0]],C=[A[0]+u[0]*hw,A[1]+u[1]*hw],P=[A[0]+u[0]*hw*2.55,A[1]+u[1]*hw*2.55],at=(o,a,b)=>[o[0]+u[0]*a+v[0]*b,o[1]+u[1]*a+v[1]*b],bk=[];
 for(let i=0;i<=8;i++){const t=Math.PI*i/8;bk.push(at(C,-hw*Math.sin(t),hw*Math.cos(t)))}
 let r=[1e9,1e9,-1e9,-1e9];for(const q of [at(A,0,-hw),at(A,0,hw),at(P,0,-hw),at(P,0,hw)])r=[Math.min(r[0],q[0]),Math.min(r[1],q[1]),Math.max(r[2],q[0]),Math.max(r[3],q[1])];
 return {d:'M'+gbP(P)+' C'+gbP(at(P,-.5*hw,.34*hw))+' '+gbP(at(C,.6*hw,hw))+' '+gbP(bk[0])+' L'+bk.slice(1).map(gbP).join(' L')+' C'+gbP(at(C,.6*hw,-hw))+' '+gbP(at(P,-.5*hw,-.34*hw))+' '+gbP(P)+' Z',C,r}}
function gbKnotNames(B,M,T,ti,V){const L=B.L,k=L.narrow?GB_NK:1,X=V.X,sh=q=>[q[0]+X,q[1]];
 const caps=[],rects=[V.potBox],labs=[],cush=[],lines=[],bases=[];const cap=(a,b,r,tag,own,lb)=>caps.push({a,b,r,tag,own,lb});
 /* each piece of wood knows its limb: a name's leader leaves its own knot's limb and crosses no other */
 const chain=(pts,w,pad,lb)=>{for(let i=0;i<pts.length-1;i++)cap(pts[i],pts[i+1],Math.max(w[i]||1,w[i+1]||1)/2+pad,'wood',null,lb)};
 chain(V.tp,T.tw,3,'t');for(const b of T.br||[]){chain(b.pts.map(sh),b.w,3,'b:'+b.id);for(const t of b.twigs||[])chain(t.pts.map(sh),t.w,2.5,'tw')}
 for(const t of T.ctw||[])chain(t.pts.map(sh),t.w,2.5,'tw');for(const r of L.roots||[])if(r.tree===undefined||r.tree===ti)chain(r.pts,r.w,2,'r');
 for(const id in B.pad){const P=B.pad[id];if(P.tree!==ti)continue;const o=P.o,q=P.q0;
  if(q)for(const c of q.cs){if(c.on===false||!c.top||!c.top.length)continue;cush.push({x0:o[0]+c.x0,x1:o[0]+c.x1,top:c.top.map(t=>[o[0]+t[0],o[1]+t[1]]),bot:c.bot.map(t=>[o[0]+t[0],o[1]+t[1]])})}
  const g=P.geo;if(g&&g.slot)for(const [,sl] of g.slot){const c=[o[0]+sl[0],o[1]+sl[1]],th=(sl[2]||0)*Math.PI/180,u=[Math.cos(th),Math.sin(th)],Lf=g.L*(sl[3]||1),st=Lf/2+GB_PET;
   cap([c[0]-u[0]*st,c[1]-u[1]*st],[c[0]+u[0]*Lf/2,c[1]+u[1]*Lf/2],Math.max(7,.26*Lf+3.5),'leaf');cap(c,c,Math.max(10,.5*Lf+1),'leaf')}}
 /* this tree's shoots: off its knots (a part merged into a burl keeps its own shoot), its leader and its roots */
 const myK=new Set((T.knots||[]).flatMap(kn=>[kn.id,...(kn.ids||[])])),mine=g=>myK.has(g.kid)||g.kid==='lead:'+ti||(L.roots||[]).some(r=>r.id===g.kid&&r.tree===ti),shoots=[...new Set(B.shootGeo||[])].filter(mine),rest=(B.shootRest||[]).filter(mine);
 /* a shoot holds three or four of its part checks as leaves (gbPaint sets them the same way) */
 const own=id=>(M.buds[id]||[]).filter(x=>x.scenarioKind!=='regression'),nOn=g=>{const c=(g.uids||[]).reduce((a,id)=>a+own(id).length,0);return {c,n:Math.min(4,Math.max(3,c))}};
 /* (a shoot, its leaves, a dormant bud and a graft bud are there only while Max's shoots are; the callus a dropped shoot or
    bud leaves beside its knot always is) */
 for(const g of rest)for(let i=0;i<g.pts.length-1;i++)cap(g.pts[i],g.pts[i+1],5,'shoot',g.kid);
 for(const g of shoots){g.slots=gbShootSlots(g.pts,nOn(g).n);for(let i=0;i<g.pts.length-1;i++)cap(g.pts[i],g.pts[i+1],6,'shoot',g.kid);for(const q of g.slots){cap([q[0],q[1]],[q[0],q[1]],11,'shoot',g.kid);const th=q[2]*Math.PI/180,sc=q[3]||1,at=d=>[q[0]+Math.cos(th)*d*sc,q[1]+Math.sin(th)*d*sc];cap(at(3.5),at(14.5),4.5*sc,'shoot',g.kid)}}
 for(const g of rest)cap(g.base,g.tip,4,'shoot',g.kid);
 for(const g of [...shoots,...rest]){const c=g.cal?g.cal.c:g.base;if(c)cap(c,c,4.5,'scar',g.kid)}
 /* graft buds on the knots */
 for(const r of B.graftR||[])if(r.tree===ti&&!r.under)cap(r.c,r.c,r.r+3,'shoot');
 /* (a root's staked tag keeps a knot's name off itself and its stake by the margin any label does, gbKnotNames' clearL; its
    wider box is the room the tags keep from one another) */
 /* Everything Max grows, as the box each takes up, whether it shows in this mode or not: a shoot, each of its leaves, a dormant
    bud, a graft bud (and its count) and every leaf a pad holds. A name keeps a few px clear of each box, and its leader keeps
    two px clear of the box each is drawn in (t, where the room kept round it is wider than that), but for its own knot's
    shoot where it rises off the boss at the leader's foot; so a mode, a preview or a pin only ever shows or fades them round
    names that stay where they are */
 const obs=[],aabb=ps=>{let r=[1e9,1e9,-1e9,-1e9];for(const p of ps)r=[Math.min(r[0],p[0]),Math.min(r[1],p[1]),Math.max(r[2],p[0]),Math.max(r[3],p[1])];return r},bbx=(ps,own,tq)=>obs.push({r:aabb(ps),own,t:tq?aabb(tq):null}),budB=[];
 const turned=(c,th,a0,a1,b0,b1)=>{const t=[Math.cos(th),Math.sin(th)],n=[-t[1],t[0]];return [[a0,b0],[a1,b0],[a1,b1],[a0,b1]].map(([a,b])=>[c[0]+t[0]*a+n[0]*b,c[1]+t[1]*a+n[1]*b])};
 for(const g of shoots){const P=g.pts,e=P[P.length-1];bbx([...P.flatMap(p=>[[p[0]-1.3,p[1]-1.3],[p[0]+1.3,p[1]+1.3]]),[e[0]-3,e[1]-3],[e[0]+3,e[1]+3]],g.kid);bbx([[P[0][0]-3.3,P[0][1]-2.6],[P[0][0]+3.3,P[0][1]+2.6]],g.kid,[[P[0][0]-1.3,P[0][1]-1.3],[P[0][0]+1.3,P[0][1]+1.3]]);
  for(const q of g.slots){const sc=q[3]||1,th=q[2]*Math.PI/180;bbx(turned([q[0],q[1]],th,3.5*sc,14.5*sc,-3.5*sc,3.5*sc),g.kid,turned([q[0],q[1]],th,3.5*sc,14.5*sc,-2.65*sc,2.65*sc))}}
 for(const g of rest){const P=g.pts;bbx(P.flatMap(p=>[[p[0]-1.3,p[1]-1.3],[p[0]+1.3,p[1]+1.3]]),g.kid);bbx([[P[0][0]-3,P[0][1]-2.4],[P[0][0]+3,P[0][1]+2.4]],g.kid,[[P[0][0]-1.3,P[0][1]-1.3],[P[0][0]+1.3,P[0][1]+1.3]])}
 /* (a pip keeps as clear of where a shoot leaves its knot, and of the whole shoot up to its count, as of the count itself) */
 for(const g of [...shoots,...rest]){const P=g.pts||[];for(let i=1;i<P.length;i++)budB.push([Math.min(P[i-1][0],P[i][0])-1.3,Math.min(P[i-1][1],P[i][1])-1.3,Math.max(P[i-1][0],P[i][0])+1.3,Math.max(P[i-1][1],P[i][1])+1.3]);if(P.length)budB.push([P[0][0]-3.3,P[0][1]-2.6,P[0][0]+3.3,P[0][1]+2.6])}
 for(const r of B.graftR||[])if(r.tree===ti&&!r.under){const t=r.t||[1,0],sw=turned(r.c,Math.atan2(t[1],t[0]),-r.r-1,r.r+1,-4,4);bbx(sw,null,turned(r.c,Math.atan2(t[1],t[0]),-r.r-.95,r.r+.95,-3.45,3.45));budB.push(aabb(sw));
  /* (a swelling's count is a mark on its crown, its box as a shoot's count's is) */
  if(r.cnt){obs.push({r:r.cnt.r,own:null,cnt:1});budB.push(r.cnt.r)}}
 for(const id in B.pad){const P=B.pad[id];if(P.tree!==ti||!P.geo||!P.geo.slot)continue;const g=P.geo;for(const [,sl] of g.slot){const sc=sl[3]||1;const c=[P.o[0]+sl[0],P.o[1]+sl[1]],th=(sl[2]||0)*Math.PI/180;bbx(turned(c,th,-(g.L/2+.3)*sc,(g.L/2+.3)*sc,-(.62*g.W+.3)*sc,(.62*g.W+.3)*sc),null,turned(c,th,-(g.L/2+.05)*sc,(g.L/2+.05)*sc,-(.47*g.W+.05)*sc,(.47*g.W+.05)*sc))}}
 const om=3.5/(V.hf||1),clearO=r=>!obs.some(o=>r[0]<o.r[2]+om&&r[2]>o.r[0]-om&&r[1]<o.r[3]+om&&r[3]>o.r[1]-om);
 /* (a leader keeps three pixels off the whole box of every count, its own knot's too: a count reads as a mark of its own, never
    as a bud strung on a name's line) */
 const fo=5.95/(V.hf||1),cm=Math.max(2.5,3/(V.hf||1)),mo=Math.max(.8,2.05/(V.hf||1)),intoO=(R,A,id)=>{const len=Math.hypot(A[0]-R[0],A[1]-R[1])||1;for(let d=0;d<=len+.01;d+=.5){const p=[R[0]+(A[0]-R[0])*d/len,R[1]+(A[1]-R[1])*d/len];for(const o of obs){const m=o.cnt?cm:mo,b=o.t||o.r;if(p[0]>b[0]-m&&p[0]<b[2]+m&&p[1]>b[1]-m&&p[1]<b[3]+m&&(o.cnt||!(o.own===id&&d<fo)))return true}}return false};
 for(const l of L.rl||[]){if(l.box){labs.push(l.tb||l.box);continue}const w0=gbW(l.t+(l.r.stop&&!l.bare&&!l.note?' · trace stops':''),L.fs*.62),x0=l.anchor==='start'?l.x:l.anchor==='end'?l.x-w0:l.x-w0/2;labs.push([x0-2,l.y-L.fs,x0+w0+2,l.y+3])}
 for(const pid in T.lbl||{}){const l=T.lbl[pid],lx=l.x+X,a=l.anchor==='start'?lx:l.anchor==='end'?lx-l.w:lx-l.w/2;labs.push([a,l.y-29,a+l.w,l.y-29+l.hgt]);if(l.dir)lines.push([[l.ax+X,l.ay],[lx,l.y-29+l.hgt/2]])}
 for(const r of B.badgeR||[])labs.push(r);
 const Q=(B.klq||[]).filter(e=>e.tree===ti);for(const e of Q)cap(e.p,e.p,e.ra+1.5,'knot',e.id);
 /* geometry: how far a segment is from a box, and whether a box touches a cushion */
 const dPR=(p,r)=>Math.hypot(Math.max(r[0]-p[0],0,p[0]-r[2]),Math.max(r[1]-p[1],0,p[1]-r[3]));
 const dPS=(p,a,b)=>{const vx=b[0]-a[0],vy=b[1]-a[1],l2=vx*vx+vy*vy;const t=l2?Math.max(0,Math.min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/l2)):0;return Math.hypot(p[0]-a[0]-vx*t,p[1]-a[1]-vy*t)};
 const crossR=(a,b,r)=>{let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];for(const [pp,qq] of [[-dx,a[0]-r[0]],[dx,r[2]-a[0]],[-dy,a[1]-r[1]],[dy,r[3]-a[1]]]){if(pp===0){if(qq<0)return false;continue}const t=qq/pp;if(pp<0){if(t>t1)return false;if(t>t0)t0=t}else{if(t<t0)return false;if(t<t1)t1=t}}return true};
 const dSR=(a,b,r)=>crossR(a,b,r)?0:Math.min(dPR(a,r),dPR(b,r),...[[r[0],r[1]],[r[2],r[1]],[r[0],r[3]],[r[2],r[3]]].map(c=>dPS(c,a,b)));
 const cushHit=(c,r,m)=>{if(r[2]<c.x0-m||r[0]>c.x1+m)return false;const xa=Math.max(r[0],c.x0-m),xb=Math.min(r[2],c.x1+m);for(let x=xa;x<=xb+.01;x+=Math.max(1.5,(xb-xa)/12)){const xc=Math.max(c.x0,Math.min(c.x1,x));if(gbAtX(c.top,xc)-m<r[3]&&gbAtX(c.bot,xc)+m>r[1])return true}return false};
 const ovR=(r,q)=>r[0]<q[2]&&r[2]>q[0]&&r[1]<q[3]&&r[3]>q[1];
 const soil=r=>(L.sy?Math.min(L.sy(r[0]),L.sy(r[2])):-3)-4;
 /* what never moves (the edges, the pot, the wood, leaves, shoots while they are on, knots and cushions), then the names and
    hairlines placed so far, with a margin round each name */
 const clearS=(r,bud)=>{if(r[0]<V.vx+3||r[2]>V.vx+V.W-3||r[1]<V.vy+2||r[3]>soil(r))return false;for(const q of rects)if(ovR(r,q))return false;
  for(const c of caps)if(c.tag!=='shoot'&&dSR(c.a,c.b,r)<c.r)return false;for(const c of cush)if(cushHit(c,r,4))return false;return true};
 const clearL=(r,m)=>{const rI=[r[0]-m*k,r[1]-m*k/2,r[2]+m*k,r[3]+m*k/2];for(const q of labs)if(ovR(rI,q))return false;for(const l of lines)if(dSR(l[0],l[1],r)<2)return false;return true};
 const segX=(a,b,c,d)=>{const o=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));return o(a,b,c)!==o(a,b,d)&&o(c,d,a)!==o(c,d,b)};
 /* a count's tie never crosses a name, another hairline or another knot; strict, nor leaves, shoots or foliage either */
 const segS=(R,A,id,soft)=>{for(const c of caps){if(c.tag==='wood'||c.own===id)continue;if(c.tag==='knot'){if(dSR(c.a,c.b,[Math.min(R[0],A[0]),Math.min(R[1],A[1]),Math.max(R[0],A[0]),Math.max(R[1],A[1])])<c.r+3&&dPS(c.a,R,A)<c.r+3)return false}else if(!soft&&dPS(c.a,R,A)<c.r-3&&dPS(c.b,R,A)<c.r-3)return false}
  if(!soft)for(let i=1;i<10;i++){const t=i/10,p=[R[0]+(A[0]-R[0])*t,R[1]+(A[1]-R[1])*t];for(const c of cush)if(cushHit(c,[p[0],p[1],p[0],p[1]],2))return false}return true};
 const leadOK=(pts,id,soft)=>pts.every((p,i)=>{if(!i)return true;const R=p,A=pts[i-1];if(!segS(R,A,id,soft))return false;for(const q of labs)if(dSR(R,A,q)<1)return false;for(const l of lines)if(l[2]!==id&&segX(R,A,l[0],l[1]))return false;return true});
 const baseOK=(r,yb)=>!bases.some(([y2,r2])=>Math.abs(yb-y2)<7*k&&Math.max(r2[0]-r[2],r[0]-r2[2])<24*k);
 /* A shoot's count of the checks its leaves do not show (a stub's, all its checks): the shoot's own tip swollen into a small
    bud, set on the very end of its path and turned along it, the number in its round body and its point on away from the
    shoot. It is where the shoot ends, so it has no other place; names keep clear of it like any mark */
 const fs2=9.5*k;
 const budD=gbBudD;
 for(const g of [...shoots,...rest]){const {c,n}=nOn(g),more=c-(g.dorm?0:Math.min(n,c));g.cntAt=false;if(more<=0||!g.pts||g.pts.length<2)continue;
  const hw=gbCntHW(more,k),q=g.pts[g.pts.length-1],q0=g.pts[Math.max(0,g.pts.length-3)],m=Math.hypot(q[0]-q0[0],q[1]-q0[1])||1,u=[(q[0]-q0[0])/m,(q[1]-q0[1])/m];
  const bd=budD(q,u,hw),r=bd.r,yb=bd.C[1]+.33*fs2;
  g.cntAt={x:bd.C[0],y:yb,anc:'middle',r,at:q,ang:Math.atan2(u[1],u[0])*180/Math.PI,bud:budD([0,0],[1,0],hw).d};bases.push([yb,r])}
 /* (a count, placed, is a box a name keeps clear of as it does a shoot's) */
 for(const g of [...shoots,...rest])if(g.cntAt){obs.push({r:g.cntAt.r,own:g.kid,cnt:1});budB.push(g.cntAt.r)}
 /* (the counts go with their shoots) */
 const noBud=[labs.slice(),lines.slice(),[]],withBud=[labs.slice(),lines.slice(),bases.slice()];
 /* The names. A name sits beside its knot on a straight leader from the boss's outer side, 8 to 74 long and never past
    86 px on the screen, the near places first, turned away from the limb the knot is on. The leader is off its own limb by
    the boss's radius and never goes back onto it, and crosses no other limb, no cushion, leaf, shoot, bud, knot, name or
    other leader, nor the pot. A burl's place is kept for the longest of its names, set from the same point, so it reads with
    whichever of its files is lit without moving. */
 const lens=[...new Set([8,13,19,26,35,46,59,74].map(l=>Math.min(l*k,86/(V.hf||1))))],fs=10*k,cw=.62*fs,D8=[[1,0],[.7071,-.7071],[0,-1],[-.7071,-.7071],[-1,0],[-.7071,.7071],[0,1],[.7071,.7071]],D16=[...D8,...D8.map((u,i)=>{const v=D8[(i+1)%8],m=Math.hypot(u[0]+v[0],u[1]+v[1]);return [(u[0]+v[0])/m,(u[1]+v[1])/m]})];
 const kIds=e=>B.knot[e.id]?B.knot[e.id].__ids:[e.id],twOf=(e,sh)=>{const ids=kIds(e);return Math.max(...ids.map(id=>gbKnotTxt(M,ids,id,sh).length))*cw};
 const limb=e=>e.bid?'b:'+e.bid:'t';
 /* (its own limb as drawn: the wood swells over the boss on the boss's side, about as far as the boss stands proud, gbTree) */
 const inOwn=(e,lb)=>{const o=Math.hypot(e.p[0]-e.p0[0],e.p[1]-e.p0[1]),amp=Math.max(1.2+.3*e.rb,o+.92*e.rb-e.w/2+1),sg=e.ra*1.15;
  return p=>caps.some(c=>c.lb===lb&&dPS(p,c.a,c.b)<c.r-3+amp*Math.exp(-Math.pow(((p[0]-e.p0[0])*e.tg[0]+(p[1]-e.p0[1])*e.tg[1])/sg,2)))};
 const leadHard=(e,R,A,u,bud)=>{const lb=limb(e),len=Math.hypot(A[0]-R[0],A[1]-R[1]),R5=[R[0]+u[0]*Math.min(5*k,len/2),R[1]+u[1]*Math.min(5*k,len/2)];
  /* (a refusals' collar knot leaves from under its branch's foot, which grows out of the same boss: it may start against that
     foot, as against its own shoot, but never runs onto the branch) */
  for(const c of caps){if(c.tag==='shoot'||c.lb===lb||(c.tag==='knot'&&c.own===e.id))continue;const foot=e.pb&&c.lb==='b:'+e.pb&&Math.hypot(c.a[0]-e.p0[0],c.a[1]-e.p0[1])<e.w*.9+e.ra;if(gbSegD(c.own===e.id||foot?R5:R,A,c.a,c.b)<c.r-(c.tag==='wood'?1:0))return false}
  /* it is off its own limb by the boss's radius from where it leaves it, and never goes back onto it */
  const inn0=inOwn(e,lb);let off=false,on=0;for(let d=0;d<=len+.01;d+=1){const p=[R[0]+u[0]*d,R[1]+u[1]*d],inn=inn0(p);if(!inn)off=true;else if(off||d>e.ra)return false;else on=d}if(!off)return false;
  for(let d=0;d<=len+.01;d+=2){const p=[R[0]+u[0]*d,R[1]+u[1]*d];for(const c of cush)if(cushHit(c,[p[0],p[1],p[0],p[1]],2.5))return false}
  return dSR(R,A,V.potBox)>=1?1+on:0};
 const cands=new Map(),candOf=(e,bud,sh)=>{sh=sh||0;const key=e.id+'|'+bud+'|'+sh;if(cands.has(key))return cands.get(key);const tw=twOf(e,sh),out=[];
  let v0=[e.p[0]-e.p0[0],e.p[1]-e.p0[1]];const vm=Math.hypot(v0[0],v0[1]);v0=vm>.5?[v0[0]/vm,v0[1]/vm]:[e.n[0],e.n[1]];
  /* the leader leaves the boss on its outward side, from the knot's centre out along the normal by the boss's radius, and
     runs out away from the wood, never across it; a stub along the normal ties its foot to the boss's edge. Where a shoot of
     the knot's own leaves the boss, the leader leaves it at least 25 degrees round from where that shoot's stalk does, turned
     off the normal the least way that is, so the two never share a foot */
  const st=[...shoots,...rest].filter(g=>g.pts&&g.pts.length&&kIds(e).includes(g.kid)).map(g=>{const q=g.pts.find(t=>Math.hypot(t[0]-e.p[0],t[1]-e.p[1])>=e.ra-.5)||g.pts[g.pts.length-1],m=Math.hypot(q[0]-e.p[0],q[1]-e.p[1])||1;return [(q[0]-e.p[0])/m,(q[1]-e.p[1])/m]});
  for(const ph of st.length?[0,.61,-.61,.87,-.87,1.13,-1.13,1.39,-1.39]:[0]){const v=[v0[0]*Math.cos(ph)-v0[1]*Math.sin(ph),v0[0]*Math.sin(ph)+v0[1]*Math.cos(ph)];if(st.some(t=>t[0]*v[0]+t[1]*v[1]>.891))continue;
  const R=[e.p[0]+v[0]*e.ra,e.p[1]+v[1]*e.ra],S=[e.p[0]+v[0]*(e.rb-.4),e.p[1]+v[1]*(e.rb-.4)];
  /* (a leader near upright may carry its name beside its end or centred over it; a refusals' collar knot's may also leave it
     down and out, under the branch that grows from its boss) */
  for(const len of lens)for(const u of D16){if(u[0]*v[0]+u[1]*v[1]<(e.pb?-.3:.2))continue;const A=[R[0]+u[0]*len,R[1]+u[1]*len],ux=Math.abs(u[0]),sides=ux>.38?(ux<.4?[1,0]:[1]):[0];let lh=null;
   for(const sd of sides){let anc,x0,yb;
    if(sd){anc=u[0]>0?'start':'end';x0=anc==='start'?A[0]+2:A[0]-2-tw;yb=A[1]+.28*fs}else{anc='middle';x0=A[0]-tw/2;yb=u[1]<0?A[1]-.22*fs-2:A[1]+.78*fs+2}
    const r=[x0-1.5,yb-.78*fs-1.5,x0+tw+1.5,yb+.22*fs+1.5];if(!clearS(r,bud)||!clearO(r))continue;if(lh===null)lh=intoO(R,A,e.id)?0:leadHard(e,R,A,u,bud);if(!lh)break;
    const ang=Math.acos(Math.max(-1,Math.min(1,u[0]*v[0]+u[1]*v[1])));out.push({anc,x:anc==='start'?x0:anc==='end'?x0+tw:x0+tw/2,yb,r,R,A,pts:[A,R,S],sh,sc:len/k+14*ang+(anc==='middle'?5:0)+.8*(lh-1)/k+6*Math.abs(ph)})}}}
  out.sort((a,b)=>a.sc-b.sc);cands.set(key,out);return out};
 /* who gets open ground first when it runs short: where a journey starts, then its HTTP routes, then its stores and jobs,
    then helper files; within each, the headline journey's hops (the crown's, gbHead: the first failing journey, else the first), then
    the knots more journeys cross, then the most hemmed in */
 const ord=gbOrder(M),head=gbHead(M,M.J),tier=e=>gbKTier(M,kIds(e)),onHead=e=>!!head&&kIds(e).some(id=>head.units.includes(id)),nJ=e=>M.J.filter(j=>kIds(e).some(id=>j.units.includes(id))).length;
 /* (strictly: no number of helper files outweighs one route, nor any routes where a journey starts) */
 const wt=e=>Math.pow(100,3-tier(e))*(onHead(e)?1.5:1);
 const dyn=(c,id)=>{if(!clearL(c.r,8)||!baseOK(c.r,c.yb))return false;for(const q of labs)if(dSR(c.R,c.A,q)<2)return false;for(const l of lines)if(gbSegD(c.R,c.A,l[0],l[1])<2.5)return false;return true};
 for(const e of Q){const pr=5*k,kl=sv('text',{x:0,y:0,class:'klbl nofit'},e.txt),ld=sv('path',{class:'kld',d:''}),
   pip=sv('g',{class:'kpip none'},sv('circle',{cx:gbF(e.p[0]),cy:gbF(e.p[1]),r:gbF(pr)}),sv('text',{class:'kpn',x:gbF(e.p[0]),y:gbF(e.p[1])},'')),kp=sv('g',{class:'kpip key none'},sv('circle',{cx:0,cy:0,r:gbF(pr)}),sv('text',{class:'kpn',x:0,y:0},''));
  const w=sv('g',{class:'kname'},kl,ld,pip,kp);kl.__fit=false;kl.__ld=ld;kl.__pip=pip;kl.__kp=kp;V.gKl.append(w);B.klbl[e.id]=kl;
  /* a name, or its pip, comes once its knot is there, never ahead of the wood it is on (the knot's fade is queued on the page
     clock, gbNow, from the wood's own reveal: see gbBuild) */
  const ka=B.anim.find(a=>a[0]===B.knot[e.id]);if(ka&&!V.quiet)B.anim.push([w,ka[1]+ka[2],300,'fade'])}
 const run=(bud,n0)=>{const B0=bud?withBud:noBud;
  const lay=order=>{labs.length=0;labs.push(...B0[0]);lines.length=0;lines.push(...B0[1]);bases.length=0;bases.push(...B0[2]);const slot=new Map(),miss=[];let cost=0,nt=0;
   /* (five names by the trunk at most: the rest of its knots are pips) */
   for(const e of order){const c=!e.bid&&nt>=5?null:candOf(e,bud).find(q=>dyn(q,e.id));if(!c){miss.push(e);cost+=wt(e);continue}slot.set(e.id,c);if(!e.bid)nt++;cost+=c.sc*.0005;labs.push(c.r);bases.push([c.yb,c.r]);lines.push([c.R,c.A,e.id])}
   return {slot,miss,cost,order}};
  let best=lay(Q.slice().sort((a,b)=>tier(a)-tier(b)||+onHead(b)-+onHead(a)||nJ(b)-nJ(a)||candOf(a,bud).length-candOf(b,bud).length||a.p[1]-b.p[1]));
  /* a knot left without a place goes first, if that leaves less unplaced (by what matters) and the leaders no longer */
  for(let it=0;it<2;it++)for(const e of best.miss.slice().sort((a,b)=>wt(b)-wt(a)).slice(0,6)){const tr=lay([e,...best.order.filter(q=>q!==e)]);if(tr.cost<best.cost-.01)best=tr}
  best=lay(best.order);
  /* a name is cut short only where its place has no room for it whole: set from the same leader, it takes its whole name
     wherever that keeps as clear of everything as any name must (its own box and lines are lifted while it is measured) */
  for(const [id,c] of best.slot){const e=Q.find(q=>q.id===id);if(!e||twOf(e,-1)<=twOf(e,0)+.01)continue;
   const i=labs.indexOf(c.r),j=bases.findIndex(b=>b[1]===c.r),l=lines.findIndex(q=>q[0]===c.R&&q[1]===c.A);if(i<0||j<0||l<0)continue;labs.splice(i,1);bases.splice(j,1);lines.splice(l,1);
   const f=candOf(e,bud,-1).find(q=>q.anc===c.anc&&Math.abs(q.A[0]-c.A[0])<.01&&Math.abs(q.A[1]-c.A[1])<.01&&dyn(q,id)),u=f||c;if(f)best.slot.set(id,f);labs.push(u.r);bases.push([u.yb,u.r]);lines.push([u.R,u.A,id])}
  /* A knot with no clean place gets a small pip on its boss (a number, or on a phone a letter, gbPipMark, so it is never read
     as a journey's numbered badge), and its name goes beside that mark in a key, in the order the journeys cross them; the
     card's path marks it the same way (gbTip). The key is one block, every row at one x and one row's height apart: in the
     widest gutter beside the tree, low in it like a footnote, so the ground between it and the tree is left for a card; else
     in a band under the pot, the drawing grown down to hold it (gbPlaceNames). */
  const pos=e=>{for(let i=0;i<ord.length;i++){const x=ord[i].units.findIndex(id=>kIds(e).includes(id));if(x>=0)return i*100+x}return 1e4};
  const miss=best.miss.slice().sort((a,b)=>pos(a)-pos(b)||a.p[1]-b.p[1]),pip=new Map();let ext=0;
  if(miss.length){const pr=5*k,gap=3.5*k,rh=fs+6*k,rows=miss.map((e,i)=>({e,n:n0+i+1,w:2*pr+gap+twOf(e)}));
   const at=(x0,y0)=>rows.map((q,i)=>{const yb=y0+(i+1)*rh-4*k;return {q,x:x0,yb,r:[x0-1.5,yb-.78*fs-1.5,x0+q.w+1.5,yb+.22*fs+1.5]}});
   const bw=Math.max(...rows.map(q=>q.w))+3,bh=rows.length*rh;
   const fits=g=>g.every(o=>{const r=o.r,rI=[r[0]-8*k,r[1]-4*k,r[2]+8*k,r[3]+4*k];return clearS(rI,bud)&&clearO(r)&&clearL([r[0],r[1]-5*k,r[2],r[3]+5*k],14)});
   let tb=[1e9,1e9,-1e9,-1e9];for(const c of caps)if(c.lb!=='r'&&(bud||c.tag!=='shoot'))for(const p of [c.a,c.b])tb=[Math.min(tb[0],p[0]-c.r),Math.min(tb[1],p[1]-c.r),Math.max(tb[2],p[0]+c.r),Math.max(tb[3],p[1]+c.r)];
   for(const c of cush)tb=[Math.min(tb[0],c.x0),Math.min(tb[1],...c.top.map(t=>t[1])),Math.max(tb[2],c.x1),tb[3]];
   let got=null;const gut=[[V.vx+6,tb[0]-10*k],[tb[2]+10*k,V.vx+V.W-6]].filter(q=>q[1]-q[0]>=bw).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));
   for(const q of gut){const pl=[];for(let y0=V.vy+4;y0<0;y0+=5*k)for(let x0=q[0];x0+bw<=q[1];x0+=7*k)pl.push([Math.max(0,-(y0+bh))+.6*Math.min(x0-V.vx,V.vx+V.W-x0-bw),x0,y0]);pl.sort((a,b)=>a[0]-b[0]);
    for(const [,x0,y0] of pl){const g=at(x0,y0);if(fits(g)){got=g;break}}if(got)break}
   /* (under the pot: under its feet and the shadow it casts, as close under them as keeps clear of its roots and their
      names (else below those names too), under the pot's middle or as near it as that takes, and inside the drawing, so the
      drawing grows down no more than it must) */
   if(!got){const xm=L.potC-bw/2,cx=x=>Math.max(V.vx+6,Math.min(V.vx+V.W-6-bw,x)),yT=L.D+(L.lone?7:(L.fh||5)+5)+2*k,y1=L.y1+4*k;let y0=y1,x0=cx(xm);
    const okU=g=>g.every(o=>{const r=o.r;return !caps.some(c=>c.lb==='r'&&dSR(c.a,c.b,r)<c.r+4*k)&&clearL([r[0],r[1]-5*k,r[2],r[3]+5*k],14)});
    out:for(let y=yT-(rh-4*k-.78*fs-1.5);y<y1;y+=k)for(let i=0;i<=24;i++){const x=cx(xm+(i%2?-1:1)*Math.ceil(i/2)*k);if(okU(at(x,y))){y0=y;x0=x;break out}}
    got=at(x0,y0);ext=Math.max(0,y0+bh+6*k-(V.vy+V.VH))}
   /* a pip keeps 8px from a count bud, a graft bud or a shoot: it moves off the boss along the limb's normal as little as that
      takes, else (where shoots crowd the wood) the least distance any way round; always still on its wood, never adrift
      beside it, and never further in across its limb than the boss stands (where no such place keeps that clear, the one that
      keeps clearest) */
   const gu=8.5/(V.hf||1),pe=pr+.5,clr=c=>Math.min(1e9,...budB.map(b=>Math.hypot(Math.max(b[0]-c[0]-pe,0,c[0]-pe-b[2]),Math.max(b[1]-c[1]-pe,0,c[1]-pe-b[3])))),far=c=>clr(c)>=gu;
   const boss=e=>{let v=[e.p[0]-e.p0[0],e.p[1]-e.p0[1]];const m=Math.hypot(v[0],v[1]);v=m>.5?[v[0]/m,v[1]/m]:[e.n[0],e.n[1]];
    const on=c=>Math.hypot(c[0]-e.p[0],c[1]-e.p[1])<e.ra+pe-1||caps.some(q=>q.tag==='wood'&&gbSegD(c,c,q.a,q.b)<q.r-3+pe-1),o0=Math.min(m,e.ra);let bst=null,bc=-1;
    const ok=c=>{if(!on(c)||(c[0]-e.p0[0])*v[0]+(c[1]-e.p0[1])*v[1]<o0-.5)return false;if(far(c))return true;const cv=clr(c);if(cv>bc){bc=cv;bst=c}return false};
    for(let d=0;d<=40*k;d+=.5)for(const sg of d?[1,-1]:[1]){const c=[e.p[0]+v[0]*d*sg,e.p[1]+v[1]*d*sg];if(ok(c))return c}
    for(let d=.5;d<=60*k;d+=.5)for(const u of D16){const c=[e.p[0]+u[0]*d,e.p[1]+u[1]*d];if(ok(c))return c}return bst||e.p};
   got.forEach((o,i)=>{const r=o.r;labs.push(r);const c=boss(o.q.e);pip.set(o.q.e.id,{n:n0+i+1,sh:o.sh||0,x:o.x+2*pr+gap,yb:o.yb,anc:'start',r,cx:o.x+pr,cy:o.yb-.3*fs,bx:c[0],by:c[1],ids:kIds(o.q.e)})})}
  return {slot:best.slot,pip,ext}};
 (B.kplace=B.kplace||[]).push(run)}
/* where a shoot's leaves sit: set alternately along it from just under halfway to near its tip, each a little smaller */
/* The legend's mark for an existing flow a Max grow re-checks, the graft bud .gb-gr on the tree, on a twig of bark
   (for the legend's row: it('graft','an existing flow it re-checks')): a swelling of the bark with a bud tip */
function gbGraftSw(){return gwSvg(16,12,sv('path',{d:'M1 8.6 C5 7.8 10 7.6 15 6.6',class:'stem'}),sv('ellipse',{cx:8,cy:6.6,rx:4,ry:2.5,transform:'rotate(-6 8 6.6)',class:'gr'}),sv('path',{d:'M8 4.2 L7.2 2.2 L8.8 2.2 Z',class:'gr'}))}
function gbShootSlots(pts,n){const acc=gbLen(pts),tot=acc[acc.length-1]||1;return Array.from({length:n},(_,i)=>{const t=.42+(.9-.42)*(n===1?0:i/(n-1)),d=t*tot;let k=1;while(k<pts.length-1&&acc[k]<d)k++;
 const a=pts[k-1],b=pts[k],f=(d-acc[k-1])/((acc[k]-acc[k-1])||1),q=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],dir=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;return [q[0],q[1],dir+(i%2?50:-50),1-.22*i/Math.max(1,n-1)]})}
/* a pinned thing's card moves to the inspector: the floating card and its hairline both go */
function gbTipOff(B){if(B.tip)B.tip.hidden=true;if(B.lead)B.lead.setAttribute('d','')}
function gbHover(k,el){gw.hov=k||null;gbLight();gbPadLbl(k,el);if(k)gbTip(k,el);else gbPinTip()}
/* Pointing at a journey's pad, or focusing it, names its cushions in small words where each fits: "happy path" over the crest,
   "refuses" off a guard shoulder's outer edge (a crown's happy shoulders go under its crest's word), "fails" under the leaves that hang; a journey's guards or failures on a pad of their own
   (gbPadGeo: one cushion) get theirs off its outer edge or under it, and no "happy path". A word is set only where it touches no
   name, number, cushion, leaf or wood and stays inside the drawing; one with no such place is left to the card and the key. */
function gbPadLbl(k,el){const B=gw.B;if(!B||!B.svg)return;if(B.gPl)B.gPl.replaceChildren();
 const pid=k&&k.startsWith('j:')&&el&&el.getAttribute?el.getAttribute('data-pad'):null,P=pid?B.pad[pid]:null;if(!P||!P.geo||!P.cu)return;
 const m=B.svg.getScreenCTM();if(!m)return;if(!B.gPl){B.gPl=sv('g',{class:'padlbls','aria-hidden':'true'});B.svg.append(B.gPl)}
 const R=e=>e.getBoundingClientRect(),sr=R(B.svg),hf=gbHf(B),keep=[],add=(r,g)=>{if(r&&(r.width||r.height))keep.push([r.left-(g||3),r.top-(g||3),r.right+(g||3),r.bottom+(g||3)])};
 for(const t of B.svg.querySelectorAll('.klbl.on,.kpip.on,.rlbl,.shtag,.mlbl,.note,.kld'))add(R(t),2);
 for(const l of Object.values(B.lbl))add(R(l.el));
 for(const Q of Object.values(B.pad))for(const c of Q.cu||[])if(c&&c.el)add(R(c.el),2);
 for(const e of [...Object.values(B.leaf),...Object.values(B.bud)])if(!e.classList.contains('gone'))for(const b of e.querySelectorAll('.blade'))add(R(b),2)
 const wood=[...B.svg.querySelectorAll('path.w,path.tw')].filter(e=>e.getScreenCTM()),inWood=(x,y)=>wood.some(e=>{try{return e.isPointInFill(new DOMPoint(x,y).matrixTransform(e.getScreenCTM().inverse()))}catch(err){return false}});
 const clear=b=>b[0]>=sr.left+2&&b[2]<=sr.right-2&&b[1]>=sr.top+2&&b[3]<=sr.bottom-2&&!keep.some(q=>b[0]<q[2]&&b[2]>q[0]&&b[1]<q[3]&&b[3]>q[1])&&![0,.25,.5,.75,1].some(fx=>[0,.5,1].some(fy=>inWood(b[0]+(b[2]-b[0])*fx,b[1]+(b[3]-b[1])*fy)));
 const inv=m.inverse(),put=(word,cands)=>{const t=sv('text',{class:'padlbl','font-size':gbF(10/hf),'stroke-width':gbF(3/hf)},word);B.gPl.append(t);const w=R(t).width,h=10;
  for(const [x,y,al] of cands){const x0=al<0?x-w:al>0?x:x-w/2,b=[x0,y-h/2,x0+w,y+h/2];if(!clear(b))continue;const q=new DOMPoint(x0,y).matrixTransform(inv);t.setAttribute('x',gbF(q.x));t.setAttribute('y',gbF(q.y));keep.push([b[0]-3,b[1]-3,b[2]+3,b[3]+3]);return}t.remove()};
 const cs=P.geo.cs,box=i=>P.cu[i]&&P.cu[i].el?R(P.cu[i].el):null,ci=cs.findIndex(c=>c.role==='crest'),cr=ci>=0?box(ci):null;
 if(P.pol){if(!cr||!cr.width)return;const out=P.b&&P.b.dir?P.b.dir:1,mx=(cr.left+cr.right)/2,my=(cr.top+cr.bottom)/2,ox=out<0?cr.left-5:cr.right+5,qx=out<0?cr.left+cr.width*.3:cr.right-cr.width*.3;
  const edge=[[ox,my,out],[ox,cr.top+6,out],[ox,cr.bottom-6,out]],under=[[qx,cr.bottom+9,0],[mx,cr.bottom+9,0]],over=[[qx,cr.top-9,0],[mx,cr.top-9,0]];
  put(P.pol==='guard'?GB_W.refuses:GB_W.fails,P.pol==='guard'?[...edge,...under,...over]:[...under,...edge,...over]);return}
 if(cr&&cr.width&&cs[ci].ids.length){const mx=(cr.left+cr.right)/2;const my=(cr.top+cr.bottom)/2;put(GB_W.happy,[[mx,cr.top-9,0],[cr.left+4,cr.top-9,1],[cr.right-4,cr.top-9,-1],[cr.left-5,my,-1],[cr.right+5,my,1]])}
 cs.forEach((c,i)=>{if(c.role!=='shoulder'||!c.ids.length||c.hap)return;const r=box(i);if(!r||!r.width)return;const out=cr?((r.left+r.right)/2<(cr.left+cr.right)/2?-1:1):c.sd,y=(r.top+r.bottom)/2;
  /* at the shoulder's outer edge; where a name or the wood has that, just under or over it, toward the outside */
  const ox=out<0?r.left-5:r.right+5,qx=out<0?r.left+r.width*.3:r.right-r.width*.3;
  put(GB_W.refuses,[[ox,y,out],[ox,r.top+6,out],[ox,r.bottom-6,out],[qx,r.bottom+9,0],[qx,r.top-9,0],[(r.left+r.right)/2,r.bottom+9,0]])});
 const hang=cs.flatMap(c=>c.hang).map(x=>B.leaf[x.id]).filter(e=>e&&!e.classList.contains('gone')&&!e.classList.contains('cut')).map(e=>{const bs=[...e.querySelectorAll('.blade')].map(R).filter(q=>q.width);return bs.length?{left:Math.min(...bs.map(q=>q.left)),right:Math.max(...bs.map(q=>q.right)),top:Math.min(...bs.map(q=>q.top)),bottom:Math.max(...bs.map(q=>q.bottom)),width:1}:R(e)}).filter(r=>r.width);
 if(hang.length){const l=Math.min(...hang.map(r=>r.left)),r=Math.max(...hang.map(r=>r.right)),bt=Math.max(...hang.map(r=>r.bottom)),mid=(hang[0].top+hang[0].bottom)/2;
  /* (where a name, a cushion or the wood has those, close beside a hanging leaf's tip, a little under it on either side) */
  const near=[];for(const h of hang)for(const dy of [6,9,12,15,18])for(const dx of [2,5,8,11,14]){const gy=Math.max(0,dy-5);if(Math.hypot(dx,gy)<=14)near.push([Math.hypot(dx,gy),[h.right+dx,h.bottom+dy,1]],[Math.hypot(dx,gy),[h.left-dx,h.bottom+dy,-1]])}
  put(GB_W.fails,[[(l+r)/2,bt+9,0],[l-6,mid,-1],[r+6,mid,1],...near.sort((a,b)=>a[0]-b[0]).map(q=>q[1])])}}
/* on a phone a tap pins, and the pinned thing keeps its card under the drawing until it is tapped again */
function gbPinTip(){const B=gw.B;if(!B)return;const k=B.L.narrow&&!gw.hov?gw.pinned:null;const el=k&&[...B.svg.querySelectorAll('[data-k]')].find(e=>e.getAttribute('data-k')===k);gbTip(el?k:null,el||null)}
/* a knot's own checks, in the words the inspector and the Outline use for them */
const gbOwnSt=ids=>{const list=ids.flatMap(id=>gw.M.buds[id]||[]),u=ids.length===1?gw.M.U[ids[0]]:null;return list.length?h('div',{class:'st own'},gwFacts(u&&u.root?gwRootFacts(u,list):gwOwnFacts(list))):null};
/* a file and line kept whole up to a slash, where it may wrap; a piece too long for any card is cut in its middle, and the
   whole of it is the title */
const gbMid=(t,n)=>t.length>n?t.slice(0,Math.ceil(n/2)-1)+'…'+t.slice(t.length-Math.floor(n/2)):t;
const gbLocEl=loc=>loc?h('div',{class:'path',title:loc},...gwCodeText(String(loc).split('/').map(p=>gbMid(p,44)).join('/'))):null;
/* a name's box on the page, with its number in the key when it has one (the names never move for a card: it keeps off them) */
const gbNameBox=(t,box)=>{const q=box(t.getBoundingClientRect());if(t.__key&&t.__kp){const p=box(t.__kp.getBoundingClientRect());return [Math.min(q[0],p[0]),Math.min(q[1],p[1]),Math.max(q[2],p[2]),Math.max(q[3],p[3])]}return q};
/* A card beside the leaf, knot or root under the pointer: what it is, its state with evidence, and the path it crosses. */
function gbTip(k,el){const B=gw.B;if(!B||!B.tip)return;const tip=B.tip;const pid=el&&el.getAttribute&&el.getAttribute('data-pad');const P=pid&&B.pad[pid];
 /* a card docked in the side panel stands in for the panel's own content while it shows, never over it */
 const undock=()=>{const ins=tip.parentNode&&tip.parentNode.parentNode&&tip.parentNode.parentNode.nextElementSibling;if(ins)ins.classList.remove('gb-docked');tip.style.width=''};undock();
 const lg=()=>{const w=tip.parentNode;return w?w.nextElementSibling:null},kr=()=>{const l=lg();return l?l.querySelector('.gw-keyrow'):null},hide=()=>{tip.hidden=true;if(B.lead)B.lead.setAttribute('d','');if(tip.parentNode)tip.parentNode.style.paddingBottom='';const l=lg();if(l)l.style.removeProperty('--gb-tiph')};
 /* the scenario open in the drawer beside the tree has no card as well: the drawer says it once */
 if(!k||!el||(k===gw.pinned&&!B.L.narrow)||(k.startsWith('j:')&&!(P&&(P.pol||P.pruned)))||(gw.dr&&k==='s:'+gw.dr.sid)){hide();return}
 const s=gw.state,M=gw.M;/* a path breaks only between its hops */
 const pathOf=(j,R)=>{const parts=j.units.map(id=>M.U[id]).filter(Boolean),o=[...parts.filter(u=>!u.root),...parts.filter(u=>u.root)];const el=gwHops(o.map(u=>u.label),R?o.map(u=>R.lit.has(u.id)?'hit':'un'):null);
  /* a hop whose knot carries a pip has its mark here too, as it has in the key */
  const num=B.knp?B.knp.num:new Map();el[0].querySelectorAll(':scope>.gw-hop').forEach((e,i)=>{const n=o[i]&&num.get(o[i].id);if(n){const m=gbPipMark(B,n);e.prepend(h('span',{class:'gb-kn','aria-label':'pip '+m},m))}});return el};
 tip.replaceChildren();
 if(k.startsWith('s:')){const x=s.scenarios.find(q=>q.id===k.slice(2));if(!x){hide();return}const j=M.J.find(q=>M.leaves[q.id].includes(x));const w=gbStateWord(x),r0=s.run[x.id];
  gwPut(tip,h('span',{class:'k'},(r=>r.charAt(0).toUpperCase()+r.slice(1))(j?gbROLEW[gbPol(x)]:x.scenarioKind==='regression'?'existing flow':'part check')),h('b',{},x.title),
   /* a failure says where it broke, in the same words as the list, then where on the route */
   r0&&r0.st==='fail'?h('div',{class:'st fail'},gwBroke(r0,140,x.id,1)):h('div',{class:'st '+w.c},w.t),
   /* the hop it checks comes before the whole path; the hops it reaches are in ink and the rest faint, as the tree lights
      them (gbReach) */
   j&&j.units.includes(x.unit)?h('div',{class:'st hopl'},x.scenarioKind==='happy'?'Runs the whole journey, '+j.units.length+' hop'+(j.units.length===1?'':'s'):['Exercises ',h('b',{class:'m'},...gwCodeText((M.U[x.unit]||{}).label||x.unit)),' (hop '+(j.units.indexOf(x.unit)+1)+' of '+j.units.length+')']):null,
   h('div',{class:'path'},j?pathOf(j,gbReach(M,j,x)):[...gwCodeText((M.U[x.unit]||{}).label||''),x.flow&&x.scenarioKind==='regression'?' · '+x.flow:null]))}
 else if(k.startsWith('j:')){const j=M.J.find(q=>q.id===P.jid);const n=(gw.order||[]).indexOf(P.jid)+1;const vis=s.modeBy?s.mode:null;
  const later=P.leaves.filter(x=>vis&&gbRank[x.mode]>gbRank[vis]);
  gwPut(tip,h('span',{class:'k'},gwFacts(['journey '+n,P.pol?gbROLEW[P.pol]:null])),h('b',{},j?j.title:''),
   h('div',{class:'st'},P.pruned?'Pruned in '+gbModeName(vis)+': '+later.length+' scenario'+(later.length===1?'':'s')+' here; '+[...new Set(later.map(x=>gbModeName(x.mode)))].join(' and ')+' grows '+(later.length===1?'it':'them')+'.'
    :(P.leaves.length-later.length)+' scenario'+(P.leaves.length-later.length===1?'':'s')+(P.pol==='failure'?' that break it on purpose and check it fails safely':' that check it refuses what it must')+(later.length?'; '+later.length+' more in '+gbModeName(later[0].mode):'')+'.'))}
 else if(B.knot[k.slice(2)]&&B.knot[k.slice(2)].__ids.length>1){const ids=B.knot[k.slice(2)].__ids;const on=M.J.filter(j=>ids.some(id=>j.units.includes(id)));
  gwPut(tip,h('span',{class:'k'},ids.length+' parts on one knot'),...ids.map(id=>h('b',{class:'m'},...gwCodeText((M.U[id]||{}).label||id))),
   h('div',{class:'st'},on.length===1?'On 1 journey: '+on[0].title:on.length+' of '+M.J.length+' journeys pass through them'),gbOwnSt(ids))}
 else{const id=k.slice(2);const u=M.U[id];if(!u){hide();return}const on=M.J.filter(j=>j.units.includes(id));
  const stop=s.stops.find(x=>x.unit===id);
  gwPut(tip,h('span',{class:'k'},gwFacts(u.root?['depends on',u.layer==='ext'?'outside the repo':'in the repo']:['part'])),u.root?h('b',{},u.label):h('b',{class:'m'},...gwCodeText(u.label)),gbLocEl(u.loc),
   h('div',{class:'st'},u.root?gbFeeds(on.map(j=>(gw.order||[]).indexOf(j.id)+1).sort((a,b)=>a-b))+(on.length===1?': '+on[0].title:on.length?'':' in this change, so it lies loose'):on.length?(on.length===1?'On 1 journey: '+on[0].title:on.length+' of '+M.J.length+' journeys pass through it'):'Changed, but no journey in this change reaches it'),
   gbOwnSt([id]),stop?h('div',{class:'st'},'Tracing stops here: '+stop.why):null)}
 /* on a phone the card of what was tapped stays under the drawing until its Close button, a tap off it, or a tap on the same
    thing again */
 const wrap0=tip.parentNode,narrow=B.L.narrow||!!wrap0&&wrap0.clientWidth<480;
 if(narrow&&k===gw.pinned)tip.prepend(h('button',{class:'gb-x',type:'button','aria-label':'Close',on:{click:e=>{e.stopPropagation();gw.pinned=null;gw.pinList=null;gw.hov=null;gw.hovEl=null;gbTipOff(B);growPaint()}}},'×'));
 /* and a phone's card of a scenario that ran opens what happened in its run; one no flow proves offers to write that flow */
 if(narrow&&k===gw.pinned&&k.startsWith('s:')){const x=gwScen(k.slice(2));gwPut(tip,gwMore(x),gwHappened(x),gwDrEntry(x),gwWriteEntry(x),gwCardActs(x))}
 tip.hidden=false;const wrap=tip.parentNode;if(!wrap)return;
 /* on a phone there is no room beside anything: the card sits under the drawing, full width, and the drawing stays clear. It
    sits under the drawing's caption and key */
 tip.classList.toggle('below',narrow);tip.classList.remove('dock');tip.style.maxWidth='';tip.style.width='';
 /* (under the caption and the key, so neither they nor the drawing move when a card opens: what follows the key makes room) */
 if(narrow){const c0=wrap.getBoundingClientRect(),r=kr(),sr=B.svg.getBoundingClientRect(),yb=r?r.getBoundingClientRect().bottom:sr.bottom;
  tip.style.left='0px';tip.style.top=gbF(yb-c0.top+8)+'px';wrap.style.paddingBottom='';const l=lg();if(r&&l)l.style.setProperty('--gb-tiph',gbF(tip.offsetHeight+16)+'px');else wrap.style.paddingBottom=gbF(tip.offsetHeight+12)+'px';return}
 wrap.style.paddingBottom='';{const l=lg();if(l)l.style.removeProperty('--gb-tiph')}const c=wrap.getBoundingClientRect();
 /* as wide as its longest piece that cannot break, within 280 to 380 px */
 tip.style.width='min-content';const mc=Math.min(380,Math.max(280,Math.ceil(tip.offsetWidth)));tip.style.width=mc+'px';const tw=tip.offsetWidth,th=tip.offsetHeight;
 const sr=B.svg.getBoundingClientRect(),vb=B.svg.viewBox.baseVal,f=sr.width/vb.width;const toPx=p=>[sr.left-c.left+(p[0]-vb.x)*f,sr.top-c.top+(p[1]-vb.y)*f],toSv=q=>[vb.x+(q[0]-(sr.left-c.left))/f,vb.y+(q[1]-(sr.top-c.top))/f];
 const box=q=>[q.left-c.left,q.top-c.top,q.right-c.left,q.bottom-c.top];
 /* A root is long and runs off under the pot: its card points at where it crosses the rim, the spot its name is set by (a
    store in the pot, at the point its tag stands by). A knot's card points at the knot's name, which has its own hairline
    to the knot, so no second line runs into the knot. Anything else, at itself. */
 const rid=k.startsWith('u:')&&B.root[k.slice(2)]?k.slice(2):null,rr=rid?B.L.roots.find(q=>q.id===rid):null,P0=B.L.potC-B.L.potL/2,P1=B.L.potC+B.L.potL/2;
 const xo=rr&&rr.pts?rr.pts.find(p=>p[0]<P0||p[0]>P1):null,rim=xo?toPx(xo):rid&&B.pos[rid]?toPx(B.pos[rid]):null;
 const kn=k.startsWith('u:')?B.knot[k.slice(2)]:null,klk=kn?Object.keys(B.klbl).find(q=>B.knot[q]===kn):null,kl=klk?B.klbl[klk]:null,kb=kl&&kl.__fit&&kl.classList.contains('on')?gbNameBox(kl,box):null;
 /* (a store's root in the pot is named on its plant tag: its card points at the tag, as a knot's does at its name, and stands
    by it) */
 const tgE=rr&&!rr.ext?[...B.root[rid].querySelectorAll('.ptag .tag,.rlbl.tg')].map(e=>e.getBoundingClientRect()).filter(q=>q.width):[],tgB=tgE.length?tgE.map(box).reduce((a,q)=>[Math.min(a[0],q[0]),Math.min(a[1],q[1]),Math.max(a[2],q[2]),Math.max(a[3],q[3])]):null;
 const me=rim?[rim[0]-6,rim[1]-6,rim[0]+6,rim[1]+6]:box(el.getBoundingClientRect()),AB=tgB||(rim?[rim[0],rim[1],rim[0],rim[1]]:kb?box(kl.getBoundingClientRect()):me);
 const x0=me[0],y0=me[1],x1=me[2],y1=me[3],cx=(x0+x1)/2,cy=(y0+y1)/2;
 /* The card never covers what it explains: the thing pointed at and its name, the route it lights or (for a root) the root
    itself. Nor does it cover any name, the faded ones too, any of a journey's words, a root's name, a cushion or a leaf, and
    it keeps 12 px off each of those and off the lit route where it can. It would rather not sit on the pot, on shoots and
    buds, on the hairlines of names or on foliage. No hairline crosses a name of any kind. */
 const G=12,own=[[x0-6,y0-6,x1+6,y1+6]],hard=[],kn12=[],mid=[],thin=[],soft=[],nox=[],txt=[];if(kb)own.push([kb[0]-4,kb[1]-4,kb[2]+4,kb[3]+4]);if(tgB)own.push([tgB[0]-4,tgB[1]-4,tgB[2]+4,tgB[3]+4]);
 /* a root is a long thin line: the card keeps off the line itself, not the whole box it spans, or it could never sit by the pot */
 const rpx=rr&&rr.pts?rr.pts.map((p,i)=>{const q=toPx(p),r=(rr.w[i]||2)*f/2+5;return [q[0]-r,q[1]-r,q[0]+r,q[1]+r]}):[];
 const rl=rid?[...B.root[rid].querySelectorAll('.rlbl')]:[];
 for(const t of Object.values(B.klbl))if(t.classList.contains('on')||t.classList.contains('kdim')||((t.classList.contains('wound')||t.classList.contains('brk'))&&!t.classList.contains('wmute'))){const q=gbNameBox(t,box);if(q[2]>q[0]&&!(t===kl&&kb)){hard.push(q);if(t!==kl){nox.push(q);txt.push(q);kn12.push(q)}}}
 for(const t of B.svg.querySelectorAll('.rlbl,.padlbl')){const q=t.getBoundingClientRect();if(q.width&&!(tgB&&rl.includes(t))){const b=box(q);hard.push(b);nox.push(b);if(!rl.includes(t))txt.push(b)}}
 /* a journey's words line by line, a badge whole */
 for(const l of Object.values(B.lbl))for(const t of l.badge?[l.el]:l.el.querySelectorAll('text')){const q=t.getBoundingClientRect();if(q.width){const b=box(q);hard.push(b);nox.push(b);txt.push(b)}}
 /* the leaves it lights are what it explains, so neither the card nor its hairline crosses them */
 for(const lf of B.svg.querySelectorAll('.gb-lf:not(.gone),.gb-gr')){const q=lf.getBoundingClientRect();if(!q.width)continue;const b=box(q);if(lf.matches('.hl,.sel')){const b6=[b[0]-6,b[1]-6,b[2]+6,b[3]+6];hard.push(b6);nox.push(b6)}else mid.push(b)}
 const cus=[];for(const e of B.svg.querySelectorAll('.pfill')){const q=e.getBoundingClientRect();if(q.width){const b=box(q);mid.push(b);cus.push(b)}}
 const firm=[];const pot=B.svg.querySelector('.pots');if(pot){const q=pot.getBoundingClientRect();if(q.width)firm.push(box(q))}
 for(const P of Object.values(B.pad)){const q=P.el.getBoundingClientRect();if(q.width)soft.push(box(q))}
 for(const e of B.svg.querySelectorAll('.budg,.kld,.scar.on,.gsw,.kpip.on:not(.key),.kpip.kdim:not(.key)')){const q=e.getBoundingClientRect();if(q.width||q.height)thin.push(box(q))}
 /* and its hairline keeps 12 px off the small words too: the seal, a shoot's or a graft's count, a pip on its boss */
 for(const e of B.svg.querySelectorAll('.seal text,.shtag,.gsw,.kpip.on:not(.key),.kpip.kdim:not(.key)')){if(kl&&kl.parentNode.contains(e))continue;const q=e.getBoundingClientRect();if(q.width)txt.push(box(q))}
 /* the route, as points 4 px apart along it */
 const rp=[];for(const pe of [B.sap,B.sapX,B.sapW]){try{const n=pe.getAttribute('d')?pe.getTotalLength():0;if(n>0)for(let s2=0;s2<=n;s2+=4/f){const p=pe.getPointAtLength(s2);rp.push(toPx([p.x,p.y]))}}catch(e){}}
 /* it stays inside the drawing, never past the panel's edge nor below the drawing over its caption and key: a root's card
    too, whose root lies at the foot of the drawing, stands beside the pot or above the rim */
 const W2=Math.min(c.width,sr.right-c.left),H0=sr.bottom-c.top;
 const inB=(p,b)=>p[0]>b[0]&&p[0]<b[2]&&p[1]>b[1]&&p[1]<b[3],ovB=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
 const dB=(p,q)=>Math.hypot(Math.max(q[0]-p[0],0,p[0]-q[2]),Math.max(q[1]-p[1],0,p[1]-q[3]));
 const hit=(a,b,r)=>{let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];for(const [pp,qq] of [[-dx,a[0]-r[0]],[dx,r[2]-a[0]],[-dy,a[1]-r[1]],[dy,r[3]-a[1]]]){if(pp===0){if(qq<0)return false;continue}const t=qq/pp;if(pp<0){if(t>t1)return false;if(t>t0)t0=t}else{if(t<t0)return false;if(t<t1)t1=t}}return true};
 /* everything the drawing holds: wood, foliage, leaves, words, pot and roots */
 const ink=[...own,...hard,...mid,...firm,...thin,...rpx];for(const e of B.svg.querySelectorAll('path.w,path.tw')){const q=e.getBoundingClientRect();if(q.width)ink.push(box(q))}for(const id in B.root){const q=B.root[id].getBoundingClientRect();if(q.width)ink.push(box(q))}
 const TB=ink.reduce((a,q)=>[Math.min(a[0],q[0]),Math.min(a[1],q[1]),Math.max(a[2],q[2]),Math.max(a[3],q[3])],[1e9,1e9,-1e9,-1e9]);
 /* the nearest points of two boxes, one on each */
 const near=(a,b)=>{const ax=(lo,hi)=>b[hi]<a[lo]?[a[lo],b[hi]]:b[lo]>a[hi]?[a[hi],b[lo]]:[(Math.max(a[lo],b[lo])+Math.min(a[hi],b[hi]))/2,(Math.max(a[lo],b[lo])+Math.min(a[hi],b[hi]))/2];const X=ax(0,2),Y=ax(1,3);return [[X[0],Y[0]],[X[1],Y[1]]]};
 /* the twigs as drawn, each piece as wide as the twig is there */
 const twg=[];for(const e of B.svg.querySelectorAll('path.tw')){if(!e.__pts||e.closest('.budg'))continue;const q=e.getBoundingClientRect(),m=e.getScreenCTM();if(!q.width||!m)continue;const P=e.__pts.map(p=>[m.a*p[0]+m.c*p[1]+m.e-c.left,m.b*p[0]+m.d*p[1]+m.f-c.top]),W=e.__w||[],sc=Math.hypot(m.a,m.b);
  for(let i=1;i<P.length;i++){const a=P[i-1],b=P[i],r=Math.max(W[i-1]||1,W[i]||1)*sc/2+1.5;twg.push([a,b,r,[Math.min(a[0],b[0])-r,Math.min(a[1],b[1])-r,Math.max(a[0],b[0])+r,Math.max(a[1],b[1])+r]])}}
 /* and the wood itself, trunk, limbs and roots, each piece as thick as the wood is there and a pixel more: a hairline that
    leaves what it explains never crosses wood (the root a root's card explains is its own, and is left out) */
 /* (wood under a cushion is hidden by its foliage: a line over the foliage there does not cross the wood) */
 const cuE=[...B.svg.querySelectorAll('.pfill')].filter(e=>e.getBoundingClientRect().width),underCu=p=>cuE.some(e=>{const m=e.getScreenCTM();if(!m)return false;const q=m.inverse(),x=p[0]+c.left,y=p[1]+c.top;return e.isPointInFill(new DOMPoint(q.a*x+q.c*y+q.e,q.b*x+q.d*y+q.f))});
 const wdg=[];for(const e of B.svg.querySelectorAll('path.w')){if(!e.__pts||e.closest('.budg,.stub')||(rid&&B.root[rid].contains(e)))continue;const q=e.getBoundingClientRect(),m=e.getScreenCTM();if(!q.width||!m)continue;const P=e.__pts.map(p=>[m.a*p[0]+m.c*p[1]+m.e-c.left,m.b*p[0]+m.d*p[1]+m.f-c.top]),W=e.__w||[],sc=Math.hypot(m.a,m.b);
  for(let i=1;i<P.length;i++){const a=P[i-1],b=P[i],r=Math.max(W[i-1]||1,W[i]||1)*sc/2+1;wdg.push([a,b,r,[Math.min(a[0],b[0])-r,Math.min(a[1],b[1])-r,Math.max(a[0],b[0])+r,Math.max(a[1],b[1])+r]])}}
 /* The hairline back to what it explains, when the card is more than 16 px off: one straight segment. It never crosses a
    name; past where it leaves, it keeps 12 px off every word and off the lit wood, it crosses no wood and no twig once it
    is off the thing it leaves (so it ends at a leaf's nearest edge, never across the twigs it hangs among), and it would
    rather not cross a cushion, foliage or the pot. */
 const nearAny=(A,p)=>{for(const q of A)if(dB(p,q)<G)return true;return false},ptAny=(A,p)=>{for(const r of A)if(Math.hypot(r[0]-p[0],r[1]-p[1])<5)return true;return false},inAny=(A,p)=>{for(const q of A)if(inB(p,q))return true;return false},
  twAny=(A,p)=>{for(const s of A)if(p[0]>s[3][0]&&p[0]<s[3][2]&&p[1]>s[3][1]&&p[1]<s[3][3]&&gbSegD(p,p,s[0],s[1])<s[2])return true;return false};
 const lead=(CB,all,cap=Infinity,zc=Infinity)=>{const [pa,pc]=near(AB,CB);if(Math.hypot(pc[0]-pa[0],pc[1]-pa[1])<=16)return {pts:null,pen:0,ok:true};const opts=[[pa,pc]],more=[];
  /* (from anywhere along the card's edge that faces the thing, its nearest point first: the line may leave the edge further
     along where that keeps it clear of a name) */
  {const cl=(v,a,b)=>Math.max(a,Math.min(b,v)),onX=pc[0]===CB[0]||pc[0]===CB[2],onY=pc[1]===CB[1]||pc[1]===CB[3];
   const st=onX&&!onY?[CB[1]+10,(CB[1]+CB[3])/2,CB[3]-10].map(y=>[pc[0],y]):onY&&!onX?[CB[0]+10,(CB[0]+CB[2])/2,CB[2]-10].map(x=>[x,pc[1]]):[];
   for(const q of st){if(Math.hypot(q[0]-pc[0],q[1]-pc[1])<6)continue;const a=[cl(q[0],AB[0],AB[2]),cl(q[1],AB[1],AB[3])];more.push([a,q])}}
  /* (one straight segment, always, from the card's nearest edge to the thing: never an elbow or a bracket round a name.
     Where that line is not clear, the card moves, not the line) */
  /* (a way is given up as soon as it costs as much as would keep its place from winning, since it could only cost more) */
  let bestL=null,cut=false;for(const pts of [...opts,null,...more]){if(!pts){if(bestL&&bestL.ok)break;continue}const lim=bestL?Math.min(bestL.pen,cap):cap;let pen=pts.length>2?12:0,ok=true,wd=false;if(pen>=lim)continue;const p0=pts[0];for(let i=1;i<pts.length&&pen<lim&&(ok||pen<zc);i++){const a=pts[i-1],b=pts[i],sl=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(const q of nox)if(!inB(p0,q)&&hit(a,b,[q[0]-2,q[1]-2,q[2]+2,q[3]+2])){pen+=1e5;ok=false}
    const tw2=twg.filter(s=>s[3][0]<Math.max(a[0],b[0])&&s[3][2]>Math.min(a[0],b[0])&&s[3][1]<Math.max(a[1],b[1])&&s[3][3]>Math.min(a[1],b[1])),wd2=wdg.filter(s=>s[3][0]<Math.max(a[0],b[0])&&s[3][2]>Math.min(a[0],b[0])&&s[3][1]<Math.max(a[1],b[1])&&s[3][3]>Math.min(a[1],b[1]));
    /* (only what lies near this piece of it can be too near a point on it, and a piece near nothing is not walked at all) */
    const nr=(q,r)=>q[0]<Math.max(a[0],b[0])+r&&q[2]>Math.min(a[0],b[0])-r&&q[1]<Math.max(a[1],b[1])+r&&q[3]>Math.min(a[1],b[1])-r,txt2=txt.filter(q=>nr(q,G+1)),rp2=rp.filter(r=>nr([r[0],r[1],r[0],r[1]],6)),fm2=firm.filter(q=>!inB(p0,q)&&nr(q,1)),cu2=cus.filter(q=>!inB(p0,q)&&nr(q,1)),so2=soft.filter(q=>!inB(p0,q)&&nr(q,1));
    let inW=false,inT=false,inTw=false;if(txt2.length||rp2.length||tw2.length||wd2.length||fm2.length||cu2.length||so2.length)for(let s2=2;s2<sl&&pen<lim&&(ok||pen<zc);s2+=2){const t=s2/sl,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(inB(p,me))continue;const off=Math.hypot(p[0]-p0[0],p[1]-p0[1])>=G;
     /* (running by a word costs more than crossing the wood, once a pass: a hairline that grazes a name reads as pointing at
        it) */
     if(off&&txt2.length&&nearAny(txt2,p)){if(!inT)pen+=2.5e4;inT=true;ok=false}else inT=false
     if(off&&rp2.length&&ptAny(rp2,p)){pen+=400;ok=false}
     if(tw2.length&&Math.hypot(p[0]-p0[0],p[1]-p0[1])>=6&&twAny(tw2,p)){if(!inTw)pen+=2.2e4;inTw=true;ok=false}else inTw=false
     /* (wood crossed costs once a crossing, however thick the trunk there: a line across the trunk is worse than one beside
        a name, but not worse than a card over one) */
     if(wd2.length&&Math.hypot(p[0]-p0[0],p[1]-p0[1])>=8&&twAny(wd2,p)&&!underCu(p)){if(!inW)pen+=2e4;inW=true;ok=false;wd=true}else inW=false
     if(fm2.length&&inAny(fm2,p)){pen+=300;ok=false}else if(cu2.length&&inAny(cu2,p)){pen+=60;ok=false}else if(so2.length&&inAny(so2,p))pen+=60}}
   if(!ok&&pen>=zc){cut=true;continue}if(pen<lim)bestL={pts,pen,ok,wood:wd}}if(cut&&bestL&&bestL.ok&&bestL.pen>=zc)return lead(CB,all);return bestL||{pts:null,pen:Infinity,ok:false}};
 /* (a root's card stays within 84 px of where its root crosses the rim, or of its tag in the pot, or else of where a root in
    the pot starts) */
 const rd=rr&&rr.pts&&rr.pts.length?toPx(xo||rr.pts[0]):rim,rimB=tgB||(rd?[rd[0],rd[1],rd[0],rd[1]]:null);
 const fit=(tw,th)=>{const H2=Math.max(H0,th+8),key=[0,H0,W2,H2];
 /* Where it may go, in this order: the open gutter right of everything the drawing holds, the one left of it, the ground
    under the pot, each slid along to stand as level with what it explains as it can; then beside what it explains on the
    right or the left, or above or below it, nearest first, out to the open ground of the drawing (a root's card also tries
    the ground by the pot: outside the rim its root crosses, under the pot, the other side). It takes the first place that
    covers nothing and keeps 12 px off it all with a clear hairline; where there is none, the place that covers least. */
 const cand=[],ys=[],xs=[];for(let yy=4;yy<=H2-th-4;yy+=12)ys.push(yy);for(let xx=4;xx<=W2-tw-4;xx+=20)xs.push(xx);
 ys.sort((a,b)=>Math.abs(a+th/2-cy)-Math.abs(b+th/2-cy));xs.sort((a,b)=>Math.abs(a+tw/2-cx)-Math.abs(b+tw/2-cx));
 if(TB[2]+G+tw<=W2-4)for(const yy of ys)cand.push([TB[2]+G,yy]);
 if(TB[0]-G-tw>=4)for(const yy of ys)cand.push([TB[0]-G-tw,yy]);
 if(TB[3]+G+th<=H2-4)for(const xx of xs)cand.push([xx,TB[3]+G]);
 const by=[],ring=(b,gaps,dy,dx)=>{for(const gp of gaps){for(let yy=b[1]-th-gp;yy<=b[3]+gp;yy+=dy)by.push([b[2]+gp,yy],[b[0]-tw-gp,yy]);for(let xx=b[0]-tw-gp;xx<=b[2]+gp;xx+=dx)by.push([xx,b[1]-th-gp],[xx,b[3]+gp])}};
 ring(AB,[10,24,40],12,20);if(AB!==me)ring(me,[10,24,40],12,20);ring(AB,[64,100,150,220,300],24,40);
 if(rim&&firm[0]){const pb=firm[0],sd=xo?(xo[0]>P1?1:-1):(rim[0]<(pb[0]+pb[2])/2?-1:1),side=s2=>{for(const gp of [10,24,40,64,100])for(let yy=Math.min(rim[1],pb[1])-th-gp;yy<=pb[3]+gp;yy+=12)by.push([s2<0?pb[0]-tw-gp:pb[2]+gp,yy])};
  side(sd);for(const gp of [10,24,40])for(let xx=pb[0]-tw;xx<=pb[2];xx+=20)by.push([xx,pb[3]+gp]);side(-sd)}
 /* and, where nothing beside it is open, the drawing's corners, the emptiest winning, the hairline running out to it */
 for(const q of [[4,4],[W2-tw-4,4],[4,H0-th-4],[W2-tw-4,H0-th-4]])by.push(q);
 /* (and last, on a crowded tree, any open ground of the drawing at all, nearest first) */
 for(let yy=4;yy<=H2-th-4;yy+=16)for(let xx=4;xx<=W2-tw-4;xx+=24)by.push([xx,yy]);
 const far=q=>{const [pa,pc]=near(AB,[q[0],q[1],q[0]+tw,q[1]+th]);return Math.hypot(pc[0]-pa[0],pc[1]-pa[1])+(Math.abs(q[0]+tw/2-cx)+Math.abs(q[1]+th/2-cy))*.02};
 cand.push(...by.map(q=>[q,far(q)]).sort((a,b)=>a[1]-b[1]).map(q=>q[0]));
 let best=null;
 for(const q of cand){const x=Math.max(4,Math.min(q[0],W2-tw-4)),y=Math.max(4,Math.min(q[1],H2-th-4)),CB=[x,y,x+tw,y+th],CG=[x-G,y-G,x+tw+G,y+th+G];let sc=0,z=true;
  /* (a place that already covers something and costs as much as the best so far, with its distance from what it explains,
     is passed over at once: it could only cost more) */
  const [pa,pc]=near(AB,CB),D=25*Math.hypot(pc[0]-pa[0],pc[1]-pa[1])+Math.abs(x+tw/2-cx)*.05,lost=()=>!z&&best&&sc+D>=best.sc;
  for(const b of own){const o=ovB(CB,b);if(o>0){sc+=1e5+o*10;z=false}}
  for(const b of hard){const o=ovB(CB,b);if(o>0){sc+=1e5+o*10;z=false}else if(ovB(CG,b)>0){sc+=300;z=false}}if(lost())continue;
  for(const b of kn12)if(ovB(CG,b)>0){sc+=1e5;z=false}
  for(const b of mid){const o=ovB(CB,b);if(o>0){sc+=5e4+o*5;z=false}else if(ovB(CG,b)>0){sc+=200;z=false}}if(lost())continue;
  if(rpx.some(b=>ovB(CB,b)>0)){sc+=1e5;z=false}
  for(const b of firm){const o=ovB(CB,b);if(o>0){sc+=4e4+o*5;z=false}}
  for(const b of thin){const o=ovB(CB,b);if(o>0){sc+=o*2;z=false}}
  for(const b of soft)sc+=ovB(CB,b)*2;if(lost())continue;
  for(const p of rp)if(p[0]>x-3&&p[0]<x+tw+3&&p[1]>y-3&&p[1]<y+th+3){sc+=2e4;z=false}else if(inB(p,CG)){sc+=40;z=false}
  const ko=ovB(CB,key);if(ko>0){sc+=4000+ko*.02;z=false}
  let far=false;if(rimB){const [ra,rc]=near(rimB,CB);if(Math.hypot(rc[0]-ra[0],rc[1]-ra[1])>84){sc+=5e4;z=false;far=true}}
  sc+=D;if(!z&&best&&sc>=best.sc)continue;
  const cp=best?best.sc-1-sc+1e-6:Infinity,L2=lead(CB,false,z?Infinity:cp,z?cp:Infinity);sc+=L2.pen;if(z&&L2.ok)return {x,y,sc,pts:L2.pts,CB,zero:true};if(!best||sc<best.sc-1)best={x,y,sc,pts:L2.pts,CB,ok:L2.ok,wood:!!L2.wood,far}}
 if(best&&!best.ok){const L3=lead(best.CB,true);if(L3.ok){best.pts=L3.pts;best.wood=false}}
 return best};
 /* a card with no open ground near what it explains tries another shape, wider and shorter or narrower and taller, never
    under 280 px nor under its longest piece: beside a pot or a crown there is often room for one but not the other */
 let best=fit(tw,th);best.w=mc;if(!best.zero)for(const w of [280,330,380]){if(w===mc||w<mc)continue;tip.style.width=w+'px';const b2=fit(tip.offsetWidth,tip.offsetHeight);b2.sc+=Math.abs(tw-w)*8;b2.w=w;if(b2.zero&&!best.zero||!b2.zero===!best.zero&&b2.sc<best.sc)best=b2}
 tip.style.width=best.w+'px';
 tip.style.left=gbF(best.x)+'px';tip.style.top=gbF(best.y)+'px';
 /* (a root's card with no clear ground within reach of its root stands where the drawing is open, its hairline running out
    to it: said on the card, for whoever checks where it went) */
 if(best.far)tip.setAttribute('data-far','');else tip.removeAttribute('data-far');
 /* (and where a crowded crown leaves no place in the drawing whose straight hairline crosses no wood, the card says so too) */
 if(best.pts&&best.wood)tip.setAttribute('data-crowd','');else tip.removeAttribute('data-crowd');
 /* the hairline, drawn in the drawing; a rim point's starts just off the point */
 let lp=null;if(best.pts&&B.lead){lp=best.pts.map(toSv);if(rim){const a=lp[0],b=lp[1],u=Math.hypot(b[0]-a[0],b[1]-a[1])||1;lp[0]=[a[0]+(b[0]-a[0])/u*3,a[1]+(b[1]-a[1])/u*3]}B.lead.setAttribute('d','M'+lp.map(gbP).join(' L'))}else if(B.lead)B.lead.setAttribute('d','');
}
function gbRove(el){const B=gw.B;for(const k in B.navEl)B.navEl[k].setAttribute('tabindex','-1');for(const id in B.leaf)B.leaf[id].setAttribute('tabindex','-1');for(const id in B.bud)B.bud[id].setAttribute('tabindex','-1');el.setAttribute('tabindex','0')}
/* the keys follow the picture: up and down move between pads, knots and roots by height; left and right move along a
   journey's leaves, or a part's own checks, by where they sit */
function gbKeys(e){const B=gw.B;const cur=e.target.closest&&e.target.closest('[data-k]');if(!cur)return;const k=cur.getAttribute('data-k');
 const go=el=>{if(!el)return;gbRove(el);el.focus();e.preventDefault()};const mid=el=>{const r=el.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]};
 const shown=el=>!el.classList.contains('gone')&&el.getBoundingClientRect().width>0;
 const bud=k.startsWith('s:')&&B.bud[k.slice(2)]===cur;const lf=k.startsWith('s:')&&!bud;
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){const base=lf?'j:'+cur.__j:bud?'u:'+cur.__u:k;const keys=B.nav.filter(n=>B.navEl[n]&&shown(B.navEl[n])).map(n=>({n,p:mid(B.navEl[n])})).sort((a,b)=>a.p[1]-b.p[1]||a.p[0]-b.p[0]).map(o=>o.n);
  const i=keys.indexOf(base);const n=i<0?keys[0]:keys[Math.max(0,Math.min(keys.length-1,i+(e.key==='ArrowDown'?1:-1)))];go(B.navEl[n])}
 else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){let ls=[];
  if(k.startsWith('j:')||lf){const jid=k.startsWith('j:')?k.slice(2):cur.__j;ls=(B.padsOf[jid]||[]).flatMap(pid=>[...B.pad[pid].lg.children])}
  else{const uid=bud?cur.__u:k.slice(2);const g=B.budG[uid],gr=(B.grafts||{})[uid]||[];if(!g&&!gr.length)return;ls=[B.navEl['u:'+uid],...(g?g.g.querySelectorAll('.bud'):[]),...gr]}
  ls=ls.filter(el=>el&&shown(el)).sort((a,b)=>mid(a)[0]-mid(b)[0]);if(!ls.length)return;const i=ls.indexOf(cur);go(ls[i<0?0:Math.max(0,Math.min(ls.length-1,i+(e.key==='ArrowRight'?1:-1)))])}
 else if(e.key==='Enter'||e.key===' '){gw.pinned=k;if(!B.L.narrow)gbTipOff(B);growPaint();e.preventDefault()}
 else if(e.key==='Escape'){gw.pinned=null;growPaint();gbHover(k,cur)}}
/* Tracers at work: a gold bead on the knot being read. */
function gbCursors(now){const B=gw.B,s=gw.state;if(!B||!s||gw.tree!=='grove')return;const keep=new Set();
 if(s.phase===2||s.phase===3||s.phase===5)for(const a of s.agents){const at=gwAt(a,now+performance.timeOrigin);if(a.done||!at||!B.pos[at])continue;keep.add(a.id);const p=B.pos[at];
  const c=B.cur[a.id]||(B.cur[a.id]=B.gCur.appendChild(sv('g',{},sv('circle',{r:10,class:'halo'}),sv('circle',{r:3.6,class:'bead'}))));const pulse=1+.25*Math.sin(now/220);c.firstChild.setAttribute('r',gbF(8*pulse));c.setAttribute('transform','translate('+gbP(p)+')')}
 for(const id in B.cur)if(!keep.has(id)){B.cur[id].remove();delete B.cur[id]}
 for(const el of new Set(Object.values(B.knot)))el.classList.toggle('trace',keep.size>0&&s.agents.some(a=>!a.done&&keep.has(a.id)&&el.__ids.includes(gwAt(a,now+performance.timeOrigin))))}

/* ---------- Journeys: the list the tree draws, and the inspector's cards ---------- */
/* The path a journey crosses, hop by hop. A hop breaks only where its name may (a long file path after a slash, never a route
   between its method and its path), and each arrow goes with the hop before it, so a line ends on the arrow that leads on and
   never starts with one; a line the path wraps onto starts a little in, under the first hop, as the same path going on (see
   .gw-hp). */
function gbPathEl(j,wound,R){const M=gw.M||(gw.M=gbModel());const parts=j.units.map(id=>M.U[id]).filter(Boolean);const order=[...parts.filter(u=>!u.root),...parts.filter(u=>u.root)];
 /* a journey's path that broke greys the hops after the break, as the tree draws them in grey dots */
 if(!R&&wound&&!(M.U[wound]||{}).root){const wi=j.units.indexOf(wound);if(wi>=0)R={lit:new Set(j.units.slice(0,wi+1))}}
 return h('ol',{class:'gb-path gw-path gw-hp'},order.map((u,i)=>h('li',{class:'hop'+(R&&!R.lit.has(u.id)?' un':'')},h('button',{class:u.root?'rootp':u.id===wound?'bad':'',title:u.loc,on:{click:e=>{e.stopPropagation();gw.pinned='u:'+u.id;gw.pinList=null;gw.refocus='u:'+u.id;growPaint()},mouseenter:()=>{const B=gw.B;if(B)gbHover('u:'+u.id,B.knot[u.id]||B.root[u.id]||null)},mouseleave:()=>gbHover(null)}},...gwCodeText(gwPlain(u.label))))))}
/* Where a journey starts: the words, then its entry, kept whole and held to the word before it. */
const gbStarts=(j,M)=>['starts '+(gbWHERE[j.surface]||'')+' at ',...gwCodeText(gwPlain((M.U[j.entry]||{}).label||''))];
/* A journey's state in words, each count whole and in its colour, the dot going with the count after it; the dot of a count
   that starts a line is clipped (see .gw-sl), so no line starts or ends on a dot. */
const gbToks=toks=>h('span',{class:'tks gw-sl'},toks.map((w,i)=>h('span',{class:'tk'},i?h('span',{class:'sp n'},' · '):null,h('span',{class:w[1]},w[0]))));
/* The inspector's journey says what the list below does not: its title, where it starts, the path it crosses with the wound
   marked, and where it broke. Its scenarios are counted here and listed once, in the Journeys card. */
function gbJourneyCard(jid){const s=gw.state,M=gw.M;const j=M.J.find(q=>q.id===jid);if(!j)return null;const n=(gw.order||[]).indexOf(jid)+1;
 const list=M.leaves[jid]||[];const inMode=x=>!s.modeBy||gwIn(x);const inm=list.filter(inMode);const fails=gbByRole(inm.filter(x=>s.run[x.id]&&s.run[x.id].st==='fail'));const wound=list.map(x=>gbWound(M,j,x)).find(Boolean);
 const crit=[...M.crit(j)].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 const toks=s.modeBy&&list.length&&!inm.length?[[gwPruned(list,s.mode),'n']]:gbTok(list,j,s.modeBy?s.mode:null,inMode);
 return [h('h3',{class:'gw-jt'},...gwRich(gwJourneyTitle(j))),h('div',{class:'where'},gwFacts([n?'Journey '+n:null,gbStarts(j,M),j.by&&j.by!=='rules'?'named by '+(j.by==='spec'?'the spec':j.by):null])),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'The path it crosses'),gbPathEl(j,wound)),
  fails.length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},fails.length===1?'Where it broke':fails.length+' failures'),
   fails.flatMap(x=>[gbItem(x,{class:'gb-ols','data-sid':x.id,on:{click:()=>{gw.pinned='s:'+x.id;gw.pinList=null;gw.refocus='s:'+x.id;growPaint()}}},[gwBadge(x)]),h('div',{class:'err'},gwBroke(s.run[x.id],0,x.id,1)),gwHappened(x),gwDrEntry(x)])):null,
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Scenarios'),h('div',{class:'gw-jst'},list.length?h('span',{class:'gb-gs'},gbByRole(list).map(gbGlyph)):null,gbToks(toks)),
   list.length&&gw.tree==='grove'?h('button',{class:'gw-lnk',on:{click:()=>{(gw.open||(gw.open={}))['j:'+jid]=true;gw.reveal='j:'+jid;gw.refocus='j:'+jid;growPaint()}}},'Listed under Journeys, below ↓'):null),
  crit.length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Spec it answers'),h('div',{class:'gw-chips'},crit.map(gwCrit))):null]}
/* A scenario's card: what it is and where it sits, its state and, when it failed, where it broke, before the claim it checks;
   then the path it crosses and what proves it. */
function gbScenarioCard(sid){const s=gw.state,M=gw.M;const x=s.scenarios.find(q=>q.id===sid);if(!x)return null;const j=M.J.find(q=>M.leaves[q.id].includes(x));const r=s.run[x.id];const T=gwVia(x.title);const n=j?(gw.order||[]).indexOf(j.id)+1:0;
 return [h('h3',{class:'gw-st'},...gwRich(T.title)),T.via?h('div',{class:'gw-via'},'via ',...gwCodeText(T.via)):null,
  h('div',{class:'where'},...(j?[gbROLEW[gbPol(x)]+' · journey'+(n?' '+n:'')+': ',...gwRich(j.title)]:[(x.scenarioKind==='regression'?'existing flow':'part check')+' · ',...gwCodeText((M.U[x.unit]||{}).label||'')])),
  h('div',{class:'sec'},h('div',{class:'row gw-brow'+(r&&r.st==='fail'?' f':''),style:'gap:8px'},gwBadge(x),h('span',{class:'gw-chip'+(x.mode==='min'?' min':'')},gwML(x.mode)),x.by!=='rules'?h('span',{class:'gw-chip agent'},x.by):null),
   r&&r.st==='fail'?h('div',{class:'gw-flag red gw-broke'},h('span',{},(n=>n?h('b',{class:'gw-stepno'},'Step '+n+' · '):null)(gwStepNo(x)),gwBroke(r,0,x.id))):gwWhyNot(x),gwCardActs(x),gwHappened(x),gwEvLine(x),gwDrEntry(x),gwWriteEntry(x),gwMore(x),
   x.proves?h('div',{class:'gw-claim'},h('span',{class:'gw-eyebrow'},gwClaim(x)),h('span',{},...gwRich(x.proves))):null),
  j?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'The path it crosses'),gbPathEl(j,gbWound(M,j,x),gbReach(M,j,x))):null,
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Proof'),h('div',{class:'gw-chips'},gwFlowOf(x)?h('span',{class:'gw-chip built'},gwFlowOf(x)):h('span',{class:'gw-chip missing'},'no flow yet'),x.criteria.map(id=>gwCrit(id,x)),
    x.ext.filter(e=>s.ext[e]&&s.ext[e].state!=='proven').map(e=>h('span',{class:'gw-chip agent',title:s.ext[e].path},'agent-written '+s.ext[e].extKind))),x.variants.length?gwLanes(x):null)]}

/* ---------- The lists: the tree's journeys as rows ---------- */
/* A scenario's glyph in a list is the legend's own: passed, failed, running, to prove, no flow yet, or pruned. */
function gbGlyph(x){const s=gw.state,r=s.run[x.id];const c=s.modeBy&&!gwIn(x)?'cut':!r?(!s.modeBy&&!gwIn(x)?'pre':'in'):r.st==='pass'?'pass':r.st==='fail'?'fail':r.st==='run'?'run':gwFlowOf(x)?'in':'none';
 const g=gwSw(c);g.setAttribute('width','13');g.setAttribute('height','10');return h('span',{class:'gw-g gb-g '+c,'aria-hidden':'true'},g)}
/* The tree's own words for where a leaf sits, the same in every list and card. */
const gbROLE=[['happy','Happy path'],['guard','What it refuses'],['failure','How it fails']];
const gbROLEW={happy:GB_W.happy,guard:GB_W.guard,failure:GB_W.failure};
/* Scenarios in the order a pad holds them: the happy path, then guards, then failures; the minimum's first in each, pruned last. */
const gbByRole=list=>{const r={happy:0,guard:1,failure:2},s=gw.state,cut=x=>s.modeBy&&!gwIn(x)?1:0;return gbOrd(list).map((x,i)=>({x,i})).sort((a,b)=>cut(a.x)-cut(b.x)||r[gbPol(a.x)]-r[gbPol(b.x)]||a.i-b.i).map(o=>o.x)};
const gbNarrowList=()=>{try{return matchMedia('(max-width:1060px)').matches}catch(e){return false}};
/* Selecting in a list pins, like a click on the tree, and remembers it came from a list, so the row opens in place; the row keeps
   focus across the repaint. */
function gbOlPin(k){gw.pinned=gw.pinned===k?null:k;gw.pinList=gw.pinned;gw.refocus=k;gw.olShow=gw.pinned;growPaint()}
const gbOlOpen=(key,dflt)=>gw.open&&key in gw.open?gw.open[key]:!!dflt;
function gbOlFold(key,sum,kids,dflt,cls){const open=gbOlOpen(key,dflt);const el=h('details',{class:'gb-olf'+(cls?' '+cls:''),open:open?true:null});
 gwPut(el,h('summary',{'data-ol':'f:'+key,on:{click:e=>{e.preventDefault();(gw.open||(gw.open={}))[key]=!open;gw.refocus='f:'+key;growPaint()}}},h('span',{class:'sm'},sum)),open?kids:null);return el}
/* Pointing at a row lights its leaf and route on the tree, without the tree's card. */
const gbLit2=k=>{if(gw.tree==='grove'&&gw.B)gbHover(k,null)};
/* One row wherever a scenario is listed (the Outline, the Journeys card, the inspector, a phone): its leaf in a column of its
   own, its title, with the route it is sent through on a small line under it, and its chips on one right edge. */
function gbItem(x,attrs,chips){const T=gwVia(x.title);return h(attrs.tag||'button',Object.assign({},attrs,{tag:null}),gbGlyph(x),h('span',{class:'t'},...gwRich(T.title),T.via?h('small',{class:'via'},'via ',...gwCodeText(T.via)):null),h('span',{class:'ld','aria-hidden':'true'}),h('span',{class:'bx'},chips))}
/* A scenario as a row: its leaf, its title, its state; a failure says where it broke under it. Selected in the Outline, or chosen
   in the Journeys card, it opens in place; chosen on the tree, its card is the inspector's. A pruned one is named and struck
   through, with the mode that grows it. A row serving the chosen criterion is highlighted. */
function gbRow(x,inline){const s=gw.state,r=s.run[x.id];const k='s:'+x.id,pin=gw.pinned===k,open=pin&&(!!inline||gw.pinList===k);const hl=!!gw.selCrit&&x.criteria.includes(gw.selCrit);
 if(s.modeBy&&!gwIn(x))return gbItem(x,{tag:'div',class:'gb-ols cut','data-sid':x.id},[h('span',{class:'gw-badge'},gwML(x.mode)+' grows it')]);
 return [gbItem(x,{class:'gb-ols'+(pin?' sel':'')+(hl?' hl':''),'data-sid':x.id,'data-ol':k,'aria-pressed':String(pin),on:{click:()=>gbOlPin(k),mouseenter:()=>gbLit2(k),mouseleave:()=>gbLit2(null)}},
   [x.variants.length?gwMockChip():null,x.by!=='rules'?h('span',{class:'gw-chip agent'},x.by):null,gwBadge(x)]),
  r&&r.st==='fail'&&!open?h('div',{class:'err'},gwBroke(r,180,x.id,1)):null,
  /* a row whose scenario ran opens its run from where it is listed, beside the reason it broke, before it is opened too; every
     row in this mode carries its one next action: Rerun its flow, Run a flow that never ran, or Write the flow it lacks */
  !open&&r&&r.st==='fail'&&gwRan(x)?gwFailActs(x):!open&&(gwRan(x)||gwRowAct(x))?h('div',{class:'gb-hapr'},gwRan(x)?gwHappened(x):null,gwRan(x)?gwDrEntry(x):null,gwRowAct(x)):null,open?gbRowBody(x):null]}
function gwRowAct(x){const s=gw.state,r=s.run[x.id],fl=gwFlowOf(x);if(!s.done||!gwIn(x)||r&&r.st==='run')return null;
 const T=gwPlain(gwVia(x.title).title);
 if(!fl)return h('button',{class:'gw-lnk gb-ract',type:'button','data-testid':'grow-row-write-'+x.id,'aria-label':'Write this flow: '+T,on:{click:e=>{e.stopPropagation();gwDrWrite(x)}}},'Write this flow');
 return h('button',{class:'gw-lnk gb-ract',type:'button','data-testid':'grow-row-rerun-'+x.id,'aria-label':(gwRan(x)?'Rerun: ':'Run: ')+T,disabled:!!ui.running||!!state.compileError,on:{click:e=>{e.stopPropagation();openTab('Run');runNow(fl)}}},gwRan(x)?'Rerun':'Run it')}
/* The step a failure broke at: the verdict's for its first failure, else the step its run says */
function gwStepNo(x){const f=gw.view&&gw.view.verdict&&gw.view.verdict.first;if(f&&f.scenario===x.id&&f.step)return f.step;const D=gwHap(x);return D&&D.steps&&D.steps[D.at]?D.at+1:null}
/* Opened in the Outline, a failure says its step and what the app answered there, from the run the drawer reads */
function gwRowStep(x){const D=gwHap(x),f=gw.view&&gw.view.verdict&&gw.view.verdict.first;if(!D||!D.steps||!D.steps.length)return null;
 const i=f&&f.scenario===x.id&&f.step?f.step-1:D.at,st=D.steps[i];if(!st)return null;
 let a=null;for(let k=i;k>=0&&!a;k--){const q=D.steps[k];if(q.answer&&q.method!=='STANDIN')a=[k,q]}
 return h('div',{class:'gb-rstep','data-testid':'grow-row-step'},a?h('p',{class:'muted'},'The app answered'+(a[0]!==i?' at step '+(a[0]+1):'')+': '+gwCut(String(a[1].answer),160)):null)}
/* A row opened in place: where it broke first, when it broke; then the claim, said as what the run did with it; then its chips. */
function gbRowBody(x){const s=gw.state,r=s.run[x.id];const el=h('div',{class:'gb-olin'});
 const F=r&&r.st==='fail'&&gwRan(x);
 gwPut(el,r&&r.st==='fail'?h('div',{class:'err',style:'margin:0'},gwBroke(r,0,x.id,1)):null,r&&r.st==='fail'?gwRowStep(x):null,F?[gwMore(x),gwEvLine(x),gwFailActs(x)]:(a=>a?h('div',{class:'gb-hapr'},a):null)(gwRowAct(x)),
  x.proves?h('div',{class:'gw-claim'},h('span',{class:'gw-eyebrow'},gwClaim(x)),h('span',{},...gwRich(x.proves))):null,
  h('div',{class:'gw-chips'},h('span',{class:'gw-chip'+(x.mode==='min'?' min':'')},gwML(x.mode)),x.criteria.map(id=>gwCrit(id,x)),x.layers.map(l=>h('span',{class:'gw-chip'},GW.layers[l])),
   /* the row's badge already says "no flow yet"; the body names the flow when there is one, and why one that has a flow is not
      tested yet */
   x.flow?h('span',{class:'gw-chip built',title:'Runs this existing flow'},x.flow):null,
   x.ext.filter(e=>s.ext[e]&&s.ext[e].state!=='proven').map(e=>h('span',{class:'gw-chip agent',title:s.ext[e].path},'agent-written '+s.ext[e].extKind))),
  x.variants.length?gwLanes(x):null,r&&r.st==='not_run'&&gwOpenKey(x)!=='nf'?gwWhyNot(x):null,F?null:(e=>e.some(Boolean)?h('span',{},e):null)([gwHappened(x),gwDrEntry(x)]));return el}
/* A journey as the lists draw it: its number and name as on the tree, where it starts, its state in the tree's words, the path
   it crosses, then its scenarios by what they prove, in the order its pad holds them. What the mode cut is listed by name. */
function gbJourneyBlock(j,n,M,fold){const s=gw.state;const list=M.leaves[j.id]||[];const inm=gbOrd(list.filter(x=>!s.modeBy||gwIn(x))),out=gbByRole(list.filter(x=>s.modeBy&&!gwIn(x)));
 const key='j:'+j.id,pinned=gw.pinned===key,mine=!!gw.pinned&&list.some(x=>gw.pinned==='s:'+x.id);
 const wound=list.map(x=>gbWound(M,j,x)).find(Boolean);const fail=list.some(x=>s.run[x.id]&&s.run[x.id].st==='fail');
 /* a journey the mode cut entirely says so in the page's one phrasing for pruning */
 const toks=s.modeBy&&list.length&&!inm.length?[[gwPruned(list,s.mode),'n']]:gbTok(list,j,s.modeBy?s.mode:null,x=>!s.modeBy||gwIn(x));const inline=!fold;
 const head=[h('span',{class:'no'},String(n)),h('span',{class:'tt','data-testid':'grow-ol-title-'+n},...gwRich(gwJourneyTitle(j)),j.by&&j.by!=='rules'?h('span',{class:'by'},j.by==='spec'?'from the spec':j.by):null),
  h('span',{class:'wh'},gwFacts([gbStarts(j,M)])),
  h('span',{class:'st'},list.length?h('span',{class:'gb-gs'},gbByRole(list).map(gbGlyph)):null,gbToks(toks))];
 const body=h('div',{class:'gb-olx'});
 gwPut(body,gbPathEl(j,wound),!list.length?h('p',{class:'gw-empty'},'Scenarios appear here as they are drafted.'):null,
  gbROLE.map(([p,t])=>{const g=inm.filter(x=>gbPol(x)===p);return g.length?[h('div',{class:'gb-sub'},t),g.map(x=>gbRow(x,inline))]:null}),
  list.length&&!inm.length?h('p',{class:'gw-empty'},'None in '+gbModeName(s.mode)+'.'):null,
  out.length?gbOlFold('cut:'+j.id,gwPruned(out,s.mode),out.map(x=>gbRow(x))):null);
 /* folded under the tree, the failing journey opens by itself; with none failing, the headline (first) one does */
 if(fold){const anyF=M.J.some(q=>(M.leaves[q.id]||[]).some(x=>s.run[x.id]&&s.run[x.id].st==='fail')),open=gbOlOpen(key,pinned||mine||fail||!anyF&&n===1);const el=h('details',{class:'gb-jr'+(fail?' failed':'')+(pinned||mine?' sel':''),open:open?true:null});
  gwPut(el,h('summary',{class:'gb-hd','data-ol':key,on:{click:e=>{e.preventDefault();(gw.open||(gw.open={}))[key]=!open;gw.pinned=!open?key:gw.pinned===key?null:gw.pinned;gw.pinList=gw.pinned===key?key:gw.pinList;gw.refocus=key;growPaint()},mouseenter:()=>gbLit2(key),mouseleave:()=>gbLit2(null)}},head),open?body:null);return el}
 const el=h('section',{class:'gb-olb'+(pinned||mine?' sel':''),'aria-label':'Journey '+n});
 gwPut(el,h('button',{class:'gb-hd','data-ol':key,'aria-pressed':String(pinned),on:{click:()=>gbOlPin(key)}},head),body);return el}
/* Parts checked on their own and the existing flows the change reaches: Max's buds, by part, named even when pruned. The fold
   says how many and which mode grows them: before a choice, the modes that would; after it, whether this one did. */
function gbBudFolds(M){const s=gw.state;const own=[],reg=[];for(const u of s.units)for(const x of (M.buds[u.id]||[]))(x.scenarioKind==='regression'?reg:own).push(x);
 const grows=list=>{const by={};for(const x of list)by[x.mode]=(by[x.mode]||0)+1;const ks=GW.modes.map(m=>m.id).filter(k=>by[k]);
  return ks.length===1?(ks[0]==='max'?'Max only':ks[0]==='std'?'Standard and Max':'every mode'):ks.map(k=>by[k]+' from '+gwML(k)).join(', ')};
 const note=list=>{if(!s.modeBy)return [grows(list)];const inm=list.filter(gwIn),out=list.filter(x=>!gwIn(x));
  return !out.length?['in '+gwML(s.mode)]:!inm.length?[gwPruned(out,s.mode,true)]:[inm.length+' in '+gwML(s.mode),gwPruned(out,s.mode)]};
 /* part by part, each rolled up to one row: the part, its leaves, how many checks, their state in the words a journey's state
    uses (a failure first, in red), and the journeys it is on, by their numbers on the tree. The row opens to the checks; one
    with a failure, or with the pinned check, opens by itself. In the Outline of a grow set to Max the checks are a third of
    what it proves and more, so there the two kinds open by default, each to its rows of parts */
 const order=gw.order||[];const onJ=id=>order.map((jid,i)=>{const j=M.J.find(q=>q.id===jid);return j&&j.units.includes(id)?i+1:0}).filter(Boolean);
 const open=gw.tree==='outline'&&!!s.modeBy&&s.mode==='max';
 const vis=s.modeBy?s.mode:null,inMode=x=>!s.modeBy||gwIn(x),failed=x=>s.run[x.id]&&s.run[x.id].st==='fail';
 /* a root's checks are its calls (or a store's uses), named as such under Roots: "Calls to GitHub · 3 checks" */
 const part=(key,id,list)=>{const u=M.U[id]||{};const on=onJ(id);
  const where=u.root?gbFeeds(on):on.length?'on journey'+(on.length===1?' ':'s ')+gbAnd(on):'on no journey';
  const sum=[u.root?h('b',{class:'pn rn'},gwRootW(u)[3]+u.label):h('b',{class:'pn'},...gwCodeText(gwPlain(u.label||id))),h('span',{class:'gb-gs'},gbByRole(list).map(gbGlyph)),
   gwFacts([...(u.root?[list.length+' check'+(list.length===1?'':'s')]:gwOwnWords(list)),...gbTok(list,{surface:'',units:[]},vis,inMode).map(t=>h('span',{class:t[1]},t[0])),[where.charAt(0).toLowerCase()+where.slice(1)]])];
  return gbOlFold('bp:'+key+':'+id,sum,h('div',{class:'gb-bpl'},list.flatMap(x=>gbRow(x,gw.tree==='outline'))),gw.tree==='outline'||list.some(failed)||list.some(x=>gw.pinned==='s:'+x.id),'gb-bpf')};
 /* the parts' rows line up as a table: the names in one column as wide as the longest (to a limit, past which a name wraps after
    a slash), the leaves in one as wide as the most any part has, then the counts and journeys, all starting on the same edges;
    the part checks and the existing flows share those edges, so the two folds read as one table */
 const isR=id=>!!(M.U[id]||{}).root,ids=list=>[...new Set(list.map(x=>x.unit))],most=list=>ids(list).map(id=>list.filter(x=>x.unit===id).length);
 const nw=Math.min(22,Math.max(8,...ids(own.concat(reg)).filter(id=>!isR(id)).map(id=>gwPlain((M.U[id]||{}).label||id).length))),lw=Math.min(8,Math.max(1,...most(own),...most(reg)));
 /* the parts first; a dependency's checks after them, under Roots, never among the parts */
 const fold=(key,what,list)=>{if(!list.length)return null;const row=id=>part(key,id,list.filter(x=>x.unit===id)),pi=ids(list).filter(id=>!isR(id)),ri=ids(list).filter(isR);
  return gbOlFold(key,gwFacts([what(list.length),...note(list).map(t=>[t])]),h('div',{class:'gb-olx gb-bpx',style:'--bpn:'+(nw+1)+'ch;--bpl:'+(lw*16-3)+'px'},pi.map(row),ri.length?[h('div',{class:'gb-sub'},'Roots'),...ri.map(row)]:null),open)};
 return [fold('own',n=>gwKW('own',n),own),fold('reg',n=>gwKW('reg',n)+' the change reaches',reg)]}
/* A section of the Outline: a plain heading over a rule, what it holds after it in grey. Mono capitals are left to the groups
   inside a section. */
const gbSec=(t,more)=>h('h3',{class:'gb-olh'},t,more?h('span',{class:'sm'},' · '+more):null);
/* Journey numbers as words: "1", "1 and 2", "1, 2 and 3". */
const gbAnd=xs=>xs.length<2?String(xs.length?xs[0]:''):xs.slice(0,-1).join(', ')+' and '+xs[xs.length-1];
/* Which journeys a root feeds, in one phrasing wherever it is said (the Outline, the inspector, the tree's card), from the
   journeys' numbers on the tree, in their order: "Feeds journeys 1 and 2", "Feeds journey 1"; a root that feeds none is the
   tree's unused one: "Unused: feeds no journey". */
function gbFeeds(nums){const n=[...new Set((nums||[]).filter(Boolean))].sort((a,b)=>a-b);return n.length?'Feeds journey'+(n.length===1?' ':'s ')+gbAnd(n):'Unused: feeds no journey'}
/* What the change depends on, as the tree plants it: services over the rim, the repo's own stores in the soil; each says which
   journeys feed from it, and where tracing could not follow. */
function gbOlRoots(M,order){const s=gw.state;const roots=s.units.filter(u=>u.root);
 /* a root's row draws it as the legend does, says which journeys it feeds and, in full, where tracing could not follow (the file
    and line once: when the row already names them, the note does not); selected, its card opens under it. A store no journey
    uses is named as its tag in the pot names it: "seats table · unused" */
 const row=u=>{const k='u:'+u.id,pin=gw.pinned===k;const feeds=order.map((j,i)=>j.units.includes(u.id)?i+1:0).filter(Boolean);const stop=s.stops.find(x=>x.unit===u.id);const at=stop&&stop.at&&stop.at!==u.loc?stop.at:null;
  return [h('button',{class:'gb-olr'+(pin?' sel':''),'data-ol':k,'aria-pressed':String(pin),on:{click:()=>gbOlPin(k)}},h('span',{class:'gw-g','aria-hidden':'true'},u.layer==='ext'?gwSw('ext'):feeds.length?gwSw('root'):gwSw('unused')||gwSw('root')),
   h('span',{class:'t'},u.label,feeds.length||u.layer==='ext'?null:h('span',{class:'un'},' · unused'),h('small',{},gwFacts([u.unitKind,[gwRef(u.loc)]])),(M.buds[u.id]||[]).length?h('span',{class:'rc'},gwFacts(gwRootFacts(u,M.buds[u.id]))):null),h('span',{class:'ld','aria-hidden':'true'}),h('span',{class:'fd'},feeds.length||u.layer==='ext'?gbFeeds(feeds):'Feeds no journey'),
   stop?h('span',{class:'gw-stop'},h('b',{},'trace stops'),' · '+stop.why,at?[' ',h('span',{class:'gw-loc gw-ref'},...gwCodeText(at))]:null):null),
   pin?h('div',{class:'gw-olcard'},gwPartCard(u.id,true)):null]};
 const svc=roots.filter(u=>u.layer==='ext'),soil=roots.filter(u=>u.layer!=='ext');
 return [gbSec('Roots','what it depends on'),!roots.length?h('p',{class:'gw-empty',style:'margin:0 6px'},'None traced: the change depends on nothing outside its own files.'):null,
  svc.length?[h('div',{class:'gb-sub'},'Over the rim · services it calls'),svc.map(row)]:null,soil.length?[h('div',{class:'gb-sub'},'In the soil · stores in this repository'),soil.map(row)]:null]}
/* Every changed part, folded: how deep tracing went (found, not "checked"), how each layer is proved, the spec it answers, the
   journeys that cross it, and the gap that makes it worth a look. Selecting a journey or a scenario lights the parts it crosses,
   and so does choosing a criterion in the spec. */
function gbOlParts(M,order){const s=gw.state,v=gw.view;const parts=s.units.filter(u=>!u.root);if(!parts.length)return null;
 const failed=x=>s.run[x.id]&&s.run[x.id].st==='fail';
 const gaps=u=>{const w=[];const d=v.depth[u.id]||{pips:[]};if(d.pips.includes('stop'))w.push('trace stops');
  const ind=(s.cells[u.id]||[]).filter(c=>c.status!=='built');if(ind.length)w.push(ind.map(c=>GW.layers[c.layer]).join(', ')+' proved only indirectly');
  if(M.J.some(j=>j.units.includes(u.id)&&M.leaves[j.id].some(failed))||(M.buds[u.id]||[]).some(failed))w.push('a scenario through it failed');
  if(s.drift.some(x=>x.unit===u.id))w.push('not in the spec');if(s.depth[u.id]&&s.depth[u.id].tests&&s.depth[u.id].tests.status==='none')w.push('no tests of its own');return w};
 const all=parts.map(u=>({u,w:gaps(u)})),gn=all.filter(o=>o.w.length).length;const rows=all.filter(o=>!gw.onlyGaps||o.w.length);
 const lit=new Set(),p=gw.pinned||'';if(p.startsWith('u:'))lit.add(p.slice(2));else if(p.startsWith('j:')||p.startsWith('s:')){const j=p.startsWith('j:')?M.J.find(q=>q.id===p.slice(2)):M.J.find(q=>M.leaves[q.id].some(x=>x.id===p.slice(2)));if(j)for(const id of j.units)lit.add(id)}else if(s.focus)lit.add(s.focus);
 const sc=gw.selCrit&&v.criteria.find(c=>c.id===gw.selCrit);if(sc)for(const id of sc.units)lit.add(id);
 const tr=({u,w})=>{const d=v.depth[u.id]||{pips:[]};const f=d.pips.filter(q=>q==='ok').length;const crit=v.criteria.filter(c=>c.units.includes(u.id)).map(c=>c.id);const on=order.map((j,i)=>j.units.includes(u.id)?i+1:0).filter(Boolean);const k='u:'+u.id;
  /* a selected part opens its card in a row of its own under it */
  return [h('tr',{class:'u'+(lit.has(u.id)?' sel':''),tabindex:0,'data-ol':k,'data-unit':u.id,'aria-selected':String(gw.pinned===k),on:{click:()=>gbOlPin(k),keydown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();gbOlPin(k)}}}},
   h('td',{},h('div',{class:'nm'},...gwCodeText(u.label)),h('div',{class:'loc'},gwFacts([u.unitKind,[gwRef(u.loc)]])),w.length?h('div',{class:'gw-chips',style:'margin-top:4px'},w.slice(0,2).map(t=>h('span',{class:'gw-chip missing'},t))):null),
   h('td',{'data-h':'Depth'},h('span',{class:'gw-pips','aria-label':f+' of 5 found'},d.pips.map(q=>h('i',{class:q}))),h('div',{class:'loc'},f+' of 5 found'+(d.pips.includes('stop')?' · stopped':''))),
   h('td',{'data-h':'Layers'},h('div',{class:'gw-chips'},(s.cells[u.id]||[]).map(c=>h('span',{class:'gw-chip '+c.status,title:c.reason},GW.layers[c.layer])))),
   h('td',{'data-h':'Spec',class:'loc'},crit.length?crit.join(' '):s.drift.some(x=>x.unit===u.id)?'not in spec':'—'),
   h('td',{'data-h':'Journeys',class:'loc'},on.length?on.join(', '):'none')),
   gw.pinned===k?h('tr',{class:'det'},h('td',{colspan:5},h('div',{class:'gw-olcard'},gwPartCard(u.id,true)))):null]};
 const table=h('div',{class:'scroll'},h('table',{class:'gw-ol'},h('thead',{},h('tr',{},['Part','Depth','Layers','Spec','Journeys'].map(t=>h('th',{},t)))),h('tbody',{},rows.length?rows.flatMap(tr):h('tr',{},h('td',{colspan:5,class:'gw-empty'},'Nothing here needs a look.')))));
 const ctl=gn&&gn<all.length?h('label',{class:'small muted',style:'display:inline-flex;gap:6px;align-items:center;margin:2px 6px 6px'},h('input',{type:'checkbox',checked:gw.onlyGaps,on:{change:e=>{gw.onlyGaps=e.target.checked;growPaint()}}}),'Only the '+gn+' that need'+(gn===1?'s':'')+' a look'):null;
 const pk=(c,t)=>h('span',{},h('span',{class:'gw-pips'},h('i',{class:c})),' '+t);
 /* the parts are a section of the Outline, folded: its heading is the fold */
 return gbOlFold('parts',h('span',{},'Parts',h('span',{class:'more'},' · '+parts.length+' changed'+(gn?' · '+gn+' need'+(gn===1?'s':'')+' a look':''))),[ctl,table,h('div',{class:'gb-pk'},pk('ok','found'),pk('none','looked, nothing there'),pk('stop','trace stops'),pk('','not looked yet'))],false,'gb-olsec')}
/* Up and down move through the rows; Escape lets go of what is pinned. */
function gbOlKeys(e){const all=[...e.currentTarget.querySelectorAll('[data-ol]')].filter(el=>el.offsetParent!==null);const i=all.indexOf(document.activeElement);
 if((e.key==='ArrowDown'||e.key==='ArrowUp')&&i>=0){const n=all[Math.max(0,Math.min(all.length-1,i+(e.key==='ArrowDown'?1:-1)))];n.focus();e.preventDefault()}
 else if(e.key==='Escape'&&gw.pinned){gw.refocus=i>=0?all[i].getAttribute('data-ol'):null;gw.pinned=null;gw.pinList=null;if(gw.B)gbHover(null);growPaint();e.preventDefault()}}
function gbOrderOf(M){return gw.order&&gw.order.length?gw.order.map(id=>M.J.find(j=>j.id===id)).filter(Boolean):gbOrder(M)}
/* The Outline: the tree as a list, in sections: the journeys, the parts checked on their own, what the change depends on, then
   every part, folded. */
function gbOutline(){const s=gw.state;const M=gw.M=gbModel();const order=gbOrderOf(M);gw.order=order.map(j=>j.id);
 /* what is pinned is never hidden in a closed fold: its fold opens once, when the pin changes */
 if(gw.olPin!==gw.pinned){gw.olPin=gw.pinned;const p=gw.pinned||'',O=gw.open||(gw.open={});
  if(p.startsWith('u:')){const u=M.U[p.slice(2)];if(u&&!u.root)O.parts=true}
  else if(p.startsWith('s:')){const x=s.scenarios.find(q=>q.id===p.slice(2));const j=x&&M.J.find(q=>M.leaves[q.id].includes(x));if(x&&!j){const kk=x.scenarioKind==='regression'?'reg':'own';O[kk]=true;O['bp:'+kk+':'+x.unit]=true}else if(x&&s.modeBy&&!gwIn(x))O['cut:'+j.id]=true}}
 const el=h('div',{class:'gb-ol','data-testid':'grow-outline',on:{keydown:gbOlKeys}});const lf=(c,t)=>h('span',{class:'gw-li'},gwSw(c),h('span',{},t));
 const buds=gbBudFolds(M);
 gwPut(el,M.legacy?h('p',{class:'small muted'},'Saved before journeys were traced: one journey per surface. Grow again to trace journeys.'):null,
  gwOlPromises(),order.length?gbSec('Journeys',String(order.length)):h('p',{class:'gw-empty',style:'margin:6px'},s.units.length?'Journeys appear here as they are traced.':'Parts appear here as they are found.'),
  /* what each leaf means, in one line under the heading, before the first leaf it explains */
  order.length&&s.scenarios.length?h('div',{class:'gb-olkey',role:'group','aria-label':'What each leaf means'},lf('pass','passed'),lf('fail','failed'),lf('run','running'),lf('in',gwInKey()),lf('none','no flow yet'),s.modeBy&&s.scenarios.some(x=>!gwIn(x))?lf('cut','pruned, named under its journey'):null):null,
  order.map((j,i)=>gbJourneyBlock(j,i+1,M,false)),
  M.jin.length?h('p',{class:'gb-loose'},'Changed, on no journey: '+M.jin.map(u=>u.label).join(', ')+'. Max checks '+(M.jin.length===1?'it':'them')+' on '+(M.jin.length===1?'its':'their')+' own.'):null,
  buds[0]||buds[1]?[gbSec(gwOwnHead(s.units.flatMap(u=>M.buds[u.id]||[]))),buds]:null,gbOlRoots(M,order),gbOlParts(M,order),
  s.scenarios.some(x=>x.variants.length)?gwMockNote():null);
 return el}
/* Under the tree: the same journeys, folded, a failing or selected one open. It is the one list of scenarios: the inspector beside
   the tree says only what this does not. */
function gbJourneys(){const s=gw.state,M=gw.M||gbModel();const card=h('section',{class:'card gw-jcard','aria-label':'Journeys','data-testid':'grow-scenarios'});const order=gbOrderOf(M);
 gwPut(card,h('div',{class:'row',style:'justify-content:space-between;margin-bottom:6px'},h('span',{class:'gw-eyebrow',style:'margin:0'},'Journeys · '+M.J.length),
  h('span',{class:'small muted'},!s.scenarios.length?'Drafted after tracing':s.modeBy?gwFacts([s.scenarios.filter(gwIn).length+' scenarios in '+gbModeName(s.mode),s.scenarios.length+' drafted',gwOpenRunsBtn()]):gwFacts([s.scenarios.length+' drafted',s.scenarios.filter(gwIn).length+' in Minimum']))),
  M.legacy?h('p',{class:'small muted'},'Saved before journeys were traced: one journey per surface, links between parts not recorded. Grow again to trace journeys.'):null,
  order.map((j,i)=>gbJourneyBlock(j,i+1,M,true)),gbBudFolds(M),
  M.jin.length?h('p',{class:'gb-loose'},'Changed, on no journey: '+M.jin.map(u=>u.label).join(', ')+'. Nothing in this change reaches '+(M.jin.length===1?'it':'them')+'; Max checks '+(M.jin.length===1?'it':'them')+' on '+(M.jin.length===1?'its':'their')+' own.'):null,
  s.scenarios.some(x=>x.variants.length)?gwMockNote():null);
 return card}
`;
