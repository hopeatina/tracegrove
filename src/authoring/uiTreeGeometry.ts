/** Geometry and materials shared by live Grow, recorded runs and compact tree views. */
export const TREE_MATERIAL_CSS = String.raw`
.gw-svg.gb,.grove{display:block;width:100%;height:auto;overflow:visible;-webkit-tap-highlight-color:transparent;
 --wood:#6E5E50;--wood-lit:#8F7D6B;--wood-shade:#4C4037;--wood-old:color-mix(in srgb,#6E5E50 68%,var(--muted));--knot:#57493E;--knot-lit:#9C8975;--cut:#DCC8A6;--cutc:color-mix(in srgb,var(--ink3) 82%,var(--paper));--shoot:color-mix(in srgb,#9BBF5A 82%,var(--wood));--graft:var(--moss);
 --pad:color-mix(in srgb,var(--moss) 44%,var(--paper));--pad-lit:color-mix(in srgb,var(--moss) 30%,var(--paper));--pad-shade:color-mix(in srgb,var(--moss) 70%,var(--paper));
 --fol-hi:color-mix(in srgb,var(--moss) 58%,var(--paper));--fol:color-mix(in srgb,var(--moss) 72%,var(--paper));--fol-lo:color-mix(in srgb,var(--moss) 86%,var(--paper));--fsh-hi:color-mix(in srgb,var(--moss) 70%,var(--paper));--fsh:color-mix(in srgb,var(--moss) 83%,var(--paper));--fsh-lo:color-mix(in srgb,var(--moss) 95%,var(--paper));
 --pad-dim:color-mix(in srgb,var(--moss) 16%,var(--paper));--pad-back:color-mix(in srgb,var(--moss) 34%,var(--paper));--pad-edge:color-mix(in srgb,var(--moss) 62%,var(--paper));
 --pot:color-mix(in srgb,var(--ochre) 26%,var(--line2));--pot-rim:color-mix(in srgb,var(--ochre) 34%,var(--ink3));--pot-ft:color-mix(in srgb,var(--pot) 72%,#3A2A20);--pot-lit:color-mix(in srgb,var(--pot) 78%,#fff);--pot-dk:color-mix(in srgb,var(--pot) 80%,#3A2A20);--soil-c:color-mix(in srgb,#6B4A32 72%,var(--soil));--soil-lit:color-mix(in srgb,#8A6A4C 60%,var(--soil));--pebble:color-mix(in srgb,var(--line2) 70%,var(--paper));--rt-cut:var(--wood);--rt-ext:var(--wood);--stake:#B09676}
@media (prefers-color-scheme:dark){.gw-svg.gb,.grove{--wood:#6E5F50;--wood-lit:#8A7864;--wood-shade:#4A3F35;--wood-old:#5E574E;--knot:#4E4238;--knot-lit:#93826E;--cut:#B9A684;--cutc:color-mix(in srgb,var(--ink3) 82%,var(--paper));--shoot:#A9CF72;--graft:color-mix(in srgb,var(--moss) 70%,#fff);
 --pad:color-mix(in srgb,var(--moss) 50%,var(--paper));--pad-lit:color-mix(in srgb,var(--moss) 66%,var(--paper));--pad-shade:color-mix(in srgb,var(--moss) 30%,var(--paper));
 --fol-hi:color-mix(in srgb,var(--moss) 56%,var(--paper));--fol:color-mix(in srgb,var(--moss) 45%,var(--paper));--fol-lo:color-mix(in srgb,var(--moss) 34%,var(--paper));--fsh-hi:color-mix(in srgb,var(--moss) 45%,var(--paper));--fsh:color-mix(in srgb,var(--moss) 35%,var(--paper));--fsh-lo:color-mix(in srgb,var(--moss) 25%,var(--paper));
 --pad-dim:color-mix(in srgb,var(--moss) 22%,var(--paper));--pad-back:color-mix(in srgb,var(--moss) 40%,var(--paper));--pad-edge:color-mix(in srgb,var(--moss) 38%,var(--paper));
 --leaf-pend:color-mix(in srgb,var(--paper) 88%,var(--moss));--leaf-prove:color-mix(in srgb,var(--paper) 86%,#fff);
 --pot:color-mix(in srgb,var(--ochre) 30%,#6A584B);--pot-rim:color-mix(in srgb,var(--ochre) 40%,var(--ink3));--pot-ft:color-mix(in srgb,var(--pot) 72%,#000);--pot-lit:color-mix(in srgb,var(--pot) 80%,#fff);--pot-dk:color-mix(in srgb,var(--pot) 78%,#000);--soil-c:#3B2F27;--soil-lit:#46382D;--pebble:color-mix(in srgb,var(--line2) 80%,var(--ink3));--rt-cut:#8C7A66;--rt-ext:#968470;--stake:#9A8468}}
`;

