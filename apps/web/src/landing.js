import {attributionForLanding,buildLanding1Path,buildLandingPath,campaignFromSearchParams,commerceForCampaign,planCodeForPackage} from './landing-campaign.js';
import {buildLandingAnalyticsContext,trackAddToCart,trackLandingView,trackPaymentConversion} from './landing-analytics.js';
import {linkBillingWallet,submitWalletPortal} from './billing-api.js';
import {update} from './state.js';

const phoneIcon=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.8.3 1.6.6 2.3a2 2 0 0 1-.5 2.1L8.1 9.1a16 16 0 0 0 6 6l1.9-1.1a2 2 0 0 1 2.1-.4c.7.3 1.5.5 2.3.6a2 2 0 0 1 1.6 2.1Z"></path></svg>`;
const lockIcon=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"></path></svg>`;
const arrowIcon=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>`;
const megaphoneIcon=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 13-5v12L3 14v-3Z"></path><path d="M16 9.5h3a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-3M6 15l1.5 5H11l-1.5-4.4"></path></svg>`;

function bannerFor(landing){
  if(landing==='landing1'){
    return{
      mobile:'/assets/landings/landing1-mobile.jpeg',
      web:'/assets/landings/landing1-web.jpeg',
      alt:'Game Arena+ TikTok — Win PKR 10,000 JazzCash Credit Every Month'
    };
  }
  return{
    mobile:'/assets/landings/main-mobile.jpeg',
    web:'/assets/landings/main-web.jpeg',
    alt:'Game Arena+ — More Games. Bigger Rewards.'
  };
}

function detectLanding(){
  const path=location.pathname.replace(/\/+$/,'')||'/';
  if(path==='/landing'||path==='/mainLanding2'||path==='/landing2'){
    const q=location.search||'';
    location.replace(path==='/landing2'?`/landing1${q}`:`/mainLanding${q}`);
    return null;
  }
  if(path==='/landing1')return 'landing1';
  if(path==='/mainLanding')return 'mainLanding';
  return null;
}

function fitLandingAboveFold(){
  const fit=document.querySelector('.ga-lp-fit');
  const above=document.querySelector('.ga-lp-above');
  const img=document.querySelector('.ga-lp-banner');
  if(!fit||!above)return;
  above.style.transform='none';
  fit.style.height='auto';
  // Mobile: never scale — scaling leaves white side gutters. Keep full-bleed banner.
  if(window.matchMedia('(max-width:720px)').matches){
    fit.dataset.scale='1';
    if(img&&!img.dataset.fitBound){
      img.dataset.fitBound='1';
      img.addEventListener('load',fitLandingAboveFold,{once:true});
    }
    return;
  }
  const natural=above.scrollHeight||above.offsetHeight;
  const available=Math.max(320,window.innerHeight-8);
  const scale=natural>available?Math.min(1,available/natural):1;
  above.style.transform=`scale(${scale})`;
  fit.style.height=`${Math.ceil(natural*scale)}px`;
  fit.dataset.scale=String(scale);
  if(img&&!img.dataset.fitBound){
    img.dataset.fitBound='1';
    img.addEventListener('load',fitLandingAboveFold,{once:true});
  }
}

function benefitsFooter(){
  const items=[
    ['catalogue','Full Game Catalogue','Unlock the complete Game Arena library, including premium games unavailable to free members.'],
    ['tournaments','Exclusive Tournaments','Get access to premium tournaments and special gaming events.'],
    ['coins','Earn Arena Coins','Play, compete and complete eligible challenges to earn Arena Coins and exciting rewards.'],
    ['vouchers','Exclusive Offers & Vouchers','Enjoy special discounts, promotional offers and partner vouchers when available.'],
    ['priority','Priority Access','Be the first to know about new games, tournaments, events and exclusive offers.'],
    ['rewards','Enhanced Rewards','Unlock additional reward opportunities, including Arena Coins, vouchers and other eligible rewards.'],
    ['community','Join a Bigger Community','Connect with players, teams and gaming enthusiasts across Pakistan.'],
    ['experience','A Better Gaming Experience','More games, more tournaments, more rewards and more of what you love.']
  ];
  return `<section class="ga-lp-benefits" aria-labelledby="ga-lp-benefits-title">
    <div class="ga-lp-benefits-inner">
      <header class="ga-lp-benefits-head">
        <h2 id="ga-lp-benefits-title">Game Arena <span>Premium</span> Benefits</h2>
        <p>More games — more rewards — a better gaming experience.</p>
      </header>
      <ul class="ga-lp-benefits-grid">
        ${items.map(([key,title,copy])=>`<li class="ga-lp-benefit" data-icon="${key}"><span class="ga-lp-benefit-icon" aria-hidden="true"></span><div><h3>${title}</h3><p>${copy}</p></div></li>`).join('')}
      </ul>
    </div>
  </section>`;
}

