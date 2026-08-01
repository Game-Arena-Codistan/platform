import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {loadConfig} from '../src/config.mjs';
import {MemoryStore} from '../src/adapters/memory-store.mjs';
import {PaymentService} from '../src/services/payments.mjs';
import {createSupplementalApp} from '../src/admin-app.mjs';

async function fixture(){
  const config=loadConfig({nodeEnv:'test',adminPrincipals:[{id:'finance-user',key:'finance-report-key-12345',roles:['finance']},{id:'support-user',key:'support-report-key-12345',roles:['support']}],publicOrigin:'http://localhost',allowedOrigins:['http://localhost']});
  const store=new MemoryStore();
  const provider={async createCheckout({transactionId,amountPkr}){return{providerReference:`JC-${transactionId}`,expected:{merchantId:'merchant',billReference:transactionId,amountMinor:amountPkr*100,currency:'PKR'},checkout:{method:'POST',fields:{pp_Password:'secret-password',pp_SecureHash:'secret-hash'}}};}};
  const payments=new PaymentService({store,provider});
  const user=store.findOrCreateUser({type:'phone',value:'03009998888'});
  await payments.checkout({userId:user.id,planId:'monthly',idempotencyKey:'admin-safe'});
  const server=createServer(createSupplementalApp({config,store}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return{base:`http://127.0.0.1:${server.address().port}`,store,user,close:()=>new Promise(resolve=>server.close(resolve))};
}

test('admin payment DTO excludes hosted checkout credentials',async()=>{
  const f=await fixture();
  try{
    const response=await fetch(`${f.base}/v1/admin/payments?from=2026-01-01&to=2026-12-31`,{headers:{'x-admin-key':'finance-report-key-12345'}});
    assert.equal(response.status,200);
    const raw=await response.text();
    assert.equal(raw.includes('pp_Password'),false);
    assert.equal(raw.includes('secret-password'),false);
    const body=JSON.parse(raw);
    assert.equal(body.transactions.length,1);
    assert.equal(body.transactions[0].providerReference.startsWith('JC-'),true);
  }finally{await f.close();}
});

test('report viewing and export are separately authorized',async()=>{
  const f=await fixture();
  try{
    let response=await fetch(`${f.base}/v1/admin/reports/payments?from=2026-01-01&to=2026-12-31`,{headers:{'x-admin-key':'support-report-key-12345'}});
    assert.equal(response.status,200);
    response=await fetch(`${f.base}/v1/admin/reports/exports/payments?from=2026-01-01&to=2026-12-31`,{headers:{'x-admin-key':'support-report-key-12345'}});
    assert.equal(response.status,403);
    response=await fetch(`${f.base}/v1/admin/reports/exports/payments?from=2026-01-01&to=2026-12-31`,{headers:{'x-admin-key':'finance-report-key-12345'}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/^text\/csv/);
    assert.match(response.headers.get('content-disposition'),/game-arena-payments/);
  }finally{await f.close();}
});

test('oversized exports fail closed with narrowing instructions',async()=>{
  const f=await fixture();
  try{
    for(let index=0;index<10000;index++)f.store.createTransaction({id:randomUUID(),userId:f.user.id,kind:'membership',purpose:'activation',planId:'monthly',amountPkr:299,currency:'PKR',status:'pending',providerStatus:'pending',createdAt:'2026-06-01T00:00:00.000Z',updatedAt:'2026-06-01T00:00:00.000Z'});
    const response=await fetch(`${f.base}/v1/admin/reports/exports/payments?from=2026-01-01&to=2026-12-31`,{headers:{'x-admin-key':'finance-report-key-12345'}});
    assert.equal(response.status,413);
    const body=await response.json();
    assert.equal(body.error.code,'report_export_too_large');
    assert.match(body.error.message,/Narrow the date range or filters/);
  }finally{await f.close();}
});
