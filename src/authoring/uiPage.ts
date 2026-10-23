import { READINESS_JS } from './uiReadiness.ts';
import { CHROME_CSS, CHROME_JS } from './uiChrome.ts';
/**
 * The single page served by `tracegrove ui`, in the Grove design: a bonsai of scenarios (trunk,
 * branches, step twigs), pruning as a reversible rename, live progress from real run and agent
 * events, self-healing with reviewable diffs and undo, a command palette (Cmd/Ctrl+K) and keyboard
 * navigation.
 * No build step and no framework; every string reaches the DOM through textContent.
 */
import { SOURCE_CONTROLS_JS } from './uiSourceControls.ts';
import { NATIVE_IMPORTS_JS } from './uiNativeImports.ts';
import { WORKFLOW_MAP_JS } from './uiWorkflowMap.ts';
import { COMPARISON_CSS, COMPARISON_JS } from './uiComparison.ts';
import { GROVE_CSS, GROVE_JS } from './uiGrove.ts';
import { BENCHMARK_CSS, BENCHMARK_JS } from './uiBenchmark.ts';
export const UI_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>tracegrove</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Spectral:wght@300;400&display=swap" rel="stylesheet">
<style>
:root{--stone:#F2EFE6;--paper:#FBF9F3;--line:#E1DCCD;--line2:#CBC4B2;--sel:#E8E3D5;--ink:#16211C;--ink2:#2F3B34;--ink3:#56615A;--muted:#6E7469;
 --trunk:#2F3B34;--twig:#B7B09E;--moss:#3F7A3A;--moss-bg:#E4EDDA;--new:#7FB35E;--gold:#9A7424;--gold-bg:#F3EAD3;--verm:#C23A2C;--verm-bg:#F8E3DD;--verm-ink:#8E2418;--ochre:#B4552C;--ochre-bg:#F7E6DA;--ochre-ink:#7A3518;
 --indigo:#4A5C94;--indigo-bg:#E7E9F1;--forest:#16211C;--on-forest:#F2EFE6;--bar:#EAE5D7;--code:#F2EFE6;--soil:#CBC4B2;
 --sans:'IBM Plex Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;--serif:'Spectral',Georgia,serif}
@media (prefers-color-scheme:dark){:root{--stone:#0C1210;--paper:#121A17;--line:#1F2A25;--line2:#2E3B35;--sel:#1A2420;--ink:#ECE6D8;--ink2:#D5CFC1;--ink3:#A9A699;--muted:#8B8A7F;
 --trunk:#D5CFC1;--twig:#3D4A43;--moss:#A9D28A;--moss-bg:#18261C;--new:#D9EFC0;--gold:#D8B25E;--gold-bg:#2A2416;--verm:#EF6A5A;--verm-bg:#33191A;--verm-ink:#F6A79C;--ochre:#D77C55;--ochre-bg:#2E1E16;--ochre-ink:#EDB79D;
 --indigo:#9AAEE8;--indigo-bg:#1B2233;--forest:#ECE6D8;--on-forest:#0C1210;--bar:#1A2420;--code:#0F1613;--soil:#3D4A43}}
:root{color-scheme:light dark}input[type=checkbox]{accent-color:var(--moss)}
*{box-sizing:border-box}html,body{margin:0;background:var(--stone);color:var(--ink);font:15px/22px var(--sans)}
button{font:inherit;color:inherit;cursor:pointer}button:disabled{cursor:not-allowed;opacity:.5}
:focus-visible{outline:2px solid var(--moss);outline-offset:2px;border-radius:6px}
a{color:var(--moss)}code,pre,.mono{font-family:var(--mono)}
header{display:flex;flex-wrap:wrap;align-items:center;gap:12px 32px;min-height:64px;padding:12px 32px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:17px;letter-spacing:-.01em}
nav{display:flex;flex-wrap:wrap;gap:4px}
nav button{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border:0;border-radius:8px;background:none;color:var(--ink3)}
nav button[aria-current=page]{background:var(--sel);color:var(--ink);font-weight:500}
.ctx{margin-left:auto;font:13px/18px var(--mono);color:var(--ink3);overflow-wrap:anywhere}
.page{max-width:1376px;margin:0 auto;padding:28px 32px 48px}
.label{font:500 11px/16px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.rulehead{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}.rulehead .rule{flex:1;height:1px;background:var(--line);min-width:40px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:20px}
.recording{margin-top:20px}.recording video{display:block;width:100%;max-height:360px;aspect-ratio:16/9;object-fit:contain;margin:10px 0;background:var(--ink)}
.cols{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}.grow{flex:999 1 560px;min-width:0}.side{flex:1 1 340px;min-width:0;display:flex;flex-direction:column;gap:16px}
h1{font:300 32px/38px var(--serif);letter-spacing:-.01em;margin:0;max-width:30ch}h2{font-size:17px;line-height:24px;font-weight:600;margin:0}
.muted{color:var(--ink3)}.small{font-size:13px;line-height:18px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:8px;border:0;background:var(--forest);color:var(--on-forest);font-weight:500;white-space:nowrap}
.btn.ghost{background:var(--paper);color:var(--ink);border:1px solid var(--line2);font-weight:400}.btn.sm{min-height:36px;padding:0 12px;font-size:14px}
input,select,textarea{font:inherit;color:var(--ink);background:var(--paper);border:1px solid var(--line2);border-radius:8px;padding:0 12px;min-height:44px;max-width:100%}
textarea{padding:12px;resize:vertical;min-height:88px;width:100%}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.stats{display:flex;flex-wrap:wrap;gap:12px 40px;margin-top:20px}.stats b{font-size:22px;font-weight:500;margin-right:6px}
.pill{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:6px;font-size:12px;line-height:16px;font-weight:500}
.tx{display:flex;flex-direction:column;gap:6px;margin-top:4px}.tx-c{align-self:flex-end;background:var(--sel);padding:6px 10px;border-radius:10px;max-width:88%;white-space:normal}.tx-a{align-self:flex-start;background:var(--moss-bg);padding:6px 10px;border-radius:10px;max-width:88%;white-space:normal}.tx-t{align-self:flex-start;color:var(--ink3);overflow-wrap:anywhere}.tx .who{display:block;font-size:11px;color:var(--ink3)}
.claim-states{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:10px 0}
.p-pass{background:var(--moss-bg);color:var(--moss)}.p-fail{background:var(--verm-bg);color:var(--verm-ink)}.p-warn{background:var(--ochre-bg);color:var(--ochre-ink)}.p-info{background:var(--indigo-bg);color:var(--indigo)}.p-none{background:var(--sel);color:var(--ink3)}
.state{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.c-pass{color:var(--moss)}.c-fail{color:var(--verm)}.c-warn,.c-unavailable{color:var(--ochre)}.c-none{color:var(--muted)}
.dot{width:12px;height:12px;border-radius:50%;flex:none}.dot.pass{background:var(--moss)}.dot.fail{background:var(--paper);border:3px solid var(--verm)}.dot.warn,.dot.unavailable{background:var(--paper);border:3px solid var(--ochre)}
.dot.none{border:1.5px solid var(--ink3)}.dot.pruned{border:1.5px dashed var(--muted)}.dot.s{width:8px;height:8px;border-width:0}.dot.s.fail{background:var(--verm)}.dot.s.warn{background:var(--ochre)}.dot.s.none{background:var(--twig)}
.tree{border-left:1.5px solid var(--trunk);margin-left:10px}
.br{display:flex;align-items:stretch;padding:3px 0}.twig{width:22px;flex:none;display:flex;align-items:center}.twig i{display:block;width:100%;border-top:1.5px solid var(--trunk)}.twig.cut i{border-top-style:dashed;border-color:var(--twig)}
.node{flex:1;min-width:0;display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:10px;border:1px solid transparent;background:none;min-height:44px;text-align:left}
.node:hover{background:var(--paper)}.node[aria-expanded=true]{background:var(--paper);border-color:var(--line2)}
.node[aria-pressed=true]{background:var(--paper);border-color:var(--line2)}
.node .body{display:flex;flex-direction:column;min-width:0;flex:1}.node .id{font:13px/18px var(--mono)}
.pips{display:flex;gap:3px;flex:none}.pips i{width:8px;height:14px;border-radius:2px;background:var(--twig)}.pips i.pass{background:var(--moss)}.pips i.fail{background:var(--verm)}.pips i.warn{background:var(--ochre)}
.time{font:12px/16px var(--mono);color:var(--ink3);width:56px;text-align:right;flex:none}
.twigs{border-left:1px solid var(--twig);margin:4px 0 8px 44px}.twigs .twig{width:18px}.twigs .twig i{border-top:1px solid var(--twig)}
.step{flex:1;min-width:0;display:grid;grid-template-columns:8px minmax(120px,1.1fr) minmax(120px,1fr) minmax(60px,.8fr) 60px 48px;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;border:0;background:none;min-height:40px;text-align:left}
.step:hover{background:var(--sel)}.step[aria-pressed=true]{background:var(--sel)}
.step .req{font:12px/16px var(--mono);color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar{height:10px;position:relative;background:var(--bar);border-radius:3px}.bar i{position:absolute;top:0;bottom:0;border-radius:3px;background:var(--trunk);min-width:3px}.bar i.fail{background:var(--verm)}
.ms,.res{font:12px/16px var(--mono);text-align:right}
.fix{display:flex;flex-direction:column;gap:4px;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--paper)}
.fix:hover,.fix[aria-pressed=true]{border-color:var(--twig)}
.obs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin:12px 0}.obs>div{min-width:0;overflow-wrap:anywhere;padding:10px 12px;border-radius:8px;background:var(--stone)}.obs .bad{background:var(--verm-bg)}.obs .good{background:var(--moss-bg)}
.obs-long{grid-template-columns:minmax(0,1fr)}.obs .mono{white-space:pre-wrap}
.answer{margin:0 0 12px}.answer .label{margin:0 0 4px}.answer pre{max-height:240px;overflow:auto}
.checked{margin:0 0 12px}.checked .label{margin:0 0 4px}.cks{display:grid;gap:3px}
.ck{display:grid;grid-template-columns:16px minmax(0,1fr);grid-template-areas:'m v' '. k';gap:0 8px;font-size:13px;line-height:19px;padding:2px 0}.ck .m{grid-area:m}.ck .v{grid-area:v}.ck .k{grid-area:k}
.gw-drp .ck{grid-template-columns:16px minmax(0,1fr) minmax(0,1.25fr);grid-template-areas:'m k v';gap:2px 8px}.ck .m{font:600 13px/19px var(--mono);text-align:center}
.ck.pass .m{color:var(--moss)}.ck.fail .m,.ck.fail .v{color:var(--verm-ink)}.ck.none .m{color:var(--ink3)}.ck .k{font:12px/19px var(--mono);color:var(--ink3);overflow-wrap:anywhere}.ck .v{overflow-wrap:anywhere}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.call{display:grid;gap:0;font-size:13px;line-height:19px;padding:3px 0}.call .mono{overflow-wrap:anywhere}.call .small{overflow-wrap:anywhere}
pre{font:12px/1.6 var(--mono);background:var(--code);border-radius:8px;padding:12px 14px;overflow-x:auto;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.think{display:inline-flex;gap:5px;align-items:center}.think i{width:7px;height:7px;border-radius:50%;background:var(--moss);animation:pulse 1.2s ease-in-out infinite}
.think i:nth-child(2){animation-delay:.18s}.think i:nth-child(3){animation-delay:.36s}
.growing .dot{animation:breathe 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.25;transform:scale(.75)}50%{opacity:1;transform:scale(1)}}@keyframes breathe{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 5px var(--moss-bg)}}
.fade{animation:fade .24s ease-out both}@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.think i,.growing .dot,.fade,.live .dot,.grove .lf-live{animation:none}}
.phases{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}.phases li{display:flex;gap:10px;align-items:center}.phases .ok{color:var(--moss);width:12px}.phases .wait{color:var(--muted);width:12px}
.src{display:flex;flex-direction:column;gap:4px}.src button{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 12px;border-radius:8px;border:1px solid transparent;background:none;text-align:left;font:13px/18px var(--mono)}
.src button[aria-pressed=true]{background:var(--paper);border-color:var(--line2)}.src button:hover{background:var(--paper)}
.route{display:grid;grid-template-columns:8px minmax(160px,1.4fr) minmax(120px,1fr) 64px;gap:12px;align-items:center;padding:8px 12px;border-radius:8px;min-height:44px}.route:hover{background:var(--paper)}
.grid{border-collapse:separate;border-spacing:0}.grid th:first-child,.grid td:first-child{min-width:280px;padding-right:32px}.grid th{white-space:nowrap}.grid th,.grid td{padding:8px 10px;text-align:center;border-bottom:1px solid var(--line)}.grid th:first-child,.grid td:first-child{text-align:left;position:sticky;left:0;background:var(--stone)}
.cell{width:28px;height:28px;border-radius:8px;border:1px solid transparent;background:none;display:inline-flex;align-items:center;justify-content:center}.cell:hover{border-color:var(--twig);background:var(--paper)}
.cell.unavailable{width:auto;min-width:28px;padding:0 8px}
.scroll{overflow-x:auto}.seg{display:flex;flex-wrap:wrap;gap:8px}.seg button{flex:1 1 160px;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid var(--line2);background:var(--paper);display:flex;flex-direction:column;gap:2px}
.seg button[aria-pressed=true]{border-color:var(--moss);box-shadow:inset 0 0 0 1px var(--moss)}
table.kv{border-collapse:collapse;width:100%}table.kv th,table.kv td{text-align:left;padding:8px 0;border-bottom:1px solid var(--line);vertical-align:top}table.kv th{width:38%;padding-right:12px;font-weight:500;color:var(--ink3)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:14px;background:var(--forest);color:var(--on-forest);padding:10px 16px;border-radius:10px;font-size:14px;z-index:30;max-width:92vw}
.toast .act{background:none;border:0;color:var(--on-forest);text-decoration:underline;font-weight:600;min-height:28px;padding:0}
.pal-back{position:fixed;inset:0;background:rgba(18,20,18,.34);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh;z-index:20}
.pal{width:min(640px,92vw);background:var(--paper);border:1px solid var(--line2);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.2);overflow:hidden}
.pal input{width:100%;border:0;border-bottom:1px solid var(--line);border-radius:0;min-height:54px;font-size:16px;padding:0 18px;outline:none}
.pal ul{list-style:none;margin:0;padding:6px;max-height:52vh;overflow:auto}.pal li{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;min-height:44px}
.pal li[aria-selected=true]{background:var(--sel)}.pal .grp{font:500 11px/16px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);width:76px;flex:none}.pal .hint{margin-left:auto;color:var(--muted);font-size:13px}
.pal .foot{display:flex;gap:16px;padding:8px 14px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;flex-wrap:wrap}
kbd{font:500 11px/16px var(--mono);border:1px solid var(--line2);border-bottom-width:2px;border-radius:5px;padding:1px 6px;color:var(--ink3);background:var(--stone)}
.kbtn{display:inline-flex;gap:8px;align-items:center;min-height:36px;padding:0 10px;border:1px solid var(--line2);border-radius:8px;background:var(--paper);color:var(--ink3);font-size:13px}
.log{max-height:280px;overflow:auto;font:12px/1.6 var(--mono);background:var(--code);border-radius:8px;padding:10px 12px;margin-top:12px}.log div{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink3)}.log div:last-child{color:var(--ink)}
.diff{font:12px/1.6 var(--mono);background:var(--code);border-radius:8px;padding:8px 0;overflow-x:auto;margin-top:8px}.diff div{padding:0 12px;white-space:pre}.diff .add{background:var(--moss-bg);color:var(--moss)}.diff .del{background:var(--verm-bg);color:var(--verm-ink)}.diff .ctx{color:var(--ink3)}
.finding{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:10px;border:1px solid var(--line);background:var(--paper)}
.step.live,.node.live{box-shadow:inset 3px 0 0 var(--moss);background:var(--paper)}.live .dot{animation:breathe 1.1s ease-in-out infinite}
.grovecard{position:relative;padding:12px 12px 4px;margin-bottom:16px}.grovecard svg{display:block;width:100%;max-width:760px;height:auto;margin:0 auto}
.grove .pad{cursor:pointer}.grove .pad circle{stroke:var(--paper);stroke-width:1.6}.grove.focus .pad{opacity:.5}.grove .pad.on,.grove .pad:hover{opacity:1}.grove .pad{transition:opacity .15s}
.grove .lf-pass{fill:var(--moss)}.grove .lf-fail{fill:var(--verm)}.grove .lf-warn{fill:var(--ochre)}.grove .lf-none{fill:var(--paper);stroke:var(--twig)!important;stroke-dasharray:2 2}.grove .lf-live{fill:var(--new);animation:leaf 1s ease-in-out infinite}
.grove .lf-pruned{fill:none;stroke:var(--twig)!important;stroke-dasharray:2 2}
.grove .wood{fill:var(--trunk)}.grove .cutwood{fill:none;stroke:var(--twig);stroke-dasharray:3 3;stroke-width:1.4}.grove .soil{stroke:var(--soil);stroke-width:1}
.grove .root{fill:none;stroke:var(--gold);stroke-linecap:round}.grove .tip{fill:var(--gold)}.grove .tip.fail{fill:var(--verm)}.grove .tip.none{fill:var(--paper);stroke:var(--gold);stroke-dasharray:2 2}
.grove text{font:11px var(--mono);fill:var(--ink3)}.grove text.on{fill:var(--ink);font-weight:500}.grove text.rt{fill:var(--gold)}.grove text.bad{fill:var(--verm)}
@keyframes leaf{0%,100%{opacity:.45}50%{opacity:1}}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;padding:4px 8px 8px;font-size:12px;color:var(--ink3)}.legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.kpis{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.kpi{display:flex;flex-direction:column;gap:2px;padding:10px 14px;border:1px solid var(--line);border-radius:10px;background:var(--paper);min-width:120px}
.kpi b{font:500 20px/26px var(--mono)}.kpi span{font-size:12px;line-height:16px;color:var(--ink3)}.kpi.chip{cursor:pointer;text-align:left;font:inherit;color:inherit}.kpi.chip:hover{border-color:var(--twig)}
details.more{margin-top:12px}details.more>summary{cursor:pointer;color:var(--ink3);font-size:13px;list-style:none;display:inline-flex;gap:6px;align-items:center}details.more>summary::before{content:'+';font:500 13px var(--mono);width:12px}details.more[open]>summary::before{content:'–'}
details.more>div{margin-top:8px;padding-left:18px;border-left:1px solid var(--line)}details.more p{margin:6px 0}
.stages{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.stage{flex:1 1 200px;display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--paper)}.stage .n{font:500 12px/20px var(--mono);color:var(--muted)}.stage b{font-weight:500;display:block}
.empty{display:flex;gap:16px;align-items:center;padding:20px;border:1px dashed var(--line2);border-radius:12px;color:var(--ink3)}.empty svg{flex:none}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips button{display:inline-flex;gap:8px;align-items:center;min-height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--line2);background:var(--paper);font:13px/18px var(--mono)}.chips button[aria-pressed=true]{border-color:var(--moss);box-shadow:inset 0 0 0 1px var(--moss)}
.filepath{font:12px/16px var(--mono);color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:14px}
.tag{font:500 10px/14px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--gold);border:1px solid var(--gold-bg);background:var(--gold-bg);border-radius:4px;padding:0 5px;margin-left:6px}
.rings{display:flex;gap:4px;align-items:flex-end;height:40px}.rings i{width:10px;border-radius:2px;background:var(--moss)}.rings i.fail{background:var(--verm)}.rings i.warn{background:var(--ochre)}
.keys{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;align-items:center;margin-top:12px}
@media (max-width:720px){header{padding:12px 16px}.page{padding:20px 16px 40px}.ctx{margin-left:0;width:100%}h1{font-size:23px;line-height:30px}
 .step{grid-template-columns:8px minmax(0,1fr) 48px;}.grovecard{overflow-x:auto}.grovecard svg{min-width:560px}.kpi{min-width:0;flex:1 1 140px}.step .req,.step .bar,.step .ms{display:none}.route{grid-template-columns:8px 1fr auto}.route .where{display:none}.obs{grid-template-columns:minmax(0,1fr)}}