export const TREE_GEOMETRY_JS = String.raw`
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
   bx swells one edge where a knot's boss grows out of it: positive on the side the normal points to, negative on the other.
   Its end is a half circle round the end of the spine, as wide as the wood is there, drawn as two true quarter arcs (the
   edges' own half-widths across, its half-width along): never a flat or slanted cut, nor a ring of facets. */
function gbRib(pts,w,from,to,floor,bx){from=from||0;to=to===undefined?pts.length-1:to;const N=pts.length-1,L=[],R=[];let el=0,er=0;
 for(let i=from;i<=to;i++){const n=gbNorm(pts,i),h=w[i]/2;let hl=h,hr=h;const a=pts[Math.max(0,i-3)],b=pts[i],c=pts[Math.min(N,i+3)];
  const t1=[b[0]-a[0],b[1]-a[1]],t2=[c[0]-b[0],c[1]-b[1]],m1=Math.hypot(t1[0],t1[1]),m2=Math.hypot(t2[0],t2[1]);
  if(m1&&m2){const th=Math.asin(Math.max(-1,Math.min(1,(t1[0]*t2[1]-t1[1]*t2[0])/(m1*m2))));if(Math.abs(th)>1e-3){const rad=(m1+m2)/2/Math.abs(th);if(th>0)hl=Math.min(hl,.85*rad);else hr=Math.min(hr,.85*rad)}}
  if(bx&&bx[i]){if(bx[i]>0)hl+=bx[i];else hr-=bx[i]}
  L.push([b[0]+n[0]*hl,b[1]+n[1]*hl]);R.push([b[0]-n[0]*hr,b[1]-n[1]*hr]);el=hl;er=hr}
 const e=pts[to],n=gbNorm(pts,to),t=[n[1],-n[0]],r=w[to]/2,cap=[];
 for(let k=1;k<8;k++){const th=Math.PI/2-Math.PI*k/8,h=th>0?el:er;cap.push([e[0]+n[0]*h*Math.sin(th)+t[0]*r*Math.cos(th),e[1]+n[1]*h*Math.sin(th)+t[1]*r*Math.cos(th)])}
 if(floor!==undefined){for(const q of [...L,...cap,...R])q[1]=Math.min(q[1],floor);return 'M'+L.map(gbP).join(' L')+' L'+cap.map(gbP).join(' L')+' L'+R.reverse().map(gbP).join(' L')+'Z'}
 const rot=gbF(Math.atan2(t[1],t[0])*180/Math.PI),tip=[e[0]+t[0]*r,e[1]+t[1]*r],R1=R.reverse();
 return 'M'+L.map(gbP).join(' L')+' A'+gbF(r)+' '+gbF(Math.max(.01,el))+' '+rot+' 0 0 '+gbP(tip)+' A'+gbF(r)+' '+gbF(Math.max(.01,er))+' '+rot+' 0 0 '+gbP(R1[0])+(R1.length>1?' L'+R1.slice(1).map(gbP).join(' L'):'')+'Z'}
/* A band between two fractions of the half-width: the side the light falls on, or the side away from it. */
function gbBand(pts,w,k1,k2,from){const A=[],B=[];for(let i=from||0;i<pts.length;i++){const n=gbNorm(pts,i),h=w[i]/2;A.push([pts[i][0]+n[0]*h*k1,pts[i][1]+n[1]*h*k1]);B.push([pts[i][0]+n[0]*h*k2,pts[i][1]+n[1]*h*k2])}
 return 'M'+A.map(gbP).join(' L')+' L'+B.reverse().map(gbP).join(' L')+'Z'}
/* Which side of a piece faces the light (upper left): +1 is the side its normal points to. */
const gbSide=pts=>{let s=0;for(let i=0;i<pts.length;i+=3){const n=gbNorm(pts,i);s+=n[0]*-.6+n[1]*-.8}return s>=0?1:-1};
const gbLen=(pts)=>{const a=[0];for(let i=1;i<pts.length;i++)a.push(a[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return a};
const gbNear=(arr,v)=>{let k=0;for(let i=1;i<arr.length;i++)if(Math.abs(arr[i]-v)<Math.abs(arr[k]-v))k=i;return k};
const gbW=(t,px)=>t.length*px;

const gbCushD=(o,q)=>{const t=q.top,P=p=>gbP([o[0]+p[0],o[1]+p[1]]);let d='M'+P(t[0]);for(let i=1;i<t.length-1;i++)d+=' Q'+P(t[i])+' '+P([(t[i][0]+t[i+1][0])/2,(t[i][1]+t[i+1][1])/2]);
 return d+' L'+P(t[t.length-1])+' L'+q.bot.slice().reverse().map(P).join(' L')+'Z'};
const gbPadD=(o,q)=>q.cs.map(c=>gbCushD(o,c)).join(' ');

const gbLeafD=(L,W)=>{const a=-L/2,b=L/2;return 'M'+gbF(a)+' 0 C'+gbF(a+.22*L)+' '+gbF(-.62*W)+' '+gbF(b-.32*L)+' '+gbF(-.62*W)+' '+gbF(b)+' 0 C'+gbF(b-.32*L)+' '+gbF(.62*W)+' '+gbF(a+.22*L)+' '+gbF(.62*W)+' '+gbF(a)+' 0Z'};
`;