function renderLanding(landing,commerce){
  const banner=bannerFor(landing);
  return `<main class="ga-lp" data-landing="${landing}">
  <div class="ga-lp-fit">
  <div class="ga-lp-above">
    <section class="ga-lp-hero" aria-label="Game Arena+ offer">
      <div class="ga-lp-banner-swap">
        <picture>
          <source media="(min-width:720px)" srcset="${banner.web}">
          <img class="ga-lp-banner" src="${banner.mobile}" alt="${banner.alt}" width="1600" height="900" decoding="async">
        </picture>
      </div>
    </section>
    <section class="ga-lp-card" aria-labelledby="payment-heading">
      <h2 id="payment-heading" class="ga-lp-title"><span class="ga-lp-phone-icon">${phoneIcon}</span>Enter Your JazzCash Number</h2>
      <form id="landing-subscribe" class="ga-lp-form" novalidate>
        <label class="ga-lp-input" for="landing-msisdn">
          <span class="ga-lp-jc"><img src="/assets/landings/jazzcash-logo.png" alt="JazzCash" width="160" height="48" class="ga-lp-jc-img"></span>
          <span class="ga-lp-divider" aria-hidden="true"></span>
          <input id="landing-msisdn" name="msisdn" type="tel" inputmode="numeric" autocomplete="tel-national" required pattern="(\\+92|0)?3\\d{9}" placeholder="03XX XXXXXXX" aria-label="JazzCash mobile number">
        </label>
        <label class="ga-lp-terms">
          <input name="consent" type="checkbox" required checked>
          <span class="ga-lp-check" aria-hidden="true">✓</span>
          <span>I agree to Game Arena <a href="/legal/terms.html" target="_blank" rel="noopener">Terms and Conditions</a></span>
        </label>
        <button class="ga-lp-pay" type="submit"${commerce.comingSoon?' disabled':''}>
          <span class="ga-lp-pay-lock">${lockIcon}</span>
          ${commerce.comingSoon?'Coming soon':'Subscribe Now'}
          <span class="ga-lp-pay-arrow">${arrowIcon}</span>
        </button>
      </form>
      <p id="landing-status" class="ga-lp-status" role="status"></p>
      <div class="ga-lp-notice">
        <div class="ga-lp-notice-icon" aria-hidden="true">${megaphoneIcon}</div>
        <p>${commerce.offerNote}</p>
        <span class="ga-lp-notice-stripes" aria-hidden="true"></span>
      </div>
    </section>
  </div>
  </div>
  <section class="ga-lp-trust" aria-label="Trust signals">
    <div><b>Secure Payments</b><small>Powered by JazzCash</small></div>
    <div><b>Aapka data safe hai</b><small>100% Secure</small></div>
    <div><b>Help jab chahiye</b><small>24/7 Support</small></div>
  </section>
  <p class="ga-lp-legal">Jari rakhne se aap Game Arena ki <a href="/legal/terms.html" target="_blank" rel="noopener">Terms and Conditions</a> se raazi hoon. Already paid? <a href="/#/account">Sign in</a>.</p>
  ${benefitsFooter()}
</main>`;
}