${COMPARISON_CSS}
${GROVE_CSS}
${BENCHMARK_CSS}
${CHROME_CSS}
</style></head><body>
<a class="skip btn" href="#main">Skip to content</a>
<header><span class="brand"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" aria-hidden="true"><path d="M12 18c-.6-2.6 1.4-3.6.6-6.4" stroke="var(--ink)" stroke-width="1.8"/><path d="M12.4 13.4c-2-.4-3.6-1.4-4.6-2.6M12.8 11.6c1.6-.6 3-1.8 3.8-3" stroke="var(--ink)" stroke-width="1.1"/><g fill="var(--moss)"><circle cx="6.2" cy="10.2" r="1.7"/><circle cx="8.8" cy="9.6" r="1.7"/><circle cx="15.6" cy="7.4" r="1.7"/><circle cx="18.2" cy="8" r="1.7"/><circle cx="11.6" cy="6" r="1.9"/></g><path d="M3 18h18" stroke="var(--ink3)" stroke-width=".9"/><path d="M12 18c-1 1.6-2.6 2.6-4.4 3M12 18c1.2 1.4 2.8 2.2 4.6 2.4" stroke="var(--gold)" stroke-width=".9"/></svg>tracegrove</span>
<nav id="tabs" aria-label="Sections"></nav><span class="ctx" id="ctx"></span><button class="kbtn" id="palbtn" type="button" aria-label="Open the command palette" aria-keyshortcuts="Control+K Meta+K">Commands <kbd>⌘K</kbd></button></header>
<main class="page" id="main" tabindex="-1"></main>
<script>
const TOKEN='__TOKEN__';const START_BRANCH=__BRANCH__;const DEFAULT_MODELS=__DEFAULT_MODELS__;
const TABS=['Run','Readiness','Discover','Heal','History','Compare','Imports','Map','Benchmark','Environments','Settings'];
let tab=START_BRANCH?'Discover':'Run';let state=null;
const ui={run:null,runName:null,sel:null,step:null,running:false,activeRunId:null,cancelling:false,disc:null,source:START_BRANCH||'',draft:null,agent:null,agentPhase:-1,videoTimes:{},live:null,heal:null,heals:[],healing:false,healError:null,envs:null,env:(()=>{try{return localStorage.getItem('tracegrove.env')||'local'}catch{return 'local'}})(),doctoring:null};
function h(tag,attrs,...kids){const el=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(k==='on')for(const[e,f]of Object.entries(v))el.addEventListener(e,f);else if(v!==null&&v!==undefined&&v!==false)el.setAttribute(k,v===true?'':v)}for(const kid of kids.flat()){if(kid===null||kid===undefined||kid===false)continue;el.append(kid instanceof Node?kid:document.createTextNode(String(kid)))}return el}
async function api(path,body){const r=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json','x-tracegrove-token':TOKEN},body:JSON.stringify(body)}:{});const j=await r.json();if(!r.ok)throw j;return j}
function toast(text,action){for(const old of document.querySelectorAll('.toast'))old.remove();const t=h('div',{class:'toast fade',role:'status'},h('span',{},text),
 action?h('button',{class:'act',on:{click:async()=>{t.remove();await action.run()}}},action.label):null);document.body.append(t);setTimeout(()=>t.remove(),action?7000:2800)}
function blocked(e){return h('div',{class:'card fade'},h('div',{class:'row'},h('span',{class:'pill p-fail'},'blocked'),h('h2',{},'Fix this first')),
 ...(e.reasons||[{code:'error',detail:e.error||String(e),action:''}]).map(r=>h('div',{style:'margin-top:12px'},h('div',{class:'mono small'},r.code),h('div',{},r.detail),r.action?h('div',{class:'muted small'},'Fix: '+r.action):null)))}
const OUT={passed:'pass',assertion_failed:'fail',failed:'fail',completed:'pass',blocked:'warn',inconclusive:'warn',infrastructure_failed:'warn',cancelled:'warn',skipped:'none'};
const LABEL={pass:'held',fail:'failed',warn:'blocked',none:'not run',pruned:'pruned',unavailable:'unavailable'};
const kind=o=>OUT[o]||'none';
const secs=ms=>ms==null?'':!Number.isFinite(ms)?'unavailable':ms<1000?ms+' ms':(ms/1000).toFixed(1)+' s';
const ago=iso=>{const d=(Date.now()-new Date(iso).getTime())/1000;if(!Number.isFinite(d))return 'time unavailable';return d<60?'just now':d<3600?Math.round(d/60)+' min ago':d<86400?Math.round(d/3600)+' h ago':new Date(iso).toLocaleDateString()};
function header(){const nav=document.getElementById('tabs');if(nav.dataset.view!==tab){nav.replaceChildren(...sectionNav());nav.dataset.view=tab}
 const g=state?state.git:null;const last=state&&state.runs[0];
 document.getElementById('ctx').textContent=state?[state.config?state.config.project:state.dir.split('/').pop(),state.example?'example':g&&g.isRepo?(g.current==='HEAD'?'detached checkout':g.current||'detached checkout'):null,last?'last run '+ago(last.startedAt):'never run'].filter(Boolean).join(' · '):''}
async function load(){state=await api('/api/overview');try{ui.envs=await api('/api/environments');if(!ui.envs.environments.some(e=>e.name===ui.env))ui.env='local'}catch{ui.envs=null}try{ui.heals=await api('/api/heals')}catch{ui.heals=[]}if(!ui.heal&&ui.heals.length)ui.heal=ui.heals[0];ui.activeRunId=state.activeRunId;ui.cancelling=state.cancelling;if(state.running){ui.running=ui.running||'Verification is running';watchRun()}if(state.runs.length&&(!ui.runName||!state.runs.some(r=>r.name===ui.runName))&&!(ui.runAt&&ui.runAt.name===ui.runName)){ui.runName=state.runs[0].name;ui.run=null}if(ui.runName&&!ui.run){try{ui.run=await api(runApi(ui.runName))}catch{ui.run=null}}render();void loadReadiness()}
/* A grow whose config is in a subfolder saved its runs beside that config: the run it opened (ui.runAt) is read from there */
function runAtQuery(name){const a=ui.runAt;return a&&a.name===name&&a.config?'config='+encodeURIComponent(a.config):''}
function runApi(name){const q=runAtQuery(name);return '/api/runs/'+encodeURIComponent(name)+(q?'?'+q:'')}
/* The grow panel is the same element across a redraw: whatever in it had focus keeps it once it is placed again */
let pageTab=null;const disclosureState=new Map();
function page(...nodes){if(pageTab){for(const el of document.querySelectorAll('main details')){const key=el.dataset.disclosureKey||(el.id||el.querySelector('summary')?.textContent);if(key)disclosureState.set(el.dataset.disclosureKey?key:pageTab+':'+key,el.open)}}const fa=document.activeElement,reviewFocus=fa?.id==='review-reason'?{start:fa.selectionStart,end:fa.selectionEnd}:null,keep=fa&&fa!==document.body&&gw.el&&gw.el.contains(fa)?fa:null;
 document.getElementById('main').replaceChildren(...nodes.flat().filter(n=>n!==null&&n!==undefined&&n!==false));
 pageTab=tab;for(const el of document.querySelectorAll('main details')){const key=el.dataset.disclosureKey||(el.id||el.querySelector('summary')?.textContent);const stored=el.dataset.disclosureKey?key:tab+':'+key;if(key&&disclosureState.has(stored))el.open=disclosureState.get(stored)}
 if(reviewFocus){const field=document.getElementById('review-reason');if(field&&!field.disabled){field.focus({preventScroll:true});field.setSelectionRange(reviewFocus.start,reviewFocus.end)}}
 if(keep&&keep.isConnected&&document.activeElement!==keep)keep.focus({preventScroll:true})}

${SOURCE_CONTROLS_JS}
${COMPARISON_JS}
${GROVE_JS}
${NATIVE_IMPORTS_JS}
${WORKFLOW_MAP_JS}
${BENCHMARK_JS}
${CHROME_JS}
${READINESS_JS}
/* ---------- Run: the bonsai ---------- */
function scenarios(){const run=ui.run;const byId=new Map((run?run.cases:[]).map(c=>[c.caseId,c]));
 const flows=state.flows.concat(run?run.cases.filter(c=>!state.flows.some(f=>f.caseId===c.caseId)).map(c=>({...c,fixtures:[],steps:[]})):[]);
 const live=flows.map(f=>{const c=byId.get(f.caseId);const unavailable=run&&run.bundleVerified===false;const steps=(unavailable?[]:c?c.steps.filter(s=>s.declared!==false):f.steps).map(s=>({id:s.id,name:s.name,method:s.method,path:s.path,as:s.as,expect:s.expectStatus,expectation:s.expectation,result:c?(s.checks==='fail'&&s.result==='completed'?'fail':kind(s.result)):'none',status:c?s.status:null,observedText:c?s.observedText:null,ms:c?s.durationMs:null,reason:c?s.reason:null,checks:c?s.checks||null:null,compared:c?s.compared||null:null,answer:c?s.answer||null:null,checked:c?s.checked||null:null,calls:c?s.calls||null:null}));
  return{id:f.caseId,title:c?c.title:f.title,file:f.file,editable:state.flows.some(flow=>flow.caseId===f.caseId),fixtures:c||unavailable?[]:f.fixtures,state:unavailable?'unavailable':c?kind(c.outcome):'none',ms:c?c.durationMs:null,failure:c?c.failure:null,requests:c?c.requests||[]:[],steps}});
 const cut=(state.pruned||[]).map(p=>({id:p.file.replace(/^.*\//,'').replace(/\.flow\.(?:ya?ml|ts)\.pruned$/,''),title:p.title,file:p.file,state:'pruned',steps:[],fixtures:[]}));
 return live.concat(cut)}
/* The grove: one pad per scenario, one leaf per step, roots for the resources the steps reach.
   Same grammar as the mark: leaves above the soil line are what a user does, gold roots below are the system read back. */
const SVGNS='http://www.w3.org/2000/svg';
function sv(tag,attrs,...kids){const el=document.createElementNS(SVGNS,tag);for(const[k,v]of Object.entries(attrs||{})){if(k==='on')for(const[e,f]of Object.entries(v))el.addEventListener(e,f);else if(v!==null&&v!==undefined&&v!==false)el.setAttribute(k,String(v))}for(const kid of kids.flat()){if(kid===null||kid===undefined||kid===false)continue;el.append(kid instanceof Node?kid:document.createTextNode(String(kid)))}return el}
function cr(p,n){n=n||14;const o=[];for(let i=0;i<p.length-1;i++){const a=p[i-1]||p[i],b=p[i],c=p[i+1],d=p[i+2]||c;
 for(let k=0;k<n;k++){const t=k/n,t2=t*t,t3=t2*t;o.push([0,1].map(j=>.5*((2*b[j])+(-a[j]+c[j])*t+(2*a[j]-5*b[j]+4*c[j]-d[j])*t2+(-a[j]+3*b[j]-3*c[j]+d[j])*t3)))}}o.push(p[p.length-1]);return o}
function ribbon(p,w0,w1){const c=cr(p),L=[],R=[];for(let i=0;i<c.length;i++){const a=c[Math.max(0,i-1)],b=c[Math.min(c.length-1,i+1)];let dx=b[0]-a[0],dy=b[1]-a[1];const m=Math.hypot(dx,dy)||1;dx/=m;dy/=m;
 const w=(w0+(w1-w0)*Math.pow(i/(c.length-1),.8))/2;L.push([c[i][0]-dy*w,c[i][1]+dx*w]);R.push([c[i][0]+dy*w,c[i][1]-dx*w])}
 const f=q=>q[0].toFixed(1)+' '+q[1].toFixed(1);return 'M'+L.map(f).join(' L')+' L'+R.reverse().map(f).join(' L')+' Z'}
const line=p=>'M'+cr(p).map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' L');
const resource=p=>(p||'').split('?')[0].split('/').map(g=>/^\{[^}]*\}$/.test(g)||/^\d+$/.test(g)||/^[0-9a-f-]{12,}$/i.test(g)||(/^[A-Za-z0-9_-]{16,}$/.test(g)&&/\d/.test(g))?'·':g).join('/')||'/';
function grove(sc){const W=640,SOIL=206,CX=W/2,n=sc.length;let minY=60;const svg=sv('svg',{viewBox:'0 0 '+W+' 300',class:'grove'+(ui.sel?' focus':''),role:'img','aria-label':n+' scenarios as a grove: one pad per scenario, one leaf per step'});
 const wood=sv('g'),roots=sv('g'),pads=sv('g'),labels=sv('g');svg.append(sv('line',{class:'soil',x1:24,x2:W-24,y1:SOIL,y2:SOIL}),roots,wood,pads,labels);
 const top=[CX+4,128];wood.append(sv('path',{class:'wood',d:ribbon([[CX,SOIL+2],[CX-10,178],[CX+10,152],top],13,6)}));
 const r=7,gap=r*2.15,placed=[];
 sc.forEach((c,i)=>{const a=n===1?-Math.PI/2:Math.PI+0.42+(Math.PI-0.84)*i/(n-1);const px=CX+Math.cos(a)*Math.min(250,90+70*n),py=118+Math.sin(a)*62;
  const cut=c.state==='pruned';const mid=[(top[0]+px)/2,Math.min(top[1],py)+18];
  wood.append(cut?sv('path',{class:'cutwood',d:line([top,mid,[px,py+10]])}):sv('path',{class:'wood',d:ribbon([top,mid,[px,py+8]],4.5,1.6)}));
  const steps=cut?[{id:'',result:'pruned'},{id:'',result:'pruned'},{id:'',result:'pruned'}]:c.steps.length?c.steps:[{id:'',result:'none'}];
  const perRow=Math.ceil(steps.length/(steps.length>4?2:1));const pad=sv('g',{class:'pad'+(ui.sel===c.id?' on':''),tabindex:'-1','data-pad':c.id,on:{click:()=>{ui.sel=c.id;ui.step=Math.max(0,c.steps.findIndex(x=>x.result==='fail'));render();inspectStep()}}},sv('title',{},c.id+' · '+LABEL[c.state]));
  steps.forEach((x,j)=>{const row=Math.floor(j/perRow),col=j%perRow,inRow=row===0?Math.min(perRow,steps.length):steps.length-perRow;
   const at=c.failure&&x.name&&(x.name===c.failure.step||x.reportedName===c.failure.step);pad.append(sv('circle',{cx:(px+(col-(inRow-1)/2)*gap).toFixed(1),cy:(py-row*gap*.86).toFixed(1),r:r,class:'lf-'+(at?'fail':x.result),'data-leaf':x.id||null},at?sv('title',{},'Case failed at '+c.failure.step):null))});
  pads.append(pad);
  const text=c.id.length>26?c.id.slice(0,25)+'…':c.id,half=text.length*3.4+4,rows=steps.length>4?2:1;
  const box=y=>({x0:px-half,x1:px+half,y0:y-11,y1:y+3}),hit=b=>placed.some(q=>b.x0<q.x1&&q.x0<b.x1&&b.y0<q.y1&&q.y0<b.y1);
  let ly=py-(rows-1)*gap*.86-r-8;if(hit(box(ly)))ly=py+r+15;placed.push(box(ly));minY=Math.min(minY,ly-12);
  labels.append(sv('text',{x:px.toFixed(1),y:ly.toFixed(1),'text-anchor':'middle',class:(ui.sel===c.id?'on ':'')+(c.state==='fail'?'bad':'')},text))});
 // Roots are what the app served during the run (recorded by the proxy, including a page's own fetches); a scenario without a run falls back to the paths its steps declare.
 const res=new Map();const touch=(k,result)=>{const v=res.get(k)||{fail:false,pass:false};if(result==='fail')v.fail=true;if(result==='pass')v.pass=true;res.set(k,v)};
 for(const c of sc){if(c.requests&&c.requests.length){const by=new Map(c.steps.map(x=>[x.id,x.result]));for(const q of c.requests)if(q.step)touch(resource(q.path),by.get(q.step)||'none');continue}
  for(const x of c.steps){if(!x.path||!x.path.startsWith('/')||['UI','JOB','MCP'].includes(x.method))continue;touch(resource(x.path),x.result)}}
 const keys=[...res.keys()].slice(0,8);keys.forEach((k,i)=>{const m=keys.length;const a=m===1?Math.PI/2:0.3+(Math.PI-0.6)*(m-1-i)/(m-1);const tx=CX+Math.cos(a)*Math.min(270,80+60*m),ty=SOIL+18+Math.sin(a)*56;const v=res.get(k);
  roots.append(sv('path',{class:'root',d:line([[CX,SOIL+1],[(CX+tx)/2,SOIL+10+Math.sin(a)*20],[tx,ty]]),'stroke-width':1.6}),sv('circle',{class:'tip '+(v.fail?'fail':v.pass?'':'none'),cx:tx.toFixed(1),cy:ty.toFixed(1),r:3.6}),
   sv('text',{x:tx.toFixed(1),y:(ty+16+(i%2)*12).toFixed(1),'text-anchor':'middle',class:'rt'},k.length>22?k.slice(0,21)+'…':k))});
 svg.setAttribute('viewBox','0 '+Math.floor(minY)+' '+W+' '+Math.ceil(312-minY));
 if(res.size>keys.length)labels.append(sv('text',{x:W-24,y:304,'text-anchor':'end'},'+'+(res.size-keys.length)+' more resources'));
 return svg}
// Step ids are the slug of the authored name; a saved name with the same slug is the same step, not a rename.
const slug=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const sameName=x=>!!x.reportedName&&slug(x.reportedName)===x.name;
function legend(){const it=(cls,t)=>h('span',{},h('i',{style:cls}),t);return h('div',{class:'legend'},it('background:var(--moss)','held'),it('background:var(--verm)','failed'),it('background:var(--ochre)','blocked'),it('border:1px dashed var(--twig)','not run or pruned'),it('background:var(--gold)','route the app served'))}
function inputChip(){const src=state.verificationSource;const b=src.binding;
 return h('button',{class:'kpi chip',title:src.status==='blocked'?'Blocked — review selection':sourceDescription(b),on:{click:()=>{openTab('Settings');const details=document.getElementById('source-options');if(details){details.open=true;details.scrollIntoView({block:'nearest'});document.getElementById('snapshot-path')?.focus()}}}},
  h('b',{style:'font-size:14px'},src.status==='blocked'?'blocked':!b?'unknown':b.kind==='working_tree'?'working tree':'snapshot '+String(b.commit).slice(0,8)),h('span',{},'app files · change'))}
function runTab(){
 if(!state.hasConfig&&!ui.run)return[h('div',{class:'card fade',style:'max-width:640px'},h('span',{class:'label'},'Plant the first tree'),h('h1',{style:'margin:8px 0 12px'},'Plant your first test.'),
  h('p',{class:'muted'},'Start with your app. Tracegrove finds its framework and creates a configuration and one example test for you to review.'),h('button',{class:'btn',on:{click:async()=>{try{await api('/api/init',{});toast('Config and example flow written');await load()}catch(e){page(blocked(e))}}}},'Initialize'))];
 if(state.compileError&&!state.flows.length&&!ui.run)return[h('div',{class:'kpis',style:'margin:0 0 16px'},inputChip()),blocked(state.compileError)];
 const sc=scenarios();const run=ui.run;const ran=sc.filter(s=>s.state!=='none'&&s.state!=='pruned');const held=ran.filter(s=>s.state==='pass').length;
 const allSteps=run?(run.cases||[]).flatMap(s=>s.steps):[];const stepsHeld=allSteps.filter(s=>kind(s.result)==='pass'&&s.checks!=='fail').length;
 if(ui.sel==null||!sc.some(s=>s.id===ui.sel)){const f=sc.find(s=>s.state==='fail');ui.sel=f?f.id:(sc[0]||{}).id;ui.step=f?Math.max(0,f.steps.findIndex(x=>x.result==='fail')):0}
 const headline=ui.running?'Checking your scenarios…':!run?'Nothing has run yet. Run the grove to see which scenarios hold.':run.bundleVerified===false?'Evidence could not be verified for this run.':run.outcome==='passed'?'Every scenario held on this run.':held+' of '+ran.length+' scenarios held. '+(ran.length-held)+' need'+(ran.length-held===1?'s':'')+' a look.';
 /* the run a grow opened from beside its own config is not in this folder's list: it is offered first, as itself */
 const selected=sc.find(s=>s.id===ui.sel);if(selected&&(!Number.isInteger(ui.step)||ui.step<0||ui.step>=selected.steps.length))ui.step=0;
 const own=run&&!state.runs.some(r=>r.name===ui.runName)?[{name:ui.runName,startedAt:run.startedAt,outcome:run.outcome,bundleVerified:run.bundleVerified,totals:run.totals}]:[];
 const pick=h('select',{'aria-label':'Run',on:{change:async e=>{ui.runName=e.target.value;ui.run=null;ui.sel=null;await load()}}},own.concat(state.runs).map(r=>h('option',{value:r.name,selected:r.name===ui.runName},r.bundleVerified===false?ago(r.startedAt)+' · evidence unavailable':ago(r.startedAt)+' · '+LABEL[kind(r.outcome)]+' · '+r.totals.passed+'/'+(r.totals.passed+r.totals.failed+r.totals.other))));
 const kpi=(b,t,cls)=>h('div',{class:'kpi'},h('b',{class:cls||''},b),h('span',{},t));
 const drift=run&&(state.sourceDigest==null?'Current application source could not be resolved.':run.sourceDigest!==state.sourceDigest?'Application source differs from this recorded run.':null);
 const ev=run?(run.evidenceStatus==='verified'?'saved evidence freshly verified':'saved evidence '+(run.evidenceStatus||'unavailable')):null;const na=run&&run.bundleVerified===false;
 const hero=h('section',{style:'margin-bottom:24px'},h('div',{class:'row',style:'justify-content:space-between;align-items:flex-start'},
   h('div',{},h('span',{class:'label'},run?(ui.running?'Previous run ':'Run ')+run.runDir.split('/').pop():state.flows.length+' scenarios planted'),run?envBadge(run.environment):null,h('h1',{style:'margin-top:6px'},headline)),
   h('div',{class:'row'},envSwitch(),state.runs.length||own.length?pick:null,ui.running?h('div',{class:'row'},h('span',{class:'row muted'},h('span',{class:'think'},h('i'),h('i'),h('i')),h('span',{id:'run-activity',role:'status','aria-live':'polite'},ui.running)),ui.activeRunId?h('button',{class:'btn ghost',disabled:ui.cancelling,on:{click:cancelRun}},ui.cancelling?'Waiting for run to settle':'Cancel run'):null):
    [h('button',{class:'btn',disabled:!state.hasConfig||!!state.compileError,on:{click:()=>runNow('')}},'Run all')])),
  h('div',{class:'kpis'},run?[kpi(na?'unavailable':held+' / '+ran.length,'scenarios held'),kpi(na?'unavailable':stepsHeld+' / '+allSteps.length,'steps held'),kpi(na?'unavailable':secs(new Date(run.finishedAt)-new Date(run.startedAt)),'wall time'),
    kpi(run.bundleVerified?'✓':'–',ev,run.bundleVerified?'c-pass':'c-warn')]:[kpi(String(state.flows.length),'scenarios'),kpi(String(state.flows.reduce((a,f)=>a+f.steps.length,0)),'steps')],inputChip()),
  drift?h('p',{class:'small c-warn',role:'note',style:'margin:10px 0 0'},drift+' Rerun to check today’s code.'):null,
  run?h('details',{class:'more'},h('summary',{},'About this evidence'),h('div',{class:'small muted'},h('p',{role:'note'},'Showing recorded scenarios and steps. Run current flow and Run all use the current configuration.'),
   run.sourceIssue?h('p',{'aria-label':'Saved evidence status'},run.sourceIssue):null,
   h('p',{},'Recorded run request: '+(run.sourceChecked?sourceDescription(run.sourceBinding):'Unavailable — saved evidence could not establish the input.')))):null,
  state.compileError?h('div',{style:'margin-top:16px'},blocked(state.compileError)):null,ui.error?h('div',{style:'margin-top:16px'},blocked(ui.error)):null);
 const canopy=h('section',{class:'card grovecard','aria-label':'Grove'},grove(sc),legend());
 const tree=h('section',{class:'grow','aria-label':'Scenario tree'},canopy,h('div',{class:'rulehead'},h('span',{class:'label'},'Scenarios'),h('span',{class:'rule'}),h('span',{class:'small muted'},'step · request · run clock · status')),
  h('div',{class:'tree'+(ui.running?' growing':'')},sc.map(s=>branch(s))));
 const side=h('div',{class:'side'},fixes(sc,run),detail(sc));
 return[hero,h('div',{class:'cols'},tree,side)]}
function branch(s){const open=ui.sel===s.id&&s.steps.length>0;const cut=s.state==='pruned';const total=s.steps.reduce((a,x)=>a+(x.ms||0),0)||1;let at=0;
 const renamed=s.reportedTitle&&s.reportedTitle!==s.title;
 return h('div',{class:'fade'},h('div',{class:'br'},h('span',{class:'twig'+(cut?' cut':'')},h('i')),
  h('button',{class:'node','data-case':s.id,'data-steps':s.steps.map(x=>x.id).join(' '),'aria-expanded':open?'true':'false',on:{click:()=>{ui.sel=s.id;ui.step=Math.max(0,s.steps.findIndex(x=>x.result==='fail'));render()}}},
   h('span',{class:'dot '+s.state,'aria-hidden':'true'}),
   h('span',{class:'body'},h('span',{class:'row',style:'gap:4px 12px'},h('span',{class:'id',style:cut?'color:var(--muted)':''},s.id),h('span',{class:'state c-'+(cut?'none':s.state)},LABEL[s.state]),renamed?h('span',{class:'tag',title:'Saved title (unsealed): '+s.reportedTitle},'renamed'):null),
    h('span',{style:cut?'color:var(--ink3)':''},s.title),s.fixtures.length?h('span',{class:'small muted'},'given '+s.fixtures.join(', ')):null),
   h('span',{class:'pips','aria-label':s.steps.filter(x=>x.result==='pass').length+' of '+s.steps.length+' steps held'},s.steps.map(x=>h('i',{class:x.result}))),
   h('span',{class:'time'},secs(s.ms)))),
  open?h('div',{class:'twigs fade'},s.steps.map((x,j)=>{const left=at/total*100;at+=x.ms||0;return h('div',{class:'br'},h('span',{class:'twig'},h('i')),
   h('button',{class:'step','data-step':x.id,'aria-pressed':ui.step===j?'true':'false',on:{click:()=>{ui.step=j;render();inspectStep()}}},h('span',{class:'dot s '+x.result,'aria-hidden':'true'}),h('span',{},sameName(x)?x.reportedName:x.name,x.reportedName&&!sameName(x)?h('span',{class:'tag',title:'Saved name (unsealed): '+x.reportedName},'renamed'):null),h('span',{class:'req'},x.method+' '+x.path),
    h('span',{class:'bar','aria-hidden':'true'},x.ms!=null?h('i',{class:x.result==='fail'?'fail':'',style:'left:'+left.toFixed(1)+'%;width:'+((x.ms||0)/total*100).toFixed(1)+'%'}):null),
    h('span',{class:'ms muted'},x.ms!=null?x.ms+' ms':''),h('span',{class:'res c-'+x.result},x.status!=null?x.status:x.result==='none'?'–':LABEL[x.result])))})):null)}
function fixes(sc,run){const items=[];for(const s of sc)if(s.state==='fail'||s.state==='warn')items.push({s,title:s.failure?s.failure.message:'Did not complete',where:s.failure?'step "'+s.failure.step+'"':s.file});
 if(run&&run.bundleVerified===false&&!(run.blockers||[]).some(b=>b.code==='saved_evidence_unavailable'))items.push({s:null,title:'Exported evidence failed verification',where:'Inspect bundle-problems.txt before relying on this run.'});
 for(const b of (run&&run.blockers)||[])items.push({s:null,title:b.code==='saved_evidence_unavailable'?'Saved evidence is unavailable':b.code+': '+b.detail,where:b.action});
 if(!items.length)return h('section',{'aria-label':'Needs a fix',class:'row small muted',style:'gap:10px;padding:4px 2px'},h('span',{class:'dot s '+(run?'pass':'none')}),run?'Nothing needs a fix. Every scenario that ran held.':'Run the grove and failures land here, in the order they happened.',run&&ui.ready&&!ui.ready.error&&signoffCount()>0?h('button',{class:'btn ghost sm',on:{click:()=>openTab('Readiness')}},signoffCount()+' awaiting sign-off',icon('Arrow')):null);
 return h('section',{'aria-label':'Needs a fix'},h('div',{class:'rulehead'},h('h2',{},'Needs a fix'),h('span',{class:'rule'}),h('span',{class:'small muted'},items.length+' open'),
   !ui.running?h('button',{class:'btn sm',title:'Fix setup and drifted tests, prove each fix by re-running; product bugs are reported, never hidden (h)',on:{click:()=>startHeal(false)}},'Heal'):null),
  h('div',{style:'display:flex;flex-direction:column;gap:8px'},items.map(it=>h('button',{class:'fix','aria-pressed':it.s&&ui.sel===it.s.id?'true':'false',on:{click:()=>{if(!it.s)return;ui.sel=it.s.id;ui.step=Math.max(0,it.s.steps.findIndex(x=>x.result!=='pass'));render()}}},
   h('span',{class:'row',style:'gap:8px'},h('span',{class:'pill '+(it.s&&it.s.state==='fail'?'p-fail':'p-warn')},it.s&&it.s.state==='fail'?'failed':'blocked'),h('span',{class:'mono small'},it.s?it.s.id:'run')),h('span',{},it.title),h('span',{class:'small muted'},it.where)))))}
function recording(s){const c=ui.run&&(ui.run.cases||[]).find(c=>c.caseId===s.id);const v=c&&(c.videos||[]).find(v=>v.mediaType==='video/webm'&&/^[a-f0-9]{64}$/.test(v.digest));if(!v||!ui.runName)return null;
 const status=h('p',{class:'small muted',role:'status'},'Checking the recording evidence…');
 if(ui.run.bundleVerified===false)return h('section',{class:'recording','aria-label':'Browser recording'},h('h2',{},'Browser recording'),h('p',{role:'alert'},'Recording unavailable: this run’s evidence failed verification.'));
 const key=ui.runName+':'+v.digest;let posed=false;
 const player=h('video',{controls:true,playsinline:true,preload:'metadata','aria-label':'Browser recording for '+s.id,src:'/api/runs/'+encodeURIComponent(ui.runName)+'/media/'+v.digest+'?case='+encodeURIComponent(s.id)+(runAtQuery(ui.runName)?'&'+runAtQuery(ui.runName):''),
  on:{loadedmetadata:()=>{const at=ui.videoTimes[key],end=Number.isFinite(player.duration)?player.duration:0;if(Number.isFinite(at)&&at>0)player.currentTime=Math.min(at,end||at);else if(end>0.2){posed=true;player.currentTime=end-0.1}status.textContent='Recording loaded from verified evidence.'},play:()=>{if(posed){posed=false;player.currentTime=0}},timeupdate:()=>{if(!posed)ui.videoTimes[key]=player.currentTime},error:()=>{status.textContent='Recording unavailable or its evidence failed verification.'}}});
 return h('section',{class:'recording','aria-label':'Browser recording'},h('h2',{},'Browser recording'),player,status)}
/* Every comparison a step's checks made, each with its mark, worded as the verdict words a failure ("Expected 2 charges, got 3"):
   the Run tab's step and the grow page's drawer show the same rows. A comparison whose record cannot say whether it held is
   said to be not recorded, never held. */
function stepChecked(list){return h('div',{class:'cks'},(list||[]).map(c=>{const k=c.held===true?'pass':c.held===false?'fail':'none';
 return h('div',{class:'ck '+k},h('span',{class:'m'},{pass:'✓',fail:'✗',none:'?'}[k],h('span',{class:'sr'},{pass:' held',fail:' failed',none:' not recorded'}[k])),h('span',{class:'k'},c.check),h('span',{class:'v'},c.held===null?'Not recorded whether it held: '+c.says.charAt(0).toLowerCase()+c.says.slice(1):c.says))}))}
/* One call a stand-in recorded: what it was asked, and when, under which idempotency key, as the stand-in recorded it */
const callLine=c=>c.standIn+' '+c.method+' '+c.path+(c.amount!=null?' · '+c.amount+(c.currency?' '+c.currency:''):'')+(c.description?' · '+c.description:'')+' → '+c.status;
const callMeta=c=>'at '+String(c.at).slice(11,23)+' UTC · '+(c.key?'idempotency key '+c.key+(c.repeat?' (a repeat)':''):'no idempotency key')+(c.faulted?' · the stand-in faulted it':'');
function stepCalls(list){return (list||[]).map(c=>h('div',{class:'call'},h('span',{class:'mono'},callLine(c)),h('span',{class:'small muted'},callMeta(c))))}
/* a recorded value as the page writes it: text quoted, everything else as JSON */
const shown=v=>typeof v==='string'?JSON.stringify(v):v===undefined?'nothing':JSON.stringify(v);
function detail(sc){const s=sc.find(x=>x.id===ui.sel);if(!s)return null;const x=s.steps[ui.step==null?0:ui.step];const current=state.flows.find(f=>f.caseId===s.id);
 if(!x)return h('aside',{class:'card fade'},h('span',{class:'label'},s.id),h('h2',{style:'margin:6px 0'},s.title),h('p',{class:'muted'},s.state==='pruned'?'Pruned: the file is kept as '+s.file+' and the compiler skips it.':s.state==='unavailable'?'Recorded steps are unavailable until this run’s evidence can be verified.':'No steps.'),
  s.state==='pruned'?h('button',{class:'btn ghost',on:{click:()=>prune(s.file.replace(/\.pruned$/,''),true)}},'Graft back'):null);
 const bad=x.result==='fail';
 /* a step whose check failed shows what that check expected and what it got, from the run's recorded assertion */
 const cmp=x.checks==='fail'&&x.compared?x.compared:null;
 return h('aside',{class:'card fade','aria-label':'Step detail'},h('button',{class:'btn ghost sm step-return',on:{click:()=>{const step=document.querySelector('[data-step][aria-pressed=true]');step?.focus({preventScroll:true});step?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})}}},'Back to steps'),h('span',{class:'label'},s.id+' › step '+(ui.step+1)+' of '+s.steps.length),h('h2',{style:'margin:6px 0 2px'},sameName(x)?x.reportedName:x.name),
  x.reportedName&&!sameName(x)?h('p',{class:'small muted'},'Saved name (unsealed): '+x.reportedName):null,
    h('p',{class:'mono small muted',style:'margin:0'},[x.method&&x.path?x.method+' '+x.path:null,x.as?'as '+x.as:null,x.ms!=null?x.ms+' ms':null].filter(Boolean).join(' · ')),

  h('div',{class:'obs'+(x.observedText&&x.observedText.length>120?' obs-long':'')},h('div',{},h('div',{class:'label'},'expected'),h('div',{class:'mono','data-testid':'step-expected'},cmp?cmp.check+': '+shown(cmp.expected):x.expectation||(x.expect!=null?'Status '+x.expect:'Step completes'))),h('div',{class:bad?'bad':x.result==='pass'?'good':''},h('div',{class:'label'},'observed'),(x.method==='VOICE'||x.method==='CHAT')&&x.observedText?transcript(x.observedText,x.method):h('div',{class:'mono','data-testid':'step-observed'},cmp?cmp.check+': '+shown(cmp.got)+(x.observedText!=null?'\n'+x.observedText:''):x.observedText!=null?x.observedText:x.status!=null?x.status:x.result==='none'?'not run':LABEL[x.result]))),
  x.answer!=null?h('div',{class:'answer'},h('div',{class:'label'},'the app answered'),h('pre',{'data-testid':'step-answer'},x.answer)):null,
  x.checked&&x.checked.length?(bad?h('div',{class:'checked','data-testid':'step-checked'},h('div',{class:'label'},'we checked'),stepChecked(x.checked)):disclosure(x.checked.length+' checks passed',h('div',{'data-testid':'step-checked'},stepChecked(x.checked)))):null,
  x.calls&&x.calls.length?h('div',{class:'checked','data-testid':'step-calls'},h('div',{class:'label'},'the stand-in recorded'),stepCalls(x.calls)):null,
  s.failure?h('pre',{},'Recorded case failure at '+s.failure.step+': '+s.failure.message+(s.failure.observed?'\n'+s.failure.observed:'')):x.reason?h('p',{class:'small muted'},x.reason):x.result==='pass'?null:h('p',{class:'small muted'},'Run the scenario to observe this step.'),
  recording(s),
  !current?h('p',{class:'small muted'},'This recorded scenario has no current flow to run or prune.'):null,
  h('div',{class:'filepath',title:s.reportedFile||s.file},s.reportedFile?'Saved flow (unsealed): '+s.reportedFile:s.file),
  h('div',{class:'row',style:'margin-top:10px;justify-content:flex-end'},
   current?disclosure('Flow options',h('p',{class:'small muted'},'Pruning pauses this flow. Its file and recorded evidence are kept, and you can restore it later.'),h('button',{class:'btn ghost sm',on:{click:()=>prune(current.file,false)}},ui.run?'Prune current flow':'Prune')):null,h('button',{class:'btn sm',disabled:!current||!!ui.running||!!state.compileError,on:{click:()=>runNow(s.id)}},'Run current flow')))}
let runWatch=null;
function stopRunWatch(){if(runWatch!==null)clearInterval(runWatch);runWatch=null}
/* Live progress comes from real run and agent events (/api/live), never from timers. */
function paintLive(){const l=ui.live;if(!l)return;const a=l.run;
 const el=document.getElementById('run-activity');if(el&&a.status==='running')el.textContent=a.label;
 for(const n of document.querySelectorAll('[data-step]'))n.classList.toggle('live',a.status==='running'&&!!a.stepId&&n.getAttribute('data-step')===a.stepId);
 for(const n of document.querySelectorAll('[data-leaf]'))n.classList.toggle('lf-live',a.status==='running'&&!!a.stepId&&n.getAttribute('data-leaf')===a.stepId);
 for(const n of document.querySelectorAll('[data-steps]'))n.classList.toggle('live',a.status==='running'&&!!a.stepId&&n.getAttribute('data-steps').split(' ').includes(a.stepId));
 const log=document.getElementById('agent-log');if(log){const lines=l.agent.lines.length?l.agent.lines:['Waiting for the agent to start'];if(log.childElementCount!==lines.length||log.lastChild.textContent!==lines[lines.length-1]){const stick=log.scrollTop+log.clientHeight>=log.scrollHeight-8;log.replaceChildren(...lines.map(x=>h('div',{},x)));if(stick)log.scrollTop=log.scrollHeight}}
 const hp=document.getElementById('heal-phase');if(hp&&l.heal.status==='running')hp.textContent=l.heal.phase+(l.heal.detail?' · '+l.heal.detail:'')}
function watchRun(){if(runWatch!==null)return;let polling=false;runWatch=setInterval(async()=>{if(polling)return;polling=true;try{const [l,c]=await Promise.all([api('/api/live'),api('/api/run-control')]);const changed=ui.activeRunId!==c.runId||ui.cancelling!==c.cancelling;ui.activeRunId=c.runId;ui.cancelling=c.cancelling;ui.live=l;if(changed)render();const a=l.run;if(ui.running&&a.status==='running')ui.running=a.label;paintLive();
  if(ui.running&&!ui.healing&&ui.agentPhase<0&&(a.status==='finished'||a.status==='failed')){stopRunWatch();ui.running=false;ui.runName=null;ui.run=null;await load()}}catch{}finally{polling=false}},400)}
async function cancelRun(){const runId=ui.activeRunId;if(!runId||ui.cancelling)return;ui.cancelling=true;render();try{const r=await api('/api/cancel',{runId});toast((r.operation==='heal'?'Heal':r.operation==='draft'?'Draft':'Run')+' settled: '+r.outcome+'; inspect saved records')}catch(e){ui.error=e;render()}}
async function runNow(grep){if(state.compileError){ui.error=state.compileError;render();return}if(ui.running)return;ui.running='Compiling flows and starting the app';render();watchRun();
 ui.error=null;try{const r=await api('/api/test',{grep,env:ui.env});ui.runName=r.runDir.split('/').pop();ui.run=r;ui.sel=null;toast(r.outcome==='passed'?'Every scenario held':'Run finished: '+r.totals.passed+' held, '+(r.totals.failed+r.totals.other)+' need a look',r.outcome==='passed'?null:{label:'Heal',run:()=>startHeal(false)})}catch(e){ui.error=e}finally{stopRunWatch();ui.running=false;ui.activeRunId=null;ui.cancelling=false}await load()}
async function prune(file,graft){try{await api('/api/prune',{file,graft});toast(graft?'Grafted back':'Pruned '+file.split('/').pop(),{label:'Undo',run:()=>prune(file,!graft)});ui.sel=null;await load()}catch(e){toast(e.error||'Could not '+(graft?'graft':'prune'))}}

/* ---------- Discover: source, reachability, intent ---------- */
function seed(){return sv('svg',{width:44,height:44,viewBox:'0 0 44 44','aria-hidden':'true',fill:'none','stroke-linecap':'round'},sv('line',{x1:4,y1:30,x2:40,y2:30,stroke:'currentColor','stroke-opacity':.4}),
 sv('path',{d:'M22 30c0-5-1-8 1-12',stroke:'currentColor','stroke-width':1.6}),sv('circle',{cx:23,cy:14,r:4,stroke:'currentColor','stroke-dasharray':'2 2'}),sv('path',{d:'M22 30c-3 3-7 4-10 4M22 30c3 3 6 5 9 5',stroke:'var(--gold)','stroke-width':1.2}))}
function discoverTab(){const g=state.git;const a=state.agent.settings;const name=a.provider==='claude'?'Claude':a.provider==='codex'?'Codex':null;const available=!!(name&&state.agent.detected[a.provider]);
 const sources=[{v:'',label:'working tree',note:'uncommitted files included'}].concat(g.branches.map(b=>({v:b,label:b,note:b===g.current?'checked out':b===g.base?'base':''})));
 const chips=h('label',{class:'source-picker'},'Source',h('select',{'aria-label':'Source',on:{change:e=>{ui.source=e.target.value;if(!gw.busy){gw.state=null;gw.view=null;gw.lastFor=null;gw.svg=null;gw.B=null;gw.pinned=null}scan()}}},(g.isRepo?sources:sources.slice(0,1)).map(s=>h('option',{value:s.v,selected:ui.source===s.v},s.label+(s.note?' · '+s.note:'')))));
 const d=ui.disc;
 const intent=h('section',{class:'card','aria-label':'Intent'},h('span',{class:'label'},'Intent'),h('h2',{style:'margin:6px 0 14px'},'What should your app do?'),
  h('textarea',{id:'intent',placeholder:'For example: cancelling a booking releases the appointment and sends a confirmation.','aria-label':'Intent',on:{input:e=>{ui.intent=e.target.value}}},ui.intent||''),
  h('div',{class:'row',style:'margin-top:12px'},h('button',{class:'btn','aria-describedby':'agent-readiness',disabled:!available||ui.agentPhase>=0,on:{click:agentDraft}},name?'Draft with '+name:'Draft'),
   h('span',{id:'agent-readiness',class:'small muted',style:'flex:1;min-width:220px'},name?(available?name+' ('+(a.model||'CLI default')+') writes flows into tracegrove/discovered/; tracegrove runs each one end to end before you see it.':name+' is not installed. Executable detection does not establish sign-in.'):'No agent selected: route templates still work.'),
   h('button',{class:'btn ghost sm',on:{click:()=>{tab='Settings';render()}}},'Settings')),
  ui.agentPhase>=0?h('div',{class:'fade'},h('p',{class:'row small muted',style:'margin:14px 0 0'},h('span',{class:'think'},h('i'),h('i'),h('i')),name+' is working; tracegrove runs every file it writes'),
   h('div',{class:'log',id:'agent-log','aria-live':'polite'},(ui.live&&ui.live.agent.task==='draft'&&ui.live.agent.lines.length?ui.live.agent.lines:['Waiting for the agent to start']).map(x=>h('div',{},x)))):null,
  ui.agent?agentResult():null);
 const seen=d?d.routes.filter(r=>r.observedBy.length).length:0;
 const reach=h('section',{style:'margin-top:28px'},d&&d.ambiguities.length?unsure(d,available,name):null,
  h('div',{class:'rulehead'},h('span',{class:'label'},'Routes'),h('span',{class:'rule'}),d?h('span',{class:'small muted','data-testid':'route-summary'},d.routes.length+' recognized · '+seen+' served in a run · '+d.uncovered+' untested'+(d.branch&&d.base?' · '+d.changedFiles.length+' files changed':'')):null),
  d?h('p',{class:'small muted','data-testid':'observed-source',style:'margin:-4px 0 12px'},d.observed?('Served means the app answered that route during the verified run '+d.observed.run+(d.observed.stale?', before the latest source change. Run again to refresh.':'.')):'No verified run yet, so no route is confirmed by traffic. Run all to confirm them.'):null,
  g.isRepo?null:h('p',{class:'small muted'},'Scanning this project’s files.'),
  d&&d.coverage?coverageStrip(d):null,
  ui.scanError?h('div',{role:'alert'},h('p',{},'Routes could not be loaded.'),blocked(ui.scanError),h('button',{class:'btn ghost',on:{click:scan}},'Try again')):!d?h('p',{class:'row muted',role:'status'},h('span',{class:'think'},h('i'),h('i'),h('i')),'Scanning routes'):d.routes.length?(d.events?areas(d):h('div',{},d.routes.map(r=>routeRow(r)))):
   h('div',{class:'empty'},seed(),h('div',{},h('b',{style:'font-weight:500;color:var(--ink)'},'No routes recognized here.'),h('div',{class:'small'},'Describe the behavior above and the agent drafts flows from the code instead.'))),
  d&&d.actions&&d.actions.length?library(d.actions):null,
  d&&d.events&&d.events.length?feed(d.events):null,
  h('details',{class:'more'},h('summary',{},'What this scan covers'),h('div',{class:'small muted'},h('p',{},'Two sources. The static scan reads FastAPI, Django, Express and plain node:http handlers from source text, which is a hint. The recording proxy in front of the app sees every request a run causes, including the ones a browser page makes, which is evidence.'),
   h('p',{},'Routes seen only in traffic have no source location yet. Routing the scan cannot read is listed above as a question for the agent.'),g.isRepo?h('p',{},'A branch shows routes in files it changed against '+(g.base||'the default branch')+' first.'):null)),
  ui.draft?draftCard():null);
 return[g.isRepo?h('div',{style:'margin-bottom:20px'},chips):null,growPanel(),disclosure('Write a test from a description',intent),disclosure('Explore routes and existing tests',reach)]}
/* Coverage strip: where the app stands, and the riskiest routes nothing tests yet. */
function coverageStrip(d){const c=d.coverage;const stat=(n,label,cls)=>h('span',{},h('b',{class:cls||null},String(n)),h('span',{class:'small muted'},label));
 return h('div',{'data-testid':'coverage-strip',style:'margin:0 0 16px'},h('div',{class:'stats',style:'margin-top:0'},stat(c.domains,c.domains===1?'area':'areas'),stat(c.surfaces,'routes'),stat(c.observed,'served in a run'),stat(c.declared,'declared'),stat(c.untested,'untested',c.untested?'c-fail':null),
   c.proven||c.failed?stat(c.proven,'scenarios proven','c-pass'):null,c.failed?stat(c.failed,'failing','c-fail'):null),
  c.riskyUntested.length?h('div',{class:'card',style:'margin-top:14px','data-testid':'risky-untested'},h('span',{class:'label'},'Riskiest untested, draft these first'),
   c.riskyUntested.map(x=>{const r=d.routes.find(y=>y.method===x.method&&y.path===x.path);return h('div',{class:'row',style:'justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)'},
    h('span',{},h('span',{class:'mono small'},x.method+' '+x.path),h('span',{class:'small muted',style:'margin-left:10px'},x.risk.why.join(', '))),r?h('button',{class:'btn ghost sm',on:{click:()=>draftOne(r)}},'Draft'):null)})):null)}
/* Routes grouped by the area of code that declares them, riskiest area and route first. */
function areas(d){const risk=new Map();const out=[];let group=null;
 for(const e of d.events){if(e.kind==='domain.found'){group={e,routes:[]};out.push(group)}else if(e.kind==='surface.found'&&group){const r=d.routes.find(y=>y.method===e.method&&y.path===e.path);if(r){risk.set(r,e.risk);group.routes.push(r)}}}
 return h('div',{'data-testid':'areas'},out.map(g=>h('section',{style:'margin-bottom:14px','data-testid':'area'},
  h('div',{class:'row small',style:'gap:8px;margin:4px 0'},h('b',{style:'font-weight:500'},g.e.domain),h('span',{class:'muted'},g.routes.length+' route'+(g.routes.length===1?'':'s')+(g.e.from==='url'?' · grouped by URL':''))),
  g.routes.map(r=>routeRow(r,risk.get(r))))))}
/* What discovery did, in plain words, in the order it happened. */
function feed(events){return h('details',{class:'more','data-testid':'discovery-feed'},h('summary',{},'What discovery did ('+events.length+' steps)'),
 h('div',{class:'log','aria-live':'polite'},events.map((e,i)=>h('div',{class:'fade',style:'animation-delay:'+Math.min(i*40,1200)+'ms'},(e.kind==='question.asked'?'? ':e.kind==='flow.failed'?'✗ ':e.kind==='flow.proven'?'✓ ':'')+e.summary))))}
function routeRow(r,risk){const served=r.observedBy.length>0,declared=r.coveredBy.length>0,covered=served||declared;
 const note=served?'served during '+r.observedBy.join(', '):r.confirmedEarlier?'confirmed earlier in run '+r.confirmedEarlier.run+(declared?'; declared by '+r.coveredBy.join(', '):''):declared?'declared by '+r.coveredBy.join(', ')+', not seen in a verified run yet':'no flow reaches it';
 return h('div',{class:'route fade','data-testid':'route'},h('span',{class:'dot s '+(served?'pass':declared?'warn':'fail'),'aria-hidden':'true'}),
 h('span',{style:'min-width:0'},h('span',{class:'mono small'},r.method+' '+r.path),r.changed?h('span',{class:'pill p-warn',style:'margin-left:8px'},'changed'):null,r.provenance==='traffic'?h('span',{class:'pill p-info',style:'margin-left:8px'},'traffic only'):r.provenance==='catalog'?h('span',{class:'pill p-info',style:'margin-left:8px'},'from catalog'):null,(r.actions||[]).map(a=>h('span',{class:'pill p-pass mono',style:'margin-left:8px'},a)),risk&&risk.score>=3?h('span',{class:'pill '+(covered?'p-none':'p-warn'),style:'margin-left:8px',title:'risk '+risk.score},risk.why.join(', ')):risk&&risk.pii?h('span',{class:'pill p-none',style:'margin-left:8px'},'personal data'):null,h('div',{class:'small '+(covered?'muted':'c-fail')},note)),
 h('span',{class:'where mono small muted',style:'overflow-wrap:anywhere'},r.file?r.file+(r.line?':'+r.line:''):'not in scanned source'),covered||r.method==='ANY'?h('span'):h('button',{class:'btn ghost sm',on:{click:()=>draftOne(r)}},'Draft'))}
/* Reusable actions: the step sequences flows compose with use:, and the routes each one reaches. */
function library(actions){return h('section',{style:'margin-top:24px','aria-label':'Reusable actions','data-testid':'action-library'},
 h('div',{class:'rulehead'},h('span',{class:'label'},'Reusable actions'),h('span',{class:'rule'}),h('span',{class:'small muted'},actions.length+' action'+(actions.length===1?'':'s')+' · flows call them with use:')),
 actions.map(a=>h('div',{class:'route fade'},h('span',{class:'dot s '+(a.usedBy.length?'pass':'none'),'aria-hidden':'true'}),
  h('span',{style:'min-width:0'},h('span',{class:'mono small'},a.id),h('div',{class:'small muted'},a.title+(a.inputs.length?' · inputs '+a.inputs.join(', '):'')+(a.outputs.length?' · outputs '+a.outputs.join(', '):''))),
  h('span',{class:'where mono small muted',style:'overflow-wrap:anywhere'},a.routes.join(', ')||'no routes'),h('span',{class:'small muted'},a.usedBy.length?'used by '+a.usedBy.length:'unused'))))}
/* Where discovery is unsure: each item is a question the agent answers with flows, and the run proves the answer. */
function unsure(d,available,name){const items=d.ambiguities;
 return h('section',{class:'card fade',style:'margin-bottom:24px','aria-label':'Needs a decision','data-testid':'ambiguities'},h('div',{class:'row',style:'justify-content:space-between'},h('span',{class:'label'},'Needs a decision'),h('span',{class:'small muted'},items.length+' place'+(items.length===1?'':'s')+' discovery cannot read')),
  h('div',{style:'margin-top:8px'},items.slice(0,8).map(a=>h('div',{class:'row',style:'justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)'},
   h('span',{style:'min-width:0;flex:1'},h('span',{class:'pill '+(a.kind==='unlisted_traffic'?'p-info':'p-warn')},a.kind==='unlisted_traffic'?'seen, not found':'unreadable'),h('span',{class:'small',style:'margin-left:8px'},a.detail)),
   h('button',{class:'btn ghost sm',disabled:!available||ui.agentPhase>=0,title:available?a.ask:'Choose an agent in Settings',on:{click:()=>{ui.intent=a.ask;agentDraft()}}},name?'Ask '+name:'Ask agent')))),
  items.length>8?h('p',{class:'small muted',style:'margin:8px 0 0'},'+'+(items.length-8)+' more; Draft with '+(name||'the agent')+' resolves all of them.'):null,
  h('p',{class:'small muted',style:'margin:10px 0 0'},'The agent reads the code and writes flows; tracegrove runs them and keeps only what the app actually served.'))}
function draftCard(){const d=ui.draft;return h('div',{class:'card fade',style:'margin-top:16px'},h('span',{class:'label'},'Draft'),h('h2',{class:'mono',style:'font-size:14px;margin:6px 0 12px'},'discovered/'+d.file),h('pre',{},d.yaml),
 h('div',{class:'row',style:'margin-top:12px'},h('button',{class:'btn',on:{click:async()=>{try{const s=await api('/api/draft',{method:d.route.method,path:d.route.path,save:true});ui.draft=null;toast('Saved '+s.saved.split('/').slice(-3).join('/')+'. Fill the TODOs.');await load();scan()}catch(e){toast(e.error||'Could not save')}}}},'Plant it'),h('button',{class:'btn ghost',on:{click:()=>{ui.draft=null;render()}}},'Discard')))}
async function draftOne(r){try{const d=await api('/api/draft',{method:r.method,path:r.path});ui.draft={...d,route:r};render()}catch(e){toast(e.error||'Could not draft')}}
let scanSerial=0;
async function scan(){const serial=++scanSerial;ui.scanning=true;ui.scanError=null;ui.disc=null;ui.draft=null;if(tab==='Discover')render();try{const result=await api('/api/discover?branch='+encodeURIComponent(ui.source||''));if(serial!==scanSerial)return;ui.disc=result}catch(e){if(serial!==scanSerial)return;ui.scanError=e}finally{if(serial===scanSerial){ui.scanning=false;if(tab==='Discover')render()}}}
async function agentDraft(){const box=document.getElementById('intent');if(box){ui.intent=box.value;reveal(box)}ui.agent=null;ui.agentPhase=0;ui.live=null;render();watchRun();
 try{ui.agent=await api('/api/agent-draft',{intent:ui.intent||'',branch:ui.source})}catch(e){ui.agent={error:e}}finally{ui.agentPhase=-1;stopRunWatch()}await load();if(ui.disc)scan();
 if(ui.agent&&ui.agent.agent){const p=ui.agent.prove;const n=p?p.flows.filter(f=>f.outcome==='proven').length:0;toast(ui.agent.agent.files.length+' flow file(s) drafted'+(p&&p.flows.length?'; '+n+' proven end to end':ui.agent.check.ok?' and checked':'; check found issues'))}}
const PROVE={proven:['proven','p-pass'],failed:['failed','p-fail'],product_bug:['product bug','p-fail'],not_run:['not run','p-none']};
function agentResult(){const r=ui.agent;if(r.error)return h('div',{style:'margin-top:16px'},blocked(r.error));const c=r.check;const p=r.prove;const byFile=new Map((p?p.flows:[]).map(f=>[f.file,f]));const ok=c.ok&&r.agent.exitCode===0&&(!p||p.flows.every(f=>f.outcome==='proven'));
 return h('div',{class:'fade',style:'margin-top:16px'},h('div',{class:'row',style:'gap:8px'},h('span',{class:'pill '+(ok?'p-pass':'p-fail')},ok?(p?'proven':'checked'):'needs fixes'),h('span',{class:'small muted'},r.agent.files.length+' flow file(s) from '+r.agent.provider+(r.agent.model?' · '+r.agent.model:'')+(p&&p.rounds?' · '+p.rounds+' repair round'+(p.rounds===1?'':'s'):''))),
  r.agent.files.length?h('div',{style:'margin-top:8px','data-testid':'draft-files'},r.agent.files.map(f=>{const pf=byFile.get(f);const pact=p&&p.actions?p.actions.find(x=>x.file===f):null;const k=pf?PROVE[pf.outcome]:pact?(pact.outcome==='proven'?PROVE.proven:pact.outcome==='unused'?PROVE.not_run:PROVE.failed):null;return h('div',{style:'padding:6px 0;border-bottom:1px solid var(--line)'},h('div',{class:'row',style:'justify-content:space-between'},
   h('span',{class:'row',style:'gap:8px;min-width:0'},k?h('span',{class:'pill '+k[1]},k[0]):null,h('span',{class:'mono small',style:'overflow-wrap:anywhere'},f)),h('button',{class:'btn ghost sm',on:{click:()=>prune(f,false)}},'Prune')),
   pf&&pf.served.length?h('div',{class:'small muted'},'served '+pf.served.join(', ')):null,pf&&pf.detail?h('div',{class:'small c-fail'},pf.detail):null,
   (()=>{const pa=p&&p.actions?p.actions.find(x=>x.file===f):null;return pa?h('div',{class:'small '+(pa.outcome==='proven'?'muted':'c-fail')},'action '+pa.id+(pa.outcome==='proven'?', proven through '+pa.usedBy.join(', '):pa.outcome==='unused'?', not used by any flow yet':', no flow using it passed')):null})())})):null,
  r.catalog?h('p',{class:'small muted','data-testid':'catalog-saved',style:'margin:8px 0 0'},'Catalog updated: '+r.catalog.routes+' routes recorded for the next discovery.'):null,
  c.ok?null:c.issues.map(x=>h('p',{class:'small'},h('span',{class:'c-fail'},x.detail),h('br'),h('span',{class:'muted'},'Fix: '+x.action))),
  r.agent.output?h('details',{style:'margin-top:8px'},h('summary',{class:'small muted'},'What the agent said'),h('pre',{style:'margin-top:8px'},r.agent.output)):null,
  ok&&r.agent.files.length?h('button',{class:'btn',style:'margin-top:12px',disabled:!!ui.running,on:{click:()=>{tab='Run';ui.sel=null;render();runNow('discovered')}}},p?'See them in the grove':'Run the new scenarios'):null)}

/* ---------- History: one case or the whole set ---------- */
function historyCell(run,id,open){
 if(run.bundleVerified===false)return h('td',{},h('button',{class:'cell unavailable c-warn',title:id+' · evidence unavailable','aria-label':'Evidence unavailable for '+id+'. Open run.',on:{click:()=>open(run.name,id)}},'Unavailable'));
 const c=run.cases.find(x=>x.caseId===id);
 return h('td',{},c?h('button',{class:'cell',title:id+' · '+c.outcome+' · '+secs(c.durationMs),on:{click:()=>open(run.name,id)}},h('span',{class:'dot s '+kind(c.outcome)})):h('span',{class:'muted'},'·'));
}
function historyTab(){const runs=state.runs.slice(0,24);if(!runs.length)return[emptyState('Every run leaves a trace.','Run your first scenario. Its result and recorded evidence will be waiting here.',()=>openTab('Run'),'Go to Run')];
 const ids=[...new Set(state.flows.map(f=>f.caseId).concat(runs.flatMap(r=>r.cases.map(c=>c.caseId))))];
 const open=async(name,id)=>{ui.runName=name;ui.run=null;ui.runAt=null;ui.sel=id||null;ui.step=0;tab='Run';await load()};
 const wall=r=>Math.max(0,new Date(r.finishedAt)-new Date(r.startedAt));const walls=runs.map(wall);const max=Math.max(1,...walls);const sorted=[...walls].sort((x,y)=>x-y);
 const holdRate=Math.round(100*runs.filter(r=>r.outcome==='passed').length/runs.length);const cases=runs.flatMap(r=>r.cases);const flaky=ids.filter(id=>new Set(runs.map(r=>{const c=r.cases.find(x=>x.caseId===id);return c?kind(c.outcome):null}).filter(Boolean)).size>1).length;
 const kpi=(b,t)=>h('div',{class:'kpi'},h('b',{},b),h('span',{},t));
 return[h('div',{class:'row',style:'justify-content:space-between;align-items:flex-end;margin-bottom:20px'},h('div',{},h('span',{class:'label'},'History'),h('h1',{style:'margin-top:6px'},runs.length+' run'+(runs.length===1?'':'s')+' of the grove')),
   h('div',{style:'text-align:right'},h('div',{class:'small muted',style:'margin-bottom:6px'},'wall time per run'),h('div',{class:'rings','aria-label':'Wall time per run, oldest to newest',style:'justify-content:flex-end'},[...runs].reverse().map(r=>h('i',{class:kind(r.outcome),title:ago(r.startedAt)+' · '+secs(wall(r)),style:'height:'+Math.max(4,Math.round(40*wall(r)/max))+'px'}))))),
  h('div',{class:'kpis',style:'margin:0 0 20px'},kpi(holdRate+'%','runs that fully held'),kpi(secs(sorted[Math.floor(sorted.length/2)]),'median wall time'),kpi(String(cases.length),'scenario results'),kpi(String(flaky),'scenarios that changed outcome')),
  h('div',{class:'rulehead'},h('span',{class:'label'},'Scenarios across runs'),h('span',{class:'rule'}),h('span',{class:'small muted'},'newest first · click a cell to open it')),
  h('div',{class:'card scroll',style:'padding:8px 12px;display:inline-block;max-width:100%'},h('table',{class:'grid'},h('thead',{},h('tr',{},h('th',{class:'label',style:'text-align:left'},'Scenario'),runs.map(r=>h('th',{},h('button',{class:'cell',title:r.name+' · '+r.outcome,on:{click:()=>open(r.name)}},h('span',{class:'dot '+kind(r.outcome)})),h('div',{class:'mono',style:'font-size:11px;color:var(--muted)'},ago(r.startedAt).replace(' ago','').replace(' min','m').replace(' h','h').replace('just now','now')))))),
   h('tbody',{},ids.map(id=>h('tr',{},h('td',{class:'mono small'},id),runs.map(r=>historyCell(r,id,open)))))))]}

/* ---------- Settings ---------- */
function settingsTab(){const a=state.agent;const s=a.settings;const det=a.detected;let provider=s.provider;
 const model=h('input',{id:'model','aria-label':'Model',value:s.source.model==='default'?'':(s.model||''),placeholder:DEFAULT_MODELS[s.provider]||'No agent selected',style:'flex:1;min-width:200px'});
 const opt=(v,title,note,ok)=>h('button',{'aria-pressed':provider===v?'true':'false',on:{click:e=>{provider=v;model.value='';model.placeholder=DEFAULT_MODELS[v]||'No agent selected';for(const b of e.currentTarget.parentNode.children)b.setAttribute('aria-pressed',b===e.currentTarget?'true':'false')}}},h('b',{style:'font-weight:500'},title),h('span',{class:'small '+(ok?'c-pass':'muted')},note));
 const cfg=state.config;
 return[taskHeading('Settings','Choose who helps write tests, and what your next run checks.'),h('div',{class:'cols'},h('div',{class:'grow',style:'display:flex;flex-direction:column;gap:24px'},h('section',{class:'card'},h('span',{class:'label'},'Test assistant'),h('h2',{style:'margin:6px 0 14px'},'Who helps write and repair tests'),
   h('div',{class:'seg'},opt('claude','Claude Code',det.claude?'installed · '+DEFAULT_MODELS.claude:'not installed',!!det.claude),opt('codex','Codex',det.codex?'installed · '+DEFAULT_MODELS.codex:'not installed',!!det.codex),opt('none','None','discovery and templates only',false)),
   h('div',{class:'row',style:'margin-top:16px'},model,h('button',{class:'btn',on:{click:async()=>{try{state.agent=await api('/api/settings',{agent:{provider,model:model.value}});toast('Saved');render()}catch(e){toast(e.reasons?e.reasons[0].detail:e.error)}}}},'Save')),
   h('p',{class:'small muted',style:'margin-top:12px'},'In effect: ',h('span',{class:'mono'},s.provider+' · '+(s.model||'CLI default')),' (provider from '+s.source.provider+', model from '+s.source.model+').'),
   h('details',{class:'more'},h('summary',{},'Where this is saved'),h('div',{class:'small muted'},h('p',{},'Saved to .tracegrove/settings.json for you alone. agent: in tracegrove.config.yaml sets the team default; --agent and --model on the CLI override both.'),
    (!det.claude||!det.codex)?h('p',{},(!det.claude?'Claude Code: npm i -g @anthropic-ai/claude-code. ':'')+(!det.codex?'Codex: npm i -g @openai/codex.':'')):null))),h('details',{id:'source-options',class:'more task-section'},h('summary',{},'Application files for the next run'),sourceSettings())),
  h('section',{class:'side card'},h('span',{class:'label'},'Project'),cfg?h('table',{class:'kv'},h('tbody',{},
   h('tr',{},h('th',{},'Name'),h('td',{},cfg.project)),h('tr',{},h('th',{},'Adapter'),h('td',{class:'mono small'},cfg.app.adapter+' '+(cfg.app.entry||cfg.app.run||''))),
   h('tr',{},h('th',{},'Health'),h('td',{class:'mono small'},cfg.app.health)),h('tr',{},h('th',{},'Personas'),h('td',{class:'small'},Object.entries(cfg.personas).map(([k,v],i)=>(i?', ':'')+k+' → '+v.subject+(i===0?' (default)':'')).join(''))),
   h('tr',{},h('th',{},'Flows'),h('td',{class:'mono small'},cfg.testDir+'/ · '+state.flows.length+' live, '+(state.pruned||[]).length+' pruned')),
   h('tr',{},h('th',{},'Source digest'),h('td',{class:'mono small'},state.sourceDigest?state.sourceDigest.slice(0,16)+' · '+state.sourceFiles+' files':'–')))):h('p',{class:'muted'},'No config yet. Initialize from the Run tab.'),
   h('p',{class:'small muted mono',style:'overflow-wrap:anywhere'},state.dir)))]}

/* ---------- Heal: diagnose, repair, prove, undo ---------- */
const KIND={setup:['setup','p-warn'],authoring:['authoring','p-warn'],test_drift:['test drift','p-info'],product_bug:['product bug','p-fail'],assertion:['failing','p-fail'],evidence:['evidence','p-warn'],infrastructure:['infrastructure','p-warn']};
const HEAL_TITLE={cancelled:'Heal cancelled',healthy:'Nothing to heal. Every scenario holds.',healed:'Healed. Every fix was proven by a re-run.',partly_healed:'Partly healed. Some findings still need you.',product_bugs:'Found product bugs. The tests stay red on purpose.',needs_human:'Needs you. Nothing was safe to fix automatically.'};
function diffView(text){return h('div',{class:'diff'},text.split('\n').slice(2).map(l=>h('div',{class:l[0]==='+'?'add':l[0]==='-'?'del':'ctx'},l||' ')))}
function healTab(){const r=ui.heal;if(!r&&!ui.healing&&state.runs[0]?.outcome==='passed')return[emptyState('Nothing needs healing.','Your last run passed. If a future check fails, review a proposed repair here before keeping it.',()=>openTab('Run'),'Back to the run',h('button',{class:'btn ghost',on:{click:()=>startHeal(true)}},'Preview checks')),pastHeals()];const a=state.agent.settings;const name=a.provider==='claude'?'Claude Code':a.provider==='codex'?'Codex':null;const installed=name&&state.agent.detected[a.provider];
 const hero=h('section',{style:'margin-bottom:24px'},h('div',{class:'row',style:'justify-content:space-between;align-items:flex-start'},
  h('div',{style:'max-width:760px'},h('span',{class:'label'},'Self-healing'),h('h1',{style:'margin-top:6px'},ui.healing?'Healing the grove':r?HEAL_TITLE[r.outcome]:'Fix what broke, prove it, keep only what holds.'),
   null),
  ui.healing?(ui.activeRunId?h('button',{class:'btn ghost',disabled:ui.cancelling,on:{click:cancelRun}},ui.cancelling?'Waiting for heal to settle':'Cancel heal'):null):h('div',{class:'row'},h('button',{class:'btn ghost',on:{click:()=>startHeal(true)}},'Preview'),h('button',{class:'btn',on:{click:()=>startHeal(false)}},'Heal now'))),
  ui.healing?h('div',{class:'card fade',style:'margin-top:18px'},h('p',{class:'row',style:'margin:0'},h('span',{class:'think'},h('i'),h('i'),h('i')),h('span',{id:'heal-phase',role:'status','aria-live':'polite'},ui.live&&ui.live.heal.status==='running'?ui.live.heal.phase+(ui.live.heal.detail?' · '+ui.live.heal.detail:''):'Starting')),
   h('div',{class:'log',id:'agent-log','aria-label':'What the agent is doing'},(ui.live&&ui.live.agent.task==='heal'&&ui.live.agent.lines.length?ui.live.agent.lines:['The agent joins only if a check fails after setup is sound']).map(x=>h('div',{},x)))):null,
  r||ui.healing?null:h('div',{class:'stages'},[['1','Diagnose','Setup mistakes are fixed in the config.'],['2','Judge',(installed?name:'The agent')+' calls each failing check test drift or a product bug.'],['3','Prove','Drift is repaired and re-run. Bugs stay red and are reported.']].map(([n,t,d])=>h('div',{class:'stage'},h('span',{class:'n'},n),h('div',{},h('b',{},t),h('span',{class:'small muted'},d))))),
  r||ui.healing?null:h('details',{class:'more'},h('summary',{},'How heal decides'),h('div',{class:'small muted'},h('p',{},'Failing checks go to '+(installed?name+' ('+(a.model||'default')+')':'the agent')+', which must call each one test drift or a product bug. Inspect the saved diff: agent judgments do not prove intended product behavior. Undo skips files changed afterward.'))),
  !installed&&!ui.healing?h('p',{class:'small muted'},'No agent available: setup fixes still run. ',h('button',{class:'btn ghost sm',on:{click:()=>{tab='Settings';render()}}},'Choose an agent')):null,
  ui.healError?h('div',{style:'margin-top:16px'},blocked(ui.healError)):null);
 const last=state.runs[0];
 if(!r&&!ui.healing&&last)return[hero,h('div',{class:'empty',style:'margin-top:20px'},seed(),h('div',{},h('b',{style:'font-weight:500;color:var(--ink)'},last.outcome==='passed'?'The last run passed. Nothing to heal right now.':(last.totals.failed+last.totals.other)+' scenario'+((last.totals.failed+last.totals.other)===1?'':'s')+' did not hold on the last run.'),h('div',{class:'small'},last.outcome==='passed'?'Preview checks the grove anyway and changes nothing.':'Heal now repairs drift and proves each fix by re-running.'))),pastHeals()];
 if(!r||ui.healing)return[hero,pastHeals()];
 const kept=r.changes.filter(c=>c.status==='kept');const other=r.changes.filter(c=>c.status!=='kept');const b=r.before.totals,af=r.after.totals;
 const findings=h('section',{class:'grow'},h('div',{class:'rulehead'},h('span',{class:'label'},'Findings'),h('span',{class:'rule'}),h('span',{class:'small muted'},r.findings.length+' · '+r.id)),
  r.findings.length?h('div',{style:'display:flex;flex-direction:column;gap:8px'},r.findings.map(f=>{const k=KIND[f.kind]||[f.kind,'p-none'];return h('div',{class:'finding fade'},
   h('div',{class:'row',style:'gap:8px'},h('span',{class:'pill '+(f.status==='fixed'?'p-pass':k[1])},f.status==='fixed'?'fixed':k[0]),h('span',{class:'mono small'},f.caseId||f.file||'project'),f.step?h('span',{class:'small muted'},'· '+f.step):null),
   h('span',{},f.detail.split('\n')[0]),h('span',{class:'small muted'},f.status==='fixed'?'Fixed and verified.':f.fix),
   f.caseId?h('div',{class:'row'},h('button',{class:'btn ghost sm',on:{click:()=>{showScenario(f.caseId)}}},'Open scenario')):null)})):h('p',{class:'muted'},'Nothing to fix.'));
 const changes=h('div',{class:'side'},h('section',{class:'card'},h('div',{class:'rulehead'},h('h2',{},'Kept changes'),h('span',{class:'rule'}),kept.length?h('button',{class:'btn ghost sm',on:{click:()=>undoHeal(r.id)}},'Undo all'):null),
   kept.length?kept.map(c=>h('div',{style:'margin-top:10px'},h('div',{class:'row',style:'gap:8px'},h('span',{class:'pill p-pass'},c.by),h('span',{class:'mono small',style:'overflow-wrap:anywhere'},c.file)),h('div',{class:'small muted',style:'margin-top:4px'},c.reason+(c.note?' · '+c.note:'')),diffView(c.diff))):h('p',{class:'muted small'},'No file was changed.'),
   b&&af?h('p',{class:'small muted',style:'margin-top:14px'},'Before: '+b.passed+' passed, '+b.failed+' failed, '+b.other+' other. After: '+af.passed+' passed, '+af.failed+' failed, '+af.other+' other.'):null),
  other.length?h('details',{class:'card'},h('summary',{class:'small'},other.length+' tried and not kept'),other.map(c=>h('div',{style:'margin-top:10px'},h('div',{class:'row',style:'gap:8px'},h('span',{class:'pill p-none'},c.status),h('span',{class:'mono small'},c.file)),h('div',{class:'small muted'},c.note||c.reason),diffView(c.diff)))):null,
  r.agent?h('details',{class:'card'},h('summary',{class:'small'},'What '+r.agent.provider+(r.agent.model?' ('+r.agent.model+')':'')+' concluded'),r.agent.verdicts.map(v=>h('p',{class:'small'},h('b',{class:'mono',style:'font-weight:500'},v.caseId),': '+v.verdict.replace('_',' ')+'. '+v.reason)),r.agent.summary?h('pre',{style:'margin-top:8px'},r.agent.summary):null):null,
  r.next.length?h('section',{class:'card'},h('span',{class:'label'},'Next'),r.next.map(n=>h('div',{style:'margin-top:8px'},h('code',{class:'small'},n.command),h('div',{class:'small muted'},n.why)))):null);
 return[hero,h('div',{class:'cols'},findings,changes),pastHeals()]}
function pastHeals(){const list=ui.heals.filter(x=>!ui.heal||x.id!==ui.heal.id);if(!list.length)return null;
 return h('section',{style:'margin-top:28px'},h('div',{class:'rulehead'},h('span',{class:'label'},'Earlier heals'),h('span',{class:'rule'})),
  list.slice(0,8).map(x=>h('div',{class:'route'},h('span',{class:'dot s '+(x.outcome==='healed'||x.outcome==='healthy'?'pass':x.outcome==='product_bugs'?'fail':'warn')}),h('span',{},HEAL_TITLE[x.outcome]),h('span',{class:'where mono small muted'},x.id),h('button',{class:'btn ghost sm',on:{click:()=>{ui.heal=x;render()}}},'Open'))))}
async function startHeal(dryRun){if(ui.healing||ui.running)return;tab='Heal';ui.healing=true;ui.healError=null;ui.running='Healing';ui.live=null;render();watchRun();
 try{ui.heal=await api('/api/heal',{dryRun});const kept=ui.heal.changes.filter(c=>c.status==='kept').length;
  const bugs=ui.heal.findings.filter(f=>f.kind==='product_bug').length;
  toast(dryRun?'Preview ready: nothing was changed':(kept?kept+' verified fix'+(kept===1?'':'es')+' kept':'No file changed')+(bugs?'; '+bugs+' product bug'+(bugs===1?'':'s')+' reported':''),kept&&!dryRun?{label:'Undo',run:()=>undoHeal(ui.heal.id)}:null)}
 catch(e){ui.healError=e}finally{ui.healing=false;ui.running=false;stopRunWatch()}ui.runName=null;ui.run=null;await load()}
async function undoHeal(id){try{const r=await api('/api/heal/undo',{id});toast(r.restored.length?'Restored '+r.restored.join(', '):r.skipped.length?r.skipped[0].file+': '+r.skipped[0].why:'Nothing to restore');ui.runName=null;ui.run=null;await load()}catch(e){toast(e.reasons?e.reasons[0].detail:e.error||'Could not undo')}}

/* ---------- Command palette and keyboard ---------- */
function commands(){const list=[];const add=(grp,label,run,hint)=>list.push({grp,label,run,hint:hint||''});
 add('Run','Run all scenarios',()=>{tab='Run';render();runNow('')},'R');
 if(ui.sel)add('Run','Rerun '+ui.sel,()=>{tab='Run';render();runNow(ui.sel)},'r');
 add('Heal','Heal now',()=>startHeal(false),'h');add('Heal','Preview a heal (changes nothing)',()=>startHeal(true));
 if(ui.heal&&ui.heal.changes.some(c=>c.status==='kept'))add('Heal','Undo heal '+ui.heal.id,()=>undoHeal(ui.heal.id));
 if(state&&state.agent.settings.provider!=='none')add('Agent','Draft flows for uncovered routes',()=>{tab='Discover';render();agentDraft()});
 for(const t of TABS)add('Go','Open '+t,()=>openTab(t),String(TABS.indexOf(t)+1));
 for(const f of (state?state.flows:[]))add('Scenario',f.caseId,()=>{showScenario(f.caseId)},f.title);
 if(state&&state.git.isRepo)for(const b of state.git.branches)add('Branch','Discover on '+b,()=>{tab='Discover';ui.source=b;render();scan()});
 for(const f of (state?state.flows:[]))add('Prune','Prune '+f.caseId,()=>prune(f.file,false));
 add('Help','Keyboard shortcuts',shortcuts,'?');return list}
function fuzzy(q,text){q=q.toLowerCase();text=text.toLowerCase();if(!q)return 1;if(text.includes(q))return 3-text.indexOf(q)/1000;let i=0;for(const ch of text)if(ch===q[i])i++;return i===q.length?1:0}
let palette=null;let paletteReturn=null;
function closeOverlay(){if(palette){palette.remove();palette=null;if(paletteReturn?.isConnected)paletteReturn.focus();else document.getElementById('palbtn').focus()}}
function openPalette(){closeOverlay();paletteReturn=document.activeElement;const all=commands();let sel=0;let shown=all;
 const input=h('input',{type:'text',placeholder:'Type a command, a scenario or a branch','aria-label':'Command',role:'combobox','aria-expanded':'true','aria-controls':'pal-list',autocomplete:'off'});
 const list=h('ul',{id:'pal-list',role:'listbox'});
 const draw=()=>{list.replaceChildren(...shown.slice(0,60).map((c,i)=>h('li',{role:'option','aria-selected':i===sel?'true':'false',on:{mousemove:()=>{if(sel!==i){sel=i;draw()}},click:()=>pick(i)}},h('span',{class:'grp'},c.grp),h('span',{},c.label),c.hint?h('span',{class:'hint'},c.hint):null)));const on=list.children[sel];if(!shown.length)list.append(h('li',{class:'no-results',role:'status'},'No matching command. Try a page or scenario name.'));if(on)on.scrollIntoView({block:'nearest'})};
 const pick=i=>{const c=shown[i];if(!c)return;closeOverlay();c.run()};
 input.addEventListener('input',()=>{const q=input.value.trim();shown=all.map(c=>({c,s:Math.max(fuzzy(q,c.label),fuzzy(q,c.grp+' '+c.label)*.9)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).map(x=>x.c);sel=0;draw()});
 input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(sel+1,shown.length-1);draw()}else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(sel-1,0);draw()}else if(e.key==='Enter'){e.preventDefault();pick(sel)}else if(e.key==='Escape'){e.preventDefault();closeOverlay()}});
 palette=h('div',{class:'pal-back',on:{click:e=>{if(e.target===palette)closeOverlay()}}},h('div',{class:'pal fade',role:'dialog','aria-modal':'true','aria-label':'Command palette'},input,list,
  h('div',{class:'foot'},h('span',{},h('kbd',{},'↑↓'),' move'),h('span',{},h('kbd',{},'↵'),' run'),h('span',{},h('kbd',{},'esc'),' close'),h('span',{},h('kbd',{},'?'),' shortcuts'),h('button',{class:'btn ghost sm',on:{click:closeOverlay}},'Close'))));
 document.body.append(palette);draw();input.focus()}
