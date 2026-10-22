/**
 * The bonsai the Discover tab draws for a grown change. Its shape comes from the change's end-to-end
 * journeys, not its files: a branch per journey, a leaf per scenario, files as knots in the wood, the
 * repository as the pot, and what the change depends on as roots in its soil.
 *
 * The wood is one material. The trunk is the change, so every journey grows from it, even one that shares
 * no code with the others. The journey with the most scenarios is the lowest, longest branch and the one with
 * the fewest is the apex, so the silhouette tapers like an informal upright (branches on the outside of
 * curves, alternating, the apex leaning back over the roots). A change with one journey grows that journey's
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
.gw-svg.gb{display:block;width:100%;height:auto;overflow:visible;-webkit-tap-highlight-color:transparent;
 --wood:#6E5E50;--wood-lit:#8F7D6B;--wood-shade:#4C4037;--wood-old:color-mix(in srgb,#6E5E50 68%,var(--muted));--knot:#57493E;--knot-lit:#9C8975;--cut:#DCC8A6;--cutc:color-mix(in srgb,var(--ink3) 82%,var(--paper));--shoot:color-mix(in srgb,#9BBF5A 82%,var(--wood));
 --pad:color-mix(in srgb,var(--moss) 44%,var(--paper));--pad-lit:color-mix(in srgb,var(--moss) 30%,var(--paper));--pad-shade:color-mix(in srgb,var(--moss) 70%,var(--paper));
 --pad-dim:color-mix(in srgb,var(--moss) 16%,var(--paper));--pad-back:color-mix(in srgb,var(--moss) 34%,var(--paper));--pad-edge:color-mix(in srgb,var(--moss) 62%,var(--paper));
 --pot:color-mix(in srgb,var(--ochre) 26%,var(--line2));--pot-rim:color-mix(in srgb,var(--ochre) 34%,var(--ink3));--pot-ft:color-mix(in srgb,var(--pot) 72%,#3A2A20);--pot-lit:color-mix(in srgb,var(--pot) 78%,#fff);--pot-dk:color-mix(in srgb,var(--pot) 80%,#3A2A20);--soil-c:color-mix(in srgb,#6B4A32 72%,var(--soil));--soil-lit:color-mix(in srgb,#8A6A4C 60%,var(--soil));--pebble:color-mix(in srgb,var(--line2) 70%,var(--paper));--rt-cut:var(--wood);--rt-ext:var(--wood);--stake:#B09676;--moss-rim:color-mix(in srgb,var(--pad) 55%,var(--pad-lit))}
@media (prefers-color-scheme:dark){.gw-svg.gb{--wood:#6E5F50;--wood-lit:#8A7864;--wood-shade:#4A3F35;--wood-old:#5E574E;--knot:#4E4238;--knot-lit:#93826E;--cut:#B9A684;--cutc:color-mix(in srgb,var(--ink3) 82%,var(--paper));--shoot:#A9CF72;
 --pad:color-mix(in srgb,var(--moss) 50%,var(--paper));--pad-lit:color-mix(in srgb,var(--moss) 66%,var(--paper));--pad-shade:color-mix(in srgb,var(--moss) 30%,var(--paper));
 --pad-dim:color-mix(in srgb,var(--moss) 22%,var(--paper));--pad-back:color-mix(in srgb,var(--moss) 40%,var(--paper));--pad-edge:color-mix(in srgb,var(--moss) 38%,var(--paper));
 --pot:color-mix(in srgb,var(--ochre) 30%,#6A584B);--pot-rim:color-mix(in srgb,var(--ochre) 40%,var(--ink3));--pot-ft:color-mix(in srgb,var(--pot) 72%,#000);--pot-lit:color-mix(in srgb,var(--pot) 80%,#fff);--pot-dk:color-mix(in srgb,var(--pot) 78%,#000);--soil-c:#3B2F27;--soil-lit:#46382D;--pebble:color-mix(in srgb,var(--line2) 80%,var(--ink3));--rt-cut:#8C7A66;--rt-ext:#968470;--stake:#9A8468;--moss-rim:#7FA36F}}
.gb .w{fill:var(--wood)}.gb .w.old{fill:var(--wood-old)}.gb .lt{fill:var(--wood-lit)}.gb .sh{fill:var(--wood-shade)}
.gb .grain{fill:none;stroke:var(--wood-shade);stroke-width:.8;stroke-linecap:round;opacity:.32}
.gb .jin{fill:var(--paper);stroke:var(--wood-old);stroke-width:.9;stroke-linejoin:round}
.gb .vein{display:none;fill:none}.gb .vein.live{display:inline;stroke:var(--gold);stroke-width:1.4;stroke-linecap:round;stroke-dasharray:3 5;animation:gbflow 1s linear infinite}
@keyframes gbflow{to{stroke-dashoffset:-16}}
.gb .kn .k0{fill:var(--wood-shade);opacity:.5}.gb .kn .k1{fill:var(--wood)}.gb .kn .k2{fill:var(--wood-lit);opacity:.75;filter:blur(.5px)}.gb .kn .kc{fill:none;stroke:var(--wood-shade);stroke-width:.8;stroke-linecap:round;opacity:.85}.gb .kn .kg{fill:none;stroke:var(--wood-shade);stroke-width:.8;stroke-linecap:round;opacity:.4}
.gb .kn .ring{fill:none;stroke:var(--ink);stroke-width:1;opacity:0;transition:opacity .2s}
/* a lit knot glows from inside the bark; no annotation ring is drawn on the wood */
.gb .kn .halo{fill:var(--gold);opacity:0;filter:blur(1.5px);transition:opacity .2s}.gb .kn.on .halo,.gb .kn:hover .halo{opacity:.6}.gb .kn.trace .halo{opacity:.8}
.gb .kn .crack{display:none;fill:none;stroke:var(--verm);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.gb .kn.wound:not(.wmute) .crack{display:inline}.gb .kn.wound:not(.wmute) .halo{opacity:.5;fill:var(--verm)}.gb .kn.wound.on:not(.wmute) .halo{opacity:.7}
.gb .klbl{font:500 10px var(--mono);fill:var(--ink2);paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round;opacity:0;transition:opacity .2s;pointer-events:none}.gb .klbl.on{opacity:1}.gb .klbl.wound:not(.wmute){opacity:1;fill:var(--verm-ink)}.gb .klbl.brk:not(.wmute){opacity:1;fill:var(--ink)}.gb .kld{fill:none;stroke:var(--ink3);stroke-width:.8;opacity:0;transition:opacity .2s;pointer-events:none}.gb .klbl.on+.kld,.gb .klbl.wound:not(.wmute)+.kld,.gb .klbl.brk:not(.wmute)+.kld{opacity:.8}
.gb .vein,.gb .tw,.gb .sap,.gb .leader,.gb .grain{pointer-events:none}.gb .hitc{fill:transparent;stroke:none}.gb .hitl{fill:none;stroke:transparent;stroke-linecap:round}
.gb [data-k]{cursor:pointer;outline:none}
.gb .kn:focus-visible .ring{opacity:1;stroke:var(--ink)}.gb .rt:focus-visible .rring{opacity:1;stroke:var(--ink);stroke-width:3}.gw-svg.gb:focus{outline:none}.gb .filsh{fill:color-mix(in srgb,var(--wood) 55%,#000);opacity:.3;filter:blur(1px)}
.gb-lf:focus-visible .blade{stroke:var(--ink);stroke-width:2}.gb-lf:focus-visible .hitc{stroke:var(--ink);stroke-width:1.1;stroke-dasharray:2 2}
.gb .pfill,.gb .pband,.gb .pghost{transition:d .5s ease,fill .25s}.gb .pfill{stroke:var(--pad-edge);stroke-width:.8;stroke-linejoin:round}
.gb .pband{fill:var(--pad-shade);opacity:.55;pointer-events:none}.gb .pcrest{pointer-events:none;transition:d .5s ease}.gb .pwd{fill:var(--wood);opacity:.55;pointer-events:none}.gb .pclu{pointer-events:none}.gb .pcl{fill:var(--pad-lit);opacity:.5}.gb .pcs{fill:none;stroke:var(--pad-shade);stroke-width:1.4;stroke-linecap:round;opacity:.6}.gb .ptex,.gb .prim{pointer-events:none;transition:d .5s ease}.gb .ptex{opacity:.5}.gb .ptex .sts{fill:var(--pad-shade)}.gb .ptex .stl,.gb .stl{fill:var(--pad-lit)}.gb .sts{fill:var(--pad-shade)}.gb .prim{fill:none;stroke:var(--pad-lit);stroke-width:1.6;stroke-linecap:butt;stroke-linejoin:round;opacity:.9}
.gb.dim .jg:not(.hl) .ptex,.gb.dim .jg:not(.hl) .prim,.gb .jg.pv-cut .ptex,.gb .jg.pv-cut .prim,.gb .jg.crown.pruned .ptex,.gb .jg.crown.pruned .prim{opacity:.2}.gb .pad.bare .ptex,.gb .pad.bare .prim{display:none}
.gb .pghost{fill:none;stroke:none}.gb .pad.pv-grow .pghost{fill:var(--pad);fill-opacity:.32;stroke:var(--moss);stroke-width:1;stroke-dasharray:3 3}
.gb .pad:focus-visible .pfill{stroke:var(--ink);stroke-width:1.5}.gb .pad.back .pfill{fill:var(--pad-back)}
.gb .pad .bud0{display:none;fill:var(--pad-shade);stroke:var(--moss);stroke-width:.8}.gb .pad.bare .bud0{display:inline}.gb .pad.bare .pfill,.gb .pad.bare .pband{display:none}
.gb .jg.pruned{display:none}.gb .jg.crown.pruned{display:inline}.gb .jg.crown.pruned .pfill,.gb .jg.pv-cut .pfill{fill:var(--pad-dim)}.gb .jg.crown.pruned .pband,.gb .jg.pv-cut .pband{opacity:.15}.gb .jg.pv-cut .brg,.gb .jg.pv-cut .tw{opacity:.55}
.gb .jg.pruned.pv-back{display:inline}.gb .jg.pruned.pv-back .pfill{fill:var(--pad-dim)}.gb .jg.pruned.pv-back .brg,.gb .jg.pruned.pv-back .tw{opacity:.55}
/* dimming never thins the wood or makes foliage see-through: what is not lit turns pale, opaque, so nothing shows through a pad */
.gb.dim .jg:not(.hl) .pfill{fill:var(--pad-dim)}.gb.dim .jg:not(.hl) .pband{opacity:.15}.gb.dim .jg:not(.hl) .gb-lf{opacity:.32}.gb.dim .kn:not(.on):is(:not(.wound),.wmute){opacity:.55}.gb.lfdim .jg.hl .gb-lf:not(.hl):not(.sel){opacity:.45}
.gb .stub{display:none}.gb .stub.on{display:inline}.gb .stub .sw{fill:var(--wood)}.gb .cutf{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.7}.gb .mlbl{font:600 10.5px var(--mono);fill:var(--muted)}
.gb .cutmk{display:none;fill:none;stroke:var(--cutc);stroke-width:1.6;stroke-dasharray:3 2.5;stroke-linecap:round}.gb .cuttag{display:none;font:600 10.5px var(--mono);fill:var(--cutc)}.gb .cutmk.on,.gb .cuttag.on{display:inline}
.gb .tw{fill:var(--wood)}.gb .tw.shoot{fill:var(--shoot)}.gb .bud .bpet{fill:none;stroke:var(--shoot);stroke-width:.9;stroke-linecap:round}.gb .budg .cutk{display:none;fill:none;stroke:var(--cutc);stroke-width:1.3;stroke-linecap:round}
/* a shoot a mode would cut is grey with the tick across its foot; one it would add is a ghost, stem and all */
.gb .budg.pre>.tw.shoot,.gb .budg.pv-out>.tw.shoot{fill:color-mix(in srgb,var(--ink3) 40%,var(--paper))}.gb .budg.pre>path.tipbud,.gb .budg.pv-out>path.tipbud{fill:var(--paper);stroke:color-mix(in srgb,var(--ink3) 50%,var(--paper))}.gb .budg.pre .bpet,.gb .budg.pv-out .bpet{stroke:color-mix(in srgb,var(--ink3) 50%,var(--paper))}
.gb .budg.pre .cutk,.gb .budg.pv-out .cutk{display:inline}.gb .budg.snap .cutk{display:inline;stroke:var(--ink);animation:gbtick .5s ease-out both}.gb .budg.pv-add{opacity:.45}.gb path.tipbud{fill:var(--moss-bg);stroke:var(--moss);stroke-width:.8}.gb .tw.old{fill:var(--wood-old)}
.gb .tipbud path{fill:var(--moss-bg);stroke:var(--moss);stroke-width:1}.gb .shn{font:500 9.5px var(--mono);fill:var(--ink3)}.gb .budg.pre .shn,.gb .budg.pv-out .shn{opacity:.5}
.gb-lf{transition:transform .45s cubic-bezier(.2,.7,.2,1),opacity .3s}
.gb-lf .blade{stroke-width:.9;stroke-linejoin:round;transition:fill .35s,stroke .35s}
.gb-lf .rib{fill:none;stroke:var(--paper);stroke-width:.8;opacity:.7}.gb-lf .halo{fill:var(--paper);opacity:.92}.gb-lf.none .halo,.gb-lf.idle .halo,.gb-lf.pv-add .halo{opacity:0}.gb-lf.pre .halo,.gb-lf.pv-out .halo{opacity:.55}.gb-lf.fail .halo{fill:color-mix(in srgb,var(--verm) 24%,var(--paper));opacity:1}
.gb-lf .bb,.gb-lf .nec{display:none}.gb-lf.fail .bb,.gb-lf.fail .nec{display:inline}.gb-lf.fail .bn{display:none}.gb-lf .nec{fill:none;stroke:#6B3A1E;stroke-width:1.3;stroke-linecap:round}
.gb-lf .pet{fill:none;stroke:color-mix(in srgb,var(--wood) 70%,var(--moss));stroke-width:1.1;stroke-linecap:round}.gb-lf.hang .pet{stroke:var(--wood);stroke-width:1.3}
.gb-lf .stem0{display:none}.gb-lf.gone .stem0{display:inline}.gb-lf .stem0 .hits{fill:transparent;stroke:none}.gb .scar{display:none;cursor:pointer}.gb .scar.on{display:inline}.gb .scar .sw{fill:var(--wood);stroke:var(--wood-shade);stroke-width:.5}.gb .scar .cutf{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.5}.gb.dim .jg:not(.hl) .scar,.gb.lfdim .jg.hl .scar{opacity:.4}.gb-lf .stem0 path{fill:none;stroke:var(--wood);stroke-width:1.8;stroke-linecap:butt}.gb-lf .stem0 .cap{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.5}.gb-lf .nick{display:none;fill:none;stroke:var(--cutc);stroke-width:1.3;stroke-linecap:round}
.gb-lf.in .blade{fill:var(--moss-bg);stroke:var(--moss)}
.gb-lf.pass .blade{fill:var(--moss);stroke:color-mix(in srgb,var(--moss) 70%,#000)}.gb-lf.pass.warn .blade{stroke:var(--gold);stroke-width:1.6}
.gb-lf.fail .blade{fill:var(--verm);stroke:color-mix(in srgb,var(--verm) 45%,#000);stroke-width:1.1}
.gb-lf.run .blade{fill:var(--gold);stroke:var(--gold)}.gb-lf.run .gb-lfi{animation:gbpulse 1s ease-in-out infinite}
.gb-lf.idle .blade{fill:var(--paper);stroke:var(--moss);stroke-width:1.2}
.gb-lf.none .blade{fill:color-mix(in srgb,var(--paper) 70%,transparent);stroke:var(--moss);stroke-width:1.2;stroke-dasharray:2.4 1.6}
.gb-lf.pre .blade{fill:var(--paper);stroke:var(--line2)}
.gb-lf.in .rib,.gb-lf.idle .rib,.gb-lf.none .rib,.gb-lf.pre .rib{stroke:var(--moss);opacity:.3}
/* on a dark page a passed leaf is the bright solid one, so a leaf still to prove is an outline in the pad's own tone: not
   pale like a passed leaf, and not a dark hole in the pad */
@media (prefers-color-scheme:dark){.gb-lf.idle .blade,.gb-lf.none .blade{fill:transparent;stroke:color-mix(in srgb,var(--moss) 70%,#fff);stroke-width:1.2}.gb-lf.pre .blade{fill:var(--paper);stroke:var(--ink3)}.gb .ptex{opacity:.3}.gb .lip-hi{opacity:.6}
 .gb-lf.idle .rib,.gb-lf.none .rib{opacity:.5}}
.gb-lf .gb-lfi{transform-box:fill-box;transform-origin:center}
/* one preview grammar: what the mode keeps stays as it is, what it cuts fades in place with a nick at its stalk, what it
   adds appears as a dashed ghost */
.gb-lf.pv-out .blade,.gb-lf.pre .blade{fill:color-mix(in srgb,var(--ink3) 30%,var(--paper));stroke:color-mix(in srgb,var(--ink3) 50%,var(--paper));stroke-dasharray:none;stroke-width:.8}.gb-lf.pv-out .rib,.gb-lf.pre .rib{opacity:0}
.gb-lf.pv-out .bb,.gb-lf.pre .bb,.gb-lf.pv-out .nec,.gb-lf.pre .nec{display:none}.gb-lf.pv-out .bn,.gb-lf.pre .bn{display:inline}.gb-lf.pv-out .nick,.gb-lf.pre .nick{display:inline}
.gb-lf.pv-add .blade{fill:var(--moss);fill-opacity:.35;stroke:none}.gb-lf.pv-add .rib{opacity:0}
.gb-lf.cut .gb-lfi{animation:gbfall .9s cubic-bezier(.45,0,.9,.5) both}.gb-lf.cut .nick{display:inline;stroke:var(--ink);animation:gbtick .5s ease-out both}.gb-lf.gone .gb-lfi{display:none}.gb-lf.gone .hitc{display:none}.gb-lf.bud.gone{display:none}
.gb-lf.hl .gb-lfi,.gb-lf.sel .gb-lfi{filter:drop-shadow(0 0 1.8px var(--gold)) drop-shadow(0 0 .6px var(--gold))}.gb-lf.hl .blade{stroke-width:1.4}.gb-lf.sel .hitc{stroke:var(--gold);stroke-width:1.5;stroke-opacity:.6}
.gb .bud .blade{stroke-width:1}.gb .bud.none .blade{stroke-dasharray:1.6 1.2}
.gb .bmore{font:600 9.5px var(--mono);fill:var(--muted)}
@keyframes gbfall{0%{opacity:1;transform:none}24%{opacity:1;transform:rotate(calc(var(--fr,24deg)*1.3))}70%{opacity:.9}to{transform:translate(var(--fx,6px),var(--fy,110px)) rotate(calc(var(--fr,24deg)*2));opacity:0}}
@keyframes gbtick{0%{opacity:0}20%{opacity:1}75%{opacity:1}to{opacity:0}}
/* the snip: two blades closing at the cut, gone in a moment */
.gb .snip{fill:none;stroke:var(--ink);stroke-width:1.2;stroke-linecap:round;pointer-events:none;animation:gbsnip .32s ease-out both}@keyframes gbsnip{0%{opacity:0;transform:scale(1.6)}25%{opacity:1;transform:scale(1)}to{opacity:0}}
@keyframes gbpulse{50%{transform:scale(1.2)}}
.gb.dim .bud:not(.hl),.gb.dim .lbl:not(.hl),.gb.dim .bmore{opacity:.3}
/* a previewed mode's ghosts are not part of what is pinned: they stay readable over the dimming */
.gb.dim .gb-lf.bud.pv-add,.gb.dim .jg:not(.hl) .gb-lf.pv-add{opacity:1}.gb .shscar{fill:color-mix(in srgb,var(--wood-lit) 70%,var(--cut));stroke:var(--wood-shade);stroke-width:.6;pointer-events:none}
/* one cut mark everywhere, asked, previewed or being pruned: a tick in neutral ink, never red (red is failed and broken) */
.gb-lf.cut .nick,.gb .budg.snap .cutk{stroke:var(--cutc)}
.gb .shscar .cal{fill:color-mix(in srgb,var(--wood-lit) 80%,#fff);stroke:var(--wood-shade);stroke-width:.5}.gb .shscar .face{fill:var(--cut);stroke:color-mix(in srgb,var(--wood-shade) 60%,transparent);stroke-width:.4}
/* a failed leaf: no pale lining in its bite, a dark outline and a dark midrib */
.gb-lf.fail:not(.pv-out):not(.pv-add) .halo{opacity:0}.gb-lf.fail:not(.pv-out):not(.pv-add) .blade{stroke:#5a1a14;stroke-width:1}.gb-lf.fail:not(.pv-out):not(.pv-add) .rib{stroke:#5a1a14;opacity:1;stroke-width:.9}
/* to prove: a solid outline over a pale fill, with its midrib; no flow yet: a dashed outline round nothing */
.gb-lf.in:not(.pv-out):not(.pv-add):not(.bud) .blade,.gb-lf.idle:not(.pv-out):not(.pv-add):not(.bud) .blade{fill:color-mix(in srgb,var(--moss) 16%,var(--paper));stroke:var(--moss);stroke-width:1.2;stroke-dasharray:none}
.gb-lf.none:not(.pv-out):not(.pv-add):not(.bud) .blade{fill:none;stroke:var(--moss);stroke-width:1;stroke-dasharray:2.2 1.6}.gb-lf.none:not(.pv-out):not(.pv-add):not(.bud) .rib{opacity:0}
@media (prefers-color-scheme:dark){.gb-lf.fail:not(.pv-out):not(.pv-add) .blade{fill:#ef6b5b;stroke:#2a0d0a}.gb-lf.fail:not(.pv-out):not(.pv-add) .rib{stroke:#f2b3a8}.gb-lf.fail:not(.pv-out):not(.pv-add) .nec{stroke:#2a0d0a}
 .gb-lf.in:not(.pv-out):not(.pv-add):not(.bud) .blade,.gb-lf.idle:not(.pv-out):not(.pv-add):not(.bud) .blade{fill:color-mix(in srgb,var(--moss) 22%,transparent);stroke:color-mix(in srgb,var(--moss) 70%,#fff);stroke-width:1.2;stroke-dasharray:none}
 .gb-lf.none:not(.pv-out):not(.pv-add):not(.bud) .blade{fill:none;stroke:color-mix(in srgb,var(--moss) 70%,#fff);stroke-width:1;stroke-dasharray:2.2 1.6}}
.gb-lf.hl:not(.pv-out):not(.pv-add):not(.bud) .blade{stroke-width:1.4}
.gb .lbl text.t{font:400 13px var(--sans);fill:var(--ink2)}.gb .lbl text.t.v{font:400 12.5px var(--sans);fill:var(--ink2)}.gb .lbl text.t.v.out{fill:var(--muted);text-decoration:line-through}.gb .lbl text.st{font:11px var(--mono);fill:var(--muted)}.gb .lbl tspan.x{fill:var(--cutc)}
.gb .lbl tspan.code{font-family:var(--mono);font-size:.92em}
.gb .lbl text.eb{font:500 10px var(--mono);letter-spacing:.08em;fill:var(--muted)}.gb .st .f{fill:var(--verm-ink)}.gb .st .p{fill:var(--moss)}.gb .st .r{fill:var(--gold)}.gb .st .n{fill:var(--muted)}
.gb .lbl.hl text.t,.gb .lbl.sel text.t{font-weight:600;fill:var(--ink)}.gb .lbl.pruned{display:none}.gb .lbl.back text.t{fill:var(--ink3)}
.gb .lbl .num{font:600 11px var(--mono);fill:var(--muted)}
.gb .leader{fill:none;stroke:var(--line2);stroke-width:1}
.gb .badge circle{fill:var(--paper);stroke:var(--ink3);stroke-width:1}.gb .badge text{font:600 11px var(--mono);fill:var(--ink);text-anchor:middle;dominant-baseline:central}.gb.nw .badge text{font-size:14px}.gb.nw .klbl{font-size:12.8px;stroke-width:3.8px}.gb.nw .mlbl,.gb.nw .cuttag{font-size:13.4px}.gb.nw .note{font-size:14.7px}
.gb .badge.fail circle{stroke:var(--verm);fill:var(--verm-bg)}.gb .badge.sel circle{stroke:var(--ink);stroke-width:2}.gb .badge.pruned{display:none}
/* the repository's seal is pressed into the clay: no chip, only its letters cut a little into the face, the cut's upper edge in
   shadow and its lower edge catching the light; quiet, low and to one side, like a potter's mark */
.gb .seal{opacity:.75}.gb .seal text{font-family:var(--mono);font-weight:500;letter-spacing:.03em}.gb .seal .sm{fill:color-mix(in srgb,var(--pot-dk) 70%,#000)}.gb .seal .sd{fill:color-mix(in srgb,var(--pot-dk) 48%,#000);opacity:.75}.gb .seal .sl{fill:color-mix(in srgb,var(--pot) 50%,#fff);opacity:.5}
/* (on a dark page the cut shows the paler clay inside it, at least three to one against the face, with a darker inset along its
   upper edge) */
@media (prefers-color-scheme:dark){.gb .seal{opacity:1}.gb .seal .sm{fill:color-mix(in srgb,var(--pot) 34%,#fff)}.gb .seal .sd{fill:color-mix(in srgb,var(--pot-dk) 45%,#000);opacity:.9}.gb .seal .sl{fill:color-mix(in srgb,var(--pot) 60%,#fff);opacity:.25}}
.gb .stake{fill:none;stroke:var(--stake);stroke-linecap:round}.gb .tag{fill:var(--paper);stroke:color-mix(in srgb,var(--line2) 70%,var(--ink3));stroke-width:.9}.gb .rt.hl .stake,.gb .rt.sel .stake{stroke:color-mix(in srgb,var(--stake) 60%,var(--ink))}.gb .rt.hl .tag,.gb .rt.sel .tag{stroke:var(--ink3)}.gb .pot{fill:var(--pot)}.gb .pot-inc{fill:none;stroke:var(--pot-dk);stroke-width:.9;opacity:.75}.gb .pot-inc.lit{stroke:#fff;stroke-width:.7;opacity:.28}.gb .lip-hi{fill:none;stroke:#fff;stroke-width:.8;opacity:.4;stroke-linecap:round}.gb .lip-lo{fill:none;stroke:var(--pot-dk);stroke-width:.9;opacity:.9;stroke-linecap:round}.gb .gl{fill:var(--soil-lit);opacity:.9}.gb .gd{fill:#000;opacity:.18}.gb .pot-ft{fill:var(--pot-ft)}.gb .soil{fill:var(--soil-c)}.gb .mc0{fill:color-mix(in srgb,var(--pad-shade) 70%,#000);opacity:.6}.gb .mc1{fill:color-mix(in srgb,var(--pad-shade) 72%,var(--pad))}.gb .mc2{fill:color-mix(in srgb,var(--pad) 70%,var(--pad-shade))}.gb .mc3{fill:var(--moss-rim)}.gb .soilx,.gb .mc,.gb .seal,.gb .rhi,.gb .rcutg,.gb .ptag{pointer-events:none}
@media (prefers-color-scheme:dark){.gb .gl{fill:#5A4A3E;opacity:1}.gb .gd{opacity:.3}}
.gb .rring{fill:none;stroke:var(--paper);stroke-width:3;opacity:0;transition:opacity .2s}.gb .rt.hl .rring{opacity:1}.gb .rt.sel .rring{opacity:1;stroke:var(--ink);stroke-width:1.6}
.gb .rt.hl .w,.gb .rt.sel .w{fill:var(--wood-lit)}.gb .rt.hl .rlbl,.gb .rt.sel .rlbl{fill:var(--ink);font-weight:600}.gb.dim .rt:not(.hl):not(.sel){opacity:.32}
.gb .rt.loose .w{fill:var(--wood-old);opacity:.7}.gb .rcut{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.6;opacity:.85}.gb .rt.loose .rlbl{fill:var(--muted)}.gb .rt.loose .tag{stroke-dasharray:3 2}.gb .rt.wound:not(.wmute) .w{stroke:var(--verm);stroke-width:1.2}.gb .rt.wound:not(.wmute) .rlbl{fill:var(--verm-ink)}
.gb .rlbl{font:10.5px var(--mono);fill:var(--ink2);paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round}.gb .rlbl.tg{stroke:none;font-weight:500}.gb .rlbl.nt{fill:var(--muted)}.gb .rlbl .nt{fill:var(--muted);font-weight:400}
.gb .tail{fill:none;stroke-width:1.4;stroke-dasharray:3 4;stroke-linecap:round}.gb .tailend{fill:var(--paper);stroke:var(--muted);stroke-width:1.1;opacity:.6}
/* every root is wood: a fine darker edge parts a finger from the one behind it, and its upper side catches the light. A service's root is
   lifted in the dark so it never fades into the night; a severed root is half-faded bark with a pale cut face and two rings */
.gb .nbf .w,.gb .rt .w{stroke:color-mix(in srgb,var(--wood-shade) 70%,#000);stroke-width:.6;stroke-opacity:.7;stroke-linejoin:round}.gb .nbf .w{stroke-width:.8;stroke-opacity:.85}.gb .nbf .rhi{opacity:.62}.gb .rbed{fill:var(--soil-c)}.gb .rhi{fill:var(--wood-lit);opacity:.42}.gb .rt.ext:not(.hl):not(.sel) .w{fill:var(--rt-ext)}
.gb .rt.loose .w{fill:var(--rt-cut);opacity:.5;stroke:none}.gb .rcut{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.55;opacity:.95}.gb .rring2{fill:none;stroke:var(--wood-shade);stroke-width:.4;opacity:.7}.gb .rt.loose .tag{stroke:var(--muted);stroke-width:1;stroke-dasharray:3 2}.gb .rlim{fill:var(--wood-lit);opacity:.5;pointer-events:none}.gb .rlbl.tg .nt{fill:var(--muted)}
/* (on a dark page the roots, the nebari and the moss are lifted a step above the trunk's wood and the soil, and every root
   carries a brighter rim light along its upper edge, so the ground never sinks into the night) */
@media (prefers-color-scheme:dark){.gb .rt.loose .w{opacity:.75}.gb .rt.ext .w{stroke:#4A3F35;stroke-opacity:.9;stroke-width:.5}.gb .nbf .w,.gb .rt.store:not(.hl):not(.sel) .w{fill:#7D6C5A}.gb .rlim{fill:#D6C2A8;opacity:.55}
 .gb .mc1{fill:color-mix(in srgb,var(--moss) 56%,var(--paper))}.gb .mc2{fill:color-mix(in srgb,var(--moss) 43%,var(--paper))}.gb .mc3{fill:color-mix(in srgb,var(--moss) 82%,var(--paper))}.gb .mc0{fill:#0b120d;opacity:.55}}
.gb .sapu{fill:none;stroke:var(--gold);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;opacity:.38;filter:blur(1.6px);pointer-events:none}
.gb .sap{fill:none;stroke:color-mix(in srgb,var(--gold) 70%,var(--ink));stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:3 4;animation:gbflow .7s linear infinite;pointer-events:none}
.gb .sap.bad{stroke:var(--verm);stroke-width:2.8;stroke-dasharray:none;animation:none}.gb .sap.rest{stroke:var(--muted);opacity:.75;animation:none;stroke-dasharray:1.5 4}
/* past a break: round grey dots (r 1.6, every 5), each ringed dark so they read on bark; the part of a journey a leaf's own
   scenario does not run is a faint trace; a file the run never reached is a plain grey knot with a muted name */
.gb .sap.faint{opacity:.25;animation:none}
/* where the route never ran: small round mid-grey dots with no ring, quieter than the gold route and the red break, and
   under the faint knots past the break (gbBuild cuts them out round each knot). The key's swatch is drawn the same way */
.gb .sap.rest,.gw-sw .rdots{fill:none;stroke:#9a948a;stroke-width:3;stroke-dasharray:0 7;stroke-linecap:round;opacity:.8;animation:none}.gb .sap.resto{display:none}.gw-sw .rdots{stroke-width:2.1;stroke-dasharray:0 4.8}
@media (prefers-color-scheme:dark){.gb .sap.rest,.gw-sw .rdots{stroke:#a39e93;opacity:.7}}
.gb .kn.unreached .halo,.gb .kn.unreached:hover .halo{opacity:0}.gb .kn.unreached .k1{fill:color-mix(in srgb,var(--muted) 60%,var(--wood))}.gb .kn.unreached .k2{fill:var(--muted);opacity:.5}.gb .kn.unreached,.gb.dim .kn.unreached:not(.on){opacity:.4}
.gb .klbl.unreached{fill:var(--muted)}.gb .klbl.rest:not(.wound):not(.brk){fill:var(--ink3)}
.gb .klbl.nofit,.gb .klbl.nofit+.kld{display:none}
.gb .tiplead{fill:none;stroke:var(--ink3);stroke-width:.9;pointer-events:none;paint-order:stroke}
.gb .bead{fill:var(--gold);stroke:var(--paper);stroke-width:1.5}.gb .halo{fill:var(--gold);opacity:.22}
.gb .note{font:11.5px var(--mono);fill:var(--muted)}
.gb-tip{position:absolute;z-index:3;width:max-content;max-width:300px;pointer-events:none;background:var(--paper);border:1px solid var(--line2);border-radius:10px;padding:9px 11px;box-shadow:0 8px 28px rgb(0 0 0 / .14);font-size:13px;line-height:18px;color:var(--ink)}
.gb-tip.below{max-width:none;width:auto;right:0;box-shadow:none}.gb-tip[hidden]{display:none}.gb-tip b{display:block;font-weight:500}.gb-tip .k{font:11px/16px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em;text-wrap:balance}
.gb-tip .st{font:12px/17px var(--mono);margin-top:3px}.gb-tip .st.pass{color:var(--moss)}.gb-tip .st.fail{color:var(--verm-ink)}.gb-tip .st.run{color:var(--gold)}
.gb-tip .path{font:11.5px/16px var(--mono);color:var(--ink3);margin-top:4px}.gb-tip .hop{white-space:nowrap}.gb-tip .path .gw-hop.hit .hl{color:var(--ink)}.gb-tip .path .gw-hop.un .hl{color:var(--muted);opacity:.75}
.gb-tip .st b{display:inline;font-weight:600}.gb-tip .st .k{font:inherit;text-transform:none;letter-spacing:0;color:inherit}.gb-tip.dock{max-width:none;box-shadow:none;border-color:var(--line)}.gb-docked>*{visibility:hidden}
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
.gb-hd::-webkit-details-marker{display:none}.gb-hd:hover,.sel>.gb-hd{background:var(--sel)}.gb-olb>.gb-hd[aria-pressed=true]{box-shadow:inset 3px 0 0 var(--ink)}
.gb-hd .no{font:600 13px/22px var(--mono);color:var(--muted);text-align:center;grid-row:span 2}
.gb-hd .tt{font:500 15px/22px var(--sans);min-width:0;overflow-wrap:break-word;text-wrap:balance}.gb-hd .tt .by{font:11px/16px var(--mono);color:var(--gold);margin-left:6px;display:inline-block}/* an atomic inline, so it wraps on its own and never takes the title's last word with it */
.gb-hd .wh{grid-column:2;font:11.5px/16px var(--mono);color:var(--muted);overflow-wrap:break-word}
.gb-hd .st{grid-column:3;grid-row:1/span 2;display:grid;justify-items:end;gap:6px;padding-top:4px;font:11.5px/16px var(--mono);color:var(--muted);white-space:nowrap}
.gb-hd .st .f{color:var(--verm-ink)}.gb-hd .st .p{color:var(--moss)}.gb-hd .st .r{color:var(--gold)}
.gb-olx{display:grid;gap:1px;padding:0 6px 6px 42px;min-width:0}.gb-olx>.gb-path{margin:0 0 2px calc(-1 * var(--sw))}.gb-olx>.gb-sub:first-of-type{margin-top:8px}
.gb-ols,.gb-olr{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:2px 10px;align-items:start;width:100%;min-height:36px;padding:8px;border:0;border-radius:6px;background:none;text-align:left;font:14px/20px var(--sans);color:var(--ink);cursor:pointer}
/* one row everywhere: the leaf in a column of its own, centred on the title's first line, the chips on one right edge */
.gb-ols>.gw-g{justify-self:center;margin-top:5px}.gb-olr>.gw-g{justify-self:center;margin-top:3px}.gb-ols>.no{font:600 12px/20px var(--mono);color:var(--muted);text-align:center}
.gb-ols:hover,.gb-ols.hl,.gb-ols.sel,.gb-olr:hover,.gb-olr.sel{background:var(--sel)}.gb-ols.sel,.gb-olr.sel{box-shadow:inset 3px 0 0 var(--ink)}
.gb-ols .t,.gb-olr .t{min-width:0;overflow-wrap:break-word;text-wrap:pretty}.gb-ols .t small,.gb-olr .t small{display:block;font:11.5px/16px var(--mono);color:var(--muted)}
.gb-ols .bx{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;align-items:center;min-height:20px}.gb-ols .gw-n{font:11.5px/20px var(--mono);color:var(--muted);white-space:nowrap}
.gb-ols.cut{cursor:default;color:var(--ink3);min-height:30px}.gb-ols.cut .t{text-decoration:line-through;text-decoration-color:var(--muted)}
.gb-olx .err{font:12px/17px var(--mono);color:var(--verm-ink);background:var(--verm-bg);padding:6px 8px;border-radius:6px;overflow-wrap:break-word;margin:0 8px 4px 38px}
.gb-olin{display:grid;gap:8px;padding:2px 8px 12px 38px;font-size:13px;line-height:19px;color:var(--ink3)}
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
.gb-olr .fd{font:11.5px/16px var(--mono);color:var(--muted);white-space:nowrap}.gb-olr .t .un{color:var(--muted)}.gb-olr .gw-chip{grid-column:2/-1;justify-self:start}
.gb-ol>.gb-sub{margin:12px 6px 2px}
.gb-pk{display:flex;flex-wrap:wrap;gap:4px 14px;margin:8px 6px;font:12px/18px var(--sans);color:var(--ink3)}
.gb-sub{font:500 11px/16px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:14px 4px 4px}.gb-sub.code{text-transform:none;letter-spacing:0;color:var(--ink3)}
.gb-loose{font-size:13px;line-height:19px;color:var(--ink3);padding:10px 4px 2px}
.gb-path{display:flex;flex-wrap:wrap;gap:4px 2px;align-items:center;font:12px/18px var(--mono);color:var(--ink3)}
.gb-path button{border:0;background:none;padding:0 2px;font:inherit;color:var(--ink2);text-decoration:underline dotted;text-underline-offset:3px;cursor:pointer;min-height:24px}
.gb-path .sep{color:var(--muted)}.gb-path .hop.un button{color:var(--muted);text-decoration-color:color-mix(in srgb,var(--muted) 50%,transparent)}.gb-path .rootp{color:var(--ink3);text-decoration-style:dashed}.gb-path .bad{color:var(--verm-ink);font-weight:600}
@media (max-width:640px){.gb-hd{grid-template-columns:22px minmax(0,1fr)}.gb-hd .st{grid-row:auto;grid-column:2;justify-items:start}.gb-olx{padding-left:4px}.gb-olx>.gb-path{margin-left:calc(36px - var(--sw))}
 /* a row's chips stack on its right edge, so a second chip never squeezes the title into a sliver */
 .gb-ols .bx{flex-direction:column;align-items:flex-end;gap:4px}}
/* a phone's narrow column puts a row's chips, and a root's journeys, under its title rather than squeeze the title beside them */
@media (max-width:420px){.gb-ols,.gb-olr{grid-template-columns:20px minmax(0,1fr)}.gb-ols .bx{grid-column:2;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-start}.gb-olr .fd{grid-column:2;justify-self:start;white-space:normal}}
@media (prefers-reduced-motion:reduce){.gb-lf,.gb .vein,.gb .pfill,.gb .pband,.gb .pghost{transition:none}.gb-lf.run .gb-lfi,.gb .vein.live,.gb .sap{animation:none}.gb-lf.cut .gb-lfi{display:none}}
`;

export const BONSAI_JS = String.raw`
/* ---------- The bonsai: journeys grown from one trunk ---------- */
const gbRank={min:0,std:1,max:2};
const gbSURF={ui:'browser',cli:'terminal',api:'http',jobs:'job'};
const gbWHERE={browser:'in a browser',terminal:'in a terminal',http:'over HTTP',job:'as a job'};
const gbCAPS=[1,2,3,4,6,9,12,16,20,25,30,36,42,49,56,64,81,100];
const gbCap=n=>gbCAPS.find(c=>c>=n)||n;
const gbHash=s=>{let x=2166136261;for(let i=0;i<s.length;i++)x=Math.imul(x^s.charCodeAt(i),16777619);return (x>>>0)/4294967296};
const gbCubic=(p,t)=>{const u=1-t;return [u*u*u*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t*t*t*p[3][0],u*u*u*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t*t*t*p[3][1]]};
const gbF=v=>Math.round(v*10)/10;
const gbP=q=>gbF(q[0])+' '+gbF(q[1]);
const gbLine=pts=>'M'+pts.map(gbP).join(' L');
function gbRng(seed){let a=(seed*4294967296)>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function gbSpline(cp,n){const o=[];for(let i=0;i<cp.length-1;i++){const a=cp[i-1]||cp[i],b=cp[i],c=cp[i+1],d=cp[i+2]||c;
 for(let k=0;k<n;k++){const t=k/n,t2=t*t,t3=t2*t;o.push([0,1].map(j=>.5*(2*b[j]+(-a[j]+c[j])*t+(2*a[j]-5*b[j]+4*c[j]-d[j])*t2+(-a[j]+3*b[j]-3*c[j]+d[j])*t3)))}}o.push(cp[cp.length-1].slice());return o}
function gbResample(pts,n){const L=[0];for(let i=1;i<pts.length;i++)L.push(L[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));const tot=L[L.length-1]||1;const o=[];let j=0;
 for(let i=0;i<=n;i++){const d=tot*i/n;while(j<L.length-2&&L[j+1]<d)j++;const f=Math.min(1,(d-L[j])/((L[j+1]-L[j])||1));o.push([pts[j][0]+(pts[j+1][0]-pts[j][0])*f,pts[j][1]+(pts[j+1][1]-pts[j][1])*f])}return o}
const GB_NK=1.28;
const gbBez=(p,n)=>Array.from({length:n+1},(_,i)=>gbCubic(p,i/n));
/* the index a given distance back along a polyline from i, or forward from it */
const gbBack=(pts,i,r)=>{let k=i;while(k>0&&Math.hypot(pts[k][0]-pts[i][0],pts[k][1]-pts[i][1])<r)k--;return k};
const gbFwd=(pts,i,r)=>{let k=i;while(k<pts.length-1&&Math.hypot(pts[k][0]-pts[i][0],pts[k][1]-pts[i][1])<r)k++;return k};
function gbNorm(pts,i){const n=pts.length-1;const a=pts[Math.max(0,i-1)],b=pts[Math.min(n,i+1)];const dx=b[0]-a[0],dy=b[1]-a[1],m=Math.hypot(dx,dy)||1;return[-dy/m,dx/m]}
/* A piece of wood as a filled ribbon: width w[i] across the centreline, out along one edge and back along the other. On the
   inside of a bend the edge never reaches past the bend's centre, so a tight curve pinches instead of folding into a spike. */
function gbRib(pts,w,from,to,floor){from=from||0;to=to===undefined?pts.length-1:to;const N=pts.length-1,L=[],R=[];
 for(let i=from;i<=to;i++){const n=gbNorm(pts,i),h=w[i]/2;let hl=h,hr=h;const a=pts[Math.max(0,i-3)],b=pts[i],c=pts[Math.min(N,i+3)];
  const t1=[b[0]-a[0],b[1]-a[1]],t2=[c[0]-b[0],c[1]-b[1]],m1=Math.hypot(t1[0],t1[1]),m2=Math.hypot(t2[0],t2[1]);
  if(m1&&m2){const th=Math.asin(Math.max(-1,Math.min(1,(t1[0]*t2[1]-t1[1]*t2[0])/(m1*m2))));if(Math.abs(th)>1e-3){const rad=(m1+m2)/2/Math.abs(th);if(th>0)hl=Math.min(hl,.85*rad);else hr=Math.min(hr,.85*rad)}}
  L.push([b[0]+n[0]*hl,b[1]+n[1]*hl]);R.push([b[0]-n[0]*hr,b[1]-n[1]*hr])}
 if(floor!==undefined)for(const q of [...L,...R])q[1]=Math.min(q[1],floor);
 const e=pts[to],n=gbNorm(pts,to),t=[n[1],-n[0]],r=w[to]/2;
 return 'M'+L.map(gbP).join(' L')+' Q'+gbP([e[0]+t[0]*r*1.3,e[1]+t[1]*r*1.3])+' '+gbP(R[R.length-1])+' L'+R.reverse().slice(1).map(gbP).join(' L')+'Z'}
/* A band between two fractions of the half-width: the side the light falls on, or the side away from it. */
function gbBand(pts,w,k1,k2,from){const A=[],B=[];for(let i=from||0;i<pts.length;i++){const n=gbNorm(pts,i),h=w[i]/2;A.push([pts[i][0]+n[0]*h*k1,pts[i][1]+n[1]*h*k1]);B.push([pts[i][0]+n[0]*h*k2,pts[i][1]+n[1]*h*k2])}
 return 'M'+A.map(gbP).join(' L')+' L'+B.reverse().map(gbP).join(' L')+'Z'}
/* Which side of a piece faces the light (upper left): +1 is the side its normal points to. */
const gbSide=pts=>{let s=0;for(let i=0;i<pts.length;i+=3){const n=gbNorm(pts,i);s+=n[0]*-.6+n[1]*-.8}return s>=0?1:-1};
const gbLen=(pts)=>{const a=[0];for(let i=1;i<pts.length;i++)a.push(a[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return a};
const gbNear=(arr,v)=>{let k=0;for(let i=1;i<arr.length;i++)if(Math.abs(arr[i]-v)<Math.abs(arr[k]-v))k=i;return k};
const gbW=(t,px)=>t.length*px;

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

/* What a scenario proves, for where its leaf sits: the happy path, a guard (a caller or input the journey must refuse),
   or a way it fails. */
const gbPol=x=>x.polarity||(x.scenarioKind==='happy'?'happy':x.scenarioKind==='sad'?'failure':'guard');
const gbOrd=list=>list.map((x,i)=>({x,i})).sort((a,b)=>gbRank[a.x.mode]-gbRank[b.x.mode]||a.i-b.i).map(o=>o.x);
/* When an animation started, kept for the whole grow, so a rebuild continues it instead of restarting it. */
function gbT(k,delay){const G=gw.seen.gt||(gw.seen.gt={});if(G[k]===undefined)G[k]=performance.now()+delay;return G[k]}

/* A pad is grown, not stamped: cushions of foliage, each at the end of its own twig, with a little sky between them. The
   happy path sits on the crest, the highest cushion, in the middle; guards on a shoulder cushion to either side, the first
   on the outer one; the ways it fails hang on stalks under the outer shoulder, out past the end of the wood. A crown is a
   dome of the same cushions, its crest raised over two lower shoulders. A cushion is as wide as the leaves it holds, with a
   clump behind each leaf, so a pruned leaf takes its clump with it, and a cushion whose leaves are all pruned goes, leaving
   the twig that carried it cut back. In each group the minimum's leaves come first. Coordinates are the pad's own: x from
   its middle, y up from the lowest underside. */
function gbPadGeo(list,H,dir,seed,crown,cmin){const n=list.length;/* a bigger tree has bigger pads and leaves, not the same pads on a longer pole; a phone's smaller tree, smaller ones */const z=Math.max(.6,Math.pow(H/560,.75));const L0=Math.max(13,Math.min(21,20*z,H*.042));const L=n>16?L0*.76:n>9?L0*.86:n>5?L0*.94:L0,W=L*.52,s=L*.92;
 const g={happy:[],guard:[],failure:[]};for(const x of gbOrd(list))g[gbPol(x)].push(x);
 const d=dir||1,over=g.happy.slice(6),hang=[],side={},hangOf={};side[d]=[];side[-d]=[];
 g.guard.forEach((x,i)=>{if(Math.floor(i/2)>2)over.push(x);else side[i%2?-d:d].push(x)});
 g.failure.forEach((x,i)=>{if(i>=(crown?6:5))over.push(x);else hang.push(x)});
 hangOf[d]=crown?hang.filter((_,i)=>!(i%2)):hang;hangOf[-d]=crown?hang.filter((_,i)=>i%2):[];
 const step=L*.72,gap=Math.max(2.5,3*z),k=crown?.78:1;/* pads shrink toward the apex */
 /* A cushion is as big as the leaves it holds, and no bigger: a shoulder is a low flat mound (about a quarter as tall as it
    is wide), the crest a taller dome (about two fifths). A group with no leaves grows no cushion. */
 const shoulder=sd=>{const m=side[sd].length,f=hangOf[sd].length;if(!m&&!f)return null;const a=Math.max(L*1.15,(m*L*.95+L*.9)/2,f?((f-1)*step+L*.6)/.8:0);
  return {role:'shoulder',sd,a,h:Math.max(L*1.05,Math.min(L*2.4,a*.68)),b:0,guards:side[sd],hang:hangOf[sd],happy:[],over:[]}};
 const happy=g.happy.slice(0,6),rows=Math.ceil(over.length/6),nc=Math.max(happy.length,Math.min(6,over.length)),ac=Math.max(L*(crown?1.9:1.4),cmin||0,(nc*s*.95+L*1.4)/2);
 const crest=nc||crown||!n?{role:'crest',sd:0,a:ac,h:Math.max(L*1.3,ac*.96)+Math.max(0,rows-1)*L*.6,b:0,guards:[],hang:[],happy,over}:null;
 const sIn=shoulder(-d),sOut=shoulder(d),hs=Math.max(sIn?sIn.h:0,sOut?sOut.h:0);if(crest){crest.h=Math.max(crest.h,hs*1.35);crest.b=-(hs&&crown?.5*hs:0)}
 const cs=[sIn,crest,sOut].filter(Boolean);for(const c of cs){c.ids=[...c.happy,...c.over,...c.guards,...c.hang].map(x=>x.id);c.seat=c.h*.26}
 /* A journey's pad is a stepped mound: the crest sits up on its shoulders, which reach out from under its flanks, so the pad
    is about twice as wide as it is tall and the branch under it stays short. A crown's shoulders tuck in under its crest
    to either side, so the apex is one dome. Shoulders alone overlap a little, side by side. */
 let PW;if(!crown&&crest&&cs.length>1){crest.b=-.55*hs;crest.seat=.26*hs-.55*hs;for(const c of cs)c.x0=c===crest?0:c.sd*Math.max(crest.a*.6,crest.a-c.a*.5);
  const lo=Math.min(...cs.map(c=>c.x0-c.a)),hi=Math.max(...cs.map(c=>c.x0+c.a));PW=hi-lo;for(const c of cs){c.x=c.x0-(lo+hi)/2;c.u=PW/2+d*c.x}}
 else{const gp=cs.length>1?-(crown?.35:.3)*Math.min(...cs.map(c=>c.a)):gap;let u=0;for(const c of cs){c.u=u+c.a;u+=2*c.a+gp}PW=u-gp;for(const c of cs)c.x=d*(c.u-PW/2)}
 const G={L,W,PW,PH:0,z,cs,crown:!!crown,slot:new Map(),leafC:new Map(),cOf:new Map()};cs.forEach((c,k)=>{for(const id of c.ids)G.cOf.set(id,k)});
 const top=(c,v)=>c.b-c.h*(.28+.72*Math.pow(Math.max(0,1-v*v),c.role==='crest'?.8:.55)),und=(c,v)=>c.b-c.h*((c.role==='crest'?.26:.2)*Math.min(1.4,v*v)+.08*Math.exp(-Math.pow((v+.42)/.1,2))+.07*Math.exp(-Math.pow((v-.34)/.1,2)));
 /* the outline of each cushion as drawn, and the pad's as one edge (each column's lowest underside and highest crest), so
    the pad can be seated on its wood and a scar on what is left of it */
 G.shape=keep=>{const out=cs.map(c=>{const on=!c.ids.length||c.ids.some(keep);return gbCushPts(c,on?[...c.body,...c.ids.filter(id=>keep(id)&&G.leafC.has(id)).map(id=>G.leafC.get(id))]:[],und)});
  if(crest){const qc=out[cs.indexOf(crest)];if(qc.on)out.forEach(q=>{if(q===qc||!q.on)return;for(let i=0;i<q.top.length;i++){const x=q.top[i][0];if(x<qc.x0||x>qc.x1)continue;const cb=gbAtX(qc.bot,x)-.4;if(q.top[i][1]<cb){q.top[i][1]=Math.min(q.bot[i][1],cb)}}})}
  const tp=[],bt=[],xa=-PW/2-L,xb=PW/2+L;for(let i=0;i<=72;i++){const x=xa+(xb-xa)*i/72;let t=Infinity,b=-Infinity;for(const q of out){if(!q.on||x<q.x0||x>q.x1)continue;const tt=gbAtX(q.top,x),bb=gbAtX(q.bot,x);if(bb-tt<.5)continue;t=Math.min(t,tt);b=Math.max(b,bb)}if(t<Infinity){tp.push([x,t]);bt.push([x,b])}}
  if(!tp.length){tp.push([0,0]);bt.push([0,0])}return {cs:out,top:tp,bot:bt}};
 G.lay=()=>{const r=gbRng(seed||.5);G.slot.clear();G.leafC.clear();
  for(const c of cs){const nh=c.happy.length;
   c.happy.forEach((x,i)=>{const dx=(i-(nh-1)/2)*s,v=dx/c.a;G.slot.set(x.id,[c.x+dx,top(c,v)+L*.32,-90+v*26+(i%2?22:-22),i===0&&x.mode==='min'?1.12:1,0])});
   c.over.forEach((x,i)=>{const row=Math.floor(i/6),k=i%6;G.slot.set(x.id,[c.x+(k-2.5)*s*.85+(row%2?s*.42:0),c.b-c.h*(.3+.2*row),(k%2?-1:1)*22,.85,0])});
   /* guards fan along the cushion's outside flank, the first at its end and the next ones a leaf further in, each turned a little more upright */
   c.guards.forEach((x,i)=>{const v=Math.max(.3,Math.min(.95,(c.a-L*.2-i*L*.95)/c.a));G.slot.set(x.id,[c.x+c.sd*v*c.a,Math.min(c.b-c.h*.3,top(c,v)+L*.34),c.sd>0?-26-i*16:-154+i*16,1,0])});
   c.hang.forEach((x,i)=>{const v=c.a-L*.35-i*step;G.slot.set(x.id,[c.x+c.sd*v,0,90-c.sd*(v/c.a)*14,1,1])});
   /* the body: clumps across the cushion, overlapping so it reads as one mass, with shallow notches where they meet */
   const R0=Math.max(8*z,Math.min(20*z,c.h*.5)),nb=Math.max(2,Math.min(5,Math.ceil(c.a*2*.78/(1.42*R0))+1));c.body=[];
   for(let i=0;i<nb;i++){const v=i/(nb-1)*2-1,x=c.x+v*c.a*.72+(r()-.5)*R0*.3,vv=(x-c.x)/c.a,T=top(c,vv),Bt=und(c,vv);const rr0=Math.max(6*z,Math.min(34*z,(Bt-T)/1.36*(.88+.2*r()))),rr=i===0||i===nb-1?rr0*.82:rr0;c.body.push([x,Bt-rr*.5+(r()-.5)*c.h*.04,rr])}}
  /* a leaf's clump sits behind its base, so the leaf grows out of the foliage */
  for(const [id,sl] of G.slot){if(sl[4])continue;const th=sl[2]*Math.PI/180;G.leafC.set(id,[sl[0]-Math.cos(th)*L*.34,sl[1]-Math.sin(th)*L*.34,L*.62*(sl[3]||1)])}
  const q=G.shape(()=>true);G.botAt=x=>gbAtX(q.bot,x);G.topAt=x=>gbAtX(q.top,x);
  /* a hanging leaf's stalk starts on its cushion's underside, wherever the curve has lifted it to */
  cs.forEach((c,k)=>{c.bot=gbAtX(q.cs[k].bot,c.x);for(const x of c.hang){const sl=G.slot.get(x.id);sl[1]=gbAtX(q.cs[k].bot,sl[0])-1.5+L/2+10.5}});
  G.PH=Math.max(...cs.map(c=>c.h-c.b))};
 /* seat the cushions on their wood: each moves by its own amount, then the lowest underside is y=0 again (returned, so the
    caller moves the pad's origin by it) */
 G.seat=dys=>{cs.forEach((c,k)=>{c.b+=dys[k]||0});const m=Math.max(...cs.map(c=>c.b));for(const c of cs)c.b-=m;G.lay();return m};
 G.lay();return G}
/* a silhouette edge's height at x, between its samples */
function gbAtX(e,x){if(x<=e[0][0])return e[0][1];for(let i=1;i<e.length;i++)if(e[i][0]>=x){const a=e[i-1],b=e[i],f=(x-a[0])/((b[0]-a[0])||1);return a[1]+(b[1]-a[1])*f}return e[e.length-1][1]}
/* A cushion's silhouette, grown from its clumps: the crest is the upper envelope of the clumps (flattened, so it rolls in
   low bumps instead of balloons) and the underside is the cushion's own shallow curve, following the last clump round at
   each end so it ends in a rounded lobe. Always the same number of samples, so a cushion that loses a clump morphs, and one
   that loses them all shrinks to a point where its twig ends. */
function gbCushPts(c,circ,und){const n=24,top=[],bot=[];
 if(!circ.length){const p=[c.x,c.b-c.h*.3];for(let i=0;i<=n;i++){top.push(p.slice());bot.push(p.slice())}return {top,bot,on:false,x0:p[0],x1:p[0]}}
 const x0=Math.min(...circ.map(q=>q[0]-q[2]))-1,x1=Math.max(...circ.map(q=>q[0]+q[2]))+1,cov=[];
 for(let i=0;i<=n;i++){const x=x0+(x1-x0)*i/n;let t=Infinity,lo=-Infinity;for(const q of circ){const dx=x-q[0];if(Math.abs(dx)<q[2]){const h=Math.sqrt(q[2]*q[2]-dx*dx);if(q[1]-h*.86<t)t=q[1]-h*.86;if(q[1]+h*.5>lo)lo=q[1]+h*.5}}
  if(lo===-Infinity){top.push([x,null]);bot.push([x,null]);continue}const v=und(c,Math.max(-1.3,Math.min(1.3,(x-c.x)/c.a)));const b=Math.min(v,lo);top.push([x,Math.min(b,t)]);bot.push([x,b]);cov.push(i)}
 /* columns no clump reaches close up onto the nearest edge */
 for(let i=0;i<=n;i++)if(top[i][1]===null){const j=cov.reduce((a,v)=>Math.abs(v-i)<Math.abs(a-i)?v:a,cov[0]);const m=(top[j][1]+bot[j][1])/2;top[i]=[top[j][0],m];bot[i]=[top[j][0],m]}
 /* a soft pass so the bumps meet in shallow notches, not cusps */
 for(let i=1;i<n;i++)top[i][1]=Math.min(bot[i][1],(top[i-1][1]+2*top[i][1]+top[i+1][1])/4);
 for(let i=1;i<n;i++)bot[i][1]=Math.max(top[i][1],(bot[i-1][1]+2*bot[i][1]+bot[i+1][1])/4);
 return {top,bot,on:true,x0,x1}}
/* the crest is foliage, not a cloud: it breaks into small irregular scallops, one every two samples, the leaf mass's own
   edge; a cushion that has gone draws nothing */
const gbCushD=(o,q)=>{const t=q.top,P=p=>gbP([o[0]+p[0],o[1]+p[1]]);let d='M'+P(t[0]);
 for(let i=2;i<t.length;i+=2){const m=t[i-1],sl=Math.abs(t[i][1]-t[i-2][1])/((t[i][0]-t[i-2][0])||1),th=Math.min(1,(q.bot[i-1][1]-m[1])/4),amp=(1.4+1.6*((i*7919%13)/13))/(1+sl*1.5)*th;d+=' Q'+P([m[0],m[1]-amp])+' '+P(t[i])}
 if((t.length-1)%2)d+=' L'+P(t[t.length-1]);return d+' L'+q.bot.slice().reverse().map(P).join(' L')+'Z'};
const gbPadD=(o,q)=>q.cs.map(c=>gbCushD(o,c)).join(' ');
/* the lit rim along each cushion's crest, where the light catches the outer leaves */
const gbPadRim=(o,q)=>q.cs.map(c=>{const t=c.top,n=t.length-1,a=Math.round(n*.1),z=Math.round(n*.9);return 'M'+t.slice(a,z+1).map(p=>gbP([o[0]+p[0],o[1]+p[1]+1.3])).join(' L')}).join(' ');
/* the crest alone, which catches more light than its shoulders */
const gbPadCrest=(o,q,g)=>{const k=g.cs.findIndex(c=>c.role==='crest');return k>=0&&q.cs[k].on?gbCushD(o,q.cs[k]):''};
/* the lower two fifths of each cushion: where the twigs it grew from show through gaps in the foliage */
const gbPadLow=(o,q)=>q.cs.filter(c=>c.on).map(c=>'M'+c.bot.map(p=>gbP([o[0]+p[0],o[1]+p[1]])).join(' L')+' L'+c.bot.map((p,i)=>[p[0],p[1]-.42*(p[1]-c.top[i][1])]).reverse().map(p=>gbP([o[0]+p[0],o[1]+p[1]])).join(' L')+'Z').join(' ');
/* the darker band along each cushion's underside, where the foliage is in its own shade */
const gbPadBand=(o,q,t)=>q.cs.map(c=>'M'+c.bot.map(p=>gbP([o[0]+p[0],o[1]+p[1]])).join(' L')+' L'+c.bot.map((p,i)=>[p[0],Math.max(c.top[i][1],p[1]-t)]).reverse().map(p=>gbP([o[0]+p[0],o[1]+p[1]])).join(' L')+'Z').join(' ');
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
function gbTree(M,js,H,S,key,sap,strict){const U=M.U;const nc=j=>M.leaves[j.id]?M.crit(j).size:0,nl=j=>(M.leaves[j.id]||[]).length;
 /* a bonsai's first branch is its largest and its apex its smallest: the journey with the most scenarios grows lowest, the
    one with the fewest is the crown */
 const big=(a,b)=>nl(b)-nl(a)||nc(b)-nc(a)||M.weight(b)-M.weight(a)||(a.id<b.id?-1:1);
 const apex=js.length===1?js[0]:js.slice().sort(big)[js.length-1];const A=sap?[]:(M.leaves[apex.id]||[]);
 const items=js.filter(j=>j!==apex).sort(big).map(j=>({id:j.id,j,pol:null,w:M.weight(j)}));
 /* only a change with a single journey grows that journey's failures and guards as branches; with two or more, every
    branch is a journey and a journey's failures hang under its own pad, so the eye counts exactly as many limbs as
    there are journeys */
 const maxV=js.length===1?2:0;let left=A.length,nv=0;
 for(const p of ['failure','guard']){if(nv>=maxV)break;const n=A.filter(x=>gbPol(x)===p).length;if(n&&n<left){left-=n;nv++;items.push({id:apex.id+'~'+p,j:apex,pol:p,w:Math.max(.6,M.weight(apex)*n/A.length)})}}
 const m=items.length,lit=!m;const vp=new Set(items.filter(it=>it.pol).map(it=>it.pol));
 const h1=m>=7?.27:m===1?.54:.31;const hs=[];for(let i=0,h=h1;i<m;i++){hs.push(h);h+=(.86-h)*.4}
 const side=items.map((_,i)=>i%2?-S:S),back=items.map((_,i)=>m>=3&&i%3===2);
 const carry={};for(const j of js)for(const id of j.units)if(!U[id].root)carry[id]=(carry[id]||0)+1;
 const ownOf=j=>j.units.filter(id=>!U[id].root&&carry[id]===1);
 /* the bare wood a branch shows before its pad: room for each of its own parts' knots, about a knot's length apart */
 const bare=it=>it.pol?Math.max(.025*H,14):Math.max(.025*H,10+19*Math.min(4,ownOf(it.j).length));
 /* Pads first, each as wide as the leaves it holds. Then the trunk is as tall as the pads need: the leader runs into the
    crown, whose underside clears the highest pad below it, so there is no bare pole and no pad sits on another. */
 const leavesOf=pd=>pd.pol?A.filter(x=>gbPol(x)===pd.pol):pd.crown?A.filter(x=>!vp.has(gbPol(x))):(M.leaves[pd.jid]||[]);
 const padList=[{id:apex.id,jid:apex.id,pol:null,crown:true,i:-1,b:null},...items.map((it,i)=>({id:it.id,jid:it.j.id,pol:it.pol,crown:false,i,b:null}))];
 /* the apex is the tree's crowning dome: its crest a third again as wide as the largest crest below it, its own shoulder
    reaching out on the side away from the first branch, so the canopy balances over the roots */
 for(const pd of [...padList.slice(1),padList[0]]){pd.leaves=leavesOf(pd);const cm=pd.crown?1.3*Math.max(0,...padList.slice(1).map(q=>{const c=q.geo.cs.find(c=>c.role==='crest');return c?c.a:0})):0;pd.geo=gbPadGeo(pd.leaves,H,pd.crown?(m?-S:0):side[pd.i],gbHash('pad:'+key+':'+pd.id),pd.crown,cm)}
 const cpd=padList[0];
 const crc=cpd.geo.cs.find(c=>c.role==='crest'),gap=.022*H,inC=.32*crc.h-crc.bot-.035*H,lift=.02*H+6;let need=lit?.84*H:m<=1?.22*H:m<=2?.27*H:.38*H;
 /* the crown clears the pads below it; when it stands clear of them to the side it need only rise above their middle, so the
    upper trunk is not a bare pole (tried first, and kept only if nothing then overlaps) */
 if(!lit){for(const pd of padList.slice(1))if(!back[pd.i])need=Math.max(need,(pd.geo.PH*(strict?1:.5)+pd.geo.L*(strict?.75:0)+gap+inC+lift)/(1-hs[pd.i]));
  for(let i=0;i<m;i++)for(let j=i+1;j<m;j++)if(side[i]===side[j]&&!back[i]&&!back[j])need=Math.max(need,(padList[i+1].geo.PH+padList[i+1].geo.L+gap)/(hs[j]-hs[i]));
  /* and no branch reaches further from the trunk than about two thirds of the tree's height (to the top of its crown): a
     long journey makes a taller tree, not a longer whip */
  for(const pd of padList.slice(1))if(!back[pd.i])need=Math.max(need,(bare(items[pd.i])+pd.geo.PW)/.62-.6*cpd.geo.PH)}
 const Ht=Math.min(.92*H,need);const D=Ht*(sap?.05:lit?.1:m<=3?.13:.14);
 let cp;if(lit)cp=[[0,0],[.07,0],[.3,.1*S],[.62,-.03*S],[1,.12*S]];
 else{const mv=Math.min(1.5,H/Ht);cp=[[0,0],[.07,0],[h1*.55,-.02*S]];let last=-1;items.forEach((it,i)=>{if(back[i])return;cp.push([hs[i],side[i]*.05*Math.pow(1-hs[i],.7)*mv]);last=i});
  /* with one or two branches the apex leans away from the first, so the tree's mass stays over its roots */
  /* and above it the leader keeps moving, in bends that shrink toward the top, so the upper trunk is never a straight pole */
  if(last>=0&&hs[last]<.8){const h0=hs[last],q=1-h0;cp.push([h0+q*.32,-side[last]*.03*mv]);if(q>.32)cp.push([h0+q*.66,side[last]*.012*mv])}cp.push([1,m<=2?-S*.08:.008*S])}
 const tp=gbResample(gbSpline(cp.map(([t,x])=>[x*Ht,-t*Ht]),14),96);
 const top=tp[tp.length-1];for(let i=1;i<=4;i++)tp.push([top[0]-S*.012*H*i/4,top[1]-.035*H*i/4]);
 const ty=tp.map(p=>-p[1]/Ht);
 const wts=items.map(it=>it.w),wA=Math.max(.5,M.weight(apex)-items.filter(it=>it.pol).reduce((a,it)=>a+it.w,0));
 const Wat=t=>{let w=wA;items.forEach((it,i)=>{w+=wts[i]*Math.max(0,Math.min(1,(hs[i]-t+.02)/.04))});return w};
 /* the trunk tapers in one continuous line from a flared base into the crown, w = w0(1 - .68t)^.85, so the leader still has
    about a third of the base's girth where it enters the crown: never a wire. Each branch takes a little of the girth with it
    (six parts in a hundred, eased over the joint), and the wood swells slightly where it leaves. */
 /* (the foot flares over the bottom tenth, smoothly, so it reads as the trunk spreading into its roots: about two fifths wider
    where it meets the soil) */
 const Tw=t=>{const tc=Math.min(1,Math.max(0,t));let w=lit?D*(.3+.7*Math.pow(Math.max(0,1-t),1.05)):D*Math.pow(1-.68*tc,.85);
  if(!lit)for(const h of hs){const u=Math.max(0,Math.min(1,(t-h)/.05));w*=1-.06*u*u*(3-2*u)}
  for(const h of hs)w*=1+.05*Math.exp(-Math.pow((t-h-.006)/.025,2));if(t<.1)w*=1+.72*Math.pow(1-t/.1,1.9);if(t>1)w*=Math.max(.5,1-(t-1)*5);return Math.max(1.6,w)};
 const tw=ty.map(Tw);
 /* A branch leaves the trunk at a third of its width or less, carries its own parts as knots on the bare wood before its
    pad, and runs on under the pad, where three to five branchlets fork up into the foliage they carry. */
 const br=items.map((it,i)=>{const h=hs[i],dir=side[i];const k=gbNear(ty,h);const P0=tp[k],Tk=tw[k];const pd=padList[i+1],g=pd.geo;
  /* a branch leaves at up to nearly half the trunk's girth there and tapers along its whole run, never to a thread */
  const b=Tk*Math.max(.3,Math.min(.45,.45*Math.sqrt(it.w/Wat(h-.04))));
  const inner=Tk/2+(back[i]?.03*H:bare(it));
  /* the branch runs out under its pad and ends inside its outer cushion, so the foliage is held by wood all the way out and
     no wood pokes out past it */
  const cl=g.cs[g.cs.length-1],R=inner+cl.u,rise=back[i]?.34:.08+.05*h,dr=back[i]?-.06:.07*(1-h);
  const rb=gbRng(gbHash(key+':bend:'+it.id));const b1=back[i]?0:.04+.04*rb(),b2=back[i]?0:.05*rb();
  const cpb=back[i]?[P0,[P0[0]+dir*.3*R,P0[1]+dr*R],[P0[0]+dir*.66*R,P0[1]+dr*.3*R],[P0[0]+dir*R,P0[1]-rise*R]]
   :[P0,[P0[0]+dir*.22*R,P0[1]+(dr+b1)*R*.9],[P0[0]+dir*.5*R,P0[1]+(dr*.4-b2)*R],[P0[0]+dir*.76*R,P0[1]-rise*R*.45+b1*R*.3],[P0[0]+dir*R,P0[1]-rise*R]];
  const ph=gbRng(gbHash(key+':'+it.id))()*6.28;const raw=back[i]?gbBez(cpb,44):gbResample(gbSmooth(cpb,3),44);
  const pts=raw.map((q,ii)=>{const t=ii/44,n=gbNorm(raw,ii),d=.012*R*Math.sin(t*7+ph)*Math.sin(t*Math.PI);return[q[0]+n[0]*d,q[1]+n[1]*d]});
  const acc=gbLen(pts),len=acc[acc.length-1];
  const w=acc.map(d=>{const u=d/len,out=Math.max(0,d-Tk/2);return Math.max(2.5,b*(1-.62*u)*(1+.2*Math.exp(-out/6)))});
  /* Each cushion is seated on the wood: the branch runs through the lower quarter of every cushion and ends inside the
     outer one, so the foliage lies on its wood all the way out, never on posts above it. */
  const cx=P0[0]+dir*(inner+g.PW/2),tip=pts[pts.length-1];const near=X=>{let ii=1,bd=1e9;for(let jj=1;jj<pts.length;jj++){const dd=Math.abs(pts[jj][0]-X);if(dd<bd){bd=dd;ii=jj}}return ii};
  let oy=tip[1]+cl.seat-cl.bot;const dys=g.cs.map(c=>{const ii=near(cx+c.x);return pts[ii][1]+c.seat-(oy+c.bot)});
  oy+=g.seat(dys);const o=[cx,oy];
  /* Inside each cushion the branch puts out its secondary twigs, fanned forward along it and rising twenty to forty degrees
     into the foliage (three in a crest, two in a shoulder), so the cushion is held by the wood it grew from; a leaf's sap
     runs down the one nearest the cushion's middle. */
  const twigs=[],hold=[];g.cs.forEach((c,k)=>{const X=o[0]+c.x,yb=o[1]+c.bot;
   const fan=c.role==='crest'?[[-.6,.5],[.04,.62],[.62,.46]]:[[-.46,.5],[.5,.44]],mid=c.role==='crest'?1:c.sd===dir?1:0;
   fan.forEach(([fx,fh],fi)=>{const e=[X+dir*fx*c.a,yb-c.h*fh];const by=pts[near(e[0])][1],rise=Math.max(3,by-e[1]);
    const ii=Math.max(b0(),Math.min(pts.length-2,near(e[0]-dir*rise*(1.3+.25*fi)))),a0=pts[ii],dx=e[0]-a0[0],dy=a0[1]-e[1];
    const t2=gbBez([a0,[a0[0]+dx*.42,a0[1]-dy*.12],[e[0]-dx*.22,e[1]+dy*.22],e],10);
    twigs.push({pts:t2,w:t2.map((_,jj)=>Math.max(1,w[ii]*.55*Math.pow(1-jj/10,1.1)+jj/10*1.1)),at:ii/(pts.length-1),k});if(fi===mid)hold[k]={pts:t2,bi:ii}})});
  function b0(){return Math.max(1,acc.findIndex(d=>d>=Tk*.5))+2}
  return {it,j:it.j,id:it.id,pol:it.pol,i,h,dir,k,back:back[i],pts,w,len,acc,R,inner,exit:Math.max(1,acc.findIndex(d=>d>=Tk*.5)),tip:pts[pts.length-1],b,Tk,o,twigs,hold}});
 const pads={},origin={};for(const pd of padList){pads[pd.id]=pd;if(!pd.crown){pd.b=br[pd.i];origin[pd.id]=pd.b.o}}
 /* The leader runs on into the crown and ends a third of the way up inside its crest; the crown's shoulders sit lower to
    either side, each on a branchlet the leader puts out at its own height (the one on the first branch's side lower), leaving
    at about forty degrees and levelling out under its cushion, so the apex is a dome grown from the leader, not a ball on
    spokes. A wide crest takes a second twig from just under it. */
 const cg=cpd.geo,te=tp[tp.length-1],co=[te[0]-crc.x,te[1]+crc.h*.32-crc.bot];origin[apex.id]=co;
 const ctw=[],chold=[];const leaderAt=y=>{let ki=tp.length-1;for(let ii=tp.length-1;ii>0;ii--)if(tp[ii][1]>=y){ki=ii;break}return ki};
 cg.cs.forEach((c,k)=>{if(c===crc)return;const X=co[0]+c.x,e=[X+c.sd*c.a*.1,co[1]+c.bot-c.h*.3];const ki=leaderAt(co[1]+c.bot+(c.sd===(S||1)?22:12)*Math.max(.7,cg.z)),a0=tp[ki],dx=e[0]-a0[0],dy=a0[1]-e[1];
  const t2=gbBez([a0,[a0[0]+dx*.3,a0[1]-dy*.5],[e[0]-dx*.38,e[1]+dy*.1],e],12);ctw.push({pts:t2,w:t2.map((_,jj)=>Math.max(1,tw[ki]*.6*Math.pow(1-jj/12,1.1)+jj/12)),k});chold[k]={pts:t2,bi:ki}});
 if(crc.a>30*cg.z){const ki=leaderAt(co[1]+crc.bot+5),a0=tp[ki],e=[co[0]+crc.x-(S||1)*crc.a*.45,co[1]+crc.bot-crc.h*.3],dx=e[0]-a0[0],dy=a0[1]-e[1];
  const t2=gbBez([a0,[a0[0]+dx*.25,a0[1]-dy*.55],[e[0]-dx*.3,e[1]+dy*.1],e],10);ctw.push({pts:t2,w:t2.map((_,jj)=>Math.max(1,tw[ki]*.5*Math.pow(1-jj/10,1.1)+jj/10)),k:cg.cs.indexOf(crc)})}
 const cdrop=cg.cs.length>1?22*Math.max(.7,cg.z):0;
 /* Knots: parts the journeys share sit low on the trunk (most shared lowest, callee below caller); a journey's own parts sit
    on the bare wood of its branch, deepest nearest the trunk; the headline journey's own parts on the upper trunk. */
 const depth=id=>{let s=0,n=0;for(const j of js){const i=j.units.indexOf(id);if(i>=0){s+=i/Math.max(1,j.units.length-1);n++}}return n?s/n:0};
 /* knots keep their distance along the wood, about two of their own lengths; where more files share a stretch than fit, the
    last knot there swells into a burl that holds the rest, and its card names every one */
 const knots=[],more={};const KG=21;const tacc=gbLen(tp);
 const onTrunk=(ids,t)=>{const k=gbNear(ty,t);knots.push({id:ids[0],ids,on:'t',k,p:tp[k],n:gbNorm(tp,k),w:tw[k],t})};
 const fitN=(t0,t1)=>Math.max(1,Math.floor((tacc[gbNear(ty,t1)]-tacc[gbNear(ty,t0)])/KG)+1);
 const group=(list,n)=>list.length<=n?list.map(id=>[id]):[...list.slice(0,n-1).map(id=>[id]),list.slice(n-1)];
 const core=lit?[]:Object.keys(carry).filter(id=>carry[id]>1).sort((a,b)=>carry[b]-carry[a]||depth(b)-depth(a));
 const c0=.09,c1=Math.max(.16,h1-.05);group(core,fitN(c0,c1)).forEach((ids,i,a)=>onTrunk(ids,a.length===1?.16:c0+(c1-c0)*i/(a.length-1)));
 const ownA=apex.units.filter(id=>!U[id].root&&carry[id]===1).sort((a,b)=>depth(b)-depth(a));
 const fr=hs.filter((h,i)=>!back[i]);const hi=Math.min(lit?.74:.95,1-(inC+8+cdrop)/Ht),lo=Math.min(hi-.12,lit?.1:(fr.length?Math.max(...fr)+.06:.35));
 group(ownA,Math.min(5,fitN(lo,hi))).forEach((ids,i,a)=>onTrunk(ids,a.length===1?(lo+hi)/2:lo+(hi-lo)*i/(a.length-1)));
 /* never closer than that along the trunk, and none pushed into the crown: one that would be joins the burl below it */
 const kTop=gbNear(ty,hi);const tk=knots.filter(q=>q.on==='t').sort((a,b)=>a.k-b.k);
 for(let i=1;i<tk.length;i++){let k=tk[i].k;while(k<tp.length-6&&tacc[k]-tacc[tk[i-1].k]<KG)k++;if(k!==tk[i].k){tk[i].k=k;tk[i].p=tp[k];tk[i].n=gbNorm(tp,k);tk[i].w=tw[k]}}
 for(let i=tk.length-1;i>0;i--)if(tk[i].k>kTop+2){tk[i-1].ids.push(...tk[i].ids);knots.splice(knots.indexOf(tk[i]),1)}
 for(const b of br){if(b.pol)continue;const own=ownOf(b.j).sort((x,y)=>depth(y)-depth(x));const a0=b.Tk/2+8,a1=Math.max(a0+4,b.inner-4);const fit=Math.min(4,Math.max(1,Math.floor((a1-a0)/KG)+1));
  group(own,fit).forEach((ids,i,a)=>{const d=a.length===1?(a0+a1)/2:a0+(a1-a0)*i/(a.length-1);const k=gbNear(b.acc,d);knots.push({id:ids[0],ids,on:'b'+b.i,bid:b.id,k,p:b.pts[k],n:gbNorm(b.pts,k),w:b.w[k]})})}
 /* a knot is a swelling in the wood, not a stud on it: the outline bulges a couple of pixels over about fourteen */
 for(const q of knots){if(q.on==='t'){for(let j=0;j<tw.length;j++)tw[j]+=2.4*Math.exp(-Math.pow((tacc[j]-tacc[q.k])/7,2))}
  else{const b=br.find(x=>x.id===q.bid);if(b)for(let j=0;j<b.w.length;j++)b.w[j]+=1.6*Math.exp(-Math.pow((b.acc[j]-b.acc[q.k])/5,2))}}
 /* Veins: each pad's strand in its own lane up the trunk, peeling off into its branch, so strands never cross. */
 const lanes=[...br.filter(b=>b.dir<0).sort((a,b)=>a.h-b.h).map(b=>b.id),apex.id,...br.filter(b=>b.dir>0).sort((a,b)=>b.h-a.h).map(b=>b.id)];
 const veins={};for(const id of lanes){const f=lanes.length===1?0:(lanes.indexOf(id)-(lanes.length-1)/2)/lanes.length*1.1;const b=br.find(x=>x.id===id);const kTop2=b?b.k:tp.length-1;
  const trunk=tp.slice(0,kTop2+1).map((q,i)=>{const n=gbNorm(tp,i),o=f*tw[i]*.5;return[q[0]+n[0]*o,q[1]+n[1]*o]});
  veins[id]={jid:pads[id].jid,trunk,branch:b?b.pts.slice(b.exit,Math.round(.55*(b.pts.length-1))):[],pad:origin[id]}}
 if(!strict&&!lit){const bx=(pd,o)=>{const g=pd.geo;return pd.crown?[o[0]-g.PW/2-g.L*.6,o[1]-g.PH-g.L,o[0]+g.PW/2+g.L*.6,o[1]+g.L*1.7]:[o[0]-g.PW/2-g.L*.5,o[1]-g.PH-g.L*.9,o[0]+g.PW/2+g.L*.5,o[1]+g.L+14]};
  const c=bx(cpd,origin[apex.id]);if(padList.slice(1).some(pd=>{const q=bx(pd,origin[pd.id]);return Math.min(c[2],q[2])+10>Math.max(c[0],q[0])&&Math.min(c[3],q[3])+10>Math.max(c[1],q[1])}))return gbTree(M,js,H,S,key,sap,true)}
 let x0=Infinity,x1=-Infinity,y0=0;const grow=(x,y)=>{x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y)};
 tp.forEach((q,i)=>{grow(q[0]-tw[i]/2,q[1]);grow(q[0]+tw[i]/2,q[1])});for(const b of br)b.pts.forEach(q=>grow(q[0],q[1]-b.b));
 for(const pd of padList){const o=origin[pd.id],g=pd.geo;grow(o[0]-g.PW/2-g.L*.5,o[1]-g.PH-g.L*.9);grow(o[0]+g.PW/2+g.L*.5,o[1]+g.L+14)}
 return {js,apex,items,br,tp,tw,ty,pads,padList,origin,knots,more,veins,lanes,ctw,chold,H,Ht,D,S,lit,hs,h1,x0,x1,y0,cx0:x0,cx1:x1,cy0:y0,key}}

/* The whole drawing: trees placed side by side in one pot, labels beside their pads, roots in the soil. */
function gbLayout(M,width,sap){const s=gw.state;const brn=(s.change&&s.change.branch)||'grove';const S=gbHash('side:'+brn)<.5?-1:1;const narrow=width<720;
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
 let L=null;
 for(let pass=0;pass<6;pass++){
  const trees=trees0.map((t,i)=>gbTree(M,t.js,i?H0*Math.max(.5,Math.min(.75,Math.sqrt((t.leaves||1)/Math.max(1,main.leaves||1)))):H0,i%2?-S:S,brn+':'+i,sap));
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
     tree is tall (up to seven tenths for a tree that spreads wider than it is tall), about as deep as the trunk is thick at
     its foot, and never shorter than its nebari and its roots need */
  const tall=Math.max(-T0.cy0,T0.Ht,1),spread=T0.cx1-T0.cx0;
  let potL=lone?Math.max(.4*H0,96):Math.max(narrow?110:150,Math.min(760,tall*(.6+.1*Math.max(0,Math.min(1,spread/tall-1)))));
  /* the pot sits under the canopy's mass, the trunk off its centre, so a heavy first branch does not hang off one end */
  let potC=trees.length===1?(lone?0:Math.max(-potL*.2,Math.min(potL*.2,(T0.cx0+T0.cx1)/2*.85))):(Math.min(...xs)+Math.max(...xs))/2;
  if(trees.length>1)potL=Math.max(potL,Math.max(...xs)-Math.min(...xs)+.5*H0);
  /* roots: one per thing the change depends on, alternating sides. A store in the repo runs along the soil and sinks into it;
     a third party runs over the rim and down the pot, out of the repo; one that no journey uses lies apart, severed. */
  const deps=[];const taken=new Set();
  trees.forEach((T,i)=>{const ids=[...new Set(T.js.flatMap(j=>(j.units||[]).filter(id=>M.U[id]&&M.U[id].root)))].filter(id=>!taken.has(id));if(!i)for(const u of M.strays)ids.push(u.id);
   ids.slice(0,6).forEach((id,k)=>{taken.add(id);deps.push({id,i,d:k%2?T.S:-T.S,r:Math.floor(k/2),T,ext:M.U[id].layer==='ext',loose:!T.js.some(j=>(j.units||[]).includes(id))})})});
  /* the nebari: five buttress roots (four on a slender literati) flaring from the trunk's foot, alternately long and short,
     each leaving the trunk about a third of the foot's girth thick and tapering to nothing within one to one and a half of its
     diameters, its lower two fifths sunk in the soil; the back ones a little higher, the front ones lower and laid over them.
     On a side a named root leaves on, the long one stays short, so the named root is the only long root there. Lengths are in
     the foot's diameters past its surface, thickness in its girth */
  const nbSpec=(T,i)=>{const live=new Set(deps.filter(q=>q.i===i&&!q.loose).map(q=>q.d));
   const sp=T.lit?[[-1,.9,0,.3],[1,.55,0,.28],[1,.75,1,.32],[-1,.42,1,.3]]
    :[[-1,1.05,0,.32],[1,.7,0,.28],[-T.S,.32,0,.26],[1,.95,1,.34],[-1,.5,1,.32]];
   return sp.map(([d,len,f,w0])=>({d,len:live.has(d)&&len>.6?.4:len,f,w0}))};
  /* half the foot's width where it meets the soil, from the trunk as drawn */
  const halfAt=T=>{let k=0;while(k<T.tp.length-1&&T.tp[k][1]>-8)k++;return T.tw[k]/2},nbEnd=(T,q)=>q.d*halfAt(T)*(1+2*q.len*(q.f?.85:1));
  const looseLen=Math.max(24,Math.min(36,.1*tall)),mossW=22*Math.sqrt(kpx);
  /* the pot's ends hold the nebari, a third party's root running out to the rim, a store's root, and a severed root with
     room around it */
  {let A=Infinity,Bz=-Infinity;trees.forEach((T,i)=>{const X=xs[i];for(const d of [-1,1]){const rch=Math.max(halfAt(T),...nbSpec(T,i).filter(q=>q.d===d).map(q=>d*nbEnd(T,q))),dp=deps.filter(q=>q.i===i&&q.d===d);
    /* (and on a side no named root runs along, room for a mound of moss between the nebari and anything laid there) */
    let nd=rch+18*kpx;if(dp.some(q=>q.ext))nd=Math.max(nd,rch+30*kpx);if(dp.some(q=>!q.ext&&!q.loose))nd=Math.max(nd,rch+26*kpx);
    else if(!dp.some(q=>q.ext))nd=Math.max(nd,rch+mossW+(dp.some(q=>q.loose)?36*kpx+looseLen:22*kpx));
    if(d<0)A=Math.min(A,X-nd);else Bz=Math.max(Bz,X+nd)}});
   /* (a pot short at one end slides that way first, as far as the other end has room to spare, before it grows) */
   let a=potC-potL/2,b=potC+potL/2;if(!lone&&(a>A||b<Bz)){if(a>A){const k=Math.min(a-A,Math.max(0,b-Bz));a-=k;b-=k}if(b<Bz){const k=Math.min(Bz-b,Math.max(0,A-a));a+=k;b+=k}a=Math.min(a,A);b=Math.max(b,Bz);potL=b-a;potC=(a+b)/2}}
  /* as deep as the trunk is thick at its foot, so the pot balances the tree; a lone literati keeps its small round bowl */
  let D=lone?22:Math.max(22,Math.min(52,.86*T0.D));const fh=lone?3.4:Math.max(4,Math.min(8,.16*D));
  let x0=Math.min(edgeL,potC-potL/2-10),x1=Math.max(edgeR,potC+potL/2+10),y0=Math.min(...trees.map(T=>T.y0));
  /* the soil: a low mound inside the pot, highest at the trunk, that the roots lie in and sink into */
  const pa=potC-potL/2,pb=potC+potL/2;
  const sy=x=>{let m=0;for(const X of xs)m=Math.max(m,Math.exp(-Math.pow((x-X)/(.3*potL),2)));return -3-(lone?3.4:6)*m};
  /* a root is not a ruled wedge: it swells and narrows a little along its run, lies half sunk, and its tip goes under */
  /* the ground a front root lies on: nearer the eye than the soil's far edge, so lower in the drawing */
  const fy=x=>{const a=sy(x)+.7;return a+.5*(-1-a)};
  const knobs=(seed,n)=>{const r=gbRng(seed),ph=r()*6.28,ph2=r()*6.28;return Array.from({length:n+1},(_,i)=>[1+.13*Math.sin(i*.95+ph),.55*Math.sin(i*.6+ph2)])};
  const wallX=(dd,y)=>{const k=5*Math.max(0,y-2)/Math.max(1,D-2);return dd>0?pb-k:pa+k};
  const roots=[];
  /* the nebari, unnamed, are laid first, back fingers before front ones, so the named roots lie over them */
  trees.forEach((T,i)=>{const X=xs[i],hb=halfAt(T),G=2*hb;const fs0=[];nbSpec(T,i).forEach((q,k)=>{const n=18,kb=knobs(gbHash('nb'+i+':'+k),n);const a=X+q.d*hb*.45,e=X+nbEnd(T,q);const pts=[],w=[];
    /* a filled wedge: thick where it leaves the foot, its upper edge climbing the trunk there (a buttress), thinning to nothing;
       two fifths of it under the soil's surface (the nearer ground for a front one), its tip going under altogether */
    for(let ii=0;ii<=n;ii++){const t=ii/n,x=a+(e-a)*(1-Math.pow(1-t,1.3)),ww=Math.max(.5,G*q.w0*Math.pow(1-t,.85)*kb[ii][0]+(q.f?.1:.14)*G*Math.pow(1-t,4)),g0=q.f?.48:.55;
     pts.push([x,(q.f?fy(x):sy(x)+.7)-.1*ww+(t>g0?Math.pow((t-g0)/(1-g0),1.6)*(ww*.6+1.2):0)+kb[ii][1]*.3]);w.push(ww)}
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
   for(const pd of T.padList||[]){const o=T.origin&&T.origin[pd.id],g=pd.geo;if(o&&g)padB.push([o[0]+X-g.PW/2,o[1]-g.PH-g.L*.6,o[0]+X+g.PW/2,o[1]+g.L+10,o[1]+2])}
   for(const kn of T.knots||[])if(kn.p)woodP.push([kn.p[0]+X,kn.p[1],7,null])});
  for(const r of roots)if(r.pts)for(let k=0;k<r.pts.length;k+=2)woodP.push([r.pts[k][0],r.pts[k][1],r.w[k]/2,r]);
  const bgap=(b,q)=>Math.hypot(Math.max(b[0]-q[2],0,q[0]-b[2]),Math.max(b[1]-q[3],0,q[1]-b[3]));
  const clr=(b,own,body,tg)=>{let c=1e9;for(const q of woodP)if((q[3]!==own||!own)&&!(tg&&q[3]&&q[1]-q[2]>=b[3]+4))c=Math.min(c,Math.hypot(Math.max(b[0]-q[0],0,q[0]-b[2]),Math.max(b[1]-q[1],0,q[1]-b[3]))-q[2]);for(const q of padB)c=Math.min(c,bgap(b,body?[q[0],q[1],q[2],q[4]]:q));return c};
  /* the pot is the repository: its name pressed into the face's lower right (centred on a small bowl), in full while it fits
     the free face. Its type steps down to about seven pixels first, then the name breaks after a hyphen onto two lines,
     and only then is its end cut; never its middle. A monospace letter is six tenths of its size, and three hundredths more
     apart */
  let repo='';try{repo=(state.config&&state.config.project)||String(state.dir||'').split('/').pop()||''}catch(e){}
  const seal=repo&&potL>60?(()=>{const sy0=D-6,ax=lone?potC:wallX(1,sy0)-7*kpx,room=lone?potL*.62:ax-(wallX(-1,sy0)+7*kpx),cw=f=>f*.63;
   const sizes=[8.6,8.2,7.8,7.4,7].map(f=>f*kpx),fit=ls=>sizes.find(f=>Math.max(...ls.map(l=>l.length))*cw(f)<=room);
   const out=(lines,f)=>({lines,fs:f,x:ax,y:lone?D*.5+f*.35:sy0,an:lone?'middle':'end',lh:f*1.12,room});
   let f=fit([repo]);if(f)return out([repo],f);
   /* two lines need the face's height: the upper line's top stays below the shadow under the lip */
   if(!lone&&sy0-sizes[4]*1.12-sizes[4]*.75>=Math.min(8,D*.24)+1){let best=null;for(let i=1;i<repo.length-1;i++)if(/[-_./]/.test(repo[i-1])){const ls=[repo.slice(0,i),repo.slice(i)],n=Math.max(ls[0].length,ls[1].length);if(!best||n<best.n)best={ls,n}}
    if(best){const ok=sizes.filter(q=>sy0-q*1.12-q*.75>=Math.min(8,D*.24)+1),g=ok.find(q=>best.n*cw(q)<=room);if(g)return out(best.ls,g);
     const m=ok[ok.length-1];if(m&&best.ls[0].length*cw(m)<=room){const n=Math.max(2,Math.floor(room/cw(m)));return out([best.ls[0],best.ls[1].length>n?best.ls[1].slice(0,n-1)+'…':best.ls[1]],m)}}}
   const m=sizes[4],n=Math.max(2,Math.floor(room/cw(m)));return out([repo.slice(0,n-1)+'…'],m)})():null;
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
     store no journey uses is a short severed root sunk to half its depth in the soil apart from the flare, its cut face to
     the trunk and the stake right beside the cut face, the tag reaching out over the root; both move along the soil together
     until the tag is clear. Its tag reads "<store> · unused" on one line at every width: the type steps down to eight
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
    /* the stake stands just in front of the cut face, on the trunk's side; the root runs out from it toward the rim */
    const w0=9*kpx,gap=d=>d*(w0*.42+2.6*kpx);
    /* (the whole name where it stands well clear, then where it is merely clear, then in smaller type, then leaning out past
       the rim; and only then a cut name) */
    const look=(vs,need,lean)=>{for(const [vt,f] of vs)for(const d of sides){const rim=d>0?pb:pa;const nb=Math.max(halfAt(T),...roots.filter(q=>!q.id&&q.tree===r.tree&&q.d===d).map(q=>d*(q.pts[q.pts.length-1][0]-X)),...roots.filter(q=>q.id&&q.pts&&q.tree===r.tree&&q.d===d).map(q=>d*(q.pts[q.pts.length-1][0]-X)));
      for(let s0=rim-d*(7*kpx+looseLen),k=0;lean?k<8:d*(s0-gap(d)-X)>=nb+12*kpx;s0-=d*5*kpx,k++)for(const o of lean?[.4,.7,1]:[0]){const g=tagAt(s0-gap(d),vt+' · unused',d*o,f,o?0:d);g.c=score(g,r);g.s0=s0;g.d=d;g.t=vt;if(!best||g.c>best.c+.5)best=g;if(g.c>=need)return g}}return null};
    const hit=look(whole.slice(0,1),ok)||look(whole.slice(0,1),6*kpx)||look(whole.slice(1),6*kpx)||look(whole.slice(0,1),ok,1)||look(cut,6*kpx);if(hit)best=hit;
    if(!best){const d=r.d,s0=d>0?pb-7*kpx-looseLen:pa+7*kpx+looseLen;best=tagAt(s0-gap(d),t+' · unused',0,tfs,d);best.s0=s0;best.d=d;best.t=t}
    /* the severed root: a short length of bark from its cut face to a fine end, its centre on the soil's surface so only its
       upper half shows, the end going under */
    const d=best.d,s0=best.s0,n=16,kb=knobs(gbHash('cut:'+r.id),n);r.d=d;r.pts=[];r.w=[];
    for(let ii=0;ii<=n;ii++){const t=ii/n,x=s0+d*looseLen*t,ww=Math.max(1.5*kpx,(w0-7*kpx*Math.pow(t,.85))*(1+.06*(kb[ii][0]-1)/.13));
     r.pts.push([x,sy(x)+.7-.5*kpx*Math.sin(t*3.1416)+(t>.72?Math.pow((t-.72)/.28,1.5)*(ww*.5+1.4):0)]);r.w.push(ww)}}
   if(!best)continue;taken2.push(best.box);
   rl.push({r,x:best.x,y:best.top+best.th/2+best.f*.36,anchor:'middle',t:best.t,unused:!!r.loose,tag:true,fs:best.f,ww:best.ww,th:best.th,sx:best.sx,gy:best.gy,bot:best.bot,top:best.top,mb:[best.sx-6,best.top,best.sx+6,best.gy],
    box:[best.box[0]-16*kpx,best.box[1]-16*kpx,best.box[2]+16*kpx,best.gy+2]});x0=Math.min(x0,best.box[0]-6);x1=Math.max(x1,best.box[2]+6)}
  const stopX=rl.some(l=>l.r.stop&&l.r.ext);
  const yb=Math.max(0,...rl.filter(l=>l.below||l.note).map(l=>l.y+5));
  L={trees,xs,potL,potC,D,fh,kpx,fy,roots,rl,fs,sy,wallX,seal,x0,x1,y0:y0-8,y1:Math.max(yb,D+fh+(lone?10:12)+(stopX?10:0)),narrow,S,H0,lone};
  const need=L.x1-L.x0+24;if(need<=width||pass===5)break;H0*=Math.max(.55,Math.min(.96,Math.pow((width-24)/need,1.4)));}
 return L}

/* Wood grows out along its own spine: the finished, textured wood is uncovered from its base to its tip by a broad stroke
   drawn down the centre line, so what grows is the real limb at its real taper, never a thin worm that swells afterwards. */
function gbGrowRun(B){const P=B.grow;if(!P.length)return;const defs=B.svg.querySelector('defs');const t1=performance.now();
 /* the reveal's first frame is set now, not on the next animation frame, so a rebuild part way through never shows the
    growing wood gone for a frame; the bark's light and grain on that piece are uncovered by the same mask, never switched on */
 const at=g=>{const p=Math.max(0,Math.min(1,(t1-g.t0)/g.ms));return p};
 for(const g of P){if(!g.pts||!defs)continue;const id='gbgm'+gw.gbN+'-'+(B.gm=(B.gm||0)+1);const p0=at(g);if(p0>0)g.on=true;
  const sp=sv('path',{d:gbLine(g.pts),fill:'none',stroke:'#fff','stroke-width':gbF(Math.max(...g.w)*1.15+8),'stroke-linecap':'round','stroke-linejoin':'round','stroke-opacity':p0>0?1:0,pathLength:1000,'stroke-dasharray':'1000 1001','stroke-dashoffset':gbF(1000*Math.pow(1-p0,2.2))});
  g.m=sv('mask',{id,maskUnits:'userSpaceOnUse',x:-10000,y:-10000,width:20000,height:20000},sp);g.sp=sp;defs.append(g.m);for(const e of [g.el,...(g.el.__also||[])])e.setAttribute('mask','url(#'+id+')')}
 const end=Math.max(...P.map(g=>g.t0+g.ms));const fin=g=>{g.done=true;for(const e of [g.el,...(g.el.__also||[])])e.removeAttribute('mask');if(g.m)g.m.remove()};
 const step=now=>{if(gw.B!==B)return;for(const g of P){if(g.done||!g.sp)continue;const p=(now-g.t0)/g.ms;if(p<=0)continue;if(p>=1){fin(g);continue}if(!g.on){g.on=true;g.sp.setAttribute('stroke-opacity',1)}g.sp.setAttribute('stroke-dashoffset',gbF(1000*Math.pow(1-p,2.2)))}
  if(now<end+30)requestAnimationFrame(step);else for(const g of P)if(!g.done&&g.sp)fin(g)};requestAnimationFrame(step)}

/* Build the SVG once per shape; later paints only move leaves and toggle classes. */
function gbBuild(M,width,key,sap){const s=gw.state;const L=gbLayout(M,width,sap);const quiet=gwQuiet(),now=performance.now();const N=gw.gbN=(gw.gbN||0)+1;
 const W=Math.max(width,L.x1-L.x0+24),vx=(L.x0+L.x1)/2-W/2,vy=L.y0-14,VH=L.y1-vy+8;
 const svg=sv('svg',{class:'gw-svg gb'+(L.narrow&&!sap?' nw':''),tabindex:'-1',viewBox:gbF(vx)+' '+gbF(vy)+' '+gbF(W)+' '+gbF(VH),role:'group','aria-label':'The change as a bonsai: each branch is an end-to-end journey, each leaf one of its scenarios, knots are the files it passes through, roots what it depends on'});
 const defs=sv('defs',{});const clipId='gb-wood'+N,softId='gb-soft'+N;const clip=sv('clipPath',{id:clipId});
 defs.append(clip,sv('filter',{id:softId,x:'-10%',y:'-10%',width:'120%',height:'120%'},sv('feGaussianBlur',{stdDeviation:'2.2'})));svg.append(defs);
 /* foliage is lit from above: the crest lighter, the body its own green, the underside in shade */
 const padG='gb-pad'+N;defs.append(sv('pattern',{id:padG+'s',patternUnits:'userSpaceOnUse',width:31,height:23},...[[10.0,3.5,-58,'s',1.6],[11.3,1.3,59,'s',1.2],[13.0,5.5,38,'s',1.7],[29.4,14.5,-55,'s',1.5],[30.3,1.1,-36,'s',1.2],[3.7,7.1,-24,'s',1.7],[5.8,2.2,-54,'s',1.7],[15.4,12.2,10,'s',2.0],[11.2,5.7,-24,'l',1.3],[17.8,12.1,17,'l',1.4],[30.4,2.7,37,'s',1.4],[28.9,9.7,-51,'l',1.7],[27.1,7.2,19,'s',1.7],[14.1,19.3,-1,'s',1.8],[1.9,16.1,44,'s',1.5],[20.7,0.5,48,'s',1.7],[15.3,5.0,3,'s',1.3],[12.1,20.0,-50,'s',1.5],[8.6,3.1,40,'l',1.4],[12.9,8.3,27,'l',1.3],[5.5,5.3,-11,'s',1.9],[5.7,6.5,-33,'s',1.5],[17.6,21.9,61,'l',1.8],[22.9,10.5,30,'s',1.5],[14.9,9.2,-22,'s',1.3],[5.0,7.8,-57,'s',1.7]].map(([x,y,a,c,rx])=>sv('ellipse',{cx:x,cy:y,rx,ry:rx*.5,transform:'rotate('+a+' '+x+' '+y+')',class:'st'+c}))));defs.append(sv('linearGradient',{id:padG,x1:0,y1:0,x2:0,y2:1},sv('stop',{offset:0,style:'stop-color:var(--pad-lit)'}),sv('stop',{offset:.55,style:'stop-color:var(--pad)'}),sv('stop',{offset:1,style:'stop-color:var(--pad-shade)'})));
 /* the traced route is drawn over everything, but where it runs inside a pad it shows faintly, as sap under foliage */
 const rmId='gb-rm'+N,rMask=sv('mask',{id:rmId,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)},sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'#fff'}));defs.append(rMask);
 const B={key,L,svg,grow:[],anim:[],pad:{},padsOf:{},brEl:{},leaf:{},clump:{},bud:{},budG:{},knot:{},klbl:{},root:{},lbl:{},vein:{},pos:{},nav:[],navEl:{},cur:{},jinEl:{}};
 const lay=n=>{const g=sv('g',{class:n});svg.append(g);return g};
 /* a shoot grows out from under the bark, so it is drawn before the wood */
 const gPot=lay('pots'),gBack=lay('back'),gRoot=lay('roots'),gJin=lay('jins'),gBud=lay('buds'),gWood=lay('wood');
 const gLight=sv('g',{'clip-path':'url(#'+clipId+')',filter:'url(#'+softId+')'}),gGrain=sv('g',{'clip-path':'url(#'+clipId+')'});svg.append(gLight,gGrain);
 /* a root that goes over the rim lies on the soil, but starts behind the trunk: the trunks mask it */
 const gSoil=lay('soil'),gRootX=lay('rootsx'),rxId='gb-rx'+N,rxMask=sv('mask',{id:rxId,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)},sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'#fff'}));defs.append(rxMask);gRootX.setAttribute('mask','url(#'+rxId+')');
 /* the traced route is drawn over the wood, so it is never lost under a branch; inside a pad it shows faintly (the mask),
    as sap under foliage */
 const gFront=lay('front'),gSap=sv('g',{class:'sapl',mask:'url(#'+rmId+')'});svg.append(gSap);const gKn=lay('knots'),gVein=lay('veins'),gLbl=lay('labels'),gKl=lay('klabels'),gCur=lay('cur');
 B.gCur=gCur;B.gBud=gBud;B.gWood=gWood;B.sapU=sv('path',{class:'sapu',d:''});B.sap=sv('path',{class:'sap',d:''});B.sapX=sv('path',{class:'sap rest',d:''});B.sapW=sv('path',{class:'sap bad',d:''});gSap.append(B.sapU,B.sapX,B.sap,B.sapW);
 B.lead=sv('path',{class:'tiplead',d:''});gCur.append(B.lead);
 /* an animation that has not finished yet: started at its first build, continued by any rebuild */
 const anim=(k,el,delay,ms,kind)=>{if(quiet)return;const t0=gbT(k,delay);if(now-t0>=ms)return;if(kind==='grow')B.grow.push({el,t0,ms,pts:el.__pts,w:el.__w,floor:el.__floor});else B.anim.push([el,t0-now,ms,kind])};
 const piece=(id,pts,w,cls,parent,delay,ms,floor)=>{const d=gbRib(pts,w,0,pts.length-1,floor);const p=sv('path',{d,class:cls});p.__pts=pts;p.__w=w;p.__floor=floor;parent.append(p);clip.append(sv('path',{d}));anim('wood:'+id,p,delay,ms,'grow');return p};
 /* bark: the lit side and the shaded side, softened so they read as roundness, not as stripes; and a few strands of grain */
 const shade=(pts,w,from,parent)=>{const s1=gbSide(pts);parent.append(sv('path',{d:gbBand(pts,w,s1*.2,s1*.98,from),class:'lt'}),sv('path',{d:gbBand(pts,w,-s1*.38,-s1*1.06,from),class:'sh'}))};
 const grain=(pts,w,seed,parent)=>{const r=gbRng(seed);for(const f of [-.6,-.2,.22,.58]){const ph=r()*6.28,a=Math.floor(pts.length*(.02+.08*r())),e=Math.floor(pts.length*(.7+.25*r()));
   const q=pts.slice(a,e).map((p,i)=>{const n=gbNorm(pts,i+a),o=w[i+a]*.5*(f+.07*Math.sin(i*.25+ph));return[p[0]+n[0]*o,p[1]+n[1]*o]}).filter((_,i)=>i%2===0);if(q.length>2)parent.append(sv('path',{d:gbLine(gbSmooth(q,1)),class:'grain'}))}};
 const ribFlat=(pts,w)=>{const A=[],Z=[];pts.forEach((q,i)=>{const n=gbNorm(pts,i),h=w[i]/2;A.push([q[0]+n[0]*h,q[1]+n[1]*h]);Z.push([q[0]-n[0]*h,q[1]-n[1]*h])});return 'M'+A.map(gbP).join(' L')+' L'+Z.reverse().map(gbP).join(' L')+'Z'};
 /* the pot: an unglazed rectangle, about as deep as the trunk is thick, with a two-unit lip and splayed feet, or a small round
    bowl for a lone literati; inside it a mound of soil with low mounds of moss, which the roots lie in and the trunk rises out of */
 const pc=L.potC,pl=L.potL,D=L.D,lone=L.lone,pa=pc-pl/2,pb=pc+pl/2,fh=L.fh||5,kx=L.kpx||1;
 const gid='gb-pot'+N,vid='gb-potv'+N,sid='gb-potsh'+N,soid='gb-soil'+N;const pw=lone?pl/2:pl/2;
 /* unglazed clay lit from the left like the wood, a shadow under the lip, and a soft shadow on the ground */
 defs.append(sv('linearGradient',{id:gid,gradientUnits:'userSpaceOnUse',x1:gbF(pc-pw),y1:'0',x2:gbF(pc+pw),y2:'0'},sv('stop',{offset:0,style:'stop-color:var(--pot-lit)'}),sv('stop',{offset:.4,style:'stop-color:var(--pot)'}),sv('stop',{offset:1,style:'stop-color:var(--pot-dk)'})),
  sv('linearGradient',{id:vid,x1:0,y1:0,x2:0,y2:1},sv('stop',{offset:0,style:'stop-color:#000;stop-opacity:.2'}),sv('stop',{offset:1,style:'stop-color:#000;stop-opacity:0'})),
  sv('radialGradient',{id:sid},sv('stop',{offset:0,style:'stop-color:#000;stop-opacity:.16'}),sv('stop',{offset:1,style:'stop-color:#000;stop-opacity:0'})),
  sv('linearGradient',{id:soid,gradientUnits:'userSpaceOnUse',x1:'0',y1:'-9',x2:'0',y2:'3'},sv('stop',{offset:0,style:'stop-color:var(--soil-lit)'}),sv('stop',{offset:1,style:'stop-color:var(--soil-c)'})));
 if(lone){const r=pl/2;gPot.append(sv('ellipse',{cx:gbF(pc),cy:gbF(D+3.5),rx:gbF(r*.8),ry:3.5,fill:'url(#'+sid+')'}),sv('path',{class:'pot-ft',d:'M'+gbF(pc-r*.3)+' '+gbF(D)+' L'+gbF(pc+r*.3)+' '+gbF(D)+' L'+gbF(pc+r*.27)+' '+gbF(D+3.4)+' L'+gbF(pc-r*.27)+' '+gbF(D+3.4)+'Z'}),
   sv('path',{fill:'url(#'+gid+')',d:'M'+gbF(pc-r)+' 1 L'+gbF(pc+r)+' 1 Q'+gbF(pc+r*.96)+' '+gbF(D)+' '+gbF(pc+r*.55)+' '+gbF(D+2)+' L'+gbF(pc-r*.55)+' '+gbF(D+2)+' Q'+gbF(pc-r*.96)+' '+gbF(D)+' '+gbF(pc-r)+' 1Z'}),
   sv('rect',{x:gbF(pc-r+1),y:2.2,width:gbF(2*r-2),height:5,fill:'url(#'+vid+')'}))}
 else{const f=Math.max(12,.075*pl);
  /* splayed feet under the ends: tucked under the pot, their outer sides leaning out, so it stands wide and steady */
  const foot=(xo,dd)=>{const xi=xo-dd*f,yb=D+fh;return 'M'+gbF(xi)+' '+gbF(D-1)+' L'+gbF(xo)+' '+gbF(D-1)+' L'+gbF(xo+dd*.55*fh)+' '+gbF(yb-1.2)+' Q'+gbF(xo+dd*.62*fh)+' '+gbF(yb)+' '+gbF(xo+dd*(.62*fh-1.4))+' '+gbF(yb)+
   ' L'+gbF(xi+dd*1.6)+' '+gbF(yb)+' C'+gbF(xi+dd*.4)+' '+gbF(yb)+' '+gbF(xi)+' '+gbF(D+fh*.55)+' '+gbF(xi)+' '+gbF(D-1)+'Z'};
  gPot.append(sv('ellipse',{cx:gbF(pc),cy:gbF(D+fh+.6),rx:gbF(pl/2+10),ry:4.4,fill:'url(#'+sid+')'}),sv('path',{class:'pot-ft',d:foot(pa+.085*pl,-1)}),sv('path',{class:'pot-ft',d:foot(pb-.085*pl,1)}),
   sv('path',{fill:'url(#'+gid+')',d:'M'+gbF(pa+.5)+' 2 L'+gbF(pb-.5)+' 2 L'+gbF(pb-4.6)+' '+gbF(D-2)+' Q'+gbF(pb-5)+' '+gbF(D)+' '+gbF(pb-7)+' '+gbF(D)+' L'+gbF(pa+7)+' '+gbF(D)+' Q'+gbF(pa+5)+' '+gbF(D)+' '+gbF(pa+4.6)+' '+gbF(D-2)+'Z'}),
   sv('rect',{x:gbF(pa+1),y:2,width:gbF(pl-2),height:gbF(Math.min(8,D*.24)),fill:'url(#'+vid+')'}),
   /* a fine incised band just above the foot, as on a Tokoname pot */
   sv('path',{class:'pot-inc',d:'M'+gbF(pa+5.4)+' '+gbF(D-3.4)+' L'+gbF(pb-5.4)+' '+gbF(D-3.4)}),sv('path',{class:'pot-inc lit',d:'M'+gbF(pa+5.5)+' '+gbF(D-2.6)+' L'+gbF(pb-5.5)+' '+gbF(D-2.6)}))}
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
 const airId='gb-air'+N,lx=lone?2.5:1.5;{let g='M'+gbF(pa-lx)+' -1';for(let i=0;i<=48;i++){const x=pa+1.5+(pl-3)*i/48;g+=' L'+gbF(x)+' '+gbF(Math.min(-1,L.sy(x)+.7))}
  g+=' L'+gbF(pb+lx)+' -1 L'+gbF(pb+lx)+' '+gbF(D+fh+2)+' L'+gbF(pa-lx)+' '+gbF(D+fh+2)+'Z';
  defs.append(sv('clipPath',{id:airId},sv('path',{'clip-rule':'evenodd',d:'M'+gbF(vx-10)+' '+gbF(vy-10)+' L'+gbF(vx+W+10)+' '+gbF(vy-10)+' L'+gbF(vx+W+10)+' '+gbF(vy+VH+10)+' L'+gbF(vx-10)+' '+gbF(vy+VH+10)+'Z '+g})));
  defs.append(sv('clipPath',{id:airId+'p'},sv('path',{'clip-rule':'evenodd',d:'M'+gbF(vx-10)+' '+gbF(vy-10)+' L'+gbF(vx+W+10)+' '+gbF(vy-10)+' L'+gbF(vx+W+10)+' '+gbF(vy+VH+10)+' L'+gbF(vx-10)+' '+gbF(vy+VH+10)+'Z M'+gbF(pa-lx)+' -1 L'+gbF(pb+lx)+' -1 L'+gbF(pb+lx)+' '+gbF(D+fh+2)+' L'+gbF(pa-lx)+' '+gbF(D+fh+2)+'Z'})));
  const kl=svg.querySelector(':scope>g.knots');if(kl&&!kl.hasAttribute('clip-path'))kl.setAttribute('clip-path','url(#'+airId+')')}
 /* moss in four to six low mounds of mixed sizes on both sides of the trunk where there is room (two on a small bowl): each a
    few overlapping irregular ellipses in two greens, a darker underside and a lighter rim along the top, clipped at the soil;
    never against the trunk, a root, a stake or a name */
 {const r=gbRng(gbHash('moss:'+key)),mk=Math.sqrt(kx);
  const busy=(a,b)=>L.xs.some((X,i)=>b>X-.62*L.trees[i].D-6&&a<X+.62*L.trees[i].D+6)||L.roots.some(q=>q.pts&&q.pts.some((p,ii)=>p[0]>a-(q.loose?9:5)&&p[0]<b+(q.loose?9:5)&&p[1]-q.w[ii]/2<L.sy(p[0])+.4))||L.rl.some(l=>l.mb&&b>l.mb[0]-5&&a<l.mb[2]+5);
  /* the soil that is clear runs between the trunk, the roots and the stakes; the mounds go to the roomiest runs, a side
     at a time, sized to fit and spaced unevenly so they never stand in a row */
  const want=lone?2:pl>300?6:pl>180?5:4,mw0=(lone?14:21)*mk,mwn=(lone?8:9)*mk,gap=5*mk,X0=L.xs[0],runs=[];
  {let s0=null;for(let x=Math.ceil(pa+6);x<=pb-6;x++){const ok=x+1<=pb-7&&!busy(x,x+1);if(ok&&s0===null)s0=x;if(!ok&&s0!==null){runs.push({a:s0,b:x,n:0});s0=null}}}
  const cap=R=>R.b-R.a<mwn?0:Math.min(3,Math.floor((R.b-R.a+gap)/(mwn+gap))),onSide=R=>runs.filter(Q=>(Q.a<X0)===(R.a<X0)).reduce((t,Q)=>t+Q.n,0);
  for(let k=0;k<want;k++){let best=null,bs=-Infinity;for(const R of runs){if(R.n>=cap(R))continue;const sc=(R.b-R.a)/(R.n+1)-40*onSide(R);if(sc>bs){bs=sc;best=R}}if(!best)break;best.n++}
  const pick=[];for(const R of runs){if(!R.n)continue;const len=R.b-R.a,ws=[];for(let i=0;i<R.n;i++)ws.push(mw0*(i%2?.45+r()*.25:.85+r()*.4));if(r()<.5)ws.reverse();
   {const room=len-(R.n-1)*gap,tot=ws.reduce((t,w)=>t+w,0);if(tot>room)for(let i=0;i<R.n;i++)ws[i]=Math.max(mwn,ws[i]*room/tot)}
   const slack=Math.max(0,len-ws.reduce((t,w)=>t+w,0)-(R.n-1)*gap),wt=[];for(let i=0;i<=R.n;i++)wt.push(.3+r());const wsum=wt.reduce((t,w)=>t+w,0);
   let x=R.a;for(let i=0;i<R.n;i++){x+=slack*wt[i]/wsum;pick.push([x+ws[i]/2,ws[i]]);x+=ws[i]+gap}}
  for(const [x,mw] of pick){const n=4+Math.floor(r()*6),mh=(1.8+r()*2.2)*mk*Math.min(1,mw/(18*mk)),es=[];
   for(let e=0;e<n;e++){const u=(e+.15+r()*.7)/n,pr=Math.sin(Math.PI*u),rx=Math.min(mw*.34,(3+r()*4)*mk*(.7+.4*pr)),qx=Math.max(x-mw/2+rx*.85,Math.min(x+mw/2-rx*.85,x-mw/2+u*mw)),ry=(1.5+r()*1.1)*mk*(.75+.3*pr);
    es.push([qx,L.sy(qx)+.9-ry*.5-pr*mh*.45-(e%2?ry*.35:0)+(r()-.5)*.9,rx,ry,(r()-.5)*36,r()<.45?'mc2':'mc1'])}
   const el=(q,dy,c)=>sv('ellipse',{class:c,cx:gbF(q[0]),cy:gbF(q[1]+dy),rx:gbF(q[2]),ry:gbF(q[3]),transform:'rotate('+gbF(q[4])+' '+gbF(q[0])+' '+gbF(q[1]+dy)+')'});
   const g=sv('g',{class:'mc','clip-path':'url(#'+airId+')'});for(const q of es)g.append(el(q,-.55,'mc3'));for(const q of es)g.append(el(q,.85,'mc0'));for(const q of es)g.append(el(q,0,q[5]));gSoil.append(g)}}
 /* the lip, over the soil's edge: the same clay, lit along its top, with a dark line where it overhangs the wall */
 gSoil.append(sv('g',{class:'lip'},sv('rect',{x:gbF(pa-lx),y:-1,width:gbF(pl+2*lx),height:lone?3.4:3.2,rx:1.2,fill:'url(#'+gid+')'}),
  sv('path',{class:'lip-hi',d:'M'+gbF(pa-lx+.9)+' -.45 L'+gbF(pb+lx-.9)+' -.45'}),sv('path',{class:'lip-lo',d:'M'+gbF(pa-lx+.6)+' '+(lone?'2.1':'1.9')+' L'+gbF(pb+lx-.6)+' '+(lone?'2.1':'1.9')})));
 /* the pot is the repository: its name pressed into the clay at the face's lower right, about six units above the foot
    (centred on a small bowl): no chip, just letters cut into the face, their upper edge in shadow and their lower edge
    catching the light */
 if(L.seal){const q=L.seal,n=q.lines.length;
  const tx=(dx,dy,c)=>q.lines.map((t,i)=>sv('text',{x:gbF(q.x+dx),y:gbF(q.y-(n-1-i)*q.lh+dy),'text-anchor':q.an,class:c,style:'font-size:'+gbF(q.fs)+'px'},t));
  gPot.append(sv('g',{class:'seal','aria-hidden':'true','data-room':gbF(q.room)},...tx(-.5,-.5,'sd'),...tx(.5,.5,'sl'),...tx(0,0,'sm')))}
 /* roots: the nebari first, then the named ones over them; a third party's goes over the lip, so it is drawn after it */
 L.roots.forEach((r,i)=>{if(!r.pts)return;const id='r'+i+(r.id?':'+r.id:'');const g=sv('g',r.id?{class:'rt dep'+(r.ext?' ext':' store')+(r.loose?' loose':'')+(r.stop?' stop':''),'data-k':'u:'+r.id,tabindex:-1,role:'button','aria-label':M.U[r.id].label+', what the change depends on'+(r.loose?', on no journey':'')+(r.stop?', where tracing stops':'')}:{class:'nbf'+(r.front?' fr':'')});
  if(!r.ext)g.setAttribute('clip-path','url(#'+airId+'p)');
  /* a severed root is sunk to half its depth: only what stands above the soil's surface shows, its cut face a half moon */
  const body=r.loose?sv('g',{class:'rsev','clip-path':'url(#'+airId+')'}):g;if(r.loose)g.append(body);
  const pts=r.pts,n=pts.length;const delay=r.tree*250+80;const wd=piece(id,pts,r.w,'w',body,delay,520);
  /* a root's upper side catches the light, which parts each finger from the one behind it, and its upper edge carries a fine
     rim light, so on a dark page it stands off the soil and the night */
  if(!r.loose){const m=gbNorm(pts,Math.floor(n*.35)),up=m[1]<0?1:-1,hl=sv('path',{class:'rhi',d:gbBand(pts.slice(0,r.ext?Math.ceil(n*.62):n),r.w,up*.25,up*.9)}),rim=sv('path',{class:'rlim',d:gbBand(pts,r.w,up*.74,up*1.04)});g.append(hl,rim);anim('rhi:'+id,hl,delay+520,300,'fade');anim('rlim:'+id,rim,delay+520,300,'fade')}
  /* a severed root ends in a cut face: pale wood with two growth rings, cut on a slant so it shows */
  if(r.loose)wd.before(sv('path',{d:wd.getAttribute('d'),class:'rbed'}));
  if(r.loose){const c=pts[0],w0=r.w[0],a=Math.atan2(pts[2][1]-c[1],pts[2][0]-c[0])*180/Math.PI,rx=w0*.42,ry=w0*.54,arc=(k,a0,a1)=>{const p=t=>[c[0]+Math.cos(t)*rx*k,c[1]+Math.sin(t)*ry*k];return 'M'+gbP(p(a0))+' A'+gbF(rx*k)+' '+gbF(ry*k)+' 0 1 1 '+gbP(p(a1))};
   body.append(sv('g',{class:'rcutg',transform:'rotate('+gbF(a)+' '+gbP(c)+')'},sv('ellipse',{class:'rcut',cx:gbF(c[0]),cy:gbF(c[1]),rx:gbF(rx),ry:gbF(ry)}),sv('path',{class:'rring2',d:arc(.64,-2.2,1.9)}),sv('path',{class:'rring2',d:arc(.3,-1.4,2.6)})))}
  if(r.id){body.insertBefore(sv('path',{d:wd.getAttribute('d'),class:'rring','clip-path':'url(#'+airId+')'}),body.firstChild);
   g.append(sv('path',{d:gbLine(pts),class:'hitl','stroke-width':14}));
   if(r.stop){const e=pts[n-1];const z=r.ext?[L.wallX(r.d,D+11)+r.d*1.9,D+11]:[e[0]+r.d*2,e[1]+7];const gid='gb-fade'+N+'-'+i;
    defs.append(sv('linearGradient',{id:gid,gradientUnits:'userSpaceOnUse',x1:gbF(e[0]),y1:gbF(e[1]),x2:gbF(z[0]),y2:gbF(z[1])},sv('stop',{offset:0,style:'stop-color:var(--muted);stop-opacity:1'}),sv('stop',{offset:1,style:'stop-color:var(--muted);stop-opacity:.15'})));
    const tl=sv('g',{class:'tailg'},sv('path',{class:'tail',d:'M'+gbP(e)+' L'+gbP(z),stroke:'url(#'+gid+')'}),sv('circle',{class:'tailend',cx:gbF(z[0]),cy:gbF(z[1]+2.2),r:1.9}));g.append(tl);anim('tail:'+id,tl,delay+520,300,'fade')}
   B.root[r.id]=g;B.pos[r.id]=pts[Math.min(n-1,Math.floor(n*(r.ext?.5:.6)))];B.nav.push('u:'+r.id);B.navEl['u:'+r.id]=g}
  /* a store's plant tag: a small rounded tag on a wooden stake pushed into the soil, its foot cut off at the soil */
  if(r.id&&!r.ext){const l=L.rl.find(q=>q.r===r&&q.tag);if(l){
   const tg=sv('g',{class:'ptag'},sv('path',{class:'stake','clip-path':'url(#'+airId+')','stroke-width':gbF(1.35*kx),d:'M'+gbP([l.sx,l.gy+3.6*kx])+' L'+gbP([l.sx,l.bot+1])}),sv('rect',{class:'tag',x:gbF(l.x-l.ww/2),y:gbF(l.top),width:gbF(l.ww),height:gbF(l.th),rx:gbF(2.6*kx)}));g.append(tg);anim('stake:'+id,tg,delay+560,300,'fade')}}
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
 for(const l of L.rl){const t=sv('text',{x:gbF(l.x),y:gbF(l.y),'text-anchor':l.anchor,class:'rlbl'+(l.tag?' tg':'')+(l.note?' nt':''),style:'font-size:'+gbF(l.fs||L.fs)+'px'},l.t,l.unused?sv('tspan',{class:'nt'},' · unused'):null);(B.root[l.r.id]||gRoot).append(t);anim('rl:'+l.r.id,t,l.r.tree*250+560,300,'fade')}
 let lightAt=0;
 /* trees */
 L.trees.forEach((T,ti)=>{const X=L.xs[ti];const sh=q=>[q[0]+X,q[1]];const base=ti*250;const tp=T.tp.map(sh);
  /* everything on a tree grows in step with its trunk: when the trunk regrows (a journey joined it), so does all it carries,
     so nothing stands where the wood has not reached yet */
  const gk='@'+ti+':'+T.js.map(j=>j.id).join(',');
  const tdur=sap?900:1100;const tkw=piece('t'+gk,tp,T.tw,'w',gWood,base,tdur,1.5);rxMask.append(sv('path',{d:gbRib(tp,T.tw),fill:'#000'}));if(!sap){/* the growth mask goes outside the softening, so the growing end stays crisp */const tcid='gb-tc'+N+'-'+ti;defs.append(sv('clipPath',{id:tcid},sv('path',{d:gbRib(tp,T.tw,0,tp.length-1,1.5)})));const tl=sv('g',{}),tli=sv('g',{'clip-path':'url(#'+tcid+')',filter:'url(#'+softId+')'}),tgr=sv('g',{});tl.append(tli);gLight.after(tl);gGrain.append(tgr);shade(tp,T.tw,2,tli);grain(tp,T.tw,gbHash('grain:'+T.key),tgr);tkw.__also=[tl,tgr]}lightAt=Math.max(lightAt,base+tdur);
  /* times on this tree run from when its trunk really started (a rebuild part way through keeps that clock), so a branch,
     twig, knot or cushion first seen in a later build still keeps step with the wood it grows on */
  const tS=gbT('wood:t'+gk,base)-now,at=t=>tS+tdur*Math.pow(Math.max(0,t),.9)*.92;
  /* while the change is still being traced the tree is a sapling, with a bud at its tip */
  if(sap){const tt=tp[tp.length-1],t0=tp[tp.length-4],a=Math.atan2(tt[1]-t0[1],tt[0]-t0[0])*180/Math.PI;const bd=sv('g',{class:'tipbud'});
   for(const da of [-34,30])bd.append(sv('path',{d:gbLeafD(11,5.6),transform:'translate('+gbP(tt)+') rotate('+gbF(a+da)+') translate(5.5 0)'}));gWood.append(bd);anim('tipbud:'+ti,bd,base+tdur-160,320,'fade')}
  /* jin: changed parts no journey reaches, as bleached deadwood on the back of the main trunk */
  if(!ti&&!sap){M.jin.slice(0,3).forEach((u,i)=>{const t=.15+.075*i,k=gbNear(T.ty,t),p=tp[k],d=i%2?T.S:-T.S,len=.07*T.H;const a=55*Math.PI/180;
    const pts=gbBez([p,[p[0]+d*len*.35,p[1]-len*.1],[p[0]+d*len*.7,p[1]-len*.5],[p[0]+d*Math.cos(a)*len,p[1]-Math.sin(a)*len]],10);const w=pts.map((q,ii)=>Math.max(1.4,5.2*(1-ii/10*.75)));
    const g=sv('g',{class:'jn','data-k':'u:'+u.id,tabindex:-1,role:'button','aria-label':u.label+': changed, but no journey in this change reaches it'});
    piece('j'+ti+'-'+u.id+gk,pts,w,'jin',g,at(t),500);g.append(sv('circle',{cx:gbF(pts[10][0]),cy:gbF(pts[10][1]),r:9,class:'hitc'}));gJin.append(g);B.jinEl[u.id]=g;B.pos[u.id]=pts[10];B.nav.push('u:'+u.id);B.navEl['u:'+u.id]=g})}
  /* one group per pad: its branch, branchlets, knots, foliage and leaves, so dimming or pruning a journey treats it as one thing */
  const JG={};for(const pd of [...T.padList.slice(1).sort((a,b)=>a.b.h-b.b.h),T.padList[0]]){const back=pd.b&&pd.b.back;const jg=sv('g',{class:'jg'+(pd.crown?' crown':''),'data-pad':pd.id});(back?gBack:gFront).append(jg);JG[pd.id]=jg}
  /* branches: the wood fades in from the trunk's edge so the joint has no seam, a collar fills the crotch, branchlets fork
     up into the pad, and pruning leaves a short stub with a flat cut */
  for(const b of T.br){const pts=b.pts.map(sh),id='b'+ti+':'+b.id+gk,jg=JG[b.id];const delay=at(b.h),ms=380+1.5*b.len;const old=b.back?' old':'';
   const mid='gb-bm'+N+'-'+ti+'-'+b.i,e0=pts[gbNear(b.acc,b.Tk*.2)],e1=pts[gbNear(b.acc,b.Tk*.5+1)];
   defs.append(sv('linearGradient',{id:mid+'g',gradientUnits:'userSpaceOnUse',x1:gbF(e0[0]),y1:gbF(e0[1]),x2:gbF(e1[0]),y2:gbF(e1[1])},sv('stop',{offset:'0','stop-color':'#fff','stop-opacity':'0'}),sv('stop',{offset:'1','stop-color':'#fff','stop-opacity':'1'})),
    sv('mask',{id:mid,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)},sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'url(#'+mid+'g)'})));
   const wg=sv('g',{class:'brg',mask:'url(#'+mid+')'});jg.append(wg);const bwd=piece(id,pts,b.w,'w'+old,wg,delay,ms);lightAt=Math.max(lightAt,delay+ms);
   if(!b.back){const bl=sv('g',{'clip-path':'url(#'+clipId+')',filter:'url(#'+softId+')'});wg.append(bl);shade(pts,b.w,b.exit,bl);bwd.__also=[bl]}
   const k=b.k,c=tp[k],tn=gbNorm(tp,k),sgn=(tn[0]*b.dir>0)?1:-1;const edge=kk=>{const q=tp[Math.max(0,Math.min(tp.length-1,kk))],n=gbNorm(tp,kk),hw=T.tw[Math.max(0,Math.min(tp.length-1,kk))]/2*sgn;return[q[0]+n[0]*hw,q[1]+n[1]*hw]};
   const up=Math.max(2,Math.round(.75*b.b/((T.Ht*1.05)/96))),dn=Math.max(1,Math.round(.5*b.b/((T.Ht*1.05)/96)));
   const eo=b.exit,bn=gbNorm(pts,eo+2),ub=bn[1]<0?1:-1;const bE=(ii,s1)=>{const q=pts[Math.min(pts.length-1,ii)],n=gbNorm(pts,ii),hw=b.w[Math.min(pts.length-1,ii)]/2*s1;return[q[0]+n[0]*hw,q[1]+n[1]*hw]};
   const A=edge(k+up),Bp=bE(eo+3,ub),Cc=bE(eo,ub),A2=edge(k-dn),B2=bE(eo+2,-ub),C2=bE(eo,-ub);
   const fil=(a,bb,cc)=>{const mid2=[(a[0]+bb[0])/2,(a[1]+bb[1])/2],ctl=[cc[0]+(mid2[0]-cc[0])*.45,cc[1]+(mid2[1]-cc[1])*.45];return 'M'+gbP(a)+' Q'+gbP(ctl)+' '+gbP(bb)+' L'+gbP(pts[Math.min(pts.length-1,eo+3)])+' L'+gbP(c)+'Z'};
   for(const f of [fil(A,Bp,Cc),fil(A2,B2,C2)]){const fp=sv('path',{d:f,class:'w'+old});(b.back?wg:gWood).append(fp);clip.append(sv('path',{d:f}));anim('fil:'+id+f.length,fp,delay+ms*.25,240,'fade');
    /* the crotch sits in the shade of the branch above it, so the trunk's lit side does not run on into it as a pale wedge */
    if(!b.back){const fs=sv('path',{d:f,class:'filsh'});gGrain.append(fs);anim('filsh:'+id+f.length,fs,delay+ms*.25,240,'fade')}}
   b.twigs.forEach((t,tk)=>{const tpp=t.pts.map(sh);const tw=sv('path',{d:gbRib(tpp,t.w),class:'tw'+old});tw.__pts=tpp;tw.__w=t.w;jg.append(tw);/* a twig starts once the growing branch has reached its base (the branch grows on an ease-out) */
    const ts=gbT('wood:'+id,delay)-now+ms*(1-Math.pow(1-Math.min(1,t.at+.04),1/2.2));anim('tw:'+id+':'+tk,tw,ts,320,'grow');
    /* the cushion this twig carries shows only once the twig has grown to it */
    const ce=(B.cEnd=B.cEnd||{})[b.id]=B.cEnd[b.id]||{};if(t.k!==undefined)ce[t.k]=Math.max(ce[t.k]||0,ts+320)});
   ((B.cEnd=B.cEnd||{})[b.id]=B.cEnd[b.id]||{}).br=gbT('wood:'+id,delay)-now+ms;
   /* the stub a pruning leaves: 20 to 30 px of the branch, cut square, its cut face showing, with how many scenarios it held */
   const pdl=T.pads[b.id].leaves.length;const sA=gbNear(b.acc,b.Tk*.42),sZ=gbNear(b.acc,b.Tk/2+Math.min(30,Math.max(20,b.len*.2)));const sp=pts.slice(sA,sZ+1),sw=b.w.slice(sA,sZ+1).map(v=>v*.92);
   const ez=sp[sp.length-1],en=gbNorm(sp,sp.length-1),ea=Math.atan2(en[1],en[0])*180/Math.PI,ewz=sw[sw.length-1];const lx=[ez[0]+b.dir*7,ez[1]+4];
   const stub=sv('g',{class:'stub','data-k':'j:'+b.j.id,'data-pad':b.id},sv('path',{d:ribFlat(sp,sw),class:'sw'}),
    sv('ellipse',{cx:gbF(ez[0]),cy:gbF(ez[1]),rx:gbF(ewz/2),ry:gbF(Math.max(1.4,ewz*.2)),transform:'rotate('+gbF(ea)+' '+gbP(ez)+')',class:'cutf'}),
    sv('text',{x:gbF(lx[0]),y:gbF(lx[1]),'text-anchor':b.dir>0?'start':'end',class:'mlbl'},pdl+' pruned'),sv('circle',{cx:gbF(ez[0]),cy:gbF(ez[1]),r:16,class:'hitc'}));
   gWood.append(stub);
   /* the cut a mode will make, shown while that mode is previewed */
   const qi=gbNear(b.acc,b.Tk/2+12),q=pts[qi],qn=gbNorm(pts,qi),qh=b.w[qi]/2+6;const cutmk=sv('path',{class:'cutmk',d:'M'+gbP([q[0]-qn[0]*qh,q[1]-qn[1]*qh])+' L'+gbP([q[0]+qn[0]*qh,q[1]+qn[1]*qh])});
   const cuttag=sv('text',{x:gbF(q[0]),y:gbF(q[1]-qh-5),'text-anchor':'middle',class:'cuttag'},'');gKn.append(cutmk,cuttag);
   jg.append(sv('path',{d:gbLine(pts.slice(b.exit,Math.round(.6*(pts.length-1)))),class:'hitl','stroke-width':16,'data-k':'j:'+b.j.id,'data-pad':b.id}));
   B.brEl[b.id]={g:wg,jg,stub,cutmk,cuttag}}
  /* the leader forks into the crown */
  T.ctw.forEach((t,tk)=>{const tpp=t.pts.map(sh);const tw=sv('path',{d:gbRib(tpp,t.w),class:'tw'});tw.__pts=tpp;tw.__w=t.w;JG[T.apex.id].append(tw);anim('ctw:'+ti+':'+tk+gk,tw,tS+tdur*.9,320,'grow');const ce=(B.cEnd=B.cEnd||{})[T.apex.id]=B.cEnd[T.apex.id]||{};if(t.k!==undefined)ce[t.k]=Math.max(ce[t.k]||0,gbT('ctw:'+ti+':'+tk+gk,tS+tdur*.9)-now+320)});
  /* knots: a raised boss on the bark, its file named beside it when its journey is lit */
  const padBox=T.padList.map(pd=>{const o=sh(T.origin[pd.id]),g=pd.geo;return [o[0]-g.PW/2,o[1]-g.PH-g.L*.6,o[0]+g.PW/2,o[1]+(pd.geo.slot.size?g.L+12:4)]});const placed=L.rl.map(l=>{if(l.box)return l.box;const w0=gbW(l.t+(l.r.stop&&!l.bare&&!l.note?' · trace stops':''),L.fs*.62),x0=l.anchor==='start'?l.x:l.anchor==='end'?l.x-w0:l.x-w0/2;return [x0-2,l.y-L.fs,x0+w0+2,l.y+3]});
  T.knots.forEach(kn=>{const q=sh(kn.p);placed.push([q[0]-6,q[1]-6,q[0]+6,q[1]+6])});
  /* and off the journeys' names and the phone's numbers */
  for(const pid in T.lbl){const l=T.lbl[pid],lx=l.x+X,a=l.anchor==='start'?lx:l.anchor==='end'?lx-l.w:lx-l.w/2;placed.push([a,l.y-29,a+l.w,l.y-29+l.hgt])}
  for(const jid in T.badge||{}){const q=T.badge[jid];placed.push([q.x+X-12,q.y-12,q.x+X+12,q.y+12])}const potBox=[L.potC-L.potL/2-4,L.narrow?-11:-16,L.potC+L.potL/2+4,L.D+40];placed.push(potBox);for(let k=0;k<tp.length-1;k+=2){const k2=Math.min(tp.length-1,k+2),hw=Math.max(T.tw[k],T.tw[k2])/2;padBox.push([Math.min(tp[k][0],tp[k2][0])-hw,Math.min(tp[k][1],tp[k2][1])-1,Math.max(tp[k][0],tp[k2][0])+hw,Math.max(tp[k][1],tp[k2][1])+1])}
  const ov=(r,q)=>Math.max(0,Math.min(r[2],q[2])-Math.max(r[0],q[0]))*Math.max(0,Math.min(r[3],q[3])-Math.max(r[1],q[1]));
  for(const b of T.br)for(let k=0;k<b.pts.length-1;k+=2){const q=sh(b.pts[k]),q2=sh(b.pts[Math.min(b.pts.length-1,k+2)]),hw=b.w[k]/2;padBox.push([Math.min(q[0],q2[0])-hw,Math.min(q[1],q2[1])-hw,Math.max(q[0],q2[0])+hw,Math.max(q[1],q2[1])+hw])}
  const hits=(r)=>padBox.reduce((a,q)=>a+ov(r,q),0)+placed.reduce((a,q)=>a+ov(r,q),0)*3;
  /* hairlines already drawn, and how many points of a new one land on something drawn */
  const segs=[],inBox=(p,q)=>p[0]>q[0]&&p[0]<q[2]&&p[1]>q[1]&&p[1]<q[3];
  /* (what the hairline starts in, its own knot and the wood under it, it cannot help crossing) */
  const segHit=(a,b,o)=>{let c=0;const sk=q=>q!==potBox&&o&&o[0]>q[0]-3&&o[0]<q[2]+3&&o[1]>q[1]-3&&o[1]<q[3]+3;const P=placed.filter(q=>!sk(q)),Q=padBox.filter(q=>!sk(q));
   for(let i=1;i<=9;i++){const t=i/10,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(P.some(q=>inBox(p,q))||Q.some(q=>inBox(p,q)))c++}return c};
  const rectSegs=r=>{let c=0;for(const [a,b] of segs)for(let i=0;i<=10;i++){const t=i/10;if(inBox([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],r))c++}return c};
  /* Max: a part's own checks, and the existing flows that reach it, grow as one unpruned shoot out of that part's knot, the
     growth a minimum prunes away. A shoot leaves the bark on whichever side has open air, leaning up toward the light,
     and holds its checks as small leaves set alternately along it; a burl's files share one. A part on no knot (a root in
     the soil) sends up a sucker beside it. Its route back to the soil is the wood it grows from. */
  if(!sap&&!ti){const out=r=>Math.max(0,vx+4-r[0])+Math.max(0,r[2]-(vx+W-4))+Math.max(0,vy+2-r[1]);
   /* A shoot leaves the bark on the open side, along the wood turned 40 to 55 degrees outward, arches and turns up toward
      the light; it tapers, holds its checks as leaves set alternately and shrinking toward the tip, and ends in a bud.
      Shoots keep 22 units apart along the wood (30 on a phone), and off pads, names and each other. */
   const bases=[];
   const grow1=(pl,k0,wd,uids,kid,routeOf,lo,pref)=>{let best=null;const n1=pl.length-1,step=gbLen(pl)[n1]/n1;
    for(const off of [0,7,-7,14,-14,21,-21]){const kk=Math.max(lo,Math.min(n1-2,k0+Math.round(off/step)));const a=pl[kk],n=gbNorm(pl,kk),wk=wd[kk];
     /* a grower lets a shoot run only on the outside of a bend, never in its crook: the inside is toward the chord's middle */
     const ka=pl[Math.max(0,kk-4)],kb=pl[Math.min(n1,kk+4)],bend=[a[0]-(ka[0]+kb[0])/2,a[1]-(ka[1]+kb[1])/2],bm=Math.hypot(bend[0],bend[1]);
     const g0=pl[Math.min(n1,kk+1)],g1=pl[Math.max(0,kk-1)],gm=Math.hypot(g0[0]-g1[0],g0[1]-g1[1])||1,tg=[(g0[0]-g1[0])/gm,(g0[1]-g1[1])/gm];
     for(const side of [1,-1])for(const th of [45,55,38])for(const len of [32,26]){const r0=th*Math.PI/180,ns=[n[0]*side,n[1]*side];
      const v0=[tg[0]*Math.cos(r0)+ns[0]*Math.sin(r0),tg[1]*Math.cos(r0)+ns[1]*Math.sin(r0)];if(v0[1]>.2)continue;
      const b0=[a[0]+ns[0]*(wk/2-2.4),a[1]+ns[1]*(wk/2-2.4)],tip=[b0[0]+v0[0]*len*.72,b0[1]+v0[1]*len*.72-len*.42];
      const c1=[b0[0]+v0[0]*len*.48,b0[1]+v0[1]*len*.48],c2=[tip[0]-v0[0]*len*.06,tip[1]+len*.3],pts=gbBez([b0,c1,c2,tip],10);
      const xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]),r=[Math.min(...xs)-9,Math.min(...ys)-9,Math.max(...xs)+9,Math.max(...ys)+5];
      const near=bases.reduce((m,q)=>Math.min(m,Math.hypot(q[0]-b0[0],q[1]-b0[1])),1e9),gapMin=L.narrow?24:16;const crook=bm>.6&&(ns[0]*bend[0]+ns[1]*bend[1])<0;
      const sc=hits(r)+out(r)*400+(near<gapMin?400+(gapMin-near)*40:0)+(crook?220:0)+Math.abs(off)*2+(th===45?0:12)+(len===32?0:16)+(pref&&ns[0]*pref<0?60:0);
      if(!best||sc<best.sc)best={sc,pts,b0,tip,c1,c2,r,kk,near,o:out(r)}}}
    /* every file grows its own shoot from its own knot; only one with no open air at all, or one whose knot is right beside
       another's, joins the nearest shoot, so the wood does not grow a hedge */
    const gs=B.shootGeo||[];if(gs.length&&(!best||best.o>0||best.near<(L.narrow?14:10))){const a=pl[k0];const nb=gs.reduce((m,g)=>Math.hypot(g.base[0]-a[0],g.base[1]-a[1])<Math.hypot(m.base[0]-a[0],m.base[1]-a[1])?g:m,gs[0]);nb.uids.push(...uids);return}
    if(!best)return;placed.push(best.r);bases.push(best.b0);const {b0,c1,c2,tip}=best,cv=[b0,c1,c2,tip];
    const slot=i=>{const t=[.46,.68,.86][i],q=gbCubic(cv,t),q2=gbCubic(cv,Math.min(1,t+.04)),dir=Math.atan2(q2[1]-q[1],q2[0]-q[0])*180/Math.PI;return [q[0],q[1],dir+(i%2?50:-50),[1,.82,.66][i]]};
    (B.shootGeo=B.shootGeo||[]).push({uids,kid,pts:best.pts,base:b0,tip,slots:[0,1,2].map(slot),route:[...best.pts.slice().reverse(),...routeOf(best.kk)]})};
   const tdown=k=>tp.slice(0,k+1).reverse();
   /* never from the soil or the flare: no shoot leaves the trunk below a fifth of its height */
   const lowK=Math.round(.2*(tp.length-1));
   for(const kn of T.knots){const uids=kn.ids.filter(id=>(M.buds[id]||[]).length);if(!uids.length)continue;const b=kn.bid?T.br.find(x=>x.id===kn.bid):null;
    if(b){const bp=b.pts.map(sh);grow1(bp,kn.k,b.w,uids,kn.id,kk=>[...bp.slice(0,kk+1).reverse(),...tdown(b.k)],2)}
    else grow1(tp,Math.max(lowK,kn.k),T.tw,uids,kn.id,tdown,lowK)}
   /* a root's own checks grow on the trunk above the flare, on the root's side */
   for(const r of L.roots){if(!r.id||r.tree!==ti||!(M.buds[r.id]||[]).length)continue;
    grow1(tp,Math.round(.24*(tp.length-1)),T.tw,[r.id],r.id,kk=>[...tdown(kk),...r.pts.slice(0,Math.floor(r.pts.length*.6))],lowK,r.d)}
   /* a changed part on no journey has no knot: its shoot comes from the leader, under the crown */
   const loose=Object.keys(M.buds).filter(id=>!(B.shootGeo||[]).some(g=>g.uids.includes(id)));if(loose.length)grow1(tp,Math.round(.86*(tp.length-1)),T.tw,loose,'lead:'+ti,tdown,lowK)}
  T.knots.forEach((kn,ki)=>{const p0=sh(kn.p),n=kn.n;const many=kn.ids.length>1;const off=(ki%2?-1:1)*kn.w*.22;const p=[p0[0]+n[0]*off,p0[1]+n[1]*off];
   /* a knot is a burl: a raised swelling of the bark, half again as long along the grain as across it, lit on its upper left
      and shaded below right like the wood round it, a darker crescent where it sits on the bark, and the grain parting round
      it in two long shallow arcs. Lit, it glows amber from inside; it is never a hole, a bead or a ring on the wood */
   const ra=Math.min(7,kn.w*.14+3.8,Math.max(2.6,kn.w*.6))*(many?1.3:1),rb=ra/1.4,ang=Math.atan2(n[1],n[0])*180/Math.PI+90,tg=[n[1],-n[0]];
   const lx=-.6*tg[0]-.8*tg[1],ly=-.6*n[0]-.8*n[1];const lo=[tg[0]*lx*ra*.32+n[0]*ly*rb*.42,tg[1]*lx*ra*.32+n[1]*ly*rb*.42];
   const E=(c,a,b,cls)=>sv('ellipse',{cx:gbF(c[0]),cy:gbF(c[1]),rx:gbF(a),ry:gbF(b),transform:'rotate('+gbF(ang)+' '+gbP(c)+')',class:cls});
   /* the crescent: the body's edge on the side away from the light */
   const t0=Math.atan2(-ly/rb,-lx/ra),cres=[];for(let i=0;i<=8;i++){const t=t0-1.15+2.3*i/8,c=Math.cos(t)*ra*1.02,d=Math.sin(t)*rb*1.02;cres.push([p[0]+tg[0]*c+n[0]*d-lo[0]*.25,p[1]+tg[1]*c+n[1]*d-lo[1]*.25])}
   /* grain lines run along the wood and bow out round the swelling, never closing on it */
   const lens=sd=>{const e=sd*(rb+1.2),m=sd*(rb+3.4),a=[p[0]-tg[0]*ra*2.6+n[0]*e,p[1]-tg[1]*ra*2.6+n[1]*e],b=[p[0]+tg[0]*ra*2.6+n[0]*e,p[1]+tg[1]*ra*2.6+n[1]*e],c=[p[0]+n[0]*m,p[1]+n[1]*m];return 'M'+gbP(a)+' Q'+gbP([2*c[0]-(a[0]+b[0])/2,2*c[1]-(a[1]+b[1])/2])+' '+gbP(b)};
   const cr=[[-1,0],[-.45,.55],[0,-.45],[.45,.5],[1,0]].map(([u,v])=>[p[0]+tg[0]*u*(ra+4)+n[0]*v*2.2,p[1]+tg[1]*u*(ra+4)+n[1]*v*2.2]);
   const u=M.U[kn.id];const names=kn.ids.map(id=>(M.U[id]||{}).label||id);
   const glow=E(p,ra*1.25,rb*1.3,'halo');glow.setAttribute('clip-path','url(#'+clipId+')');
   const g=sv('g',{class:'kn'+(many?' burl':''),'data-k':'u:'+kn.id,tabindex:-1,role:'button','aria-label':many?names.length+' parts of the change, grown together: '+names.join(', '):(u?u.label:kn.id)+', a part of the change'},
    sv('path',{d:lens(1)+' '+lens(-1),class:'kg','clip-path':'url(#'+clipId+')'}),E([p[0]-lo[0]*.7,p[1]-lo[1]*.7],ra*1.1,rb*1.14,'k0'),E(p,ra,rb,'k1'),E([p[0]+lo[0],p[1]+lo[1]],ra*.58,rb*.46,'k2'),
    sv('path',{d:gbLine(cres),class:'kc'}),glow,E(p,ra+2.4,rb+2.4,'ring'),sv('path',{d:gbLine(cr),class:'crack'}),
    sv('circle',{cx:gbF(p[0]),cy:gbF(p[1]),r:Math.max(9,ra+3),class:'hitc'}));
   g.__ids=kn.ids;(kn.bid?JG[kn.bid]:gKn).append(g);for(const id of kn.ids){B.knot[id]=g;B.pos[id]=p0}B.nav.push('u:'+kn.id);B.navEl['u:'+kn.id]=g;g.__n=n;g.__w=kn.w;g.__on=kn.on;
   /* a knot shows once the growing wood has reached it: on a branch, where along the branch it sits */const kb=kn.on==='t'?null:T.br.find(x=>'b'+x.i===kn.on);let kt=at(kn.on==='t'?kn.t:kb?kb.h:0)+200;if(kb&&kb.acc){let ii=0,bd=1e9;kb.pts.forEach((q,i2)=>{const dd=Math.hypot(q[0]+X-p0[0],q[1]-p0[1]);if(dd<bd){bd=dd;ii=i2}});const f=kb.acc[ii]/(kb.acc[kb.acc.length-1]||1);kt=at(kb.h)+(380+1.5*kb.len)*(1-Math.pow(1-Math.min(1,f+.03),1/2.2))+60}anim('kn:'+kn.id+gk,g,kt,300,'fade');(B.kgk=B.kgk||{})[kn.id]=gk;
   if(u){const txt=gbKnotTxt(M,kn.ids,kn.id);
    /* A name goes on open ground beside its knot; every name on the tree is placed in one pass once everything it must
       keep clear of is known (gbKnotNames, after the pads, names and numbers are drawn) */
    (B.klq=B.klq||[]).push({id:kn.id,tree:ti,p,p0,n,tg,ra,rb,txt,w:kn.w,bid:kn.bid})}});
  /* veins: the route each pad's sap takes, shown live while its journey runs and traced on hover */
  for(const pid of T.lanes){const v=T.veins[pid];const tr=v.trunk.map(sh),bp=v.branch.map(sh);const o=sh(v.pad);const all=gbSmooth([...tr,...bp],2);
   const p1=sv('path',{d:gbLine(all),class:'vein'});gVein.append(p1);B.vein[pid]={els:[p1],jid:v.jid,pts:all,pad:o,tree:ti}}
  /* pads, grown at the size of every leaf they hold, and their labels */
  T.padList.forEach((pd,pi)=>{const o=sh(T.origin[pd.id]),g=pd.geo,jid=pd.jid;const back=pd.b&&pd.b.back;const jg=JG[pd.id];
   /* one silhouette from all its clumps; the ghost behind it shows the shape a previewed mode would grow */
   const shape=g.shape;const q0=shape(()=>true),bt=Math.max(2.5,g.PH*.08);
   const els={ghost:sv('path',{class:'pghost',d:gbPadD(o,q0)}),fill:sv('path',{class:'pfill',d:gbPadD(o,q0),fill:'url(#'+padG+')'}),tex:sv('path',{class:'ptex',d:gbPadD(o,q0),fill:'url(#'+padG+'s)'}),band:sv('path',{class:'pband',d:gbPadBand(o,q0,bt)}),rim:sv('path',{class:'prim',d:gbPadRim(o,q0)})};
   /* the crest is lit from above more than its shoulders: a pale wash over its upper half */
   {const k=g.cs.findIndex(c=>c.role==='crest'),c=k>=0?q0.cs[k]:null;if(c&&c.on){const cid='gb-pc'+N+'-'+ti+'-'+pi,yt=o[1]+Math.min(...c.top.map(p=>p[1])),yb=o[1]+Math.max(...c.bot.map(p=>p[1]));
    defs.append(sv('linearGradient',{id:cid,gradientUnits:'userSpaceOnUse',x1:'0',y1:gbF(yt),x2:'0',y2:gbF(yb)},sv('stop',{offset:0,style:'stop-color:var(--pad-lit);stop-opacity:.75'}),sv('stop',{offset:.6,style:'stop-color:var(--pad-lit);stop-opacity:0'})));
    els.crest=sv('path',{class:'pcrest',d:gbPadCrest(o,q0,g),fill:'url(#'+cid+')'})}}
   /* and in the lower part of each cushion the wood it grew from shows through: the branch and its twigs, seen faintly */
   const pl='gb-pl'+N+'-'+ti+'-'+pi;defs.append(sv('clipPath',{id:pl},sv('path',{d:gbPadLow(o,q0)})));const pw=sv('g',{'clip-path':'url(#'+pl+')'});
   if(pd.b){pw.append(sv('path',{class:'pwd',d:gbRib(pd.b.pts.map(sh),pd.b.w)}));for(const t of pd.b.twigs)pw.append(sv('path',{class:'pwd',d:gbRib(t.pts.map(sh),t.w)}))}
   else{pw.append(sv('path',{class:'pwd',d:gbRib(tp,T.tw)}));for(const t of T.ctw)pw.append(sv('path',{class:'pwd',d:gbRib(t.pts.map(sh),t.w)}))}
   /* the foliage grows in clumps: each catches the light on its top and is shaded where it tucks under its neighbour */
   const pk='gb-pk'+N+'-'+ti+'-'+pi;els.clip=sv('path',{d:gbPadD(o,q0)});defs.append(sv('clipPath',{id:pk},els.clip));const cg=sv('g',{'clip-path':'url(#'+pk+')',class:'pclu'});
   for(const c of g.cs)for(const [x,y,r] of c.body){const X=o[0]+x,Y=o[1]+y;cg.append(sv('ellipse',{cx:gbF(X-r*.1),cy:gbF(Y-r*.46),rx:gbF(r*.74),ry:gbF(r*.38),class:'pcl'}),sv('path',{d:'M'+gbP([X-r*.94,Y+r*.3])+' A'+gbF(r)+' '+gbF(r)+' 0 0 0 '+gbP([X+r*.5,Y+r*.86]),class:'pcs'}))}
   const mk=sv('path',{d:gbPadD(o,q0),fill:'#666'});rMask.append(mk);
   const pg=sv('g',{class:'pad'+(pd.crown?' crown':'')+(back?' back':''),'data-k':'j:'+jid,'data-pad':pd.id,tabindex:-1,role:'button'},els.ghost,els.fill,els.tex,cg,...(els.crest?[els.crest]:[]),els.band,pw,els.rim,sv('ellipse',{cx:gbF(o[0]),cy:gbF(o[1]-5),rx:6,ry:4.6,class:'bud0'}));
   jg.append(pg);const lg=sv('g',{});jg.append(lg);
   /* each cushion shows once its own twig has grown to it (the outer one once the branch has, the crest once the leader
      has); the pad starts with its first cushion */
   const ce=(B.cEnd||{})[pd.id]||{},cT=q0.cs.map((c,k)=>ce[k]!==undefined?ce[k]:pd.b?(ce.br!==undefined?ce.br:at(pd.b.h)+380+1.5*pd.b.len):tS+tdur);
   const delay=Math.min(...cT),cdl=cT.map(t=>t-delay),cAbs=cT.map(t=>now+t);
   /* the wood a leaf's sap runs through on its way down: its branch (or, for the crown, the leader) and the trunk */
   const hd=pd.b?pd.b.hold:T.chold;const rt={tp,br:pd.b?pd.b.pts.map(sh):null,bw:pd.b?pd.b.w[pd.b.exit]:0,exit:pd.b?pd.b.exit:0,k:pd.b?pd.b.k:tp.length-1,tw:hd.map(q=>q&&{pts:q.pts.map(sh),bi:q.bi})};
   B.pad[pd.id]={el:pg,jg,o,geo:g,jid,pol:pd.pol,crown:pd.crown,b:pd.b,lg,leaves:pd.leaves,delay,cdl,cAbs,gk,tree:ti,shape,els,mk,bt,sk:'*',rt,q0};(B.padsOf[jid]=B.padsOf[jid]||[]).push(pd.id);
   /* a cushion opens out of the tip of its twig: each one has its own reveal in a mask over the pad, so a cushion never
      stands in the air while the twig that carries it is still growing */
   if(!quiet){gbT('pad:'+pd.id+gk,delay);const last=Math.max(...cT);if(last>-330){const mid='gb-pm'+N+'-'+pd.id,m=sv('mask',{id:mid,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)});
     q0.cs.forEach((c,k)=>{if(!c.on)return;const e=sv('path',{d:gbCushD(o,c),fill:'#fff',stroke:'#fff','stroke-width':7,'stroke-linejoin':'round'});e.style.transformBox='fill-box';e.style.transformOrigin='50% 100%';m.append(e);
      if(cT[k]>-300)B.anim.push([e,cT[k],300,'pop'])});
     defs.append(m);pg.setAttribute('mask','url(#'+mid+')');setTimeout(()=>{if(pg.getAttribute('mask')==='url(#'+mid+')')pg.removeAttribute('mask');m.remove()},Math.max(0,last+330))}}
   if(!sap&&!pd.pol){B.nav.push('j:'+jid);B.navEl['j:'+jid]=pg}});
  for(const pid in T.lbl){const l=T.lbl[pid],pd=T.pads[pid];const back=pd.b&&pd.b.back;const lx=l.x+X,ly=l.y;
   const gl=sv('g',{class:'lbl'+(back?' back':''),'data-k':'j:'+l.jid,'data-pad':pid});const eb=sv('text',{x:gbF(lx),y:gbF(ly-18),'text-anchor':l.anchor,class:'eb'},'');gl.append(eb);
   const tl=l.lines.map((line,i)=>gbRich(sv('text',{x:gbF(lx),y:gbF(ly+16*i),'text-anchor':l.anchor,class:'t'+(l.pol?' v':'')}),line));gl.append(...tl);
   const t2=sv('text',{x:gbF(lx),y:gbF(ly+16*l.lines.length+1),'text-anchor':l.anchor,class:'st'}),t3=sv('text',{x:gbF(lx),y:gbF(ly+16*l.lines.length+15),'text-anchor':l.anchor,class:'st'});gl.append(t2,t3);
   const mid=ly-29+l.hgt/2;if(l.dir&&Math.abs(mid-l.ay)>12)gl.append(sv('path',{class:'leader',d:'M'+gbF(l.ax+X+l.dir*3)+' '+gbF(l.ay)+' L'+gbF(lx-l.dir*4)+' '+gbF(mid)}));
   gLbl.append(gl);B.lbl[pid]={el:gl,eb,t2,t3,tl,w:l.w,pol:l.pol,jid:l.jid};anim('lbl:'+pid+gk,gl,B.pad[pid].delay+Math.max(0,...(B.pad[pid].cdl||[0]))+200,350,'fade')}
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
   gLbl.append(gl);if(q.pid)B.lbl[q.pid]={el:gl,num:gl.lastChild,badge:true,jid:q.jid,pid:q.pid};else B.lbl[jid]={el:gl,num:gl.lastChild,badge:true,jid}}
  /* then every file's name, and the count on each shoot, in one placement pass */
  if(!sap)gbKnotNames(B,M,T,ti,{X,tp,vx,vy,W,gKl,potBox:[L.potC-L.potL/2-4,L.narrow?-11:-16,L.potC+L.potL/2+4,L.D+40]});
 });
 if(L.trees.length&&M.jin.length>3&&!sap){const T=L.trees[0],p=T.tp[gbNear(T.ty,.4)];gJin.append(sv('text',{x:gbF(p[0]-T.S*28),y:gbF(p[1]),'text-anchor':T.S>0?'end':'start',class:'note'},'+'+(M.jin.length-3)+' changed, on no journey'))}
 /* the bark's light and grain are uncovered with the wood they lie on (gbGrowRun), never faded in after it */
 /* hover, focus, click and keys: one tab stop, arrows move between pads, knots and roots, and along a journey's leaves */
 const keyOf=e=>{const t=e.target.closest&&e.target.closest('[data-k]');return t?t.getAttribute('data-k'):null};
 svg.addEventListener('pointerover',e=>{const el=e.target.closest&&e.target.closest('[data-k]');if(el!==gw.hovEl){gw.hovEl=el;gbHover(el?el.getAttribute('data-k'):null,el)}});
 svg.addEventListener('pointerleave',()=>{gw.hovEl=null;gbHover(null)});
 svg.addEventListener('focusin',e=>{const k=keyOf(e);if(k){gbRove(e.target.closest('[data-k]'));gbHover(k,e.target.closest('[data-k]'))}});
 svg.addEventListener('focusout',e=>{if(!svg.contains(e.relatedTarget))gbHover(null)});
 svg.addEventListener('click',e=>{let k=keyOf(e);if(!k)k=gbNearLeaf(e);if(!k){if(gw.pinned){gw.pinned=null;growPaint()}return}gw.pinned=gw.pinned===k?null:k;if(gw.B&&gw.pinned&&!gw.B.L.narrow)gbTipOff(gw.B);growPaint()});
 svg.addEventListener('keydown',gbKeys);
 /* the grey dots where a route never ran go under the knots they pass, which stand faint over them: each knot cuts them */
 {const kmId='gb-km'+N,km=sv('mask',{id:kmId,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)},sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'#fff'}));
  for(const e of B.klq||[])km.append(sv('circle',{cx:gbF(e.p[0]),cy:gbF(e.p[1]),r:gbF(e.ra+2.5),fill:'#000'}));defs.append(km);B.sapX.setAttribute('mask','url(#'+kmId+')')}
 B.tip=h('div',{class:'gb-tip',hidden:true,role:'status'});B.width=width;
 /* the traced route stays inside what it runs through: the wood (trunk, branches, forks, roots) and the foliage it climbs into */
 {const rc=sv('clipPath',{id:'gb-rc'+N});for(const c of clip.children)rc.append(c.cloneNode());
  for(const el of svg.querySelectorAll('path.tw'))rc.append(sv('path',{d:el.getAttribute('d')}));
  for(const id in B.pad){const P=B.pad[id];P.rcp=sv('path',{d:P.mk.getAttribute('d')});rc.append(P.rcp)}defs.append(rc);gSap.setAttribute('clip-path','url(#gb-rc'+N+')');B.rclip=rc}
 gw.B=B;gw.svg=svg;
 
 if(svg.animate)for(const [el,delay,ms,kind] of B.anim){if(kind==='fade')el.animate([{opacity:0},{opacity:1}],{duration:ms,delay,fill:'backwards'});else if(kind==='pop')el.animate([{transform:'scale(.2)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:ms,delay,easing:'cubic-bezier(.2,.8,.3,1.1)',fill:'backwards'})}
 gbGrowRun(B);
 return B}
/* A tap that lands between leaves picks the nearest leaf within 22 px, so a finger can choose a single leaf on a phone. */
function gbNearLeaf(e){const B=gw.B;if(!B||e.pointerType==='mouse')return null;let best=null,bd=22;
 for(const id in B.leaf){const el=B.leaf[id];if(el.classList.contains('gone'))continue;const r=el.getBoundingClientRect();const d=Math.hypot(r.left+r.width/2-e.clientX,r.top+r.height/2-e.clientY);if(d<bd){bd=d;best='s:'+id}}return best}

/* The same leaf with a bite out of its upper edge: how a failed scenario looks, in any theme and on any ground. */
function gbLeafBite(L,W,edge){const a=-L/2,b=L/2;const up=[[a,0],[a+.22*L,-.62*W],[b-.32*L,-.62*W],[b,0]];const c=[L*.12,-W*.6],r=W*.5;
 const pts=gbBez(up,24).map(q=>{const d=Math.hypot(q[0]-c[0],q[1]-c[1]);return d<r?[c[0]+(q[0]-c[0])/(d||1)*r,c[1]+(q[1]-c[1])/(d||1)*r]:q});
 /* the bitten edge alone, for the browned rim a failed leaf has round its wound */
 if(edge){const e=pts.filter(q=>Math.abs(Math.hypot(q[0]-c[0],q[1]-c[1])-r)<.01);return e.length>1?'M'+e.map(gbP).join(' L'):''}
 return 'M'+pts.map(gbP).join(' L')+' C'+gbF(b-.32*L)+' '+gbF(.62*W)+' '+gbF(a+.22*L)+' '+gbF(.62*W)+' '+gbF(a)+' 0Z'}
const gbLeafD=(L,W)=>{const a=-L/2,b=L/2;return 'M'+gbF(a)+' 0 C'+gbF(a+.22*L)+' '+gbF(-.62*W)+' '+gbF(b-.32*L)+' '+gbF(-.62*W)+' '+gbF(b)+' 0 C'+gbF(b-.32*L)+' '+gbF(.62*W)+' '+gbF(a+.22*L)+' '+gbF(.62*W)+' '+gbF(a)+' 0Z'};
/* A leaf: a stem (shown when it hangs), a paper halo so it reads on wood and pad alike, the blade and its midrib, and the
   bite a failed scenario takes out of it. */
function gbLeafEl(x,L,W,hang){const inner=sv('g',{class:'gb-lfi'},sv('circle',{r:gbF(Math.max(12,L*.62)),class:'hitc'}),sv('path',{d:gbLeafD(L+3.4,W+3.2),class:'halo'}),sv('path',{d:'M'+gbF(-L/2-(hang?10.5:4.5))+' 0 L'+gbF(-L/2+1.5)+' 0',class:'pet'}),sv('path',{d:gbLeafD(L,W),class:'blade bn'}),sv('path',{d:gbLeafBite(L,W),class:'blade bb'}),sv('path',{d:gbLeafBite(L,W,true),class:'nec'}),
  sv('path',{d:'M'+gbF(-L/2+1.6)+' 0 L'+gbF(L/2-2.4)+' 0',class:'rib'}));
 /* a hanging leaf that is pruned leaves its stalk cut short under the pad, its cut face showing; one on the crest or a
    shoulder leaves nothing, because its clump of foliage goes with it */
 const st=-L/2-(hang?10.5:4.5);const el=sv('g',{class:'gb-lf','data-k':'s:'+x.id,tabindex:-1,role:'button'},hang?sv('g',{class:'stem0'},sv('path',{d:'M'+gbF(st)+' 0 L'+gbF(st+4.5)+' 0'}),sv('ellipse',{cx:gbF(st+4.5),cy:0,rx:1.2,ry:1.9,class:'cap'}),sv('circle',{cx:gbF(st+4.5),cy:0,r:8,class:'hits'})):null,inner,
  sv('path',{d:'M'+gbF(st+.4)+' -2.6 L'+gbF(st+3.2)+' 2.6',class:'nick'}));el.__inner=inner;el.__nick=el.lastChild;return el}
/* drawing units per CSS px, so a hit area can be sized in px: every leaf and shoot leaf takes a pointer or a finger within
   about 12 px of its middle */
const gbHf=B=>{const vb=B.svg.viewBox&&B.svg.viewBox.baseVal,w=B.svg.getBoundingClientRect().width;return vb&&vb.width&&w?w/vb.width:1};
function gbLeafState(x){const s=gw.state;const r=s.run[x.id];
 if(r){if(r.st==='pass')return x.ext.some(e=>s.ext[e]&&s.ext[e].state!=='proven')?'pass warn':'pass';if(r.st==='fail')return 'fail';if(r.st==='run')return 'run';return x.flow?'idle':'none'}
 return !s.modeBy&&gbRank[x.mode]>0?'pre':'in'}
function gbStateWord(x){const s=gw.state;const r=s.run[x.id];if(r){if(r.st==='pass')return {c:'pass',t:'passed in '+gwDur(r.ms||0)+(x.ext.some(e=>s.ext[e]&&s.ext[e].state!=='proven')?', resting on agent-written work not yet reviewed':'')};
  if(r.st==='fail')return {c:'fail',t:'failed'+(r.hop?(r.after?', after ':' at ')+r.hop:'')+': '+(r.why||'see the run')+(r.hop?'':' (the run does not say which hop broke)')};if(r.st==='run')return {c:'run',t:'running now'};return {c:'',t:x.flow?'to prove'+(r.why?': '+r.why:''):'no flow yet'}}
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
 const open=inm.filter(x=>{const r=s.run[x.id];return !r||r.st==='not_run'}),nf=open.filter(x=>!x.flow).length,tp=open.length-nf;
 if(!ran.length&&!s.modeBy){const km=vis||'min',k=list.filter(x=>gbRank[x.mode]<=gbRank[km]).length;T.push(['keeps '+k,'n']);if(list.length>k)T.push(['cuts '+(list.length-k),'x'])}else{if(tp)T.push([tp+' to prove','n']);if(nf)T.push([nf+' no flow yet','n'])}
 if(pr)T.push(['+'+pr+' pruned','n']);return T}
const gbNext=id=>GW.modes[Math.min(GW.modes.length-1,GW.modes.findIndex(m=>m.id===id)+1)].id;

function gbPaint(){const s=gw.state;const M=gbModel();const sap=!M.trees.length;const width=gbWidth();
 const pc=list=>['happy','guard','failure'].map(p=>list.filter(x=>gbPol(x)===p).length).join('.');
 const key=(sap?'sap:'+s.units.map(u=>u.id).join(','):M.trees.map(t=>t.js.map(j=>j.id+'='+j.units.join('+')+'#'+pc(M.leaves[j.id])).join(';')).join('|'))+'|jin='+M.jin.map(u=>u.id).join(',')+'|'+M.strays.map(u=>u.id).join(',')+'|'+(s.stops.map(x=>x.unit).join(','))+'|w='+width;
 /* a rebuild (the layout changed, say when the window is resized) keeps what was showing, so
    the leaves and shoots a mode drops still fall and fade rather than vanish */
 if(!gw.B||gw.B.key!==key){const O=gw.B;gw.prevIn={};gw.prevShown={};gw.prevBuds=O?O.budsShown:undefined;
  if(O){for(const id in O.leaf)gw.prevIn[id]=O.leaf[id].__in;for(const id in O.pad)gw.prevShown[id]=O.pad[id].shown}gbBuild(M,width,key,sap)}
 const B=gw.B;gw.M=M;const vis=s.modeBy?s.mode:s.asked&&gw.picking?gw.picking:null;/* a preview: before a mode is chosen, what each would keep; once one is set, what another would keep or add, as ghosts */const pv=gw.preview&&gw.preview!==(s.modeBy?s.mode:null)?gw.preview:null;let n=0;const quiet=gwQuiet();
 const order=sap?[]:gbOrder(M);gw.order=order.map(j=>j.id);
 /* one tab stop into the tree: the first journey in the order the list and the inspector use */
 if(!B.roved){B.roved=true;const f=B.navEl['j:'+gw.order[0]]||B.navEl[B.nav[0]];if(f)gbRove(f)}
 const inMode=x=>!vis||gbRank[x.mode]<=gbRank[vis];
 for(const j of order){n++;const all=M.leaves[j.id];let mainCut=false;
  for(const pid of B.padsOf[j.id]||[]){const P=B.pad[pid];const list=gbOrd(P.leaves);const g=P.geo;let shown=0,failed=false,cutN=0;const kept=new Set(),grown=new Set();
   list.forEach((x,i)=>{const sl=g.slot.get(x.id)||[0,-g.PH*.5,0];let el=B.leaf[x.id];const now=performance.now();
    if(!el){el=gbLeafEl(x,g.L,g.W,sl[4]);{const hc=el.__inner.querySelector('.hitc');if(hc)hc.setAttribute('r',gbF(Math.max(+hc.getAttribute('r'),12/gbHf(B)/(sl[3]||1))))}P.lg.append(el);B.leaf[x.id]=el;el.__j=j.id;el.__p=pid;el.__in=(gw.prevIn||{})[x.id];
     if(!quiet&&el.__inner.animate){const ck=g.cOf.get(x.id),ci=list.slice(0,i).filter(q=>g.cOf.get(q.id)===ck).length;/* a leaf opens once its own cushion has */const t0=(P.cAbs&&P.cAbs[ck]!==undefined?P.cAbs[ck]:gbT('pad:'+pid+(P.gk||''),P.delay))+230+ci*45;if(now-t0<260){el.__inner.animate([{transform:'scale(0)'},{transform:'scale(1)'}],{duration:260,delay:t0-now,easing:'cubic-bezier(.2,.8,.3,1.3)',fill:'backwards'});el.__nick.animate([{opacity:0},{opacity:1}],{duration:160,delay:t0-now+200,fill:'backwards'})}}}
    el.style.transform='translate('+gbF(P.o[0]+sl[0])+'px,'+gbF(P.o[1]+sl[1])+'px) rotate('+gbF(sl[2]+(gbHash(x.id)-.5)*(sl[4]?8:14))+'deg)'+(sl[3]&&sl[3]!==1?' scale('+sl[3]+')':'');
    const im=inMode(x);const was=el.__in;el.__in=im;let cls='gb-lf '+gbLeafState(x)+(sl[4]?' hang':'');const add=!im&&!!pv&&gbRank[x.mode]<=gbRank[pv];
    /* pruning: a leaf the chosen mode drops falls once, one after another, then only its cut stem is left */
    if(add)cls+=' pv-add';else if(!im){if(was===true&&!quiet){el.__cutAt=Date.now();el.__lag=Math.min(i*40,400);const st=el.__inner.style;st.animationDelay=(el.__lag+60)+'ms';if(el.__nick)el.__nick.style.animationDelay=el.__lag+'ms';
      /* it is cut at its stalk, so it tips about that point before it drops */
      {const R=Math.max(12,g.L*.62),ps=-g.L/2-(sl[4]?10.5:4.5),mn=Math.min(-R,ps);st.transformOrigin=gbF(ps-mn+1.5)+'px '+gbF(R)+'px'}
      /* it drops and drifts in screen space, so the leaf's own angle is taken out of the fall */
      const a=(sl[2]+(gbHash(x.id)-.5)*(sl[4]?8:14))*Math.PI/180,sc=sl[3]||1,h=gbHash('fall:'+x.id),fx=(h-.5)*24,fy=80+60*gbHash('drop:'+x.id);
      st.setProperty('--fx',gbF((fx*Math.cos(a)+fy*Math.sin(a))/sc)+'px');st.setProperty('--fy',gbF((-fx*Math.sin(a)+fy*Math.cos(a))/sc)+'px');st.setProperty('--fr',gbF((h<.5?-1:1)*(15+20*gbHash('spin:'+x.id)))+'deg');
      setTimeout(()=>{if(el.__in===false){el.classList.replace('cut','gone');gbPaint()}},1000+el.__lag)}
     cls+=el.__cutAt&&Date.now()-el.__cutAt<980+(el.__lag||0)?' cut pv-out':' gone'}else{el.__cutAt=0;el.__inner.style.animationDelay='';el.__inner.style.transformOrigin=''}
    if(pv&&!add){const keep=gbRank[x.mode]<=gbRank[pv];cls+=keep?' pv-in':' pv-out';if(!keep)cutN++}
    el.setAttribute('class',cls);el.setAttribute('aria-label','Scenario: '+x.title+', '+gbStateWord(x).t);
    if(im)kept.add(x.id);if(im||add)grown.add(x.id);
    if(im){shown++;if(s.run[x.id]&&s.run[x.id].st==='fail')failed=true}});
   /* a pad the mode keeps nothing of is cut back: once its leaves have fallen, the branch drops away and leaves a stub */
   /* the pad's own outline follows its leaves: a pruned leaf's clump goes with it, and a previewed mode's extra growth shows
      as a faint outline behind */
   const kk=[...kept].join(','),gk=[...grown].join(',');if(P.sk!==kk+'|'+gk){P.sk=kk+'|'+gk;const q=P.shape(id=>kept.has(id)),d=gbPadD(P.o,q);
    P.els.fill.setAttribute('d',d);P.els.tex.setAttribute('d',d);if(P.els.crest)P.els.crest.setAttribute('d',gbPadCrest(P.o,q,P.geo));if(P.els.clip)P.els.clip.setAttribute('d',d);if(P.rcp)P.rcp.setAttribute('d',d);P.els.rim.setAttribute('d',gbPadRim(P.o,q));P.mk.setAttribute('d',d);P.els.band.setAttribute('d',gbPadBand(P.o,q,P.bt));P.els.ghost.setAttribute('d',gk===kk?d:gbPadD(P.o,P.shape(id=>grown.has(id))))}
   /* a pruned leaf leaves a scar where it grew: a short stub of the twig that carried it, standing out of the foliage that
      is left, cut flat with its pale face showing (the legend's mark). Where the whole cushion went, the scars stand fanned
      on the end of the twig that carried it. A hanging one leaves its stalk cut short. One scar per pruned scenario, so the
      "+N pruned" under the name can be counted on the tree. */
   {const q=P.shape(id=>kept.has(id));B.scar=B.scar||{};const fan={};for(const x of list){const sl=g.slot.get(x.id),el=B.leaf[x.id];if(!sl||!el)continue;
    const on=el.classList.contains('gone');let sc=B.scar[x.id];if(!on){if(sc)sc.classList.remove('on');continue}if(sl[4])continue;
    const ck=g.cOf.get(x.id),c=g.cs[ck],cq=q.cs[ck];const fi=fan[ck]=(fan[ck]||0)+1;
    if(!sc||sc.__k!==kk){let a,th;
     if(cq.on){const bx0=sl[0]-Math.cos(sl[2]*Math.PI/180)*(g.L*(sl[3]||1)/2+4.5),bx=Math.max(c.x-c.a*.8,Math.min(c.x+c.a*.8,c.x+(bx0-c.x)*.8)),bot=gbAtX(cq.bot,bx),sd=bx>=c.x?1:-1;th=(90-sd*(38+12*gbHash('sc:'+x.id)))*Math.PI/180;a=[P.o[0]+bx,P.o[1]+bot-1.5]}
     else{const tw=P.rt.tw&&P.rt.tw[ck],hp=tw?tw.pts[tw.pts.length-1]:P.rt.br?P.rt.br[P.rt.br.length-1]:P.rt.tp[P.rt.tp.length-1];const m=c.ids.length;th=(-90+(fi-1-(m-1)/2)*30+(gbHash('sc:'+x.id)-.5)*10)*Math.PI/180;a=hp}
     const u=[Math.cos(th),Math.sin(th)];a=[a[0]-u[0]*3,a[1]-u[1]*3];const e=[a[0]+u[0]*6.5,a[1]+u[1]*6.5],n=[-u[1],u[0]],w0=1.6,w1=1.2,ang=th*180/Math.PI;
     const d='M'+gbP([a[0]+n[0]*w0,a[1]+n[1]*w0])+' L'+gbP([e[0]+n[0]*w1,e[1]+n[1]*w1])+' L'+gbP([e[0]-n[0]*w1,e[1]-n[1]*w1])+' L'+gbP([a[0]-n[0]*w0,a[1]-n[1]*w0])+'Z';
     const nx=sv('g',{class:'scar','data-k':'s:'+x.id,'data-pad':pid,tabindex:-1,role:'button'},sv('path',{d,class:'sw'}),sv('ellipse',{cx:gbF(e[0]),cy:gbF(e[1]),rx:1.1,ry:1.4,transform:'rotate('+gbF(ang)+' '+gbP(e)+')',class:'cutf'}),sv('circle',{cx:gbF(e[0]),cy:gbF(e[1]),r:9,class:'hitc'}));
     if(sc)sc.replaceWith(nx);else P.lg.append(nx);sc=nx;sc.__k=kk;B.scar[x.id]=sc}
    sc.classList.add('on');sc.setAttribute('aria-label','Scenario: '+x.title+', '+gbStateWord(x).t)}}
   const falling=list.some(x=>B.leaf[x.id]&&B.leaf[x.id].classList.contains('cut'));const pruned=!!vis&&list.length>0&&!shown;const bare=!list.length;const cut=pruned&&!falling;const back=cut&&!!pv&&list.some(x=>gbRank[x.mode]<=gbRank[pv]);
   P.el.setAttribute('class','pad'+(P.crown?' crown':'')+(P.b&&P.b.back?' back':'')+(bare?' bare':'')+(gk!==kk?' pv-grow':'')+(failed?' failed':'')+(gw.pinned==='j:'+j.id?' sel':''));
   P.el.setAttribute('aria-label',(P.pol?'Journey '+n+', '+(P.pol==='failure'?'the ways it fails':'what it refuses'):'Journey '+n+', '+j.title)+(pruned?', pruned in '+gbModeName(vis):''));
   if(P.shown===undefined)P.shown=(gw.prevShown||{})[pid];if(cut&&!P.cutDone){P.cutDone=true;if(!quiet&&P.shown&&P.jg.animate){P.jg.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(20px)',opacity:0}],{duration:450,easing:'ease-in'}).onfinish=()=>{if(P.cutDone)P.jg.classList.add('pruned')}}else P.jg.classList.add('pruned')}
   if(!cut){P.cutDone=false;P.jg.classList.remove('pruned')}P.shown=!cut;
   const willCut=!!pv&&!P.crown&&list.length>0&&cutN===list.length;P.jg.classList.toggle('pv-cut',willCut);P.jg.classList.toggle('pv-back',back);
   const E=B.brEl[pid];if(E){const was=E.stub.classList.contains('on');E.stub.classList.toggle('on',cut&&!back);if(cut&&!was&&!quiet&&E.stub.animate)E.stub.animate([{opacity:0},{opacity:1}],{duration:300,delay:350,fill:'backwards'});
    E.cutmk.classList.toggle('on',willCut);E.cuttag.classList.toggle('on',willCut);if(willCut)E.cuttag.textContent='cut · '+list.length}
   P.pruned=pruned;P.cut=cut;if(!P.pol&&cut)mainCut=true}
  /* each label speaks for its own pad: the journey's name or its riskiest guard or failure, then their state, one colour per word */
  for(const pid of B.padsOf[j.id]||[]){const P=B.pad[pid],lb=B.lbl[pid];if(lb&&lb.pid){const inm=P.leaves.filter(inMode);lb.el.setAttribute('class','badge pol'+(inm.some(x=>s.run[x.id]&&s.run[x.id].st==='fail')?' fail':'')+(inm.length?'':' pruned')+(gw.pinned==='j:'+j.id?' sel':''))}if(!lb||lb.badge)continue;const list=P.leaves;
   lb.eb.textContent=(P.pol&&M.J.length===1?'':'JOURNEY '+n+' · ')+(P.pol==='guard'?'WHAT IT REFUSES':P.pol==='failure'?'HOW IT FAILS':(gbSURFW[j.surface]||'START'));
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
 const showBuds=pv?(pv==='max'||!vis||vis==='max'):vis?vis==='max':true;B.budsShown=showBuds;/* leaving a preview is not a pruning: its ghosts just go */const pvWas=B.pvWas;B.pvWas=pv;/* choosing a mode is a pruning even when it was being previewed */const mk=vis||'',chose=B.mk!==undefined&&B.mk!==mk;B.mk=mk;gw.cutN=0;
 if(!B.shoots){B.shoots={};for(const rec of B.shootGeo||[]){const el=sv('g',{class:'budg'});B.gBud.append(el);{const sw=rec.pts.map((_,i)=>2.4-1.7*i/10);const sd=gbRib(rec.pts,sw);
    /* this year's shoot: barked where it has hardened, green toward its tip, out of a small swollen collar on the bark */
    el.append(sv('path',{d:sd,class:'tw shoot'}),sv('path',{d:gbRib(rec.pts.slice(0,7),sw.slice(0,7)),class:'tw'}),sv('ellipse',{cx:gbF(rec.pts[0][0]),cy:gbF(rec.pts[0][1]),rx:3.1,ry:2.4,class:'w'}));
    /* the tick across its foot: where a mode that drops it will cut */
    {const a=rec.pts[1],b=rec.pts[2],dd=Math.hypot(b[0]-a[0],b[1]-a[1])||1,tx=(b[0]-a[0])/dd,ty=(b[1]-a[1])/dd;el.append(sv('path',{class:'cutk',d:'M'+gbP([a[0]+ty*3.2-tx*1.4,a[1]-tx*3.2-ty*1.4])+' L'+gbP([a[0]-ty*3.2+tx*1.4,a[1]+tx*3.2+ty*1.4])}))}if(B.rclip)B.rclip.append(sv('path',{d:gbRib(rec.pts,rec.pts.map(()=>3.2))}))}
   {const q=rec.pts[rec.pts.length-1],q0=rec.pts[rec.pts.length-2],ang=Math.atan2(q[1]-q0[1],q[0]-q0[0])*180/Math.PI;el.append(sv('path',{d:gbLeafD(5,2.4),class:'tipbud',transform:'translate('+gbP(q)+') rotate('+gbF(ang)+')'}))}
   rec.g=el;for(const uid of rec.uids){B.shoots[uid]=rec;B.budG[uid]=rec}
   /* a shoot appears once the knot it grows from is there */
   const now=performance.now(),tb=gbT('kn:'+rec.kid+((B.kgk||{})[rec.kid]||''),0)+300;if(!quiet&&el.animate&&now<tb+300)el.animate([{opacity:0},{opacity:1}],{duration:300,delay:Math.max(0,tb-now),fill:'backwards'})}}
 for(const uid in M.buds){const g=B.budG[uid];if(!g)continue;g.list=g.list||[];}
 for(const g of new Set(Object.values(B.shoots)))g.list=[];
 for(const uid in M.buds){const g=B.budG[uid];if(g)g.list.push(...M.buds[uid])}
 for(const g of new Set(Object.values(B.shoots))){const list=gbOrd(g.list);
  /* a shoot that took in its crowded neighbours carries a leaf more, and says how many more checks it holds */
  {const n=Math.min(4,Math.max(3,list.length));if(g.n!==n){g.n=n;g.slots=gbShootSlots(g.pts,n);g.list0=null}
   if(!g.cnt){const q=g.pts[g.pts.length-1],q0=g.pts[g.pts.length-3],dx=q[0]-q0[0],dy=q[1]-q0[1],m=Math.hypot(dx,dy)||1;/* where the one placement pass put it (gbKnotNames); with no clear place it is left off */const at=g.cntAt;g.cnt=at?sv('text',{class:'shn',x:gbF(at.x),y:gbF(at.y),'text-anchor':at.anc},''):sv('text',{class:'shn',x:gbF(q[0]+dx/m*9),y:gbF(q[1]+dy/m*9+3),'text-anchor':dx>=0?'start':'end'},'');if(at===false)g.cnt.style.display='none';g.g.append(g.cnt)}
   g.cnt.textContent=list.length>n?'+'+(list.length-n):''}
  list.forEach((x,i)=>{let el=B.bud[x.id];if(i>=g.slots.length){if(el)el.classList.add('gone');return}
   const q=g.slots[i];if(el&&el.__q!==q){el.style.transform='translate('+gbF(q[0])+'px,'+gbF(q[1])+'px) rotate('+gbF(q[2])+'deg)'+(q[3]&&q[3]!==1?' scale('+gbF(q[3])+')':'');el.__q=q}
   if(!el){el=sv('g',{class:'gb-lf bud','data-k':'s:'+x.id,tabindex:-1,role:'button'},sv('g',{class:'gb-lfi'},sv('circle',{r:gbF(Math.max(8,12/gbHf(B)/(q[3]||1))),cx:8.5,class:'hitc'}),sv('path',{d:'M0 0 L3.6 0',class:'bpet'}),sv('path',{d:gbLeafD(11,5.6),transform:'translate(9 0)',class:'blade'})));
    el.style.transform='translate('+gbF(q[0])+'px,'+gbF(q[1])+'px) rotate('+gbF(q[2])+'deg)'+(q[3]&&q[3]!==1?' scale('+gbF(q[3])+')':'');el.__q=q;el.__u=g.uids[0];el.__base=g.base;g.g.append(el);B.bud[x.id]=el}
   /* while a dropped shoot fades, its leaves stay on it */
   const fad=!showBuds&&!!(g.fade||(g.on===undefined?gw.prevBuds:g.on));const im=(showBuds||fad)&&(inMode(x)||pv==='max'||fad);const cut=!!pv&&pv!=='max'&&inMode(x);
   el.setAttribute('class','gb-lf bud'+(x.scenarioKind==='regression'?' reg':'')+' '+gbLeafState(x)+(im?'':' gone')+(im&&!inMode(x)?' pv-add':'')+(im&&(cut||fad)?' pv-out':''));
   el.setAttribute('aria-label',(x.scenarioKind==='regression'?'Existing flow: ':'Part check: ')+x.title+', '+gbStateWord(x).t+(i===g.slots.length-1&&list.length>g.slots.length?'; and '+(list.length-g.slots.length)+' more checks here, in the Outline':''))});
  /* shoots a chosen mode drops wither and fade, rather than vanish */
  const any=list.some(inMode),on=showBuds&&(any||pv==='max'),was=g.on===undefined?gw.prevBuds:g.on;g.on=on;
  if(on){g.g.style.display='';if(g.fade){g.fade.cancel();g.fade=null}}
  else if(was&&!quiet&&(!pvWas||chose)&&g.g.animate&&!g.fade){g.g.style.display='';g.g.style.transformBox='view-box';g.g.style.transformOrigin=gbF(g.base[0])+'px '+gbF(g.base[1])+'px';
   /* a dropped shoot is cut at the bark: the tick across its foot, then it tips about the cut and falls, and the callus is left */
   const lag=Math.min(400,40*(gw.cutN=(gw.cutN||0)+1));g.g.classList.add('snap');setTimeout(()=>g.g.classList.remove('snap'),lag+500);
   /* about 25 degrees about the cut, away from the wood, then down 40 to 60 px as it fades: half a second, gathering speed.
      Once it has gone the fall is let go of, so the shoot can show again (a later preview's ghost, say) */
   const tip=(g.tip[0]>=g.base[0]?1:-1)*(22+6*gbHash('shf:'+g.kid)),dy=40+20*gbHash('shy:'+g.kid);g.fade=g.g.animate([{opacity:1,transform:'none'},{opacity:1,transform:'rotate('+gbF(tip)+'deg)',offset:.35},{opacity:0,transform:'translate(0,'+gbF(dy)+'px) rotate('+gbF(tip)+'deg)'}],{duration:520,delay:lag+60,easing:'ease-in',fill:'forwards'});
   {const a=g.fade;a.onfinish=()=>{if(g.fade===a)g.fade=null;if(!g.on)g.g.style.display='none';a.cancel()}}
   if(g.scar&&g.scar.animate)g.scar.animate([{opacity:0},{opacity:1}],{duration:240,delay:lag+60+180,fill:'backwards'})}
  else if(!g.fade)g.g.style.display='none';
  /* where a dropped shoot was cut: a flush oval on the bark, its pale face ringed by the callus that grows over it */
  if(!g.scar){const a=Math.atan2(g.pts[1][1]-g.pts[0][1],g.pts[1][0]-g.pts[0][0])*180/Math.PI,c={cx:gbF(g.base[0]),cy:gbF(g.base[1])};g.scar=sv('g',{class:'shscar',transform:'rotate('+gbF(a+90)+' '+gbP(g.base)+')'},sv('ellipse',{...c,rx:3.6,ry:2.7,class:'cal'}),sv('ellipse',{...c,rx:2.3,ry:1.6,class:'face'}));B.gWood.append(g.scar)}
  g.scar.style.display=on?'none':'';g.g.classList.toggle('pv-add',pv==='max'&&!any);g.g.classList.toggle('pv-out',(!!pv&&pv!=='max'&&any)||(!!g.fade&&!on));g.g.classList.toggle('pre',!s.modeBy&&!pv&&!list.some(x=>gbRank[x.mode]===0))}
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

/* a knot's name: its file's, or for a burl the file in it that is lit (else its first) and how many more grew into it */
const gbKnotTxt=(M,ids,lead)=>{const u=M.U[lead]||{};return gwCut(u.label||lead,ids.length>1?16:24)+(ids.length>1?' +'+(ids.length-1)+(ids.length>2?' parts':' part'):'')};
/* At rest a tree carries a few names, so it is never anonymous: every knot when there are three or fewer, else the three
   most journeys cross (then the most scenarios), and every burl; each only where there is room */
function gbRestK(B,M){const Q=B.klq||[];if(Q.length<=3)return new Set(Q.map(e=>e.id));const s=gw.state;
 const sc=e=>{const ids=B.knot[e.id]?B.knot[e.id].__ids:[e.id],js=M.J.filter(j=>ids.some(id=>j.units.includes(id)));return [js.length,s.scenarios.filter(x=>ids.includes(x.unit)).length+js.reduce((t,j)=>t+(M.leaves[j.id]||[]).length,0)]};
 const top=Q.map(e=>({e,v:sc(e)})).sort((a,b)=>b.v[0]-a.v[0]||b.v[1]-a.v[1]).slice(0,3).map(o=>o.e.id);return new Set([...top,...Q.filter(e=>(B.knot[e.id]?B.knot[e.id].__ids:[]).length>1).map(e=>e.id)])}
/* Place the names that show (gbKnotNames) and set them: o carries a card and its hairline, which the names keep clear of */
function gbPlaceNames(B,o){const [want,txt]=B.kwant||[new Map(),new Map()];const got=new Map();for(const run of B.kplace||[])for(const [id,g] of run(want,{txt,...(o||{})}))got.set(id,g);
 for(const id in B.klbl){const kl=B.klbl[id],g=got.get(id);kl.__fit=!!g;kl.classList.toggle('nofit',!g);
  if(g){kl.setAttribute('x',gbF(g.x));kl.setAttribute('y',gbF(g.yb));kl.setAttribute('text-anchor',g.anc);kl.__r=g.r;if(kl.__ld)kl.__ld.setAttribute('d','M'+g.pts.map(gbP).join(' L'))}
  kl.classList.toggle('on',!!g&&!!(kl.__want||kl.__rest));kl.classList.toggle('rest',!!g&&!!kl.__rest)}
 return got}
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
 const R0=L.leaf&&on?gbRoute(L.leaf):null,litU=R0&&R0.lit?R0.lit:L.units,unU=R0&&R0.un?R0.un:new Set();
 for(const el of new Set(Object.values(B.knot))){const lit=el.__ids.some(id=>litU.has(id));el.classList.toggle('on',lit);el.classList.toggle('unreached',!lit&&el.__ids.some(id=>unU.has(id)))}
 /* red is the focused failure's alone: a knot where a scenario broke shows it at rest, and while what is lit holds that
    scenario (the leaf itself, its pad or journey, the knot, a criterion it answers); otherwise it is a plain knot */
 const hk0=gw.hov&&gw.hov.startsWith('u:')?gw.hov.slice(2):null;
 const woundOn=e=>!on||(L.leaf?L.leaf.id===e.xid:gw.selCrit&&!gw.hov?L.leaves.has(e.xid):(!!hk0&&e.unit===hk0)||(L.js.has(e.jid)&&(!L.pad||(B.leaf[e.xid]||{}).__p===L.pad)));
 const mute=ids=>{const es=(B.fails||[]).filter(e=>ids.includes(e.unit));return es.length>0&&!es.some(woundOn)};
 for(const el of new Set(Object.values(B.knot)))el.classList.toggle('wmute',mute(el.__ids));
 for(const id in B.klbl)B.klbl[id].classList.toggle('wmute',mute(B.knot[id]?B.knot[id].__ids:[id]));for(const id in B.root)B.root[id].classList.toggle('wmute',mute([id]));
 const rootPart=L.part&&B.root[L.part]?gw.M.U[L.part]:null;
 const kp=gw.hov||gw.pinned||'',hk=kp.startsWith('u:')?kp.slice(2):null;
 /* the names that show are placed together now (gbKnotNames): every knot that glows is named, and where it broke; the knot
    pointed at, the leaf's own hop and a break first, then the rest of the lit route, then the hops it never reached: every
    hop of the route keeps its name. At rest a few names (gbRestK), only where there is room. A burl is named after the file
    in it that is pointed at or lit */
 const rest=on?null:gbRestK(B,gw.M),want=new Map(),txt=new Map();
 for(const id in B.klbl){const kl=B.klbl[id],ids=B.knot[id]?B.knot[id].__ids:[id];
  const lit=on&&ids.some(q=>q===hk||litU.has(q)||(!!rootPart&&q===rootPart.parent)),un=on&&!lit&&ids.some(q=>unU.has(q)),brk=(kl.classList.contains('wound')||kl.classList.contains('brk'))&&!kl.classList.contains('wmute');
  kl.__want=lit||un;kl.__rest=!!rest&&!brk&&rest.has(id);if(lit||brk)want.set(id,ids.includes(hk)||brk||(!!L.leaf&&ids.includes(L.leaf.unit))?0:1);else if(un||kl.__rest)want.set(id,un?1.5:3);
  if(ids.length>1){const lead=ids.find(q=>q===hk)||(L.leaf?ids.find(q=>q===L.leaf.unit):null)||(on?ids.find(q=>litU.has(q))||ids.find(q=>unU.has(q)):null)||id,t=gbKnotTxt(gw.M,ids,lead);txt.set(id,t);if(kl.textContent!==t)kl.textContent=t}
  kl.classList.toggle('unreached',on&&!ids.some(q=>litU.has(q))&&ids.some(q=>unU.has(q)))}
 B.kwant=[want,txt];gbPlaceNames(B);
 for(const id in B.root){B.root[id].classList.toggle('hl',litU.has(id));B.root[id].classList.toggle('sel',gw.pinned==='u:'+id)}
 /* The route (gbRoute) for a leaf; for a root, the sap it sends up the trunk to each journey it feeds */
 let d='',dx='',dw='',df='';const x=L.leaf;const line=pts=>'M'+pts.map(gbP).join(' L');
 if(x){const R=R0||gbRoute(x);if(R){d=R.d;dx=R.dx;dw=R.dw;df=R.df||''}}
 else if(rootPart){const rr=B.L.roots.find(q=>q.id===L.part);if(rr){const up=rr.pts.slice().reverse();for(const jid of L.js){const pid=(B.padsOf[jid]||[]).find(q=>!B.pad[q].pol)||(B.padsOf[jid]||[])[0];const P=pid&&B.pad[pid];if(!P)continue;
   /* (up the root to where it forks from the trunk above the soil, then up the trunk: no spur down into the ground) */
   const sp=gbSpine(P.rt,P.o),f=gbFork(sp,rr);d+=(d?' ':'')+line(gbSmooth([...sp.slice(0,f.iJ),...f.out].reverse(),1))}if(!d)d=line(up)}}
 /* where a failing scenario broke stays red at rest, and for whatever is lit that holds it; a passing leaf's route, or a
    journey that does not hold the failure, shows no red */
 if(!x)for(const e of B.fails||[])if(woundOn(e)){const R=gbRoute(e.x);if(R&&R.dw)dw+=(dw?' ':'')+R.dw}
 /* the glow runs only where the sap ran: it ends at the break, or at the hop a leaf's own scenario checks. Past it the route
    is small grey dots, under the faint knots it never reached */
 if(!B.sapF){B.sapF=sv('path',{class:'sap faint',d:''});B.sapXo=sv('path',{class:'sap resto',d:''});B.sapX.before(B.sapF,B.sapXo)}
 B.sapX.setAttribute('d',dx);B.sapXo.setAttribute('d',dx);B.sapF.setAttribute('d',df);B.sapW.setAttribute('d',dw);B.sapU.setAttribute('d',d);
 B.sap.setAttribute('d',d)}
/* The wood a leaf's sap runs through on its way down: from where its stalk meets its cushion, down the twig that carries
   that cushion (or, for the outer cushion, to the branch's end inside it), along the branch's centre line to the trunk
   (round a fillet as wide as the branch, not a corner), and down the trunk's centre line. Without a cushion it joins the
   branch straight below. */
function gbSpine(R,at,k){const T=k!==undefined&&R.tw?R.tw[k]:null;const into=(p,q)=>gbSmooth([p,[p[0]+(q[0]-p[0])*.2,(p[1]+q[1])/2],q],2);let mid,K=R.k;
 if(T){mid=[...into(at,T.pts[T.pts.length-1]),...T.pts.slice(0,-1).reverse()];if(R.br)mid.push(...R.br.slice(0,T.bi).reverse());else K=T.bi}
 else if(R.br){let bi=R.br.length-1;if(k===undefined){let bd=1e9;for(let i=R.exit;i<R.br.length;i++){const dd=Math.abs(R.br[i][0]-at[0]);if(dd<bd){bd=dd;bi=i}}}mid=[...into(at,R.br[bi]),...R.br.slice(0,bi).reverse()]}
 else mid=into(at,R.tp[R.k]);
 const all=[...mid,...R.tp.slice(0,K).reverse()];if(!R.br)return all;const c=mid.length-1,r=Math.max(8,(R.bw||8)*1.1),a0=gbBack(all,c,r),a1=gbFwd(all,c,r);
 return [...all.slice(0,a0),...gbBez([all[a0],all[c],all[c],all[a1]],10),...all.slice(a1+1)]}
/* A scenario's route: its sap's way down to the last file its journey reaches, then out along every root the journey depends
   on. A failed scenario's route is gold as far as it ran, red where it broke (on that hop's knot, or just past it when a check
   after that hop failed, or the start of a root), and grey beyond, where it never ran. When the run does not say where it
   broke, only the leaf is red. A part check's route is the wood its shoot grows from. */
function gbRoute(x){const B=gw.B,M=gw.M,L=B.L;const el=B.leaf[x.id]||B.bud[x.id];if(!el)return null;const line=pts=>'M'+pts.map(gbP).join(' L');
 const j=M.J.find(q=>M.leaves[q.id].includes(x));
 if(!j){const g=el.__base&&B.budG[x.unit];return g?{d:line(gbSmooth(g.route,1)),dx:'',dw:'',df:''}:null}
 const P=B.pad[el.__p];const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)(?:\s*rotate\(([-\d.]+)deg\))?/.exec(el.style.transform);if(!m||!P||!P.rt)return null;
 const ra=m[3]?(+m[3])*Math.PI/180:0,k0=P.geo.L/2+(el.classList.contains('hang')?10.5:4.5),at=[+m[1]-Math.cos(ra)*k0,+m[2]-Math.sin(ra)*k0];
 const r=gw.state.run[x.id],w=r&&r.st==='fail'?gbWound(M,j,x):null;
 let pts=gbSpine(P.rt,at,P.geo.cOf.get(x.id));const rr0=j.units.filter(id=>B.root[id]).map(id=>B.L.roots.find(q=>q.id===id)).filter(Boolean);
 /* with no root to run out along, the route ends at the last file it reaches, not in the soil */
 if(!rr0.length){let last=-1;for(const id of j.units){const p=B.pos[id];if(!p||!B.knot[id])continue;let ci=0,bd=1e9;pts.forEach((q,i)=>{const dd=Math.hypot(q[0]-p[0],q[1]-p[1]);if(dd<bd){bd=dd;ci=i}});if(bd<16)last=Math.max(last,ci)}
  if(last>=0)pts=pts.slice(0,gbFwd(pts,last,w&&r.after?24:8)+1)}
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
 const nearI=(path,id)=>{const p=B.pos[id];if(!p)return -1;let ci=-1,bd=20;path.forEach((q,i)=>{const dd=Math.hypot(q[0]-p[0],q[1]-p[1]);if(dd<bd){bd=dd;ci=i}});return ci};
 const whole={d:all(),dx:'',dw:'',df:'',lit:new Set(j.units),un:new Set(),hop};
 /* past the hop it checks, the journey is drawn as never reached, as past a break: grey dots, its knots faint */
 if(!w){if(!own)return whole;const un=new Set(j.units.filter(id=>!own.includes(id)));
  if(B.root[x.unit])return {d:line(main)+rts.filter(t=>t.id===x.unit).map(t=>' '+line(t.pts)).join(''),dx:rts.filter(t=>t.id!==x.unit).map(t=>line(t.pts)).join(' '),df:'',dw:'',lit:new Set(own),un,hop};
  let ci=-1;for(const id of own)if(!B.root[id])ci=Math.max(ci,nearI(main,id));if(ci<0)return whole;
  const acc=gbLen(main);let i1=acc.findIndex(v=>v>=acc[ci]+9);if(i1<0)i1=main.length-1;
  return {d:line(main.slice(0,i1+1)),dx:[i1<main.length-1?line(main.slice(i1)):'',...rts.map(q=>line(q.pts))].filter(Boolean).join(' '),df:'',dw:'',lit:new Set(own),un,hop}}
 const wi=j.units.indexOf(w),lit=new Set(j.units.slice(0,wi+1)),un=new Set(j.units.slice(wi+1).filter(id=>!B.root[w]||!B.root[id]));
 if(B.root[w]){const q=rts.find(t=>t.id===w);if(!q)return whole;const acc=gbLen(q.pts),ci=acc.findIndex(v=>v>Math.max(24,acc[acc.length-1]*.45));
  return {d:line(main)+rts.filter(t=>t!==q).map(t=>' '+line(t.pts)).join(''),dw:line(q.pts.slice(0,ci<0?q.pts.length:ci+1)),dx:ci<0?'':line(q.pts.slice(ci)),df:'',lit:new Set(j.units),un:new Set(),hop}}
 const p=B.pos[w];if(!p)return whole;
 let ci=0,bd=1e9;main.forEach((q,i)=>{const dd=Math.hypot(q[0]-p[0],q[1]-p[1]);if(dd<bd){bd=dd;ci=i}});const acc=gbLen(main);
 const a0=r.after?acc[ci]+4:acc[ci]-9,a1=r.after?acc[ci]+20:acc[ci]+9;let i0=acc.findIndex(v=>v>=a0),i1=acc.findIndex(v=>v>=a1);if(i0<0)i0=main.length-1;if(i1<0)i1=main.length-1;
 return {d:line(main.slice(0,i0+1)),dw:i1>i0?line(main.slice(i0,i1+1)):'',dx:[i1<main.length-1?line(main.slice(i1)):'',...rts.map(q=>line(q.pts))].filter(Boolean).join(' '),df:'',lit,un,hop}}
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
/* Every file's name and every shoot's count, placed in one pass against one set of things to keep clear of: the wood (trunk,
   branches, twigs, roots), every cushion's outline and 4 px round it, every leaf with its stalk, the shoots and their
   leaves, the knots, the pot and the soil, the plant tags, and every other name and number. A count sits just off its
   shoot's tip. A name tries the eight compass points round its knot at three leader lengths, nearest first, and takes the
   first clear one; its leader runs from the middle of the name's near edge to the knot's rim, never shorter than 10 px, and
   no two names share a baseline within 24 px. Every hop of the lit route, reached or not, and where it broke are always
   named (see run); any other name with no clear place is left off rather than set far away or on foliage. */
function gbKnotNames(B,M,T,ti,V){const L=B.L,k=L.narrow?GB_NK:1,X=V.X,sh=q=>[q[0]+X,q[1]];
 const caps=[],rects=[V.potBox],labs=[],cush=[],lines=[],bases=[];const cap=(a,b,r,tag,own)=>caps.push({a,b,r,tag,own});
 const chain=(pts,w,pad,tag)=>{for(let i=0;i<pts.length-1;i++)cap(pts[i],pts[i+1],Math.max(w[i]||1,w[i+1]||1)/2+pad,tag||'wood')};
 chain(V.tp,T.tw,3);for(const b of T.br||[]){chain(b.pts.map(sh),b.w,3);for(const t of b.twigs||[])chain(t.pts.map(sh),t.w,2.5)}
 for(const t of T.ctw||[])chain(t.pts.map(sh),t.w,2.5);for(const r of L.roots||[])if(r.tree===undefined||r.tree===ti)chain(r.pts,r.w,2);
 for(const id in B.pad){const P=B.pad[id];if(P.tree!==ti)continue;const o=P.o,q=P.q0;
  if(q)for(const c of q.cs){if(c.on===false||!c.top||!c.top.length)continue;cush.push({x0:o[0]+c.x0,x1:o[0]+c.x1,top:c.top.map(t=>[o[0]+t[0],o[1]+t[1]]),bot:c.bot.map(t=>[o[0]+t[0],o[1]+t[1]])})}
  const g=P.geo;if(g&&g.slot)for(const [,sl] of g.slot){const c=[o[0]+sl[0],o[1]+sl[1]],th=(sl[2]||0)*Math.PI/180,u=[Math.cos(th),Math.sin(th)],Lf=g.L*(sl[3]||1),st=Lf/2+(sl[4]?10.5:4.5);
   cap([c[0]-u[0]*st,c[1]-u[1]*st],[c[0]+u[0]*Lf/2,c[1]+u[1]*Lf/2],7,'leaf');cap(c,c,10,'leaf')}}
 const myK=new Set((T.knots||[]).map(kn=>kn.id)),shoots=[...new Set(B.shootGeo||[])].filter(g=>myK.has(g.kid));
 for(const g of shoots){for(let i=0;i<g.pts.length-1;i++)cap(g.pts[i],g.pts[i+1],6,'shoot');for(const q of g.slots||[])cap([q[0],q[1]],[q[0],q[1]],11,'shoot')}
 for(const l of L.rl||[]){if(l.box){labs.push(l.box);continue}const w0=gbW(l.t+(l.r.stop&&!l.bare&&!l.note?' · trace stops':''),L.fs*.62),x0=l.anchor==='start'?l.x:l.anchor==='end'?l.x-w0:l.x-w0/2;labs.push([x0-2,l.y-L.fs,x0+w0+2,l.y+3])}
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
 /* what never moves (the edges, the pot, the wood, leaves, shoots, knots and cushions), then the names and hairlines placed so
    far, with a margin round each name; a hairline of a card that points at a name is no obstacle to that name */
 const clearS=r=>{if(r[0]<V.vx+3||r[2]>V.vx+V.W-3||r[1]<V.vy+2||r[3]>soil(r))return false;for(const q of rects)if(ovR(r,q))return false;
  for(const c of caps)if(dSR(c.a,c.b,r)<c.r)return false;for(const c of cush)if(cushHit(c,r,4))return false;return true};
 const clearL=(r,m,id)=>{m=m===undefined?1:m;const rI=[r[0]-12*k*m,r[1]-6*k*m,r[2]+12*k*m,r[3]+6*k*m];for(const q of labs)if(ovR(rI,q))return false;for(const l of lines)if(l[2]!==id&&dSR(l[0],l[1],r)<2)return false;return true};
 const clear=(r,m,id)=>clearS(r)&&clearL(r,m,id);
 const segX=(a,b,c,d)=>{const o=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));return o(a,b,c)!==o(a,b,d)&&o(c,d,a)!==o(c,d,b)};
 /* a hairline never crosses a name, another hairline or another knot; strict, it keeps off leaves, shoots and foliage too */
 const segS=(R,A,id,soft)=>{for(const c of caps){if(c.tag==='wood'||c.own===id)continue;if(c.tag==='knot'){if(dSR(c.a,c.b,[Math.min(R[0],A[0]),Math.min(R[1],A[1]),Math.max(R[0],A[0]),Math.max(R[1],A[1])])<c.r+3&&dPS(c.a,R,A)<c.r+3)return false}else if(!soft&&dPS(c.a,R,A)<c.r-3&&dPS(c.b,R,A)<c.r-3)return false}
  if(!soft)for(let i=1;i<10;i++){const t=i/10,p=[R[0]+(A[0]-R[0])*t,R[1]+(A[1]-R[1])*t];for(const c of cush)if(cushHit(c,[p[0],p[1],p[0],p[1]],2))return false}return true};
 const segL=(R,A,id)=>{for(const q of labs)if(dSR(R,A,q)<1)return false;for(const l of lines)if(l[2]!==id&&segX(R,A,l[0],l[1]))return false;return true};
 const leadS=(pts,id,soft)=>pts.every((p,i)=>i===0||segS(p,pts[i-1],id,soft)),leadOK=(pts,id,soft)=>leadS(pts,id,soft)&&pts.every((p,i)=>i===0||segL(p,pts[i-1],id));
 const baseOK=(r,yb)=>!bases.some(([y2,r2])=>Math.abs(yb-y2)<7*k&&Math.max(r2[0]-r[2],r[0]-r2[2])<24*k);
 /* a shoot's count, just off its tip, on the side away from the wood it leaves */
 const fs2=9.5*k,cw2=.6*fs2;
 for(const g of shoots){const list=(g.uids||[]).flatMap(id=>M.buds[id]||[]),n=Math.min(4,Math.max(3,list.length)),more=list.length-n;g.cntAt=false;if(more<=0)continue;
  const txt='+'+more,tw=txt.length*cw2,q=g.pts[g.pts.length-1],q0=g.pts[Math.max(0,g.pts.length-3)],m=Math.hypot(q[0]-q0[0],q[1]-q0[1])||1,d=[(q[0]-q0[0])/m,(q[1]-q0[1])/m];
  for(const R of [6,12,19,26]){for(const a of [0,-45,45,-90,90,-135,135]){const th=a*Math.PI/180,u=[d[0]*Math.cos(th)-d[1]*Math.sin(th),d[0]*Math.sin(th)+d[1]*Math.cos(th)],A=[q[0]+u[0]*R*k,q[1]+u[1]*R*k];
    const anc=u[0]>.35?'start':u[0]<-.35?'end':'middle',x0=anc==='start'?A[0]:anc==='end'?A[0]-tw:A[0]-tw/2,yb=A[1]+(u[1]>.5?.8*fs2:u[1]<-.5?-.25*fs2:.3*fs2),r=[x0-1,yb-.78*fs2-1,x0+tw+1,yb+.22*fs2+1];
    if(clear(r)&&baseOK(r,yb)){g.cntAt={x:anc==='start'?x0:anc==='end'?x0+tw:x0+tw/2,y:yb,anc};labs.push(r);bases.push([yb,r]);break}}if(g.cntAt)break}}
 /* The names. Only the names of what is lit show (and at rest a few), so they are placed when the lighting changes (gbLight),
    each against everything above and the names placed before it: the knot pointed at, the leaf's own hop and a break first,
    then the rest of the lit route, then what is shown only where there is room; within each, the knot with fewest clear
    places first, so a crowded run of knots on one branch shares the open ground. Each tries its places nearest first. A hop
    of the lit route is never left off: it goes further out, then lets its hairline cross leaves and shoots, then takes a
    place in a column just outside the tree, level with its knot, on a hairline with one elbow. */
 const fs=10*k,cw=.62*fs,D8=[[1,0],[.7071,-.7071],[0,-1],[-.7071,-.7071],[-1,0],[-.7071,.7071],[0,1],[.7071,.7071]],D16=[...D8,...D8.map((u,i)=>{const v=D8[(i+1)%8],m=Math.hypot(u[0]+v[0],u[1]+v[1]);return [(u[0]+v[0])/m,(u[1]+v[1])/m]})];
 const rr=(e,u)=>1/Math.sqrt(Math.pow((u[0]*e.tg[0]+u[1]*e.tg[1])/e.ra,2)+Math.pow((u[0]*e.n[0]+u[1]*e.n[1])/e.rb,2));
 const places=(e,txt,lens,dirs)=>{const tw=txt.length*cw;let v=[e.p[0]-e.p0[0],e.p[1]-e.p0[1]];const vm=Math.hypot(v[0],v[1]);v=vm>.5?[v[0]/vm,v[1]/vm]:[e.n[0],e.n[1]];
  const ds=dirs.slice().sort((a,b)=>(Math.acos(Math.max(-1,Math.min(1,a[0]*v[0]+a[1]*v[1])))-Math.acos(Math.max(-1,Math.min(1,b[0]*v[0]+b[1]*v[1]))))||(Math.abs(b[0])-Math.abs(a[0])));const out=[];
  for(const len of lens)for(const u of ds){const R0=rr(e,u),A=[e.p[0]+u[0]*(R0+len*k),e.p[1]+u[1]*(R0+len*k)];let anc,x0,yb;
   if(Math.abs(u[0])>.38){anc=u[0]>0?'start':'end';x0=anc==='start'?A[0]+2:A[0]-2-tw;yb=A[1]+.28*fs}else{anc='middle';x0=A[0]-tw/2;yb=u[1]<0?A[1]-.22*fs-2:A[1]+.78*fs+2}
   const R=[e.p[0]+u[0]*(R0+1),e.p[1]+u[1]*(R0+1)];out.push({anc,x:anc==='start'?x0:anc==='end'?x0+tw:x0+tw/2,yb,r:[x0-1.5,yb-.78*fs-1.5,x0+tw+1.5,yb+.22*fs+1.5],R,A,pts:[A,R]})}return out};
 /* the column beside the tree: just outside everything the tree is made of, on the side nearer the knot first */
 let gx0=1e9,gx1=-1e9;for(const c of caps)for(const p of [c.a,c.b]){gx0=Math.min(gx0,p[0]-c.r);gx1=Math.max(gx1,p[0]+c.r)}for(const c of cush){gx0=Math.min(gx0,c.x0);gx1=Math.max(gx1,c.x1)}
 const gut=(e,txt)=>{const tw=txt.length*cw,out=[];for(const sd of [-1,1].sort((a,b)=>Math.abs((a<0?gx0:gx1)-e.p[0])-Math.abs((b<0?gx0:gx1)-e.p[0]))){
  const xe=sd<0?Math.max(V.vx+4+tw,gx0-8*k):Math.min(V.vx+V.W-4-tw,gx1+8*k),x0=sd<0?xe-tw:xe,R=[e.p[0]+sd*(rr(e,[sd,0])+1),e.p[1]];
  for(let i=0;i<29;i++){const ym=e.p[1]+(i%2?1:-1)*Math.ceil(i/2)*(fs+4),yb=ym+.28*fs,A=[xe-sd*2,ym],E=[A[0]-sd*Math.min(14*k,Math.abs(A[0]-R[0])*.4),ym];
   out.push({anc:sd<0?'end':'start',x:xe,yb,r:[x0-1.5,yb-.78*fs-1.5,x0+tw+1.5,yb+.22*fs+1.5],R,A,pts:Math.abs(ym-R[1])<.5?[A,R]:[A,E,R]})}}return out};
 const base=[labs.slice(),bases.slice(),lines.slice()],free=new Map();
 const freeOf=(e,txt)=>{const key=e.id+'|'+txt;if(!free.has(key))free.set(key,places(e,txt,[12,24,36],D8).filter(c=>clearS(c.r)&&leadS(c.pts,e.id)));return free.get(key)};
 for(const e of Q){const kl=sv('text',{x:0,y:0,class:'klbl nofit'},e.txt),ld=sv('path',{class:'kld',d:''});kl.__fit=false;kl.__ld=ld;V.gKl.append(kl,ld);B.klbl[e.id]=kl}
 /* want: each knot to name and how much it matters (0 and 1 must show, and 1.5, a hop the route never reached, placed after
    them; 3, a name at rest, only close by); o: the text a burl shows for what is lit in it, and a card and its hairline to
    keep clear of. A name that had to go far, or was left off, is tried again first, and the placing that keeps the names
    nearest their knots wins */
 const far=new Map(),farOf=(e,t)=>{const key=e.id+'|'+t;if(!far.has(key))far.set(key,places(e,t,[50,66,84],D16).filter(c=>clearS(c.r)&&leadS(c.pts,e.id,true)));return far.get(key)};
 const run=(want,o)=>{o=o||{};const T=o.txt||new Map(),tx=e=>T.get(e.id)||e.txt;
  const ok=(c,id,soft,m)=>clear(c.r,m,id)&&baseOK(c.r,c.yb)&&leadOK(c.pts,id,soft);
  const lay=order=>{labs.length=0;labs.push(...base[0],...(o.rects||[]));bases.length=0;bases.push(...base[1]);lines.length=0;lines.push(...base[2],...(o.segs||[]));const out=new Map(),hard=[];let cost=0;
   for(const e of order){const t=tx(e),pr=want.get(e.id);let got=null,c0=0;const tryL=(list,soft,c1,step,m)=>{if(got)return;const i=list.findIndex(c=>ok(c,e.id,soft,m));if(i>=0){got=list[i];c0=c1+i*step}};
    tryL(freeOf(e,t),false,0,.15);if(pr<3){tryL(farOf(e,t),false,6,.05);tryL(freeOf(e,t),true,8,.05)}
    if(pr<2){tryL(farOf(e,t),true,10,.05);if(!got){const gc=gut(e,t);tryL(gc,true,14,.1,.35);if(!got){c0=40;got=gc.find(c=>clear(c.r,.35,e.id)&&baseOK(c.r,c.yb))||gc.find(c=>clearL(c.r,.2,e.id))||gc[0]}}}
    if(!got){cost+=pr<3?8:3;hard.push(e);continue}if(c0>=6)hard.push(e);cost+=c0;out.set(e.id,got);labs.push(got.r);bases.push([got.yb,got.r]);for(let k2=1;k2<got.pts.length;k2++)lines.push([got.pts[k2],got.pts[k2-1],e.id])}
   return {out,cost,hard}};
  const P=Q.map((e,i)=>({e,i})).filter(q=>want.has(q.e.id)).sort((a,b)=>(want.get(a.e.id)-want.get(b.e.id))||(freeOf(a.e,tx(a.e)).length-freeOf(b.e,tx(b.e)).length)||(a.i-b.i)).map(q=>q.e);
  let best=lay(P);for(const e of best.hard.slice(0,4)){const pr=want.get(e.id),rest=P.filter(q=>q!==e),at=pr<2?0:rest.findIndex(q=>want.get(q.id)>=pr);const order=[...rest.slice(0,at<0?rest.length:at),e,...rest.slice(at<0?rest.length:at)];const tr=lay(order);if(tr.cost<best.cost-.01)best=tr}
  return best.out};
 (B.kplace=B.kplace||[]).push(run)}
/* where a shoot's leaves sit: set alternately along it from just under halfway to near its tip, each a little smaller */
function gbShootSlots(pts,n){const acc=gbLen(pts),tot=acc[acc.length-1]||1;return Array.from({length:n},(_,i)=>{const t=.42+(.9-.42)*(n===1?0:i/(n-1)),d=t*tot;let k=1;while(k<pts.length-1&&acc[k]<d)k++;
 const a=pts[k-1],b=pts[k],f=(d-acc[k-1])/((acc[k]-acc[k-1])||1),q=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],dir=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;return [q[0],q[1],dir+(i%2?50:-50),1-.36*i/Math.max(1,n-1)]})}
/* a pinned thing's card moves to the inspector: the floating card and its hairline both go */
function gbTipOff(B){if(B.tip)B.tip.hidden=true;if(B.lead)B.lead.setAttribute('d','')}
function gbHover(k,el){gw.hov=k||null;gbLight();if(k)gbTip(k,el);else gbPinTip()}
/* on a phone a tap pins, and the pinned thing keeps its card under the drawing until it is tapped again */
function gbPinTip(){const B=gw.B;if(!B)return;const k=B.L.narrow&&!gw.hov?gw.pinned:null;const el=k&&[...B.svg.querySelectorAll('[data-k]')].find(e=>e.getAttribute('data-k')===k);gbTip(el?k:null,el||null)}
/* a knot's own checks, in the words the inspector and the Outline use for them */
const gbOwnSt=ids=>{const list=ids.flatMap(id=>gw.M.buds[id]||[]);return list.length?h('div',{class:'st own'},gwFacts(gwOwnFacts(list))):null};
/* A card beside the leaf, knot or root under the pointer: what it is, its state with evidence, and the path it crosses. */
function gbTip(k,el){const B=gw.B;if(!B||!B.tip)return;const tip=B.tip;const pid=el&&el.getAttribute&&el.getAttribute('data-pad');const P=pid&&B.pad[pid];
 /* a card docked in the side panel stands in for the panel's own content while it shows, never over it */
 const undock=()=>{const ins=tip.parentNode&&tip.parentNode.parentNode&&tip.parentNode.parentNode.nextElementSibling;if(ins)ins.classList.remove('gb-docked');tip.style.width=''};undock();
 const hide=()=>{tip.hidden=true;if(B.lead)B.lead.setAttribute('d','');if(tip.parentNode)tip.parentNode.style.paddingBottom=''};
 if(!k||!el||(k===gw.pinned&&!B.L.narrow)||(k.startsWith('j:')&&!(P&&(P.pol||P.pruned)))){hide();return}
 const s=gw.state,M=gw.M;/* a path breaks only between its hops */
 const pathOf=(j,R)=>{const parts=j.units.map(id=>M.U[id]).filter(Boolean),o=[...parts.filter(u=>!u.root),...parts.filter(u=>u.root)];return gwHops(o.map(u=>u.label),R?o.map(u=>R.lit.has(u.id)?'hit':'un'):null)};
 tip.replaceChildren();
 if(k.startsWith('s:')){const x=s.scenarios.find(q=>q.id===k.slice(2));if(!x){hide();return}const j=M.J.find(q=>M.leaves[q.id].includes(x));const w=gbStateWord(x),r0=s.run[x.id];
  gwPut(tip,h('span',{class:'k'},(j?{happy:'happy path',guard:'what it refuses',failure:'how it fails'}[gbPol(x)]:x.scenarioKind==='regression'?'existing flow':'part check')+(x.criteria.length?' · '+x.criteria.join(' '):'')),h('b',{},x.title),
   /* a failure says where it broke, in the same words as the list, then where on the route */
   r0&&r0.st==='fail'?h('div',{class:'st fail'},gwBroke(r0,140)):h('div',{class:'st '+w.c},w.t),
   /* the hop it checks comes before the whole path; the hops it reaches are in ink and the rest faint, as the tree lights
      them (gbReach) */
   j&&j.units.includes(x.unit)?h('div',{class:'st hopl'},x.scenarioKind==='happy'?'Runs the whole journey, '+j.units.length+' hop'+(j.units.length===1?'':'s'):['Exercises ',h('b',{},(M.U[x.unit]||{}).label||x.unit),' (hop '+(j.units.indexOf(x.unit)+1)+' of '+j.units.length+')']):null,
   h('div',{class:'path'},j?pathOf(j,gbReach(M,j,x)):((M.U[x.unit]||{}).label||'')+(x.flow&&x.scenarioKind==='regression'?' · '+x.flow:'')))}
 else if(k.startsWith('j:')){const j=M.J.find(q=>q.id===P.jid);const n=(gw.order||[]).indexOf(P.jid)+1;const vis=s.modeBy?s.mode:null;
  const later=P.leaves.filter(x=>vis&&gbRank[x.mode]>gbRank[vis]);
  gwPut(tip,h('span',{class:'k'},'journey '+n+(P.pol?' · '+(P.pol==='failure'?'how it fails':'what it refuses'):'')),h('b',{},j?j.title:''),
   h('div',{class:'st'},P.pruned?'Pruned in '+gbModeName(vis)+': '+later.length+' scenario'+(later.length===1?'':'s')+' here; '+[...new Set(later.map(x=>gbModeName(x.mode)))].join(' and ')+' grows '+(later.length===1?'it':'them')+'.'
    :(P.leaves.length-later.length)+' scenario'+(P.leaves.length-later.length===1?'':'s')+(P.pol==='failure'?' that break it on purpose and check it fails safely':' that check it refuses what it must')+(later.length?'; '+later.length+' more in '+gbModeName(later[0].mode):'')+'.'))}
 else if(B.knot[k.slice(2)]&&B.knot[k.slice(2)].__ids.length>1){const ids=B.knot[k.slice(2)].__ids;const on=M.J.filter(j=>ids.some(id=>j.units.includes(id)));
  gwPut(tip,h('span',{class:'k'},ids.length+' parts on one knot'),...ids.map(id=>h('b',{},(M.U[id]||{}).label||id)),
   h('div',{class:'st'},on.length===1?'On 1 journey: '+on[0].title:on.length+' of '+M.J.length+' journeys pass through them'),gbOwnSt(ids))}
 else{const id=k.slice(2);const u=M.U[id];if(!u){hide();return}const on=M.J.filter(j=>j.units.includes(id));
  const stop=s.stops.find(x=>x.unit===id);
  gwPut(tip,h('span',{class:'k'},u.root?(u.layer==='ext'?'depends on · outside the repo':'depends on · in the repo'):'part'),h('b',{},u.label),h('div',{class:'path'},u.loc),
   h('div',{class:'st'},u.root?gbFeeds(on.map(j=>(gw.order||[]).indexOf(j.id)+1).sort((a,b)=>a-b))+(on.length===1?': '+on[0].title:on.length?'':' in this change, so it lies loose'):on.length?(on.length===1?'On 1 journey: '+on[0].title:on.length+' of '+M.J.length+' journeys pass through it'):'Changed, but no journey in this change reaches it'),
   gbOwnSt([id]),stop?h('div',{class:'st'},'Tracing stops here: '+stop.why):null)}
 tip.hidden=false;const wrap=tip.parentNode;if(!wrap)return;
 /* on a phone there is no room beside anything: the card sits under the drawing, full width, and the drawing stays clear */
 const narrow=B.L.narrow||wrap.clientWidth<480;tip.classList.toggle('below',narrow);tip.classList.remove('dock');tip.style.maxWidth='';
 if(narrow){const sr=B.svg.getBoundingClientRect(),c0=wrap.getBoundingClientRect();tip.style.left='0px';tip.style.top=gbF(sr.bottom-c0.top+6)+'px';wrap.style.paddingBottom=gbF(tip.offsetHeight+12)+'px';return}
 wrap.style.paddingBottom='';const c=wrap.getBoundingClientRect();const tw=tip.offsetWidth,th=tip.offsetHeight;
 const sr=B.svg.getBoundingClientRect(),vb=B.svg.viewBox.baseVal,f=sr.width/vb.width;const toPx=p=>[sr.left-c.left+(p[0]-vb.x)*f,sr.top-c.top+(p[1]-vb.y)*f],toSv=q=>[vb.x+(q[0]-(sr.left-c.left))/f,vb.y+(q[1]-(sr.top-c.top))/f];
 const box=q=>[q.left-c.left,q.top-c.top,q.right-c.left,q.bottom-c.top];
 /* A root is long and runs off under the pot: its card points at where it crosses the rim, the spot its name is set by (a
    store in the pot, at the point its tag stands by). A knot's card points at the knot's name, which has its own hairline
    to the knot, so no second line runs into the knot. Anything else, at itself. */
 const rid=k.startsWith('u:')&&B.root[k.slice(2)]?k.slice(2):null,rr=rid?B.L.roots.find(q=>q.id===rid):null,P0=B.L.potC-B.L.potL/2,P1=B.L.potC+B.L.potL/2;
 const xo=rr&&rr.pts?rr.pts.find(p=>p[0]<P0||p[0]>P1):null,rim=xo?toPx(xo):rid&&B.pos[rid]?toPx(B.pos[rid]):null;
 const kn=k.startsWith('u:')?B.knot[k.slice(2)]:null,klk=kn?Object.keys(B.klbl).find(q=>B.knot[q]===kn):null,kl=klk?B.klbl[klk]:null,kb=kl&&kl.__fit&&kl.classList.contains('on')?box(kl.getBoundingClientRect()):null;
 const me=rim?[rim[0]-6,rim[1]-6,rim[0]+6,rim[1]+6]:box(el.getBoundingClientRect()),AB=rim?[rim[0],rim[1],rim[0],rim[1]]:kb||me;
 const x0=me[0],y0=me[1],x1=me[2],y1=me[3],cx=(x0+x1)/2,cy=(y0+y1)/2;
 /* The card never covers what it explains: the thing pointed at and its name, the route it lights, the names of the files on
    that route, or (for a root) the root itself, its name and where its trace stops; nor any name in the ground. Those are
    hard; other names and the pot are soft. No hairline crosses a name of any kind. */
 const hard=[[x0-6,y0-6,x1+6,y1+6]],soft=[],nox=[];if(kb)hard.push([kb[0]-4,kb[1]-4,kb[2]+4,kb[3]+4]);
 /* a root is a long thin line: the card keeps off the line itself, not the whole box it spans, or it could never sit by the pot */
 const rpx=rr&&rr.pts?rr.pts.map((p,i)=>{const q=toPx(p),r=(rr.w[i]||2)*f/2+5;return [q[0]-r,q[1]-r,q[0]+r,q[1]+r]}):[];
 for(const t of Object.values(B.klbl))if(t.classList.contains('on')||((t.classList.contains('wound')||t.classList.contains('brk'))&&!t.classList.contains('wmute'))){const q=t.getBoundingClientRect();if(q.width){hard.push(box(q));if(t!==kl)nox.push(box(q))}}
 for(const t of B.svg.querySelectorAll('.rlbl')){const q=t.getBoundingClientRect();if(q.width){hard.push(box(q));nox.push(box(q))}}
 for(const l of Object.values(B.lbl)){const q=l.el.getBoundingClientRect();if(q.width){(l.el.classList.contains('hl')?hard:soft).push(box(q));nox.push(box(q))}}
 /* the leaves it lights are what it explains, so it never sits on them; nor on the pot, whose face carries names */
 for(const lf of B.svg.querySelectorAll('.gb-lf.hl,.gb-lf.sel')){const q=lf.getBoundingClientRect();if(q.width){const b=[q.left-c.left-6,q.top-c.top-6,q.right-c.left+6,q.bottom-c.top+6];hard.push(b);nox.push(b)}}
 const firm=[];const pot=B.svg.querySelector('.pots');if(pot){const q=pot.getBoundingClientRect();if(q.width)firm.push(box(q))}
 /* and it would rather sit on empty ground than on foliage, shoots or the hairlines of names */
 for(const P of Object.values(B.pad)){const q=P.el.getBoundingClientRect();if(q.width)soft.push(box(q))}
 for(const e of B.svg.querySelectorAll('.budg,.kld,.scar.on')){const q=e.getBoundingClientRect();if(q.width||q.height)soft.push(box(q))}
 /* the route, as points along it */
 const rp=[];for(const pe of [B.sap,B.sapX,B.sapW]){const dd=pe.getAttribute('d')||'';const nums=dd.match(/-?[\d.]+/g)||[];for(let i=0;i+1<nums.length;i+=6)rp.push(toPx([+nums[i],+nums[i+1]]))}
 /* it stays inside the drawing, never past the panel's edge; only a root's card, whose root lies at the foot of the drawing,
    may hang below it over the key, and only when nothing near the rim is open (the key costs more than a little distance) */
 const W2=Math.min(c.width,sr.right-c.left),H0=sr.bottom-c.top;
 const inB=(p,b)=>p[0]>b[0]&&p[0]<b[2]&&p[1]>b[1]&&p[1]<b[3],ovB=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
 const hit=(a,b,r)=>{let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];for(const [pp,qq] of [[-dx,a[0]-r[0]],[dx,r[2]-a[0]],[-dy,a[1]-r[1]],[dy,r[3]-a[1]]]){if(pp===0){if(qq<0)return false;continue}const t=qq/pp;if(pp<0){if(t>t1)return false;if(t>t0)t0=t}else{if(t<t0)return false;if(t<t1)t1=t}}return true};
 /* Where it may go: beside what it explains on the right or the left, or above or below it, 10, 24 or 40 px away, sliding
    along that side as far as its corners; then further out, to the open ground of the drawing. A root's card tries the
    ground by the pot: outside the rim its root crosses, then under the pot, then the other side. */
 const fit=(tw,th)=>{const H2=rid?H0+th+12:Math.max(H0,th+8),key=[0,H0,W2,H2];
 const cand=[],ring=(b,gaps,dy,dx)=>{for(const gp of gaps){for(let yy=b[1]-th-gp;yy<=b[3]+gp;yy+=dy)cand.push([b[2]+gp,yy],[b[0]-tw-gp,yy]);for(let xx=b[0]-tw-gp;xx<=b[2]+gp;xx+=dx)cand.push([xx,b[1]-th-gp],[xx,b[3]+gp])}};
 ring(AB,[10,24,40],12,20);if(AB!==me)ring(me,[10,24,40],12,20);ring(AB,[64,100,150,220,300],24,40);
 if(rim&&firm[0]){const pb=firm[0],sd=xo?(xo[0]>P1?1:-1):(rim[0]<(pb[0]+pb[2])/2?-1:1),side=s2=>{for(const gp of [10,24,40,64,100])for(let yy=Math.min(rim[1],pb[1])-th-gp;yy<=pb[3]+gp;yy+=12)cand.push([s2<0?pb[0]-tw-gp:pb[2]+gp,yy])};
  side(sd);for(const gp of [10,24,40])for(let xx=pb[0]-tw;xx<=pb[2];xx+=20)cand.push([xx,pb[3]+gp]);side(-sd)}
 const ov=(x,y,b)=>ovB([x,y,x+tw,y+th],b);
 /* the nearest points of two boxes, one on each */
 const near=(a,b)=>{const ax=(lo,hi)=>b[hi]<a[lo]?[a[lo],b[hi]]:b[lo]>a[hi]?[a[hi],b[lo]]:[(Math.max(a[lo],b[lo])+Math.min(a[hi],b[hi]))/2,(Math.max(a[lo],b[lo])+Math.min(a[hi],b[hi]))/2];const X=ax(0,2),Y=ax(1,3);return [[X[0],Y[0]],[X[1],Y[1]]]};
 /* The hairline back to what it explains, when the card is more than 16 px off: straight, or with one elbow (along, then
    into the card's side) when that keeps it off a name. It never crosses a name, and would rather not cross foliage, the
    pot or the lit route. */
 const lead=CB=>{const [pa,pc]=near(AB,CB);if(Math.hypot(pc[0]-pa[0],pc[1]-pa[1])<=16)return {pts:null,pen:0};const opts=[[pa,pc]];
  if(pa[0]<CB[0]||pa[0]>CB[2]){const my=Math.max(CB[1]+10,Math.min(CB[3]-10,pa[1]));if(Math.abs(my-pa[1])>4)opts.push([pa,[pa[0],my],[pa[0]<CB[0]?CB[0]:CB[2],my]])}
  if(pa[1]<CB[1]||pa[1]>CB[3]){const mx=Math.max(CB[0]+10,Math.min(CB[2]-10,pa[0]));if(Math.abs(mx-pa[0])>4)opts.push([pa,[mx,pa[1]],[mx,pa[1]<CB[1]?CB[1]:CB[3]]])}
  let bestL=null;for(const pts of opts){let pen=pts.length>2?12:0;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],sl=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(const q of nox)if(!inB(pa,q)&&hit(a,b,[q[0]-2,q[1]-2,q[2]+2,q[3]+2]))pen+=3000;
    for(let s2=4;s2<sl;s2+=6){const t=s2/sl,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(inB(p,me))continue;if(firm.some(q=>!inB(pa,q)&&inB(p,q)))pen+=300;else if(soft.some(q=>!q[4]&&!inB(pa,q)&&inB(p,q)))pen+=60;if(rp.some(r=>Math.hypot(r[0]-p[0],r[1]-p[1])<5))pen+=60}}
   if(!bestL||pen<bestL.pen)bestL={pts,pen}}return bestL};
 let best=null;
 for(const q of cand){const x=Math.max(4,Math.min(q[0],W2-tw-4)),y=Math.max(4,Math.min(q[1],H2-th-4)),CB=[x,y,x+tw,y+th];let sc=0;
  for(const b of hard){const o=ov(x,y,b);if(o>0)sc+=1e5+o*10}if(rpx.some(b=>ov(x,y,b)>0))sc+=1e5;for(const b of firm){const o=ov(x,y,b);if(o>0)sc+=4e4+o*5}for(const b of soft)sc+=ov(x,y,b)*(b[4]||2);
  for(const p of rp)if(p[0]>x-3&&p[0]<x+tw+3&&p[1]>y-3&&p[1]<y+th+3)sc+=2e4;if(ov(x,y,key)>0)sc+=4000+ov(x,y,key)*.02;
  const [pa,pc]=near(AB,CB);sc+=25*Math.hypot(pc[0]-pa[0],pc[1]-pa[1])+Math.abs(x+tw/2-cx)*.05;if(best&&sc>=best.sc)continue;
  const L2=lead(CB);sc+=L2.pen;if(!best||sc<best.sc-1)best={x,y,sc,pts:L2.pts,CB}}
 return best};
 /* a card with no open ground near what it explains tries a narrower, taller shape: beside a pot or a crown there is
    often room for one but not the other */
 let best=fit(tw,th);if(best.sc>4000)for(const w of [250,215]){if(w>=tw)continue;tip.style.maxWidth=w+'px';const b2=fit(tip.offsetWidth,tip.offsetHeight);b2.sc+=(tw-w)*8;if(b2.sc<best.sc){best=b2;best.mw=w}}
 tip.style.maxWidth=best.mw?best.mw+'px':'';
 tip.style.left=gbF(best.x)+'px';tip.style.top=gbF(best.y)+'px';
 /* the hairline, drawn in the drawing; a rim point's starts just off the point */
 let lp=null;if(best.pts&&B.lead){lp=best.pts.map(toSv);if(rim){const a=lp[0],b=lp[1],u=Math.hypot(b[0]-a[0],b[1]-a[1])||1;lp[0]=[a[0]+(b[0]-a[0])/u*3,a[1]+(b[1]-a[1])/u*3]}B.lead.setAttribute('d','M'+lp.map(gbP).join(' L'))}else if(B.lead)B.lead.setAttribute('d','');
 /* the names make way for the card and its hairline: a name it covers, or one its hairline would cross, moves (gbPlaceNames) */
 const CB=best.CB,segs=best.pts?best.pts.slice(1).map((p,i)=>[best.pts[i],p]):[];
 const clash=Object.values(B.klbl).some(t=>{if(t===kl||!t.classList.contains('on'))return false;const q=box(t.getBoundingClientRect());return ovB(CB,q)>0||segs.some(([a,b])=>hit(a,b,[q[0]-2,q[1]-2,q[2]+2,q[3]+2]))});
 if(clash){const a=toSv([CB[0]-4,CB[1]-4]),b=toSv([CB[2]+4,CB[3]+4]);gbPlaceNames(B,{rects:[[a[0],a[1],b[0],b[1]]],segs:lp?lp.slice(1).map((p,i)=>[lp[i],p,klk]):[]})}}
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
  else{const uid=bud?cur.__u:k.slice(2);const g=B.budG[uid];if(!g)return;ls=[B.navEl['u:'+uid],...g.g.querySelectorAll('.bud')]}
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
function gbPathEl(j,wound,R){const M=gw.M;const parts=j.units.map(id=>M.U[id]).filter(Boolean);const order=[...parts.filter(u=>!u.root),...parts.filter(u=>u.root)];
 return h('div',{class:'gb-path gw-path gw-hp'},order.map((u,i)=>h('span',{class:'hop'+(R&&!R.lit.has(u.id)?' un':'')},h('button',{class:u.root?'rootp':u.id===wound?'bad':'',title:u.loc,on:{click:e=>{e.stopPropagation();gw.pinned='u:'+u.id;gw.pinList=null;gw.refocus='u:'+u.id;growPaint()},mouseenter:()=>{const B=gw.B;if(B)gbHover('u:'+u.id,B.knot[u.id]||B.root[u.id]||null)},mouseleave:()=>gbHover(null)}},...gwCodeText(gwPlain(u.label))),i<order.length-1?h('span',{class:'sp','aria-hidden':'true'},' › '):null)))}
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
 return [h('h3',{class:'gw-jt'},...gwRich(j.title)),h('div',{class:'where'},gwFacts([n?'Journey '+n:null,gbStarts(j,M),j.by&&j.by!=='rules'?'named by '+(j.by==='spec'?'the spec':j.by):null])),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'The path it crosses'),gbPathEl(j,wound)),
  fails.length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},fails.length===1?'Where it broke':fails.length+' failures'),
   fails.flatMap(x=>[gbItem(x,{class:'gb-ols','data-sid':x.id,on:{click:()=>{gw.pinned='s:'+x.id;gw.pinList=null;gw.refocus='s:'+x.id;growPaint()}}},[gwBadge(x)]),h('div',{class:'err'},gwBroke(s.run[x.id]))])):null,
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Scenarios'),h('div',{class:'gw-jst'},list.length?h('span',{class:'gb-gs'},gbByRole(list).map(gbGlyph)):null,gbToks(toks)),
   list.length&&gw.tree==='grove'?h('button',{class:'gw-lnk',on:{click:()=>{(gw.open||(gw.open={}))['j:'+jid]=true;gw.reveal='j:'+jid;gw.refocus='j:'+jid;growPaint()}}},'Listed under Journeys, below ↓'):null),
  crit.length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Spec it answers'),h('div',{class:'gw-chips'},crit.map(gwCrit))):null]}
/* A scenario's card: what it is and where it sits, its state and, when it failed, where it broke, before the claim it checks;
   then the path it crosses and what proves it. */
function gbScenarioCard(sid){const s=gw.state,M=gw.M;const x=s.scenarios.find(q=>q.id===sid);if(!x)return null;const j=M.J.find(q=>M.leaves[q.id].includes(x));const r=s.run[x.id];const T=gwVia(x.title);const n=j?(gw.order||[]).indexOf(j.id)+1:0;
 return [h('h3',{class:'gw-st'},...gwRich(T.title)),T.via?h('div',{class:'gw-via'},'via ',...gwCodeText(T.via)):null,
  h('div',{class:'where'},...(j?[gbROLEW[gbPol(x)]+' · journey'+(n?' '+n:'')+': ',...gwRich(j.title)]:[(x.scenarioKind==='regression'?'existing flow':'part check')+' · ',...gwCodeText((M.U[x.unit]||{}).label||'')])),
  h('div',{class:'sec'},h('div',{class:'row',style:'gap:8px'},gwBadge(x),x.mode==='min'?h('span',{class:'gw-chip min'},'minimum'):h('span',{class:'gw-chip'},gwML(x.mode).toLowerCase()),x.by!=='rules'?h('span',{class:'gw-chip agent'},x.by):null),
   r&&r.st==='fail'?h('div',{class:'gw-flag red gw-broke'},h('span',{},gwBroke(r))):null,
   x.proves?h('div',{class:'gw-claim'},h('span',{class:'gw-eyebrow'},gwClaim(x)),h('span',{},...gwRich(x.proves))):null),
  j?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'The path it crosses'),gbPathEl(j,gbWound(M,j,x),gbReach(M,j,x))):null,
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Proof'),h('div',{class:'gw-chips'},x.flow?h('span',{class:'gw-chip built'},x.flow):h('span',{class:'gw-chip missing'},'no flow yet'),x.criteria.map(gwCrit),
    x.ext.filter(e=>s.ext[e]&&s.ext[e].state!=='proven').map(e=>h('span',{class:'gw-chip agent',title:s.ext[e].path},'agent-written '+s.ext[e].extKind))),x.variants.length?gwLanes(x):null)]}

/* ---------- The lists: the tree's journeys as rows ---------- */
/* A scenario's glyph in a list is the legend's own: passed, failed, running, to prove, no flow yet, or pruned. */
function gbGlyph(x){const s=gw.state,r=s.run[x.id];const c=s.modeBy&&!gwIn(x)?'cut':!r?(!s.modeBy&&!gwIn(x)?'pre':'in'):r.st==='pass'?'pass':r.st==='fail'?'fail':r.st==='run'?'run':x.flow?'in':'none';
 const g=gwSw(c);g.setAttribute('width','13');g.setAttribute('height','10');return h('span',{class:'gw-g gb-g '+c,'aria-hidden':'true'},g)}
/* The tree's own words for where a leaf sits, the same in every list and card. */
const gbROLE=[['happy','Happy path'],['guard','What it refuses'],['failure','How it fails']];
const gbROLEW={happy:'happy path',guard:'what it refuses',failure:'how it fails'};
/* Scenarios in the order a pad holds them: the happy path, then guards, then failures; the minimum's first in each, pruned last. */
const gbByRole=list=>{const r={happy:0,guard:1,failure:2},s=gw.state,cut=x=>s.modeBy&&!gwIn(x)?1:0;return gbOrd(list).map((x,i)=>({x,i})).sort((a,b)=>cut(a.x)-cut(b.x)||r[gbPol(a.x)]-r[gbPol(b.x)]||a.i-b.i).map(o=>o.x)};
const gbNarrowList=()=>{try{return matchMedia('(max-width:1060px)').matches}catch(e){return false}};
/* Selecting in a list pins, like a click on the tree, and remembers it came from a list, so the row opens in place; the row keeps
   focus across the repaint. */
function gbOlPin(k){gw.pinned=gw.pinned===k?null:k;gw.pinList=gw.pinned;gw.refocus=k;growPaint()}
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
  r&&r.st==='fail'&&!open?h('div',{class:'err'},gwBroke(r,180)):null,open?gbRowBody(x):null]}
/* A row opened in place: where it broke first, when it broke; then the claim, said as what the run did with it; then its chips. */
function gbRowBody(x){const s=gw.state,r=s.run[x.id];const el=h('div',{class:'gb-olin'});
 gwPut(el,r&&r.st==='fail'?h('div',{class:'err',style:'margin:0'},gwBroke(r)):null,
  x.proves?h('div',{class:'gw-claim'},h('span',{class:'gw-eyebrow'},gwClaim(x)),h('span',{},...gwRich(x.proves))):null,
  h('div',{class:'gw-chips'},x.mode==='min'?h('span',{class:'gw-chip min'},'minimum'):h('span',{class:'gw-chip'},gwML(x.mode).toLowerCase()),x.criteria.map(gwCrit),x.layers.map(l=>h('span',{class:'gw-chip'},GW.layers[l])),
   /* the row's badge already says "no flow yet"; the body names the flow when there is one */
   x.flow?h('span',{class:'gw-chip built',title:'Runs this existing flow'},x.flow):null,
   x.ext.filter(e=>s.ext[e]&&s.ext[e].state!=='proven').map(e=>h('span',{class:'gw-chip agent',title:s.ext[e].path},'agent-written '+s.ext[e].extKind))),
  x.variants.length?gwLanes(x):null,r&&r.st==='not_run'&&r.why&&x.flow?h('span',{class:'small muted'},r.why):null);return el}
/* A journey as the lists draw it: its number and name as on the tree, where it starts, its state in the tree's words, the path
   it crosses, then its scenarios by what they prove, in the order its pad holds them. What the mode cut is listed by name. */
function gbJourneyBlock(j,n,M,fold){const s=gw.state;const list=M.leaves[j.id]||[];const inm=gbOrd(list.filter(x=>!s.modeBy||gwIn(x))),out=gbByRole(list.filter(x=>s.modeBy&&!gwIn(x)));
 const key='j:'+j.id,pinned=gw.pinned===key,mine=!!gw.pinned&&list.some(x=>gw.pinned==='s:'+x.id);
 const wound=list.map(x=>gbWound(M,j,x)).find(Boolean);const fail=list.some(x=>s.run[x.id]&&s.run[x.id].st==='fail');
 /* a journey the mode cut entirely says so in the page's one phrasing for pruning */
 const toks=s.modeBy&&list.length&&!inm.length?[[gwPruned(list,s.mode),'n']]:gbTok(list,j,s.modeBy?s.mode:null,x=>!s.modeBy||gwIn(x));const inline=!fold;
 const head=[h('span',{class:'no'},String(n)),h('span',{class:'tt','data-testid':'grow-ol-title-'+n},...gwRich(j.title),j.by&&j.by!=='rules'?h('span',{class:'by'},j.by==='spec'?'from the spec':j.by):null),
  h('span',{class:'wh'},gwFacts([gbStarts(j,M)])),
  h('span',{class:'st'},list.length?h('span',{class:'gb-gs'},gbByRole(list).map(gbGlyph)):null,gbToks(toks))];
 const body=h('div',{class:'gb-olx'});
 gwPut(body,gbPathEl(j,wound),!list.length?h('p',{class:'gw-empty'},'Scenarios appear here as they are drafted.'):null,
  gbROLE.map(([p,t])=>{const g=inm.filter(x=>gbPol(x)===p);return g.length?[h('div',{class:'gb-sub'},t),g.map(x=>gbRow(x,inline))]:null}),
  list.length&&!inm.length?h('p',{class:'gw-empty'},'None in '+gbModeName(s.mode)+'.'):null,
  out.length?gbOlFold('cut:'+j.id,gwPruned(out,s.mode),out.map(x=>gbRow(x))):null);
 if(fold){const open=gbOlOpen(key,pinned||mine||fail);const el=h('details',{class:'gb-jr'+(fail?' failed':'')+(pinned||mine?' sel':''),open:open?true:null});
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
 const part=(key,id,list)=>{const u=M.U[id]||{};const on=onJ(id);
  const where=u.root?gbFeeds(on):on.length?'on journey'+(on.length===1?' ':'s ')+gbAnd(on):'on no journey';
  const sum=[h('b',{class:'pn'},...gwCodeText(gwPlain(u.label||id))),h('span',{class:'gb-gs'},gbByRole(list).map(gbGlyph)),
   gwFacts([...gwOwnWords(list),...gbTok(list,{surface:'',units:[]},vis,inMode).map(t=>h('span',{class:t[1]},t[0])),[where.charAt(0).toLowerCase()+where.slice(1)]])];
  return gbOlFold('bp:'+key+':'+id,sum,h('div',{class:'gb-bpl'},list.flatMap(x=>gbRow(x,gw.tree==='outline'))),list.some(failed)||list.some(x=>gw.pinned==='s:'+x.id),'gb-bpf')};
 /* the parts' rows line up as a table: the names in one column as wide as the longest (to a limit, past which a name wraps after
    a slash), the leaves in one as wide as the most any part has, then the counts and journeys, all starting on the same edges;
    the part checks and the existing flows share those edges, so the two folds read as one table */
 const ids=list=>[...new Set(list.map(x=>x.unit))],most=list=>ids(list).map(id=>list.filter(x=>x.unit===id).length);
 const nw=Math.min(22,Math.max(8,...ids(own.concat(reg)).map(id=>gwPlain((M.U[id]||{}).label||id).length))),lw=Math.min(8,Math.max(1,...most(own),...most(reg)));
 const fold=(key,what,list)=>{if(!list.length)return null;
  return gbOlFold(key,gwFacts([what(list.length),...note(list).map(t=>[t])]),h('div',{class:'gb-olx gb-bpx',style:'--bpn:'+(nw+1)+'ch;--bpl:'+(lw*16-3)+'px'},ids(list).map(id=>part(key,id,list.filter(x=>x.unit===id)))),open)};
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
   h('span',{class:'t'},u.label,feeds.length||u.layer==='ext'?null:h('span',{class:'un'},' · unused'),h('small',{},gwFacts([u.unitKind,[gwRef(u.loc)]]))),h('span',{class:'ld','aria-hidden':'true'}),h('span',{class:'fd'},feeds.length||u.layer==='ext'?gbFeeds(feeds):'Feeds no journey'),
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
  order.length?gbSec('Journeys',String(order.length)):h('p',{class:'gw-empty',style:'margin:6px'},s.units.length?'Journeys appear here as they are traced.':'Parts appear here as they are found.'),
  order.map((j,i)=>gbJourneyBlock(j,i+1,M,false)),
  M.jin.length?h('p',{class:'gb-loose'},'Changed, on no journey: '+M.jin.map(u=>u.label).join(', ')+'. Max checks '+(M.jin.length===1?'it':'them')+' on '+(M.jin.length===1?'its':'their')+' own.'):null,
  buds[0]||buds[1]?[gbSec(gwOwnHead(s.units.flatMap(u=>M.buds[u.id]||[]))),buds]:null,gbOlRoots(M,order),gbOlParts(M,order),
  s.scenarios.length?h('div',{class:'gw-legend',style:'margin-top:14px','aria-label':'Legend'},gwKeyRow('Leaf',[lf('pass','passed'),lf('fail','failed'),lf('run','running'),lf('in','to prove'),lf('none','no flow yet'),s.modeBy&&s.scenarios.some(x=>!gwIn(x))?lf('cut','pruned, named under its journey'):null])):null,
  s.scenarios.some(x=>x.variants.length)?gwMockNote():null);
 return el}
/* Under the tree: the same journeys, folded, a failing or selected one open. It is the one list of scenarios: the inspector beside
   the tree says only what this does not. */
function gbJourneys(){const s=gw.state,M=gw.M||gbModel();const card=h('section',{class:'card gw-jcard','aria-label':'Journeys','data-testid':'grow-scenarios'});const order=gbOrderOf(M);
 gwPut(card,h('div',{class:'row',style:'justify-content:space-between;margin-bottom:6px'},h('span',{class:'gw-eyebrow',style:'margin:0'},'Journeys · '+M.J.length),
  h('span',{class:'small muted'},!s.scenarios.length?'Drafted after tracing':s.modeBy?gwFacts([s.scenarios.filter(gwIn).length+' scenarios in '+gbModeName(s.mode),s.scenarios.length+' drafted']):gwFacts([s.scenarios.length+' drafted',s.scenarios.filter(gwIn).length+' in Minimum']))),
  M.legacy?h('p',{class:'small muted'},'Saved before journeys were traced: one journey per surface, links between parts not recorded. Grow again to trace journeys.'):null,
  order.map((j,i)=>gbJourneyBlock(j,i+1,M,true)),gbBudFolds(M),
  M.jin.length?h('p',{class:'gb-loose'},'Changed, on no journey: '+M.jin.map(u=>u.label).join(', ')+'. Nothing in this change reaches '+(M.jin.length===1?'it':'them')+'; Max checks '+(M.jin.length===1?'it':'them')+' on '+(M.jin.length===1?'its':'their')+' own.'):null,
  s.scenarios.some(x=>x.variants.length)?gwMockNote():null);
 return card}
`;