async function startCheckout({landing,campaign,commerce}){
  const form=document.querySelector('#landing-subscribe');
  const status=document.querySelector('#landing-status');
  const msisdn=String(new FormData(form).get('msisdn')||'').replace(/\s/g,'');
  if(!/^(\+92|0)?3\d{9}$/.test(msisdn)){status.textContent='Enter a valid JazzCash number (03XXXXXXXXX).';return;}
  if(!form.querySelector('[name="consent"]').checked){status.textContent='Consent is required to continue.';return;}
  if(commerce.comingSoon){status.textContent='This plan is coming soon.';return;}
  const landingPath=landing==='landing1'?buildLanding1Path(campaign):buildLandingPath(campaign);
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
    if(result?.mock){
      trackPaymentConversion({paymentStatus:'succeeded',transactionId:result.transactionId||'mock-landing'});
      try{sessionStorage.setItem('game-arena:pending-subscription',JSON.stringify({msisdn,planCode:commerce.planCode,landing,at:Date.now()}));}catch{/* ignore */}
      update({entitlement:'premium',selectedPlan:commerce.planCode==='yearly'?'yearly':'monthly'});
      status.textContent='Premium Features Unlocked. Redirecting…';
      location.assign('/#/home?payment=succeeded');
      return;
    }
    status.textContent='Redirecting to JazzCash…';
    if(!submitWalletPortal(result))throw new Error('JazzCash portal response was incomplete.');
  }catch(error){
    if(error.code==='already_linked'||/already linked/i.test(String(error.message||''))){
      status.textContent='This JazzCash number already has Game Arena+. Sign in with the same number to continue.';
      return;
    }
    status.textContent=error.status===429?'Too many requests. Please retry shortly.':(error.message||'Unable to start JazzCash checkout.');
  }
}

function handleLandingReturn(campaign,landing){
  const params=new URLSearchParams(location.search);
  const payment=params.get('payment');
  const status=document.querySelector('#landing-status');
  if(payment==='failed'){
    if(status)status.textContent='JazzCash payment was not completed. You can try again.';
    return;
  }
  if(payment==='succeeded'){
    const txn=params.get('orderId')||params.get('txn')||params.get('transactionId')||'landing-return';
    trackPaymentConversion({paymentStatus:'succeeded',transactionId:txn});
    update({entitlement:'premium',selectedPlan:planCodeForPackage(campaign.package)==='yearly'?'yearly':'monthly'});
    try{
      const msisdn=sessionStorage.getItem('game-arena:landing-msisdn')||'';
      sessionStorage.setItem('game-arena:pending-subscription',JSON.stringify({msisdn,planCode:planCodeForPackage(campaign.package),landing,at:Date.now()}));
    }catch{/* ignore */}
    if(status)status.textContent='Premium Features Unlocked. Redirecting…';
    setTimeout(()=>location.assign('/#/home?payment=succeeded'),900);
  }
}

function ensureLandingStyles(){
  if(document.querySelector('link[data-landing-styles]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  const release=encodeURIComponent(window.GAME_ARENA_CONFIG?.releaseSha||'dev');
  link.href=`/styles/landing.css?v=${release}`;
  link.dataset.landingStyles='true';
  document.head.append(link);
}

export function bootLandingIfNeeded(){
  const landing=detectLanding();
  if(!landing)return false;
  ensureLandingStyles();
  const campaign=campaignFromSearchParams(location.search,landing);
  const commerce=commerceForCampaign(campaign);
  document.body.classList.add('landing-mode');
  document.documentElement.classList.add('landing-mode');
  document.querySelector('.shell')?.classList.add('landing-active');
  const app=document.querySelector('#app');
  app.innerHTML=renderLanding(landing,commerce);
  const context=buildLandingAnalyticsContext(campaign,{landing});
  trackLandingView(context);
  handleLandingReturn(campaign,landing);
  document.querySelector('#landing-subscribe')?.addEventListener('submit',event=>{event.preventDefault();startCheckout({landing,campaign,commerce});});
  const runFit=()=>fitLandingAboveFold();
  runFit();
  requestAnimationFrame(runFit);
  addEventListener('resize',runFit);
  addEventListener('orientationchange',()=>setTimeout(runFit,120));
  return true;
}
