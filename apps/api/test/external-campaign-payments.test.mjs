import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MemoryStore} from '../src/adapters/memory-store.mjs';
import {saveExternalLink,bindWalletEvent,projectExternalPayment} from '../src/services/external-campaign-payments.mjs';
test('provider ledger and signed event IDs drive payment facts, with exact late subscription binding',async()=>{
  const store=new MemoryStore(),userId=randomUUID(),subscriptionId=randomUUID(),id=randomUUID(),requestId='R-fixture',when='2026-11-24T04:00:00.000Z';
  const row={id,subscription_id:subscriptionId,amount_minor:'99000',currency:'PKR',status:'completed',txn_ref_no:'T-fixture',created_at:when,charge_kind:'full'};
  const client={payments:async()=>[row],payment:async()=>row},status={subscriptions:[{id:subscriptionId,plan_code:'monthly'}]};
  const event={type:'payment.completed',userId,createdAt:when,data:{paymentId:id,subscriptionId}};
  saveExternalLink(store,{requestId,userId,attribution:{utm:'T',package:'1',parameter:'qa'},planCode:'monthly'});
  await projectExternalPayment({store,client,event,status});assert.equal(store.getTransaction(id).attribution,null);
  assert.equal(bindWalletEvent(store,{type:'wallet.linked',userId,data:{requestId:'wrong',subscriptionCreated:true,subscriptionId,planCode:'monthly'}}),false);
  assert.equal(bindWalletEvent(store,{type:'wallet.linked',userId,data:{requestId,subscriptionCreated:true,subscriptionId,planCode:'monthly'}}),true);
  await projectExternalPayment({store,client,event,status});assert.equal(store.transactions.size,1);assert.equal(store.getTransaction(id).attribution.utm,'T');assert.equal(store.getTransaction(id).amountPkr,990);
  row.status='refunded';await projectExternalPayment({store,client,event:{...event,type:'payment.refunded',createdAt:'2026-11-25T04:00:00.000Z',data:{paymentId:id}},status});
  await projectExternalPayment({store,client,event,status});assert.equal(store.getTransaction(id).status,'refunded');assert.equal(store.getTransaction(id).paidAt,when);
  await assert.rejects(()=>projectExternalPayment({store,client,event:{...event,userId:randomUUID()},status}),/Conflicting payment identity/);
});
