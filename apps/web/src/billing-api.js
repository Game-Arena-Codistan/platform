const config={mode:'mock',apiBaseUrl:'',...(window.GAME_ARENA_CONFIG||{})};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function cookie(name){return document.cookie.split(';').map(item=>item.trim()).find(item=>item.startsWith(`${name}=`))?.slice(name.length+1)||'';}
async function request(path,options={}){
  const method=options.method||'GET';const headers={'content-type':'application/json',...(options.headers||{})};
  if(!['GET','HEAD','OPTIONS'].includes(method))headers['x-csrf-token']=decodeURIComponent(cookie('ga_csrf'));
  const response=await fetch(`${config.apiBaseUrl}${path}`,{credentials:'include',...options,headers});const data=response.status===204?null:await response.json().catch(()=>null);
  if(!response.ok){const error=new Error(data?.error?.message||data?.message||`Billing request failed: ${response.status}`);error.code=data?.error?.code||data?.error;error.status=response.status;error.details=data?.error?.details;throw error;}return data;
}
export const fetchBillingPlans=()=>request('/v1/billing/plans');
export const linkBillingWallet=({msisdn,planCode})=>request('/v1/billing/wallets/link',{method:'POST',body:JSON.stringify({msisdn,planCode})});
export const fetchBillingWallet=()=>request('/v1/billing/wallets');
export const unlinkBillingWallet=()=>request('/v1/billing/wallets/unlink',{method:'POST'});
export const fetchBillingStatus=()=>request('/v1/billing/status');
export const createBillingSubscription=({planCode,skipTrial=false})=>request('/v1/billing/subscriptions',{method:'POST',body:JSON.stringify({planCode,skipTrial})});
export const cancelBillingSubscription=id=>request(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`,{method:'POST'});
export const fetchBillingPayments=()=>request('/v1/billing/payments');
export const fetchBillingPayment=id=>request(`/v1/billing/payments/${encodeURIComponent(id)}`);
export function submitWalletPortal(result){
  if(!result?.portalUrl||String(result.method||'POST').toUpperCase()!=='POST'||!result.fields)return false;
  const form=document.createElement('form');form.method='POST';form.action=result.portalUrl;form.hidden=true;
  for(const [name,value] of Object.entries(result.fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(value);form.append(input);}
  document.body.append(form);form.submit();return true;
}
export async function pollBillingStatus({attempts=20,intervalMs=2500}={}){
  let delay=intervalMs;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      const result=await fetchBillingStatus();const state=result?.status?.subscription_status||result?.subscriptions?.[0]?.status||null;const wallet=result?.wallet?.status;
      if(wallet==='failed'||['payment_failed','expired'].includes(state))return result;
      if(wallet==='linked'&&['trialing','initiated','active','past_due','canceled'].includes(state))return result;
    }catch(error){if(error.status!==429)throw error;delay=Math.min(8000,Math.round(delay*1.5+Math.random()*350));}
    await wait(delay);
  }
  return fetchBillingStatus();
}
export function amountPkr(plan){return Number(plan?.fullAmountMinor||plan?.full_amount_minor||0)/100;}
