import {cancelBillingSubscription,fetchBillingPayments,fetchBillingPlans,fetchBillingStatus,unlinkBillingWallet} from './billing-api.js';
import {escapeHtml,toast} from './ui.js';
import {getState,update} from './state.js';
const fmt=value=>value?new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
const money=minor=>new Intl.NumberFormat('en-PK',{style:'currency',currency:'PKR',maximumFractionDigits:0}).format(Number(minor||0)/100);
export function renderBillingPanel(){return `<section class="card card-body" id="billing-panel"><div class="page-head"><div><span class="eyebrow">Billing</span><h2>Game Arena+ subscription</h2><p class="muted" id="billing-summary">Loading JazzCash wallet and subscription status…</p></div></div><div id="billing-details" class="stack"></div><div id="billing-history" class="stack"></div></section>`;}
export async function bindBillingPanel(){
  const root=document.querySelector('#billing-panel');if(!root)return;
  const summary=root.querySelector('#billing-summary');const details=root.querySelector('#billing-details');const history=root.querySelector('#billing-history');
  try{
    const catalog=await fetchBillingPlans();const enabled=Array.isArray(catalog)?catalog.length>0:Boolean(catalog?.enabled&&Array.isArray(catalog?.plans)&&catalog.plans.length>0);
    if(!enabled){root.remove();return;}
    const status=await fetchBillingStatus();const wallet=status.wallet||{status:'none'};const sub=(status.subscriptions||[])[0];const state=sub?.status||status.status?.subscription_status||'none';
    if(status.appEntitlement?.tier&&getState().entitlement!==status.appEntitlement.tier){update({entitlement:status.appEntitlement.tier});return;}
    summary.textContent=`Wallet: ${wallet.status}. Subscription: ${state}.`;
    if(!sub){details.innerHTML=`<p class="muted">No active subscription. <a href="#/premium">Choose a Game Arena+ plan</a>.</p>`;}
    else{
      const paidThrough=sub.current_period_end||status.appEntitlement?.expiresAt;const next=sub.next_due_at||status.status?.next_due_at;
      details.innerHTML=`<div class="split"><div><b>Plan</b><p>${escapeHtml(sub.plan_code||'Premium')} · ${money(sub.amount_minor)}</p></div><div><b>Status</b><p>${escapeHtml(state.replaceAll('_',' '))}</p></div><div><b>Paid/trial access through</b><p>${fmt(paidThrough)}</p></div><div><b>Next due</b><p>${fmt(next)}</p></div></div><div class="hero-actions">${!['canceled','expired','payment_failed'].includes(state)?'<button class="button secondary" id="cancel-subscription" type="button">Cancel subscription</button>':''}${wallet.status==='linked'?'<button class="button danger" id="unlink-wallet" type="button">Unlink JazzCash wallet</button>':''}</div><p class="muted">Cancel stops this subscription but keeps the wallet linked. Unlink removes the wallet and stops all future debits. Already-paid access remains available until its period ends.</p>`;
      root.querySelector('#cancel-subscription')?.addEventListener('click',async()=>{if(!confirm('Cancel future renewal for this Game Arena+ subscription?'))return;try{await cancelBillingSubscription(sub.id);toast('Subscription canceled. Paid-period access is retained.');await bindBillingPanel();}catch(error){toast(error.message);}});
      root.querySelector('#unlink-wallet')?.addEventListener('click',async()=>{if(!confirm('Unlink JazzCash wallet and stop all future automatic debits?'))return;try{await unlinkBillingWallet();toast('JazzCash wallet unlinked.');await bindBillingPanel();}catch(error){toast(error.message);}});
    }
    const payments=await fetchBillingPayments();const rows=Array.isArray(payments)?payments:[];
    history.innerHTML=`<h3>Payment history</h3>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Type</th></tr></thead><tbody>${rows.slice(0,10).map(item=>`<tr><td>${fmt(item.created_at)}</td><td>${money(item.amount_minor)}</td><td>${escapeHtml(item.status||'')}</td><td>${escapeHtml(item.charge_kind||'')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No payment history yet.</p>'}`;
  }catch(error){summary.textContent=error.status===503?'Billing is not configured on this environment yet.':error.message;details.innerHTML='';history.innerHTML='';}
}