function shortcuts(){closeOverlay();paletteReturn=document.activeElement;const keys=[['⌘K / Ctrl K','command palette'],['j / k','next / previous scenario'],['r','rerun the selected scenario'],['R','run all'],['h','heal'],['1–9','switch tab'],['?','this list'],['esc','close']];
 palette=h('div',{class:'pal-back',on:{click:e=>{if(e.target===palette)closeOverlay()}}},h('div',{class:'pal fade card',role:'dialog','aria-modal':'true','aria-label':'Keyboard shortcuts',style:'padding:20px'},h('h2',{},'Keyboard'),
  h('div',{class:'keys'},keys.flatMap(([k,v])=>[h('kbd',{},k),h('span',{class:'small'},v)])),h('button',{class:'btn ghost sm',style:'margin-top:20px',on:{click:closeOverlay}},'Close shortcuts')));document.body.append(palette);palette.querySelector('button').focus()}
function moveSel(d){if(tab==='Map'){mapMove(d);return}if(tab==='Imports'){moveNative(d);return}if(tab!=='Run'||!state)return;const sc=scenarios();if(!sc.length)return;const i=sc.findIndex(s=>s.id===ui.sel);const n=sc[Math.max(0,Math.min(sc.length-1,(i<0?0:i+d)))];ui.sel=n.id;ui.step=Math.max(0,n.steps.findIndex(x=>x.result==='fail'));render();
 const el=document.querySelector('[data-case="'+CSS.escape(n.id)+'"]');if(el){el.focus({preventScroll:true});el.scrollIntoView({block:'nearest'})}}
