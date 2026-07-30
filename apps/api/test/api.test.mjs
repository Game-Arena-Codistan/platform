import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApp} from '../src/app.mjs';
import {loadConfig} from '../src/config.mjs';
import {MemoryStore} from '../src/adapters/memory-store.mjs';
import {JazzCashAdapter} from '../src/adapters/jazzcash.mjs';
import {catalogue,quarantinedCatalogue} from '../src/catalogue/index.mjs';

async function fixture(){
  const config=loadConfig({nodeEnv:'test',port:1,publicOrigin:'http://localhost',allowDebugOtp:true,jazzcashMode:'mock',jazzcashWebhookSecret:'test-secret'});
  const store=new MemoryStore();
  const server=createServer(createApp({config,store,jazzcash:new JazzCashAdapter(config)}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return{base:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
async function signIn(base){
  let response=await fetch(`${base}/v1/auth/otp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'03001234567'})});
  const challenge=await response.json();assert.equal(response.status,202);
  response=await fetch(`${base}/v1/auth/otp/verify`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({challengeId:challenge.challengeId,code:challenge.debugCode})});
  assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
}
test('catalogue import separates live and quarantined games',()=>{assert.equal(catalogue.length,44);assert.equal(quarantinedCatalogue.length,17);assert.ok(catalogue.every(game=>game.status==='live'&&game.gameUrl.startsWith('https://')));});
test('health and catalogue are public',async()=>{const f=await fixture();try{assert.equal((await fetch(`${f.base}/healthz`)).status,200);const data=await (await fetch(`${f.base}/v1/catalog/games`)).json();assert.equal(data.games.length,44);}finally{await f.close();}});
test('OTP creates a secure session',async()=>{const f=await fixture();try{const cookie=await signIn(f.base);const session=await (await fetch(`${f.base}/v1/session`,{headers:{cookie}})).json();assert.equal(session.authenticated,true);assert.equal(session.entitlement.tier,'free');}finally{await f.close();}});
test('rewards are server-authoritative and idempotent',async()=>{const f=await fixture();try{const cookie=await signIn(f.base);let response=await fetch(`${f.base}/v1/play-sessions`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({gameId:'crazy-runner'})});const play=await response.json();response=await fetch(`${f.base}/v1/play-sessions/${play.playSessionId}/complete`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({score:500,durationMs:45000})});const first=await response.json();assert.equal(first.reward,20);response=await fetch(`${f.base}/v1/play-sessions/${play.playSessionId}/complete`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({score:999,durationMs:50000})});const second=await response.json();assert.equal(second.balance,20);assert.equal(second.idempotent,true);}finally{await f.close();}});
test('checkout creation never grants premium',async()=>{const f=await fixture();try{const cookie=await signIn(f.base);const response=await fetch(`${f.base}/v1/payments/jazzcash/checkout`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({planId:'monthly'})});const checkout=await response.json();assert.equal(response.status,201);assert.match(checkout.redirectUrl,/payment-return/);const entitlement=await (await fetch(`${f.base}/v1/entitlements/me`,{headers:{cookie}})).json();assert.equal(entitlement.entitlement,'free');}finally{await f.close();}});
