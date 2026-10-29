import {getState,subscribe,update} from './state.js';
import {observeVitals,observeErrors,track} from './analytics.js';
import {getSession,refreshEntitlement,paymentStatus,fetchWallet,releaseSha} from './api.js';
import {ensureCatalogue} from './catalogue-runtime.js';
import {openAuth,toast} from './ui.js';
import {bootLandingIfNeeded} from './landing.js';
import {trackPaymentConversion} from './landing-analytics.js';
import {renderHome,bindHome} from './views/home.js';
import {renderFeed,bindFeed} from './views/feed.js';
import {renderLibrary,bindLibrary} from './views/library.js';
import {renderCompete,bindCompete} from './views/compete.js';
import {renderRewards,bindRewards} from './views/rewards.js';
import {renderPremium,bindPremium} from './views/premium.js';
import {renderAccount,bindAccount} from './views/account.js';
import {renderSupport,bindSupport} from './views/support.js';

if(bootLandingIfNeeded()){
  // Landing pages own the viewport; skip the hash SPA shell.
}else{
const routes={home:[renderHome,bindHome],feed:[renderFeed,bindFeed],library:[renderLibrary,bindLibrary],compete:[renderCompete,bindCompete],rewards:[renderRewards,bindRewards],premium:[renderPremium,bindPremium],account:[renderAccount,bindAccount],support:[renderSupport,bindSupport]};
const app=document.querySelector('#app');const balance=document.querySelector('#coin-balance');const network=document.querySelector('#network-status');let current='';
function route(){const name=location.hash.replace(/^#\//,'').split(/[/?]/)[0]||'home';return routes[name]?name:'home';}
function hasPendingSubscription(){
  try{return Boolean(JSON.parse(sessionStorage.getItem('game-arena:pending-subscription')||'null'));}catch{return false;}
}
function syncLibraryNavVisibility(state=getState()){
  const library=document.querySelector('[data-route="library"]');
  if(!library)return;
  const hide=!state.user&&(hasPendingSubscription()||state.entitlement==='premium'||state.entitlement?.tier==='premium');
  library.hidden=hide;
  library.setAttribute('aria-hidden',hide?'true':'false');
  if(hide&&location.hash.startsWith('#/library'))location.hash='#/home';
}
function paymentBanner(){
  const params=new URLSearchParams(location.hash.includes('?')?location.hash.split('?')[1]:'');
  if(params.get('payment')!=='succeeded')return;
  const txn=params.get('orderId')||params.get('txn')||'';
  if(txn)trackPaymentConversion({paymentStatus:'succeeded',transactionId:txn});
  try{
    const msisdn=sessionStorage.getItem('game-arena:landing-msisdn')||'';
    if(!getState().user)sessionStorage.setItem('game-arena:pending-subscription',JSON.stringify({msisdn,planCode:'monthly',at:Date.now(),source:'home-return'}));
  }catch{/* ignore */}
  if(document.querySelector('#payment-success-banner'))return;
  const banner=document.createElement('div');
  banner.id='payment-success-banner';
  banner.className='notice';
  banner.innerHTML='<b>Premium Features Unlocked.</b> Your JazzCash subscription is active. Sign in with your JazzCash number when you are ready to use Game Arena+.';
  app.prepend(banner);
  if(getState().entitlement!=='premium')update({entitlement:'premium'});
}
function render(force=false){
  try{
    if(!app)return;
    const name=route();
    const routeChanged=name!==current;
    if(force||routeChanged){
      current=name;
      const [view,bind]=routes[name];
      app.innerHTML=view();
      try{bind?.();}catch(error){console.error('route bind failed',name,error);}
      paymentBanner();
      document.querySelectorAll('[data-route]').forEach(link=>link.classList.toggle('active',link.dataset.route===name));
      // Only move focus on real navigation — state-driven re-renders must not steal keyboard focus.
      if(routeChanged){
        app.focus({preventScroll:true});
        track('route_view',{route:name});
      }
    }
    const state=getState();
    if(balance)balance.textContent=Number(state.coins||0).toLocaleString('en-PK');
    const profile=document.querySelector('#profile-button');
    if(profile){
      if(state.user){
        const label=(state.user.displayName||'P').slice(0,2).toUpperCase();
        // Avoid rewriting DOM when unchanged — textContent assignment blurs a focused control.
        if(profile.textContent!==label)profile.textContent=label;
        profile.classList.remove('avatar-cta');
        if(profile.getAttribute('aria-label')!=='Open account')profile.setAttribute('aria-label','Open account');
      }else{
        if(profile.textContent!=='Sign up')profile.textContent='Sign up';
        profile.classList.add('avatar-cta');
        if(profile.getAttribute('aria-label')!=='Sign up')profile.setAttribute('aria-label','Sign up');
      }
    }
    const premium=document.querySelector('#premium-button');
    if(premium)premium.hidden=state.entitlement==='premium'||state.entitlement?.tier==='premium';
    syncLibraryNavVisibility(state);
    document.documentElement.classList.toggle('reduce-motion',state.settings.reducedMotion);
  }catch(error){
    console.error('render failed',error);
    if(app&&!app.innerHTML)app.innerHTML='<section class="page"><div class="empty"><h3>Unable to load this screen</h3><p>Refresh the page. If this continues, clear site data for Game Arena.</p></div></section>';
  }
}
function setNetwork(){const online=navigator.onLine;if(network){network.textContent=online?'Online':'Offline';network.classList.toggle('offline',!online);}}
async function hydrate(){
  try{await Promise.race([ensureCatalogue(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('catalogue timeout')),8000))]);}catch{}
  try{const session=await getSession();if(session.authenticated)update({user:session.user,entitlement:session.entitlement?.tier||session.entitlement,coins:session.coins});}catch{}
}
async function reconcilePayment(){const match=location.hash.match(/payment-return\?(.+)$/);const pending=JSON.parse(sessionStorage.getItem('game-arena:pending-payment')||'null');const query=match?new URLSearchParams(match[1]):null;const transactionId=query?.get('transactionId')||pending?.transactionId;if(!transactionId)return;const kind=query?.get('kind')||pending?.kind||'membership';try{if(kind==='topup'){for(let attempt=0;attempt<12;attempt++){const result=await paymentStatus(transactionId);if(result.status==='paid'){const wallet=await fetchWallet();update({coins:wallet.balance,walletEntries:wallet.entries||[],walletLoaded:true});sessionStorage.removeItem('game-arena:pending-payment');toast(`+${result.coins||pending?.coins||0} Arena Coins`);location.hash='#/rewards';return;}if(['failed','refunded','voided'].includes(result.status))throw new Error(`Payment ${result.status}.`);await new Promise(resolve=>setTimeout(resolve,2000));}toast('Top-up payment is pending confirmation.');location.hash='#/rewards';return;}const entitlement=await refreshEntitlement(transactionId,{attempts:15,intervalMs:2000});if(entitlement.status==='active'){update({entitlement:entitlement.entitlement,selectedPlan:pending?.planId||getState().selectedPlan});sessionStorage.removeItem('game-arena:pending-payment');track('checkout_complete',{planId:pending?.planId});toast('Game Arena+ is active');location.hash='#/account';}else{toast('Payment is pending confirmation.');location.hash='#/premium';}}catch(error){toast(error.message);location.hash=kind==='topup'?'#/rewards':'#/premium';}}
function registerServiceWorker(){navigator.serviceWorker.register(`/sw.js?release=${encodeURIComponent(releaseSha())}`,{updateViaCache:'none'}).catch(()=>{});}
addEventListener('hashchange',()=>{if(location.hash.startsWith('#/payment-return'))reconcilePayment();else render();});
addEventListener('online',setNetwork);addEventListener('offline',setNetwork);
addEventListener('beforeinstallprompt',event=>{event.preventDefault();window.__GAME_ARENA_INSTALL_PROMPT=event;update({installPromptAvailable:true});});
document.querySelector('#profile-button')?.addEventListener('click',()=>{if(getState().user)location.hash='#/account';else openAuth('signup');});
document.querySelector('#coins-button')?.addEventListener('click',()=>location.hash='#/rewards');
document.querySelector('#premium-button')?.addEventListener('click',()=>location.assign('/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash'));
subscribe(()=>render(true));
observeVitals();observeErrors();setNetwork();
// Paint the shell immediately so a slow/hung catalogue fetch cannot leave every tab blank.
if(!location.hash)location.replace('#/home');
else if(location.hash.startsWith('#/payment-return'))reconcilePayment();
else render();
await hydrate();
render(true);
if('serviceWorker'in navigator){if(document.readyState==='complete')registerServiceWorker();else addEventListener('load',registerServiceWorker,{once:true});}
}
