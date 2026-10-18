/** Grove source controls share the existing DOM helpers; no HTML interpolation of local paths. */
export const SOURCE_CONTROLS_JS = String.raw`
function sourceDescription(binding){
 if(!binding)return 'Input could not be established.';
 if(binding.kind==='working_tree')return 'Working tree · file hashes captured for each run';
 return 'Local snapshot · commit '+binding.commit+' · '+binding.files+' files · '+binding.bytes+' bytes · '+binding.ref.digest.hex;
}
function sourceBanner(){const source=state.verificationSource;
 return h('section',{class:'card',style:'margin-bottom:20px;overflow-wrap:anywhere','aria-label':'Verification input'},
  h('div',{class:'row'},h('b',{},'Next run input'),h('span',{class:'small muted'},source.status==='blocked'?'Blocked — review selection':sourceDescription(source.binding)),
   h('button',{class:'btn ghost',on:{click:()=>{tab='Settings';render()}}},'Change input')),
  ui.run?h('p',{class:'small muted'},'Recorded run request: '+(ui.run.sourceChecked?sourceDescription(ui.run.sourceBinding):'Unavailable — saved evidence could not establish the input.')):null);
}
function sourceSettings(){
 const source=state.verificationSource;let candidate=null;let busy=false;
 const status=h('div',{id:'source-status',role:'status','aria-live':'polite',tabindex:'-1',style:'overflow-wrap:anywhere'});
 const path=h('input',{id:'snapshot-path',value:source.selection.kind==='snapshot'?source.selection.path:'',placeholder:'Path to snapshot.json',style:'width:100%;min-width:0'});
 const apply=h('button',{class:'btn',disabled:true,on:{click:()=>save(candidate.selection)}},'Use this snapshot');
 const check=h('button',{class:'btn ghost',on:{click:async()=>{
  if(busy)return;busy=true;candidate=null;apply.disabled=true;check.disabled=true;path.disabled=true;working.disabled=true;status.textContent='Checking snapshot bytes…';
  try{candidate=await api('/api/source/preview',{path:path.value});status.textContent=sourceDescription(candidate.binding);apply.disabled=false}
  catch(e){status.replaceChildren(blocked(e))}finally{busy=false;check.disabled=false;path.disabled=false;working.disabled=false;status.focus()}
 }}},'Check snapshot');
 path.addEventListener('input',()=>{candidate=null;apply.disabled=true;status.textContent='Check this path before selecting it.'});
 const working=h('button',{class:'btn ghost',on:{click:()=>save({kind:'working_tree'})}},'Use working tree');
 async function save(selection){if(busy||!selection)return;busy=true;apply.disabled=true;check.disabled=true;working.disabled=true;path.disabled=true;
  try{await api('/api/source',{source:selection});await load();const next=document.getElementById('source-status');if(next){next.textContent='Verification input saved.';next.focus()}toast('Verification input saved')}
  catch(e){status.replaceChildren(blocked(e));status.focus()}
  finally{busy=false;check.disabled=false;working.disabled=false;path.disabled=false;candidate=null;apply.disabled=true}
 }
 return h('section',{class:'card',style:'margin-bottom:24px;overflow-wrap:anywhere'},h('span',{class:'label'},'Verification input'),
  h('h2',{style:'margin:6px 0'},'Choose what the next run launches'),
  h('p',{class:'small muted'},sourceDescription(source.binding)),source.error?blocked(source.error):null,
  h('p',{class:'small muted'},'Keep one set of scenarios here. Select application files from your working tree or a materialized snapshot. This local preference leaves the team config unchanged.'),
  h('label',{for:'snapshot-path'},'Snapshot manifest'),path,
  h('div',{class:'row',style:'margin-top:12px'},check,apply,working),status,
  h('p',{class:'small muted'},'Checking launches nothing. Saving pins the exact manifest; changed bytes block the next run. These are local content checks, not remote or deployed revision attestations. Dependencies and environment remain external.'),
  h('p',{class:'small muted'},'The Discover branch selector only scans routes; it does not change verification input.'));
}
`;
