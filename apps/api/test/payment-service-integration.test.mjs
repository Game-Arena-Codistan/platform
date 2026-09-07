import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {MemoryStore} from '../src/adapters/memory-store.mjs';
import {createPaymentServiceApp} from '../src/payment-service-app.mjs';
import {hmac,sha256} from '../src/lib/security.mjs';

function fakePaymentService(){
  const calls=[];const userId='11111111-1111-4111-8111-111111111111';
  const state={wallet:{status:'none'},alreadySubscribed:false,status:{wallet_linked:false,subscription_status:null,current_period_paid:false},subscriptions:[],payments:[]};
  const plans=[{code:'monthly',interval:'monthly',fullAmountMinor:59900,stepAmountMinor:24900,trialHours:24,currency:'PKR'},{code:'yearly',interval:'yearly',fullAmountMinor:499900,stepAmountMinor:199900,trialHours:24,currency:'PKR'}];
  const fetchImpl=async(url,options={})=>{
    const path=new URL(url).pathname;const body=options.body?JSON.parse(options.body):null;calls.push({path,method:options.method||'GET',body,apiKey:options.headers?.['x-api-key']});
    if(path==='/v1/plans')return Response.json(plans);
    if(path==='/v1/wallets/link'){if(state.wallet.status==='linked')return Response.json({error:'already_linked',message:'Wallet already linked'},{status:409});state.wallet={status:'pending'};return Response.json({requestId:'R1',portalUrl:'https://jazzcash.example/link',method:'POST',fields:{pp_RequestID:'R1',pp_MSISDN:body.msisdn}},{status:201});}
    if(path===`/v1/wallets/${userId}`)return Response.json(state.wallet);
    if(path==='/v1/wallets/unlink'){state.wallet={status:'unlinked'};state.subscriptions=state.subscriptions.map(item=>({...item,status:'canceled'}));state.status={...state.status,wallet_linked:false,subscription_status:'canceled'};return Response.json({status:'unlinked'});}
    if(path===`/v1/users/${userId}/status`)return Response.json(state);
    if(path==='/v1/subscriptions'){if(state.subscriptions.some(item=>['initiated','trialing','active','past_due','paused'].includes(item.status)))return Response.json({error:'already_subscribed',message:'Already subscribed'},{status:409});const sub={id:'22222222-2222-4222-8222-222222222222',plan_code:body.planCode,status:'trialing',trial_ends_at:new Date(Date.now()+86400000).toISOString(),amount_minor:59900,currency:'PKR'};state.wallet={status:'linked'};state.subscriptions=[sub];state.alreadySubscribed=true;state.status={wallet_linked:true,subscription_status:'trialing',current_period_paid:false};return Response.json(sub,{status:201});}
    if(/^\/v1\/subscriptions\/.+\/cancel$/.test(path)){state.subscriptions=state.subscriptions.map(item=>({...item,status:'canceled'}));state.status={...state.status,subscription_status:'canceled'};return Response.json({status:'canceled'});}
    if(path===`/v1/users/${userId}/payments`)return Response.json(state.payments);
    const payment=path.match(/^\/v1\/payments\/(.+)$/);if(payment){const found=state.payments.find(item=>item.id===payment[1]);return found?Response.json(found):Response.json({error:'not_found',message:'Payment not found'},{status:404});}
    return Response.json({error:'not_found',message:'Unknown fake route'},{status:404});
  };
  return{calls,state,plans,userId,fetchImpl};
}

async function fixture(){
  const upstream=fakePaymentService();const store=new MemoryStore();const user={id:upstream.userId,displayName:'Player',status:'active'};store.users.set(user.id,user);store.setEntitlement(user.id,{tier:'free',status:'active',sourceType:'system',startsAt:Date.now()});
  const token='session-token';const csrf='csrf-token';store.createSession({id:'session',hash:sha256(token),csrfHash:sha256(csrf),userId:user.id,deviceHash:'device',ipHash:'ip',createdAt:Date.now(),lastSeenAt:Date.now(),rotatedAt:Date.now(),expiresAt:Date.now()+86400000,revokedAt:null});
  const config={sessionCookieName:'ga_session',csrfCookieName:'ga_csrf',allowedOrigins:['http://localhost'],publicOrigin:'http://localhost'};
  const settings={mode:'external',baseUrl:'https://payments.example',apiKey:'server-only-key',webhookSecret:'webhook-secret',appReturnUrl:'http://localhost/#/premium',timeoutMs:2000};
  const handler=createPaymentServiceApp({config,store,fetchImpl:upstream.fetchImpl,settings});const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;const authHeaders={'content-type':'application/json',cookie:`ga_session=${token}; ga_csrf=${csrf}`,'x-csrf-token':csrf,origin:'http://localhost'};
  return{base,store,upstream,authHeaders,close:()=>new Promise(resolve=>server.close(resolve))};
}

