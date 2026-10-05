import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {loadConfig} from '../src/config.mjs';
import {createApp} from '../src/app.mjs';
import {createJazzCashRecurringApp} from '../src/jazzcash-recurring-app.mjs';
import {JazzCashOrchestratorAdapter,jazzCashSecureHash} from '../src/adapters/jazzcash-orchestrator.mjs';
import {MemoryStore} from '../src/adapters/memory-store.mjs';
import {JazzCashAdapter} from '../src/adapters/jazzcash.mjs';
import {PaymentService} from '../src/services/payments.mjs';
import {MockOtpProvider,OtpDeliveryRouter} from '../src/adapters/otp-delivery.mjs';

function headers(cookie,csrf='demo-csrf'){
  return{'content-type':'application/json',cookie,...(csrf?{'x-csrf-token':csrf}:{})};
}

async function signIn(base){
  const otp=await fetch(`${base}/v1/auth/otp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'03009998877'})});
  const challenge=await otp.json();
  const verify=await fetch(`${base}/v1/auth/otp/verify`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({challengeId:challenge.challengeId,code:challenge.debugCode||'123456'})});
  const body=await verify.json();
  const cookie=verify.headers.getSetCookie?.().map(line=>line.split(';')[0]).join('; ')||'';
  return{cookie,csrf:body.csrfToken||'demo-csrf'};
}

test('jazzCashSecureHash uses ASCII sort and excludes empty pp_ fields',()=>{
  const salt='test-salt';
  const hash=jazzCashSecureHash({pp_MerchantID:'MC1',pp_Password:'pw',pp_MSISDN:'03001234567',pp_RequestID:'Req1',pp_ReturnURL:'https://example.test/callback',pp_SecureHash:'IGNORED'},salt);
  assert.match(hash,/^[0-9A-F]{64}$/);
  const reordered=jazzCashSecureHash({pp_ReturnURL:'https://example.test/callback',pp_RequestID:'Req1',pp_MSISDN:'03001234567',pp_Password:'pw',pp_MerchantID:'MC1'},salt);
  assert.equal(hash,reordered);
});

test('orchestrator billing BFF starts LinkWallet and completes callback with pay-via-token',async()=>{
  const store=new MemoryStore();
  const config=loadConfig({nodeEnv:'test',port:1,publicOrigin:'http://localhost:8080',allowedOrigins:['http://localhost:8080'],allowDebugOtp:true,jazzcashMode:'orchestrator',jazzcashMerchantId:'MC990983',jazzcashPassword:'pw',jazzcashIntegritySalt:'salt',jazzcashReturnUrl:'http://localhost:8080/callback',jazzcashWebhookSecret:'test-secret'});
  const fetchImpl=async(url)=>{
    if(String(url).includes('/payments/m-wallet'))return{ok:true,json:async()=>({pp_ResponseCode:'000',pp_ResponseMessage:'Success',pp_TxnRefNo:'GA123'})};
    throw new Error(`unexpected fetch ${url}`);
  };
  const orchestrator=new JazzCashOrchestratorAdapter(config,{fetchImpl});
  const jazzcash=new JazzCashAdapter({...config,jazzcashMode:'mock'});
  const recurring=createJazzCashRecurringApp({config,store,orchestrator});
  const primary=createApp({config,store,jazzcash,otpDelivery:new OtpDeliveryRouter({providers:[new MockOtpProvider()],audit:store.audit,metrics:store.metrics}),payments:new PaymentService({store,provider:jazzcash})});
  const server=createServer(async(req,res)=>{if(await recurring(req,res)!==false)return;await primary(req,res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const auth=await signIn(base);
    let response=await fetch(`${base}/v1/billing/wallets/link`,{method:'POST',headers:headers(auth.cookie,auth.csrf),body:JSON.stringify({msisdn:'03001234567',planCode:'monthly'})});
    assert.equal(response.status,201);
    const link=await response.json();
    assert.ok(link.actionUrl.includes('LinkWallet'));
    assert.ok(link.fields.pp_SecureHash);
    const returnFields={pp_ResponseCode:'000',pp_ResponseMessage:'Success',pp_PaymentToken:'token-abc',pp_RequestID:link.requestId,pp_MerchantID:'MC990983',pp_MSISDN:'03001234567'};
    returnFields.pp_SecureHash=jazzCashSecureHash(returnFields,'salt');
    response=await fetch(`${base}/v1/jazzcash/wallet/callback`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(returnFields).toString(),redirect:'manual'});
    assert.equal(response.status,303);
    response=await fetch(`${base}/v1/billing/status`,{headers:{cookie:auth.cookie}});
    const status=await response.json();
    assert.equal(status.wallet.status,'linked');
    assert.equal(status.appEntitlement.tier,'premium');
  }finally{await new Promise(resolve=>server.close(resolve));}
});
