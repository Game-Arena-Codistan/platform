import {getState,resetSession,isPremium,update} from '../state.js';
import {deleteAccount,exportAccount,logout,logoutAll} from '../api.js';
import {renderBillingPanel,bindBillingPanel} from '../billing-account.js';
import {openAuth,requireAuth,toast} from '../ui.js';
import {track} from '../analytics.js';

function planLabel(state){
  if(!isPremium())return 'Free';
  const selected=state.selectedPlan==='yearly'?'Yearly':'Monthly';
  return `Game Arena+ · ${selected}`;
}

export function renderAccount(){
  const state=getState();
  const subscribed=isPremium();
  const membershipLabel=subscribed?'Subscribed · Game Arena+':'Free member';
  return `<section class="page"><header class="page-head"><div><span class="eyebrow">Account</span><h1>${state.user?state.user.displayName||'Player':'Guest player'}</h1><p>${state.user?membershipLabel:'Browse freely and sign in only when an action needs an account.'}</p>${subscribed?'<span class="badge premium">Subscribed</span>':''}</div>${!state.user?'<button class="button primary" id="sign-in" type="button">Sign in</button>':''}</header>${!state.onboardingComplete?`<section class="card onboarding-card"><div><span class="eyebrow">Getting started</span><h2>Your Arena in three steps</h2><p>Browse a game, sign in with your mobile number when needed, then activate premium only when you choose.</p></div><div class="step-mini"><span>1. Discover</span><span>2. Sign in</span><span>3. Play or upgrade</span></div><button class="button secondary" id="finish-onboarding" type="button">Got it</button></section>`:''}<div class="split wide"><article class="card account-card"><h2>Membership</h2>${state.user?`<p class="muted">Current plan: <b id="account-current-plan">${planLabel(state)}</b></p><p class="muted">${subscribed?'Full catalogue and premium rewards are active.':'You can browse and play selected free games.'}</p>`:`<p class="muted">Sign in to see your current plan.</p>`}<div class="hero-actions">${!subscribed?'<a class="button gold" href="/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash">Upgrade to Arena+</a>':''}${state.user?'<button class="button danger" id="sign-out" type="button">Sign out</button><button class="button secondary" id="sign-out-all" type="button">Sign out other devices</button>':''}</div></article></div>${state.user?renderBillingPanel():''}<section class="card card-body"><h2>Privacy and support</h2><p class="muted">Download a portable copy of your account data or request account deletion.</p><div class="hero-actions"><a class="button secondary" href="/legal/privacy.html">Privacy</a><a class="button secondary" href="/legal/terms.html">Terms</a><a class="button secondary" href="/legal/rewards.html">Reward rules</a><a class="button secondary" href="#/support">Contact support</a>${state.user?'<button class="button secondary" id="export-account" type="button">Export data</button><button class="button danger" id="delete-account" type="button">Delete account</button>':''}</div></section></section>`;
}

export function bindAccount(){
  document.querySelector('#finish-onboarding')?.addEventListener('click',()=>{update({onboardingComplete:true});track('onboarding_complete');});
  document.querySelector('#sign-in')?.addEventListener('click',()=>requireAuth({type:'account'}));
  document.querySelector('#sign-out')?.addEventListener('click',async()=>{try{await logout();}finally{resetSession();toast('Signed out');}});
  document.querySelector('#sign-out-all')?.addEventListener('click',async()=>{const result=await logoutAll();toast(`${result.revoked} other session${result.revoked===1?'':'s'} signed out.`);});
  document.querySelector('#export-account')?.addEventListener('click',async()=>{try{const data=await exportAccount();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='game-arena-account.json';link.click();URL.revokeObjectURL(url);track('account_export');}catch(error){toast(error.message);}});
  document.querySelector('#delete-account')?.addEventListener('click',async()=>{if(!confirm('Request account deletion and sign out all devices?'))return;try{await deleteAccount();resetSession();toast('Account deletion requested.');}catch(error){toast(error.message);}});
  if(getState().user)bindBillingPanel();
}
