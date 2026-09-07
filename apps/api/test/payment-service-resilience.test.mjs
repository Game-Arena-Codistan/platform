import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {MemoryStore} from '../src/adapters/memory-store.mjs';
import {PaymentServiceClient,loadPaymentServiceSettings} from '../src/adapters/payment-service-client.mjs';
import {createPaymentServiceApp} from '../src/payment-service-app.mjs';
import {hmac,sha256} from '../src/lib/security.mjs';

const userId='11111111-1111-4111-8111-111111111111';
const eventId='33333333-3333-4333-8333-333333333333';
const subscriptionId='22222222-2222-4222-8222-222222222222';

function sessionStore(){
  const store=new MemoryStore();const user={id:userId,displayName:'Player',status:'active'};store.users.set(user.id,user);store.setEntitlement(user.id,{tier:'free',status:'active',sourceType:'system',startsAt:Date.now()});
  const token='session-token';const csrf='csrf-token';store.createSession({id:'session',hash:sha256(token),csrfHash:sha256(csrf),userId:user.id,deviceHash:'device',ipHash:'ip',createdAt:Date.now(),lastSeenAt:Date.now(),rotatedAt:Date.now(),expiresAt:Date.now()+86400000,revokedAt:null});
  return{store,token,csrf};
}

async function appFixture(fetchImpl){
  const {store,token,csrf}=sessionStore();const config={sessionCookieName:'ga_session',csrfCookieName:'ga_csrf',allowedOrigins:['http://localhost'],publicOrigin:'http://localhost'};const settings={mode:'external',baseUrl:'https://payments.example',apiKey:'server-only-key',webhookSecret:'webhook-secret',appReturnUrl:'http://localhost/#/premium',timeoutMs:1000};
  const handler=createPaymentServiceApp({config,store,fetchImpl,settings});const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return{base:`http://127.0.0.1:${server.address().port}`,store,headers:{'content-type':'application/json',cookie:`ga_session=${token}; ga_csrf=${csrf}`,'x-csrf-token':csrf,origin:'http://localhost'},close:()=>new Promise(resolve=>server.close(resolve))};
}

test('external mode fails closed on missing secrets, insecure remote URL or cross-origin return URL',()=>{
  assert.throws(()=>loadPaymentServiceSettings({env:{PAYMENT_SERVICE_MODE:'external'},publicOrigin:'https://game.example'}),/required/);
  assert.throws(()=>loadPaymentServiceSettings({env:{PAYMENT_SERVICE_MODE:'external',PAYMENT_SERVICE_URL:'http://payments.example',PAYMENT_SERVICE_API_KEY:'key',PAYMENT_SERVICE_WEBHOOK_SECRET:'secret'},publicOrigin:'https://game.example'}),/HTTPS/);
  assert.throws(()=>loadPaymentServiceSettings({env:{PAYMENT_SERVICE_MODE:'external',PAYMENT_SERVICE_URL:'https://payments.example',PAYMENT_SERVICE_API_KEY:'key',PAYMENT_SERVICE_WEBHOOK_SECRET:'secret',PAYMENT_SERVICE_APP_RETURN_URL:'https://evil.example/return'},publicOrigin:'https://game.example'}),/PUBLIC_ORIGIN/);
});

test('payment-service client maps malformed upstream responses and bounded timeouts safely',async()=>{
  const malformed=new PaymentServiceClient({baseUrl:'https://payments.example',apiKey:'secret',timeoutMs:1000,fetchImpl:async()=>new Response('not-json',{status:200})});
  await assert.rejects(()=>malformed.plans(),error=>error.status===502&&error.code==='payment_service_invalid_response');
  const hanging=new PaymentServiceClient({baseUrl:'https://payments.example',apiKey:'secret',timeoutMs:1000,fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});})});
  await assert.rejects(()=>hanging.plans(),error=>error.status===504&&error.code==='payment_service_timeout');
});