document.addEventListener('keydown',e=>{if(palette&&e.key==='Tab'){const focusable=[...palette.querySelectorAll('input,button,[tabindex="0"]')];if(focusable.length){e.preventDefault();const index=focusable.indexOf(document.activeElement);focusable[(index+(e.shiftKey?-1:1)+focusable.length)%focusable.length].focus()}return}const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement&&document.activeElement.tagName||'');
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();palette?closeOverlay():openPalette();return}
 if(e.key==='Escape'&&palette){closeOverlay();return}
 if(typing||palette||e.metaKey||e.ctrlKey||e.altKey)return;
 if(e.key==='/'){e.preventDefault();openPalette()}else if(e.key==='?'){shortcuts()}else if(e.key==='j'){moveSel(1)}else if(e.key==='k'){moveSel(-1)}
 else if(!['Imports','Map','Benchmark'].includes(tab)&&e.key==='r'&&ui.sel&&!ui.running){tab='Run';runNow(ui.sel)}else if(!['Imports','Map','Benchmark'].includes(tab)&&e.key==='R'&&!ui.running){tab='Run';runNow('')}else if(!['Imports','Map','Benchmark'].includes(tab)&&e.key==='h'&&!ui.running){startHeal(false)}
 else if(/^[1-9]$/.test(e.key)&&Number(e.key)<=TABS.length){openTab(TABS[Number(e.key)-1])}});
