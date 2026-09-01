import test from 'node:test';
import assert from 'node:assert/strict';
import {BrevoOtpProvider,OtpDeliveryRouter,SyntheticQaOtpProvider} from '../src/adapters/otp-delivery.mjs';

function response(body={messageId:'message-1'},status=201){
  return{ok:status>=200&&status<300,status,json:async()=>body};
}

test('Brevo email OTP uses api-key authentication and transactional email payload',async()=>{
  const calls=[];
  const provider=new BrevoOtpProvider({
    apiKey:'test-api-key',
    senderEmail:'qa@example.com',
    senderName:'Game Arena QA',
    smsSender:'GameArena',
    fetchImpl:async(url,options)=>{calls.push({url,options});return response({messageId:'email-123'});}
  });
  const result=await provider.send({identity:{type:'email',value:'player@example.com'},code:'123456'});
  assert.equal(result.provider,'brevo');
  assert.equal(result.channel,'email');
  assert.equal(result.messageId,'email-123');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].options.headers['api-key'],'test-api-key');
  assert.equal(calls[0].options.headers.authorization,undefined);
  const payload=JSON.parse(calls[0].options.body);
  assert.deepEqual(payload.sender,{email:'qa@example.com',name:'Game Arena QA'});
  assert.deepEqual(payload.to,[{email:'player@example.com'}]);
  assert.match(payload.textContent,/123456/);
});

test('Brevo phone OTP uses transactional SMS payload',async()=>{
  const calls=[];
  const provider=new BrevoOtpProvider({
    apiKey:'test-api-key',
    senderEmail:'qa@example.com',
    senderName:'Game Arena QA',
    smsSender:'GameArena',
    fetchImpl:async(url,options)=>{calls.push({url,options});return response({messageId:1511882900176220});}
  });
  const result=await provider.send({identity:{type:'phone',value:'+923001234567'},code:'654321'});
  assert.equal(result.provider,'brevo');
  assert.equal(result.channel,'phone');
  assert.equal(result.messageId,'1511882900176220');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.brevo.com/v3/transactionalSMS/send');
  assert.equal(calls[0].options.headers['api-key'],'test-api-key');
  const payload=JSON.parse(calls[0].options.body);
  assert.equal(payload.sender,'GameArena');
  assert.equal(payload.recipient,'+923001234567');
  assert.equal(payload.type,'transactional');
  assert.match(payload.content,/654321/);
});

test('Brevo email OTP fails closed without a sender email',async()=>{
  const provider=new BrevoOtpProvider({apiKey:'test-api-key',smsSender:'GameArena',fetchImpl:async()=>response()});
  await assert.rejects(()=>provider.send({identity:{type:'email',value:'player@example.com'},code:'123456'}),error=>error.code==='delivery_unavailable');
});

test('Brevo phone OTP fails closed without an SMS sender',async()=>{
  const provider=new BrevoOtpProvider({apiKey:'test-api-key',senderEmail:'qa@example.com',fetchImpl:async()=>response()});
  await assert.rejects(()=>provider.send({identity:{type:'phone',value:'+923001234567'},code:'123456'}),error=>error.code==='delivery_unavailable');
});

test('synthetic QA OTP routing avoids external delivery but real QA identities fall through',async()=>{
  const externalCalls=[];
  const external={name:'external',async send({identity}){externalCalls.push(identity.value);return{provider:'external',messageId:'real-1',channel:identity.type,accepted:true};}};
  const router=new OtpDeliveryRouter({providers:[new SyntheticQaOtpProvider({enabled:true}),external]});
  const synthetic=await router.send({identity:{type:'email',value:'game.arena+qa-auto-run-abc123@codistan.org'},code:'123456'});
  assert.equal(synthetic.provider,'synthetic-qa');
  assert.deepEqual(externalCalls,[]);
  const protectedResult=await router.send({identity:{type:'email',value:'game.arena+qa-free@codistan.org'},code:'654321'});
  assert.equal(protectedResult.provider,'external');
  assert.deepEqual(externalCalls,['game.arena+qa-free@codistan.org']);
});
