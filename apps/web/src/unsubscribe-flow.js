import {getState,goArenaPlus,revokePremiumLocally} from './state.js';
import {lookupUnsubscribe,unsubscribeByMsisdn} from './billing-api.js';
import {closeModal,escapeHtml,modal,toast} from './ui.js';
import {track} from './analytics.js';

function formMarkup(msisdn='',statusHtml=''){
  return`<form id="unsubscribe-form" class="stack">
    <p class="muted">Enter the JazzCash mobile number used for Game Arena+. Unsubscribing ends access immediately.</p>
    <div class="field"><label for="unsubscribe-msisdn">JazzCash number</label><input id="unsubscribe-msisdn" name="msisdn" inputmode="tel" autocomplete="tel" required pattern="(\\+92|0)?3\\d{9}" placeholder="03XX XXXXXXX" value="${escapeHtml(msisdn)}"></div>
    <button class="button danger" type="submit">Unsubscribe</button>
    <p id="unsubscribe-status" class="muted" role="status">${statusHtml}</p>
  </form>`;
}

function confirmMarkup(msisdn,planCode){
  return`<div id="unsubscribe-confirm" class="stack">
    <p>Are you sure you want to cancel your subscription${planCode?` (<b>${escapeHtml(planCode)}</b>)`:''}?</p>
    <p class="muted">Game Arena+ access ends immediately and renewals stop for <b>${escapeHtml(msisdn)}</b>.</p>
    <div class="hero-actions">
      <button class="button danger" id="unsubscribe-confirm-yes" type="button">Yes, cancel subscription</button>
      <button class="button secondary" id="unsubscribe-confirm-back" type="button">Back</button>
    </div>
    <p id="unsubscribe-status" class="muted" role="status"></p>
  </div>`;
}

function noSubscriptionMarkup(){
  return`You don't have any active subscription. <button type="button" class="text-link" id="unsubscribe-view-plans">Click Here to view plans</button>`;
}

function seededMsisdn(){
  try{return String(sessionStorage.getItem('game-arena:landing-msisdn')||'').replace(/\s/g,'');}catch{return'';}
}

function bindNoPlanLink(){
  document.querySelector('#unsubscribe-view-plans')?.addEventListener('click',()=>{
    closeModal();
    goArenaPlus();
  });
}

function showForm(msisdn='',statusHtml=''){
  const dialog=modal('Unsubscribe',formMarkup(msisdn,statusHtml));
  const form=dialog.querySelector('#unsubscribe-form');
  bindNoPlanLink();
  form.onsubmit=async event=>{
    event.preventDefault();
    const status=form.querySelector('#unsubscribe-status');
    const phone=String(new FormData(form).get('msisdn')||'').trim();
    status.textContent='Checking subscription…';
    try{
      const result=await lookupUnsubscribe(phone);
      if(!result?.hasActiveSubscription){
        status.innerHTML=noSubscriptionMarkup();
        bindNoPlanLink();
        track('unsubscribe_lookup_miss');
        return;
      }
      showConfirm(phone,result.planCode||'');
    }catch(error){
      status.textContent=error.message||'Unable to check subscription right now.';
    }
  };
}

function showConfirm(msisdn,planCode){
  const dialog=modal('Confirm unsubscribe',confirmMarkup(msisdn,planCode));
  dialog.querySelector('#unsubscribe-confirm-back')?.addEventListener('click',()=>showForm(msisdn));
  dialog.querySelector('#unsubscribe-confirm-yes')?.addEventListener('click',async()=>{
    const status=dialog.querySelector('#unsubscribe-status');
    const button=dialog.querySelector('#unsubscribe-confirm-yes');
    button.disabled=true;
    status.textContent='Canceling subscription…';
    try{
      await unsubscribeByMsisdn({msisdn,confirm:true});
      revokePremiumLocally();
      track('unsubscribe_by_msisdn');
      closeModal();
      toast('Unsubscribed. Game Arena+ access has ended.');
      if(location.hash.includes('account'))location.hash='#/account';
    }catch(error){
      button.disabled=false;
      if(error.code==='no_active_subscription'){
        status.innerHTML=noSubscriptionMarkup();
        bindNoPlanLink();
        return;
      }
      status.textContent=error.message||'Unable to unsubscribe right now.';
    }
  });
}

export function openUnsubscribeFlow(){
  const state=getState();
  const phone=seededMsisdn()||state.user?.msisdn||state.user?.phone||'';
  showForm(phone);
}