document.getElementById('palbtn').addEventListener('click',openPalette);


function envBadge(e){if(!e||(e.name==='local'&&e.class==='isolated_candidate'))return null;const deployed=e.class!=='isolated_candidate';
 return h('span',{class:'pill '+(e.class==='production_observation'?'p-fail':deployed?'p-warn':'p-info'),style:'margin-left:8px','aria-label':'Environment'},(deployed?e.name.toUpperCase():e.name)+' · '+e.class.replace(/_/g,' ')+(e.writes==='none'?' · read-only':''))}
function envSwitch(){const list=ui.envs&&ui.envs.environments||[];if(list.length<2)return null;
 return h('label',{class:'row small muted',style:'gap:6px'},'Environment',h('select',{'aria-label':'Environment to run in',on:{change:e=>{ui.env=e.target.value;try{localStorage.setItem('tracegrove.env',ui.env)}catch{}render()}}},
  list.map(e=>h('option',{value:e.name,selected:e.name===ui.env},e.name+(e.class!=='isolated_candidate'?' · '+e.class.replace(/_/g,' '):'')))))}
async function doctorEnv(name){ui.doctoring=name;render();try{const r=await api('/api/env-doctor',{env:name});ui.envs.doctor[name]=r;toast(name+': '+r.status)}catch(e){toast(e.reasons?e.reasons[0].detail:e.error||'Doctor failed')}ui.doctoring=null;render()}
function envTab(){const list=ui.envs&&ui.envs.environments||[];
 if(!list.length)return[emptyState('Start close to home.','Set up your local app first. You can add staging environments after your first test runs.',()=>openTab('Run'),'Set up your app')];
 return[h('section',{style:'margin-bottom:20px'},h('span',{class:'label'},'Environments'),h('h1',{style:'margin-top:6px'},'Where your tests run.'),
  h('p',{class:'small muted'},'Secrets are shown as references only. Deployed environments keep agents behind a person’s approval; production observation is read-only.')),
  ...list.map(e=>{const d=ui.envs.doctor[e.name];const checks=d&&d.checks||[];
   return h('div',{class:'card fade',style:'margin-bottom:12px'},
    h('div',{class:'row',style:'justify-content:space-between'},h('div',{class:'row',style:'gap:8px'},h('h2',{class:'mono',style:'margin:0'},e.name),envBadge({name:e.name,class:e.class,writes:e.writes})||h('span',{class:'pill p-info'},e.class.replace(/_/g,' ')),
      d?h('span',{class:'pill '+(d.status==='ready'?'p-pass':'p-fail')},'setup: '+d.status):h('span',{class:'pill p-none'},'not checked')),
     h('div',{class:'row'},h('button',{class:'btn ghost sm',disabled:ui.doctoring!==null,on:{click:()=>doctorEnv(e.name)}},ui.doctoring===e.name?'Checking…':'Check setup'),
      h('button',{class:'btn sm',disabled:!!ui.running,on:{click:()=>{ui.env=e.name;try{localStorage.setItem('tracegrove.env',e.name)}catch{}tab='Run';render();runNow('')}}},'Run here'))),
    h('table',{class:'kv',style:'margin-top:8px'},h('tbody',{},
     h('tr',{},h('th',{},'Target'),h('td',{class:'mono small'},e.target)),h('tr',{},h('th',{},'Writes'),h('td',{},e.writes==='owned_namespace'?'Test-owned data only':e.writes==='none'?'Read only':e.writes.replaceAll('_',' '))),h('tr',{},h('th',{},'Agents'),h('td',{},e.agents==='allow'?'Allowed':e.agents==='ask'?'Ask before running':e.agents.replaceAll('_',' '))),
     ...e.personas.map(p=>h('tr',{},h('th',{},'as '+p.persona),h('td',{class:'mono small'},p.ref+' · '+p.auth+(p.subject?' · expects '+p.subject:'')))))),
    checks.filter(c=>c.state!=='pass').length?h('ul',{class:'small',style:'margin:8px 0 0;padding-left:18px'},checks.filter(c=>c.state!=='pass').map(c=>h('li',{},h('span',{class:c.required?'c-fail':'c-warn'},c.check+': '),c.detail,c.fix?h('div',{class:'mono muted'},'run: '+c.fix):null))):null)})]}
function transcript(t,method){const lines=t.split(String.fromCharCode(10));return h('div',{class:'tx'},lines.map(l=>l.startsWith('caller: ')?h('div',{class:'tx-c'},h('span',{class:'who'},method==='VOICE'?'Caller':'Customer'),l.slice(8)):l.startsWith('agent: ')?h('div',{class:'tx-a'},h('span',{class:'who'},'Agent'),l.slice(7)):h('div',{class:'tx-t mono small'},l.trim())))}

function render(){header();if(!state)return;syncPageLocation();const changing=renderedTab!==tab;renderedTab=tab;document.getElementById('main').classList.toggle('page-enter',changing);syncComparisonLocation();syncNativeLocation();syncMapLocation();syncBenchmarkLocation();const views={Run:runTab,Readiness:readinessTab,Discover:discoverTab,Heal:healTab,History:historyTab,Environments:envTab,Compare:comparisonTab,Imports:nativeImportsTab,Map:workflowMapTab,Benchmark:benchmarkTab,Settings:settingsTab};page(views[tab]());gwSyncHash();if(tab==='Discover'&&!ui.disc&&!ui.scanning&&!ui.scanError)scan()}
load().catch(e=>page(blocked(e)));
</script></body></html>`;
