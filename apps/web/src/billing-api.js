const config={mode:'mock',apiBaseUrl:'',...(window.GAME_ARENA_CONFIG||{})};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function cookie(name){return document.cookie.split(';').map(item=>item.trim()).find(item=>item.startsWith(`${name}=`))?.slice(name.length+1)||'';}
async function request(path,options={}){
  const method=options.method||'GET';const headers={'content-type':'application/json',...(options.headers||{})};
  if(!['GET','HEAD','OPTIONS'].includes(method))headers['x-csrf-token']=decodeURIComponent(cookie('ga_csrf'));
  const response=await fetch(`${config.apiBaseUrl}${path}`,{credentials:'include',...options,headers});
  const raw=response.status===204?null:await response.text();
  let data=null;
  if(raw){
    try{data=JSON.parse(raw);}
    catch{
      const error=new Error(response.ok?'Billing API returned a non-JSON response. Is the API running?':`Billing request failed: ${response.status}`);
      error.status=response.status;
      throw error;
    }
  }
  if(!response.ok){const error=new Error(data?.error?.message||data?.message||`Billing request failed: ${response.status}`);error.code=data?.error?.code||data?.error;error.status=response.status;error.details=data?.error?.details;throw error;}
  return data;
}
function maskMsisdn(value){
  const digits=String(value||'').replace(/\D/g,'');
  if(digits.length<4)return'****';
  return`${'*'.repeat(Math.max(0,digits.length-4))}${digits.slice(-4)}`;
}
export const fetchBillingPlans=()=>config.mode==='live'?request('/v1/billing/plans'):Promise.resolve({enabled:true,plans:[{code:'monthly',fullAmountMinor:59900,interval:'month',recommended:true},{code:'yearly',fullAmountMinor:499900,interval:'year',comingSoon:true,status:'coming_soon'}]});
export async function linkBillingWallet({msisdn,planCode,consentToAutoPay=true,returnPath,attribution}){
  if(config.mode!=='live'){
    await wait(500);
    return{mock:true,method:'mock',transactionId:crypto.randomUUID(),msisdn,planCode,returnPath,attribution,consentToAutoPay};
  }
  return request('/v1/billing/wallets/link',{method:'POST',body:JSON.stringify({msisdn,planCode,consentToAutoPay,consent:consentToAutoPay,returnPath,attribution})});
}
export const fetchBillingWallet=()=>request('/v1/billing/wallets');
export const unlinkBillingWallet=()=>request('/v1/billing/wallets/unlink',{method:'POST'});
export const fetchBillingStatus=()=>request('/v1/billing/status');
export const createBillingSubscription=({planCode,skipTrial=false})=>request('/v1/billing/subscriptions',{method:'POST',body:JSON.stringify({planCode,skipTrial})});
export const cancelBillingSubscription=id=>request(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`,{method:'POST'});
export async function lookupUnsubscribe(msisdn){
  if(config.mode!=='live'){
    await wait(250);
    return{hasActiveSubscription:false,msisdnMasked:maskMsisdn(msisdn),planCode:null,plansPath:'/#/library'};
  }
  return request('/v1/billing/unsubscribe/lookup',{method:'POST',body:JSON.stringify({msisdn})});
}
export async function unsubscribeByMsisdn({msisdn,confirm=true}){
  if(config.mode!=='live'){
    await wait(250);
    const error=new Error("You don't have any active subscription.");
    error.code='no_active_subscription';
    error.status=404;
    throw error;
  }
  return request('/v1/billing/unsubscribe',{method:'POST',body:JSON.stringify({msisdn,confirm})});
}
export const fetchBillingPayments=()=>request('/v1/billing/payments');
export const fetchBillingPayment=id=>request(`/v1/billing/payments/${encodeURIComponent(id)}`);
export function submitWalletPortal(result){
  const portalUrl=result?.portalUrl||result?.actionUrl;
  if(!portalUrl||String(result.method||'POST').toUpperCase()!=='POST'||!result.fields)return false;
  const form=document.createElement('form');form.method='POST';form.action=portalUrl;form.hidden=true;
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
