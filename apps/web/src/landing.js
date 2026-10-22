import {attributionForLanding,buildLanding2Path,buildLandingPath,campaignFromSearchParams,commerceForCampaign,planCodeForPackage} from './landing-campaign.js';
import {buildLandingAnalyticsContext,trackAddToCart,trackLandingView} from './landing-analytics.js';
import {linkBillingWallet,submitWalletPortal} from './billing-api.js';

function money(value){return `Rs ${Number(value||0).toLocaleString('en-PK')}`;}
function detectLanding(){
  const path=location.pathname.replace(/\/+$/,'')||'/';
  if(path==='/landing'||path==='/mainLanding2'){const q=location.search||'';location.replace(`/mainLanding${q}`);return null;}
  if(path==='/landing2')return 'landing2';
  if(path==='/mainLanding')return 'mainLanding';
  return null;
}

function renderLanding(landing,campaign,commerce){
  const offer=landing==='landing2'
    ?'Limited TikTok offer: 20% off yearly when available.'
    :'Subscribe with JazzCash. No app install required.';
  const yearlyNote=commerce.comingSoon?'<p class="landing-soon">Yearly plan: Coming soon</p>':'';
  return `<section class="landing-shell"><div class="landing-hero-panel"><img class="landing-logo" src="/assets/logo.svg" alt="" width="48" height="48"><p class="landing-eyebrow">Game Arena+</p><h1>Unlock the full game catalogue</h1><p class="landing-lead">${offer}</p><div class="landing-price"><strong>${money(commerce.value)}</strong><span>${commerce.planCode==='yearly'?'/ year':'/ month'}</span></div>${yearlyNote}</div>
  <form id="landing-subscribe" class="landing-card" novalidate>
    <h2>Subscribe with JazzCash</h2>
    <p class="muted">Enter your JazzCash mobile number. MPIN is entered only on JazzCash.</p>
    <label class="field"><span>JazzCash mobile number</span><input id="landing-msisdn" name="msisdn" inputmode="tel" autocomplete="tel" required pattern="(\\+92|0)?3\\d{9}" placeholder="03XXXXXXXXX"></label>
    <label class="landing-consent"><input name="consent" type="checkbox" required><span>I authorize automatic JazzCash billing for Game Arena+ until I cancel.</span></label>
    <button class="button gold" type="submit"${commerce.comingSoon?' disabled':''}>${commerce.comingSoon?'Coming soon':'Subscribe Now'}</button>
    <p id="landing-status" class="landing-status" role="status"></p>
    <p class="muted landing-foot">Already paid? <a href="/#/account">Sign in</a> with the same JazzCash number.</p>
  </form></section>`;
}

async function startCheckout({landing,campaign,commerce}){
  const form=document.querySelector('#landing-subscribe');
  const status=document.querySelector('#landing-status');
  const msisdn=String(new FormData(form).get('msisdn')||'').replace(/\s/g,'');
  if(!/^(\+92|0)?3\d{9}$/.test(msisdn)){status.textContent='Enter a valid JazzCash number (03XXXXXXXXX).';return;}
  if(!form.querySelector('[name="consent"]').checked){status.textContent='Consent is required to continue.';return;}
  if(commerce.comingSoon){status.textContent='This plan is coming soon.';return;}
  const landingPath=landing==='landing2'?buildLanding2Path(campaign):buildLandingPath(campaign);
  const context=buildLandingAnalyticsContext(campaign,{landing});
  trackAddToCart(context);
  try{sessionStorage.setItem('game-arena:landing-msisdn',msisdn);}catch{/* ignore */}
  status.textContent='Connecting to JazzCash…';
  try{
    const result=await linkBillingWallet({
      msisdn,
      planCode:commerce.planCode||planCodeForPackage(campaign.package),
      consentToAutoPay:true,
      returnPath:landingPath,
      attribution:attributionForLanding(campaign,{landing,landingPath})
    });
    status.textContent='Redirecting to JazzCash…';
    if(!submitWalletPortal(result))throw new Error('JazzCash portal response was incomplete.');
  }catch(error){
    status.textContent=error.status===429?'Too many requests. Please retry shortly.':(error.message||'Unable to start JazzCash checkout.');
  }
}

export function bootLandingIfNeeded(){
  const landing=detectLanding();
  if(!landing)return false;
  const campaign=campaignFromSearchParams(location.search,landing);
  const commerce=commerceForCampaign(campaign);
  document.body.classList.add('landing-mode');
  document.querySelector('.shell')?.classList.add('landing-active');
  const app=document.querySelector('#app');
  app.innerHTML=renderLanding(landing,campaign,commerce);
  const context=buildLandingAnalyticsContext(campaign,{landing});
  trackLandingView(context);
  const failed=new URLSearchParams(location.search).get('payment')==='failed';
  if(failed){const status=document.querySelector('#landing-status');if(status)status.textContent='JazzCash payment was not completed. You can try again.';}
  document.querySelector('#landing-subscribe')?.addEventListener('submit',event=>{event.preventDefault();startCheckout({landing,campaign,commerce});});
  return true;
}