test('billing BFF rejects anonymous mutation and maps authenticated user server-side',async()=>{const f=await fixture();try{
  let response=await fetch(`${f.base}/v1/billing/wallets/link`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'attacker',msisdn:'03001234567',planCode:'monthly',amountMinor:1})});assert.equal(response.status,401);
  response=await fetch(`${f.base}/v1/billing/wallets/link`,{method:'POST',headers:f.authHeaders,body:JSON.stringify({userId:'attacker',msisdn:'03001234567',planCode:'monthly',amountMinor:1})});assert.equal(response.status,201);
  const call=f.upstream.calls.find(item=>item.path==='/v1/wallets/link');assert.equal(call.body.userId,f.upstream.userId);assert.equal(call.body.amountMinor,undefined);assert.equal(call.apiKey,'server-only-key');
}finally{await f.close();}});

test('authoritative trial and paid states drive application entitlement',async()=>{const f=await fixture();try{
  const trialEnd=new Date(Date.now()+3600000).toISOString();f.upstream.state.wallet={status:'linked'};f.upstream.state.subscriptions=[{id:'22222222-2222-4222-8222-222222222222',plan_code:'monthly',status:'trialing',trial_ends_at:trialEnd,amount_minor:59900}];f.upstream.state.status={wallet_linked:true,subscription_status:'trialing',current_period_paid:false};
  let response=await fetch(`${f.base}/v1/billing/status`,{headers:{cookie:f.authHeaders.cookie}});let body=await response.json();assert.equal(response.status,200);assert.equal(body.appEntitlement.tier,'premium');assert.equal(body.appEntitlement.origin,'trial');
  const periodEnd=new Date(Date.now()+30*86400000).toISOString();f.upstream.state.subscriptions=[{...f.upstream.state.subscriptions[0],status:'active',trial_ends_at:null,current_period_end:periodEnd}];f.upstream.state.status={wallet_linked:true,subscription_status:'active',current_period_paid:true,next_due_at:periodEnd};
  response=await fetch(`${f.base}/v1/billing/status`,{headers:{cookie:f.authHeaders.cookie}});body=await response.json();assert.equal(body.appEntitlement.tier,'premium');assert.equal(body.appEntitlement.origin,'paid');assert.equal(body.appEntitlement.autoRenew,true);
}finally{await f.close();}});

test('signed webhook is idempotent and authoritative reconciliation activates access',async()=>{const f=await fixture();try{
  const periodEnd=new Date(Date.now()+30*86400000).toISOString();f.upstream.state.wallet={status:'linked'};f.upstream.state.subscriptions=[{id:'22222222-2222-4222-8222-222222222222',plan_code:'monthly',status:'active',current_period_end:periodEnd,amount_minor:59900}];f.upstream.state.status={wallet_linked:true,subscription_status:'active',current_period_paid:true,next_due_at:periodEnd};
  const event={eventId:'33333333-3333-4333-8333-333333333333',type:'subscription.activated',userId:f.upstream.userId,createdAt:new Date().toISOString(),data:{subscriptionId:'22222222-2222-4222-8222-222222222222'}};const raw=JSON.stringify(event);
  let response=await fetch(`${f.base}/v1/webhooks/payments`,{method:'POST',headers:{'content-type':'application/json','x-payment-event':event.type,'x-payment-signature':'bad'},body:raw});assert.equal(response.status,401);assert.equal(f.store.getEntitlement(f.upstream.userId).tier,'free');
  const signature=hmac('webhook-secret',raw);response=await fetch(`${f.base}/v1/webhooks/payments`,{method:'POST',headers:{'content-type':'application/json','x-payment-event':event.type,'x-payment-signature':signature},body:raw});assert.equal(response.status,202);assert.equal(f.store.getEntitlement(f.upstream.userId).tier,'premium');
  response=await fetch(`${f.base}/v1/webhooks/payments`,{method:'POST',headers:{'content-type':'application/json','x-payment-event':event.type,'x-payment-signature':signature},body:raw});assert.equal((await response.json()).duplicate,true);
}finally{await f.close();}});

test('cancel and unlink retain already-paid period but stop automatic renewal',async()=>{const f=await fixture();try{
  const periodEnd=new Date(Date.now()+30*86400000).toISOString();f.upstream.state.wallet={status:'linked'};f.upstream.state.subscriptions=[{id:'22222222-2222-4222-8222-222222222222',plan_code:'monthly',status:'active',current_period_end:periodEnd,amount_minor:59900}];f.upstream.state.status={wallet_linked:true,subscription_status:'active',current_period_paid:true,next_due_at:periodEnd};
  await fetch(`${f.base}/v1/billing/status`,{headers:{cookie:f.authHeaders.cookie}});
  let response=await fetch(`${f.base}/v1/billing/subscriptions/22222222-2222-4222-8222-222222222222/cancel`,{method:'POST',headers:f.authHeaders});assert.equal(response.status,200);let entitlement=f.store.getEntitlement(f.upstream.userId);assert.equal(entitlement.tier,'premium');assert.equal(entitlement.autoRenew,false);
  response=await fetch(`${f.base}/v1/billing/wallets/unlink`,{method:'POST',headers:f.authHeaders});assert.equal(response.status,200);entitlement=f.store.getEntitlement(f.upstream.userId);assert.equal(entitlement.tier,'premium');assert.equal(entitlement.autoRenew,false);
}finally{await f.close();}});