test('webhook event header must match the signed body before any entitlement change',async()=>{
  const periodEnd=new Date(Date.now()+86400000).toISOString();const fetchImpl=async()=>Response.json({wallet:{status:'linked'},status:{subscription_status:'active',current_period_paid:true},subscriptions:[{id:subscriptionId,plan_code:'monthly',status:'active',current_period_end:periodEnd}],payments:[]});const f=await appFixture(fetchImpl);try{
    const event={eventId,type:'subscription.activated',userId,createdAt:new Date().toISOString(),data:{subscriptionId}};const raw=JSON.stringify(event);const response=await fetch(`${f.base}/v1/webhooks/payments`,{method:'POST',headers:{'content-type':'application/json','x-payment-event':'payment.completed','x-payment-signature':hmac('webhook-secret',raw)},body:raw});assert.equal(response.status,400);assert.equal(f.store.getEntitlement(userId).tier,'free');
  }finally{await f.close();}
});

test('recorded but unprocessed webhook delivery is retryable after temporary upstream failure',async()=>{
  let failStatus=true;const periodEnd=new Date(Date.now()+86400000).toISOString();const fetchImpl=async(url)=>{const path=new URL(url).pathname;if(path===`/v1/users/${userId}/status`){if(failStatus)return Response.json({error:'temporary',message:'Retry later'},{status:503});return Response.json({wallet:{status:'linked'},status:{subscription_status:'active',current_period_paid:true},subscriptions:[{id:subscriptionId,plan_code:'monthly',status:'active',current_period_end:periodEnd}],payments:[]});}return Response.json([]);};const f=await appFixture(fetchImpl);try{
    const event={eventId,type:'subscription.activated',userId,createdAt:new Date().toISOString(),data:{subscriptionId}};const raw=JSON.stringify(event);const headers={'content-type':'application/json','x-payment-event':event.type,'x-payment-signature':hmac('webhook-secret',raw)};
    let response=await fetch(`${f.base}/v1/webhooks/payments`,{method:'POST',headers,body:raw});assert.equal(response.status,503);assert.equal(f.store.paymentEvents.get(eventId)?.processedAt,null);assert.equal(f.store.getEntitlement(userId).tier,'free');
    failStatus=false;response=await fetch(`${f.base}/v1/webhooks/payments`,{method:'POST',headers,body:raw});assert.equal(response.status,202);const body=await response.json();assert.equal(body.duplicate,true);assert.ok(f.store.paymentEvents.get(eventId)?.processedAt);assert.equal(f.store.getEntitlement(userId).tier,'premium');
  }finally{await f.close();}
});

test('past-due and payment-failed states never invent access beyond an already-paid period',async()=>{
  let state='active';let paid=true;const periodEnd=new Date(Date.now()+86400000).toISOString();const fetchImpl=async(url)=>{const path=new URL(url).pathname;if(path===`/v1/users/${userId}/status`)return Response.json({wallet:{status:'linked'},status:{subscription_status:state,current_period_paid:paid},subscriptions:[{id:subscriptionId,plan_code:'monthly',status:state,current_period_end:periodEnd}],payments:[]});return Response.json([]);};const f=await appFixture(fetchImpl);try{
    let response=await fetch(`${f.base}/v1/billing/status`,{headers:{cookie:f.headers.cookie}});assert.equal((await response.json()).appEntitlement.tier,'premium');
    state='past_due';paid=true;response=await fetch(`${f.base}/v1/billing/status`,{headers:{cookie:f.headers.cookie}});let body=await response.json();assert.equal(body.appEntitlement.tier,'premium');assert.equal(body.appEntitlement.autoRenew,false);
    state='payment_failed';paid=false;response=await fetch(`${f.base}/v1/billing/status`,{headers:{cookie:f.headers.cookie}});body=await response.json();assert.equal(body.appEntitlement.tier,'premium');assert.equal(body.appEntitlement.autoRenew,false);
  }finally{await f.close();}
});
