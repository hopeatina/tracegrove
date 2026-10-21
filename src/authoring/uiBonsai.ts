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
 --wood:#6E5E50;--wood-lit:#8F7D6B;--wood-shade:#4C4037;--wood-old:color-mix(in srgb,#6E5E50 68%,var(--muted));--knot:#57493E;--knot-lit:#9C8975;--cut:#DCC8A6;
 --pad:color-mix(in srgb,var(--moss) 44%,var(--paper));--pad-lit:color-mix(in srgb,var(--moss) 30%,var(--paper));--pad-shade:color-mix(in srgb,var(--moss) 64%,#2A3524);
 --pot:color-mix(in srgb,var(--ochre) 26%,var(--line2));--pot-rim:color-mix(in srgb,var(--ochre) 34%,var(--ink3));--pot-ft:color-mix(in srgb,var(--ochre) 30%,#3A2A20);--soil-c:color-mix(in srgb,#6E5E50 34%,var(--soil))}
@media (prefers-color-scheme:dark){.gw-svg.gb{--wood:#6E5F50;--wood-lit:#8A7864;--wood-shade:#4A3F35;--wood-old:#5E574E;--knot:#4E4238;--knot-lit:#93826E;--cut:#B9A684;
 --pad:color-mix(in srgb,var(--moss) 50%,var(--paper));--pad-lit:color-mix(in srgb,var(--moss) 66%,var(--paper));--pad-shade:color-mix(in srgb,var(--moss) 30%,var(--paper));
 --pot:color-mix(in srgb,var(--ochre) 30%,var(--line2));--pot-rim:color-mix(in srgb,var(--ochre) 40%,var(--ink3));--pot-ft:color-mix(in srgb,var(--ochre) 20%,#0B0F0D);--soil-c:color-mix(in srgb,#6E5F50 26%,var(--soil))}}
.gb .w{fill:var(--wood)}.gb .w.old{fill:var(--wood-old)}.gb .lt{fill:var(--wood-lit)}.gb .sh{fill:var(--wood-shade)}
.gb .grain{fill:none;stroke:var(--wood-shade);stroke-width:.8;stroke-linecap:round;opacity:.32}
.gb .jin{fill:var(--paper);stroke:var(--wood-old);stroke-width:.9;stroke-linejoin:round}
.gb .vein{display:none;fill:none}.gb .vein.live{display:inline;stroke:var(--gold);stroke-width:1.4;stroke-linecap:round;stroke-dasharray:3 5;animation:gbflow 1s linear infinite}
@keyframes gbflow{to{stroke-dashoffset:-16}}
.gb .kn .k2{fill:var(--knot)}.gb .kn .kh{fill:none;stroke:var(--knot-lit);stroke-width:1;stroke-linecap:round}
.gb .kn .ring{fill:none;stroke:var(--paper);stroke-width:1.5;opacity:0;transition:opacity .2s}
.gb .kn.on .ring,.gb .kn:hover .ring{opacity:1}.gb .kn.trace .ring{opacity:.9;stroke:var(--gold)}
.gb .kn .crack{display:none;fill:none;stroke:var(--verm);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.gb .kn.wound .crack{display:inline}.gb .kn.wound .ring{opacity:1;stroke:var(--verm);stroke-width:1.2}
.gb .klbl{font:500 10px var(--mono);fill:var(--ink2);paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round;opacity:0;transition:opacity .2s;pointer-events:none}.gb .klbl.on{opacity:1}.gb .klbl.wound{opacity:1;fill:var(--verm-ink)}.gb .kld{fill:none;stroke:var(--ink3);stroke-width:.8;opacity:0;transition:opacity .2s;pointer-events:none}.gb .klbl.on+.kld,.gb .klbl.wound+.kld{opacity:.8}
.gb .vein,.gb .tw,.gb .sap,.gb .leader,.gb .grain,.gb .fol{pointer-events:none}.gb .hitc{fill:transparent;stroke:none}.gb .hitl{fill:none;stroke:transparent;stroke-linecap:round}
.gb .pad .fol circle{pointer-events:auto}
.gb [data-k]{cursor:pointer;outline:none}
.gb .kn:focus-visible .ring,.gb .rt:focus-visible .rlbl{opacity:1;stroke:var(--ink)}
.gb .pad .g0{stop-color:var(--pad-lit)}.gb .pad .g1{stop-color:var(--pad)}.gb .pad .g2{stop-color:var(--pad-shade)}
.gb .pad:focus-visible{filter:drop-shadow(0 0 1.5px var(--ink))}.gb .pad.back .fol{opacity:.84}
.gb .clp{transform-box:fill-box;transform-origin:center;transition:transform .45s ease-in .2s}.gb .clp.gone{transform:scale(0)}
.gb .pad .bud0{display:none;fill:var(--pad-shade);stroke:var(--moss);stroke-width:.8}.gb .pad.bare .bud0{display:inline}.gb .pad.bare .fol{display:none}
.gb .jg{transition:opacity .3s}.gb .jg.pruned{display:none}.gb .jg.crown.pruned{display:inline;opacity:.28}.gb .jg.pv-cut{opacity:.35}
.gb.dim .jg:not(.hl){opacity:.24}.gb.dim .kn:not(.on):not(.wound){opacity:.45}.gb.lfdim .jg.hl .gb-lf:not(.hl):not(.sel){opacity:.45}
.gb .stub{display:none}.gb .stub.on{display:inline}.gb .stub .sw{fill:var(--wood)}.gb .cutf{fill:var(--cut);stroke:var(--wood-shade);stroke-width:.7}.gb .mlbl{font:600 10.5px var(--mono);fill:var(--muted)}
.gb .cutmk{display:none;fill:none;stroke:var(--verm);stroke-width:1.6;stroke-dasharray:3 2.5;stroke-linecap:round}.gb .cuttag{display:none;font:600 10.5px var(--mono);fill:var(--verm-ink)}.gb .cutmk.on,.gb .cuttag.on{display:inline}
.gb .tw{fill:var(--wood)}.gb .tw.old{fill:var(--wood-old)}
.gb .tipbud{fill:var(--new);stroke:var(--moss);stroke-width:1}
.gb-lf{transition:transform .45s cubic-bezier(.2,.7,.2,1),opacity .3s}
.gb-lf .blade{stroke-width:1.1;stroke-linejoin:round;transition:fill .35s,stroke .35s}
.gb-lf .lh{fill:none;stroke:var(--paper);stroke-width:2.6;stroke-linejoin:round;opacity:.8}
.gb-lf .rib{fill:none;stroke:var(--paper);stroke-width:.8;opacity:.5}
.gb-lf .bb{display:none}.gb-lf.fail .bb{display:inline}.gb-lf.fail .bn{display:none}.gb-lf .pet{fill:none;stroke:var(--wood);stroke-width:1.3;stroke-linecap:round;display:none}.gb-lf.hang .pet{display:inline}
.gb-lf .stem0{display:none;fill:none;stroke:var(--wood);stroke-width:1.8;stroke-linecap:butt}
.gb-lf.in .blade{fill:var(--moss-bg);stroke:var(--moss)}
.gb-lf.pass .blade{fill:var(--moss);stroke:var(--moss)}.gb-lf.pass.warn .blade{stroke:var(--gold);stroke-width:1.8}
.gb-lf.fail .blade{fill:var(--verm);stroke:var(--verm)}
.gb-lf.run .blade{fill:var(--gold);stroke:var(--gold)}.gb-lf.run .gb-lfi{animation:gbpulse 1s ease-in-out infinite}
.gb-lf.idle .blade{fill:var(--paper);stroke:var(--moss)}
.gb-lf.none .blade{fill:var(--paper);stroke:var(--moss);stroke-dasharray:2.4 1.6}
.gb-lf.pre .blade{fill:var(--paper);stroke:var(--line2)}
.gb-lf.in .rib,.gb-lf.idle .rib,.gb-lf.none .rib,.gb-lf.pre .rib{stroke:var(--moss);opacity:.3}
.gb-lf .gb-lfi{transform-box:fill-box;transform-origin:center}
.gb-lf.pv-out{opacity:.12}.gb-lf.pv-in .blade{stroke-width:1.6}
.gb-lf.cut .gb-lfi{animation:gbfall .55s ease-in forwards}.gb-lf.gone .gb-lfi{display:none}.gb-lf.gone .stem0{display:inline}.gb-lf.gone .hitc{display:none}.gb-lf.bud.gone{display:none}
.gb-lf.hl .blade{stroke:var(--ink);stroke-width:1.6}.gb-lf.sel .blade{stroke:var(--ink);stroke-width:2}
.gb .bud .blade{stroke-width:1}.gb .bud.none .blade{stroke-dasharray:1.6 1.2}
.gb .bmore{font:600 9.5px var(--mono);fill:var(--muted)}
@keyframes gbfall{to{transform:translate(6px,40px) rotate(30deg);opacity:0}}
@keyframes gbpulse{50%{transform:scale(1.2)}}
.gb.dim .bud:not(.hl),.gb.dim .lbl:not(.hl),.gb.dim .bmore{opacity:.3}
.gb .lbl text.t{font:500 13px var(--sans);fill:var(--ink)}.gb .lbl text.t.v{font:400 12.5px var(--sans);fill:var(--ink2)}.gb .lbl text.t.v.out{fill:var(--muted);text-decoration:line-through}.gb .lbl text.st{font:11px var(--mono);fill:var(--muted)}
.gb .lbl tspan.code{font-family:var(--mono);font-size:.92em}
.gb .lbl text.eb{font:500 10px var(--mono);letter-spacing:.08em;fill:var(--muted)}.gb .st .f{fill:var(--verm-ink)}.gb .st .p{fill:var(--moss)}.gb .st .r{fill:var(--gold)}.gb .st .n{fill:var(--muted)}
.gb .lbl.hl text.t,.gb .lbl.sel text.t{font-weight:650}.gb .lbl.pruned{display:none}.gb .lbl.back text.t{fill:var(--ink3)}
.gb .lbl .num{font:600 11px var(--mono);fill:var(--muted)}
.gb .leader{fill:none;stroke:var(--line2);stroke-width:1}
.gb .badge circle{fill:var(--paper);stroke:var(--ink3);stroke-width:1}.gb .badge text{font:600 11px var(--mono);fill:var(--ink);text-anchor:middle;dominant-baseline:central}
.gb .badge.fail circle{stroke:var(--verm);fill:var(--verm-bg)}.gb .badge.sel circle{stroke:var(--ink);stroke-width:2}.gb .badge.pruned{display:none}
.gb .potl{font:500 11px var(--mono);letter-spacing:.06em;fill:color-mix(in srgb,var(--pot-rim) 55%,var(--ink))}.gb .pot{fill:var(--pot)}.gb .pot-rim{fill:var(--pot-rim)}.gb .pot-ft{fill:var(--pot-ft)}.gb .pot-sh{fill:var(--pot-rim);opacity:.35}.gb .soil{fill:var(--soil-c)}
.gb .rg{fill:var(--gold)}.gb .rt.loose .rg{fill:var(--wood-old)}
.gb .rlbl{font:10.5px var(--mono);fill:var(--ink2)}.gb .rt.stop .rlbl{fill:var(--verm-ink)}
.gb .tail{fill:none;stroke:var(--muted);stroke-width:1.4;stroke-dasharray:3 4;stroke-linecap:round}
.gb .sapu{fill:none;stroke:var(--paper);stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;opacity:.9;pointer-events:none}
.gb .sap{fill:none;stroke:var(--ink);stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:2 5;animation:gbflow .7s linear infinite;pointer-events:none}
.gb .sap.bad{stroke:var(--verm)}
.gb .bead{fill:var(--gold);stroke:var(--paper);stroke-width:1.5}.gb .halo{fill:var(--gold);opacity:.22}
.gb .note{font:11.5px var(--mono);fill:var(--muted)}
.gb-tip{position:absolute;z-index:3;width:max-content;max-width:300px;pointer-events:none;background:var(--paper);border:1px solid var(--line2);border-radius:10px;padding:9px 11px;box-shadow:0 8px 28px rgb(0 0 0 / .14);font-size:13px;line-height:18px;color:var(--ink)}
.gb-tip[hidden]{display:none}.gb-tip b{display:block;font-weight:500}.gb-tip .k{font:11px/16px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.gb-tip .st{font:12px/17px var(--mono);margin-top:3px}.gb-tip .st.pass{color:var(--moss)}.gb-tip .st.fail{color:var(--verm-ink)}.gb-tip .st.run{color:var(--gold)}
.gb-tip .path{font:11.5px/16px var(--mono);color:var(--ink3);margin-top:4px;overflow-wrap:anywhere}
.gb-key{display:flex;flex-wrap:wrap;gap:4px 14px;margin:2px 6px;font:12px/18px var(--sans);color:var(--ink3)}
.gb-key i{display:inline-block;width:11px;height:7px;border-radius:7px 1px;vertical-align:0;margin-right:5px;border:1.2px solid var(--moss);background:var(--moss)}
.gb-key i.fail{background:var(--verm);border-color:var(--verm)}.gb-key i.none{background:var(--paper);border-style:dashed}.gb-key i.in{background:var(--paper)}
.gb-key i.run{background:var(--gold);border-color:var(--gold)}.gb-key i.cut{width:13px;height:6px;border-radius:1px;background:#6E5E50;border:0;border-right:3px solid #DCC8A6}
.gb-key i.bud{width:6px;height:8px;border-radius:50%;background:var(--paper)}.gb-key i.crack{width:10px;height:10px;border-radius:50%;background:#3B322B;border:1.5px solid var(--verm)}
.gb-names{margin:6px 6px 2px 22px;padding:0;font:13px/19px var(--sans);color:var(--ink2)}.gb-names li{padding:1px 0}
.gb-cap{font:12.5px/18px var(--sans);color:var(--ink3);margin:2px 6px 8px}
.gb-mode{display:grid;gap:8px;margin:0 4px 10px}
.gb-jr{border-bottom:1px solid var(--line)}.gb-jr:last-child{border-bottom:0}
.gb-jr>summary{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:2px 10px;align-items:center;min-height:52px;padding:8px 4px;cursor:pointer;list-style:none}
.gb-jr>summary::-webkit-details-marker{display:none}.gb-jr>summary:hover,.gb-jr.sel>summary{background:var(--sel)}
.gb-jr .no{font:600 12px/18px var(--mono);color:var(--muted);text-align:center;grid-row:span 2}
.gb-jr .tt{font-size:14px;line-height:20px;color:var(--ink);min-width:0}.gb-jr .tt .by{font:11px/16px var(--mono);color:var(--gold);margin-left:6px}
.gb-jr .pa{grid-column:2;font:11.5px/16px var(--mono);color:var(--muted);overflow-wrap:anywhere}
.gb-jr .rt2{grid-row:1/span 2;grid-column:3;display:grid;justify-items:end;gap:3px}
.gb-jr .rt2 .c{font:11.5px/16px var(--mono);color:var(--muted);white-space:nowrap}.gb-jr.failed .rt2 .c{color:var(--verm-ink)}
.gb-jr .list{padding:0 0 10px 30px}
.gb-sub{font:500 11px/16px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:14px 4px 4px}
.gb-loose{font-size:13px;line-height:19px;color:var(--ink3);padding:10px 4px 2px}
.gb-path{display:flex;flex-wrap:wrap;gap:4px 2px;align-items:center;font:12px/18px var(--mono);color:var(--ink3)}
.gb-path button{border:0;background:none;padding:0 2px;font:inherit;color:var(--ink2);text-decoration:underline dotted;text-underline-offset:3px;cursor:pointer;min-height:24px}
.gb-path .sep{color:var(--muted)}.gb-path .rootp{color:var(--gold)}.gb-path .bad{color:var(--verm-ink);font-weight:600}
.gb-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;font-size:13px;line-height:19px;padding:4px 0;border:0;background:none;width:100%;text-align:left;color:var(--ink);cursor:pointer}
.gb-row:hover,.gb-row.hl{background:var(--sel)}.gb-row span:first-child{min-width:0;flex:1}
@media (max-width:640px){.gb-jr>summary{grid-template-columns:22px minmax(0,1fr)}.gb-jr .rt2{grid-row:auto;grid-column:2;justify-items:start}.gb-jr .list{padding-left:8px}}
@media (prefers-reduced-motion:reduce){.gb-lf,.gb .vein,.gb .clp,.gb .jg{transition:none}.gb-lf.run .gb-lfi,.gb .vein.live,.gb .sap{animation:none}.gb-lf.cut .gb-lfi{display:none}}
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
const gbBez=(p,n)=>Array.from({length:n+1},(_,i)=>gbCubic(p,i/n));
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

/* What a scenario proves, for where its leaf sits: the happy path, a guard (a caller or input the journey must refuse),
   or a way it fails. */
const gbPol=x=>x.polarity||(x.scenarioKind==='happy'?'happy':x.scenarioKind==='sad'?'failure':'guard');
const gbOrd=list=>list.map((x,i)=>({x,i})).sort((a,b)=>gbRank[a.x.mode]-gbRank[b.x.mode]||a.i-b.i).map(o=>o.x);
/* When an animation started, kept for the whole grow, so a rebuild continues it instead of restarting it. */
function gbT(k,delay){const G=gw.seen.gt||(gw.seen.gt={});if(G[k]===undefined)G[k]=performance.now()+delay;return G[k]}

/* A pad is grown, not stamped: clumps of foliage at the tips of the three to five branchlets that carry it, and a clump
   behind each leaf, so a pad is as wide as the leaves it holds and a pruned leaf takes its clump with it. Leaves sit by
   what they prove: the happy path seated on the crest, guards out on the shoulders, the ways it fails hanging on stems
   underneath, toward the pad's outer end (dir) so they clear the branch; in each group the minimum's leaves come first.
   Coordinates are the pad's own: x from its middle, y up from its flat underside. */
function gbPadGeo(list,H,dir,seed){const n=list.length;const L0=Math.max(20,Math.min(28,H*.056));const L=n>16?L0*.62:n>9?L0*.74:n>5?L0*.86:L0,W=L*.52,s=L*.92;
 const g={happy:[],guard:[],failure:[]};for(const x of gbOrd(list))g[gbPol(x)].push(x);
 const nh=Math.min(g.happy.length,6),ng=Math.min(g.guard.length,6),nf=g.failure.length;
 const PW=Math.max(64,Math.min(240,Math.max(18*(nh+ng)+48,nf*s*.85+L*1.2)));const PH=Math.max(26,Math.min(56,.4*PW));
 const prof=u=>-PH*(.32+.68*Math.pow(Math.max(0,1-u*u),.6));const slot=new Map(),over=[];const d=dir||1;
 g.happy.forEach((x,i)=>{if(i>=6){over.push(x);return}const dx=(i-(nh-1)/2)*s,u=dx/(PW/2);slot.set(x.id,[dx,prof(u)+L*.28,-90+u*24+(i%2?7:-7),i===0&&x.mode==='min'?1.28:1,0])});
 g.guard.forEach((x,i)=>{const sd=i%2?-d:d,r=Math.floor(i/2);if(r>2){over.push(x);return}const dx=sd*(PW/2-L*.18+r*L*.12),u=Math.min(.95,Math.abs(dx)/(PW/2));slot.set(x.id,[dx,Math.min(-PH*.22,prof(u)+L*.3+r*L*.5),sd>0?-26+r*24:-154-r*24,1,0])});
 const lim=PW/2-L*.35,step=Math.min(s*.9,Math.max(L*.62,2*lim/Math.max(1,nf-1)));const fx=[];
 if(dir){for(let i=0;i<nf;i++){const v=lim-i*step;if(v<-lim)break;fx.push(dir*v)}}
 else for(let i=0;i<nf;i++){const v=(i%2?-1:1)*(PW*.26+Math.floor(i/2)*step);if(Math.abs(v)>lim)break;fx.push(v)}
 g.failure.forEach((x,i)=>{if(i>=fx.length){over.push(x);return}const dx=fx[i];slot.set(x.id,[dx,L*.5+10,90-dx/(PW/2)*14,1,1])});
 over.forEach((x,i)=>{const row=Math.floor(i/6),c=i%6;slot.set(x.id,[(c-2.5)*s*.85+(row%2?s*.42:0),-PH*(.3+.2*row),(c%2?-1:1)*22,.85,0])});
 /* the body: a row of clumps, each at a branchlet's tip, overlapping so the pad reads as one mass */
 const r=gbRng(seed||.5);const R0=Math.max(13,Math.min(22,PH*.42));const nb=Math.max(2,Math.min(7,Math.ceil(PW*.74/(1.5*R0))+1));const body=[];
 for(let i=0;i<nb;i++){const u=i/(nb-1)*2-1;body.push([u*PW*.36+(r()-.5)*4,-PH*(.34+.1*(1-u*u))+(r()-.5)*PH*.1,R0*(.86+.28*r())])}
 const kb=Math.max(2,Math.min(5,Math.round(PW/48)));const tips=[];for(let i=0;i<kb;i++){const q=body[Math.round(i*(nb-1)/(kb-1))];tips.push([q[0],q[1]])}
 /* a leaf's clump sits behind its base, so the leaf grows out of the foliage */
 const leafC=new Map();for(const [id,sl] of slot){if(sl[4])continue;const th=sl[2]*Math.PI/180;leafC.set(id,[sl[0]-Math.cos(th)*L*.3,sl[1]-Math.sin(th)*L*.3,L*.54*(sl[3]||1)])}
 return {L,W,PW,PH,slot,prof,body,tips,leafC}}
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
function gbTree(M,js,H,S,key,sap){const U=M.U;const nc=j=>M.leaves[j.id]?M.crit(j).size:0,nl=j=>(M.leaves[j.id]||[]).length;
 /* a bonsai's first branch is its largest and its apex its smallest: the journey with the most scenarios grows lowest, the
    one with the fewest is the crown */
 const big=(a,b)=>nl(b)-nl(a)||nc(b)-nc(a)||M.weight(b)-M.weight(a)||(a.id<b.id?-1:1);
 const apex=js.length===1?js[0]:js.slice().sort(big)[js.length-1];const A=sap?[]:(M.leaves[apex.id]||[]);
 const items=js.filter(j=>j!==apex).sort(big).map(j=>({id:j.id,j,pol:null,w:M.weight(j)}));
 /* only a change with a single journey grows that journey's failures and guards as branches; with two or more, every
    branch is a journey and a journey's failures hang under its own pad */
 let left=A.length;for(const p of ['failure','guard']){if(js.length>1||items.length>=2)break;const n=A.filter(x=>gbPol(x)===p).length;if(n&&n<left){left-=n;items.push({id:apex.id+'~'+p,j:apex,pol:p,w:Math.max(.6,M.weight(apex)*n/A.length)})}}
 const m=items.length,lit=!m;const vp=new Set(items.filter(it=>it.pol).map(it=>it.pol));
 const h1=m>=7?.27:.31;const hs=[];for(let i=0,h=h1;i<m;i++){hs.push(h);h+=(.86-h)*.4}
 const side=items.map((_,i)=>i%2?-S:S),back=items.map((_,i)=>m>=3&&i%3===2);
 const carry={};for(const j of js)for(const id of j.units)if(!U[id].root)carry[id]=(carry[id]||0)+1;
 const ownOf=j=>j.units.filter(id=>!U[id].root&&carry[id]===1);
 /* Pads first, each as wide as the leaves it holds. Then the trunk is as tall as the pads need: the leader runs into the
    crown, whose underside clears the highest pad below it, so there is no bare pole and no pad sits on another. */
 const leavesOf=pd=>pd.pol?A.filter(x=>gbPol(x)===pd.pol):pd.crown?A.filter(x=>!vp.has(gbPol(x))):(M.leaves[pd.jid]||[]);
 const padList=[{id:apex.id,jid:apex.id,pol:null,crown:true,i:-1,b:null},...items.map((it,i)=>({id:it.id,jid:it.j.id,pol:it.pol,crown:false,i,b:null}))];
 for(const pd of padList){pd.leaves=leavesOf(pd);pd.geo=gbPadGeo(pd.leaves,H,pd.crown||back[pd.i]?0:side[pd.i],gbHash('pad:'+key+':'+pd.id))}
 const cpd=padList[0];
 const gap=.022*H,inC=.42*cpd.geo.PH,lift=.02*H+6;let need=lit?.84*H:m<=1?.38*H:m<=2?.44*H:.5*H;
 if(!lit){for(const pd of padList.slice(1))if(!back[pd.i])need=Math.max(need,(pd.geo.PH+pd.geo.L*.75+gap+inC+lift)/(1-hs[pd.i]));
  for(let i=0;i<m;i++)for(let j=i+1;j<m;j++)if(side[i]===side[j]&&!back[i]&&!back[j])need=Math.max(need,(padList[i+1].geo.PH+padList[i+1].geo.L+gap)/(hs[j]-hs[i]))}
 const Ht=Math.min(.92*H,need);const D=Ht*(lit?.1:m<=3?.16:.17);
 let cp;if(lit)cp=[[0,0],[.07,0],[.3,.1*S],[.62,-.03*S],[1,.12*S]];
 else{cp=[[0,0],[.07,0],[h1*.55,-.02*S]];let last=-1;items.forEach((it,i)=>{if(back[i])return;cp.push([hs[i],side[i]*.05*Math.pow(1-hs[i],.7)*H/Ht]);last=i});
  /* with one or two branches the apex leans away from the first, so the tree's mass stays over its roots */
  if(last>=0&&hs[last]<.74)cp.push([(hs[last]+1)/2,-side[last]*.022*H/Ht]);cp.push([1,m<=2?-S*.08:.008*S])}
 const tp=gbResample(gbSpline(cp.map(([t,x])=>[x*Ht,-t*Ht]),14),96);
 const top=tp[tp.length-1];for(let i=1;i<=4;i++)tp.push([top[0]-S*.012*H*i/4,top[1]-.035*H*i/4]);
 const ty=tp.map(p=>-p[1]/Ht);
 const wts=items.map(it=>it.w),wA=Math.max(.5,M.weight(apex)-items.filter(it=>it.pol).reduce((a,it)=>a+it.w,0));
 const Wat=t=>{let w=wA;items.forEach((it,i)=>{w+=wts[i]*Math.max(0,Math.min(1,(hs[i]-t+.02)/.04))});return w};
 /* the trunk tapers steadily from a flared base into the crown: w = w0(1 - .75t)^1.2, a little swelling where a branch leaves */
 const Tw=t=>{let w=lit?D*(.3+.7*Math.pow(Math.max(0,1-t),1.05)):D*Math.pow(1-.75*Math.min(1,Math.max(0,t)),1.2);
  for(const h of hs)w*=1+.06*Math.exp(-Math.pow((t-h-.006)/.025,2));if(t<.075)w*=1+.6*Math.pow(1-t/.075,2.2);if(t>1)w*=Math.max(.4,1-(t-1)*5);return Math.max(2.4,w)};
 const tw=ty.map(Tw);
 /* A branch leaves the trunk at a third of its width or less, carries its own parts as knots on the bare wood before its
    pad, and runs on under the pad, where three to five branchlets fork up into the foliage they carry. */
 const br=items.map((it,i)=>{const h=hs[i],dir=side[i];const k=gbNear(ty,h);const P0=tp[k],Tk=tw[k];const pd=padList[i+1],g=pd.geo;
  const b=Tk*Math.max(.22,Math.min(.34,.34*Math.sqrt(it.w/Wat(h-.04))));const nOwn=it.pol?0:Math.min(5,ownOf(it.j).length);
  const inner=Tk/2+(back[i]?.03*H:Math.max(.035*H,12+12*Math.min(4,nOwn)));
  const R=inner+(back[i]?.6:.74)*g.PW,rise=back[i]?.34:.1+.06*h,dr=back[i]?-.06:.07*(1-h);
  const p=[P0,[P0[0]+dir*.3*R,P0[1]+dr*R],[P0[0]+dir*.66*R,P0[1]+dr*.3*R],[P0[0]+dir*R,P0[1]-rise*R]];
  const ph=gbRng(gbHash(key+':'+it.id))()*6.28;const raw=gbBez(p,44);
  const pts=raw.map((q,ii)=>{const t=ii/44,n=gbNorm(raw,ii),d=.012*R*Math.sin(t*7+ph)*Math.sin(t*Math.PI);return[q[0]+n[0]*d,q[1]+n[1]*d]});
  const acc=gbLen(pts),len=acc[acc.length-1];
  const w=acc.map(d=>{const u=d/len,out=Math.max(0,d-Tk/2);return Math.max(1.4,b*(1-.66*u)*(1+.22*Math.exp(-out/6)))});
  const cx=P0[0]+dir*(inner+g.PW/2);const ic=gbNear(pts.map(q=>q[0]),cx);const o=[cx,pts[ic][1]-w[ic]*.3];
  const twigs=g.tips.map((tl,ti)=>{const e=[o[0]+tl[0],o[1]+tl[1]];const lean=dir*(ti%2?.28:.6);let ii=-1,best=1e9;
   pts.forEach((q,jj)=>{if((q[0]-P0[0])*dir<Tk/2+6)return;const dd=Math.abs(q[0]-(e[0]-lean*(q[1]-e[1])));if(dd<best){best=dd;ii=jj}});
   if(ii<0)return null;const a0=pts[ii],rs=a0[1]-e[1];if(rs<8)return null;
   const t2=gbBez([a0,[a0[0]+(e[0]-a0[0])*.12,a0[1]-rs*.45],[e[0]-(e[0]-a0[0])*.3,e[1]+rs*.25],e],10);
   return {pts:t2,w:t2.map((_,jj)=>Math.max(1,w[ii]*.5*(1-jj/10)+jj/10))}}).filter(Boolean);
  return {it,j:it.j,id:it.id,pol:it.pol,i,h,dir,k,back:back[i],pts,w,len,acc,R,inner,exit:Math.max(1,acc.findIndex(d=>d>=Tk*.5)),tip:pts[pts.length-1],b,Tk,o,twigs}});
 const pads={},origin={};const cr=tp[tp.length-5];
 for(const pd of padList){pads[pd.id]=pd;if(pd.crown)origin[pd.id]=[cr[0],cr[1]+inC];else{pd.b=br[pd.i];origin[pd.id]=pd.b.o}}
 /* the leader forks into the crown: its outer branchlets leave just under the pad */
 const co=origin[apex.id],cg=cpd.geo;let kc=tp.length-1;for(let i=tp.length-1;i>0;i--)if(tp[i][1]>=co[1]+5){kc=i;break}
 const ctw=cg.tips.filter(t=>Math.abs(t[0])>cg.PW*.1).map((tl,ti)=>{const e=[co[0]+tl[0],co[1]+tl[1]];const a0=tp[Math.max(1,kc-ti*2)],rs=a0[1]-e[1];if(rs<6)return null;
  const t2=gbBez([a0,[a0[0]+(e[0]-a0[0])*.15,a0[1]-rs*.5],[e[0]-(e[0]-a0[0])*.25,e[1]+rs*.25],e],10);return {pts:t2,w:t2.map((_,jj)=>Math.max(1,tw[kc]*.42*(1-jj/10)+jj/10))}}).filter(Boolean);
 /* Knots: parts the journeys share sit low on the trunk (most shared lowest, callee below caller); a journey's own parts sit
    on the bare wood of its branch, deepest nearest the trunk; the headline journey's own parts on the upper trunk. */
 const depth=id=>{let s=0,n=0;for(const j of js){const i=j.units.indexOf(id);if(i>=0){s+=i/Math.max(1,j.units.length-1);n++}}return n?s/n:0};
 const knots=[],more={};const KMAX=6;const tacc=gbLen(tp);
 const onTrunk=(id,t)=>{const k=gbNear(ty,t);knots.push({id,on:'t',k,p:tp[k],n:gbNorm(tp,k),w:tw[k],t})};
 const core=lit?[]:Object.keys(carry).filter(id=>carry[id]>1).sort((a,b)=>carry[b]-carry[a]||depth(b)-depth(a));
 core.slice(0,KMAX).forEach((id,i,a)=>onTrunk(id,a.length===1?.16:.08+(Math.max(.16,h1-.06)-.08)*i/(a.length-1)));if(core.length>KMAX)more.t=core.length-KMAX;
 const ownA=apex.units.filter(id=>!U[id].root&&carry[id]===1).sort((a,b)=>depth(b)-depth(a));
 const fr=hs.filter((h,i)=>!back[i]);const hi=Math.min(lit?.74:.95,1-(inC+8)/Ht),lo=Math.min(hi-.12,lit?.1:(fr.length?Math.max(...fr)+.06:.35));
 ownA.slice(0,5).forEach((id,i,a)=>onTrunk(id,a.length===1?(lo+hi)/2:lo+(hi-lo)*i/(a.length-1)));if(ownA.length>5)more.a=ownA.length-5;
 /* knots never crowd: at least 15 px apart along the trunk, and none pushed into the crown */
 const kTop=gbNear(ty,hi);const tk=knots.filter(q=>q.on==='t').sort((a,b)=>a.k-b.k);
 for(let i=1;i<tk.length;i++){let k=tk[i].k;while(k<tp.length-6&&tacc[k]-tacc[tk[i-1].k]<15)k++;if(k!==tk[i].k){tk[i].k=k;tk[i].p=tp[k];tk[i].n=gbNorm(tp,k);tk[i].w=tw[k]}}
 for(const q of tk)if(q.k>kTop+2){knots.splice(knots.indexOf(q),1);more.a=(more.a||0)+1}
 for(const b of br){if(b.pol)continue;const own=ownOf(b.j).sort((x,y)=>depth(y)-depth(x));const a0=b.Tk/2+7,a1=Math.max(a0+4,b.inner-4);const fit=Math.min(4,Math.max(1,Math.floor((a1-a0)/14)+1));
  own.slice(0,fit).forEach((id,i,a)=>{const d=a.length===1?(a0+a1)/2:a0+(a1-a0)*i/(a.length-1);const k=gbNear(b.acc,d);knots.push({id,on:'b'+b.i,bid:b.id,k,p:b.pts[k],n:gbNorm(b.pts,k),w:b.w[k]})})}
 /* Veins: each pad's strand in its own lane up the trunk, peeling off into its branch, so strands never cross. */
 const lanes=[...br.filter(b=>b.dir<0).sort((a,b)=>a.h-b.h).map(b=>b.id),apex.id,...br.filter(b=>b.dir>0).sort((a,b)=>b.h-a.h).map(b=>b.id)];
 const veins={};for(const id of lanes){const f=lanes.length===1?0:(lanes.indexOf(id)-(lanes.length-1)/2)/lanes.length*1.1;const b=br.find(x=>x.id===id);const kTop2=b?b.k:tp.length-1;
  const trunk=tp.slice(0,kTop2+1).map((q,i)=>{const n=gbNorm(tp,i),o=f*tw[i]*.5;return[q[0]+n[0]*o,q[1]+n[1]*o]});
  veins[id]={jid:pads[id].jid,trunk,branch:b?b.pts.slice(b.exit,Math.round(.55*(b.pts.length-1))):[],pad:origin[id]}}
 let x0=Infinity,x1=-Infinity,y0=0;const grow=(x,y)=>{x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y)};
 tp.forEach((q,i)=>{grow(q[0]-tw[i]/2,q[1]);grow(q[0]+tw[i]/2,q[1])});for(const b of br)b.pts.forEach(q=>grow(q[0],q[1]-b.b));
 for(const pd of padList){const o=origin[pd.id],g=pd.geo;grow(o[0]-g.PW/2-g.L*.5,o[1]-g.PH-g.L*.9);grow(o[0]+g.PW/2+g.L*.5,o[1]+g.L+14)}
 return {js,apex,items,br,tp,tw,ty,pads,padList,origin,knots,more,veins,lanes,ctw,H,Ht,D,S,lit,hs,h1,x0,x1,y0,cx0:x0,cx1:x1,cy0:y0,key}}

/* The whole drawing: trees placed side by side in one pot, labels beside their pads, roots in the soil. */
function gbLayout(M,width,sap){const s=gw.state;const brn=(s.change&&s.change.branch)||'grove';const S=gbHash('side:'+brn)<.5?-1:1;const narrow=width<640;
 const trees0=sap?[{js:[{id:'sap',title:'',entry:null,units:s.units.filter(u=>!u.root).map(u=>u.id)}],leaves:0}]:M.trees;
 const main=trees0[0];const nj=main?main.js.length:1;let H0=sap?220:Math.max(300,Math.min(nj===1?500:560,width*(nj===1?.42:.46)));if(narrow)H0*=.8;
 /* a journey's name in at most three lines beside its pad, then its status */
 /* a pad's label: an eyebrow (journey number and where it starts, or which of its paths this is), the journey's name in
    at most three lines, or a guard or failure pad's own scenarios, then its status */
 const wrap=(title,max,nl)=>{const words=String(title||'').split(/\s+/).filter(Boolean);const lines=[''];let i=0;
  for(;i<words.length;i++){const w=words[i],l=lines[lines.length-1];if(!l||gbPlain(l+' '+w).length<=max)lines[lines.length-1]=l?l+' '+w:w;else if(lines.length<nl)lines.push(w);else break}
  if(i<words.length){let l=lines[nl-1];while(gbPlain(l).length>max-1&&l.includes(' '))l=l.slice(0,l.lastIndexOf(' '));if((l.split(gbBT).length-1)%2)l+=gbBT;lines[nl-1]=l.replace(/[\s,.;:]+$/,'')+'…'}
  for(let k=0;k<lines.length-1;k++)if((lines[k].split(gbBT).length-1)%2){lines[k]+=gbBT;lines[k+1]=gbBT+lines[k+1]}
  return lines};
 /* a journey's pad: its name in at most three lines; a single journey's guard or failure pad: its riskiest one, then how many more */
 const lblOf=(title,list)=>{if(narrow||sap)return null;let lines;
  if(list){list=gbOrd(list);lines=wrap(list[0].title,30,list.length>1?2:3);if(list.length>1)lines.push('+'+(list.length-1)+' more')}
  else lines=wrap(title,30,3);
  return {lines,hgt:lines.length*16+32,w:Math.max(...lines.map(l=>gbW(gbPlain(l),7.1)),150)+18}};
 let L=null;
 for(let pass=0;pass<4;pass++){
  const trees=trees0.map((t,i)=>gbTree(M,t.js,i?H0*Math.max(.5,Math.min(.75,Math.sqrt((t.leaves||1)/Math.max(1,main.leaves||1)))):H0,i%2?-S:S,brn+':'+i,sap));
  /* label boxes, local to each tree */
  for(const T of trees){T.lbl={};for(const pd of T.padList){const j=T.js.find(q=>q.id===pd.jid);const l=pd.pol?lblOf('',pd.leaves):lblOf(j.title);const o=T.origin[pd.id],g=pd.geo,b=pd.b;
    /* on a phone the tree carries numbers, outside the canopy on a short leader */
    if(!l){if(narrow&&!sap&&!pd.pol){const ax=b?o[0]+b.dir*g.PW/2:o[0],ay=b?o[1]-g.PH*.5:o[1]-g.PH*.9,bx=b?ax+b.dir*(g.L*.5+16):o[0],by=b?ay:o[1]-g.PH-g.L*.9-14;(T.badge=T.badge||{})[pd.jid]={x:bx,y:by,ax,ay};T.x0=Math.min(T.x0,bx-12);T.x1=Math.max(T.x1,bx+12);T.y0=Math.min(T.y0,by-14)}continue}
    const n=l.lines.length;
    if(!b){const y=o[1]-g.PH-g.L*.6-13-16*n;T.lbl[pd.id]={...l,x:o[0],y,anchor:'middle',dir:0,pol:pd.pol,jid:pd.jid};T.y0=Math.min(T.y0,y-30);T.x0=Math.min(T.x0,o[0]-l.w/2);T.x1=Math.max(T.x1,o[0]+l.w/2)}
    else{const x=o[0]+b.dir*(g.PW/2+16),ay=o[1]-g.PH*.45;T.lbl[pd.id]={...l,x,y:ay-l.hgt/2+24,anchor:b.dir<0?'end':'start',dir:b.dir,ax:o[0]+b.dir*g.PW/2,ay,pol:pd.pol,jid:pd.jid};T.y0=Math.min(T.y0,ay-l.hgt/2-6);if(b.dir<0)T.x0=Math.min(T.x0,x-l.w);else T.x1=Math.max(T.x1,x+l.w)}}
   for(const dir of [-1,1]){const ls=Object.values(T.lbl).filter(l=>l.dir===dir).sort((a,b)=>a.y-b.y);for(let i=1;i<ls.length;i++)if(ls[i].y<ls[i-1].y+ls[i-1].hgt+8)ls[i].y=ls[i-1].y+ls[i-1].hgt+8}}
  /* place: the main tree at 0, the others on the side its first branch does not reach */
  const xs=[0];let edgeL=trees[0].x0,edgeR=trees[0].x1;
  trees.forEach((T,i)=>{if(!i)return;const d=i%2?-S:S;if(d>0){const x=edgeR+30-T.x0;xs.push(x);edgeR=x+T.x1}else{const x=edgeL-30-T.x1;xs.push(x);edgeL=x+T.x0}});
  const T0=trees[0];const lone=T0.lit&&trees.length===1;
  /* the pot about two thirds of the tree, so the canopy overhangs it */
  let potL=lone?Math.max(.4*H0,96):narrow?Math.max(110,Math.min(760,.66*(T0.cx1-T0.cx0))):Math.max(200,Math.min(760,.64*Math.max(-T0.cy0,T0.cx1-T0.cx0)));
  /* the pot sits under the canopy's mass, so a heavy first branch does not hang off one end */
  const potC=trees.length===1?(lone?0:Math.max(-potL*.2,Math.min(potL*.2,(T0.cx0+T0.cx1)/2*.85))):(Math.min(...xs)+Math.max(...xs))/2;
  if(trees.length>1)potL=Math.max(potL,Math.max(...xs)-Math.min(...xs)+.5*H0);
  const D=lone?22:Math.max(22,Math.min(44,.8*T0.D));
  let x0=Math.min(edgeL,potC-potL/2-10),x1=Math.max(edgeR,potC+potL/2+10),y0=Math.min(...trees.map(T=>T.y0));
  /* roots: one per thing the change depends on, alternating sides; third parties run over the rim, in-repo ones stay on the soil */
  const roots=[];const taken=new Set();
  trees.forEach((T,i)=>{const ids=[...new Set(T.js.flatMap(j=>(j.units||[]).filter(id=>M.U[id]&&M.U[id].root)))].filter(id=>!taken.has(id));if(!i)for(const u of M.strays)ids.push(u.id);
   ids.slice(0,6).forEach((id,k)=>{taken.add(id);const d=k%2?T.S:-T.S,r=Math.floor(k/2);const u=M.U[id];const ext=u.layer==='ext';const X=xs[i];
    const rim=potC+d*potL/2;const reach=Math.abs(rim-X);const len=ext?reach:Math.max(16,Math.min(reach-14,(.2+.07*r)*potL+8));
    const tip=[X+d*len,3+r*1.8];const p=[[X+d*.08*T.D,-1],[X+d*.38*len,1+r],[X+d*.74*len,2.5+r*1.4],tip];let pts=gbBez(p,22);
    if(ext)pts=pts.concat([[tip[0]+d*4,tip[1]+3],[tip[0]+d*6,tip[1]+9],[tip[0]+d*6.5,tip[1]+16]]);
    const w=pts.map((q,ii)=>Math.max(.8,(ext?.18:.26)*T.D*Math.pow(1-ii/(pts.length-1),1.1)+.7));pts=pts.map((q,ii)=>ii<23?[q[0],Math.min(q[1],2.5-w[ii]*.5)]:q);
    roots.push({id,tree:i,d,pts,w,ext,loose:!T.js.some(j=>(j.units||[]).includes(id)),stop:s.stops.some(x=>x.unit===id)})});
   /* the nebari: unlabeled surface roots radiating from the flare, two running out along the soil and two shorter ones toward
      the viewer, each tapering until it sinks */
   (T.lit?[[-1,.08,0],[1,.07,0]]:[[-1,.13,0],[1,.1,0],[-1,.05,1],[1,.06,1]]).forEach(([d,f,fr])=>{const X=xs[i],len=f*potL+6,a0=X+d*(fr?.14:.3)*T.D;
    const pts=gbBez([[a0,0],[a0+d*.45*len,fr?1.6:.8],[a0+d*.8*len,fr?3:1.6],[a0+d*len,fr?4.2:2.4]],14);const w=pts.map((q,ii)=>Math.max(1,(fr?.2:.24)*T.D*Math.pow(1-ii/14,1.1)+.8));
    roots.push({id:null,tree:i,d,pts:pts.map((q,ii)=>[q[0],Math.min(q[1],(fr?4.5:2.5)-w[ii]*.5)]),w})})});
  const rl=[];for(const r of roots){if(!r.id)continue;const tip=r.pts[r.pts.length-1];const t=gwCut(M.U[r.id].label,22);
   if(r.stop){const ex=tip[0]+r.d*(r.ext?6:0)+r.d*(12+gbW('trace stops',6.6)+6);x0=Math.min(x0,ex);x1=Math.max(x1,ex)}
   if(r.ext){const x=tip[0]+r.d*6;rl.push({r,x,y:tip[1]+14,anchor:r.d>0?'start':'end',t});x0=Math.min(x0,x-gbW(t,6.4)-8);x1=Math.max(x1,x+gbW(t,6.4)+8)}
   else{const x=tip[0]+r.d*4;rl.push({r,x,y:-5,anchor:r.d>0?'start':'end',t});x0=Math.min(x0,x-gbW(t,6.4)-8);x1=Math.max(x1,x+gbW(t,6.4)+8)}}
  L={trees,xs,potL,potC,D,roots,rl,x0,x1,y0:y0-8,y1:D+(lone?14:16)+(rl.some(l=>l.r.ext)?26:0),narrow,S,H0,lone};
  const need=L.x1-L.x0+24;if(need<=width||pass===3)break;H0*=Math.max(.55,Math.min(.97,(width-24)/need));}
 return L}

/* Wood grows by elongation: the tip comes out thin and thickens behind it, never a wipe across finished wood. */
function gbPart(pts,w,e,floor){const n=pts.length-1,x=e*n,k=Math.floor(x),f=x-k;const sub=pts.slice(0,k+1);if(k<n&&f>0)sub.push([pts[k][0]+(pts[k+1][0]-pts[k][0])*f,pts[k][1]+(pts[k+1][1]-pts[k][1])*f]);if(sub.length<2)return '';
 const m=sub.length-1,th=.1+.9*Math.pow(e,1.2),tl=Math.max(2,m*.14);return gbRib(sub,sub.map((_,i)=>w[Math.min(i,n)]*th*Math.max(.3,Math.min(1,(m-i)/tl+.3))),0,sub.length-1,floor)}
function gbGrowRun(B){const P=B.grow;if(!P.length)return;for(const g of P){g.full=g.el.getAttribute('d');g.el.setAttribute('d',gbPart(g.pts,g.w,0,g.floor))}
 const end=Math.max(...P.map(g=>g.t0+g.ms));
 const step=now=>{if(gw.B!==B)return;for(const g of P){if(g.done)continue;const p=(now-g.t0)/g.ms;if(p<=0)continue;if(p>=1){g.el.setAttribute('d',g.full);g.done=true;continue}g.el.setAttribute('d',gbPart(g.pts,g.w,1-Math.pow(1-p,2.2),g.floor))}
  if(now<end+30)requestAnimationFrame(step)};requestAnimationFrame(step)}

/* Build the SVG once per shape; later paints only move leaves and toggle classes. */
function gbBuild(M,width,key,sap){const s=gw.state;const L=gbLayout(M,width,sap);const quiet=gwQuiet(),now=performance.now();const N=gw.gbN=(gw.gbN||0)+1;
 const W=Math.max(width,L.x1-L.x0+24),vx=(L.x0+L.x1)/2-W/2,vy=L.y0-14,VH=L.y1-vy+8;
 const svg=sv('svg',{class:'gw-svg gb',viewBox:gbF(vx)+' '+gbF(vy)+' '+gbF(W)+' '+gbF(VH),role:'group','aria-label':'The change as a bonsai: each branch is an end-to-end journey, each leaf one of its scenarios, knots are the files it passes through, roots what it depends on'});
 const defs=sv('defs',{});const clipId='gb-wood'+N,softId='gb-soft'+N;const clip=sv('clipPath',{id:clipId});
 defs.append(clip,sv('filter',{id:softId,x:'-10%',y:'-10%',width:'120%',height:'120%'},sv('feGaussianBlur',{stdDeviation:'2.2'})));svg.append(defs);
 const B={key,L,svg,grow:[],anim:[],pad:{},padsOf:{},brEl:{},leaf:{},clump:{},bud:{},budG:{},knot:{},klbl:{},root:{},lbl:{},vein:{},pos:{},nav:[],navEl:{},cur:{},jinEl:{}};
 const lay=n=>{const g=sv('g',{class:n});svg.append(g);return g};
 const gPot=lay('pots'),gBack=lay('back'),gRoot=lay('roots'),gJin=lay('jins'),gWood=lay('wood');
 const gLight=sv('g',{'clip-path':'url(#'+clipId+')',filter:'url(#'+softId+')'}),gGrain=sv('g',{'clip-path':'url(#'+clipId+')'});svg.append(gLight,gGrain);
 const gFront=lay('front'),gKn=lay('knots'),gBud=lay('buds'),gVein=lay('veins'),gLbl=lay('labels'),gSap=lay('sapl'),gKl=lay('klabels'),gCur=lay('cur');
 B.gCur=gCur;B.gBud=gBud;B.gWood=gWood;B.sapU=sv('path',{class:'sapu',d:''});B.sap=sv('path',{class:'sap',d:''});gSap.append(B.sapU,B.sap);
 /* an animation that has not finished yet: started at its first build, continued by any rebuild */
 const anim=(k,el,delay,ms,kind)=>{if(quiet)return;const t0=gbT(k,delay);if(now-t0>=ms)return;if(kind==='grow')B.grow.push({el,t0,ms,pts:el.__pts,w:el.__w,floor:el.__floor});else B.anim.push([el,t0-now,ms,kind])};
 const piece=(id,pts,w,cls,parent,delay,ms,floor)=>{const d=gbRib(pts,w,0,pts.length-1,floor);const p=sv('path',{d,class:cls});p.__pts=pts;p.__w=w;p.__floor=floor;parent.append(p);clip.append(sv('path',{d}));anim('wood:'+id,p,delay,ms,'grow');return p};
 /* bark: the lit side and the shaded side, softened so they read as roundness, not as stripes; and a few strands of grain */
 const shade=(pts,w,from,parent)=>{const s1=gbSide(pts);parent.append(sv('path',{d:gbBand(pts,w,s1*.2,s1*.98,from),class:'lt'}),sv('path',{d:gbBand(pts,w,-s1*.38,-s1*1.06,from),class:'sh'}))};
 const grain=(pts,w,seed,parent)=>{const r=gbRng(seed);for(const f of [-.6,-.2,.22,.58]){const ph=r()*6.28,a=Math.floor(pts.length*(.02+.08*r())),e=Math.floor(pts.length*(.7+.25*r()));
   const q=pts.slice(a,e).map((p,i)=>{const n=gbNorm(pts,i+a),o=w[i+a]*.5*(f+.07*Math.sin(i*.25+ph));return[p[0]+n[0]*o,p[1]+n[1]*o]}).filter((_,i)=>i%2===0);if(q.length>2)parent.append(sv('path',{d:gbLine(gbSmooth(q,1)),class:'grain'}))}};
 const ribFlat=(pts,w)=>{const A=[],Z=[];pts.forEach((q,i)=>{const n=gbNorm(pts,i),h=w[i]/2;A.push([q[0]+n[0]*h,q[1]+n[1]*h]);Z.push([q[0]-n[0]*h,q[1]-n[1]*h])});return 'M'+A.map(gbP).join(' L')+' L'+Z.reverse().map(gbP).join(' L')+'Z'};
 /* the pot: an unglazed rectangle with a lip and two feet, or a small round bowl for a lone literati */
 const pc=L.potC,pl=L.potL,D=L.D,lone=L.lone;
 if(lone){const r=pl/2;gPot.append(sv('path',{class:'pot',d:'M'+gbF(pc-r)+' 1 L'+gbF(pc+r)+' 1 Q'+gbF(pc+r*.96)+' '+gbF(D)+' '+gbF(pc+r*.55)+' '+gbF(D+2)+' L'+gbF(pc-r*.55)+' '+gbF(D+2)+' Q'+gbF(pc-r*.96)+' '+gbF(D)+' '+gbF(pc-r)+' 1Z'}),
   sv('rect',{class:'pot-rim',x:gbF(pc-r-3),y:-1,width:gbF(2*r+6),height:4,rx:2}),sv('rect',{class:'pot-ft',x:gbF(pc-r*.3),y:gbF(D+2),width:gbF(r*.6),height:3,rx:1}))}
 else{const a=pc-pl/2,b=pc+pl/2,f=.09*pl;gPot.append(sv('path',{class:'pot',d:'M'+gbF(a)+' 2 L'+gbF(b)+' 2 L'+gbF(b-5)+' '+gbF(D)+' L'+gbF(a+5)+' '+gbF(D)+'Z'}),
   sv('rect',{class:'pot-rim',x:gbF(a-4),y:-1,width:gbF(pl+8),height:5,rx:1.5}),sv('rect',{class:'pot-sh',x:gbF(a+5),y:gbF(D-4),width:gbF(pl-10),height:4}),
   sv('rect',{class:'pot-ft',x:gbF(a+.14*pl),y:gbF(D),width:gbF(f),height:5,rx:1}),sv('rect',{class:'pot-ft',x:gbF(b-.14*pl-f),y:gbF(D),width:gbF(f),height:5,rx:1}))}
 const soilL=lone?pc-pl/2:pc-pl/2+2,soilR=lone?pc+pl/2:pc+pl/2-2;let sd='M'+gbF(soilL)+' 0';for(const X of L.xs)sd+=' L'+gbF(X-44)+' 0 Q'+gbF(X)+' -8 '+gbF(X+44)+' 0';sd+=' L'+gbF(soilR)+' 0 L'+gbF(soilR)+' 2.5 L'+gbF(soilL)+' 2.5Z';
 gPot.append(sv('path',{class:'soil',d:sd}));
 /* the pot is the repository */
 let repo='';try{repo=(state.config&&state.config.project)||String(state.dir||'').split('/').pop()||''}catch(e){}
 if(repo&&!lone&&pl>120)gPot.append(sv('text',{x:gbF(pc),y:gbF(D*.5+5),'text-anchor':'middle',class:'potl'},gwCut(repo,Math.floor((pl-40)/7))));
 /* roots */
 L.roots.forEach((r,i)=>{const id='r'+i+(r.id?':'+r.id:'');const g=sv('g',r.id?{class:'rt'+(r.loose?' loose':'')+(r.stop?' stop':''),'data-k':'u:'+r.id,tabindex:-1,role:'button','aria-label':M.U[r.id].label+', what the change depends on'}:{});
  const pts=r.pts;const delay=r.tree*250+80;piece(id,pts,r.w,'w',g,delay,520);
  if(r.id){const n=pts.length,from=Math.floor(n*.3);if(r.ext){const rg=sv('path',{d:gbRib(pts.slice(from),r.w.slice(from).map(v=>Math.max(.7,v*.42))),class:'rg'});g.append(rg);anim('rg:'+id,rg,delay+420,260,'fade')}
   g.append(sv('path',{d:gbLine(pts),class:'hitl','stroke-width':14}));
   if(r.stop){const e=pts[n-1];const tl=sv('g',{},sv('path',{class:'tail',d:'M'+gbP(e)+' q'+gbF(r.d*2)+' 10 '+gbF(-r.d*4)+' 18 q'+gbF(-r.d*6)+' 8 '+gbF(-r.d*2)+' 16'}),
    sv('text',{x:gbF(e[0]+r.d*12),y:gbF(e[1]+38),'text-anchor':r.d>0?'start':'end',class:'note'},'trace stops'));g.append(tl);anim('tail:'+id,tl,delay+520,300,'fade')}
   B.root[r.id]=g;B.pos[r.id]=pts[Math.min(n-1,Math.floor(n*(r.ext?.42:.7)))];B.nav.push('u:'+r.id);B.navEl['u:'+r.id]=g}
  gRoot.append(g)});
 for(const l of L.rl){const t=sv('text',{x:gbF(l.x),y:gbF(l.y),'text-anchor':l.anchor,class:'rlbl'},l.t);(B.root[l.r.id]||gRoot).append(t);anim('rl:'+l.r.id,t,l.r.tree*250+560,300,'fade')}
 let lightAt=0;
 /* trees */
 L.trees.forEach((T,ti)=>{const X=L.xs[ti];const sh=q=>[q[0]+X,q[1]];const base=ti*250;const tp=T.tp.map(sh);
  const tdur=sap?900:1100;piece('t'+ti+':'+T.js.map(j=>j.id).join(','),tp,T.tw,'w',gWood,base,tdur,1.5);shade(tp,T.tw,2,gLight);grain(tp,T.tw,gbHash('grain:'+T.key),gGrain);lightAt=Math.max(lightAt,base+tdur);
  const at=t=>base+tdur*Math.pow(Math.max(0,t),.9)*.92;
  /* while the change is still being traced the tree is a sapling, with a bud at its tip */
  if(sap){const tt=tp[tp.length-1];const bd=sv('ellipse',{cx:gbF(tt[0]),cy:gbF(tt[1]-3),rx:3.4,ry:5,class:'tipbud'});gWood.append(bd);anim('tipbud:'+ti,bd,base+tdur-120,300,'fade')}
  /* jin: changed parts no journey reaches, as bleached deadwood on the back of the main trunk */
  if(!ti&&!sap){M.jin.slice(0,3).forEach((u,i)=>{const t=.15+.075*i,k=gbNear(T.ty,t),p=tp[k],d=i%2?T.S:-T.S,len=.07*T.H;const a=55*Math.PI/180;
    const pts=gbBez([p,[p[0]+d*len*.35,p[1]-len*.1],[p[0]+d*len*.7,p[1]-len*.5],[p[0]+d*Math.cos(a)*len,p[1]-Math.sin(a)*len]],10);const w=pts.map((q,ii)=>Math.max(1.4,5.2*(1-ii/10*.75)));
    const g=sv('g',{class:'jn','data-k':'u:'+u.id,tabindex:-1,role:'button','aria-label':u.label+': changed, but no journey in this change reaches it'});
    piece('j'+ti+'-'+u.id,pts,w,'jin',g,at(t),500);g.append(sv('circle',{cx:gbF(pts[10][0]),cy:gbF(pts[10][1]),r:9,class:'hitc'}));gJin.append(g);B.jinEl[u.id]=g;B.pos[u.id]=pts[10];B.nav.push('u:'+u.id);B.navEl['u:'+u.id]=g})}
  /* one group per pad: its branch, branchlets, knots, foliage and leaves, so dimming or pruning a journey treats it as one thing */
  const JG={};for(const pd of [...T.padList.slice(1).sort((a,b)=>a.b.h-b.b.h),T.padList[0]]){const back=pd.b&&pd.b.back;const jg=sv('g',{class:'jg'+(pd.crown?' crown':''),'data-pad':pd.id});(back?gBack:gFront).append(jg);JG[pd.id]=jg}
  /* branches: the wood fades in from the trunk's edge so the joint has no seam, a collar fills the crotch, branchlets fork
     up into the pad, and pruning leaves a short stub with a flat cut */
  for(const b of T.br){const pts=b.pts.map(sh),id='b'+ti+':'+b.id,jg=JG[b.id];const delay=at(b.h),ms=380+1.5*b.len;const old=b.back?' old':'';
   const mid='gb-bm'+N+'-'+ti+'-'+b.i,e0=pts[gbNear(b.acc,b.Tk*.28)],e1=pts[gbNear(b.acc,b.Tk*.5+12)];
   defs.append(sv('linearGradient',{id:mid+'g',gradientUnits:'userSpaceOnUse',x1:gbF(e0[0]),y1:gbF(e0[1]),x2:gbF(e1[0]),y2:gbF(e1[1])},sv('stop',{offset:'0','stop-color':'#fff','stop-opacity':'0'}),sv('stop',{offset:'1','stop-color':'#fff','stop-opacity':'1'})),
    sv('mask',{id:mid,maskUnits:'userSpaceOnUse',x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH)},sv('rect',{x:gbF(vx),y:gbF(vy),width:gbF(W),height:gbF(VH),fill:'url(#'+mid+'g)'})));
   const wg=sv('g',{class:'brg',mask:'url(#'+mid+')'});jg.append(wg);piece(id,pts,b.w,'w'+old,wg,delay,ms);lightAt=Math.max(lightAt,delay+ms);
   if(!b.back){const bl=sv('g',{'clip-path':'url(#'+clipId+')',filter:'url(#'+softId+')'});wg.append(bl);shade(pts,b.w,b.exit,bl);anim('bl:'+id,bl,delay+ms,350,'fade')}
   const k=b.k,c=tp[k],tn=gbNorm(tp,k),sgn=(tn[0]*b.dir>0)?1:-1;const edge=kk=>{const q=tp[Math.max(0,Math.min(tp.length-1,kk))],n=gbNorm(tp,kk),hw=T.tw[Math.max(0,Math.min(tp.length-1,kk))]/2*sgn;return[q[0]+n[0]*hw,q[1]+n[1]*hw]};
   const up=Math.max(2,Math.round(.75*b.b/((T.Ht*1.05)/96))),dn=Math.max(1,Math.round(.5*b.b/((T.Ht*1.05)/96)));
   const eo=b.exit,bn=gbNorm(pts,eo+2),ub=bn[1]<0?1:-1;const bE=(ii,s1)=>{const q=pts[Math.min(pts.length-1,ii)],n=gbNorm(pts,ii),hw=b.w[Math.min(pts.length-1,ii)]/2*s1;return[q[0]+n[0]*hw,q[1]+n[1]*hw]};
   const A=edge(k+up),Bp=bE(eo+3,ub),Cc=bE(eo,ub),A2=edge(k-dn),B2=bE(eo+2,-ub),C2=bE(eo,-ub);
   const fil=(a,bb,cc)=>{const mid2=[(a[0]+bb[0])/2,(a[1]+bb[1])/2],ctl=[cc[0]+(mid2[0]-cc[0])*.45,cc[1]+(mid2[1]-cc[1])*.45];return 'M'+gbP(a)+' Q'+gbP(ctl)+' '+gbP(bb)+' L'+gbP(pts[Math.min(pts.length-1,eo+3)])+' L'+gbP(c)+'Z'};
   for(const f of [fil(A,Bp,Cc),fil(A2,B2,C2)]){const fp=sv('path',{d:f,class:'w'+old});(b.back?wg:gWood).append(fp);clip.append(sv('path',{d:f}));anim('fil:'+id+f.length,fp,delay+ms*.25,240,'fade')}
   b.twigs.forEach((t,tk)=>{const tpp=t.pts.map(sh);const tw=sv('path',{d:gbRib(tpp,t.w),class:'tw'+old});tw.__pts=tpp;tw.__w=t.w;jg.append(tw);anim('tw:'+id+':'+tk,tw,delay+ms*(.5+.1*tk),320,'grow')});
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
  T.ctw.forEach((t,tk)=>{const tpp=t.pts.map(sh);const tw=sv('path',{d:gbRib(tpp,t.w),class:'tw'});tw.__pts=tpp;tw.__w=t.w;JG[T.apex.id].append(tw);anim('ctw:'+ti+':'+tk,tw,base+tdur*.9,320,'grow')});
  /* knots: a raised boss on the bark, its file named beside it when its journey is lit */
  const padBox=T.padList.map(pd=>{const o=sh(T.origin[pd.id]),g=pd.geo;return [o[0]-g.PW/2,o[1]-g.PH-g.L*.6,o[0]+g.PW/2,o[1]+(pd.geo.slot.size?g.L+12:4)]});const placed=L.rl.map(l=>{const w0=gbW(l.t,6.4),x0=l.anchor==='start'?l.x:l.anchor==='end'?l.x-w0:l.x-w0/2;return [x0-2,l.y-10,x0+w0+2,l.y+3]});
  T.knots.forEach(kn=>{const q=sh(kn.p);placed.push([q[0]-6,q[1]-6,q[0]+6,q[1]+6])});placed.push([L.potC-L.potL/2,-6,L.potC+L.potL/2,L.D]);for(let k=0;k<tp.length;k+=2)padBox.push([tp[k][0]-T.tw[k]/2,tp[k][1]-2,tp[k][0]+T.tw[k]/2,tp[k][1]+2]);
  const ov=(r,q)=>Math.max(0,Math.min(r[2],q[2])-Math.max(r[0],q[0]))*Math.max(0,Math.min(r[3],q[3])-Math.max(r[1],q[1]));
  const hits=(r)=>padBox.reduce((a,q)=>a+ov(r,q),0)+placed.reduce((a,q)=>a+ov(r,q),0)*3;
  T.knots.forEach((kn,ki)=>{const p0=sh(kn.p),n=kn.n;const off=(ki%2?-1:1)*kn.w*.14;const p=[p0[0]+n[0]*off,p0[1]+n[1]*off];
   const rx=Math.min(4.4,kn.w*.1+2.6),ry=rx*.66,ang=Math.atan2(n[1],n[0])*180/Math.PI,tg=[n[1],-n[0]];const hr=Math.min(rx,ry)*.78;
   const arc='M'+gbP([p[0]+hr*Math.cos(3.4),p[1]+hr*Math.sin(3.4)])+' A'+gbF(hr)+' '+gbF(hr)+' 0 0 1 '+gbP([p[0]+hr*Math.cos(4.9),p[1]+hr*Math.sin(4.9)]);
   const cr=[[-1,0],[-.45,.55],[0,-.45],[.45,.5],[1,0]].map(([u,v])=>[p[0]+tg[0]*u*(ry+5)+n[0]*v*2.2,p[1]+tg[1]*u*(ry+5)+n[1]*v*2.2]);
   const u=M.U[kn.id];const g=sv('g',{class:'kn','data-k':'u:'+kn.id,tabindex:-1,role:'button','aria-label':(u?u.label:kn.id)+', a part of the change'},
    sv('ellipse',{cx:gbF(p[0]),cy:gbF(p[1]),rx:gbF(rx),ry:gbF(ry),transform:'rotate('+gbF(ang)+' '+gbP(p)+')',class:'k2'}),sv('path',{d:arc,class:'kh'}),
    sv('ellipse',{cx:gbF(p[0]),cy:gbF(p[1]),rx:gbF(rx+2.6),ry:gbF(ry+2.6),transform:'rotate('+gbF(ang)+' '+gbP(p)+')',class:'ring'}),sv('path',{d:gbLine(cr),class:'crack'}),
    sv('circle',{cx:gbF(p[0]),cy:gbF(p[1]),r:Math.max(8,rx+3),class:'hitc'}));
   (kn.bid?JG[kn.bid]:gKn).append(g);B.knot[kn.id]=g;B.pos[kn.id]=p0;g.__n=n;g.__w=kn.w;g.__on=kn.on;
   const t=kn.on==='t'?kn.t:T.br.find(x=>'b'+x.i===kn.on).h;anim('kn:'+kn.id,g,at(t)+200,300,'fade');
   if(u){const txt=gwCut(u.label,24),tw2=gbW(txt,6.2);let best=null;
    const cands=kn.bid?[n[1]>0?1:-1]:[1,-1];for(const dy of [0,-13,13,-26,26,-39,39])for(const dx of [0,-28,28])for(const sd of cands){const q=[p0[0]+n[0]*sd*(kn.w/2+8)+dx,p0[1]+n[1]*sd*(kn.w/2+8)+3.5+dy];const anc=kn.bid?'middle':(n[0]*sd>0?'start':'end');
     const x0=anc==='start'?q[0]:anc==='end'?q[0]-tw2:q[0]-tw2/2;const r=[x0-2,q[1]-10,x0+tw2+2,q[1]+3];const sc=hits(r)*4+Math.abs(dy)+Math.abs(dx)*.6;if(!best||sc<best.sc)best={q,anc,r,sc}}
    placed.push(best.r);const kl=sv('text',{x:gbF(best.q[0]),y:gbF(best.q[1]),'text-anchor':best.anc,class:'klbl'},txt);gKl.append(kl);B.klbl[kn.id]=kl;
    /* a label pushed off its knot keeps a hairline back to it */
    const r=best.r,e=[Math.max(r[0]+2,Math.min(r[2]-2,p[0])),Math.max(r[1]+1,Math.min(r[3]-1,p[1]))],dd=Math.hypot(e[0]-p[0],e[1]-p[1]);
    if(dd>12){const ux=(e[0]-p[0])/dd,uy=(e[1]-p[1])/dd;gKl.append(sv('path',{class:'kld',d:'M'+gbP([p[0]+ux*6,p[1]+uy*6])+' L'+gbP([e[0]-ux*2,e[1]-uy*2])}))}}});
  /* veins: the route each pad's sap takes, shown live while its journey runs and traced on hover */
  for(const pid of T.lanes){const v=T.veins[pid];const tr=v.trunk.map(sh),bp=v.branch.map(sh);const o=sh(v.pad);const all=gbSmooth([...tr,...bp],2);
   const p1=sv('path',{d:gbLine(all),class:'vein'});gVein.append(p1);B.vein[pid]={els:[p1],jid:v.jid,pts:all,pad:o,tree:ti}}
  /* pads, grown at the size of every leaf they hold, and their labels */
  T.padList.forEach((pd,pi)=>{const o=sh(T.origin[pd.id]),g=pd.geo,jid=pd.jid;const back=pd.b&&pd.b.back;const jg=JG[pd.id];const gid='gb-pg'+N+'-'+ti+'-'+pi,cid='gb-pc'+N+'-'+ti+'-'+pi;
   const grad=sv('linearGradient',{id:gid,gradientUnits:'userSpaceOnUse',x1:gbF(o[0]),y1:gbF(o[1]-g.PH-g.L*.5),x2:gbF(o[0]),y2:gbF(o[1])},sv('stop',{offset:'0',class:'g0'}),sv('stop',{offset:'.58',class:'g1'}),sv('stop',{offset:'1',class:'g2'}));
   const pclip=sv('clipPath',{id:cid},sv('rect',{x:gbF(o[0]-g.PW),y:gbF(o[1]-g.PH*3-g.L*2),width:gbF(g.PW*2),height:gbF(g.PH*3+g.L*2)}));
   const fol=sv('g',{class:'fol','clip-path':'url(#'+cid+')',fill:'url(#'+gid+')'});
   for(const c of g.body)fol.append(sv('circle',{cx:gbF(o[0]+c[0]),cy:gbF(o[1]+c[1]),r:gbF(c[2])}));
   for(const [id,c] of g.leafC){const el=sv('circle',{cx:gbF(o[0]+c[0]),cy:gbF(o[1]+c[1]),r:gbF(c[2]),class:'clp'});fol.append(el);B.clump[id]=el}
   const pg=sv('g',{class:'pad'+(pd.crown?' crown':'')+(back?' back':''),'data-k':'j:'+jid,'data-pad':pd.id,tabindex:-1,role:'button'},grad,pclip,fol,sv('ellipse',{cx:gbF(o[0]),cy:gbF(o[1]-5),rx:6,ry:4.6,class:'bud0'}));
   jg.append(pg);const lg=sv('g',{});jg.append(lg);
   const delay=pd.b?at(pd.b.h)+380+1.5*pd.b.len:base+tdur;
   B.pad[pd.id]={el:pg,jg,o,geo:g,jid,pol:pd.pol,crown:pd.crown,b:pd.b,lg,leaves:pd.leaves,delay,tree:ti};(B.padsOf[jid]=B.padsOf[jid]||[]).push(pd.id);
   if(!quiet){const t0=gbT('pad:'+pd.id,delay);if(now-t0<450){pg.style.transformBox='fill-box';pg.style.transformOrigin='center bottom';B.anim.push([pg,t0-now,450,'pop'])}}
   if(!sap&&!pd.pol){B.nav.push('j:'+jid);B.navEl['j:'+jid]=pg}});
  for(const pid in T.lbl){const l=T.lbl[pid],pd=T.pads[pid];const back=pd.b&&pd.b.back;const lx=l.x+X,ly=l.y;
   const gl=sv('g',{class:'lbl'+(back?' back':''),'data-k':'j:'+l.jid,'data-pad':pid});const eb=sv('text',{x:gbF(lx),y:gbF(ly-18),'text-anchor':l.anchor,class:'eb'},'');gl.append(eb);
   const tl=l.lines.map((line,i)=>gbRich(sv('text',{x:gbF(lx),y:gbF(ly+16*i),'text-anchor':l.anchor,class:'t'+(l.pol?' v':'')}),line));gl.append(...tl);
   const t2=sv('text',{x:gbF(lx),y:gbF(ly+16*l.lines.length+1),'text-anchor':l.anchor,class:'st'});gl.append(t2);
   const mid=ly-29+l.hgt/2;if(l.dir&&Math.abs(mid-l.ay)>12)gl.append(sv('path',{class:'leader',d:'M'+gbF(l.ax+X+l.dir*3)+' '+gbF(l.ay)+' L'+gbF(lx-l.dir*4)+' '+gbF(mid)}));
   gLbl.append(gl);B.lbl[pid]={el:gl,eb,t2,tl,pol:l.pol,jid:l.jid};anim('lbl:'+pid,gl,B.pad[pid].delay+250,350,'fade')}
  /* on a phone the names go in the list under the tree; the tree carries their numbers, just outside each pad */
  for(const jid in (T.badge||{})){const q=T.badge[jid];const bx=q.x+X,ax=q.ax+X;
   const gl=sv('g',{class:'badge','data-k':'j:'+jid},sv('path',{class:'leader',d:'M'+gbF(ax)+' '+gbF(q.ay)+' L'+gbF(bx+(bx>ax?-10:bx<ax?10:0))+' '+gbF(q.y+(bx===ax?10:0))}),sv('circle',{cx:gbF(bx),cy:gbF(q.y),r:10}),sv('text',{x:gbF(bx),y:gbF(q.y)},''));
   gLbl.append(gl);B.lbl[jid]={el:gl,num:gl.lastChild,badge:true,jid}}
 });
 if(L.trees.length&&M.jin.length>3&&!sap){const T=L.trees[0],p=T.tp[gbNear(T.ty,.4)];gJin.append(sv('text',{x:gbF(p[0]-T.S*28),y:gbF(p[1]),'text-anchor':T.S>0?'end':'start',class:'note'},'+'+(M.jin.length-3)+' changed, on no journey'))}
 /* the bark's light comes in once the wood it lies on has grown */
 anim('light',gLight,lightAt,400,'fade');anim('grain',gGrain,lightAt,400,'fade');
 /* hover, focus, click and keys: one tab stop, arrows move between pads, knots and roots, and along a journey's leaves */
 const keyOf=e=>{const t=e.target.closest&&e.target.closest('[data-k]');return t?t.getAttribute('data-k'):null};
 svg.addEventListener('pointerover',e=>{const el=e.target.closest&&e.target.closest('[data-k]');if(el!==gw.hovEl){gw.hovEl=el;gbHover(el?el.getAttribute('data-k'):null,el)}});
 svg.addEventListener('pointerleave',()=>{gw.hovEl=null;gbHover(null)});
 svg.addEventListener('focusin',e=>{const k=keyOf(e);if(k){gbRove(e.target.closest('[data-k]'));gbHover(k,e.target.closest('[data-k]'))}});
 svg.addEventListener('focusout',e=>{if(!svg.contains(e.relatedTarget))gbHover(null)});
 svg.addEventListener('click',e=>{let k=keyOf(e);if(!k)k=gbNearLeaf(e);if(!k)return;gw.pinned=gw.pinned===k?null:k;if(gw.B&&gw.B.tip&&gw.pinned)gw.B.tip.hidden=true;growPaint()});
 svg.addEventListener('keydown',gbKeys);
 B.tip=h('div',{class:'gb-tip',hidden:true,role:'status'});B.width=width;
 gw.B=B;gw.svg=svg;
 const first=B.navEl[B.nav.find(k=>k.startsWith('j:'))||B.nav[0]];if(first)first.setAttribute('tabindex','0');
 if(svg.animate)for(const [el,delay,ms,kind] of B.anim){if(kind==='fade')el.animate([{opacity:0},{opacity:1}],{duration:ms,delay,fill:'backwards'});else if(kind==='pop')el.animate([{transform:'scale(.2)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:ms,delay,easing:'cubic-bezier(.2,.8,.3,1.1)',fill:'backwards'})}
 gbGrowRun(B);
 return B}
/* A tap that lands between leaves picks the nearest leaf within 14 px, so single leaves can be chosen on a phone. */
function gbNearLeaf(e){const B=gw.B;if(!B||e.pointerType==='mouse')return null;let best=null,bd=14;
 for(const id in B.leaf){const el=B.leaf[id];if(el.classList.contains('gone'))continue;const r=el.getBoundingClientRect();const d=Math.hypot(r.left+r.width/2-e.clientX,r.top+r.height/2-e.clientY);if(d<bd){bd=d;best='s:'+id}}return best}

/* The same leaf with a bite out of its upper edge: how a failed scenario looks, in any theme and on any ground. */
function gbLeafBite(L,W){const a=-L/2,b=L/2;const up=[[a,0],[a+.22*L,-.62*W],[b-.32*L,-.62*W],[b,0]];const c=[L*.12,-W*.66],r=W*.5;
 const pts=gbBez(up,18).map(q=>{const d=Math.hypot(q[0]-c[0],q[1]-c[1]);return d<r?[c[0]+(q[0]-c[0])/(d||1)*r,c[1]+(q[1]-c[1])/(d||1)*r]:q});
 return 'M'+pts.map(gbP).join(' L')+' C'+gbF(b-.32*L)+' '+gbF(.62*W)+' '+gbF(a+.22*L)+' '+gbF(.62*W)+' '+gbF(a)+' 0Z'}
const gbLeafD=(L,W)=>{const a=-L/2,b=L/2;return 'M'+gbF(a)+' 0 C'+gbF(a+.22*L)+' '+gbF(-.62*W)+' '+gbF(b-.32*L)+' '+gbF(-.62*W)+' '+gbF(b)+' 0 C'+gbF(b-.32*L)+' '+gbF(.62*W)+' '+gbF(a+.22*L)+' '+gbF(.62*W)+' '+gbF(a)+' 0Z'};
/* A leaf: a stem (shown when it hangs), a paper halo so it reads on wood and pad alike, the blade and its midrib, and the
   bite a failed scenario takes out of it. */
function gbLeafEl(x,L,W,hang){const inner=sv('g',{class:'gb-lfi'},sv('circle',{r:gbF(Math.max(8.5,L*.6)),class:'hitc'}),sv('path',{d:'M'+gbF(-L/2-10.5)+' 0 L'+gbF(-L/2+1.5)+' 0',class:'pet'}),sv('path',{d:gbLeafD(L,W),class:'lh bn'}),sv('path',{d:gbLeafBite(L,W),class:'lh bb'}),sv('path',{d:gbLeafD(L,W),class:'blade bn'}),sv('path',{d:gbLeafBite(L,W),class:'blade bb'}),
  sv('path',{d:'M'+gbF(-L/2+1.6)+' 0 L'+gbF(L/2-2.4)+' 0',class:'rib'}));
 const el=sv('g',{class:'gb-lf','data-k':'s:'+x.id,tabindex:-1,role:'button'},sv('path',{d:hang?'M'+gbF(-L/2-10.5)+' 0 L'+gbF(-L/2-5)+' 0':'M'+gbF(-L/2-4)+' 0 L'+gbF(-L/2+.5)+' 0',class:'stem0'}),inner);el.__inner=inner;return el}
function gbLeafState(x){const s=gw.state;const r=s.run[x.id];
 if(r){if(r.st==='pass')return x.ext.some(e=>s.ext[e]&&s.ext[e].state!=='proven')?'pass warn':'pass';if(r.st==='fail')return 'fail';if(r.st==='run')return 'run';return x.flow?'idle':'none'}
 return !s.modeBy&&gbRank[x.mode]>0?'pre':'in'}
function gbStateWord(x){const s=gw.state;const r=s.run[x.id];if(r){if(r.st==='pass')return {c:'pass',t:'passed in '+gwDur(r.ms||0)+(x.ext.some(e=>s.ext[e]&&s.ext[e].state!=='proven')?', resting on agent-written work not yet reviewed':'')};
  if(r.st==='fail')return {c:'fail',t:'failed: '+(r.why||'see the run')};if(r.st==='run')return {c:'run',t:'running now'};return {c:'',t:x.flow?'to prove'+(r.why?': '+r.why:''):'no flow yet'}}
 if(gbRank[x.mode]>gbRank[s.mode]&&s.modeBy)return {c:'',t:'pruned: proved in '+GW.modes.find(m=>m.id===x.mode).label};
 return {c:'',t:'drafted'+(x.flow?', runs '+x.flow:', no flow yet')+(s.modeBy?'':' · in '+GW.modes.find(m=>m.id===x.mode).label)}}
/* Where a failure happened, read from its message: the first part of the journey whose route or command it names. */
function gbWound(M,j,x){const r=gw.state.run[x.id];if(!r||r.st!=='fail'||!r.why)return null;for(const id of j.units){const u=M.U[id];if(u&&!u.root&&(r.why.includes(u.label)||(u.unitKind==='route'&&r.why.includes(u.label.split(' ').pop()))))return id}return null}
const gbModeName=id=>(GW.modes.find(m=>m.id===id)||{label:id}).label;
const gbSURFW={browser:'BROWSER',http:'HTTP',terminal:'CLI',job:'JOB'};
/* A pad's state in words, each with its colour: failed red, passed green, running gold, the rest muted. */
function gbTok(list,j,vis,inMode){const s=gw.state;if(!list.length)return [[(gbWHERE[j.surface]||'')+' · '+j.units.length+' part'+(j.units.length===1?'':'s'),'n']];
 const inm=list.filter(inMode),ran=inm.filter(x=>s.run[x.id]),c=k=>ran.filter(x=>s.run[x.id].st===k).length,pr=vis?list.length-inm.length:0;
 if(vis&&!inm.length){const lo=list.reduce((a,x)=>gbRank[x.mode]<gbRank[a]?x.mode:a,'max');return [['pruned in '+gbModeName(vis)+' · '+gbModeName(lo)+' grows '+(list.length===1?'it':'them'),'n']]}
 const T=[];if(c('fail'))T.push([c('fail')+' failed','f']);if(c('pass'))T.push([c('pass')+' passed','p']);if(c('run'))T.push([c('run')+' running','r']);
 const open=inm.filter(x=>{const r=s.run[x.id];return !r||r.st==='not_run'}),nf=open.filter(x=>!x.flow).length,tp=open.length-nf;
 if(!ran.length&&!s.modeBy)T.push([list.length+' drafted · '+list.filter(x=>x.mode==='min').length+' in Minimum','n']);else{if(tp)T.push([tp+' to prove','n']);if(nf)T.push([nf+' no flow yet','n'])}
 if(pr)T.push(['+'+pr+' pruned','n']);return T}
const gbNext=id=>GW.modes[Math.min(GW.modes.length-1,GW.modes.findIndex(m=>m.id===id)+1)].id;

function gbPaint(){const s=gw.state;const M=gbModel();const sap=!M.trees.length;const width=gbWidth();
 const pc=list=>['happy','guard','failure'].map(p=>list.filter(x=>gbPol(x)===p).length).join('.');
 const key=(sap?'sap:'+s.units.map(u=>u.id).join(','):M.trees.map(t=>t.js.map(j=>j.id+'='+j.units.join('+')+'#'+pc(M.leaves[j.id])).join(';')).join('|'))+'|jin='+M.jin.map(u=>u.id).join(',')+'|'+M.strays.map(u=>u.id).join(',')+'|'+(s.stops.map(x=>x.unit).join(','))+'|w='+width;
 if(!gw.B||gw.B.key!==key){gbBuild(M,width,key,sap)}
 const B=gw.B;gw.M=M;const vis=s.modeBy?s.mode:null;const pv=gw.preview&&!s.modeBy?gw.preview:null;let n=0;const quiet=gwQuiet();
 /* journeys are numbered by what they prove (spec criteria, then scenarios), wherever they grow */
 const imp=(a,b)=>M.crit(b).size-M.crit(a).size||M.leaves[b.id].length-M.leaves[a.id].length||M.weight(b)-M.weight(a)||(a.id<b.id?-1:1);
 const order=[];for(const T of B.L.trees){if(sap)break;order.push(...T.js.slice().sort(imp))}
 gw.order=order.map(j=>j.id);
 const inMode=x=>!vis||gbRank[x.mode]<=gbRank[vis];
 for(const j of order){n++;const all=M.leaves[j.id];let mainCut=false;
  for(const pid of B.padsOf[j.id]||[]){const P=B.pad[pid];const list=gbOrd(P.leaves);const g=P.geo;let shown=0,failed=false,cutN=0;
   list.forEach((x,i)=>{const sl=g.slot.get(x.id)||[0,-g.PH*.5,0];let el=B.leaf[x.id];const now=performance.now();
    if(!el){el=gbLeafEl(x,g.L,g.W,sl[4]);P.lg.append(el);B.leaf[x.id]=el;el.__j=j.id;el.__p=pid;
     if(!quiet&&el.__inner.animate){const t0=gbT('pad:'+pid,P.delay)+320+i*40;if(now-t0<260)el.__inner.animate([{transform:'scale(0)'},{transform:'scale(1)'}],{duration:260,delay:t0-now,easing:'cubic-bezier(.2,.8,.3,1.3)',fill:'backwards'})}}
    el.style.transform='translate('+gbF(P.o[0]+sl[0])+'px,'+gbF(P.o[1]+sl[1])+'px) rotate('+gbF(sl[2]+(gbHash(x.id)-.5)*(sl[4]?8:14))+'deg)'+(sl[3]&&sl[3]!==1?' scale('+sl[3]+')':'');
    const im=inMode(x);const was=el.__in;el.__in=im;let cls='gb-lf '+gbLeafState(x)+(sl[4]?' hang':'');
    /* pruning: a leaf the chosen mode drops falls once, one after another, then only its cut stem is left */
    if(!im){if(was===true&&!quiet){el.__cutAt=Date.now();el.__lag=i*70;el.__inner.style.animationDelay=el.__lag+'ms';setTimeout(()=>{if(el.__in===false){el.classList.replace('cut','gone');gbPaint()}},620+el.__lag)}
     cls+=el.__cutAt&&Date.now()-el.__cutAt<600+(el.__lag||0)?' cut':' gone'}else{el.__cutAt=0;el.__inner.style.animationDelay=''}
    if(pv){const keep=gbRank[x.mode]<=gbRank[pv];cls+=keep?' pv-in':' pv-out';if(!keep)cutN++}
    el.setAttribute('class',cls);el.setAttribute('aria-label','Scenario: '+x.title+', '+gbStateWord(x).t);
    const cl=B.clump[x.id];if(cl)cl.classList.toggle('gone',!im);
    if(im){shown++;if(s.run[x.id]&&s.run[x.id].st==='fail')failed=true}});
   /* a pad the mode keeps nothing of is cut back: once its leaves have fallen, the branch drops away and leaves a stub */
   const falling=list.some(x=>B.leaf[x.id]&&B.leaf[x.id].classList.contains('cut'));const pruned=!!vis&&list.length>0&&!shown;const bare=!list.length;const cut=pruned&&!falling;
   P.el.setAttribute('class','pad'+(P.crown?' crown':'')+(P.b&&P.b.back?' back':'')+(bare?' bare':'')+(failed?' failed':'')+(gw.pinned==='j:'+j.id?' sel':''));
   P.el.setAttribute('aria-label',(P.pol?'Journey '+n+', '+(P.pol==='failure'?'the ways it fails':'what it refuses'):'Journey '+n+', '+j.title)+(pruned?', pruned in '+gbModeName(vis):''));
   if(cut&&!P.cutDone){P.cutDone=true;if(!quiet&&P.shown&&P.jg.animate){P.jg.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(20px)',opacity:0}],{duration:450,easing:'ease-in'}).onfinish=()=>{if(P.cutDone)P.jg.classList.add('pruned')}}else P.jg.classList.add('pruned')}
   if(!cut){P.cutDone=false;P.jg.classList.remove('pruned')}P.shown=!cut;
   const willCut=!!pv&&!P.crown&&list.length>0&&cutN===list.length;P.jg.classList.toggle('pv-cut',willCut);
   const E=B.brEl[pid];if(E){const was=E.stub.classList.contains('on');E.stub.classList.toggle('on',cut);if(cut&&!was&&!quiet&&E.stub.animate)E.stub.animate([{opacity:0},{opacity:1}],{duration:300,delay:350,fill:'backwards'});
    E.cutmk.classList.toggle('on',willCut);E.cuttag.classList.toggle('on',willCut);if(willCut)E.cuttag.textContent='cut · '+list.length}
   P.pruned=pruned;P.cut=cut;if(!P.pol&&cut)mainCut=true}
  /* each label speaks for its own pad: the journey's name or its riskiest guard or failure, then their state, one colour per word */
  for(const pid of B.padsOf[j.id]||[]){const P=B.pad[pid],lb=B.lbl[pid];if(!lb||lb.badge)continue;const list=P.leaves;
   lb.eb.textContent='JOURNEY '+n+' · '+(P.pol==='guard'?'WHAT IT REFUSES':P.pol==='failure'?'HOW IT FAILS':(gbSURFW[j.surface]||'START'));
   lb.t2.replaceChildren(...gbTok(list,j,vis,inMode).flatMap((t,i)=>(i?[sv('tspan',{class:'n'},' · ')]:[]).concat([sv('tspan',{class:t[1]},t[0])])));
   const fails=list.some(x=>inMode(x)&&s.run[x.id]&&s.run[x.id].st==='fail');
   lb.el.setAttribute('class','lbl'+((P.b&&P.b.back)||P.pruned?' back':'')+(P.cut&&!P.crown?' pruned':'')+(fails?' fail':'')+(gw.pinned==='j:'+j.id?' sel':''))}
  const bd=B.lbl[j.id];if(bd&&bd.badge){bd.num.textContent=String(n);bd.el.setAttribute('class','badge'+(all.some(x=>inMode(x)&&s.run[x.id]&&s.run[x.id].st==='fail')?' fail':'')+(mainCut?' pruned':'')+(gw.pinned==='j:'+j.id?' sel':''))}}
 /* Max: each part's own checks and the regressions that reach it grow as one short shoot from its knot, at most five buds
    and then a count; a dependency's checks lie along its root */
 const showBuds=(vis?vis==='max':true)&&!(pv&&pv!=='max');const placed=[];let si=0;
 for(const uid in M.buds){const at=B.pos[uid];if(!at)continue;const list=gbOrd(M.buds[uid]);let g=B.budG[uid];
  if(!g){const kn=B.knot[uid],u=M.U[uid];const el=sv('g',{class:'budg'});B.gBud.append(el);const k=Math.min(list.length,5);const slots=[];
   const rr=u&&u.root?B.L.roots.find(q=>q.id===uid):null;
   if(rr){const pts=gbResample(rr.pts,20);for(let i=0;i<k;i++){const ii=Math.min(19,Math.round(5+i*13/Math.max(1,k-1))),q=pts[ii],nx=gbNorm(pts,ii),sd=i%2?1:-1,ang=Math.atan2(pts[ii+1][1]-q[1],pts[ii+1][0]-q[0])*180/Math.PI;
     slots.push([q[0]+nx[0]*sd*4,q[1]+nx[1]*sd*4,ang+sd*35])}if(list.length>k){const q=pts[20];slots.more=[q[0]+rr.d*8,q[1]+10]}}
   else{const nn=kn?kn.__n:[0,-1],r0=kn?kn.__w/2:1;let sd=si%2?1:-1,a,tip,u0,len=18+2*k;
    for(let tries=0;tries<3;tries++){const dir=[nn[0]*sd,nn[1]*sd-(tries===2?.9:.45)],m=Math.hypot(dir[0],dir[1])||1;u0=[dir[0]/m,dir[1]/m];a=[at[0]+nn[0]*sd*r0,at[1]+nn[1]*sd*r0];tip=[a[0]+u0[0]*len,a[1]+u0[1]*len];
     if(!placed.some(q=>Math.hypot(q[0]-tip[0],q[1]-tip[1])<14||Math.hypot(q[2]-a[0],q[3]-a[1])<10&&q[4]===sd))break;sd=-sd}
    placed.push([tip[0],tip[1],a[0],a[1],sd]);si++;
    const c=[a[0]+u0[0]*len*.5-u0[1]*2*sd,a[1]+u0[1]*len*.5+u0[0]*2*sd];const pts=gbBez([a,c,c,tip],8);el.append(sv('path',{d:gbRib(pts,pts.map((_,i)=>2-1.5*i/8)),class:'tw'}));
    const ang=Math.atan2(u0[1],u0[0])*180/Math.PI;for(let i=0;i<k;i++){const f=k===1?.85:.4+.55*i/(k-1),q=gbCubic([a,c,c,tip],f),side=i%2?1:-1;slots.push([q[0]-u0[1]*side*2.5,q[1]+u0[0]*side*2.5,ang+side*42])}
    if(list.length>k)slots.more=[tip[0]+u0[0]*7,tip[1]+u0[1]*7+3]}
   g=B.budG[uid]={g:el,slots,more:null};if(slots.more){g.more=sv('text',{x:gbF(slots.more[0]),y:gbF(slots.more[1]),'text-anchor':'middle',class:'bmore'},'+'+(list.length-k));el.append(g.more)}
   /* a shoot appears once the wood it grows from is there */
   const G=gw.seen.gt||{},now=performance.now();const tb=(G['kn:'+uid]!==undefined?G['kn:'+uid]:G.light||0)+350;if(!quiet&&el.animate&&now<tb+300)el.animate([{opacity:0},{opacity:1}],{duration:300,delay:Math.max(0,tb-now),fill:'backwards'})}
  list.forEach((x,i)=>{let el=B.bud[x.id];if(i>=g.slots.length)return;
   if(!el){const q=g.slots[i];el=sv('g',{class:'gb-lf bud','data-k':'s:'+x.id,tabindex:-1,role:'button'},sv('g',{class:'gb-lfi'},sv('circle',{r:7,class:'hitc'}),sv('path',{d:gbLeafD(10,5.4),class:'blade'})));
    el.style.transform='translate('+gbF(q[0])+'px,'+gbF(q[1])+'px) rotate('+gbF(q[2])+'deg)';g.g.append(el);B.bud[x.id]=el}
   const im=showBuds&&inMode(x);el.setAttribute('class','gb-lf bud'+(x.scenarioKind==='regression'?' reg':'')+' '+gbLeafState(x)+(im?'':' gone'));
   el.setAttribute('aria-label',(x.scenarioKind==='regression'?'Existing flow: ':'Part check: ')+x.title+', '+gbStateWord(x).t)});
  if(g.more){const m=list.filter(inMode).length;g.more.textContent=m>g.slots.length?'+'+(m-g.slots.length):''}
  g.g.style.display=showBuds&&list.some(inMode)?'':'none'}
 /* a failure cracks the knot it names, and that file's name stays up; a running journey's route flows gold */
 const wounds=new Set(),live=new Set();
 for(const j of M.J)for(const x of M.leaves[j.id]){const r=s.run[x.id];if(!r)continue;if(r.st==='run')live.add(j.id);if(r.st==='fail'&&inMode(x)){const w=gbWound(M,j,x);if(w)wounds.add(w)}}
 for(const id in B.knot)B.knot[id].classList.toggle('wound',wounds.has(id));for(const id in B.klbl)B.klbl[id].classList.toggle('wound',wounds.has(id));
 for(const id in B.vein){const V=B.vein[id];for(const el of V.els)el.classList.toggle('live',live.has(V.jid))}
 gbLight()}
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
 for(const id in B.knot)B.knot[id].classList.toggle('on',L.units.has(id));
 for(const id in B.klbl)B.klbl[id].classList.toggle('on',on&&L.units.has(id));
 for(const id in B.root)B.root[id].classList.toggle('hl',L.units.has(id));
 /* the sap: from the leaf, down its branch and the trunk, and out along each root it reaches; a failure's stops at its wound */
 let d='';const x=L.leaf;
 if(x){const el=B.leaf[x.id]||B.bud[x.id];const j=gw.M.J.find(q=>gw.M.leaves[q.id].includes(x));const m=el&&/translate\(([-\d.]+)px,\s*([-\d.]+)px/.exec(el.style.transform);const at=m?[+m[1],+m[2]]:null;
  const vk=el&&el.__p||(j&&j.id);if(j&&at&&B.vein[vk]){const v=B.vein[vk];const w=gbWound(gw.M,j,x);let pts=v.pts.slice().reverse();
   if(w&&B.pos[w]){const p=B.pos[w];let best=0;pts.forEach((q,i)=>{if(Math.hypot(q[0]-p[0],q[1]-p[1])<Math.hypot(pts[best][0]-p[0],pts[best][1]-p[1]))best=i});pts=pts.slice(0,best+1)}
   const path=gbSmooth([at,v.pad,...pts],2);d='M'+path.map(gbP).join(' L');const end=path[path.length-1];
   if(!w)for(const id of j.units){const rr=B.root[id]&&B.L.roots.find(q=>q.id===id);if(rr)d+=' M'+gbSmooth([end,...rr.pts],2).map(gbP).join(' L')}
   B.sap.setAttribute('class','sap'+(w?' bad':''))}
  else if(at&&B.pos[x.unit]){d='M'+gbP(at)+' L'+gbP(B.pos[x.unit]);B.sap.setAttribute('class','sap')}}
 B.sap.setAttribute('d',d);B.sapU.setAttribute('d',d)}
function gbHover(k,el){gw.hov=k||null;gbLight();gbTip(k,el)}
/* A card beside the leaf, knot or root under the pointer: what it is, its state with evidence, and the path it crosses. */
function gbTip(k,el){const B=gw.B;if(!B||!B.tip)return;const tip=B.tip;const pid=el&&el.getAttribute&&el.getAttribute('data-pad');const P=pid&&B.pad[pid];
 if(!k||!el||k===gw.pinned||(k.startsWith('j:')&&!(P&&(P.pol||P.pruned)))){tip.hidden=true;return}
 const s=gw.state,M=gw.M;const pathOf=j=>{const parts=j.units.map(id=>M.U[id]).filter(Boolean);return [...parts.filter(u=>!u.root),...parts.filter(u=>u.root)].map(u=>u.label).join(' › ')};
 tip.replaceChildren();
 if(k.startsWith('s:')){const x=s.scenarios.find(q=>q.id===k.slice(2));if(!x){tip.hidden=true;return}const j=M.J.find(q=>M.leaves[q.id].includes(x));const w=gbStateWord(x);
  gwPut(tip,h('span',{class:'k'},(j?{happy:'happy path',guard:'guard',failure:'a way it fails'}[gbPol(x)]:x.scenarioKind==='regression'?'existing flow':'part check')+(x.criteria.length?' · '+x.criteria.join(' '):'')),h('b',{},x.title),h('div',{class:'st '+w.c},w.t),
   h('div',{class:'path'},j?pathOf(j):((M.U[x.unit]||{}).label||'')+(x.flow&&x.scenarioKind==='regression'?' · '+x.flow:'')))}
 else if(k.startsWith('j:')){const j=M.J.find(q=>q.id===P.jid);const n=(gw.order||[]).indexOf(P.jid)+1;const vis=s.modeBy?s.mode:null;
  const later=P.leaves.filter(x=>vis&&gbRank[x.mode]>gbRank[vis]);
  gwPut(tip,h('span',{class:'k'},'journey '+n+(P.pol?' · '+(P.pol==='failure'?'how it fails':'what it refuses'):'')),h('b',{},j?j.title:''),
   h('div',{class:'st'},P.pruned?'Pruned in '+gbModeName(vis)+': '+later.length+' scenario'+(later.length===1?'':'s')+' here; '+[...new Set(later.map(x=>gbModeName(x.mode)))].join(' and ')+' grows '+(later.length===1?'it':'them')+'.'
    :P.leaves.length+' scenario'+(P.leaves.length===1?'':'s')+(P.pol==='failure'?' that break it on purpose and check it fails safely':' that check it refuses what it must')))}
 else{const id=k.slice(2);const u=M.U[id];if(!u){tip.hidden=true;return}const on=M.J.filter(j=>j.units.includes(id));
  gwPut(tip,h('span',{class:'k'},u.root?'depends on':'part'),h('b',{},u.label),h('div',{class:'path'},u.loc),
   h('div',{class:'st'},on.length?(on.length===1?'On 1 journey: '+on[0].title:on.length+' of '+M.J.length+' journeys pass through it'):'Changed, but no journey in this change reaches it'),
   s.stops.some(x=>x.unit===id)?h('div',{class:'st fail'},'Tracing stopped here'):null)}
 tip.hidden=false;const wrap=tip.parentNode;if(!wrap)return;const r=el.getBoundingClientRect(),c=wrap.getBoundingClientRect();const tw=tip.offsetWidth,th=tip.offsetHeight;
 /* beside what it describes, on the side away from the trunk first, and never over a journey's label or the thing itself */
 const sv0=gw.B.svg.getBoundingClientRect(),vb=gw.B.svg.viewBox.baseVal,trunkX=sv0.left-c.left+(gw.B.L.xs[0]-vb.x)*sv0.width/vb.width;
 const x0=r.left-c.left,y0=r.top-c.top,x1=r.right-c.left,y1=r.bottom-c.top,cx=(x0+x1)/2,cy=(y0+y1)/2;
 const boxes=Object.values(gw.B.lbl).map(l=>l.el.getBoundingClientRect()).filter(q=>q.width).map(q=>[q.left-c.left,q.top-c.top,q.right-c.left,q.bottom-c.top]);boxes.push([x0,y0,x1,y1],[x0,y0,x1,y1],[x0,y0,x1,y1]);
 /* and off the journey it belongs to: its branch, pad and leaves stay readable while the card is up */
 const jgEl=el.closest&&el.closest('.jg');const jr=jgEl&&jgEl.getBoundingClientRect();const J=jr&&jr.width?[jr.left-c.left,jr.top-c.top,jr.right-c.left,jr.bottom-c.top]:null;if(J)boxes.push(J,J);
 for(const g of [gw.B.sap,gw.B.gWood]){const sr=g.getBoundingClientRect();if(sr.width)boxes.push([sr.left-c.left,sr.top-c.top,sr.right-c.left,sr.bottom-c.top])}
 const side=[[x1+14,cy-th/2],[x0-tw-14,cy-th/2]];const cands=[...(cx>=trunkX?side:side.reverse()),[cx-tw/2,y0-th-14],[cx-tw/2,y1+14]];
 if(J)cands.push([J[2]+14,cy-th/2],[J[0]-tw-14,cy-th/2],[cx-tw/2,J[1]-th-14],[cx-tw/2,J[3]+14]);cands.push([8,8],[c.width-tw-8,8]);let best=null;
 for(const q of cands){const x=Math.max(0,Math.min(q[0],c.width-tw)),y=Math.max(0,Math.min(q[1],c.height-th));let sc=0;
  for(const b of boxes)sc+=Math.max(0,Math.min(x+tw,b[2])-Math.max(x,b[0]))*Math.max(0,Math.min(y+th,b[3])-Math.max(y,b[1]));
  sc+=2*Math.hypot(x+tw/2-cx,y+th/2-cy);if(!best||sc<best.sc-1)best={x,y,sc}}
 tip.style.left=gbF(best.x)+'px';tip.style.top=gbF(best.y)+'px'}
function gbRove(el){const B=gw.B;for(const k in B.navEl)B.navEl[k].setAttribute('tabindex','-1');for(const id in B.leaf)B.leaf[id].setAttribute('tabindex','-1');el.setAttribute('tabindex','0')}
function gbKeys(e){const B=gw.B;const cur=e.target.closest&&e.target.closest('[data-k]');if(!cur)return;const k=cur.getAttribute('data-k');
 const go=el=>{if(!el)return;gbRove(el);el.focus();e.preventDefault()};
 const navKeys=[...(gw.order||[]).map(id=>'j:'+id),...B.nav.filter(x=>!x.startsWith('j:'))];
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){const base=k.startsWith('s:')?'j:'+(B.leaf[k.slice(2)]||{}).__j:k;const i=navKeys.indexOf(base);const n=navKeys[Math.max(0,Math.min(navKeys.length-1,i+(e.key==='ArrowDown'?1:-1)))];go(B.navEl[n])}
 else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const jid=k.startsWith('j:')?k.slice(2):k.startsWith('s:')?(B.leaf[k.slice(2)]||{}).__j:null;if(!jid)return;
  const ls=(B.padsOf[jid]||[]).flatMap(pid=>[...B.pad[pid].lg.children]).filter(el=>!el.classList.contains('gone'));const i=ls.indexOf(cur);go(ls[i<0?0:Math.max(0,Math.min(ls.length-1,i+(e.key==='ArrowRight'?1:-1)))])}
 else if(e.key==='Enter'||e.key===' '){gw.pinned=k;growPaint();e.preventDefault()}
 else if(e.key==='Escape'){gw.pinned=null;gbHover(null);growPaint()}}
/* Tracers at work: a gold bead on the knot being read. */
function gbCursors(now){const B=gw.B,s=gw.state;if(!B||!s||gw.tree!=='grove')return;const keep=new Set();
 if(s.phase===2||s.phase===3||s.phase===5)for(const a of s.agents){const at=gwAt(a,now+performance.timeOrigin);if(a.done||!at||!B.pos[at])continue;keep.add(a.id);const p=B.pos[at];
  const c=B.cur[a.id]||(B.cur[a.id]=B.gCur.appendChild(sv('g',{},sv('circle',{r:10,class:'halo'}),sv('circle',{r:3.6,class:'bead'}))));const pulse=1+.25*Math.sin(now/220);c.firstChild.setAttribute('r',gbF(8*pulse));c.setAttribute('transform','translate('+gbP(p)+')')}
 for(const id in B.cur)if(!keep.has(id)){B.cur[id].remove();delete B.cur[id]}
 for(const id in B.knot)B.knot[id].classList.toggle('trace',keep.size>0&&s.agents.some(a=>!a.done&&keep.has(a.id)&&gwAt(a,now+performance.timeOrigin)===id))}

/* ---------- Journeys: the list the tree draws, and the inspector's cards ---------- */
function gbPathEl(j,wound){const M=gw.M;const parts=j.units.map(id=>M.U[id]).filter(Boolean);const order=[...parts.filter(u=>!u.root),...parts.filter(u=>u.root)];
 return h('div',{class:'gb-path'},order.flatMap((u,i)=>[i?h('span',{class:'sep'},'›'):null,h('button',{class:u.root?'rootp':u.id===wound?'bad':'',title:u.loc,on:{click:e=>{e.stopPropagation();gw.pinned='u:'+u.id;growPaint()},mouseenter:()=>{const B=gw.B;if(B)gbHover('u:'+u.id,B.knot[u.id]||B.root[u.id]||null)},mouseleave:()=>gbHover(null)}},u.label)]))}
function gbJourneyCard(jid){const s=gw.state,M=gw.M;const j=M.J.find(q=>q.id===jid);if(!j)return null;const n=(gw.order||[]).indexOf(jid)+1;
 const list=M.leaves[jid];const inm=list.filter(x=>!s.modeBy||gwIn(x));const later=m=>list.filter(x=>x.mode===m&&!gwIn(x)).length;const wound=list.map(x=>gbWound(M,j,x)).find(Boolean);
 const crit=[...M.crit(j)].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 return [h('h3',{style:'font:500 17px/24px var(--sans)'},j.title),h('div',{class:'where'},'Journey '+(n||'')+' · starts '+(gbWHERE[j.surface]||'')+' at '+((M.U[j.entry]||{}).label||'')+(j.by&&j.by!=='rules'?' · named by '+(j.by==='spec'?'the spec':j.by):'')),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'The path it crosses'),gbPathEl(j,wound)),
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Scenarios · '+(s.modeBy?inm.length+' in '+GW.modes.find(m=>m.id===s.mode).label.toLowerCase():inm.length+' drafted')),
   inm.length?inm.map(x=>h('button',{class:'gb-row','data-sid':x.id,on:{click:()=>{gw.pinned='s:'+x.id;growPaint()}}},h('span',{},x.title),gwBadge(x))):h('p',{class:'gw-empty'},'None in this mode.'),
   s.modeBy&&(later('std')||later('max'))?h('p',{class:'small muted',style:'margin:6px 0 0'},'Pruned: '+[later('std')?later('std')+' in Standard':null,later('max')?later('max')+' in Max':null].filter(Boolean).join(', ')+'.'):null),
  crit.length?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Spec it answers'),h('div',{class:'gw-chips'},crit.map(c=>h('span',{class:'gw-chip'},c)))):null]}
function gbScenarioCard(sid){const s=gw.state,M=gw.M;const x=s.scenarios.find(q=>q.id===sid);if(!x)return null;const j=M.J.find(q=>M.leaves[q.id].includes(x));const r=s.run[x.id];
 return [h('h3',{style:'font-family:var(--sans);font-weight:500'},x.title),h('div',{class:'where'},(j?x.scenarioKind+' · journey: '+j.title:(x.scenarioKind==='regression'?'existing flow':'part check')+' · '+((M.U[x.unit]||{}).label||''))),
  h('div',{class:'sec'},h('div',{class:'row',style:'gap:8px'},gwBadge(x),x.mode==='min'?h('span',{class:'gw-chip min'},'minimum'):h('span',{class:'gw-chip'},GW.modes.find(m=>m.id===x.mode).label.toLowerCase()),x.by!=='rules'?h('span',{class:'gw-chip agent'},x.by):null),
   h('p',{class:'small',style:'margin:8px 0 0;color:var(--ink2)'},x.proves),r&&r.st==='fail'?h('div',{class:'gw-flag red'},h('b',{},'Failed'),h('span',{class:'mono small'},r.why||'')):null),
  j?h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'End to end through'),gbPathEl(j,gbWound(M,j,x))):null,
  h('div',{class:'sec'},h('span',{class:'gw-eyebrow'},'Proof'),h('div',{class:'gw-chips'},x.flow?h('span',{class:'gw-chip built'},x.flow):h('span',{class:'gw-chip missing'},'no flow yet'),x.criteria.map(c=>h('span',{class:'gw-chip'},c)),
    x.ext.filter(e=>s.ext[e]&&s.ext[e].state!=='proven').map(e=>h('span',{class:'gw-chip agent',title:s.ext[e].path},'agent-written '+s.ext[e].extKind))),x.variants.length?gwLanes(x):null)]}

/* Scenarios by journey, numbered as on the tree; then, collapsed, the parts on their own and the existing flows the change reaches. */
function gbJourneys(){const s=gw.state,v=gw.view,M=gw.M||gbModel();const shown=x=>!s.modeBy||gwIn(x);const card=h('section',{class:'card','aria-label':'Journeys','data-testid':'grow-scenarios'});
 const order=(gw.order&&gw.order.length?gw.order.map(id=>M.J.find(j=>j.id===id)).filter(Boolean):M.J);
 gwPut(card,h('div',{class:'row',style:'justify-content:space-between;margin-bottom:6px'},h('span',{class:'gw-eyebrow',style:'margin:0'},'Journeys · '+M.J.length),
  h('span',{class:'small muted'},!s.scenarios.length?'Drafted after tracing':s.modeBy?s.scenarios.filter(gwIn).length+' scenarios in '+GW.modes.find(m=>m.id===s.mode).label.toLowerCase()+' · '+s.scenarios.length+' drafted':s.scenarios.length+' drafted · '+s.scenarios.filter(gwIn).length+' in minimum')),
  M.legacy?h('p',{class:'small muted'},'Saved before journeys were traced: one journey per surface, links between parts not recorded. Grow again to trace journeys.'):null);
 order.forEach((j,i)=>{const list=M.leaves[j.id];const inm=list.filter(shown);const run=st=>inm.filter(x=>s.run[x.id]&&s.run[x.id].st===st).length;const pr=list.length-inm.length;
  const words=[run('pass')?run('pass')+' passed':null,run('fail')?run('fail')+' failed':null,run('run')?run('run')+' running':null,run('not_run')?run('not_run')+' not run':null].filter(Boolean).join(' · ')||(inm.length+' in this mode');
  const sel=gw.pinned==='j:'+j.id;const parts=j.units.map(id=>M.U[id]).filter(Boolean);
  gwPut(card,h('details',{class:'gb-jr'+(run('fail')?' failed':'')+(sel?' sel':''),open:(sel||run('fail')>0)?true:null},
   h('summary',{on:{click:()=>{gw.pinned='j:'+j.id}}},h('span',{class:'no'},String(i+1)),h('span',{class:'tt'},j.title,j.by&&j.by!=='rules'?h('span',{class:'by'},j.by==='spec'?'from the spec':j.by):null),
    h('span',{class:'rt2'},h('span',{class:'gw-mini'},list.map(x=>{const r=s.run[x.id];return h('i',{class:!gwIn(x)?'out':r?r.st:'',title:x.title})})),h('span',{class:'c'},words+(pr?' · +'+pr+' pruned':''))),
    h('span',{class:'pa'},(gbWHERE[j.surface]||'')+' · '+parts.filter(u=>!u.root).length+' part'+(parts.filter(u=>!u.root).length===1?'':'s')+(parts.some(u=>u.root)?' · depends on '+parts.filter(u=>u.root).map(u=>u.label).join(', '):''))),
   h('div',{class:'list'},inm.map(gwCard),!inm.length?h('p',{class:'gw-empty'},list.length?pr+' drafted for a larger mode':'Scenarios appear here as they are drafted.'):null)))});
 const parts=s.scenarios.filter(x=>!M.J.some(j=>M.leaves[j.id].includes(x)));const own=parts.filter(x=>x.scenarioKind!=='regression'),reg=parts.filter(x=>x.scenarioKind==='regression');
 const grp=(title,list,why)=>{if(!list.length)return null;const inm=list.filter(x=>s.modeBy&&gwIn(x));return h('details',{class:'gb-jr'},h('summary',{},h('span',{class:'no'},'·'),h('span',{class:'tt'},title),
   h('span',{class:'rt2'},h('span',{class:'gw-mini'},list.map(x=>{const r=s.run[x.id];return h('i',{class:!gwIn(x)?'out':r?r.st:'',title:x.title})})),h('span',{class:'c'},inm.length?inm.length+' in this mode':list.length+' in max')),h('span',{class:'pa'},why)),
  h('div',{class:'list'},inm.length?inm.map(gwCard):list.map(x=>h('div',{class:'gb-row',style:'cursor:default'},h('span',{},x.title,h('small',{class:'muted',style:'display:block;font:11.5px var(--mono)'},(M.U[x.unit]||{}).label||'')),gwBadge(x)))))};
 gwPut(card,grp('Parts on their own',own,'Each part checked through its callers, in max'),grp('Existing flows the change reaches',reg,'Regression, in max'),
  M.jin.length?h('p',{class:'gb-loose'},'Changed, on no journey: '+M.jin.map(u=>u.label).join(', ')+'. Nothing in this change reaches '+(M.jin.length===1?'it':'them')+'; max checks '+(M.jin.length===1?'it':'them')+' on '+(M.jin.length===1?'its':'their')+' own.'):null);
 return card}
`;
