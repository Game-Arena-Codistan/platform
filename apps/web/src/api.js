const config={mode:'mock',apiBaseUrl:'',gameOrigin:'',...(window.GAME_ARENA_CONFIG||{})};
const wait=(ms=450)=>new Promise(resolve=>setTimeout(resolve,ms));

async function request(path,options={}){
  const response=await fetch(`${config.apiBaseUrl}${path}`,{
    credentials:'include',
    headers:{'content-type':'application/json',...(options.headers||{})},
    ...options
  });
  if(!response.ok)throw new Error(`Request failed: ${response.status}`);
  return response.status===204?null:response.json();
}

export async function requestOtp(identifier){
  if(config.mode==='live')return request('/v1/auth/otp',{method:'POST',body:JSON.stringify({identifier})});
  await wait();return{challengeId:crypto.randomUUID(),expiresIn:300,resendIn:30};
}

export async function verifyOtp(challengeId,code){
  if(config.mode==='live')return request('/v1/auth/otp/verify',{method:'POST',body:JSON.stringify({challengeId,code})});
  await wait();if(code!=='123456')throw new Error('Invalid code. Use 123456 in demo mode.');
  return{user:{id:'demo-user',displayName:'Player One'},entitlement:'free',coins:120};
}

export async function createCheckout(planId){
  if(config.mode==='live')return request('/v1/payments/jazzcash/checkout',{method:'POST',body:JSON.stringify({planId})});
  await wait();return{transactionId:crypto.randomUUID(),status:'pending',provider:'JazzCash'};
}

export async function refreshEntitlement(transactionId){
  if(config.mode==='live')return request(`/v1/entitlements/me?transactionId=${encodeURIComponent(transactionId)}`);
  await wait(700);return{entitlement:'premium',status:'active'};
}

export function gameUrl(game){
  if(!config.gameOrigin)return '';
  return `${config.gameOrigin.replace(/\/$/,'')}/${encodeURIComponent(game.id)}/index.html`;
}

export function mode(){return config.mode;}
