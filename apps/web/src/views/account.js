import {getState,resetSession,isPremium,hasPendingGuestPremium,update} from '../state.js';
import {deleteAccount,exportAccount,logout,logoutAll} from '../api.js';
import {renderBillingPanel,bindBillingPanel} from '../billing-account.js';
import {cancelBillingSubscription,fetchBillingStatus} from '../billing-api.js';
import {requireAuth,toast} from '../ui.js';
import {track} from '../analytics.js';

function planLabel(state){
  if(!isPremium())return 'Free';
  return `Game Arena+ · ${state.selectedPlan==='yearly'?'Yearly':'Monthly'}`;
}

export function renderAccount(){
  const state=getState();
  const subscribed=isPremium();
  const pending=hasPendingGuestPremium();
  const membershipLabel=subscribed?'Subscribed · Game Arena+':pending?'Plan purchased · sign in to activate':'Free member';
  return `<section class="page account-page">
  <header class="page-head">
    <div>
      <span class="eyebrow">Account</span>
      <h1>${state.user?state.user.displayName||'Player':'Guest player'}</h1>
      <p>${state.user?membershipLabel:pending?'JazzCash plan ready. Sign in with the same number to use Game Arena+.':'Browse freely and sign in when an action needs an account.'}</p>
      ${subscribed||pending?'<span class="badge premium">Subscribed</span>':''}
    </div>
    ${!state.user?'<button class="button primary" id="sign-in" type="button">Sign in</button>':''}
  </header>
  ${!state.onboardingComplete?`<section class="card onboarding-card"><div><span class="eyebrow">Getting started</span><h2>Your Arena in three steps</h2><p>Browse a game, sign in with your mobile number when needed, then activate premium only when you choose.</p></div><div class="step-mini"><span>1. Discover</span><span>2. Sign in</span><span>3. Play or upgrade</span></div><button class="button secondary" id="finish-onboarding" type="button">Got it</button></section>`:''}
  <div class="account-stack">
    <article class="card account-card card-body">
      <h2>Membership</h2>
      ${state.user
        ?`<p class="muted">Current plan: <b id="account-current-plan">${planLabel(state)}</b></p>
           <p class="muted" id="account-plan-detail">${subscribed?'Full catalogue and premium rewards are active.':'You can browse and play selected free games.'}</p>`
        :pending
          ?`<p class="muted">Current plan: <b>Game Arena+ · pending sign-in</b></p><p class="muted">Sign in with your JazzCash number to attach this purchase.</p>`
          :`<p class="muted">Sign in to see your current plan.</p>`}
      <div class="hero-actions">
        ${!subscribed&&!pending?'<a class="button gold" href="/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash">Upgrade to Arena+</a>':''}
        ${state.user&&subscribed?'<button class="button danger" id="unsubscribe-plan" type="button">Unsubscribe</button>':''}
        ${state.user?'<button class="button danger" id="sign-out" type="button">Sign out</button><button class="button secondary" id="sign-out-all" type="button">Sign out other devices</button>':''}
      </div>
    </article>
    ${state.user?renderBillingPanel():''}
    <section class="card card-body account-privacy">
      <h2>Privacy and support</h2>
      <p class="muted">Download a portable copy of your account data or request account deletion.</p>
      <div class="hero-actions">
        <a class="button secondary" href="/legal/privacy.html">Privacy</a>
        <a class="button secondary" href="/legal/terms.html">Terms</a>
        <a class="button secondary" href="/legal/rewards.html">Reward rules</a>
        <a class="button secondary" href="#/support">Contact support</a>
        ${state.user?'<button class="button secondary" id="export-account" type="button">Export data</button><button class="button danger" id="delete-account" type="button">Delete account</button>':''}
      </div>
    </section>
  </div>
</section>`;
}

async function unsubscribeCurrentPlan(){
  if(!confirm('Unsubscribe from your current Game Arena+ plan? Future renewals will stop. Paid access stays until the current period ends.'))return;
  try{
    const status=await fetchBillingStatus();
    const id=(status.subscriptions||[])[0]?.id||status.appEntitlement?.sourceId||'current';
    const result=await cancelBillingSubscription(id);
    const entitlement=result.appEntitlement||status.appEntitlement||{};
    update({entitlement:{tier:entitlement.tier||'premium',status:entitlement.status||'active',expiresAt:entitlement.expiresAt||null,autoRenew:false}});
    toast('Unsubscribed. Access continues until the paid period ends.');
    track('subscription_cancel',{subscriptionId:id});
    const plan=document.querySelector('#account-current-plan');
    const detail=document.querySelector('#account-plan-detail');
    if(plan)plan.textContent=`${planLabel(getState())} · canceling`;
    if(detail)detail.textContent='Future renewals stopped. Paid-period access is retained until it expires.';
    document.querySelector('#unsubscribe-plan')?.remove();
    await bindBillingPanel();
  }catch(error){toast(error.message||'Unable to unsubscribe right now.');}
}

export function bindAccount(){
  document.querySelector('#finish-onboarding')?.addEventListener('click',()=>{update({onboardingComplete:true});track('onboarding_complete');});
  document.querySelector('#sign-in')?.addEventListener('click',()=>requireAuth({type:'account'}));
  document.querySelector('#unsubscribe-plan')?.addEventListener('click',()=>unsubscribeCurrentPlan());
  document.querySelector('#sign-out')?.addEventListener('click',async()=>{try{await logout();}finally{resetSession();toast('Signed out');}});
  document.querySelector('#sign-out-all')?.addEventListener('click',async()=>{const result=await logoutAll();toast(`${result.revoked} other session${result.revoked===1?'':'s'} signed out.`);});
  document.querySelector('#export-account')?.addEventListener('click',async()=>{try{const data=await exportAccount();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='game-arena-account.json';link.click();URL.revokeObjectURL(url);track('account_export');}catch(error){toast(error.message);}});
  document.querySelector('#delete-account')?.addEventListener('click',async()=>{if(!confirm('Request account deletion and sign out all devices?'))return;try{await deleteAccount();resetSession();toast('Account deletion requested.');}catch(error){toast(error.message);}});
  if(getState().user)bindBillingPanel();
}
