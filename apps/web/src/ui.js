import {getState,update} from './state.js';
import {loginAccount,registerAccount,createCheckout,refreshEntitlement,submitCheckout} from './api.js';
import {track} from './analytics.js';
const modalRoot=document.querySelector('#modal-root');const toastRoot=document.querySelector('#toast-root');
export function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
export function money(value){return new Intl.NumberFormat('en-PK',{style:'currency',currency:'PKR',maximumFractionDigits:0}).format(value);}
export function toast(message){const node=document.createElement('div');node.className='toast';node.textContent=message;toastRoot.append(node);setTimeout(()=>node.remove(),3400);}
export function closeModal(){modalRoot.replaceChildren();}
export function modal(title,body,{wide=false}={}){modalRoot.innerHTML=`<div class="modal-backdrop" role="presentation"><section class="modal ${wide?'modal-wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><h2 id="modal-title">${escapeHtml(title)}</h2><button class="icon-button" data-close type="button" aria-label="Close">×</button></header>${body}</section></div>`;modalRoot.querySelector('[data-close]').addEventListener('click',closeModal);modalRoot.querySelector('.modal-backdrop').addEventListener('click',event=>{if(event.target===event.currentTarget)closeModal();});modalRoot.querySelector('input,button')?.focus();return modalRoot.querySelector('.modal');}

function authMarkup(mode='signin'){
  const isSignUp=mode==='signup';
  return `<form id="auth-form" class="stack" data-mode="${mode}">
    <div class="auth-tabs" role="tablist">
      <button type="button" class="chip ${isSignUp?'':'active'}" data-auth-mode="signin">Sign in</button>
      <button type="button" class="chip ${isSignUp?'active':''}" data-auth-mode="signup">Sign up</button>
    </div>
    <p class="muted">${isSignUp?'Create an account with your mobile number.':'Sign in with your mobile number and password.'}</p>
    <div class="field"><label for="auth-msisdn">Mobile number</label><input id="auth-msisdn" name="msisdn" inputmode="tel" autocomplete="tel" required pattern="(\\+92|0)?3\\d{9}" placeholder="03XX XXXXXXX"></div>
    ${isSignUp?'<div class="field"><label for="auth-name">Name</label><input id="auth-name" name="name" autocomplete="name" required maxlength="80" placeholder="Your name"></div>':''}
    <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="${isSignUp?'new-password':'current-password'}" required minlength="6" placeholder="At least 6 characters"></div>
    ${isSignUp?'<div class="field"><label for="auth-confirm">Confirm password</label><input id="auth-confirm" name="confirm" type="password" autocomplete="new-password" required minlength="6" placeholder="Re-enter password"></div>':''}
    <button class="button primary" type="submit">${isSignUp?'Create account':'Sign in'}</button>
    <p id="auth-status" role="status"></p>
  </form>`;
}

function bindAuthForm(resolve){
  const form=document.querySelector('#auth-form');
  form.querySelectorAll('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>{
    const mode=button.dataset.authMode;
    form.outerHTML=authMarkup(mode);
    bindAuthForm(resolve);
  }));
  form.onsubmit=async event=>{
    event.preventDefault();
    const status=form.querySelector('#auth-status');
    const data=Object.fromEntries(new FormData(form).entries());
    const mode=form.dataset.mode||'signin';
    status.textContent=mode==='signup'?'Creating account…':'Signing in…';
    try{
      if(mode==='signup'){
        if(String(data.password)!==String(data.confirm))throw new Error('Password and confirm password must match.');
        const result=await registerAccount({msisdn:data.msisdn,name:data.name,password:data.password});
        update({user:result.user,entitlement:result.entitlement?.tier||result.entitlement||'free',coins:result.coins??getState().coins});
        track('signup_complete');
      }else{
        const result=await loginAccount({msisdn:data.msisdn,password:data.password});
        update({user:result.user,entitlement:result.entitlement?.tier||result.entitlement||'free',coins:result.coins??getState().coins});
        track('signin_complete');
      }
      closeModal();
      toast(getState().entitlement==='premium'?'Signed in · Game Arena+ subscribed':'Signed in successfully');
      resolve(true);
    }catch(error){status.textContent=error.message;}
  };
}

export function requireAuth(continuation){
  if(getState().user)return Promise.resolve(true);
  update({continuation});
  return new Promise(resolve=>{
    modal('Sign in to continue',authMarkup('signin'));
    bindAuthForm(resolve);
  });
}

export async function membershipCheckout(plan){
  if(!await requireAuth({type:'checkout',planId:plan.id}))return;
  track('checkout_start',{planId:plan.id});
  modal('Activate Game Arena+',`<div class="stack"><div class="checkout-summary"><span><b>${escapeHtml(plan.name)}</b><small>${money(plan.price)} · fixed-duration ${escapeHtml(plan.period)}</small></span><span class="jazzcash-mark">JC</span></div><div class="notice">Game Arena never collects your JazzCash PIN or card details.</div><button class="button gold" id="start-payment" type="button">Continue to JazzCash</button><p id="payment-status" role="status"></p></div>`);
  document.querySelector('#start-payment').addEventListener('click',async()=>{
    const status=document.querySelector('#payment-status');
    status.textContent='Creating checkout…';
    try{
      const tx=await createCheckout(plan.id);
      sessionStorage.setItem('game-arena:pending-payment',JSON.stringify({transactionId:tx.transactionId,planId:plan.id,createdAt:Date.now()}));
      if(submitCheckout(tx.checkout)){status.textContent='Redirecting to JazzCash…';return;}
      status.textContent='Payment received. Confirming access…';
      const entitlement=await refreshEntitlement(tx.transactionId);
      if(entitlement.status!=='active'){status.textContent='Payment is still pending. You can safely return later.';return;}
      update({entitlement:entitlement.entitlement,selectedPlan:plan.id});
      sessionStorage.removeItem('game-arena:pending-payment');
      track('checkout_complete',{planId:plan.id});
      closeModal();
      toast('Game Arena+ is active');
      location.hash='#/account';
    }catch(error){status.textContent=error.message;}
  });
}
