/** Review states retain execution, evidence, freshness and human sign-off as separate facts. */
export const READINESS_JS = String.raw`
async function loadReadiness(redraw=true){
 if(ui.readyLoading){ui.readyDirty=true;return ui.readyRequest}
 ui.readyLoading=true;ui.readyError=null;if(redraw&&ui.ready&&tab==='Readiness')render();
 ui.readyRequest=(async()=>{do{ui.readyDirty=false;try{ui.ready=await api('/api/readiness');ui.readyError=null}catch(e){ui.readyError=e;if(!ui.ready||ui.ready.error)ui.ready={error:e}}}while(ui.readyDirty);ui.readyLoading=false;if(redraw&&(tab==='Readiness'||tab==='Run'))render()})();
 return ui.readyRequest;
}
function reviewStage(c){if(c.decision==='waived')return 'waived';if(c.ready)return 'ready';if(c.decision==='challenged')return 'disputed';if(c.validity!=='current'||c.execution==='not_run')return 'rerun';if(c.assessment==='contradicted'||c.decision==='rejected')return 'fix';if(c.execution==='blocked'||c.execution==='interrupted')return 'incomplete';return c.decision==='pending'&&c.assessment==='supported'?'sign-off':'incomplete'}
function signoffCount(){return ui.ready&&!ui.ready.error?ui.ready.claims.filter(c=>reviewStage(c)==='sign-off').length:0}
const REVIEW_LABEL={waived:'Waived',ready:'Ready',disputed:'Check disputed',rerun:'Needs a run',fix:'Needs attention',incomplete:'Evidence incomplete','sign-off':'Needs sign-off'};
const REVIEW_QUESTION={waived:'Why is it OK to hand this off without current evidence?',rejected:'What is wrong with the behavior?',challenged:'What is wrong with this check?'};
const REVIEW_EFFECT={waived:'Marks this ready without current evidence.',rejected:'Records your objection and keeps this open.',challenged:'The check is not changed; this stays open.'};
function startReview(c,decision){ui.reviewDrafts=ui.reviewDrafts||new Map();const old=ui.reviewDraft;if(old)ui.reviewDrafts.set(old.caseId+':'+old.decision,old.reason);ui.reviewDraft={caseId:c.caseId,decision,reason:ui.reviewDrafts.get(c.caseId+':'+decision)||(old?.caseId===c.caseId?old.reason:'')};ui.reviewError=null;render();document.getElementById('review-reason')?.focus()}
function cancelReview(){const draft=ui.reviewDraft;ui.reviewDraft=null;ui.reviewError=null;render();document.querySelector('[data-review-action="'+draft.decision+'-'+CSS.escape(draft.caseId)+'"]')?.focus()}
async function decideClaim(c,decision,reason=''){
 if(ui.readyDecision||decision!=='accepted'&&!reason.trim())return;if(ui.readyLoading){ui.reviewWaiting=c.caseId;render();await ui.readyRequest;ui.reviewWaiting=null;if(ui.readyDecision)return}
 ui.readyNotice=null;ui.reviewError=null;ui.readyDecision=c.caseId;render();let saved=false;
 try{const r=await api('/api/decide',{case:c.caseId,decision,reason});ui.readyNotice={caseId:c.caseId,text:'Recorded: '+r.decision.replace(/_/g,' ')+' · '+c.title};if(ui.reviewDraft?.caseId===c.caseId)ui.reviewDraft=null;for(const key of ui.reviewDrafts?.keys()||[])if(key.startsWith(c.caseId+':'))ui.reviewDrafts.delete(key);saved=true}
 catch(e){ui.reviewError={caseId:c.caseId,text:e.reasons?e.reasons[0].detail:e.error||'Review could not be recorded.'}}
 finally{ui.readyDecision=null}
 if(saved)await loadReadiness();else render();
 const focus=document.querySelector(saved?'.review-receipt':'[data-review-error]');focus?.focus({preventScroll:true});
}
function evidenceSummary(c){const result=c.execution==='not_run'?'Not run':c.execution==='blocked'?'Run blocked':c.execution==='interrupted'?'Run interrupted':c.assessment==='supported'?'Checks passed':c.assessment==='contradicted'?'Checks failed':'Evidence incomplete';const freshness=c.validity==='current'?'evidence current':c.validity==='stale'?'out of date since the app changed':c.validity==='superseded'?'out of date since the check changed':'freshness not established';return result+(c.ranAt?' · ran '+ago(c.ranAt):'')+' · '+freshness}
function reviewForm(c){const draft=ui.reviewDraft;if(!draft||draft.caseId!==c.caseId)return null;const busy=!!ui.readyDecision||!!ui.readyLoading;
 return h('form',{class:'review-form',on:{submit:e=>{e.preventDefault();decideClaim(c,draft.decision,draft.reason)},keydown:e=>{if(e.key==='Escape'&&!busy){e.preventDefault();cancelReview()}}}},
 h('label',{for:'review-reason'},REVIEW_QUESTION[draft.decision]),h('p',{class:'small muted',id:'review-effect'},REVIEW_EFFECT[draft.decision]),
 h('textarea',{id:'review-reason',rows:3,required:true,disabled:ui.readyDecision===c.caseId,'aria-describedby':'review-effect',on:{input:e=>{draft.reason=e.target.value;document.getElementById('record-review').disabled=!draft.reason.trim()||!!ui.readyDecision||!!ui.readyLoading}}},draft.reason),
 ui.reviewError?.caseId===c.caseId?h('p',{class:'small c-fail',role:'alert','data-review-error':true,tabindex:'-1'},ui.reviewError.text):null,
 ui.reviewWaiting===c.caseId?h('p',{class:'small muted',role:'status'},'Waiting for the review update…'):null,
 h('div',{class:'row'},h('button',{id:'record-review',class:'btn sm',type:'submit',disabled:busy||!draft.reason.trim()},ui.readyDecision?'Recording…':({waived:'Record waiver',rejected:'Record rejection',challenged:'Record challenge'})[draft.decision]),h('button',{class:'btn ghost sm',type:'button',disabled:busy,on:{click:cancelReview}},'Cancel')))
}
const STATE_TONE={pending:'p-info',supported:'p-pass',current:'p-pass',completed:'p-pass',accepted:'p-pass',auto:'p-pass',contradicted:'p-fail',rejected:'p-fail',challenged:'p-fail',none:'p-none',not_run:'p-none'};
function statePill(v,label){return h('span',{class:'pill '+(STATE_TONE[v]||'p-warn')},label||v.replace(/_/g,' '))}
function claimRow(c){return h('article',{class:'claim-row'},
 h('div',{class:'row',style:'justify-content:space-between;align-items:baseline'},h('h2',{},c.title),statePill(reviewStage(c)==='sign-off'?'pending':c.decision,REVIEW_LABEL[reviewStage(c)])),
 h('p',{class:'small muted'},evidenceSummary(c)),c.next&&!c.ready&&reviewStage(c)!=='sign-off'&&c.next.why!==c.failure?h('p',{class:'small muted'},c.next.why):null,
 c.decision==='waived'&&c.reason?h('p',{class:'small'},'Waiver: '+c.reason):null,
 c.failure?h('p',{class:'small c-fail'},c.failure):null,
 h('div',{class:'row claim-actions'},
  c.assessment==='supported'&&c.validity==='current'&&!c.ready&&c.decision!=='accepted'?h('button',{class:'btn sm',disabled:!!ui.readyLoading||!!ui.readyDecision,on:{click:()=>decideClaim(c,'accepted')}},'Accept'):null,
  h('button',{class:'btn ghost sm',on:{click:()=>showScenario(c.caseId,c.run)}},'Open scenario',icon('Arrow')),
  disclosureFor(c.caseId,'Evidence and review options',
   h('div',{class:'claim-states'},...[['Ran',c.execution],['Evidence',c.assessment],['Still valid',c.validity],['Sign-off',c.decision]].map(([label,value])=>h('div',{},h('div',{class:'label'},label),statePill(value,value==='auto'?'accepted by policy':null)))),
   h('p',{class:'small muted'},c.caseId+' · '+c.risk+' · '+c.channels.join(', ')),
   c.reason?h('p',{class:'small'},c.reason):null,
   
   h('div',{class:'row'},!c.ready?h('button',{class:'btn ghost sm',disabled:!!ui.readyLoading||!!ui.readyDecision,'aria-expanded':ui.reviewDraft?.caseId===c.caseId&&ui.reviewDraft?.decision==='waived'?'true':'false','data-review-action':'waived-'+c.caseId,on:{click:()=>startReview(c,'waived')}},'Waive'):null,
    c.assessment==='supported'?h('button',{class:'btn ghost sm',disabled:!!ui.readyLoading||!!ui.readyDecision,'aria-expanded':ui.reviewDraft?.caseId===c.caseId&&ui.reviewDraft?.decision==='rejected'?'true':'false','data-review-action':'rejected-'+c.caseId,on:{click:()=>startReview(c,'rejected')}},'Reject'):null,
    h('button',{class:'btn ghost sm',disabled:!!ui.readyLoading||!!ui.readyDecision,'aria-expanded':ui.reviewDraft?.caseId===c.caseId&&ui.reviewDraft?.decision==='challenged'?'true':'false','data-review-action':'challenged-'+c.caseId,on:{click:()=>startReview(c,'challenged')}},'Challenge check')))),reviewForm(c)) }
function readinessTab(){const r=ui.ready;if(!r){if(!r&&!ui.readyLoading)loadReadiness();return[h('p',{class:'muted',role:'status'},'Checking tests and sign-offs…')]}
 if(r.error)return[blocked(r.error),h('button',{class:'btn ghost',disabled:!!ui.readyLoading,on:{click:()=>{loadReadiness()}}},ui.readyLoading?'Updating…':'Try again')];
 if(!r.claims.length)return[emptyState('Your first test starts here.','Run a scenario to collect evidence. Its result and review status will appear here.',()=>openTab('Run'),'Go to Run')];
 const pending=r.claims.filter(c=>!c.ready),done=r.claims.filter(c=>c.ready);
 return[taskHeading(r.ready?(r.counts.waived?'Ready for handoff, with '+r.counts.waived+' waived.':'Ready for handoff.'):pending.length+' test'+(pending.length===1?' needs':'s need')+' your review.',r.ready?(r.counts.waived?r.counts.waived+' handed off without current evidence. Review the waiver reasons below.':'The recorded evidence and required sign-offs are complete.'):'Passing tests and approval are separate. Review what is still open below.'),
 h('div',{class:'row'},h('a',{class:'btn ghost sm',href:'/api/handoff',target:'_blank',rel:'noopener'},'Open handoff report',icon('Arrow')),h('button',{class:'btn ghost sm',disabled:!!ui.readyLoading||!!ui.readyDecision,on:{click:()=>{loadReadiness()}}},ui.readyLoading?'Updating…':'Refresh')),
 h('p',{class:'small muted'},r.claims.filter(c=>c.assessment==='supported'&&c.validity==='current').length+' with current evidence · '+r.counts.stale+' out of date · '+signoffCount()+' awaiting sign-off'),
 ui.readyLoading?h('p',{class:'small muted',role:'status'},'Updating review status…'):null,ui.readyError?h('p',{class:'small c-warn',role:'alert'},'Could not update; showing the last result. ',h('button',{class:'btn ghost sm',disabled:!!ui.readyLoading,on:{click:()=>loadReadiness()}},'Try again')):null,ui.reviewError&&(!ui.reviewDraft||ui.reviewDraft.caseId!==ui.reviewError.caseId)?h('p',{class:'small c-fail',role:'alert','data-review-error':true,tabindex:'-1'},ui.reviewError.text):null,ui.readyNotice?h('p',{class:'small review-receipt',role:'status',tabindex:'-1'},ui.readyNotice.text):null,
 ...pending.map(claimRow),done.length?disclosure(done.length+' ready for handoff',...done.map(claimRow)):null]}

`;
