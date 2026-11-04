import {cancelBillingSubscription,fetchBillingPayments,fetchBillingPlans,fetchBillingStatus,unlinkBillingWallet} from './billing-api.js';
import {escapeHtml,toast} from './ui.js';
import {entitlementTier,getState,revokePremiumLocally,update} from './state.js';

const fmt=value=>value?new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
const money=minor=>new Intl.NumberFormat('en-PK',{style:'currency',currency:'PKR',maximumFractionDigits:0}).format(Number(minor||0)/100);
const TERMINAL=new Set(['canceled','cancelled','expired','payment_failed']);
let panelEpoch=0;

/** Sync local entitlement when the authoritative tier differs. Never restore premium right after a local revoke. */
function syncEntitlementTier(appEntitlement){
  const tier=entitlementTier(appEntitlement);
  const local=entitlementTier();
  if(!tier||local===tier)return false;
  const revokedAt=Number(getState().premiumRevokedAt||0);
  if(tier==='premium'&&revokedAt&&Date.now()-revokedAt<120000)return false;
  if(appEntitlement&&typeof appEntitlement==='object'){
    update({
      entitlement:{
        tier,
        status:appEntitlement.status||'active',
        expiresAt:appEntitlement.expiresAt||null,
        autoRenew:Boolean(appEntitlement.autoRenew)
      },
      ...(tier==='premium'?{premiumRevokedAt:null}:{})
    });
  }else{
    update({entitlement:tier,...(tier==='premium'?{premiumRevokedAt:null}:{})});
  }
  return true;
}

export function renderBillingPanel(){return `<section class="card card-body" id="billing-panel"><div class="page-head"><div><span class="eyebrow">Billing</span><h2>Game Arena+ subscription</h2><p class="muted" id="billing-summary">Loading JazzCash wallet and subscription status…</p></div></div><div id="billing-details" class="stack"></div><div id="billing-history" class="stack"></div></section>`;}

export async function bindBillingPanel(){
  const root=document.querySelector('#billing-panel');if(!root)return;
  const epoch=++panelEpoch;
  const summary=root.querySelector('#billing-summary');const details=root.querySelector('#billing-details');const history=root.querySelector('#billing-history');
  const stale=()=>epoch!==panelEpoch||!document.body.contains(root);
  try{
    const catalog=await fetchBillingPlans();
    if(stale())return;
    const enabled=Array.isArray(catalog)?catalog.length>0:Boolean(catalog?.enabled&&Array.isArray(catalog?.plans)&&catalog.plans.length>0);
    if(!enabled){root.remove();return;}
    const status=await fetchBillingStatus();
    if(stale())return;
    const wallet=status.wallet||{status:'none'};
    const sub=(status.subscriptions||[])[0];
    const state=sub?.status||status.status?.subscription_status||'none';
    // Tier change re-renders Account via subscribe(); the fresh bind paints the panel.
    if(status.appEntitlement?.tier&&syncEntitlementTier(status.appEntitlement))return;
    if(stale())return;
    summary.textContent=`Wallet: ${wallet.status}. Subscription: ${state}.`;
    if(!sub||TERMINAL.has(state)){
      details.innerHTML=`<p class="muted">${TERMINAL.has(state)?'Subscription canceled. Game Arena+ access has ended.':'No active subscription.'} <a href="#/library">Choose a Game Arena+ plan</a>.</p>`;
    }else{
      const paidThrough=sub.current_period_end||status.appEntitlement?.expiresAt;const next=sub.next_due_at||status.status?.next_due_at;
      details.innerHTML=`<div class="split"><div><b>Plan</b><p>${escapeHtml(sub.plan_code||'Premium')} · ${money(sub.amount_minor)}</p></div><div><b>Status</b><p>${escapeHtml(String(state).replaceAll('_',' '))}</p></div><div><b>Paid/trial access through</b><p>${fmt(paidThrough)}</p></div><div><b>Next due</b><p>${fmt(next)}</p></div></div><div class="hero-actions"><button class="button danger" id="cancel-subscription" type="button">Unsubscribe</button>${wallet.status==='linked'?'<button class="button secondary" id="unlink-wallet" type="button">Unlink JazzCash wallet</button>':''}</div><p class="muted">Unsubscribe ends Game Arena+ access immediately and stops renewals. The wallet stays linked unless you unlink it.</p>`;
      root.querySelector('#cancel-subscription')?.addEventListener('click',async event=>{
        if(!confirm('Unsubscribe from Game Arena+ now? Access ends immediately and renewals stop.'))return;
        const button=event.currentTarget;
        button.disabled=true;
        try{
          await cancelBillingSubscription(sub.id||'current');
          toast('Unsubscribed. Game Arena+ access has ended.');
          panelEpoch+=1;
          revokePremiumLocally();
        }catch(error){
          button.disabled=false;
          toast(error.message);
        }
      });
      root.querySelector('#unlink-wallet')?.addEventListener('click',async()=>{if(!confirm('Unlink JazzCash wallet and stop all future automatic debits?'))return;try{await unlinkBillingWallet();toast('JazzCash wallet unlinked.');await bindBillingPanel();}catch(error){toast(error.message);}});
    }
    const payments=await fetchBillingPayments();
    if(stale())return;
    const rows=Array.isArray(payments)?payments:[];
    history.innerHTML=`<h3>Payment history</h3>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Type</th></tr></thead><tbody>${rows.slice(0,10).map(item=>`<tr><td>${fmt(item.created_at)}</td><td>${money(item.amount_minor)}</td><td>${escapeHtml(item.status||'')}</td><td>${escapeHtml(item.charge_kind||'')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No payment history yet.</p>'}`;
  }catch(error){if(stale())return;summary.textContent=error.status===503?'Billing is not configured on this environment yet.':error.message;details.innerHTML='';history.innerHTML='';}
}
