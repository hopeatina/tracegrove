/** Read-only native evidence inspection, separate from Tracegrove execution authority. */
export const NATIVE_IMPORTS_JS = String.raw`
ui.native={entries:[],name:'',report:null,error:null,loading:false,loaded:false,serial:0,filter:'',limit:50,selected:null,file:null,format:'playwright_json'};
const nativeQuery=new URLSearchParams(location.search).get('native-import');
if(nativeQuery&&nativeQuery.length<=200){ui.native.name=nativeQuery;tab='Imports'}
function syncNativeLocation(){const url=new URL(location.href);if(tab==='Imports'&&ui.native.name)url.searchParams.set('native-import',ui.native.name);else url.searchParams.delete('native-import');if(url.href!==location.href)history.replaceState(null,'',url.href)}
function paintNative(){if(tab==='Imports')render()}
function clearNative(){const n=ui.native;n.serial++;n.report=null;n.error=null;n.loading=false;n.selected=null;n.limit=50}
async function loadNative(name){clearNative();const n=ui.native;n.name=name;const serial=n.serial;n.loading=true;paintNative();
 try{const listing=await api('/api/imports');if(serial!==n.serial)return;n.entries=listing.entries;n.loaded=true;
 if(name){const result=await api('/api/imports/'+encodeURIComponent(name));if(serial!==n.serial)return;n.report=result.report;n.selected=result.report.observations[0]?.id||null}}
 catch(e){if(serial===n.serial){n.report=null;n.error=e.error||'Imported evidence could not be opened. Retry when connected.'}}
 finally{if(serial===n.serial){n.loading=false;paintNative()}}}
async function uploadNative(){const n=ui.native,file=n.file;if(!file)return;clearNative();const serial=n.serial;n.loading=true;paintNative();
 try{if(file.size>8*1024*1024)throw{error:'Native report uploads are limited to 8 MiB.'};
 const response=await fetch('/api/imports?format='+n.format,{method:'POST',headers:{'content-type':'application/octet-stream','x-tracegrove-token':TOKEN},body:file});const result=await response.json();if(!response.ok)throw result;
 if(serial!==n.serial)return;n.file=null;await loadNative(result.name)}catch(e){if(serial===n.serial){n.error=e.error||'Import could not complete. Retry the same report after reconnecting.';n.loading=false;paintNative()}}}
async function downloadNative(suffix){const n=ui.native,serial=n.serial,digest=n.report?.ref.digest.hex;if(!digest)return;
 try{const response=await fetch('/api/imports/'+encodeURIComponent(n.name)+'/'+suffix);if(!response.ok)throw Error();const bytes=await response.blob();if(serial!==n.serial)return;
 if(response.headers.get('x-tracegrove-import-digest')!==digest)throw Error();
 const url=URL.createObjectURL(bytes),a=h('a',{href:url,download:suffix==='source'?'native-report.'+(n.report.format==='junit_xml'?'xml':'json'):'native-attachment.bin'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch{if(serial===n.serial){clearNative();n.error='Imported evidence changed or could not be read. Reopen it to inspect fresh bytes.';paintNative()}}}
function nativeRows(){const n=ui.native;return(n.report?.observations||[]).filter(o=>[o.title,o.kind,o.outcome,o.project||'',...o.suite].join(' ').toLowerCase().includes(n.filter.toLowerCase()))}
function moveNative(d){const rows=nativeRows(),n=ui.native;if(!rows.length)return;const i=rows.findIndex(o=>o.id===n.selected),next=rows[Math.max(0,Math.min(rows.length-1,i+d))];n.selected=next.id;n.limit=Math.max(n.limit,rows.indexOf(next)+1);paintNative();document.querySelector('[data-native-id="'+next.id+'"]')?.focus()}
function nativeDetail(o){const n=ui.native;if(!o)return h('p',{class:'muted'},'Select an observation.');
 return h('aside',{class:'side','aria-label':'Native observation detail',style:'overflow-wrap:anywhere'},h('h2',{},o.title),
 h('p',{},o.kind+' · '+o.outcome),h('p',{class:'small muted'},'Expected: '+(o.expectedOutcome||'unavailable')+' · Producer classification: '+(o.producerClassification||'unavailable')),
 h('p',{class:'small'},'Retry: '+(o.retry??'unavailable')+' · Duration: '+(o.durationMs===null?'unavailable':secs(o.durationMs))),
 o.source?h('p',{class:'mono small'},o.source.file+(o.source.line===null?'':':'+o.source.line)):null,
 h('p',{class:'mono small'},o.pointer),h('p',{class:'small muted'},o.errorRefs.length+' error references · '+o.detailRefs.length+' detail references. Download the native report for full producer details.'),
 h('details',{},h('summary',{},'Content references'),h('pre',{},JSON.stringify({errors:o.errorRefs,details:o.detailRefs},null,2))),
 h('h2',{},'Attachments'),n.report.attachments.filter(a=>a.observationId===o.id).map(a=>h('div',{},h('div',{},a.name+' · '+a.state),h('p',{class:'mono small muted'},a.mediaType),a.state==='captured'?h('button',{class:'btn ghost sm',on:{click:()=>downloadNative('artifact/'+a.digest.hex)}},'Download '+a.name):null)))}
function nativeImportsTab(){const n=ui.native;if(!n.loaded&&!n.loading&&!n.error)queueMicrotask(()=>loadNative(n.name));const rows=nativeRows(),report=n.report;
 return[h('section',{},taskHeading('Bring your tests with you.','Open a Playwright or JUnit report to explore its results without running the tests again.'),
 h('div',{class:'row'},h('select',{'aria-label':'Report format',on:{change:e=>{n.format=e.target.value}}},['playwright_json','junit_xml'].map(v=>h('option',{value:v,selected:n.format===v},v==='playwright_json'?'Playwright · JSON':'JUnit · XML'))),
 h('input',{type:'file','aria-label':'Report file',style:'padding:8px;width:300px',on:{change:e=>{n.file=e.target.files[0]||null;paintNative()}}}),h('button',{class:'btn',disabled:!n.file||n.loading,on:{click:uploadNative}},n.loading?'Reading evidence…':'Import report')),
 n.file?h('p',{class:'small'},'Selected: '+n.file.name):null,disclosure('What an import includes',h('p',{class:'small muted'},'Results keep the original tool’s meaning. An imported pass does not verify a Tracegrove scenario. Inline attachments are captured; use the CLI to retain local media.'),h('pre',{},'tracegrove import-observations --artifact-root <folder> --into <project>')),
 n.entries.length?h('div',{class:'row'},h('select',{'aria-label':'Retained import',style:'max-width:100%;width:100%',disabled:n.loading,on:{change:e=>loadNative(e.target.value)}},h('option',{value:'',selected:!n.name},'Choose a retained import'),n.entries.map(e=>h('option',{value:e.name,selected:e.name===n.name},e.name+' · stored '+ago(e.storedAt)))),h('button',{class:'btn ghost',disabled:n.loading,on:{click:()=>loadNative(n.name)}},'Refresh imports')):null,
 n.loading?h('p',{role:'status'},'Reading imported evidence…'):null,n.error?h('div',{role:'alert'},h('p',{},n.error),h('button',{class:'btn ghost',on:{click:()=>loadNative(n.name)}},'Retry import inspection')):null,
 !n.loading&&!n.error&&!n.entries.length?h('p',{class:'small muted'},'Choose a report above. Your imported results will stay here for later.'):null),
 report?h('section',{},h('p',{class:'pill p-warn'},'Producer not authenticated · qualification not evaluated'),h('p',{class:'small'},(report.producer.name||'Producer unavailable')+' · '+(report.producer.version||'version unavailable')+' · '+report.producer.basis),
 h('p',{class:'small muted'},report.observations.length+' observations · '+report.attachments.length+' attachment references · '+report.globalErrorRefs.length+' global error references'),report.warnings.length?h('p',{class:'small'},'Report caveats: '+report.warnings.join(', ')):null,
 h('button',{class:'btn ghost sm',on:{click:()=>downloadNative('source')}},'Download native report'),
 h('p',{},h('input',{'aria-label':'Filter observations',placeholder:'Filter title, kind or outcome',value:n.filter,on:{input:e=>{n.filter=e.target.value;n.limit=50;const start=e.target.selectionStart;paintNative();const input=document.querySelector('[aria-label="Filter observations"]');input.focus();input.setSelectionRange(start,start)}}})),
 h('p',{class:'small muted'},rows.length+' matching observations'),h('div',{class:'cols',style:'margin-top:24px'},h('section',{'aria-label':'Imported observations',class:'grow'},rows.slice(0,n.limit).map(o=>h('button',{class:'node',style:'width:100%;overflow-wrap:anywhere','data-native-id':o.id,'aria-pressed':String(o.id===n.selected),on:{click:()=>{n.selected=o.id;paintNative()}}},h('span',{class:'body'},h('span',{},o.title),h('span',{class:'small muted'},o.kind+' · '+o.outcome+' · retry '+(o.retry??'unavailable'))))),rows.length>n.limit?h('button',{class:'btn ghost',on:{click:()=>{n.limit+=50;paintNative()}}},'Show 50 more'):null),nativeDetail(report.observations.find(o=>o.id===n.selected)))):null]}
`;
