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
 --wood:#6E5E50;--wood-lit:#8F7D6B;--wood-shade:#4C4037;--wood-old:color-mix(in srgb,#6E5E50 68%,var(--muted));--knot:#57493E;--knot-lit:#9C8975;--cut:#DCC8A6;--cutc:color-mix(in srgb,var(--verm) 55%,var(--wood));--shoot:color-mix(in srgb,#9BBF5A 82%,var(--wood));--graft:var(--moss);
 --pad:color-mix(in srgb,var(--moss) 44%,var(--paper));--pad-lit:color-mix(in srgb,var(--moss) 30%,var(--paper));--pad-shade:color-mix(in srgb,var(--moss) 70%,var(--paper));
 --fol-hi:color-mix(in srgb,var(--moss) 58%,var(--paper));--fol:color-mix(in srgb,var(--moss) 72%,var(--paper));--fol-lo:color-mix(in srgb,var(--moss) 86%,var(--paper));--fsh-hi:color-mix(in srgb,var(--moss) 70%,var(--paper));--fsh:color-mix(in srgb,var(--moss) 83%,var(--paper));--fsh-lo:color-mix(in srgb,var(--moss) 95%,var(--paper));
 --pad-dim:color-mix(in srgb,var(--moss) 16%,var(--paper));--pad-back:color-mix(in srgb,var(--moss) 34%,var(--paper));--pad-edge:color-mix(in srgb,var(--moss) 62%,var(--paper));
 --pot:color-mix(in srgb,var(--ochre) 26%,var(--line2));--pot-rim:color-mix(in srgb,var(--ochre) 34%,var(--ink3));--pot-ft:color-mix(in srgb,var(--pot) 72%,#3A2A20);--pot-lit:color-mix(in srgb,var(--pot) 78%,#fff);--pot-dk:color-mix(in srgb,var(--pot) 80%,#3A2A20);--soil-c:color-mix(in srgb,#6B4A32 72%,var(--soil));--soil-lit:color-mix(in srgb,#8A6A4C 60%,var(--soil));--pebble:color-mix(in srgb,var(--line2) 70%,var(--paper));--rt-cut:var(--wood);--rt-ext:var(--wood);--stake:#B09676;--moss-rim:color-mix(in srgb,var(--pad) 55%,var(--pad-lit))}
@media (prefers-color-scheme:dark){.gw-svg.gb{--wood:#6E5F50;--wood-lit:#8A7864;--wood-shade:#4A3F35;--wood-old:#5E574E;--knot:#4E4238;--knot-lit:#93826E;--cut:#B9A684;--cutc:color-mix(in srgb,var(--verm) 70%,#fff);--shoot:#A9CF72;--graft:color-mix(in srgb,var(--moss) 70%,#fff);
 --pad:color-mix(in srgb,var(--moss) 50%,var(--paper));--pad-lit:color-mix(in srgb,var(--moss) 66%,var(--paper));--pad-shade:color-mix(in srgb,var(--moss) 30%,var(--paper));
 --fol-hi:color-mix(in srgb,var(--moss) 56%,var(--paper));--fol:color-mix(in srgb,var(--moss) 45%,var(--paper));--fol-lo:color-mix(in srgb,var(--moss) 34%,var(--paper));--fsh-hi:color-mix(in srgb,var(--moss) 45%,var(--paper));--fsh:color-mix(in srgb,var(--moss) 35%,var(--paper));--fsh-lo:color-mix(in srgb,var(--moss) 25%,var(--paper));
 --pad-dim:color-mix(in srgb,var(--moss) 22%,var(--paper));--pad-back:color-mix(in srgb,var(--moss) 40%,var(--paper));--pad-edge:color-mix(in srgb,var(--moss) 38%,var(--paper));
 --pot:color-mix(in srgb,var(--ochre) 30%,#6A584B);--pot-rim:color-mix(in srgb,var(--ochre) 40%,var(--ink3));--pot-ft:color-mix(in srgb,var(--pot) 72%,#000);--pot-lit:color-mix(in srgb,var(--pot) 80%,#fff);--pot-dk:color-mix(in srgb,var(--pot) 78%,#000);--soil-c:#3B2F27;--soil-lit:#46382D;--pebble:color-mix(in srgb,var(--line2) 80%,var(--ink3));--rt-cut:#8C7A66;--rt-ext:#968470;--stake:#9A8468;--moss-rim:#7FA36F}}
.gb .w{fill:var(--wood)}.gb .w.old{fill:var(--wood-old)}.gb .lt{fill:var(--wood-lit)}.gb .sh{fill:var(--wood-shade)}
.gb .grain{fill:none;stroke:var(--wood-shade);stroke-width:.8;stroke-linecap:round;opacity:.32}
.gb .jin{fill:var(--paper);stroke:var(--wood-old);stroke-width:.9;stroke-linejoin:round}
.gb .vein{display:none;fill:none}.gb .vein.live{display:inline;stroke:var(--gold);stroke-width:1.4;stroke-linecap:round;stroke-dasharray:3 5;animation:gbflow 1s linear infinite}
@keyframes gbflow{to{stroke-dashoffset:-16}}
.gb .kn .k1{fill:var(--wood-lit);opacity:.28;transition:fill .2s,opacity .2s}.gb .kn .k2{fill:color-mix(in srgb,var(--wood-lit) 62%,var(--cut));opacity:.42;filter:blur(1px)}.gb .kn .kc{fill:var(--wood-shade);opacity:.42;filter:blur(.4px)}
.gb .kn .ring{fill:none;stroke:var(--ink);stroke-width:1;opacity:0;transition:opacity .2s}
/* a lit knot glows from inside the bark; no annotation ring is drawn on the wood */
.gb .kn .halo{fill:var(--kg,var(--gold));opacity:0;transition:opacity .2s}.gb .kn.on .halo,.gb .kn:hover .halo{opacity:1}.gb .kn.trace .halo{opacity:1}.gb .kn.on .k1{fill:color-mix(in srgb,var(--gold) 45%,var(--wood-lit));opacity:.5}
.gb .kn .crack{display:none;fill:none;stroke:var(--verm);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.gb .kn.wound:not(.wmute) .crack{display:inline}.gb .kn.wound:not(.wmute) .halo{opacity:.75;fill:var(--kgw,var(--verm))}.gb .kn.wound.on:not(.wmute) .halo{opacity:1}
.gb .klbl{font:500 10px var(--mono);fill:var(--ink2);paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round;opacity:0;transition:opacity .2s;pointer-events:none}.gb .klbl.on{opacity:1}.gb .klbl.wound:not(.wmute){opacity:1;fill:var(--verm-ink)}.gb .klbl.brk:not(.wmute){opacity:1;fill:var(--ink)}.gb .kld{fill:none;stroke:var(--ink3);stroke-width:.8;opacity:0;transition:opacity .2s;pointer-events:none}.gb .klbl.on+.kld,.gb .klbl.wound:not(.wmute)+.kld,.gb .klbl.brk:not(.wmute)+.kld{opacity:.8}
.gb .vein,.gb .tw,.gb .sap,.gb .leader,.gb .grain{pointer-events:none}.gb .hitc{fill:transparent;stroke:none}.gb .hitl{fill:none;stroke:transparent;stroke-linecap:round}
.gb [data-k]{cursor:pointer;outline:none}
.gb .kn:focus-visible .ring{opacity:1;stroke:var(--ink)}.gb .rt:focus-visible .rring{opacity:1;stroke:var(--ink);stroke-width:3}.gw-svg.gb:focus{outline:none}.gb .filsh{fill:color-mix(in srgb,var(--wood) 55%,#000);opacity:.3;filter:blur(1px)}
.gb-lf:focus-visible .blade{stroke:var(--ink);stroke-width:2}.gb-lf:focus-visible .hitc{stroke:var(--ink);stroke-width:1.1;stroke-dasharray:2 2}
.gb .pghost{transition:d .5s ease}.gb .pfill{stroke-width:.8;stroke-linejoin:round;transition:fill .25s}.gb .cush.ccr .pfill{fill:var(--fol-lo);stroke:color-mix(in srgb,var(--fol-lo) 75%,var(--ink))}.gb .cush.csh .pfill{fill:var(--fsh-lo);stroke:color-mix(in srgb,var(--fsh-lo) 75%,var(--ink))}
.gb .pcs{fill:none;stroke:color-mix(in srgb,var(--fol-lo) 70%,var(--ink));stroke-width:.9;stroke-linecap:round;opacity:.45}.gb .cush.csh .pcs{stroke:color-mix(in srgb,var(--fsh-lo) 70%,var(--ink))}
/* a cushion that loses its last kept leaf shrinks away into the wood it grew on */
.gb .cush{transform-box:fill-box;transform-origin:50% 100%;transition:opacity .45s,transform .45s}.gb .cush.off{opacity:0;transform:scale(.25)}
.gb .pclu,.gb .ptufts,.gb .pwg{pointer-events:none;transition:opacity .25s}.gb .pwd{fill:var(--wood)}.gb .ptex{opacity:.3}.gb .stl{fill:var(--pad-lit)}.gb .sts{fill:var(--pad-shade)}.gb .ptuft.gone,.gb .tw.gone,.gb .pwd.gone{display:none}
.gb.dim .jg:not(.hl) .pclu,.gb.dim .jg:not(.hl) .ptufts,.gb .jg.pv-cut .pclu,.gb .jg.pv-cut .ptufts,.gb .jg.crown.pruned .pclu,.gb .jg.crown.pruned .ptufts,.gb .jg.pruned.pv-back .pclu,.gb .jg.pruned.pv-back .ptufts{opacity:.12}.gb.dim .jg:not(.hl) .pwg,.gb .jg.pv-cut .pwg,.gb .jg.crown.pruned .pwg{opacity:.3}
.gb .pghost{fill:none;stroke:none}.gb .pad.pv-grow .pghost{fill:var(--fol);fill-opacity:.32;stroke:var(--moss);stroke-width:1;stroke-dasharray:3 3}
.gb .pad:focus-visible .pfill{stroke:var(--ink);stroke-width:1.5}.gb .pad.back .pclu{opacity:.55}
.gb .pad .bud0{display:none;fill:var(--pad-shade);stroke:var(--moss);stroke-width:.8}.gb .pad.bare .bud0{display:inline}.gb .pad.bare .cush,.gb .pad.bare .pwg{display:none}
.gb .jg.pruned{display:none}.gb .jg.crown.pruned{display:inline}.gb .jg.crown.pruned .pfill,.gb .jg.pv-cut .pfill{fill:var(--pad-dim)}.gb .jg.pv-cut .brg,.gb .jg.pv-cut .tw{opacity:.55}
.gb .jg.pruned.pv-back{display:inline}.gb .jg.pruned.pv-back .pfill{fill:var(--pad-dim)}.gb .jg.pruned.pv-back .brg,.gb .jg.pruned.pv-back .tw{opacity:.55}
/* dimming never thins the wood or makes foliage see-through: what is not lit turns pale, opaque, so nothing shows through a pad */
.gb.dim .jg:not(.hl) .pfill{fill:var(--pad-dim)}.gb.dim .jg:not(.hl) .gb-lf{opacity:.32}.gb.dim .kn:not(.on):is(:not(.wound),.wmute){opacity:.55}.gb.lfdim .jg.hl .gb-lf:not(.hl):not(.sel){opacity:.45}
.gb .stub{display:none}.gb .stub.on{display:inline}.gb .stub .sw{fill:var(--wood)}.gb .cutf{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.7}.gb .mlbl{font:600 10.5px var(--mono);fill:var(--muted)}
.gb .cutmk{display:none;fill:none;stroke:var(--verm);stroke-width:1.6;stroke-dasharray:3 2.5;stroke-linecap:round}.gb .cuttag{display:none;font:600 10.5px var(--mono);fill:var(--verm-ink)}.gb .cutmk.on,.gb .cuttag.on{display:inline}
.gb .tw{fill:var(--wood)}.gb .tw.shoot{fill:var(--shoot)}.gb .bud .bpet{fill:none;stroke:var(--shoot);stroke-width:.9;stroke-linecap:round}.gb .budg .cutk{display:none;fill:none;stroke:var(--cutc);stroke-width:1.3;stroke-linecap:round}
/* a shoot a mode would cut is grey with the tick across its foot; one it would add is a ghost, stem and all */
.gb .budg.pre>.tw.shoot,.gb .budg.pv-out>.tw.shoot{fill:color-mix(in srgb,var(--ink3) 40%,var(--paper))}.gb .budg.pre>path.tipbud,.gb .budg.pv-out>path.tipbud{fill:var(--paper);stroke:color-mix(in srgb,var(--ink3) 50%,var(--paper))}.gb .budg.pre .bpet,.gb .budg.pv-out .bpet{stroke:color-mix(in srgb,var(--ink3) 50%,var(--paper))}
.gb .budg.pre .cutk,.gb .budg.pv-out .cutk{display:inline}.gb .budg.snap .cutk{display:inline;stroke:var(--ink);animation:gbtick .5s ease-out both}.gb .budg.pv-add{opacity:.45}.gb path.tipbud{fill:var(--moss-bg);stroke:var(--moss);stroke-width:.8}.gb .tw.old{fill:var(--wood-old)}
.gb .tipbud path{fill:var(--moss-bg);stroke:var(--moss);stroke-width:1}.gb .shn{font:500 9.5px var(--mono);fill:var(--ink3)}.gb .shtag rect{fill:color-mix(in srgb,var(--moss) 8%,var(--paper));stroke:var(--shoot);stroke-width:1}.gb .shtag .shtie{fill:none;stroke:var(--shoot);stroke-width:1}.gb .shtag .shn{fill:var(--moss)}
/* an existing flow Max re-checks: a graft bud ringed into the bark at its knot, in the state its run is in */
.gb .gb-gr{cursor:pointer;transition:opacity .3s}.gb .gb-gr.gone{display:none}.gb .gb-gr:focus{outline:none}
.gb .gb-gr .gring{fill:color-mix(in srgb,var(--moss) 26%,var(--wood-lit));stroke:var(--graft);stroke-width:1.1}.gb .gb-gr .ghalo{fill:none;stroke:var(--wood-shade);stroke-width:2.2;opacity:.35}.gb .gb-gr.none .gring{stroke-dasharray:2 1.3}.gb .gb-gr.pass .gring{fill:color-mix(in srgb,var(--moss) 30%,var(--paper));stroke:var(--moss)}.gb .gb-gr.pass.warn .gring{stroke:var(--gold)}
.gb .gb-gr.fail .gring{fill:color-mix(in srgb,var(--verm) 24%,var(--paper));stroke:var(--verm)}.gb .gb-gr.run .gring{fill:color-mix(in srgb,var(--gold) 30%,var(--paper));stroke:var(--gold)}
.gb .gb-gr.pre .gring,.gb .gb-gr.pv-out .gring{stroke:color-mix(in srgb,var(--ink3) 50%,var(--paper));stroke-dasharray:none}.gb .gb-gr.pv-add .gring{fill:var(--moss);fill-opacity:.28;stroke:var(--moss);stroke-opacity:.6;stroke-dasharray:none}.gb .gb-gr.pv-add .ghalo{opacity:.12}.gb.dim .gb-gr.pv-add{opacity:1}
.gb .gb-gr.hl .gring{stroke-width:1.7;filter:drop-shadow(0 0 1.5px var(--gold))}.gb .gb-gr:focus-visible .gring{stroke:var(--ink);stroke-width:1.8}.gb.dim .gb-gr:not(.hl):not(.pv-add){opacity:.35}
.gb .budg.pre .shn,.gb .budg.pv-out .shn{opacity:.5}
/* its legend swatch (gbGraftSw) */
.gw-sw .gr{fill:var(--paper);stroke:var(--moss);stroke-width:1.2}
.gb-lf{transition:transform .45s cubic-bezier(.2,.7,.2,1),opacity .3s}
.gb-lf .blade{stroke-width:.9;stroke-linejoin:round;transition:fill .35s,stroke .35s}
.gb-lf .rib{fill:none;stroke:var(--paper);stroke-width:.8;opacity:.7}.gb .gb-lf .halo{fill:var(--paper);opacity:.9}.gb-lf.pv-add .halo{opacity:0}.gb-lf.pre .halo,.gb-lf.pv-out .halo{opacity:.55}.gb-lf.fail .halo{fill:color-mix(in srgb,var(--verm) 24%,var(--paper));opacity:1}
.gb-lf .bb,.gb-lf .nec{display:none}.gb-lf.fail .bb,.gb-lf.fail .nec{display:inline}.gb-lf.fail .bn{display:none}.gb-lf .nec{fill:none;stroke:#6B3A1E;stroke-width:1.3;stroke-linecap:round}
.gb-lf .pet{fill:none;stroke:color-mix(in srgb,var(--wood) 70%,var(--moss));stroke-width:1.1;stroke-linecap:round}.gb-lf.hang .pet{stroke:var(--wood);stroke-width:1.3}
.gb .scar{display:none;cursor:pointer}.gb .scar.on{display:inline}.gb .scar .sw{fill:var(--wood);stroke:var(--wood-shade);stroke-width:.5}.gb .scar .cutf{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.5}.gb.dim .jg:not(.hl) .scar,.gb.lfdim .jg.hl .scar{opacity:.4}.gb-lf .nick{display:none;fill:none;stroke:var(--cutc);stroke-width:1.3;stroke-linecap:round}
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
.gb .bud .blade{stroke-width:1.25}.gb .bud.none .blade{stroke-dasharray:2 1.4}
.gb .bmore{font:600 9.5px var(--mono);fill:var(--muted)}
@keyframes gbfall{0%{opacity:1;transform:none}24%{opacity:1;transform:rotate(calc(var(--fr,24deg)*1.3))}70%{opacity:.9}to{transform:translate(var(--fx,6px),var(--fy,110px)) rotate(calc(var(--fr,24deg)*2));opacity:0}}
@keyframes gbtick{0%{opacity:0}20%{opacity:1}75%{opacity:1}to{opacity:0}}
/* the snip: two blades closing at the cut, gone in a moment */
.gb .snip{fill:none;stroke:var(--ink);stroke-width:1.2;stroke-linecap:round;pointer-events:none;animation:gbsnip .32s ease-out both}@keyframes gbsnip{0%{opacity:0;transform:scale(1.6)}25%{opacity:1;transform:scale(1)}to{opacity:0}}
@keyframes gbpulse{50%{transform:scale(1.2)}}
.gb.dim .bud:not(.hl),.gb.dim .lbl:not(.hl),.gb.dim .bmore{opacity:.3}
/* a previewed mode's ghosts are not part of what is pinned: they stay readable over the dimming */
.gb.dim .gb-lf.bud.pv-add,.gb.dim .jg:not(.hl) .gb-lf.pv-add{opacity:1}.gb .shscar{fill:color-mix(in srgb,var(--wood-lit) 70%,var(--cut));stroke:var(--wood-shade);stroke-width:.6;pointer-events:none}
/* one cut mark everywhere, asked, previewed or being pruned: the red-brown tick */
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
@media (prefers-color-scheme:dark){.gb .seal .sm{fill:color-mix(in srgb,var(--pot) 88%,#fff)}.gb .seal .sd{fill:color-mix(in srgb,var(--pot-dk) 55%,#000)}.gb .seal .sl{fill:color-mix(in srgb,var(--pot) 70%,#fff);opacity:.6}}
.gb .stake{fill:none;stroke:var(--stake);stroke-linecap:round}.gb .tag{fill:var(--paper);stroke:color-mix(in srgb,var(--line2) 70%,var(--ink3));stroke-width:.9}.gb .rt.hl .stake,.gb .rt.sel .stake{stroke:color-mix(in srgb,var(--stake) 60%,var(--ink))}.gb .rt.hl .tag,.gb .rt.sel .tag{stroke:var(--ink3)}.gb .pot{fill:var(--pot)}.gb .pot-inc{fill:none;stroke:var(--pot-dk);stroke-width:.9;opacity:.75}.gb .pot-inc.lit{stroke:#fff;stroke-width:.7;opacity:.28}.gb .lip-hi{fill:none;stroke:#fff;stroke-width:.8;opacity:.4;stroke-linecap:round}.gb .lip-lo{fill:none;stroke:var(--pot-dk);stroke-width:.9;opacity:.9;stroke-linecap:round}.gb .gl{fill:var(--soil-lit);opacity:.9}.gb .gd{fill:#000;opacity:.18}.gb .pot-ft{fill:var(--pot-ft)}.gb .soil{fill:var(--soil-c)}.gb .mc0{fill:color-mix(in srgb,var(--pad-shade) 70%,#000);opacity:.6}.gb .mc1{fill:color-mix(in srgb,var(--pad-shade) 72%,var(--pad))}.gb .mc2{fill:color-mix(in srgb,var(--pad) 70%,var(--pad-shade))}.gb .mc3{fill:var(--moss-rim)}.gb .soilx,.gb .mc,.gb .seal,.gb .rhi,.gb .rcutg,.gb .ptag{pointer-events:none}
@media (prefers-color-scheme:dark){.gb .gl{fill:#5A4A3E;opacity:1}.gb .gd{opacity:.3}}
.gb .rring{fill:none;stroke:var(--paper);stroke-width:3;opacity:0;transition:opacity .2s}.gb .rt.hl .rring{opacity:1}.gb .rt.sel .rring{opacity:1;stroke:var(--ink);stroke-width:1.6}
.gb .rt.hl .w,.gb .rt.sel .w{fill:var(--wood-lit)}.gb .rt.hl .rlbl,.gb .rt.sel .rlbl{fill:var(--ink);font-weight:600}.gb.dim .rt:not(.hl):not(.sel){opacity:.32}
.gb .rt.loose .w{fill:var(--wood-old);opacity:.7}.gb .rcut{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.6;opacity:.85}.gb .rt.loose .rlbl{fill:var(--muted)}.gb .rt.loose .tag{stroke-dasharray:2.5 2}.gb .rt.wound:not(.wmute) .w{stroke:var(--verm);stroke-width:1.2}.gb .rt.wound:not(.wmute) .rlbl{fill:var(--verm-ink)}
.gb .rlbl{font:10.5px var(--mono);fill:var(--ink2);paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round}.gb .rlbl.tg{stroke:none;font-weight:500}.gb .rlbl.nt{fill:var(--muted)}.gb .rlbl .nt{fill:var(--muted);font-weight:400}
.gb .tail{fill:none;stroke-width:1.4;stroke-dasharray:3 4;stroke-linecap:round}.gb .tailend{fill:var(--paper);stroke:var(--muted);stroke-width:1.1;opacity:.6}
/* every root is wood: a fine darker edge parts a finger from the one behind it, and its upper side catches the light. A service's root is
   lifted in the dark so it never fades into the night; a severed root is half-faded bark with a pale cut face and two rings */
.gb .nbf .w,.gb .rt .w{stroke:color-mix(in srgb,var(--wood-shade) 70%,#000);stroke-width:.6;stroke-opacity:.7;stroke-linejoin:round}.gb .rbed{fill:var(--soil-c)}.gb .rhi{fill:var(--wood-lit);opacity:.42}.gb .rt.ext:not(.hl):not(.sel) .w{fill:var(--rt-ext)}
.gb .rt.loose .w{fill:var(--rt-cut);opacity:.5;stroke:none}.gb .rcut{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.55;opacity:.95}.gb .rring2{fill:none;stroke:var(--wood-shade);stroke-width:.4;opacity:.7}.gb .rt.loose .tag{stroke-dasharray:none}.gb .rlbl.tg .nt{fill:var(--muted)}
@media (prefers-color-scheme:dark){.gb .rt.loose .w{opacity:.75}.gb .rt.ext .w{stroke:#4A3F35;stroke-opacity:.9;stroke-width:.5}}
.gb .sapu{fill:none;stroke:var(--gold);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;opacity:.38;filter:blur(1.6px);pointer-events:none}
.gb .sap{fill:none;stroke:color-mix(in srgb,var(--gold) 70%,var(--ink));stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:3 4;animation:gbflow .7s linear infinite;pointer-events:none}
.gb .sap.bad{stroke:var(--verm);stroke-width:2.8;stroke-dasharray:none;animation:none}.gb .sap.rest{stroke:var(--muted);opacity:.75;animation:none;stroke-dasharray:1.5 4}
/* past a break: round grey dots (r 1.6, every 5), each ringed dark so they read on bark; the part of a journey a leaf's own
   scenario does not run is a faint trace; a file the run never reached is a plain grey knot with a muted name */
.gb .sap.faint{opacity:.25;animation:none}
.gb .sap.rest{stroke:#d4d4d4;stroke-width:3.2;stroke-dasharray:0 5;stroke-linecap:round;opacity:1;animation:none}.gb .sap.resto{stroke:#2e2620;stroke-width:4.8;stroke-dasharray:0 5;stroke-linecap:round;opacity:.85;animation:none}
@media (prefers-color-scheme:dark){.gb .sap.rest{stroke:#7b8086}.gb .sap.resto{stroke:#101214;opacity:.95}}
.gb .kn.unreached .halo,.gb .kn.unreached:hover .halo{opacity:0}.gb .kn.unreached .k1{fill:color-mix(in srgb,var(--muted) 60%,var(--wood));opacity:.8}.gb .kn.unreached .k2{fill:var(--muted);opacity:.5}.gb.dim .kn.unreached{opacity:1}
.gb .klbl.unreached{fill:var(--muted)}
.gb .klbl.nofit,.gb .klbl.nofit+.kld{display:none}
.gb .tiplead{fill:none;stroke:var(--ink3);stroke-width:.9;pointer-events:none;paint-order:stroke}
.gb .bead{fill:var(--gold);stroke:var(--paper);stroke-width:1.5}.gb .halo{fill:var(--gold);opacity:.22}
.gb .note{font:11.5px var(--mono);fill:var(--muted)}
.gb-tip{position:absolute;z-index:3;width:max-content;max-width:300px;pointer-events:none;background:var(--paper);border:1px solid var(--line2);border-radius:10px;padding:9px 11px;box-shadow:0 8px 28px rgb(0 0 0 / .14);font-size:13px;line-height:18px;color:var(--ink)}
.gb-tip.below{max-width:none;width:auto;right:0;box-shadow:none}.gb-tip[hidden]{display:none}.gb-tip b{display:block;font-weight:500}.gb-tip .k{font:11px/16px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.gb-tip .st{font:12px/17px var(--mono);margin-top:3px}.gb-tip .st.pass{color:var(--moss)}.gb-tip .st.fail{color:var(--verm-ink)}.gb-tip .st.run{color:var(--gold)}
.gb-tip .path{font:11.5px/16px var(--mono);color:var(--ink3);margin-top:4px}.gb-tip .hop{white-space:nowrap}
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
.gb-olr .fd{font:11.5px/16px var(--mono);color:var(--muted);white-space:nowrap}.gb-olr .gw-chip{grid-column:2/-1;justify-self:start}
.gb-ol>.gb-sub{margin:12px 6px 2px}
.gb-pk{display:flex;flex-wrap:wrap;gap:4px 14px;margin:8px 6px;font:12px/18px var(--sans);color:var(--ink3)}
.gb-sub{font:500 11px/16px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:14px 4px 4px}.gb-sub.code{text-transform:none;letter-spacing:0;color:var(--ink3)}
.gb-loose{font-size:13px;line-height:19px;color:var(--ink3);padding:10px 4px 2px}
.gb-path{display:flex;flex-wrap:wrap;gap:4px 2px;align-items:center;font:12px/18px var(--mono);color:var(--ink3)}
.gb-path button{border:0;background:none;padding:0 2px;font:inherit;color:var(--ink2);text-decoration:underline dotted;text-underline-offset:3px;cursor:pointer;min-height:24px}
.gb-path .sep{color:var(--muted)}.gb-path .rootp{color:var(--ink3);text-decoration-style:dashed}.gb-path .bad{color:var(--verm-ink);font-weight:600}
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
   inside of a bend the edge never reaches past the bend's centre, so a tight curve pinches instead of folding into a spike.
   bx swells one edge where a knot's boss grows out of it: positive on the side the normal points to, negative on the other. */
function gbRib(pts,w,from,to,floor,bx){from=from||0;to=to===undefined?pts.length-1:to;const N=pts.length-1,L=[],R=[];
 for(let i=from;i<=to;i++){const n=gbNorm(pts,i),h=w[i]/2;let hl=h,hr=h;const a=pts[Math.max(0,i-3)],b=pts[i],c=pts[Math.min(N,i+3)];
  const t1=[b[0]-a[0],b[1]-a[1]],t2=[c[0]-b[0],c[1]-b[1]],m1=Math.hypot(t1[0],t1[1]),m2=Math.hypot(t2[0],t2[1]);
  if(m1&&m2){const th=Math.asin(Math.max(-1,Math.min(1,(t1[0]*t2[1]-t1[1]*t2[0])/(m1*m2))));if(Math.abs(th)>1e-3){const rad=(m1+m2)/2/Math.abs(th);if(th>0)hl=Math.min(hl,.85*rad);else hr=Math.min(hr,.85*rad)}}
  if(bx&&bx[i]){if(bx[i]>0)hl+=bx[i];else hr-=bx[i]}
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

/* A pad is grown, not stamped: dense cushions of foliage on the wood that carries them. The happy path sits on the crest,
   the highest cushion; guards on a shoulder cushion to either side, the first on the outer one, and a shoulder grows only
   for a guard, so no cushion is ever empty; the ways it fails hang on short stems from the wood under the pad. A crest with
   shoulders stands clear above them on its leaves' own twigs, so which tier a leaf is on reads at a glance. A crown is the
   same cushions round the leader's top. One rule sizes every cushion on a tree: its area grows with the leaves it holds
   (its width with their square root), the crown's crest let grow a seventh more and never more. A single journey's own guard
   or failure pad holds all its leaves in one cushion. Leaves lie inside their cushion, apart, each turned along the twig it
   grows on; in each group the minimum's leaves come first. Coordinates are the pad's own: x from its middle, y up from the
   lowest underside. */
const GB_PET=3.5;
/* the shortest distance between two segments: two leaves' midribs, so leaves are kept apart blade from blade */
function gbSegD(a,b,c,d){const P=(p,q,r)=>{const dx=r[0]-q[0],dy=r[1]-q[1],l=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p[0]-q[0])*dx+(p[1]-q[1])*dy)/l));return Math.hypot(p[0]-q[0]-t*dx,p[1]-q[1]-t*dy)};
 const s=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);if(s(a,b,c)*s(a,b,d)<0&&s(c,d,a)*s(c,d,b)<0)return 0;return Math.min(P(a,c,d),P(b,c,d),P(c,a,b),P(d,a,b))}
function gbPadGeo(list,H,dir,seed,crown,K,pol){const z=Math.max(.6,Math.pow(H/560,.75));
 /* every leaf on a tree is the same size, so no leaf reads as bigger news than another */
 const L=Math.max(12,Math.min(16.5,15.5*z,H*.03)),W=L*.52,gap=16,d=dir||1;
 const g={happy:[],guard:[],failure:[]};for(const x of gbOrd(list))g[gbPol(x)].push(x);
 const one=!!pol||(!g.happy.length&&(crown||!g.guard.length));
 const mk=(role,sd,lv)=>({role,sd,lv,ids:lv.map(x=>x.id),hang:[],a:0,h:0,b:0,x:0,seat:0,limf:null,pos:[],body:[]});
 const crest=one||g.happy.length||crown?mk('crest',0,one?gbOrd(list):g.happy):null;
 const sides={};sides[d]=[];sides[-d]=[];if(!one)g.guard.forEach((x,i)=>sides[i%2?-d:d].push(x));
 const sIn=sides[-d].length?mk('shoulder',-d,sides[-d]):null,sOut=sides[d].length?mk('shoulder',d,sides[d]):null;
 const cs=[sIn,crest,sOut].filter(Boolean),shs=[sIn,sOut].filter(Boolean);
 /* a journey's failures hang under its outer shoulder, or under its crest when it has none; a crown's under its shoulders, or
    from a branchlet just under its crest */
 if(!one){const hc=crown&&shs.length?[sOut,sIn].filter(Boolean):[sOut||crest];g.failure.forEach((x,i)=>hc[i%hc.length].hang.push(x))}
 for(const c of cs){c.hs=c.role==='shoulder'?c.sd:d;c.limf=c.role==='shoulder'?(crown?.14:.1):shs.length||crown?null:.1}
 /* a cushion's shape, from its middle (v=0) to its ends (v=±1): a dome over a shallow underside, a shoulder flatter than a crest */
 const ar=c=>c.role==='shoulder'?.62:one&&!crown?.72:.8,tY=(c,v)=>-c.h*(.13+.87*Math.pow(Math.max(0,1-v*v),c.role==='shoulder'?.5:.62)),bY=(c,v)=>-c.h*.13*v*v;
 const size=(c,k)=>{c.a=k*(crown&&c.role==='crest'?1.15:1)*Math.sqrt((c.lv.length+.5)/ar(c));c.h=c.a*ar(c)};
 /* a leaf leans out along its twig: on a crest they fan from the wood under it, a little out from the trunk; on a shoulder
    lower, out over its own side; on a crown they fan from the leader */
 const ang=(c,px,id)=>{const v=Math.max(-1,Math.min(1,px/c.a)),j=(gbHash('lf:'+id)-.5)*12;let t;
  if(c.role==='shoulder'){const w=(v*c.sd+1)/2;t=-90+c.sd*(c.sd===d||crown?56+12*w:50+12*w)}else if(crown)t=-90+50*v;else t=-90+46*v+12*d;return (t+j)*Math.PI/180};
 /* inside: the whole blade within the cushion, and its foot above the wood the cushion lies on, so its twig can rise to it */
 const SP=[[.5,0],[-.5,0],[0,.5],[0,-.5],[.25,.45],[.25,-.45],[-.25,.45],[-.25,-.45]];
 const inside=(c,p,th,m)=>{const u=[Math.cos(th),Math.sin(th)];if(c.limf!==null&&p[1]-u[1]*(L/2+GB_PET)>-(c.limf*c.h+1))return false;
  for(const [s,t] of SP){const x=p[0]+u[0]*s*L-u[1]*t*W,y=p[1]+u[1]*s*L+u[0]*t*W,v=x/c.a;if(Math.abs(v)>=.97||y<tY(c,v)+m||y>bY(c,v)-m)return false}return true};
 /* leaves are set out in rows (one row arched with its dome) and then relaxed: each pair pushed apart until they stand a leaf and a tenth apart, blade
    clear of blade, each drawn back inside its cushion */
 const place=c=>{const n=c.lv.length;c.pos=[];if(!n)return true;const r=gbRng(gbHash('lv:'+seed+':'+c.role+c.sd));
  const per=Math.max(1,Math.floor((1.7*c.a-L)/(1.15*L))+1),rows=Math.ceil(n/per),P=[];
  for(let i=0;i<n;i++){const row=Math.floor(i/per),k=i%per,m=Math.min(per,n-row*per),sp=Math.min(1.2*L,1.6*c.a/m);const q=m>1?(k-(m-1)/2)/((m-1)/2):0;P.push([(k-(m-1)/2)*sp+(row%2?sp*.3:0)+(r()-.5)*2,-c.h*(rows===1?(m>2?.48+.18*(1-q*q):.56):.7-.4*row/(rows-1))+(r()-.5)*2])}
  const D=1.1*L,core=[0,-c.h*(c.limf===null?.5:.58)],th=i=>ang(c,P[i][0],c.lv[i].id),seg=i=>{const t=th(i),u=[Math.cos(t)*L/2,Math.sin(t)*L/2];return [[P[i][0]-u[0],P[i][1]-u[1]],[P[i][0]+u[0],P[i][1]+u[1]]]};
  const ok=(i,j)=>{const a=seg(i),b=seg(j);return Math.hypot(P[j][0]-P[i][0],P[j][1]-P[i][1])>=D-.4&&gbSegD(a[0],a[1],b[0],b[1])>=W+1.6};
  for(let it=0;it<90;it++){let moved=false;
   for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){if(ok(i,j))continue;const dx=P[j][0]-P[i][0],dy=P[j][1]-P[i][1],m=Math.hypot(dx,dy)||.01,f=Math.max(.5,(D-m)/2+.3)/m;P[i][0]-=dx*f;P[i][1]-=dy*f;P[j][0]+=dx*f;P[j][1]+=dy*f;moved=true}
   for(let i=0;i<n;i++)for(let k=0;k<16&&!inside(c,P[i],th(i),2);k++){P[i][0]+=(core[0]-P[i][0])*.14;P[i][1]+=(core[1]-P[i][1])*.14;moved=true}
   if(!moved)break}
  c.pos=P.map((p,i)=>[p[0],p[1],th(i)]);for(let i=0;i<n;i++){if(!inside(c,P[i],th(i),1.5))return false;for(let j=i+1;j<n;j++)if(!ok(i,j))return false}return true};
 /* the smallest size, by the tree's one rule, at which every cushion holds its leaves (the caller passes the largest any pad
    on the tree needs, so they all share it); never so small that a leaf stands more than about a third of its crest's height */
 let k=Math.max(K||0,L*1.22);const fit=k=>{for(const c of cs)size(c,k);return cs.every(place)};for(let i=0;i<48&&!fit(k);i++)k*=1.05;
 /* the clumps a cushion is heaped from: a row along its crest whose tops scallop its edge, and a lower row in front */
 for(const c of cs){const r=gbRng(gbHash('cl:'+seed+':'+c.role+c.sd)),kt=Math.max(3,Math.min(6,Math.round(2*c.a/(.8*c.h)))),R=c.h*(c.role==='shoulder'?.5:.42);c.body=[];
  for(let i=0;i<kt;i++){const v=(i/(kt-1)*2-1)*.74+(r()-.5)*.1,rr=R*(.84+.3*r());c.body.push([v*c.a,tY(c,v)+rr-1.6-1.4*r(),rr,0])}
  const kf=Math.max(2,Math.min(4,kt-1));for(let i=0;i<kf;i++){const v=(i/(kf-1)*2-1)*.52+(r()-.5)*.12,rr=c.h*.44*(.86+.26*r());c.body.push([v*c.a,-c.h*.34+(r()-.5)*c.h*.08,rr,1])}}
 /* a journey's crest stands clear above its shoulders, which reach out from under its flanks; a crown's shoulders hang
    lower and further out to either side of its crest */
 const hs=Math.max(0,...shs.map(c=>c.h));if(crest&&shs.length){for(const c of shs){c.x=c.sd*(crown?crest.a*.5+c.a*.74:crest.a*.46+c.a*.62);c.seat=c.limf*c.h}crest.b=-(hs+gap);crest.seat=null}
 else{if(!crest&&shs.length===2)for(const c of shs)c.x=c.sd*c.a*1.02;for(const c of cs)c.seat=(c.limf||.2)*c.h}
 const lo=Math.min(...cs.map(c=>c.x-c.a)),hi=Math.max(...cs.map(c=>c.x+c.a)),PW=hi-lo;for(const c of cs){c.x-=(lo+hi)/2;c.u=PW/2+d*c.x}
 /* a failure's stem is short, never more than half as long as the crest is tall */
 const Hc=crest?crest.h:hs;
 const G={L,W,PW,PH:0,z,cs,crown:!!crown,one,gap,need:k,Hc,d,slot:new Map(),tuft:new Map(),cOf:new Map(),drop:4,tY,bY};cs.forEach((c,i)=>{for(const id of [...c.ids,...c.hang.map(x=>x.id)])G.cOf.set(id,i)});
 /* each leaf in place, and the tuft of foliage in front of its foot, which tucks its stalk in */
 G.lay=()=>{for(const c of cs){c.bot=c.b;c.pos.forEach((p,i)=>{const id=c.lv[i].id,u=[Math.cos(p[2]),Math.sin(p[2])];
   G.slot.set(id,[c.x+p[0],c.b+p[1],p[2]*180/Math.PI,1,0]);G.tuft.set(id,[c.x+p[0]-u[0]*(L/2-.5),c.b+p[1]-u[1]*(L/2-.5)+.5,.3*L+1.2,.17*L+1])})}
  /* how far below its lowest underside the pad reaches: its failures' stems and leaves (set exactly once they hang) */
  G.PH=Math.max(...cs.map(c=>c.h-c.b));G.drop=cs.some(c=>c.hang.length)?3+.5*Hc+GB_PET+L+2:4};
 /* A cushion's outline: the dome, with the tops of the clumps along its crest standing a little proud of it in round
    scallops; the underside a shallow curve that the front clumps hang just below in soft lobes. */
 const sil=(c,on)=>{const N=32,top=[],bot=[];if(!on){const p=[c.x,c.b-c.h*.3];for(let i=0;i<=N;i++){top.push(p.slice());bot.push(p.slice())}return {top,bot,on:false,x0:p[0],x1:p[0]}}
  const cl=c.body.filter(q=>!q[3]);for(let i=0;i<=N;i++){const v=-1+2*i/N,x=v*c.a,t0=tY(c,v),e=Math.abs(v)>.8?Math.pow((Math.abs(v)-.8)/.2,2):0;let t=t0;
   for(const q of cl){const dx=x-q[0];if(Math.abs(dx)<q[2]){const y=q[1]-Math.sqrt(q[2]*q[2]-dx*dx);t=Math.min(t,y+e*(t0-y))}}
   let b=bY(c,v);const b0=b;for(const q of c.body){const dx=x-q[0];if(q[3]&&Math.abs(dx)<q[2])b=Math.max(b,Math.min(q[1]+Math.sqrt(q[2]*q[2]-dx*dx),b0+2.2))}top.push([c.x+x,c.b+t]);bot.push([c.x+x,c.b+b])}
  return {top,bot,on:true,x0:c.x-c.a,x1:c.x+c.a}};
 G.shape=keep=>({cs:cs.map(c=>sil(c,!c.ids.length||c.ids.some(keep)))});
 /* seat the cushions on their wood: each moves by its own amount, then the lowest underside is y=0 again (returned, so the
    caller moves the pad's origin by it) */
 G.seat=dys=>{cs.forEach((c,k)=>{if(c.seat!==null)c.b+=dys[k]||0});if(crest&&crest.seat===null)crest.b=Math.min(...shs.map(c=>c.b-c.h))-gap;const m=Math.max(...cs.map(c=>c.b));for(const c of cs)c.b-=m;G.lay();return m};
 G.lay();return G}
/* a silhouette edge's height at x, between its samples */
function gbAtX(e,x){if(x<=e[0][0])return e[0][1];for(let i=1;i<e.length;i++)if(e[i][0]>=x){const a=e[i-1],b=e[i],f=(x-a[0])/((b[0]-a[0])||1);return a[1]+(b[1]-a[1])*f}return e[e.length-1][1]}
/* a cushion's outline as a path: its crest drawn through the midpoints of its samples, so the scallops are round */
const gbCushD=(o,q)=>{const t=q.top,P=p=>gbP([o[0]+p[0],o[1]+p[1]]);let d='M'+P(t[0]);for(let i=1;i<t.length-1;i++)d+=' Q'+P(t[i])+' '+P([(t[i][0]+t[i+1][0])/2,(t[i][1]+t[i+1][1])/2]);
 return d+' L'+P(t[t.length-1])+' L'+q.bot.slice().reverse().map(P).join(' L')+'Z'};
const gbPadD=(o,q)=>q.cs.map(c=>gbCushD(o,c)).join(' ');
/* A twig from point i of the wood C (widths cw) to a leaf's foot E, arriving along the leaf's direction u, so the leaf goes
   on where the twig ends. It leaves its wood growing the way the wood grows, or straight up off it when the leaf is behind. */
function gbTwigTo(C,cw,i,E,u){const n=C.length-1,S=C[i],a=C[Math.max(0,i-1)],b=C[Math.min(n,i+1)],tl=Math.hypot(b[0]-a[0],b[1]-a[1])||1;let t=[(b[0]-a[0])/tl,(b[1]-a[1])/tl];
 const v=[E[0]-S[0],E[1]-S[1]],m=Math.hypot(v[0],v[1])||1;if(t[0]*v[0]+t[1]*v[1]<0)t=[0,-1];const q=[.4*t[0]+.6*v[0]/m,.4*t[1]+.6*v[1]/m],ql=Math.hypot(q[0],q[1])||1;
 const pts=gbBez([S,[S[0]+q[0]/ql*.35*m,S[1]+q[1]/ql*.35*m],[E[0]-u[0]*.35*m,E[1]-u[1]*.35*m],E],12),w0=Math.min(3,Math.max(1.6,.45*(cw[i]||3)));
 return {pts,w:pts.map((_,j)=>w0+(1-w0)*j/12),bi:i}}
/* Every leaf grows on a twig of its own, off the wood that carries its cushion, from the point of that wood it can rise most
   nearly straight at. A failure hangs on a short stem straight down from the wood under its cushion, the first nearest the
   wood's end. car(k,hang) is the wood under cushion k ({pts,w,lo,dir}). Sets each hanging leaf's slot and the pad's drop;
   returns the twigs, each with its leaf and its cushion. */
function gbLeafTwigs(g,o,car){const out=[],r=g.L/2+GB_PET;
 g.cs.forEach((c,k)=>{const X=o[0]+c.x,Wd=c.ids.length?car(k,0):null;
  if(Wd){const C=Wd.pts;const fs=c.ids.map(id=>{const sl=g.slot.get(id),th=sl[2]*Math.PI/180,u=[Math.cos(th),Math.sin(th)];return {id,u,E:[o[0]+sl[0]-u[0]*r,o[1]+sl[1]-u[1]*r]}});
   for(const f of fs){if(f.i===undefined){let bs=1e9;for(let i=Wd.lo;i<C.length;i++){const S=C[i],v=[f.E[0]-S[0],f.E[1]-S[1]],m=Math.hypot(v[0],v[1]);if(Math.abs(S[0]-X)>c.a*.95||m<5||v[1]>-2)continue;
      const a=Math.acos(Math.max(-1,Math.min(1,(v[0]*f.u[0]+v[1]*f.u[1])/m)))*180/Math.PI,sc=a+.25*Math.max(0,m-28)+.6*Math.max(0,10-m);if(sc<bs){bs=sc;f.i=i}}
     if(f.i===undefined){let bd=1e9;for(let i=Wd.lo;i<C.length;i++){const dd=Math.hypot(C[i][0]-f.E[0],C[i][1]-f.E[1]);if(dd<bd){bd=dd;f.i=i}}}}
    out.push({id:f.id,k,...gbTwigTo(C,Wd.w,f.i,f.E,f.u)})}}
  const Wh=c.hang.length?car(k,1):null;if(!Wh)return;const C=Wh.pts,sp=Math.max(g.W+5,.8*g.L);
  c.hang.forEach((x,j)=>{const tx=C[C.length-1][0]-Wh.dir*(.12*g.L+j*sp);let i=C.length-1;while(i>Wh.lo&&(C[i][0]-tx)*Wh.dir>0)i--;const S=C[i],v=(S[0]-X)/c.a;
   const yU=Math.abs(v)<1?o[1]+c.b+g.bY(c,v):S[1],st=Math.min(.5*g.Hc,Math.max(.3*g.Hc,yU+2-S[1])),th=(90+(gbHash('hg:'+x.id)-.5)*10)*Math.PI/180,u=[Math.cos(th),Math.sin(th)],E=[S[0]+u[0]*st,S[1]+u[1]*st];
   g.slot.set(x.id,[E[0]+u[0]*r-o[0],E[1]+u[1]*r-o[1],th*180/Math.PI,1,1]);const pts=gbBez([S,[S[0]+u[0]*st*.33,S[1]+u[1]*st*.33],[S[0]+u[0]*st*.66,S[1]+u[1]*st*.66],E],6);
   out.push({id:x.id,k,pts,w:pts.map((_,jj)=>1.9-.8*jj/6),bi:i,hang:1})})});
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
 /* one rule sizes every cushion on the tree: the size the most crowded of them needs to hold its leaves apart, so a bigger
    cushion always means more scenarios; the crown's shoulders reach out on the side away from the first branch, so the
    canopy balances over the roots */
 const pgeo=(pd,K)=>gbPadGeo(pd.leaves,H,pd.crown?(m?-S:0):side[pd.i],gbHash('pad:'+key+':'+pd.id),pd.crown,K,pd.pol);
 for(const pd of padList){pd.leaves=leavesOf(pd);pd.geo=pgeo(pd,0)}const K=Math.max(...padList.map(pd=>pd.geo.need));for(const pd of padList)if(pd.geo.need<K)pd.geo=pgeo(pd,K);
 const cpd=padList[0];
 const crc=cpd.geo.cs.find(c=>c.role==='crest'),gap=.022*H,inC=.32*crc.h-crc.bot-.035*H,lift=.02*H+6;let need=lit?.84*H:m<=1?.22*H:m<=2?.27*H:.38*H;
 /* the crown clears the pads below it; when it stands clear of them to the side it need only rise above their middle, so the
    upper trunk is not a bare pole (tried first, and kept only if nothing then overlaps) */
 if(!lit){for(const pd of padList.slice(1))if(!back[pd.i])need=Math.max(need,(pd.geo.PH*(strict?1:.5)+pd.geo.L*(strict?.75:0)+gap+inC+lift)/(1-hs[pd.i]));
  for(let i=0;i<m;i++)for(let j=i+1;j<m;j++)if(side[i]===side[j]&&!back[i]&&!back[j])need=Math.max(need,(padList[i+1].geo.PH+padList[j+1].geo.drop+gap)/(hs[j]-hs[i]));
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
 const Tw=t=>{const tc=Math.min(1,Math.max(0,t));let w=lit?D*(.3+.7*Math.pow(Math.max(0,1-t),1.05)):D*Math.pow(1-.68*tc,.85);
  if(!lit)for(const h of hs){const u=Math.max(0,Math.min(1,(t-h)/.05));w*=1-.06*u*u*(3-2*u)}
  for(const h of hs)w*=1+.05*Math.exp(-Math.pow((t-h-.006)/.025,2));if(t<.075)w*=1+.85*Math.pow(1-t/.075,2.2);if(t>1)w*=Math.max(.5,1-(t-1)*5);return Math.max(1.6,w)};
 const tw=ty.map(Tw);
 /* A branch leaves the trunk at a third of its width or less, carries its own parts as knots on the bare wood before its
    pad, and runs on under the pad, where three to five branchlets fork up into the foliage they carry. */
 const br=items.map((it,i)=>{const h=hs[i],dir=side[i];const k=gbNear(ty,h);const P0=tp[k],Tk=tw[k];const pd=padList[i+1],g=pd.geo;
  /* a branch leaves at up to nearly half the trunk's girth there and tapers along its whole run, never to a thread */
  const b=Tk*Math.max(.3,Math.min(.45,.45*Math.sqrt(it.w/Wat(h-.04))));
  const inner=Tk/2+(back[i]?.03*H:bare(it));
  /* the branch runs out under its pad and ends inside its outer cushion, so the foliage is held by wood all the way out and
     no wood pokes out past it */
  const cl=g.cs[g.cs.length-1],R=inner+cl.u+(cl.seat===null&&cl.hang.length?.6*cl.a:0),rise=back[i]?.34:.08+.05*h,dr=back[i]?-.06:.07*(1-h);
  const rb=gbRng(gbHash(key+':bend:'+it.id));const b1=back[i]?0:.04+.04*rb(),b2=back[i]?0:.05*rb();
  const cpb=back[i]?[P0,[P0[0]+dir*.3*R,P0[1]+dr*R],[P0[0]+dir*.66*R,P0[1]+dr*.3*R],[P0[0]+dir*R,P0[1]-rise*R]]
   :[P0,[P0[0]+dir*.22*R,P0[1]+(dr+b1)*R*.9],[P0[0]+dir*.5*R,P0[1]+(dr*.4-b2)*R],[P0[0]+dir*.76*R,P0[1]-rise*R*.45+b1*R*.3],[P0[0]+dir*R,P0[1]-rise*R]];
  const ph=gbRng(gbHash(key+':'+it.id))()*6.28;const raw=back[i]?gbBez(cpb,44):gbResample(gbSmooth(cpb,3),44);
  const pts=raw.map((q,ii)=>{const t=ii/44,n=gbNorm(raw,ii),d=.012*R*Math.sin(t*7+ph)*Math.sin(t*Math.PI);return[q[0]+n[0]*d,q[1]+n[1]*d]});
  const acc=gbLen(pts),len=acc[acc.length-1];
  const w=acc.map(d=>{const u=d/len,out=Math.max(0,d-Tk/2);return Math.max(2.5,b*(1-.62*u)*(1+.2*Math.exp(-out/6)))});
  /* Each cushion is seated on the wood: the branch runs through the foot of every cushion it carries and ends inside the
     outer one, so the foliage lies on its wood all the way out, never on posts above it. A crest with shoulders stands clear
     above them, held up on its leaves' own twigs, which rise from the open wood between the shoulders. */
  const cx=P0[0]+dir*(inner+g.PW/2),tip=pts[pts.length-1];const near=X=>{let ii=1,bd=1e9;for(let jj=1;jj<pts.length;jj++){const dd=Math.abs(pts[jj][0]-X);if(dd<bd){bd=dd;ii=jj}}return ii};
  let oy=tip[1];const dys=g.cs.map(c=>c.seat===null?0:pts[near(cx+c.x)][1]+c.seat-(oy+c.b));oy+=g.seat(dys);const o=[cx,oy];
  /* A crest raised over shoulders stands on a riser: a secondary branch leaving the wood further in and rising out at about
     sixty degrees into the crest's foot, from which its leaves' twigs fork. */
  const cr=g.cs.find(c=>c.role==='crest'&&c.seat===null);let rz=null;
  if(cr){
   const yb=o[1]+cr.b,E0=[o[0]+cr.x+dir*.06*cr.a,yb-.36*cr.h],ri=near(E0[0]-dir*Math.min(.62*(pts[near(E0[0])][1]-E0[1]),.6*cr.a)),S0=pts[ri],dx=E0[0]-S0[0],dy=S0[1]-E0[1];
   const rp=gbBez([S0,[S0[0]+dx*.5,S0[1]-dy*.3],[E0[0]-dx*.12,E0[1]+dy*.45],E0],14),w0=Math.max(3,w[ri]*.68);
   rz={pts:rp,w:rp.map((_,j)=>Math.max(1.8,w0*(1-.45*j/14))),bi:ri,lo:rp.findIndex(q=>q[1]<yb+2)}}
  const twigs=gbLeafTwigs(g,o,(k,hang)=>!hang&&g.cs[k]===cr&&rz?{pts:rz.pts,w:rz.w,lo:Math.max(1,rz.lo),dir}:{pts,w,lo:b0(),dir});
  for(const t of twigs){if(rz&&!t.hang&&g.cs[t.k]===cr)t.c=rz;t.at=(t.c?t.c.bi:t.bi)/(pts.length-1)}if(rz)twigs.unshift({pts:rz.pts,w:rz.w,bi:rz.bi,k:g.cs.indexOf(cr),at:rz.bi/(pts.length-1),lb:1});
  function b0(){return Math.max(1,acc.findIndex(d=>d>=Tk*.5))+2}
  return {it,j:it.j,id:it.id,pol:it.pol,i,h,dir,k,back:back[i],pts,w,len,acc,R,inner,exit:Math.max(1,acc.findIndex(d=>d>=Tk*.5)),tip:pts[pts.length-1],b,Tk,o,twigs}});
 const pads={},origin={};for(const pd of padList){pads[pd.id]=pd;if(!pd.crown){pd.b=br[pd.i];origin[pd.id]=pd.b.o}}
 /* The leader runs on into the crown and ends a third of the way up inside its crest, and the crest's leaves take their
    twigs from it. The crown's shoulders sit lower to either side, each on a branchlet the leader puts out just under it,
    rising at about forty degrees and levelling out through the cushion's foot; with no shoulders, its failures hang from a
    short branchlet through the foot of its crest. */
 const cg=cpd.geo,te=tp[tp.length-1],co=[te[0]-crc.x,te[1]+crc.h*.32-crc.b];origin[apex.id]=co;
 const ctw=[],cc=[];const leaderAt=y=>{let ki=tp.length-1;for(let ii=tp.length-1;ii>0;ii--)if(tp[ii][1]>=y){ki=ii;break}return ki};
 /* The leader never ends in a blunt cap: it tapers on into its crest and, just inside the cushion's foot, forks into fine twigs
    that fan up into the foliage, the leader itself the middle one, each from about a third of its girth there down to a hair. */
 if(!sap){const n1=tp.length-1,yc=co[1]+crc.b,kB=Math.max(2,Math.min(n1-2,leaderAt(yc+.3*crc.h))),kF=Math.max(kB+1,Math.min(n1-1,leaderAt(yc-.04*crc.h))),wF=tw[kB],acL=gbLen(tp),aB=acL[kB],aF=acL[kF],aE=(acL[n1]-aF)||1;
  for(let i=kB+1;i<=kF;i++)tw[i]=Math.min(tw[i],wF*(1-.38*(acL[i]-aB)/((aF-aB)||1)));
  for(let i=kF+1;i<=n1;i++){const u=(acL[i]-aF)/aE;tw[i]=Math.max(1.1,wF*.38*(1-u)+1.1*u)}
  const d0=[tp[kF+1][0]-tp[kF-1][0],tp[kF+1][1]-tp[kF-1][1]],dm=Math.hypot(d0[0],d0[1])||1,rf=gbRng(gbHash(key+':fork'));
  for(const sd of [-1,1]){const th=sd*(30+10*rf())*Math.PI/180,u=[(d0[0]*Math.cos(th)-d0[1]*Math.sin(th))/dm,(d0[0]*Math.sin(th)+d0[1]*Math.cos(th))/dm],len=crc.h*(.5+.16*rf()),S0=tp[kF];
   const E=[S0[0]+u[0]*len*.8,S0[1]+u[1]*len*.8-len*.25],fp=gbBez([S0,[S0[0]+u[0]*len*.4,S0[1]+u[1]*len*.4],[E[0]-u[0]*len*.1,E[1]+len*.15],E],10);
   ctw.push({pts:fp,w:fp.map((_,j)=>Math.max(1,wF*.3*(1-j/10)+j/10)),k:cg.cs.indexOf(crc),bi:kF,fork:1})}}
 cg.cs.forEach((c,k)=>{const cr=c===crc;if(cr&&!c.hang.length)return;const sd=cr?cg.d:c.sd,yb=co[1]+c.b,X=co[0]+c.x;
  const ki=leaderAt(cr?yb-2:yb+11*Math.max(.7,cg.z)),e=cr?[X+sd*c.a*.66,yb-3.5]:[X+sd*c.a*.35,yb-c.limf*c.h],a0=tp[ki],dx=e[0]-a0[0],dy=a0[1]-e[1];
  const t2=gbBez([a0,[a0[0]+dx*.3,a0[1]-dy*.6],[e[0]-dx*.4,e[1]+dy*.05],e],12),w2=t2.map((_,jj)=>Math.max(1.2,tw[ki]*.55*Math.pow(1-jj/12,.9)+jj/12*1.2));
  ctw.push({pts:t2,w:w2,k,bi:ki,lb:1});cc[k]={pts:t2,w:w2,bi:ki,dir:sd}});
 for(const t of gbLeafTwigs(cg,co,(k,hang)=>{const c=cg.cs[k];if(c===crc&&!hang)return {pts:tp,w:tw,lo:leaderAt(co[1]+c.b+.5*c.h),dir:1,gap:null};const q=cc[k];return q?{pts:q.pts,w:q.w,lo:0,dir:q.dir,gap:null}:null})){if(t.hang||cg.cs[t.k]!==crc)t.c=cc[t.k];ctw.push(t)}
 const cdrop=cg.drop;
 /* Knots: parts the journeys share sit low on the trunk (most shared lowest, callee below caller); a journey's own parts sit
    on the bare wood of its branch, deepest nearest the trunk; the headline journey's own parts on the upper trunk. */
 const depth=id=>{let s=0,n=0;for(const j of js){const i=j.units.indexOf(id);if(i>=0){s+=i/Math.max(1,j.units.length-1);n++}}return n?s/n:0};
 /* knots keep their distance along the wood, about two of their own lengths; where more files share a stretch than fit, the
    last knot there swells into a burl that holds the rest, and its card names every one */
 /* (on the trunk a knot keeps about a girth and a quarter from the next, so two bosses never touch) */
 const knots=[],more={};const KG=21;const tacc=gbLen(tp);const KT=k=>Math.max(KG,1.25*tw[k]);
 const onTrunk=(ids,t)=>{const k=gbNear(ty,t);knots.push({id:ids[0],ids,on:'t',k,p:tp[k],n:gbNorm(tp,k),w:tw[k],t})};
 const fitN=(t0,t1)=>{const k0=gbNear(ty,t0),k1=gbNear(ty,t1);return Math.max(1,Math.floor((tacc[k1]-tacc[k0])/KT(Math.round((k0+k1)/2)))+1)};
 const group=(list,n)=>list.length<=n?list.map(id=>[id]):[...list.slice(0,n-1).map(id=>[id]),list.slice(n-1)];
 const core=lit?[]:Object.keys(carry).filter(id=>carry[id]>1).sort((a,b)=>carry[b]-carry[a]||depth(b)-depth(a));
 const c0=.09,c1=Math.max(.16,h1-.05);group(core,fitN(c0,c1)).forEach((ids,i,a)=>onTrunk(ids,a.length===1?.16:c0+(c1-c0)*i/(a.length-1)));
 const ownA=apex.units.filter(id=>!U[id].root&&carry[id]===1).sort((a,b)=>depth(b)-depth(a));
 const fr=hs.filter((h,i)=>!back[i]);const hi=Math.min(lit?.74:.95,1-(inC+8+cdrop)/Ht),lo=Math.min(hi-.12,lit?.1:(fr.length?Math.max(...fr)+.06:.35));
 group(ownA,Math.min(5,fitN(lo,hi))).forEach((ids,i,a)=>onTrunk(ids,a.length===1?(lo+hi)/2:lo+(hi-lo)*i/(a.length-1)));
 /* never closer than that along the trunk, and none pushed into the crown: one that would be joins the burl below it */
 const kTop=gbNear(ty,hi);const tk=knots.filter(q=>q.on==='t').sort((a,b)=>a.k-b.k);
 for(let i=1;i<tk.length;i++){let k=tk[i].k;while(k<tp.length-6&&tacc[k]-tacc[tk[i-1].k]<KT(tk[i-1].k))k++;if(k!==tk[i].k){tk[i].k=k;tk[i].p=tp[k];tk[i].n=gbNorm(tp,k);tk[i].w=tw[k]}}
 for(let i=tk.length-1;i>0;i--)if(tk[i].k>kTop+2){tk[i-1].ids.push(...tk[i].ids);knots.splice(knots.indexOf(tk[i]),1)}
 for(const b of br){if(b.pol)continue;const own=ownOf(b.j).sort((x,y)=>depth(y)-depth(x));const a0=b.Tk/2+8,a1=Math.max(a0+4,b.inner-4);const fit=Math.min(4,Math.max(1,Math.floor((a1-a0)/KG)+1));
  group(own,fit).forEach((ids,i,a)=>{const d=a.length===1?(a0+a1)/2:a0+(a1-a0)*i/(a.length-1);const k=gbNear(b.acc,d);knots.push({id:ids[0],ids,on:'b'+b.i,bid:b.id,k,p:b.pts[k],n:gbNorm(b.pts,k),w:b.w[k]})})}
 /* A knot is a boss the wood grew round, not a stud sewn on it: it stands out of the outside of the wood's bend (where the
    wood runs nearly straight, on alternate sides), a quarter to two fifths of the girth off the centre line, and swells the
    outline there. Its size follows how many scenarios run through its files, with a little of its own, as no two grow alike. Two bosses nearer than a girth and a fifth grow
    together into one burl. */
 for(const q of knots)if(q.on==='t')q.t=ty[q.k];
 const nScn=id=>js.reduce((n,j)=>n+(j.units.includes(id)?(M.leaves[j.id]||[]).length:0),0)+(M.buds[id]||[]).length,maxS=Math.max(1,...knots.map(q=>q.ids.reduce((s,id)=>s+nScn(id),0)));
 const wood=q=>{if(q.on==='t')return {pts:tp,w:tw,acc:tacc,up:-S};const b=br.find(x=>x.id===q.bid);return {pts:b.pts,w:b.w,acc:b.acc,up:gbNorm(b.pts,q.k)[1]<0?1:-1}};
 const boss=(q,alt)=>{const P=wood(q),n1=P.pts.length-1,k=q.k,a=P.pts[Math.max(0,k-6)],c=P.pts[Math.min(n1,k+6)],b=P.pts[k],n=gbNorm(P.pts,k),bend=[b[0]-(a[0]+c[0])/2,b[1]-(a[1]+c[1])/2],cv=bend[0]*n[0]+bend[1]*n[1];
  q.side=Math.abs(cv)>1.2?Math.sign(cv):alt;q.p=b;q.n=n;q.w=P.w[k];q.tg=[n[1],-n[0]];q.off=q.side*(.3+.1*gbHash('kn:'+key+':'+q.id))*q.w;q.bp=[b[0]+n[0]*q.off,b[1]+n[1]*q.off];
  q.sz=Math.max(.7,Math.min(1.2,.72+.48*Math.sqrt(q.ids.reduce((s,id)=>s+nScn(id),0)/maxS)))*(q.ids.length>1?1.12:1)*(.93+.14*gbHash('ks:'+key+':'+q.id));q.ra=Math.min(7.5,q.w*.14+3.8,Math.max(2.6,q.w*.6))*q.sz;q.rb=q.ra/1.35};
 for(const on of [...new Set(knots.map(q=>q.on))]){let alt=null;const row=knots.filter(q=>q.on===on).sort((a,b)=>a.k-b.k);
  for(const q of row){if(alt===null)alt=wood(q).up;boss(q,alt);alt=-q.side}
  for(let i=1;i<row.length;i++){const a=row[i-1],b=row[i];if(Math.hypot(a.bp[0]-b.bp[0],a.bp[1]-b.bp[1])<1.2*Math.max(a.w,b.w)){a.ids.push(...b.ids);knots.splice(knots.indexOf(b),1);row.splice(i,1);i--;boss(a,a.side)}}}
 /* the outline swells over the boss on its own side, about as far as the boss stands proud of the wood */
 const bx=tp.map(()=>0);for(const b of br)b.bx=b.pts.map(()=>0);
 for(const q of knots){const P=wood(q),arr=q.on==='t'?bx:br.find(x=>x.id===q.bid).bx,amp=Math.max(1.2+q.rb*.3,Math.abs(q.off)+q.rb*.92-q.w/2+1),sg=q.ra*1.15;
  for(let j=0;j<arr.length;j++)arr[j]+=q.side*amp*Math.exp(-Math.pow((P.acc[j]-P.acc[q.k])/sg,2))}
 /* Veins: each pad's strand in its own lane up the trunk, peeling off into its branch, so strands never cross. */
 const lanes=[...br.filter(b=>b.dir<0).sort((a,b)=>a.h-b.h).map(b=>b.id),apex.id,...br.filter(b=>b.dir>0).sort((a,b)=>b.h-a.h).map(b=>b.id)];
 const veins={};for(const id of lanes){const f=lanes.length===1?0:(lanes.indexOf(id)-(lanes.length-1)/2)/lanes.length*1.1;const b=br.find(x=>x.id===id);const kTop2=b?b.k:tp.length-1;
  const trunk=tp.slice(0,kTop2+1).map((q,i)=>{const n=gbNorm(tp,i),o=f*tw[i]*.5;return[q[0]+n[0]*o,q[1]+n[1]*o]});
  veins[id]={jid:pads[id].jid,trunk,branch:b?b.pts.slice(b.exit,Math.round(.55*(b.pts.length-1))):[],pad:origin[id]}}
 if(!strict&&!lit){const bx=(pd,o)=>{const g=pd.geo;return pd.crown?[o[0]-g.PW/2-g.L*.6,o[1]-g.PH-6,o[0]+g.PW/2+g.L*.6,o[1]+g.drop+4]:[o[0]-g.PW/2-g.L*.5,o[1]-g.PH-6,o[0]+g.PW/2+g.L*.5,o[1]+g.drop+4]};
  const c=bx(cpd,origin[apex.id]);if(padList.slice(1).some(pd=>{const q=bx(pd,origin[pd.id]);return Math.min(c[2],q[2])+10>Math.max(c[0],q[0])&&Math.min(c[3],q[3])+10>Math.max(c[1],q[1])}))return gbTree(M,js,H,S,key,sap,true)}
 let x0=Infinity,x1=-Infinity,y0=0;const grow=(x,y)=>{x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y)};
 tp.forEach((q,i)=>{grow(q[0]-tw[i]/2,q[1]);grow(q[0]+tw[i]/2,q[1])});for(const b of br)b.pts.forEach(q=>grow(q[0],q[1]-b.b));
 for(const pd of padList){const o=origin[pd.id],g=pd.geo;grow(o[0]-g.PW/2-g.L*.5,o[1]-g.PH-6);grow(o[0]+g.PW/2+g.L*.5,o[1]+g.drop+4)}
 return {js,apex,items,br,tp,tw,bx,ty,pads,padList,origin,knots,more,veins,lanes,ctw,H,Ht,D,S,lit,hs,h1,x0,x1,y0,cx0:x0,cx1:x1,cy0:y0,key}}

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
 let L=null;const Hmin=sap?0:Math.min(H0,400);
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
  /* the nebari: five root fingers (four on a slender literati) flaring out from under the trunk's foot, alternately long and
     short, each tapering from a quarter of the trunk's width to a twentieth and sunk in the soil; the back ones a little
     higher, the front ones lower and laid over them. On a side a named root leaves on, the long finger stays short, so the
     named root is the long one there */
  const nbSpec=(T,i)=>{const live=new Set(deps.filter(q=>q.i===i&&!q.loose).map(q=>q.d));
   const sp=T.lit?[[-1,1.05,0,.21,-.14],[1,.62,0,.2,.12],[1,.9,1,.24,.06],[-1,.46,1,.24,-.06]]
    :[[-1,1.45,0,.23,-.16],[1,.92,0,.21,.14],[-T.S,.38,0,.2,-T.S*.08],[1,1.28,1,.25,.1],[-1,.62,1,.25,-.1]];
   return sp.map(([d,len,f,w0,x0])=>({d,len:live.has(d)&&len>.9?.5:len,f,w0,x0}))};
  const halfAt=T=>(T.lit?.5:.56)*T.D,nbEnd=(T,q)=>q.d*(halfAt(T)+q.len*T.D*(q.f?.82:1));
  const looseLen=Math.max(28,Math.min(44,.13*tall)),mossW=22*Math.sqrt(kpx);
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
  trees.forEach((T,i)=>{const X=xs[i],D0=T.D;const fs0=[];nbSpec(T,i).forEach((q,k)=>{const n=16,kb=knobs(gbHash('nb'+i+':'+k),n);const a=X+q.x0*D0,e=X+nbEnd(T,q);const pts=[],w=[];
    /* its lower edge a unit under the soil (lower still for a front one, nearer the eye), its upper edge climbing the trunk
       where it leaves it, a buttress, so the foot flares into its roots */
    for(let ii=0;ii<=n;ii++){const t=ii/n,x=a+(e-a)*(1-Math.pow(1-t,1.35)),ww=Math.max(.8,D0*(q.w0-(q.w0-.05)*Math.pow(t,.8))*kb[ii][0]+(q.f?.2:.3)*D0*Math.pow(1-t,5));
     const g0=q.f?.62:.76;pts.push([x,(q.f?fy(x)+1:sy(x)+1.7)-ww/2+(t>g0?Math.pow((t-g0)/(1-g0),1.5)*(ww*.6+1.4):0)+kb[ii][1]*.3]);w.push(ww)}
    fs0.push({id:null,tree:i,d:q.d,pts,w,front:!!q.f})});fs0.sort((a,b)=>a.front-b.front);roots.push(...fs0)});
  for(const q of deps){const {id,i,d,r,T,ext,loose}=q;const X=xs[i],D0=T.D;const rim=d>0?pb:pa;const reach=Math.abs(rim-X);const kb=knobs(gbHash('rt:'+id),30);let pts=null,w=null;
   const wS=.25*D0;
   if(ext){/* a finger that runs along the soil to the rim, a third sunk, climbs over the lip and down the pot's side, and thins
      there to a fine root about a pixel and a half wide where tracing loses it */
    const xa=X+d*.1*D0,xr=rim-d*3,wR=3.2*kpx;const run=[];for(let ii=0;ii<=18;ii++){const t=ii/18,x=xa+(xr-xa)*(1-Math.pow(1-t,1.25)),we=wS+(wR-wS)*Math.pow(t,.7);
     run.push([x,sy(x)+1.7-we/2-Math.pow(1-t,3)*.1*D0+(ii<16?kb[ii][1]*.4:0)])}
    pts=gbResample(gbSmooth([...run,[rim+d*1.2,-2.9-.5*kpx],[rim+d*4.4,-1.6],[rim+d*6.6,1.6],[rim+d*6.4,5.8],[wallX(d,D*.34)+d*3.4,D*.34],[wallX(d,D*.62)+d*2.4,D*.62]],3),30);
    let iR=pts.findIndex(p=>d*(p[0]-xr)>=0);if(iR<1)iR=18;
    w=pts.map((p,ii)=>ii<=iR?Math.max(wR,(wS+(wR-wS)*Math.pow(ii/iR,.7))*(ii<iR*.8?kb[ii][0]:1)):3*kpx+(1.5*kpx-3*kpx)*(ii-iR)/Math.max(1,30-iR))}
   else if(!loose){/* a store's: a finger along the soil whose tip goes under, where its tag is staked */
    const len=Math.max(16,Math.min(reach-14,(.2+.07*r)*potL+8)),xa=X+d*.1*D0;pts=[];w=[];
    for(let ii=0;ii<=22;ii++){const t=ii/22,x=xa+d*len*(1-Math.pow(1-t,1.2)),ww=Math.max(.9,D0*(.25-.2*Math.pow(t,.8))*kb[ii][0]);
     pts.push([x,sy(x)+1.7-ww/2-Math.pow(1-t,3)*.1*D0+(t>.75?Math.pow((t-.75)/.25,1.5)*(ww*.5+1.4):0)]);w.push(ww)}}
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
  /* the pot is the repository: its name pressed small into the face's lower right, in full when it fits */
  let repo='';try{repo=(state.config&&state.config.project)||String(state.dir||'').split('/').pop()||''}catch(e){}
  const midCut=(t,n)=>t.length<=n?t:t.slice(0,Math.ceil((n-1)/2))+'…'+t.slice(t.length-Math.floor((n-1)/2));
  const sfs=8.6*kpx;const seal=repo&&potL>90?{t:midCut(repo,Math.max(6,Math.floor(.42*potL/(sfs*.6)))),fs:sfs}:null;if(seal)seal.w=gbW(seal.t,sfs*.6);
  const fs=narrow?11*GB_NK:10.5,cw=fs*.61,tfs=8.6*kpx,tcw=tfs*.61;
  /* names: a third party's beside where its root goes down the pot's side and "trace stops" at the open end of its tail, both
     reading outward from the root. On a phone or a narrow window the name and its note read outward from the tail's end in
     one line; where even that would run off the drawing, the name stands above the rim, over its root where it climbs the
     lip, and "trace stops" reads inward from the tail's end */
  const rl=[],taken2=[];const fits=(a,b)=>Math.max(x1,b)-Math.min(x0,a)+24<=width;const zxOf=d=>wallX(d,D+11)+d*1.9,zy=D+13.2+fs*.35;
  for(const r of roots){if(!r.id||!r.ext)continue;const d=r.d,t=gwCut(M.U[r.id].label,22),w0=gbW(t,cw),zx=zxOf(d);
   if(!narrow){const y=D*.42,yt=y-fs*.75,yb=y+fs*.45;let edge=wallX(d,y);r.pts.forEach((q,ii)=>{if(q[1]>yt-2&&q[1]<yb+2)edge=d>0?Math.max(edge,q[0]+r.w[ii]/2):Math.min(edge,q[0]-r.w[ii]/2)});const x=edge+d*6;
    rl.push({r,x,y:y+fs*.35,anchor:d>0?'start':'end',t,face:false,bare:true});if(d>0)x1=Math.max(x1,x+w0+8);else x0=Math.min(x0,x-w0-8);
    if(r.stop){const nx=zx+d*5.5,w1=gbW('trace stops',cw);rl.push({r,x:nx,y:zy,anchor:d>0?'start':'end',t:'trace stops',note:true});if(d>0)x1=Math.max(x1,nx+w1+8);else x0=Math.min(x0,nx-w1-8)}
    continue}
   const one=gbW(r.stop?t+' · trace stops':t,cw),nx=zx+d*5.5;
   if(fits(d>0?nx:nx-one-8,d>0?nx+one+8:nx)){rl.push({r,x:nx,y:zy,anchor:d>0?'start':'end',t,face:false,below:true});if(d>0)x1=Math.max(x1,nx+one+8);else x0=Math.min(x0,nx-one-8);continue}
   /* above the rim: over the root where it climbs the lip, moved in along the soil until it is clear of the wood */
   const rim=d>0?pb:pa;let best=null;
   for(const lift of [0,4.5,9])for(let k=0;k<14;k++){const ex=rim+d*(6-k*7)*kpx,a=d>0?ex-w0:ex,b=d>0?ex:ex+w0;if(!fits(a-4,b+4))continue;
    let top=Math.min(sy(a),sy(b),-1);r.pts.forEach((q,ii)=>{if(q[0]>a-2&&q[0]<b+2)top=Math.min(top,q[1]-r.w[ii]/2)});
    const base=top-(2.5+lift)*kpx-fs*.22,box=[a-2,base-fs*.78,b+2,base+fs*.22];const c=Math.min(clr(box,r),...taken2.map(q=>bgap(box,q)-4));
    if(!best||c>best.c+.5)best={ex,base,box,c};if(c>=6*kpx)break}
   if(best&&best.c>=2*kpx){rl.push({r,x:best.ex,y:best.base,anchor:d>0?'end':'start',t,face:false,bare:true,mb:best.box});taken2.push(best.box);
    if(r.stop){const ix=zx-d*5.5;rl.push({r,x:ix,y:zy,anchor:d>0?'end':'start',t:'trace stops',note:true})}}
   else rl.push({r,x:zx-d*5.5,y:zy,anchor:d>0?'end':'start',t,face:false,below:true})}
  /* a store's name on a plant tag: a small rounded tag standing about twelve units above the soil on a wooden stake pushed into
     it, never within sixteen pixels of the wood. A live store's stake stands on its root, at its tip or back along it; a
     store no journey uses is a severed root laid in the soil apart from the flare, its tag beside its thin end, and both move
     along the soil together until the tag is clear */
  /* (on a phone the unused store's tag takes two lines, and where the pot has no clear stretch wide enough the tag leans
     out past the rim on its stake, away from the trunk) */
  const tagAt=(sx,lab,out)=>{const ln=lab.split('\n'),ww=Math.max(...ln.map(q=>gbW(q,tcw)))+10*kpx,th=12.5*kpx+(ln.length-1)*tfs*1.12,gy=sy(sx),bot=gy-11;const lo=pa-10+ww/2,hi=pb+10-ww/2,cx=out?sx+out*ww/2:lo>hi?(pa+pb)/2:Math.max(lo,Math.min(hi,sx));
   const x=Math.max(sx-ww/2+5*kpx,Math.min(sx+ww/2-5*kpx,cx));const box=[x-ww/2,bot-th,x+ww/2,bot];return {x,ww,th,gy,bot,top:bot-th,box,sx,two:ln.length>1}};
  /* (clearance from the wood and from where a pad's leaves may hang, a root lying low in the soil counting as the soil the
     tag already stands twelve units clear of; between places that both fall short, the one further from the pad's own body wins) */
  const score=(g,own)=>{const tk=Math.min(...taken2.map(q=>bgap(g.box,q))),c=Math.min(clr(g.box,own,0,1),tk);return c+.25*Math.max(0,Math.min(clr(g.box,own,1,1),tk)-c)};
  for(const r of roots){if(!r.id||r.ext)continue;const T=trees[r.tree],X=xs[r.tree],t=gwCut(M.U[r.id].label,22),lab=r.loose?t+' · unused':t,labs=r.loose&&narrow?[t+'\nunused',lab]:[lab];let best=null;const ok=16*kpx;
   if(!r.loose){const n=r.pts.length;for(let ii=n-1;ii>=Math.floor(n*.45);ii-=2){const g=tagAt(r.pts[ii][0]+r.d*(ii===n-1?2:0),lab);g.c=score(g,r);if(!best||g.c>best.c+.5)best=g;if(g.c>=ok)break}
    if(best&&best.c<ok)ov:for(let ii=n-1;ii>=Math.floor(n*.45);ii-=2)for(const f of [.4,.7,1]){const g=tagAt(r.pts[ii][0],lab,r.d*f);g.c=score(g,r);if(g.c>best.c+.5)best=g;if(g.c>=ok)break ov}}
   else{const busy=d=>deps.some(q=>q.i===r.tree&&q.d===d&&!q.loose);let sides=[r.d,-r.d].filter(d=>!busy(d));if(!sides.length)sides=[r.d];
    outer:for(const d of sides){const rim=d>0?pb:pa;const nb=Math.max(halfAt(T),...roots.filter(q=>!q.id&&q.tree===r.tree&&q.d===d).map(q=>d*(q.pts[q.pts.length-1][0]-X)),...roots.filter(q=>q.id&&q.pts&&q.tree===r.tree&&q.d===d).map(q=>d*(q.pts[q.pts.length-1][0]-X)));
     for(let s0=rim-d*(12*kpx+looseLen+5*kpx);d*(s0-X)>=nb+16*kpx;s0-=d*5*kpx)for(const lb of labs){const g=tagAt(s0+d*(looseLen+5*kpx),lb);g.c=score(g,r);g.s0=s0;g.d=d;if(!best||g.c>best.c+.5)best=g;if(g.c>=ok)break outer}}
    if(best&&best.c<ok)outer2:for(const d of sides){const rim=d>0?pb:pa;for(let s0=rim-d*(12*kpx+looseLen+5*kpx),k=0;k<8;s0-=d*5*kpx,k++)for(const f of [.4,.7,1])for(const lb of labs){const g=tagAt(s0+d*(looseLen+5*kpx),lb,d*f);g.c=score(g,r);g.s0=s0;g.d=d;if(g.c>best.c+.5)best=g;if(g.c>=ok)break outer2}}
    if(!best){const d=r.d,s0=d>0?pb-12*kpx-looseLen-5*kpx:pa+12*kpx+looseLen+5*kpx;best=tagAt(s0+d*(looseLen+5*kpx),lab);best.s0=s0;best.d=d}
    /* the severed root: bark tapering from its cut face to a fine end that goes under, with a slight S along its length */
    const d=best.d,s0=best.s0,n=20,kb=knobs(gbHash('cut:'+r.id),n);r.d=d;r.pts=[];r.w=[];
    for(let ii=0;ii<=n;ii++){const t=ii/n,x=s0+d*looseLen*t,ww=(6-3*Math.pow(t,.9))*kpx*(1+.06*(kb[ii][0]-1)/.13);
     r.pts.push([x,sy(x)+1.9-ww/2-.75*kpx*Math.sin(t*6.283)*(1-.4*t)-Math.pow(1-t,4)*1.4*kpx+(t>.7?Math.pow((t-.7)/.3,1.5)*(ww*.5+1.6):0)]);r.w.push(ww)}}
   if(!best)continue;taken2.push(best.box);
   rl.push({r,x:best.x,y:best.top+best.th/2+tfs*.36-(best.two?tfs*.56:0),anchor:'middle',t,unused:!!r.loose,two:best.two,tag:true,fs:tfs,ww:best.ww,th:best.th,sx:best.sx,gy:best.gy,bot:best.bot,top:best.top,mb:[best.sx-6,best.top,best.sx+6,best.gy],
    box:[best.box[0]-16*kpx,best.box[1]-16*kpx,best.box[2]+16*kpx,best.gy+2]});x0=Math.min(x0,best.box[0]-6);x1=Math.max(x1,best.box[2]+6)}
  const stopX=rl.some(l=>l.r.stop&&l.r.ext);
  const yb=Math.max(0,...rl.filter(l=>l.below||l.note).map(l=>l.y+5));
  L={trees,xs,potL,potC,D,fh,kpx,fy,roots,rl,fs,sy,wallX,seal,x0,x1,y0:y0-8,y1:Math.max(yb,D+fh+(lone?10:12)+(stopX?10:0)),narrow,S,H0,lone};
  /* too wide: a lower tree has smaller pads and labels, down to the height where its leaves reach their smallest; below
     that only the trunk would shrink and the pads pile into each other, so past it the drawing scales down whole instead */
  const need=L.x1-L.x0+24;if(need<=width||pass===5||H0<=Hmin)break;H0=Math.max(Hmin,H0*Math.max(.55,Math.min(.96,Math.pow((width-24)/need,1.4))));}
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
 /* a lit knot's glow: amber from inside the boss, fading out into the bark round it (red for one that broke) */
 for(const [k,c] of [['kg','--gold'],['kw','--verm']])defs.append(sv('radialGradient',{id:'gb-'+k+N},sv('stop',{offset:0,style:'stop-color:var('+c+');stop-opacity:.72'}),sv('stop',{offset:.45,style:'stop-color:var('+c+');stop-opacity:.36'}),sv('stop',{offset:1,style:'stop-color:var('+c+');stop-opacity:0'})));
 svg.style.setProperty('--kg','url(#gb-kg'+N+')');svg.style.setProperty('--kgw','url(#gb-kw'+N+')');
 /* foliage is lit from above: the crest lighter, the body its own green, the underside in shade */
 const padG='gb-pad'+N;defs.append(sv('pattern',{id:padG+'s',patternUnits:'userSpaceOnUse',width:31,height:23},...[[10.0,3.5,-58,'s',1.6],[11.3,1.3,59,'s',1.2],[13.0,5.5,38,'s',1.7],[29.4,14.5,-55,'s',1.5],[30.3,1.1,-36,'s',1.2],[3.7,7.1,-24,'s',1.7],[5.8,2.2,-54,'s',1.7],[15.4,12.2,10,'s',2.0],[11.2,5.7,-24,'l',1.3],[17.8,12.1,17,'l',1.4],[30.4,2.7,37,'s',1.4],[28.9,9.7,-51,'l',1.7],[27.1,7.2,19,'s',1.7],[14.1,19.3,-1,'s',1.8],[1.9,16.1,44,'s',1.5],[20.7,0.5,48,'s',1.7],[15.3,5.0,3,'s',1.3],[12.1,20.0,-50,'s',1.5],[8.6,3.1,40,'l',1.4],[12.9,8.3,27,'l',1.3],[5.5,5.3,-11,'s',1.9],[5.7,6.5,-33,'s',1.5],[17.6,21.9,61,'l',1.8],[22.9,10.5,30,'s',1.5],[14.9,9.2,-22,'s',1.3],[5.0,7.8,-57,'s',1.7]].map(([x,y,a,c,rx])=>sv('ellipse',{cx:x,cy:y,rx,ry:rx*.5,transform:'rotate('+a+' '+x+' '+y+')',class:'st'+c}))));
 /* each clump of foliage lit on its top and in its own shade beneath, the crest's a step lighter than its shoulders' */
 for(const [k,v] of [['cr','fol'],['sh','fsh']])defs.append(sv('linearGradient',{id:padG+k,x1:.3,y1:0,x2:.45,y2:1},sv('stop',{offset:.08,style:'stop-color:var(--'+v+'-hi)'}),sv('stop',{offset:.5,style:'stop-color:var(--'+v+')'}),sv('stop',{offset:.92,style:'stop-color:var(--'+v+'-lo)'})),
  /* a tuft: lit along its top, where it crosses the leaf, and gone into the cushion below */
  sv('linearGradient',{id:padG+'t'+k,x1:0,y1:0,x2:0,y2:1},sv('stop',{offset:.1,style:'stop-color:var(--'+v+'-hi)'}),sv('stop',{offset:.55,style:'stop-color:var(--'+v+')'}),sv('stop',{offset:1,style:'stop-color:var(--'+v+');stop-opacity:0'})));
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
 const piece=(id,pts,w,cls,parent,delay,ms,floor,bx)=>{const d=gbRib(pts,w,0,pts.length-1,floor,bx);const p=sv('path',{d,class:cls});p.__pts=pts;p.__w=w;p.__floor=floor;parent.append(p);clip.append(sv('path',{d}));anim('wood:'+id,p,delay,ms,'grow');return p};
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
  if(!o.flat){const bl=sv('g',{'clip-path':'url(#'+clipId+')',filter:'url(#'+softId+')'}),gr=sv('g',{'clip-path':'url(#'+clipId+')'});wg.append(bl,gr);shade(pts,w,eo,bl);if(b>4.5)grain(pts,w,gbHash('grain:'+id),gr,o.bs,eo);el.__also=[bl,gr]}
  /* the fillets: from the parent's edge, along it, into the limb's edge just past where it leaves, round a corner pulled
     toward the crotch; closed through both centre lines so they are part of the same wood */
  const pp=P.pts,k=P.k,n1=pp.length-1,c=pp[k],cd=[pts[eo+2][0]-c[0],pts[eo+2][1]-c[1]],pn=gbNorm(pp,k),sgn=pn[0]*cd[0]+pn[1]*cd[1]>0?1:-1;
  const edge=kk=>{kk=Math.max(0,Math.min(n1,kk));const q=pp[kk],n=gbNorm(pp,kk),hw=P.w[kk]/2*sgn;return [q[0]+n[0]*hw,q[1]+n[1]*hw]};
  const ptg=[pp[Math.min(n1,k+1)][0]-pp[Math.max(0,k-1)][0],pp[Math.min(n1,k+1)][1]-pp[Math.max(0,k-1)][1]],cn=gbNorm(pts,eo),fw=cn[0]*ptg[0]+cn[1]*ptg[1]>0?1:-1;
  const bE=(ii,s1)=>{ii=Math.min(n0,ii);const q=pts[ii],n=gbNorm(pts,ii),hw=w[ii]/2*s1;return [q[0]+n[0]*hw,q[1]+n[1]*hw]};
  const fil=(a,bb,cc)=>{const m2=[(a[0]+bb[0])/2,(a[1]+bb[1])/2],ctl=[cc[0]+(m2[0]-cc[0])*.45,cc[1]+(m2[1]-cc[1])*.45];return 'M'+gbP(a)+' Q'+gbP(ctl)+' '+gbP(bb)+' L'+gbP(pts[Math.min(n0,eo+3)])+' L'+gbP(c)+'Z'};
  /* the collar: the wood swells round the limb where it leaves, half again its girth across */
  const ca=Math.atan2(pts[eo+2][1]-pts[eo][1],pts[eo+2][0]-pts[eo][0])*180/Math.PI,col=sv('ellipse',{cx:gbF(pts[eo][0]),cy:gbF(pts[eo][1]),rx:gbF(.5*b),ry:gbF(.65*b),transform:'rotate('+gbF(ca)+' '+gbP(pts[eo])+')',class:cls});
  const U=gU||fg;U.append(col);clip.append(sv('ellipse',{cx:gbF(pts[eo][0]),cy:gbF(pts[eo][1]),rx:gbF(.5*b),ry:gbF(.65*b),transform:'rotate('+gbF(ca)+' '+gbP(pts[eo])+')'}));anim('col:'+id,col,delay+ms*.2,240,'fade');
  for(const f of [fil(edge(gbFwd(pp,k,1.5*b)),bE(eo+3,fw),bE(eo,fw)),fil(edge(gbBack(pp,k,.8*b)),bE(eo+2,-fw),bE(eo,-fw))]){const fp=sv('path',{d:f,class:cls});U.append(fp);clip.append(sv('path',{d:f}));anim('fil:'+id+f.length,fp,delay+ms*.25,240,'fade');
   /* the crotch sits in the shade of the limb above it, so the parent's lit side does not run on into it as a pale wedge */
   if(gS){const fs=sv('path',{d:f,class:'filsh'});gS.append(fs);anim('filsh:'+id+f.length,fs,delay+ms*.25,240,'fade')}}
  el.__par=pp;el.__col=col;return {el,wg,fg}};
 /* a branchlet that carries a cushion is bark like its limb: lit on one side, shaded on the other, growing with it */
 const barkOn=(tw,parent)=>{if(sap)return;clip.append(sv('path',{d:tw.getAttribute('d')}));const bl=sv('g',{'clip-path':'url(#'+clipId+')',filter:'url(#'+softId+')'});parent.append(bl);shade(tw.__pts,tw.__w,0,bl);tw.__also=[bl]};
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
 /* over the roots and the trunk's foot, the soil again, so they sink into it rather than sit on it; then the lip */
 gSoil.append(sv('path',{class:'soil',style:'fill:url(#'+soid+')',d:soilD(.7)}),sv('path',{class:'grit',style:'fill:url(#'+soid+'g)',d:soilD(.7)}));
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
 /* moss in three or four low mounds on both sides of the trunk where there is room: each a few overlapping irregular
    ellipses in two greens, a darker underside and a lighter rim along the top, clipped at the soil; never against the
    trunk, a root, a stake or a name */
 {const r=gbRng(gbHash('moss:'+key)),mk=Math.sqrt(kx);
  const busy=(a,b)=>L.xs.some((X,i)=>b>X-.62*L.trees[i].D-6&&a<X+.62*L.trees[i].D+6)||L.roots.some(q=>q.pts&&q.pts.some((p,ii)=>p[0]>a-(q.loose?9:5)&&p[0]<b+(q.loose?9:5)&&p[1]-q.w[ii]/2<L.sy(p[0])+.4))||L.rl.some(l=>l.mb&&b>l.mb[0]-5&&a<l.mb[2]+5);
  /* the soil that is clear runs between the trunk, the roots and the stakes; the mounds go to the roomiest runs, a side
     at a time, sized to fit and spaced unevenly so they never stand in a row */
  const want=lone?1:pl>300?4:3,mw0=(lone?14:21)*mk,mwn=(lone?10:12)*mk,gap=6*mk,X0=L.xs[0],runs=[];
  {let s0=null;for(let x=Math.ceil(pa+6);x<=pb-6;x++){const ok=x+1<=pb-7&&!busy(x,x+1);if(ok&&s0===null)s0=x;if(!ok&&s0!==null){runs.push({a:s0,b:x,n:0});s0=null}}}
  const cap=R=>R.b-R.a<mwn?0:Math.min(2,Math.floor((R.b-R.a+gap)/(mwn+gap))),onSide=R=>runs.filter(Q=>(Q.a<X0)===(R.a<X0)).reduce((t,Q)=>t+Q.n,0);
  for(let k=0;k<want;k++){let best=null,bs=-Infinity;for(const R of runs){if(R.n>=cap(R))continue;const sc=(R.b-R.a)/(R.n+1)-40*onSide(R);if(sc>bs){bs=sc;best=R}}if(!best)break;best.n++}
  const pick=[];for(const R of runs){if(!R.n)continue;const len=R.b-R.a,ws=[];for(let i=0;i<R.n;i++)ws.push(mw0*(i%2?.55+r()*.2:.95+r()*.25));if(r()<.5)ws.reverse();
   {const room=len-(R.n-1)*gap,tot=ws.reduce((t,w)=>t+w,0);if(tot>room)for(let i=0;i<R.n;i++)ws[i]=Math.max(mwn,ws[i]*room/tot)}
   const slack=Math.max(0,len-ws.reduce((t,w)=>t+w,0)-(R.n-1)*gap),wt=[];for(let i=0;i<=R.n;i++)wt.push(.3+r());const wsum=wt.reduce((t,w)=>t+w,0);
   let x=R.a;for(let i=0;i<R.n;i++){x+=slack*wt[i]/wsum;pick.push([x+ws[i]/2,ws[i]]);x+=ws[i]+gap}}
  for(const [x,mw] of pick){const n=5+Math.floor(r()*5),mh=(2.2+r()*1.6)*mk*Math.min(1,mw/(18*mk)),es=[];
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
 if(L.seal){const t=L.seal.t,sf=L.seal.fs||8.6,x=lone?pc:L.wallX(1,D-6)-7,y=lone?D*.5+sf*.35:D-6,an=lone?'middle':'end';
  const tx=(dx,dy,c)=>sv('text',{x:gbF(x+dx),y:gbF(y+dy),'text-anchor':an,class:c,style:'font-size:'+gbF(sf)+'px'},t);
  gPot.append(sv('g',{class:'seal','aria-hidden':'true'},tx(-.5,-.5,'sd'),tx(.5,.5,'sl'),tx(0,0,'sm')))}
 /* roots: the nebari first, then the named ones over them; a third party's goes over the lip, so it is drawn after it */
 L.roots.forEach((r,i)=>{if(!r.pts)return;const id='r'+i+(r.id?':'+r.id:'');const g=sv('g',r.id?{class:'rt dep'+(r.ext?' ext':' store')+(r.loose?' loose':'')+(r.stop?' stop':''),'data-k':'u:'+r.id,tabindex:-1,role:'button','aria-label':M.U[r.id].label+', what the change depends on'+(r.loose?', on no journey':'')+(r.stop?', where tracing stops':'')}:{class:'nbf'+(r.front?' fr':'')});
  if(r.id&&!r.ext)g.setAttribute('clip-path','url(#'+airId+'p)');
  const pts=r.pts,n=pts.length;const delay=r.tree*250+80;const wd=piece(id,pts,r.w,'w',g,delay,520);
  /* a root's upper side catches the light, which parts each finger from the one behind it */
  if(!r.loose){const m=gbNorm(pts,Math.floor(n*.35)),up=m[1]<0?1:-1,hl=sv('path',{class:'rhi',d:gbBand(pts.slice(0,r.ext?Math.ceil(n*.62):n),r.w,up*.25,up*.9)});g.append(hl);anim('rhi:'+id,hl,delay+520,300,'fade')}
  /* a severed root ends in a cut face: pale wood with two growth rings, cut on a slant so it shows */
  if(r.loose)g.insertBefore(sv('path',{d:wd.getAttribute('d'),class:'rbed'}),wd);
  if(r.loose){const c=pts[0],w0=r.w[0],a=Math.atan2(pts[2][1]-c[1],pts[2][0]-c[0])*180/Math.PI,rx=w0*.42,ry=w0*.54,arc=(k,a0,a1)=>{const p=t=>[c[0]+Math.cos(t)*rx*k,c[1]+Math.sin(t)*ry*k];return 'M'+gbP(p(a0))+' A'+gbF(rx*k)+' '+gbF(ry*k)+' 0 1 1 '+gbP(p(a1))};
   g.append(sv('g',{class:'rcutg',transform:'rotate('+gbF(a)+' '+gbP(c)+')'},sv('ellipse',{class:'rcut',cx:gbF(c[0]),cy:gbF(c[1]),rx:gbF(rx),ry:gbF(ry)}),sv('path',{class:'rring2',d:arc(.64,-2.2,1.9)}),sv('path',{class:'rring2',d:arc(.3,-1.4,2.6)})))}
  if(r.id){g.insertBefore(sv('path',{d:wd.getAttribute('d'),class:'rring','clip-path':'url(#'+airId+')'}),wd);
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
   gNbF.append(sv('path',{class:'soil',style:'fill:url(#'+soid+')',d:top+bot+'Z'}),sv('path',{class:'grit',style:'fill:url(#'+soid+'g)',d:top+bot+'Z'}));return}
  (r.id?gRootX:gRoot).append(g)});
 /* and over the named roots' lower edges the soil once more, so they lie in it, a unit deep, rather than on it */
 {const gx=sv('g',{class:'soilx'});for(const r of L.roots){if(!r.id||!r.pts)continue;let a=1e9,b=-1e9;r.pts.forEach((p,ii)=>{if(p[0]>pa+1.5&&p[0]<pb-1.5&&p[1]+r.w[ii]/2>L.sy(p[0])+.7){a=Math.min(a,p[0]-r.w[ii]/2);b=Math.max(b,p[0]+r.w[ii]/2)}});
   const l=L.rl.find(q=>q.r===r&&q.tag);if(l){a=Math.min(a,l.sx-2);b=Math.max(b,l.sx+2)}if(b<a)continue;a=Math.max(pa+1.5,a-1);b=Math.min(pb-1.5,b+1);const n=Math.max(2,Math.ceil((b-a)/4));let top='',bot='';
   for(let k=0;k<=n;k++){const x=a+(b-a)*k/n,y=L.sy(x);top+=(k?' L':'M')+gbF(x)+' '+gbF(y+.7);bot=' L'+gbF(x)+' '+gbF(Math.max(y+.7,Math.min(y+4.2,-1)))+bot}
   gx.append(sv('path',{class:'soil',style:'fill:url(#'+soid+')',d:top+bot+'Z'}),sv('path',{class:'grit',style:'fill:url(#'+soid+'g)',d:top+bot+'Z'}))}
  gRootX.after(gx)}
 for(const l of L.rl){const t=sv('text',{x:gbF(l.x),y:gbF(l.y),'text-anchor':l.anchor,class:'rlbl'+(l.tag?' tg':'')+(l.note?' nt':''),style:'font-size:'+gbF(l.fs||L.fs)+'px'},l.t,l.unused?(l.two?sv('tspan',{class:'nt',x:gbF(l.x),dy:'1.12em'},'unused'):sv('tspan',{class:'nt'},' · unused')):l.r.stop&&!l.bare&&!l.note?sv('tspan',{class:'nt'},' · trace stops'):null);(B.root[l.r.id]||gRoot).append(t);anim('rl:'+l.r.id,t,l.r.tree*250+560,300,'fade')}
 let lightAt=0;
 /* trees */
 L.trees.forEach((T,ti)=>{const X=L.xs[ti];const sh=q=>[q[0]+X,q[1]];const base=ti*250;const tp=T.tp.map(sh);
  /* everything on a tree grows in step with its trunk: when the trunk regrows (a journey joined it), so does all it carries,
     so nothing stands where the wood has not reached yet */
  const gk='@'+ti+':'+T.js.map(j=>j.id).join(',');
  const tdur=sap?900:1100;const tkw=piece('t'+gk,tp,T.tw,'w',gWood,base,tdur,1.5,T.bx);rxMask.append(sv('path',{d:gbRib(tp,T.tw,0,tp.length-1,undefined,T.bx),fill:'#000'}));if(!sap){/* the growth mask goes outside the softening, so the growing end stays crisp */const tcid='gb-tc'+N+'-'+ti;defs.append(sv('clipPath',{id:tcid},sv('path',{d:gbRib(tp,T.tw,0,tp.length-1,1.5,T.bx)})));const tl=sv('g',{}),tli=sv('g',{'clip-path':'url(#'+tcid+')',filter:'url(#'+softId+')'}),tgr=sv('g',{});tl.append(tli);gLight.after(tl);gGrain.append(tgr);shade(tp,T.tw,2,tli);grain(tp,T.tw,gbHash('grain:'+T.key),tgr,T.knots.filter(q=>q.on==='t').map(q=>[q.k,q.off,q.rb]));tkw.__also=[tl,tgr]}lightAt=Math.max(lightAt,base+tdur);
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
   /* the branch is a limb off the trunk like any other, its knots' bosses swelling its outline and parting its grain */
   const bk=T.knots.filter(q=>q.bid===b.id).map(q=>[q.k,q.off,q.rb]);
   const lm=limb(id,pts,b.w,{pts:tp,w:T.tw,k:b.k},'w'+old,jg,b.back?null:gWood,b.back?null:gGrain,delay,ms,{bx:b.bx,bs:bk,flat:b.back}),wg=lm.wg;lightAt=Math.max(lightAt,delay+ms);
   b.twigs.forEach((t,tk)=>{const tpp=t.pts.map(sh);/* a twig starts once the growing branch has reached its base (the branch grows on an ease-out) */
    const ts=gbT('wood:'+id,delay)-now+ms*(1-Math.pow(1-Math.min(1,t.at+.04),1/2.2))+(t.c?320*t.bi/(t.c.pts.length-1):0);
    /* the riser a raised crest stands on is a limb off the branch, grown the same way */
    if(t.lb){limb('tw:'+id+':'+tk,tpp,t.w,{pts,w:b.w,k:t.bi},'w'+old,jg,lm.fg,b.back?null:wg,ts,320,{flat:b.back})}
    else{const tw=sv('path',{d:gbRib(tpp,t.w),class:'tw'+(t.id?' lt':'')+old});tw.__pts=tpp;tw.__w=t.w;jg.append(tw);if(t.id)(B.ltw=B.ltw||{})[t.id]=[tw];else if(!b.back)barkOn(tw,jg);anim('tw:'+id+':'+(t.id||tk),tw,ts,320,'grow')}
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
  /* a branchlet starts once the leader has grown to it, out from under its bark, and a leaf's twig once its own wood has */
  T.ctw.forEach((t,tk)=>{const tpp=t.pts.map(sh),t0=t.c?at(T.ty[t.c.bi])+320*t.bi/(t.c.pts.length-1):at(T.ty[t.bi]);let ak='ctw:'+ti+':'+(t.id||tk)+gk;
   /* the branchlets that carry the crown's shoulders, or hang its failures, are limbs off the leader like any branch */
   if(t.lb){limb(ak,tpp,t.w,{pts:tp,w:T.tw,k:t.bi},'w',JG[T.apex.id],gWood,gGrain,t0,320);ak='wood:'+ak}
   else{const tw=sv('path',{d:gbRib(tpp,t.w),class:'tw'+(t.id?' lt':'')});tw.__pts=tpp;tw.__w=t.w;(t.id?JG[T.apex.id]:gBud).append(tw);if(t.id)(B.ltw=B.ltw||{})[t.id]=[tw];else barkOn(tw,gBud);anim(ak,tw,t0,320,'grow')}
   const ce=(B.cEnd=B.cEnd||{})[T.apex.id]=B.cEnd[T.apex.id]||{};if(t.k!==undefined)ce[t.k]=Math.max(ce[t.k]||0,gbT(ak,t0)-now+320)});
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
     flows that reach it are graft buds on the knot itself). A shoot grows from its knot's boss, so only on the outside of the
     wood's bend, where a grower lets one run; it leans up and out toward the light, each at its own angle and length, and
     holds its checks as small leaves set alternately along it. No two shoots stand within 40 px of each other on the same
     side of the wood: the later one's checks join the nearer shoot, and its count. A root's checks send up a sucker from the
     trunk above the flare; a part on no knot, a shoot under the crown. Its route back to the soil is the wood it grows from. */
  if(!sap&&!ti){const out=r=>Math.max(0,vx+4-r[0])+Math.max(0,r[2]-(vx+W-4))+Math.max(0,vy+2-r[1]),kq=L.narrow?GB_NK:1;
   const own=id=>(M.buds[id]||[]).filter(x=>x.scenarioKind!=='regression');
   const grow1=(pl,k0,wd,uids,kid,routeOf,lo,pref,bs)=>{let best=null;const n1=pl.length-1,step=gbLen(pl)[n1]/n1,jA=(gbHash('sha:'+kid)-.5)*24,jL=1+(gbHash('shl:'+kid)-.5)*.3;
    for(const off of bs?[0]:[0,7,-7,14,-14]){const kk=Math.max(lo,Math.min(n1-2,k0+Math.round(off/step)));const a=pl[kk],n=gbNorm(pl,kk),wk=wd[kk];
     /* the outside of the bend: away from the middle of the chord across it; where the wood runs straight, the root's side */
     const ka=pl[Math.max(0,kk-6)],kb=pl[Math.min(n1,kk+6)],bend=[a[0]-(ka[0]+kb[0])/2,a[1]-(ka[1]+kb[1])/2],cv=bend[0]*n[0]+bend[1]*n[1];
     const side=bs?bs.side:Math.abs(cv)>1.2?Math.sign(cv):pref&&n[0]*pref<0?-1:1,s0=[n[0]*side,n[1]*side];
     /* a branch that bows down has its boss underneath; the shoot still never hangs (a hanging leaf is how a journey fails): it
        rises from the boss through the top of the wood, as one from the far side of the branch would */
     const up=pl!==tp&&s0[1]>.35,ns=up?[-s0[0],-s0[1]]:s0;
     const g0=pl[Math.min(n1,kk+1)],g1=pl[Math.max(0,kk-1)],gm=Math.hypot(g0[0]-g1[0],g0[1]-g1[1])||1,tg=[(g0[0]-g1[0])/gm,(g0[1]-g1[1])/gm];
     const b0=bs?(up?bs.p:[bs.p[0]+ns[0]*bs.rb*.55,bs.p[1]+ns[1]*bs.rb*.55]):[a[0]+ns[0]*(wk/2-2.4),a[1]+ns[1]*(wk/2-2.4)];
     for(const dth of [0,-10,10,-20,20])for(const lf of [1,.86]){const th=Math.max(26,Math.min(72,46+jA+dth)),r0=th*Math.PI/180,len=30*jL*lf;
      const v0=[tg[0]*Math.cos(r0)+ns[0]*Math.sin(r0),tg[1]*Math.cos(r0)+ns[1]*Math.sin(r0)];if(v0[1]>.25)continue;
      const tip=[b0[0]+v0[0]*len*.72,b0[1]+v0[1]*len*.72-len*.42],c1=[b0[0]+v0[0]*len*.48,b0[1]+v0[1]*len*.48],c2=[tip[0]-v0[0]*len*.06,tip[1]+len*.3],pts=gbBez([b0,c1,c2,tip],10);
      const xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]),r=[Math.min(...xs)-9,Math.min(...ys)-9,Math.max(...xs)+9,Math.max(...ys)+5];
      const sc=hits(r)+out(r)*400+Math.abs(dth)*1.5+(lf===1?0:14);
      if(!best||sc<best.sc)best={sc,pts,b0,tip,r,kk,ns,o:out(r)}}}
    const inPad=r=>padBox.slice(0,nPad).reduce((a,q)=>a+ov(r,q),0)>.2*(r[2]-r[0])*(r[3]-r[1]);
    const gs=B.shootGeo||[],dist=(g,a)=>Math.hypot(g.base[0]-a[0],g.base[1]-a[1]),same=best?gs.filter(g=>g.ns[0]*best.ns[0]+g.ns[1]*best.ns[1]>0&&dist(g,best.b0)<40*kq):[];
    if(gs.length&&(!best||best.o>0||same.length||inPad(best.r))){const a=best?best.b0:pl[k0],pool=same.length?same:gs;pool.reduce((m,g)=>dist(g,a)<dist(m,a)?g:m,pool[0]).uids.push(...uids);return}
    if(!best)return;placed.push(best.r);(B.shootGeo=B.shootGeo||[]).push({uids,kid,pts:best.pts,base:best.b0,ns:best.ns,tip:best.tip,route:[...best.pts.slice().reverse(),...routeOf(best.kk)]})};
   const tdown=k=>tp.slice(0,k+1).reverse();
   /* the knots with most checks first, so a crowded stretch keeps the shoot that holds most */
   const cnt=ids=>ids.reduce((n,id)=>n+own(id).length,0),ks=T.knots.map(kn=>({kn,uids:kn.ids.filter(id=>own(id).length)})).filter(o=>o.uids.length).sort((a,b)=>cnt(b.uids)-cnt(a.uids)||a.kn.t-b.kn.t||a.kn.k-b.kn.k);
   for(const {kn,uids} of ks){const b=kn.bid?T.br.find(x=>x.id===kn.bid):null,bs={p:sh(kn.bp),side:kn.side,rb:kn.rb};
    if(b){const bp=b.pts.map(sh);grow1(bp,kn.k,b.w,uids,kn.id,kk=>[...bp.slice(0,kk+1).reverse(),...tdown(b.k)],2,0,bs)}
    else grow1(tp,kn.k,T.tw,uids,kn.id,tdown,2,0,bs)}
   /* never from the soil or the flare: a root's sucker leaves the trunk above a fifth of its height, on the root's side where
      the trunk runs straight there */
   const lowK=Math.round(.2*(tp.length-1));
   for(const r of L.roots){if(!r.id||r.tree!==ti||!own(r.id).length)continue;
    grow1(tp,Math.round(.24*(tp.length-1)),T.tw,[r.id],r.id,kk=>[...tdown(kk),...r.pts.slice(0,Math.floor(r.pts.length*.6))],lowK,r.d)}
   /* a changed part on no journey has no knot: its shoot comes from the leader, under the crown */
   const loose=Object.keys(M.buds).filter(id=>own(id).length&&!(B.shootGeo||[]).some(g=>g.uids.includes(id)));if(loose.length)grow1(tp,Math.round(.86*(tp.length-1)),T.tw,loose,'lead:'+ti,tdown,lowK)}
  T.knots.forEach((kn,ki)=>{const p0=sh(kn.p),n=kn.n;const many=kn.ids.length>1;const p=sh(kn.bp);
   /* A knot is a boss the wood grew round (gbTree sets it off the centre line on the outside of the bend, sizes it and swells
      the outline over it): the bark's own colour a step lighter, half again as long along the grain as across it, softly lit
      on its upper left, with a shadow only along its lower crescent away from the light, and the grain parting round it. Lit,
      it glows from inside, softly, its size and place its own, never a coin laid on the wood */
   const ra=kn.ra,rb=kn.rb,ang=Math.atan2(n[1],n[0])*180/Math.PI+90,tg=[n[1],-n[0]];
   const lx=-.6*tg[0]-.8*tg[1],ly=-.6*n[0]-.8*n[1];const lo=[tg[0]*lx*ra*.32+n[0]*ly*rb*.42,tg[1]*lx*ra*.32+n[1]*ly*rb*.42];
   const E=(c,a,b,cls)=>sv('ellipse',{cx:gbF(c[0]),cy:gbF(c[1]),rx:gbF(a),ry:gbF(b),transform:'rotate('+gbF(ang)+' '+gbP(c)+')',class:cls});
   /* the crescent: a thin shadow along the body's edge on the side away from the light, thickest at its middle */
   const t0=Math.atan2(-ly/rb,-lx/ra),at2=(t,k,dx)=>{const c=Math.cos(t)*ra*k,d=Math.sin(t)*rb*k;return [p[0]+tg[0]*c+n[0]*d+lo[0]*dx,p[1]+tg[1]*c+n[1]*d+lo[1]*dx]},cres=[];
   for(let i=0;i<=10;i++)cres.push(at2(t0-1.3+2.6*i/10,1,0));for(let i=10;i>=0;i--)cres.push(at2(t0-1.3+2.6*i/10,.84,.45));
   const cr=[[-1,0],[-.45,.55],[0,-.45],[.45,.5],[1,0]].map(([u,v])=>[p[0]+tg[0]*u*(ra+4)+n[0]*v*2.2,p[1]+tg[1]*u*(ra+4)+n[1]*v*2.2]);
   const u=M.U[kn.id];const names=kn.ids.map(id=>(M.U[id]||{}).label||id);
   const glow=E(p,ra*1.8,rb*1.9,'halo');glow.setAttribute('clip-path','url(#'+clipId+')');
   const g=sv('g',{class:'kn'+(many?' burl':''),'data-k':'u:'+kn.id,tabindex:-1,role:'button','aria-label':many?names.length+' parts of the change, grown together: '+names.join(', '):(u?u.label:kn.id)+', a part of the change'},
    E(p,ra,rb,'k1'),E([p[0]+lo[0],p[1]+lo[1]],ra*.7,rb*.58,'k2'),sv('path',{d:gbLine(cres)+'Z',class:'kc'}),glow,E(p,ra+2.4,rb+2.4,'ring'),sv('path',{d:gbLine(cr),class:'crack'}),
    sv('circle',{cx:gbF(p[0]),cy:gbF(p[1]),r:Math.max(9,ra+3),class:'hitc'}));
   g.__geo={p,p0,n,tg,ra,rb,side:kn.side,off:kn.off,w:kn.w};{const kb2=kn.bid?T.br.find(x=>x.id===kn.bid):null;g.__route=kb2?[...kb2.pts.slice(0,kn.k+1).map(sh).reverse(),...tp.slice(0,kb2.k+1).reverse()]:tp.slice(0,kn.k+1).reverse()}
   g.__ids=kn.ids;(kn.bid?JG[kn.bid]:gKn).append(g);for(const id of kn.ids){B.knot[id]=g;B.pos[id]=p0}B.nav.push('u:'+kn.id);B.navEl['u:'+kn.id]=g;g.__n=n;g.__w=kn.w;g.__on=kn.on;
   /* a knot shows once the growing wood has reached it: on a branch, where along the branch it sits */const kb=kn.on==='t'?null:T.br.find(x=>'b'+x.i===kn.on);let kt=at(kn.on==='t'?kn.t:kb?kb.h:0)+200;if(kb&&kb.acc){let ii=0,bd=1e9;kb.pts.forEach((q,i2)=>{const dd=Math.hypot(q[0]+X-p0[0],q[1]-p0[1]);if(dd<bd){bd=dd;ii=i2}});const f=kb.acc[ii]/(kb.acc[kb.acc.length-1]||1);kt=at(kb.h)+(380+1.5*kb.len)*(1-Math.pow(1-Math.min(1,f+.03),1/2.2))+60}anim('kn:'+kn.id+gk,g,kt,300,'fade');(B.kgk=B.kgk||{})[kn.id]=gk;
   if(u){const txt=gwCut(u.label,many?16:24)+(many?' +'+(kn.ids.length-1)+(kn.ids.length>2?' parts':' part'):'');
    /* A name goes on open ground beside its knot; every name on the tree is placed in one pass once everything it must
       keep clear of is known (gbKnotNames, after the pads, names and numbers are drawn) */
    (B.klq=B.klq||[]).push({id:kn.id,tree:ti,p,p0,n,tg,ra,rb,txt,w:kn.w,bid:kn.bid})}});
  /* Max: an existing flow the change reaches re-checks a part and grows nothing of its own: a graft bud, a small ring set into
     the bark by that part's knot, in a row along the grain either side of the boss, clear of every other knot; five at most,
     the knot's card counts them all. A root's sit on the root out from the flare; a part on neither, on the leader */
  if(!sap&&!ti){B.graftR=[];const by=new Map(),oth=T.knots.map(q=>[sh(q.bp),q.ra,q]);
   for(const uid in M.buds)for(const x of M.buds[uid])if(x.scenarioKind==='regression'){const id=x.unit||uid,kn=T.knots.find(q=>q.ids.includes(id)),rt=!kn&&L.roots.find(r=>r.id===id&&r.tree===ti),kk=kn?'k:'+kn.id:rt?'r:'+id:'';if(!by.has(kk))by.set(kk,[]);by.get(kk).push(x)}
   for(const [kk,xs] of by){const kn=kk[0]==='k'?T.knots.find(q=>'k:'+q.id===kk):null,rt=kk[0]==='r'?L.roots.find(r=>'r:'+r.id===kk):null,b=kn&&kn.bid?T.br.find(x=>x.id===kn.bid):null;
    const P=b?b.pts.map(sh):rt?rt.pts:tp,W=b?b.w:rt?rt.w:T.tw,acc=gbLen(P),k0=kn?kn.k:Math.round((rt?.3:.8)*(P.length-1)),R=2.1,off=kn?kn.off*.6:0,gap=kn?kn.ra+R+1.7:0;
    const at=s0=>{const d=acc[k0]+s0;if(d<4||d>acc[acc.length-1]-4)return null;let j=1;while(j<P.length-1&&acc[j]<d)j++;const f=Math.min(1,(d-acc[j-1])/((acc[j]-acc[j-1])||1)),nn=gbNorm(P,j),wj=W[j-1]+(W[j]-W[j-1])*f;if(wj<2*R+2.4)return null;
     const o=Math.max(-(wj/2-R-1.2),Math.min(wj/2-R-1.2,off));return [P[j-1][0]+(P[j][0]-P[j-1][0])*f+nn[0]*o,P[j-1][1]+(P[j][1]-P[j-1][1])*f+nn[1]*o]};
    /* evenly strung, each as clear of the boss as of the next; where the wood between its neighbours is short, the first
       tucked against the boss's own rim, then closer together. A side that meets another knot is full: a bud never stands
       past a neighbour, nearer it than its own */
    const kel=kn&&B.knot[kn.ids[0]],route=kel?kel.__route:P.slice(0,k0+1).reverse(),want=Math.min(5,xs.length);let done=[];
    for(const [gb,g] of [[1.7,1.7],[.9,.9],[-1,.9],[-1,.3]]){const got=[],full={};
     for(let st=0;got.length<want&&st<16;st++){const sd=st%2?-1:1;if(full[sd])continue;const c=at(sd*(gap-1.7+gb+Math.floor(st/2)*(2*R+g)));
      if(!c||oth.some(([q,r,o])=>o!==kn&&Math.hypot(q[0]-c[0],q[1]-c[1])<r+R+.6)){full[sd]=1;continue}if(got.some(q=>Math.hypot(q[0]-c[0],q[1]-c[1])<2*R+.2))continue;got.push(c)}
     if(got.length>done.length)done=got;if(done.length>=want)break}
    done.forEach((c,i)=>B.graftR.push({c,r:R,xid:xs[i].id,kid:kn?kn.id:rt?rt.id:'lead',tree:ti,par:kn&&kn.bid?JG[kn.bid]:gKn,route:[c,...route]}))}}
  /* veins: the route each pad's sap takes, shown live while its journey runs and traced on hover */
  for(const pid of T.lanes){const v=T.veins[pid];const tr=v.trunk.map(sh),bp=v.branch.map(sh);const o=sh(v.pad);const all=gbSmooth([...tr,...bp],2);
   const p1=sv('path',{d:gbLine(all),class:'vein'});gVein.append(p1);B.vein[pid]={els:[p1],jid:v.jid,pts:all,pad:o,tree:ti}}
  /* Pads, and their labels. Each cushion is a dense heap of clumps of foliage, every clump lit on its top and shaded beneath,
     the shoulders a step darker than the crest. The wood it grew from shows only through its lower edge, fading out a third of
     the way up. The leaves lie over it, and a tuft of foliage in front of each leaf's foot tucks its stalk in. */
  T.padList.forEach((pd,pi)=>{const o=sh(T.origin[pd.id]),g=pd.geo,jid=pd.jid;const back=pd.b&&pd.b.back;const jg=JG[pd.id];
   const shape=g.shape;const q0=shape(()=>true),pk='gb-pk'+N+'-'+ti+'-'+pi;
   const els={ghost:sv('path',{class:'pghost',d:gbPadD(o,q0)}),clip:sv('path',{d:gbPadD(o,q0)})};defs.append(sv('clipPath',{id:pk},els.clip));
   const wm=sv('mask',{id:pk+'w',maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)});defs.append(wm);
   const cu=g.cs.map((c,k)=>{const d=gbCushD(o,q0.cs[k]),X=o[0]+c.x,Y=o[1]+c.b,ck=pk+'-'+k,cr=c.role==='crest'?'cr':'sh';defs.append(sv('clipPath',{id:ck},sv('path',{d})));
    const clu=sv('g',{'clip-path':'url(#'+ck+')',class:'pclu'});for(const [x,y,r] of c.body)clu.append(sv('circle',{cx:gbF(X+x),cy:gbF(Y+y),r:gbF(r),fill:'url(#'+padG+cr+')'}),sv('path',{class:'pcs',d:'M'+gbP([X+x-r*.92,Y+y+r*.38])+' A'+gbF(r)+' '+gbF(r)+' 0 0 0 '+gbP([X+x+r*.92,Y+y+r*.38])}));clu.append(sv('path',{class:'ptex',d,fill:'url(#'+padG+'s)'}));
    defs.append(sv('linearGradient',{id:ck+'g',gradientUnits:'userSpaceOnUse',x1:'0',y1:gbF(Y),x2:'0',y2:gbF(Y-c.h*.34)},sv('stop',{offset:0,'stop-color':'#fff'}),sv('stop',{offset:1,'stop-color':'#fff','stop-opacity':0})));
    const wb=sv('path',{d,fill:'url(#'+ck+'g)'});wm.append(wb);return {el:sv('g',{class:'cush c'+cr},sv('path',{class:'pfill',d}),clu),wb}});
   /* the wood under the foliage, seen only through the cushions' lower edge, in the same bark as outside them (lit on one
      side, shaded on the other), so a limb runs on into its pad in one colour with no edge where it goes in; a leaf's twig
      goes with its leaf */
   const pw=sv('g',{class:'pwg',mask:'url(#'+pk+'w)'}),lt=B.ltw=B.ltw||{},pwc=sv('clipPath',{id:pk+'c'}),pwl=sv('g',{'clip-path':'url(#'+pk+'c)',filter:'url(#'+softId+')'});defs.append(pwc);
   const wd=(pts,w,id,bx)=>{const d=gbRib(pts,w,0,pts.length-1,undefined,bx),e=sv('path',{class:'pwd',d});pw.append(e);if(id)(lt[id]=lt[id]||[]).push(e);else{pwc.append(sv('path',{d}));if(w[0]>2.4)shade(pts,w,0,pwl)}};
   if(pd.b){wd(pd.b.pts.map(sh),pd.b.w,null,pd.b.bx);for(const t of pd.b.twigs)wd(t.pts.map(sh),t.w,t.id)}else{wd(tp,T.tw,null,T.bx);for(const t of T.ctw)wd(t.pts.map(sh),t.w,t.id)}pw.append(pwl);
   const mk=sv('path',{d:gbPadD(o,q0),fill:'#666'});rMask.append(mk);
   const pg=sv('g',{class:'pad'+(pd.crown?' crown':'')+(back?' back':''),'data-k':'j:'+jid,'data-pad':pd.id,tabindex:-1,role:'button'},els.ghost,...cu.map(q=>q.el),pw,sv('ellipse',{cx:gbF(o[0]),cy:gbF(o[1]-5),rx:6,ry:4.6,class:'bud0'}));
   jg.append(pg);const lg=sv('g',{});jg.append(lg);const tg=sv('g',{class:'ptufts','clip-path':'url(#'+pk+')'});jg.append(tg);const tf=B.tuft=B.tuft||{};
   /* the foliage in front of a leaf's foot: two small clumps, so the blade tucks into the cushion instead of sitting on it */
   for(const [id,q] of g.tuft){const k=g.cs[g.cOf.get(id)].role==='crest'?'cr':'sh',x=o[0]+q[0],y=o[1]+q[1],r=q[3]*1.1,dx=q[2]*.3,iy=y-Math.sqrt(Math.max(1,r*r-dx*dx))+(gbHash('tf:'+id)-.5);
    tf[id]=sv('path',{class:'ptuft t'+k,fill:'url(#'+padG+'t'+k+')',d:'M'+gbF(x-dx-r)+' '+gbF(y)+' A'+gbF(r)+' '+gbF(r)+' 0 0 1 '+gbF(x)+' '+gbF(iy)+' A'+gbF(r)+' '+gbF(r)+' 0 0 1 '+gbF(x+dx+r)+' '+gbF(y)+' A'+gbF(dx+r)+' '+gbF(r*.8)+' 0 0 1 '+gbF(x-dx-r)+' '+gbF(y)+'Z'});tg.append(tf[id])}
   /* each cushion shows once its own twig has grown to it (the outer one once the branch has, the crest once the leader
      has); the pad starts with its first cushion */
   const ce=(B.cEnd||{})[pd.id]||{},cT=q0.cs.map((c,k)=>ce[k]!==undefined?ce[k]:pd.b?(ce.br!==undefined?ce.br:at(pd.b.h)+380+1.5*pd.b.len):tS+tdur);
   const delay=Math.min(...cT),cdl=cT.map(t=>t-delay),cAbs=cT.map(t=>now+t);
   /* the wood a leaf's sap runs through on its way down: its own twig, then its branch (or, for the crown, the leader or a
      branchlet off it) and the trunk */
   const lts={};for(const t of pd.b?pd.b.twigs:T.ctw)if(t.id)lts[t.id]={pts:t.pts.map(sh),bi:t.bi,c:t.c?{pts:t.c.pts.map(sh),bi:t.c.bi}:null};
   const rt={tp,br:pd.b?pd.b.pts.map(sh):null,bw:pd.b?pd.b.w[pd.b.exit]:0,exit:pd.b?pd.b.exit:0,k:pd.b?pd.b.k:tp.length-1,lt:lts};
   B.pad[pd.id]={el:pg,jg,o,geo:g,jid,pol:pd.pol,crown:pd.crown,b:pd.b,lg,tg,leaves:pd.leaves,delay,cdl,cAbs,gk,tree:ti,shape,els,cu,mk,sk:'*',rt,q0};(B.padsOf[jid]=B.padsOf[jid]||[]).push(pd.id);
   /* a cushion opens out of the tip of its twig: each one has its own reveal in a mask over the pad, so a cushion never
      stands in the air while the twig that carries it is still growing */
   if(!quiet){gbT('pad:'+pd.id+gk,delay);const last=Math.max(...cT);if(last>-330){const mid='gb-pm'+N+'-'+pd.id,m=sv('mask',{id:mid,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)});
     q0.cs.forEach((c,k)=>{if(!c.on)return;const e=sv('path',{d:gbCushD(o,c),fill:'#fff',stroke:'#fff','stroke-width':7,'stroke-linejoin':'round'});e.style.transformBox='fill-box';e.style.transformOrigin='50% 100%';m.append(e);
      if(cT[k]>-300)B.anim.push([e,cT[k],300,'pop'])});
     defs.append(m);pg.setAttribute('mask','url(#'+mid+')');tg.setAttribute('mask','url(#'+mid+')');setTimeout(()=>{if(pg.getAttribute('mask')==='url(#'+mid+')'){pg.removeAttribute('mask');tg.removeAttribute('mask')}m.remove()},Math.max(0,last+330))}}
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
function gbLeafEl(x,L,W,hang){const inner=sv('g',{class:'gb-lfi'},sv('circle',{r:gbF(Math.max(12,L*.62)),class:'hitc'}),sv('path',{d:gbLeafD(L+2.6,W+2.4),class:'halo'}),sv('path',{d:'M'+gbF(-L/2-GB_PET)+' 0 L'+gbF(-L/2+1.5)+' 0',class:'pet'}),sv('path',{d:gbLeafD(L,W),class:'blade bn'}),sv('path',{d:gbLeafBite(L,W),class:'blade bb'}),sv('path',{d:gbLeafBite(L,W,true),class:'nec'}),
  sv('path',{d:'M'+gbF(-L/2+1.6)+' 0 L'+gbF(L/2-2.4)+' 0',class:'rib'}));
 const st=-L/2-GB_PET;const el=sv('g',{class:'gb-lf','data-k':'s:'+x.id,tabindex:-1,role:'button'},inner,
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
 /* Max's shoots and graft buds are laid out with the wood, so the parts with checks of their own and the flows each re-checks key it too */
 const bk=Object.keys(M.buds).sort().map(u=>{const l=M.buds[u],r=l.filter(x=>x.scenarioKind==='regression').length;return u+(l.length>r?'o':'')+Math.min(5,r)}).join(',');
 const key=(sap?'sap:'+s.units.map(u=>u.id).join(','):M.trees.map(t=>t.js.map(j=>j.id+'='+j.units.join('+')+'#'+pc(M.leaves[j.id])).join(';')).join('|'))+'|jin='+M.jin.map(u=>u.id).join(',')+'|'+M.strays.map(u=>u.id).join(',')+'|'+(s.stops.map(x=>x.unit).join(','))+'|b='+bk+'|w='+width;
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
    el.style.transform='translate('+gbF(P.o[0]+sl[0])+'px,'+gbF(P.o[1]+sl[1])+'px) rotate('+gbF(sl[2])+'deg)'+(sl[3]&&sl[3]!==1?' scale('+sl[3]+')':'');
    const im=inMode(x);const was=el.__in;el.__in=im;let cls='gb-lf '+gbLeafState(x)+(sl[4]?' hang':'');const add=!im&&!!pv&&gbRank[x.mode]<=gbRank[pv];
    /* pruning: a leaf the chosen mode drops falls once, one after another, then only its cut stem is left */
    if(add)cls+=' pv-add';else if(!im){if(was===true&&!quiet){el.__cutAt=Date.now();el.__lag=Math.min(i*40,400);const st=el.__inner.style;st.animationDelay=(el.__lag+60)+'ms';if(el.__nick)el.__nick.style.animationDelay=el.__lag+'ms';
      /* it is cut at its stalk, so it tips about that point before it drops */
      {const R=Math.max(12,g.L*.62),ps=-g.L/2-GB_PET,mn=Math.min(-R,ps);st.transformOrigin=gbF(ps-mn+1.5)+'px '+gbF(R)+'px'}
      /* it drops and drifts in screen space, so the leaf's own angle is taken out of the fall */
      const a=sl[2]*Math.PI/180,sc=sl[3]||1,h=gbHash('fall:'+x.id),fx=(h-.5)*24,fy=80+60*gbHash('drop:'+x.id);
      st.setProperty('--fx',gbF((fx*Math.cos(a)+fy*Math.sin(a))/sc)+'px');st.setProperty('--fy',gbF((-fx*Math.sin(a)+fy*Math.cos(a))/sc)+'px');st.setProperty('--fr',gbF((h<.5?-1:1)*(15+20*gbHash('spin:'+x.id)))+'deg');
      setTimeout(()=>{if(el.__in===false){el.classList.replace('cut','gone');gbPaint()}},1000+el.__lag)}
     cls+=el.__cutAt&&Date.now()-el.__cutAt<980+(el.__lag||0)?' cut pv-out':' gone'}else{el.__cutAt=0;el.__inner.style.animationDelay='';el.__inner.style.transformOrigin=''}
    if(pv&&!add){const keep=gbRank[x.mode]<=gbRank[pv];cls+=keep?' pv-in':' pv-out';if(!keep)cutN++}
    el.setAttribute('class',cls);el.setAttribute('aria-label','Scenario: '+x.title+', '+gbStateWord(x).t);
    if(im)kept.add(x.id);if(im||add)grown.add(x.id);
    /* a leaf that has gone takes its twig and the tuft at its foot with it */
    {const gone=cls.includes(' gone');for(const e of (B.ltw||{})[x.id]||[])e.classList.toggle('gone',gone);const tf=(B.tuft||{})[x.id];if(tf)tf.classList.toggle('gone',gone)}
    if(im){shown++;if(s.run[x.id]&&s.run[x.id].st==='fail')failed=true}});
   /* a pad the mode keeps nothing of is cut back: once its leaves have fallen, the branch drops away and leaves a stub */
   /* a cushion stays while it holds a leaf the mode keeps, and shrinks away when it holds none; a previewed mode's extra
      growth shows as a faint outline behind */
   const kk=[...kept].join(','),gk=[...grown].join(',');if(P.sk!==kk+'|'+gk){P.sk=kk+'|'+gk;const q=P.shape(id=>kept.has(id)),d=gbPadD(P.o,q);
    q.cs.forEach((c,k)=>{const u=P.cu[k];u.el.classList.toggle('off',!c.on);u.wb.style.display=c.on?'':'none'});
    P.els.clip.setAttribute('d',d);if(P.rcp)P.rcp.setAttribute('d',d);P.mk.setAttribute('d',d);P.els.ghost.setAttribute('d',gk===kk?d:gbPadD(P.o,P.shape(id=>grown.has(id))))}
   /* a pruned leaf leaves a scar where it grew: the stub of its own twig, cut a few units from the wood with its pale face
      showing (the legend's mark), on the crest, a shoulder or under the pad alike. One scar per pruned scenario, so the
      "+N pruned" under the name can be counted on the tree. */
   {B.scar=B.scar||{};for(const x of list){const el=B.leaf[x.id],t=P.rt.lt[x.id];if(!el||!t)continue;
    const on=el.classList.contains('gone');let sc=B.scar[x.id];if(!on){if(sc)sc.classList.remove('on');continue}
    if(!sc){const p=t.pts,a=p[0];let j=1;while(j<p.length-1&&Math.hypot(p[j][0]-a[0],p[j][1]-a[1])<7)j++;const e=p[j],m=Math.hypot(e[0]-a[0],e[1]-a[1])||1,u=[(e[0]-a[0])/m,(e[1]-a[1])/m],n=[-u[1],u[0]],w0=1.7,w1=1.3,ang=Math.atan2(u[1],u[0])*180/Math.PI;
     const d='M'+gbP([a[0]+n[0]*w0,a[1]+n[1]*w0])+' L'+gbP([e[0]+n[0]*w1,e[1]+n[1]*w1])+' L'+gbP([e[0]-n[0]*w1,e[1]-n[1]*w1])+' L'+gbP([a[0]-n[0]*w0,a[1]-n[1]*w0])+'Z';
     sc=sv('g',{class:'scar','data-k':'s:'+x.id,'data-pad':pid,tabindex:-1,role:'button'},sv('path',{d,class:'sw'}),sv('ellipse',{cx:gbF(e[0]),cy:gbF(e[1]),rx:1.1,ry:1.5,transform:'rotate('+gbF(ang)+' '+gbP(e)+')',class:'cutf'}),sv('circle',{cx:gbF(e[0]),cy:gbF(e[1]),r:9,class:'hitc'}));P.lg.append(sc);B.scar[x.id]=sc}
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
 for(const uid in M.buds){const g=B.budG[uid];if(g)g.list.push(...M.buds[uid].filter(x=>x.scenarioKind!=='regression'))}
 for(const g of new Set(Object.values(B.shoots))){const list=gbOrd(g.list);
  /* a shoot that took in its crowded neighbours carries a leaf more, and says how many more checks it holds */
  {const n=Math.min(4,Math.max(3,list.length));if(g.n!==n){g.n=n;g.slots=gbShootSlots(g.pts,n);g.list0=null}
   /* the count of checks its leaves do not show: a small tag past its own tip, tied to it, where the one placement pass put it
      (gbKnotNames); with no clear place it is left off, and the shoot's last leaf says how many more */
   if(!g.cnt){const at=g.cntAt;g.cnt=sv('text',{class:'shn',x:gbF(at?at.x:0),y:gbF(at?at.y:0),'text-anchor':'middle'},'');
    g.ctag=at?sv('g',{class:'shtag'},sv('path',{class:'shtie',d:'M'+gbP(at.tie[0])+' L'+gbP(at.tie[1])}),sv('rect',{x:gbF(at.r[0]),y:gbF(at.r[1]),width:gbF(at.r[2]-at.r[0]),height:gbF(at.r[3]-at.r[1]),rx:gbF((at.r[3]-at.r[1])/2)}),g.cnt):sv('g',{class:'shtag',style:'display:none'},g.cnt);g.g.append(g.ctag)}
   g.cnt.textContent=list.length>n?'+'+(list.length-n):'';g.ctag.style.display=g.cntAt&&list.length>n?'':'none'}
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
 /* the existing flows: each a graft bud at the knot it re-checks (gbBuild), ringed in its run's state, there while Max is; a
    mode that drops them lets them fade as its shoots fall */
 {const regs=Object.values(M.buds).flat().filter(x=>x.scenarioKind==='regression');B.grafts=B.grafts||{};
  for(const r of B.graftR||[]){const x=regs.find(q=>q.id===r.xid);if(!x)continue;let el=B.bud[x.id];
   if(!el){el=sv('g',{class:'gb-gr','data-k':'s:'+x.id,tabindex:-1,role:'button'},sv('circle',{cx:gbF(r.c[0]),cy:gbF(r.c[1]),r:gbF(Math.max(4.6,7/gbHf(B))),class:'hitc'}),sv('circle',{cx:gbF(r.c[0]),cy:gbF(r.c[1]),r:gbF(r.r),class:'ghalo'}),sv('circle',{cx:gbF(r.c[0]),cy:gbF(r.c[1]),r:gbF(r.r),class:'gring'}));
    el.__u=r.kid;el.__route=r.route;r.par.append(el);B.bud[x.id]=el;(B.grafts[r.kid]=B.grafts[r.kid]||[]).push(el);
    const now=performance.now(),tb=gbT('kn:'+r.kid+((B.kgk||{})[r.kid]||''),0)+300;if(!quiet&&el.animate&&now<tb+300)el.animate([{opacity:0},{opacity:1}],{duration:300,delay:Math.max(0,tb-now),fill:'backwards'})}
   const im=showBuds&&(inMode(x)||pv==='max'),cut=!!pv&&pv!=='max'&&inMode(x),was=el.__on;el.__on=im;
   if(im){if(el.__fade){el.__fade.cancel();el.__fade=null}}
   else if(was&&!quiet&&(!pvWas||chose)&&el.animate&&!el.__fade){const a=el.__fade=el.animate([{opacity:1},{opacity:0}],{duration:420,delay:200,easing:'ease-in',fill:'forwards'});a.onfinish=()=>{if(el.__fade===a){el.__fade=null;if(!el.__on)el.classList.add('gone')}a.cancel()}}
   el.setAttribute('class','gb-gr '+gbLeafState(x)+(im||el.__fade?'':' gone')+(im&&!inMode(x)?' pv-add':'')+((im&&cut)||el.__fade?' pv-out':''));
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
 const hk=gw.hov&&gw.hov.startsWith('u:')?gw.hov.slice(2):null;
 /* the names that show are placed together now (gbKnotNames): the knot pointed at, the leaf's own hop and a break first;
    one with no clear place stays off, and the card names the whole path */
 const want=new Map();for(const id in B.klbl){const kl=B.klbl[id],ids=B.knot[id]?B.knot[id].__ids:[id];
  const lit=on&&(ids.includes(hk)||(rootPart?ids.includes(rootPart.parent):ids.some(q=>litU.has(q)||unU.has(q)))),brk=(kl.classList.contains('wound')||kl.classList.contains('brk'))&&!kl.classList.contains('wmute');
  kl.__want=lit;if(lit||brk)want.set(id,ids.includes(hk)||brk||(!!L.leaf&&ids.includes(L.leaf.unit))?0:1)}
 const got=new Map();for(const run of B.kplace||[])for(const [id,g] of run(want))got.set(id,g);
 for(const id in B.klbl){const kl=B.klbl[id],ids=B.knot[id]?B.knot[id].__ids:[id],g=got.get(id);kl.__fit=!!g;kl.classList.toggle('nofit',!g);
  if(g){kl.setAttribute('x',gbF(g.x));kl.setAttribute('y',gbF(g.yb));kl.setAttribute('text-anchor',g.anc);kl.__r=g.r;if(kl.__ld)kl.__ld.setAttribute('d','M'+gbP(g.A)+' L'+gbP(g.R))}
  kl.classList.toggle('on',!!g&&kl.__want);kl.classList.toggle('unreached',on&&!ids.some(q=>litU.has(q))&&ids.some(q=>unU.has(q)))}
 for(const id in B.root){B.root[id].classList.toggle('hl',litU.has(id));B.root[id].classList.toggle('sel',gw.pinned==='u:'+id)}
 /* The route (gbRoute) for a leaf; for a root, the sap it sends up the trunk to each journey it feeds */
 let d='',dx='',dw='',df='';const x=L.leaf;const line=pts=>'M'+pts.map(gbP).join(' L');
 if(x){const R=R0||gbRoute(x);if(R){d=R.d;dx=R.dx;dw=R.dw;df=R.df||''}}
 else if(rootPart){const rr=B.L.roots.find(q=>q.id===L.part);if(rr){const up=rr.pts.slice().reverse();for(const jid of L.js){const pid=(B.padsOf[jid]||[]).find(q=>!B.pad[q].pol)||(B.padsOf[jid]||[])[0];const P=pid&&B.pad[pid];if(!P)continue;
   const sp=gbSpine(P.rt,P.o).slice().reverse();d+=(d?' ':'')+line(gbSmooth([...up,...sp],1))}if(!d)d=line(up)}}
 /* where a failing scenario broke stays red at rest, and for whatever is lit that holds it; a passing leaf's route, or a
    journey that does not hold the failure, shows no red */
 if(!x)for(const e of B.fails||[])if(woundOn(e)){const R=gbRoute(e.x);if(R&&R.dw)dw+=(dw?' ':'')+R.dw}
 /* the glow runs only where the sap ran: it ends at the break. Past it the route is round grey dots, each ringed dark so it
    reads on bark; the part of the journey a leaf's own scenario does not run is drawn faint */
 if(!B.sapF){B.sapF=sv('path',{class:'sap faint',d:''});B.sapXo=sv('path',{class:'sap resto',d:''});B.sapX.before(B.sapF,B.sapXo)}
 B.sapX.setAttribute('d',dx);B.sapXo.setAttribute('d',dx);B.sapF.setAttribute('d',df);B.sapW.setAttribute('d',dw);B.sapU.setAttribute('d',d);
 B.sap.setAttribute('d',d)}
/* The wood a leaf's sap runs through on its way down: from where its stalk meets its cushion, down the twig that carries
   that cushion (or, for the outer cushion, to the branch's end inside it), along the branch's centre line to the trunk
   (round a fillet as wide as the branch, not a corner), and down the trunk's centre line. Without a cushion it joins the
   branch straight below. */
function gbSpine(R,at,id){const T=id!==undefined&&R.lt?R.lt[id]:null;const into=(p,q)=>gbSmooth([p,[p[0]+(q[0]-p[0])*.2,(p[1]+q[1])/2],q],2);let mid,K=R.k;
 /* down the leaf's own twig, then the riser or branchlet it forks from, then its branch, or straight into the leader */
 if(T){mid=[at,...T.pts.slice(0,-1).reverse()];if(T.c){mid.push(...T.c.pts.slice(0,T.bi).reverse());if(R.br)mid.push(...R.br.slice(0,T.c.bi).reverse());else K=T.c.bi}else if(R.br)mid.push(...R.br.slice(0,T.bi).reverse());else K=T.bi}
 else if(R.br){let bi=R.br.length-1,bd=1e9;for(let i=R.exit;i<R.br.length;i++){const dd=Math.abs(R.br[i][0]-at[0]);if(dd<bd){bd=dd;bi=i}}mid=[...into(at,R.br[bi]),...R.br.slice(0,bi).reverse()]}
 else mid=into(at,R.tp[R.k]);
 const all=[...mid,...R.tp.slice(0,K).reverse()];if(!R.br)return all;const c=mid.length-1,r=Math.max(8,(R.bw||8)*1.1),a0=gbBack(all,c,r),a1=gbFwd(all,c,r);
 return [...all.slice(0,a0),...gbBez([all[a0],all[c],all[c],all[a1]],10),...all.slice(a1+1)]}
/* A scenario's route: its sap's way down to the last file its journey reaches, then out along every root the journey depends
   on. A failed scenario's route is gold as far as it ran, red where it broke (on that hop's knot, or just past it when a check
   after that hop failed, or the start of a root), and grey beyond, where it never ran. When the run does not say where it
   broke, only the leaf is red. A part check's route is the wood its shoot grows from. */
function gbRoute(x){const B=gw.B,M=gw.M,L=B.L;const el=B.leaf[x.id]||B.bud[x.id];if(!el)return null;const line=pts=>'M'+pts.map(gbP).join(' L');
 const j=M.J.find(q=>M.leaves[q.id].includes(x));
 if(!j){if(el.__route)return {d:line(gbSmooth(el.__route,1)),dx:'',dw:'',df:''};const g=el.__base&&B.budG[x.unit];return g?{d:line(gbSmooth(g.route,1)),dx:'',dw:'',df:''}:null}
 const P=B.pad[el.__p];const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)(?:\s*rotate\(([-\d.]+)deg\))?/.exec(el.style.transform);if(!m||!P||!P.rt)return null;
 const ra=m[3]?(+m[3])*Math.PI/180:0,k0=P.geo.L/2+GB_PET,at=[+m[1]-Math.cos(ra)*k0,+m[2]-Math.sin(ra)*k0];
 const r=gw.state.run[x.id],w=r&&r.st==='fail'?gbWound(M,j,x):null;
 let pts=gbSpine(P.rt,at,x.id);const rr0=j.units.filter(id=>B.root[id]).map(id=>B.L.roots.find(q=>q.id===id)).filter(Boolean);
 /* with no root to run out along, the route ends at the last file it reaches, not in the soil */
 if(!rr0.length){let last=-1;for(const id of j.units){const p=B.pos[id];if(!p||!B.knot[id])continue;let ci=0,bd=1e9;pts.forEach((q,i)=>{const dd=Math.hypot(q[0]-p[0],q[1]-p[1]);if(dd<bd){bd=dd;ci=i}});if(bd<16)last=Math.max(last,ci)}
  if(last>=0)pts=pts.slice(0,gbFwd(pts,last,w&&r.after?24:8)+1)}
 /* The trunk hands the route to a root where the root flares from it on the soil line: the route leaves the trunk's centre
    line above the soil and turns through a fillet onto the root's centre line. It never runs down into the soil, and inside
    the pot it keeps to the soil's top. */
 const at0=pts.length-1;let main=pts,rts=[];
 if(rr0.length){const sy=q=>L.sy?L.sy(q):0,p0=L.potC-L.potL/2,p1=L.potC+L.potL/2,inPot=q=>q[0]>p0&&q[0]<p1,xT=pts[at0][0];
  const J=rr0.map(rr=>{const k1=gbFwd(rr.pts,0,12),q=rr.pts[k1],lvl=Math.min(q[1],sy(q[0])-1.5),rad=Math.max(6,Math.min(14,Math.abs(q[0]-xT)));let iJ=at0;while(iJ>0&&pts[iJ][1]>lvl-rad)iJ--;return {rr,k1,q:[q[0],lvl],iJ}});
  const i0=Math.min(...J.map(o=>o.iJ));main=pts.slice(0,i0+1);
  rts=J.map(o=>{const a=pts[o.iJ],c=[a[0],o.q[1]];const rest=o.rr.pts.slice(o.k1+1).map(p=>inPot(p)?[p[0],Math.min(p[1],sy(p[0])-1.5)]:p);return {id:o.rr.id,pts:[...pts.slice(i0,o.iJ),...gbBez([a,c,c,o.q],8),...rest]}})}
 const all=()=>line(main)+rts.map(q=>' '+line(q.pts)).join('');
 /* which hops are the scenario's own: a happy path runs the whole journey; any other scenario runs from the journey's start
    to the hop it checks, and the rest of the journey is not its route */
 const ix=j.units.indexOf(x.unit),hop=ix>=0?{i:ix+1,n:j.units.length,label:(M.U[x.unit]||{}).label||x.unit}:null;
 const own=x.scenarioKind!=='happy'&&ix>=0&&ix<j.units.length-1?j.units.slice(0,ix+1):null;
 const nearI=(path,id)=>{const p=B.pos[id];if(!p)return -1;let ci=-1,bd=20;path.forEach((q,i)=>{const dd=Math.hypot(q[0]-p[0],q[1]-p[1]);if(dd<bd){bd=dd;ci=i}});return ci};
 const whole={d:all(),dx:'',dw:'',df:'',lit:new Set(j.units),un:new Set(),hop};
 if(!w){if(!own)return whole;
  if(B.root[x.unit])return {d:line(main)+rts.filter(t=>t.id===x.unit).map(t=>' '+line(t.pts)).join(''),df:rts.filter(t=>t.id!==x.unit).map(t=>line(t.pts)).join(' '),dx:'',dw:'',lit:new Set(own),un:new Set(),hop};
  let ci=-1;for(const id of own)if(!B.root[id])ci=Math.max(ci,nearI(main,id));if(ci<0)return whole;
  const acc=gbLen(main);let i1=acc.findIndex(v=>v>=acc[ci]+9);if(i1<0)i1=main.length-1;
  return {d:line(main.slice(0,i1+1)),df:[i1<main.length-1?line(main.slice(i1)):'',...rts.map(q=>line(q.pts))].filter(Boolean).join(' '),dx:'',dw:'',lit:new Set(own),un:new Set(),hop}}
 const wi=j.units.indexOf(w),lit=new Set(j.units.slice(0,wi+1)),un=new Set(j.units.slice(wi+1).filter(id=>!B.root[w]||!B.root[id]));
 if(B.root[w]){const q=rts.find(t=>t.id===w);if(!q)return whole;const acc=gbLen(q.pts),ci=acc.findIndex(v=>v>Math.max(24,acc[acc.length-1]*.45));
  return {d:line(main)+rts.filter(t=>t!==q).map(t=>' '+line(t.pts)).join(''),dw:line(q.pts.slice(0,ci<0?q.pts.length:ci+1)),dx:ci<0?'':line(q.pts.slice(ci)),df:'',lit:new Set(j.units),un:new Set(),hop}}
 const p=B.pos[w];if(!p)return whole;
 let ci=0,bd=1e9;main.forEach((q,i)=>{const dd=Math.hypot(q[0]-p[0],q[1]-p[1]);if(dd<bd){bd=dd;ci=i}});const acc=gbLen(main);
 const a0=r.after?acc[ci]+4:acc[ci]-9,a1=r.after?acc[ci]+20:acc[ci]+9;let i0=acc.findIndex(v=>v>=a0),i1=acc.findIndex(v=>v>=a1);if(i0<0)i0=main.length-1;if(i1<0)i1=main.length-1;
 return {d:line(main.slice(0,i0+1)),dw:i1>i0?line(main.slice(i0,i1+1)):'',dx:[i1<main.length-1?line(main.slice(i1)):'',...rts.map(q=>line(q.pts))].filter(Boolean).join(' '),df:'',lit,un,hop}}
/* Every file's name and every shoot's count, placed in one pass against one set of things to keep clear of: the wood (trunk,
   branches, twigs, roots), every cushion's outline and 4 px round it, every leaf with its stalk, the shoots and their
   leaves, the knots, the pot and the soil, the plant tags, and every other name and number. A count sits just off its
   shoot's tip. A name tries the eight compass points round its knot at three leader lengths, nearest first, and takes the
   first clear one; its leader runs from the middle of the name's near edge to the knot's rim, never shorter than 10 px, and
   no two names share a baseline within 24 px. A name with no clear place is left off rather than set far away or on
   foliage: the card names the whole path. */
function gbKnotNames(B,M,T,ti,V){const L=B.L,k=L.narrow?GB_NK:1,X=V.X,sh=q=>[q[0]+X,q[1]];
 const caps=[],rects=[V.potBox],labs=[],cush=[],lines=[],bases=[];const cap=(a,b,r,tag,own)=>caps.push({a,b,r,tag,own});
 const chain=(pts,w,pad,tag)=>{for(let i=0;i<pts.length-1;i++)cap(pts[i],pts[i+1],Math.max(w[i]||1,w[i+1]||1)/2+pad,tag||'wood')};
 chain(V.tp,T.tw,3);for(const b of T.br||[]){chain(b.pts.map(sh),b.w,3);for(const t of b.twigs||[])chain(t.pts.map(sh),t.w,2.5)}
 for(const t of T.ctw||[])chain(t.pts.map(sh),t.w,2.5);for(const r of L.roots||[])if(r.tree===undefined||r.tree===ti)chain(r.pts,r.w,2);
 for(const id in B.pad){const P=B.pad[id];if(P.tree!==ti)continue;const o=P.o,q=P.q0;
  if(q)for(const c of q.cs){if(c.on===false||!c.top||!c.top.length)continue;cush.push({x0:o[0]+c.x0,x1:o[0]+c.x1,top:c.top.map(t=>[o[0]+t[0],o[1]+t[1]]),bot:c.bot.map(t=>[o[0]+t[0],o[1]+t[1]])})}
  const g=P.geo;if(g&&g.slot)for(const [,sl] of g.slot){const c=[o[0]+sl[0],o[1]+sl[1]],th=(sl[2]||0)*Math.PI/180,u=[Math.cos(th),Math.sin(th)],Lf=g.L*(sl[3]||1),st=Lf/2+GB_PET;
   cap([c[0]-u[0]*st,c[1]-u[1]*st],[c[0]+u[0]*Lf/2,c[1]+u[1]*Lf/2],7,'leaf');cap(c,c,10,'leaf')}}
 const myK=new Set((T.knots||[]).map(kn=>kn.id)),shoots=[...new Set(B.shootGeo||[])].filter(g=>myK.has(g.kid));
 /* a shoot holds three or four of its part checks as leaves (gbPaint sets them the same way) */
 const own=id=>(M.buds[id]||[]).filter(x=>x.scenarioKind!=='regression'),nOn=g=>{const c=(g.uids||[]).reduce((a,id)=>a+own(id).length,0);return {c,n:Math.min(4,Math.max(3,c))}};
 for(const g of shoots){g.slots=gbShootSlots(g.pts,nOn(g).n);for(let i=0;i<g.pts.length-1;i++)cap(g.pts[i],g.pts[i+1],6,'shoot',g.kid);for(const q of g.slots)cap([q[0],q[1]],[q[0],q[1]],11,'shoot',g.kid)}
 /* graft buds on the knots */
 for(const r of B.graftR||[])if(r.tree===ti)cap(r.c,r.c,r.r+3,'shoot')
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
 const clear=r=>{if(r[0]<V.vx+3||r[2]>V.vx+V.W-3||r[1]<V.vy+2||r[3]>soil(r))return false;for(const q of rects)if(ovR(r,q))return false;
  const rI=[r[0]-12*k,r[1]-6*k,r[2]+12*k,r[3]+6*k];for(const q of labs)if(ovR(rI,q))return false;
  for(const c of caps)if(dSR(c.a,c.b,r)<c.r)return false;for(const c of cush)if(cushHit(c,r,4))return false;for(const [a,b] of lines)if(dSR(a,b,r)<2)return false;return true};
 const segX=(a,b,c,d)=>{const o=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));return o(a,b,c)!==o(a,b,d)&&o(c,d,a)!==o(c,d,b)};
 const leadOK=(R,A,id)=>{for(const q of labs)if(dSR(R,A,q)<1)return false;for(const c of caps){if(c.tag==='wood'||c.own===id)continue;if(c.tag==='knot'?dSR(c.a,c.b,[Math.min(R[0],A[0]),Math.min(R[1],A[1]),Math.max(R[0],A[0]),Math.max(R[1],A[1])])<c.r&&dPS(c.a,R,A)<c.r:dPS(c.a,R,A)<c.r-3&&dPS(c.b,R,A)<c.r-3)return false}
  for(let i=1;i<10;i++){const t=i/10,p=[R[0]+(A[0]-R[0])*t,R[1]+(A[1]-R[1])*t];for(const c of cush)if(cushHit(c,[p[0],p[1],p[0],p[1]],2))return false}
  for(const [a,b] of lines)if(segX(R,A,a,b))return false;return true};
 const baseOK=(r,yb)=>!bases.some(([y2,r2])=>Math.abs(yb-y2)<7*k&&Math.max(r2[0]-r[2],r[0]-r2[2])<24*k);
 /* A shoot's count of the checks its leaves do not show: a small tag just past its own tip, tied to it by a hairline, on
    the open side; it keeps clear of every name, mark and leader like a name does */
 const fs2=9.5*k,cw2=.6*fs2;
 for(const g of shoots){const {c,n}=nOn(g),more=c-n;g.cntAt=false;if(more<=0)continue;
  const txt='+'+more,tw=txt.length*cw2,pw=3*k,ph=2*k,q=g.pts[g.pts.length-1],q0=g.pts[Math.max(0,g.pts.length-3)],m=Math.hypot(q[0]-q0[0],q[1]-q0[1])||1,d=[(q[0]-q0[0])/m,(q[1]-q0[1])/m];
  for(const R of [4,7,11,16]){for(const a of [0,-30,30,-60,60,-95,95]){const th=a*Math.PI/180,u=[d[0]*Math.cos(th)-d[1]*Math.sin(th),d[0]*Math.sin(th)+d[1]*Math.cos(th)],A=[q[0]+u[0]*(R+2)*k,q[1]+u[1]*(R+2)*k];
    /* the tag's near edge sits on the end of the tie */
    const W2=tw+2*pw,H2=.78*fs2+2*ph,cx=A[0]+u[0]*W2/2,cy=A[1]+u[1]*H2/2,r=[cx-W2/2,cy-H2/2,cx+W2/2,cy+H2/2],yb=cy+.3*fs2;
    if(clear(r)&&baseOK(r,yb)&&leadOK(A,[q[0]+u[0]*1.5,q[1]+u[1]*1.5],g.kid)){g.cntAt={x:cx,y:yb,anc:'middle',r,tie:[[q[0]+u[0]*1.2,q[1]+u[1]*1.2],A]};labs.push(r);bases.push([yb,r]);lines.push(g.cntAt.tie);break}}if(g.cntAt)break}}
 /* The names. Only the names of what is lit show, so they are placed when the lighting changes (gbLight calls run), each
    against everything above and the names placed before it: the knot pointed at, the leaf's own hop and a break first,
    then the knot with fewest clear places, so a crowded run of knots on one branch shares the open ground. Each tries its
    places nearest first. */
 const fs=10*k,cw=.62*fs,D8=[[1,0],[.7071,-.7071],[0,-1],[-.7071,-.7071],[-1,0],[-.7071,.7071],[0,1],[.7071,.7071]];
 const places=e=>{const tw=e.txt.length*cw;let v=[e.p[0]-e.p0[0],e.p[1]-e.p0[1]];const vm=Math.hypot(v[0],v[1]);v=vm>.5?[v[0]/vm,v[1]/vm]:[e.n[0],e.n[1]];
  const dirs=D8.slice().sort((a,b)=>(Math.acos(Math.max(-1,Math.min(1,a[0]*v[0]+a[1]*v[1])))-Math.acos(Math.max(-1,Math.min(1,b[0]*v[0]+b[1]*v[1]))))||(Math.abs(b[0])-Math.abs(a[0])));
  const rr=u=>1/Math.sqrt(Math.pow((u[0]*e.tg[0]+u[1]*e.tg[1])/e.ra,2)+Math.pow((u[0]*e.n[0]+u[1]*e.n[1])/e.rb,2));const out=[];
  for(const len of [12,24,36])for(const u of dirs){const R0=rr(u),A=[e.p[0]+u[0]*(R0+len*k),e.p[1]+u[1]*(R0+len*k)];let anc,x0,yb;
   if(Math.abs(u[0])>.38){anc=u[0]>0?'start':'end';x0=anc==='start'?A[0]+2:A[0]-2-tw;yb=A[1]+.28*fs}else{anc='middle';x0=A[0]-tw/2;yb=u[1]<0?A[1]-.22*fs-2:A[1]+.78*fs+2}
   out.push({anc,x:anc==='start'?x0:anc==='end'?x0+tw:x0+tw/2,yb,r:[x0-1.5,yb-.78*fs-1.5,x0+tw+1.5,yb+.22*fs+1.5],R:[e.p[0]+u[0]*(R0+1),e.p[1]+u[1]*(R0+1)],A})}return out};
 const base=[labs.slice(),bases.slice(),lines.slice()],free=new Map(Q.map(e=>[e.id,places(e).filter(c=>clear(c.r)&&leadOK(c.R,c.A,e.id))]));
 for(const e of Q){const kl=sv('text',{x:0,y:0,class:'klbl nofit'},e.txt),ld=sv('path',{class:'kld',d:''});kl.__fit=false;kl.__ld=ld;V.gKl.append(kl,ld);B.klbl[e.id]=kl}
 const run=want=>{labs.length=0;labs.push(...base[0]);bases.length=0;bases.push(...base[1]);lines.length=0;lines.push(...base[2]);const out=new Map();
  const P=Q.map((e,i)=>({e,i})).filter(o=>want.has(o.e.id)).sort((a,b)=>(want.get(a.e.id)-want.get(b.e.id))||(free.get(a.e.id).length-free.get(b.e.id).length)||(a.i-b.i));
  for(const {e} of P){const got=free.get(e.id).find(c=>clear(c.r)&&baseOK(c.r,c.yb)&&leadOK(c.R,c.A,e.id));if(!got)continue;out.set(e.id,got);labs.push(got.r);bases.push([got.yb,got.r]);lines.push([got.R,got.A])}
  return out};
 (B.kplace=B.kplace||[]).push(run)}
/* where a shoot's leaves sit: set alternately along it from just under halfway to near its tip, each a little smaller */
/* The legend's mark for an existing flow a Max grow re-checks, the graft bud .gb-gr on the tree: a ring set on a twig of bark
   (for the legend's row: it('graft','an existing flow it re-checks')) */
function gbGraftSw(){return gwSvg(16,12,sv('path',{d:'M1 8.6 C5 7.8 10 7.6 15 6.6',class:'stem'}),sv('circle',{cx:8,cy:7.4,r:3,class:'gr'}))}
function gbShootSlots(pts,n){const acc=gbLen(pts),tot=acc[acc.length-1]||1;return Array.from({length:n},(_,i)=>{const t=.42+(.9-.42)*(n===1?0:i/(n-1)),d=t*tot;let k=1;while(k<pts.length-1&&acc[k]<d)k++;
 const a=pts[k-1],b=pts[k],f=(d-acc[k-1])/((acc[k]-acc[k-1])||1),q=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],dir=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;return [q[0],q[1],dir+(i%2?50:-50),1-.22*i/Math.max(1,n-1)]})}
/* a pinned thing's card moves to the inspector: the floating card and its hairline both go */
function gbTipOff(B){if(B.tip)B.tip.hidden=true;if(B.lead)B.lead.setAttribute('d','')}
function gbHover(k,el){gw.hov=k||null;gbLight();if(k)gbTip(k,el);else gbPinTip()}
/* on a phone a tap pins, and the pinned thing keeps its card under the drawing until it is tapped again */
function gbPinTip(){const B=gw.B;if(!B)return;const k=B.L.narrow&&!gw.hov?gw.pinned:null;const el=k&&[...B.svg.querySelectorAll('[data-k]')].find(e=>e.getAttribute('data-k')===k);gbTip(el?k:null,el||null)}
/* A card beside the leaf, knot or root under the pointer: what it is, its state with evidence, and the path it crosses. */
function gbTip(k,el){const B=gw.B;if(!B||!B.tip)return;const tip=B.tip;const pid=el&&el.getAttribute&&el.getAttribute('data-pad');const P=pid&&B.pad[pid];
 /* a card docked in the side panel stands in for the panel's own content while it shows, never over it */
 const undock=()=>{const ins=tip.parentNode&&tip.parentNode.parentNode&&tip.parentNode.parentNode.nextElementSibling;if(ins)ins.classList.remove('gb-docked');tip.style.width=''};undock();
 const hide=()=>{tip.hidden=true;if(B.lead)B.lead.setAttribute('d','');if(tip.parentNode)tip.parentNode.style.paddingBottom=''};
 if(!k||!el||(k===gw.pinned&&!B.L.narrow)||(k.startsWith('j:')&&!(P&&(P.pol||P.pruned)))){hide();return}
 const s=gw.state,M=gw.M;/* a path breaks only between its hops */
 const pathOf=j=>{const parts=j.units.map(id=>M.U[id]).filter(Boolean);return gwHops([...parts.filter(u=>!u.root),...parts.filter(u=>u.root)].map(u=>u.label))};
 /* what Max checks at a knot beyond its journeys: the part checks on its shoot and the existing flows grafted on it */
 const maxOf=ids=>{const all=ids.flatMap(id=>M.buds[id]||[]),o=all.filter(x=>x.scenarioKind!=='regression').length,r=all.length-o;return o||r?h('div',{class:'st'},'In Max: '+[o?gwKW('own',o):'',r?gwKW('reg',r)+' that reach '+(ids.length>1?'them':'it'):''].filter(Boolean).join(' · ')):null};
 tip.replaceChildren();
 if(k.startsWith('s:')){const x=s.scenarios.find(q=>q.id===k.slice(2));if(!x){hide();return}const j=M.J.find(q=>M.leaves[q.id].includes(x));const w=gbStateWord(x),r0=s.run[x.id];
  gwPut(tip,h('span',{class:'k'},(j?{happy:'happy path',guard:'what it refuses',failure:'how it fails'}[gbPol(x)]:x.scenarioKind==='regression'?'existing flow':'part check')+(x.criteria.length?' · '+x.criteria.join(' '):'')),h('b',{},x.title),
   /* a failure says where it broke, in the same words as the list, then where on the route */
   r0&&r0.st==='fail'?h('div',{class:'st fail'},gwBroke(r0,140)):h('div',{class:'st '+w.c},w.t),
   /* the hop it checks comes before the whole path, which is what the tree lights for it */
   j&&j.units.includes(x.unit)?h('div',{class:'st hopl'},x.scenarioKind==='happy'?'Runs the whole journey, '+j.units.length+' hop'+(j.units.length===1?'':'s'):['Runs through ',h('b',{},(M.U[x.unit]||{}).label||x.unit),', hop '+(j.units.indexOf(x.unit)+1)+' of '+j.units.length]):null,
   h('div',{class:'path'},j?pathOf(j):((M.U[x.unit]||{}).label||'')+(x.flow&&x.scenarioKind==='regression'?' · '+x.flow:'')))}
 else if(k.startsWith('j:')){const j=M.J.find(q=>q.id===P.jid);const n=(gw.order||[]).indexOf(P.jid)+1;const vis=s.modeBy?s.mode:null;
  const later=P.leaves.filter(x=>vis&&gbRank[x.mode]>gbRank[vis]);
  gwPut(tip,h('span',{class:'k'},'journey '+n+(P.pol?' · '+(P.pol==='failure'?'how it fails':'what it refuses'):'')),h('b',{},j?j.title:''),
   h('div',{class:'st'},P.pruned?'Pruned in '+gbModeName(vis)+': '+later.length+' scenario'+(later.length===1?'':'s')+' here; '+[...new Set(later.map(x=>gbModeName(x.mode)))].join(' and ')+' grows '+(later.length===1?'it':'them')+'.'
    :(P.leaves.length-later.length)+' scenario'+(P.leaves.length-later.length===1?'':'s')+(P.pol==='failure'?' that break it on purpose and check it fails safely':' that check it refuses what it must')+(later.length?'; '+later.length+' more in '+gbModeName(later[0].mode):'')+'.'))}
 else if(B.knot[k.slice(2)]&&B.knot[k.slice(2)].__ids.length>1){const ids=B.knot[k.slice(2)].__ids;const on=M.J.filter(j=>ids.some(id=>j.units.includes(id)));
  gwPut(tip,h('span',{class:'k'},ids.length+' parts on one knot'),...ids.map(id=>h('b',{},(M.U[id]||{}).label||id)),
   h('div',{class:'st'},on.length===1?'On 1 journey: '+on[0].title:on.length+' of '+M.J.length+' journeys pass through them'),maxOf(ids))}
 else{const id=k.slice(2);const u=M.U[id];if(!u){hide();return}const on=M.J.filter(j=>j.units.includes(id));
  const stop=s.stops.find(x=>x.unit===id);
  gwPut(tip,h('span',{class:'k'},u.root?(u.layer==='ext'?'depends on · outside the repo':'depends on · in the repo'):'part'),h('b',{},u.label),h('div',{class:'path'},u.loc),
   h('div',{class:'st'},u.root?gbFeeds(on.map(j=>(gw.order||[]).indexOf(j.id)+1).sort((a,b)=>a-b))+(on.length===1?': '+on[0].title:on.length?'':' in this change, so it lies loose'):on.length?(on.length===1?'On 1 journey: '+on[0].title:on.length+' of '+M.J.length+' journeys pass through it'):'Changed, but no journey in this change reaches it'),
   maxOf([id]),stop?h('div',{class:'st'},'Tracing stops here: '+stop.why):null)}
 tip.hidden=false;const wrap=tip.parentNode;if(!wrap)return;
 /* on a phone there is no room beside anything: the card sits under the drawing, full width, and the drawing stays clear */
 const narrow=B.L.narrow||wrap.clientWidth<480;tip.classList.toggle('below',narrow);
 if(narrow){const sr=B.svg.getBoundingClientRect(),c0=wrap.getBoundingClientRect();tip.style.left='0px';tip.style.top=gbF(sr.bottom-c0.top+6)+'px';wrap.style.paddingBottom=gbF(tip.offsetHeight+12)+'px';return}
 wrap.style.paddingBottom='';const c=wrap.getBoundingClientRect();const tw=tip.offsetWidth,th=tip.offsetHeight;
 const sr=B.svg.getBoundingClientRect(),vb=B.svg.viewBox.baseVal,f=sr.width/vb.width;const toPx=p=>[sr.left-c.left+(p[0]-vb.x)*f,sr.top-c.top+(p[1]-vb.y)*f];
 /* a root is long and runs off under the pot: the card goes by the point that names it, not by its whole length */
 const rid=k.startsWith('u:')&&B.root[k.slice(2)]?k.slice(2):null;let r=el.getBoundingClientRect();
 if(rid&&B.pos[rid]){const q=toPx(B.pos[rid]);r={left:q[0]+c.left-6,right:q[0]+c.left+6,top:q[1]+c.top-6,bottom:q[1]+c.top+6}}
 const x0=r.left-c.left,y0=r.top-c.top,x1=r.right-c.left,y1=r.bottom-c.top,cx=(x0+x1)/2,cy=(y0+y1)/2;
 /* The card never covers what it explains: the thing pointed at, its name, the route it lights, the names of the files on
    that route, or (for a root) the whole root, its name and where its trace stops. Those are hard; other names and the pot
    are soft. It goes beside the thing if it can, else in the nearest clear corner of the drawing, with a hairline back. */
 const box=q=>[q.left-c.left,q.top-c.top,q.right-c.left,q.bottom-c.top];const hard=[[x0-6,y0-6,x1+6,y1+6]],soft=[];
 if(rid)hard.push(box(B.root[rid].getBoundingClientRect()));
 for(const kl of Object.values(B.klbl))if(kl.classList.contains('on')||((kl.classList.contains('wound')||kl.classList.contains('brk'))&&!kl.classList.contains('wmute'))){const q=kl.getBoundingClientRect();if(q.width)hard.push(box(q))}
 for(const l of Object.values(B.lbl)){const q=l.el.getBoundingClientRect();if(q.width)(l.el.classList.contains('hl')?hard:soft).push(box(q))}
 /* the leaves it lights are what it explains, so it never sits on them; nor on the pot, whose face carries names */
 for(const lf of B.svg.querySelectorAll('.gb-lf.hl,.gb-lf.sel,.gb-gr.hl')){const q=lf.getBoundingClientRect();if(q.width)hard.push([q.left-c.left-6,q.top-c.top-6,q.right-c.left+6,q.bottom-c.top+6])}
 const firm=[];const pot=B.svg.querySelector('.pots');if(pot){const q=pot.getBoundingClientRect();if(q.width)firm.push(box(q))}
 /* and it would rather sit on empty ground than on foliage */
 for(const P of Object.values(B.pad)){const q=P.el.getBoundingClientRect();if(q.width)soft.push(box(q))}
 /* the route, as points along it */
 const rp=[];for(const pe of [B.sap,B.sapX,B.sapW]){const dd=pe.getAttribute('d')||'';const nums=dd.match(/-?[\d.]+/g)||[];for(let i=0;i+1<nums.length;i+=6)rp.push(toPx([+nums[i],+nums[i+1]]))}
 /* it stays inside the drawing: never over the key below it or past the panel's edge */
 const W2=Math.min(c.width,sr.right-c.left),H2=Math.max(sr.bottom-c.top,th+8);
 /* The card is anchored to what it explains: beside it on the right or the left, or above or below it, 10 or 24 px away,
    sliding along that side as far as its corners; 40 px off, with a hairline, only when nothing nearer is clear. A root also
    tries just under the pot in line with the root's end, and just outside the rim where the root crosses it; those cards
    point at that spot. */
 const cand=[];for(const gp of [10,24,40]){for(let yy=y0-th-gp;yy<=y1+gp;yy+=12)cand.push([x1+gp,yy],[x0-tw-gp,yy]);for(let xx=x0-tw-gp;xx<=x1+gp;xx+=20)cand.push([xx,y0-th-gp],[xx,y1+gp])}
 if(rid){const rr=B.L.roots.find(q=>q.id===rid),pb=firm[0];if(rr&&rr.pts.length){const p0=B.L.potC-B.L.potL/2,p1=B.L.potC+B.L.potL/2,e=toPx(rr.pts[rr.pts.length-1]),xo=rr.pts.find(p=>p[0]<p0||p[0]>p1);
  if(pb)for(const gp of [10,24])cand.push([e[0]-12,pb[3]+gp,e],[e[0]-tw+12,pb[3]+gp,e]);
  if(xo){const q=toPx(xo),sd=xo[0]>p1?1:-1;for(const gp of [10,24]){for(const yy of [q[1]-th/2,q[1]-th+8,q[1]-8])cand.push([sd>0?q[0]+gp:q[0]-tw-gp,yy,q]);for(let xx=q[0]-tw;xx<=q[0];xx+=20)cand.push([xx,q[1]-th-gp,q])}}}}
 let best=null;
 const ov=(x,y,b)=>Math.max(0,Math.min(x+tw,b[2])-Math.max(x,b[0]))*Math.max(0,Math.min(y+th,b[3])-Math.max(y,b[1]));
 /* shoots and the hairlines of names are soft ground too */
 for(const el of B.svg.querySelectorAll('.budg,.kld,.scar.on')){const q=el.getBoundingClientRect();if(q.width||q.height)soft.push(box(q))}
 const inB=(p,b)=>p[0]>b[0]&&p[0]<b[2]&&p[1]>b[1]&&p[1]<b[3],me=[x0-8,y0-8,x1+8,y1+8];
 /* the hairline starts inside the thing itself (a root's whole run, say), so only what it does not start in can be crossed */
 const hardL=hard.filter(b=>!inB([cx,cy],b)),softL=soft.filter(b=>!inB([cx,cy],b));
 for(const q of cand){const x=Math.max(4,Math.min(q[0],W2-tw-4)),y=Math.max(4,Math.min(q[1],H2-th-4)),a=q[2]||[cx,cy];let sc=0;
  for(const b of hard){const o=ov(x,y,b);if(o>0)sc+=1e5+o*10}for(const b of firm){const o=ov(x,y,b);if(o>0)sc+=4e4+o*5}for(const b of soft)sc+=ov(x,y,b)*(b[4]||2);
  for(const p of rp)if(p[0]>x-3&&p[0]<x+tw+3&&p[1]>y-3&&p[1]<y+th+3)sc+=2e4;
  const dist=q[2]?Math.hypot(Math.max(x-a[0],a[0]-(x+tw),0),Math.max(y-a[1],a[1]-(y+th),0)):Math.hypot(Math.max(x-x1,x0-(x+tw),0),Math.max(y-y1,y0-(y+th),0));sc+=25*dist+(q[2]?40:0)+Math.abs(x+tw/2-cx)*.05;
  /* the hairline it would draw must not cross foliage, names or the lit route */
  const ex=Math.max(x,Math.min(a[0],x+tw)),ey=Math.max(y,Math.min(a[1],y+th));if(Math.hypot(ex-a[0],ey-a[1])>16){for(let i=1;i<12;i++){const t=i/12,p=[a[0]+(ex-a[0])*t,a[1]+(ey-a[1])*t];if(inB(p,me))continue;
   if(hardL.some(b=>inB(p,b))||firm.some(b=>!inB([cx,cy],b)&&inB(p,b)))sc+=3000;else if(softL.some(b=>!b[4]&&inB(p,b)))sc+=600;if(rp.some(r=>Math.hypot(r[0]-p[0],r[1]-p[1])<5))sc+=600}}
  if(!best||sc<best.sc-1)best={x,y,sc,a}}
 /* when the drawing has no clear ground near the thing, the card docks at the head of the side panel, level with it, and
    draws no line across the tree */
 const ins=wrap.parentNode&&wrap.parentNode.nextElementSibling,ir=ins&&ins.offsetWidth?ins.getBoundingClientRect():null;
 const dock=!!ir&&ir.left>=c.right-8&&best.sc>=4e4;
 if(dock){ins.classList.add('gb-docked');tip.style.width=gbF(ir.width)+'px';best={x:ir.left-c.left,y:ir.top-c.top,sc:0,a:best.a}}
 tip.classList.toggle('dock',dock);tip.style.left=gbF(best.x)+'px';tip.style.top=gbF(best.y)+'px';
 /* a little way from what it explains, a hairline joins them; a docked card draws none, so no line crosses the tree */
 const A=best.a||[cx,cy],ex=Math.max(best.x,Math.min(A[0],best.x+tw)),ey=Math.max(best.y,Math.min(A[1],best.y+th));
 if(!dock&&Math.hypot(ex-A[0],ey-A[1])>16&&B.lead){const toSv=(px,py)=>[vb.x+(px-(sr.left-c.left))/f,vb.y+(py-(sr.top-c.top))/f];const a=toSv(A[0],A[1]),b=toSv(ex,ey),u=Math.hypot(b[0]-a[0],b[1]-a[1])||1,o=best.a?3:9;
  B.lead.setAttribute('d','M'+gbP([a[0]+(b[0]-a[0])/u*o,a[1]+(b[1]-a[1])/u*o])+' L'+gbP(b))}else if(B.lead)B.lead.setAttribute('d','')}
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
   between its method and its path), and each arrow goes with the hop after it, so a line never ends on an arrow and a line the
   path wraps onto starts with one: it reads as the same path going on, never as a second path (see .gw-slo). */
function gbPathEl(j,wound){const M=gw.M;const parts=j.units.map(id=>M.U[id]).filter(Boolean);const order=[...parts.filter(u=>!u.root),...parts.filter(u=>u.root)];
 return h('div',{class:'gb-path gw-path gw-sl gw-slo'},order.map((u,i)=>h('span',{class:'hop'},i?h('span',{class:'sp','aria-hidden':'true'},' › '):null,h('button',{class:u.root?'rootp':u.id===wound?'bad':'',title:u.loc,on:{click:e=>{e.stopPropagation();gw.pinned='u:'+u.id;gw.pinList=null;gw.refocus='u:'+u.id;growPaint()},mouseenter:()=>{const B=gw.B;if(B)gbHover('u:'+u.id,B.knot[u.id]||B.root[u.id]||null)},mouseleave:()=>gbHover(null)}},...gwCodeText(gwPlain(u.label))))))}
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
  j?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'The path it crosses'),gbPathEl(j,gbWound(M,j,x))):null,
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
function gbItem(x,attrs,chips){const T=gwVia(x.title);return h(attrs.tag||'button',Object.assign({},attrs,{tag:null}),gbGlyph(x),h('span',{class:'t'},...gwRich(T.title),T.via?h('small',{class:'via'},'via ',...gwCodeText(T.via)):null),h('span',{class:'bx'},chips))}
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
 const part=(key,id,list)=>{const u=M.U[id]||{};const on=onJ(id),n=list.length;
  const where=u.root?gbFeeds(on):on.length?'on journey'+(on.length===1?' ':'s ')+gbAnd(on):'on no journey';
  const sum=[h('b',{class:'pn'},...gwCodeText(gwPlain(u.label||id))),h('span',{class:'gb-gs'},gbByRole(list).map(gbGlyph)),
   gwFacts([n+' '+(key==='reg'?'flow':'check')+(n===1?'':'s'),...gbTok(list,{surface:'',units:[]},vis,inMode).map(t=>h('span',{class:t[1]},t[0])),[where.charAt(0).toLowerCase()+where.slice(1)]])];
  return gbOlFold('bp:'+key+':'+id,sum,h('div',{class:'gb-bpl'},list.flatMap(x=>gbRow(x,gw.tree==='outline'))),list.some(failed)||list.some(x=>gw.pinned==='s:'+x.id),'gb-bpf')};
 /* the parts' rows line up as a table: the names in one column as wide as the longest (to a limit, past which a name wraps after
    a slash), the leaves in one as wide as the most any part has, then the counts and journeys, all starting on the same edges;
    the part checks and the existing flows share those edges, so the two folds read as one table */
 const ids=list=>[...new Set(list.map(x=>x.unit))],most=list=>ids(list).map(id=>list.filter(x=>x.unit===id).length);
 const nw=Math.min(22,Math.max(8,...ids(own.concat(reg)).map(id=>gwPlain((M.U[id]||{}).label||id).length))),lw=Math.min(8,Math.max(1,...most(own),...most(reg)));
 const fold=(key,what,list)=>{if(!list.length)return null;
  return gbOlFold(key,gwFacts([what(list.length),...note(list).map(t=>[t])]),h('div',{class:'gb-olx gb-bpx',style:'--bpn:'+(nw+1)+'ch;--bpl:'+(lw*16-3)+'px'},ids(list).map(id=>part(key,id,list.filter(x=>x.unit===id)))),open)};
 return [fold('own',n=>n+' part check'+(n===1?'':'s'),own),fold('reg',n=>n+' existing flow'+(n===1?'':'s')+' the change reaches',reg)]}
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
    and line once: when the row already names them, the note does not); selected, its card opens under it */
 const row=u=>{const k='u:'+u.id,pin=gw.pinned===k;const feeds=order.map((j,i)=>j.units.includes(u.id)?i+1:0).filter(Boolean);const stop=s.stops.find(x=>x.unit===u.id);const at=stop&&stop.at&&stop.at!==u.loc?stop.at:null;
  return [h('button',{class:'gb-olr'+(pin?' sel':''),'data-ol':k,'aria-pressed':String(pin),on:{click:()=>gbOlPin(k)}},h('span',{class:'gw-g','aria-hidden':'true'},u.layer==='ext'?gwSw('ext'):feeds.length?gwSw('root'):gwSw('unused')||gwSw('root')),
   h('span',{class:'t'},u.label,h('small',{},gwFacts([u.unitKind,[gwRef(u.loc)]]))),h('span',{class:'fd'},gbFeeds(feeds)),
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
  buds[0]||buds[1]?[gbSec(buds[0]&&buds[1]?'Part checks and existing flows':buds[0]?'Part checks':'Existing flows'),buds]:null,gbOlRoots(M,order),gbOlParts(M,order),
  s.scenarios.length?h('div',{class:'gw-legend',style:'margin-top:14px'},h('div',{class:'gw-lg'},lf('pass','passed'),lf('fail','failed'),lf('run','running'),lf('in','to prove'),lf('none','no flow yet'),s.modeBy&&s.scenarios.some(x=>!gwIn(x))?lf('cut','pruned, named under its journey'):null)):null,
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
