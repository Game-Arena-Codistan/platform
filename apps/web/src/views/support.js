import {supportTopics} from '../data.js';
import {submitSupportTicket} from '../api.js';
import {escapeHtml,toast} from '../ui.js';
import {track} from '../analytics.js';

// Catalogue hydrate always re-renders the current route. Keep the in-progress
// request in module state so that rebuild cannot drop the acceptance message.
const draft={topic:'',message:'',reference:'',status:''};

function readForm(form){
  const data=new FormData(form);
  draft.topic=String(data.get('topic')||'');
  draft.message=String(data.get('message')||'');
  draft.reference=String(data.get('reference')||'');
}

function setStatus(text){
  draft.status=text;
  const node=document.querySelector('#support-status');
  if(node)node.textContent=text;
}

export function renderSupport(){
  const options=supportTopics.map(item=>`<option${item===draft.topic?' selected':''}>${escapeHtml(item)}</option>`).join('');
  return `<section class="page"><header class="page-head"><div><span class="eyebrow">Help & support</span><h1>How can we help?</h1><p>Send a structured support request without sharing passwords, OTPs or wallet PINs.</p></div></header><div class="split wide"><form id="support-form" class="card card-body stack"><div class="field"><label for="support-topic">Topic</label><select id="support-topic" name="topic">${options}</select></div><div class="field"><label for="support-message">What happened?</label><textarea id="support-message" name="message" maxlength="1500" required placeholder="Include the game, screen, date and any error message.">${escapeHtml(draft.message)}</textarea></div><div class="field"><label for="support-reference">Optional reference</label><input id="support-reference" name="reference" maxlength="100" value="${escapeHtml(draft.reference)}" placeholder="Transaction, game or tournament ID"></div><button class="button primary" type="submit">Submit request</button><p id="support-status" role="status">${escapeHtml(draft.status)}</p></form><aside class="stack"><article class="card card-body"><h3>Game not loading</h3><p>Try another network, disable data saver for that game and send the exact title and error.</p></article><article class="card card-body"><h3>Payment pending</h3><p>Do not pay twice. Keep the transaction reference and wait for server confirmation.</p></article><article class="card card-body"><h3>Account access</h3><p>Use the same verified mobile number or email. Never share the OTP with support.</p></article></aside></div></section>`;
}

export function bindSupport(){
  const form=document.querySelector('#support-form');
  form?.addEventListener('input',()=>readForm(form));
  form?.addEventListener('change',()=>readForm(form));
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    readForm(form);
    const payload={topic:draft.topic,message:draft.message,reference:draft.reference};
    setStatus('Submitting…');
    try{
      const result=await submitSupportTicket(payload);
      track('support_submit',{topic:payload.topic});
      const ticketId=result?.ticket?.id||'';
      draft.topic='';
      draft.message='';
      draft.reference='';
      setStatus(ticketId?`Request ${ticketId} received.`:'Request received.');
      const live=document.querySelector('#support-form');
      const topic=live?.querySelector('#support-topic');
      const message=live?.querySelector('#support-message');
      const reference=live?.querySelector('#support-reference');
      if(topic)topic.selectedIndex=0;
      if(message)message.value='';
      if(reference)reference.value='';
      toast('Support request submitted');
    }catch(error){setStatus(error.message||'Unable to submit support request.');}
  });
}
