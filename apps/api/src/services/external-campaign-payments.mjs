// Authoritative contract: Codistan/digisphere/jazzcash-service, main a65ef5f88353624c051d03386cca1f9c9788cc1a;
// additive wallet request/payment relationship fields: provider draft MR !4.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ref=value=>typeof value==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(value)?value:null;
const fail=(message,code='payment_projection_unverified')=>Object.assign(new Error(message),{status:503,code});
const iso=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?new Date(n).toISOString():null;};
const paymentStates=new Set(['pending','completed','failed','expired','refunded']);
const plan=value=>typeof value==='string'&&/^[A-Za-z0-9._-]{1,64}$/.test(value)?value:null;
export function saveExternalLink(store,{requestId,userId,attribution,planCode}){
  if(!ref(requestId))return false;
  const prior=store.campaignPaymentLinks.get(requestId);
  if(prior)return prior.userId===userId;
  store.campaignPaymentLinks.set(requestId,{requestId,userId,attribution:attribution||null,planCode:plan(planCode)});return true;
}
export function bindExternalSubscription(store,{subscriptionId,userId,attribution,planCode,requestId=null}){
  if(!UUID.test(subscriptionId||'')||!plan(planCode))return false;
  const prior=store.campaignSubscriptionBindings.get(subscriptionId);
  if(prior)return prior.userId===userId;
  store.campaignSubscriptionBindings.set(subscriptionId,{subscriptionId,userId,planCode,requestId,attribution:attribution||null});
  // A late signed wallet event may follow a payment event. Update only its exact subscription.
  for(const tx of store.transactions.values())if(tx.provider==='PaymentService'&&tx.userId===userId&&tx.subscriptionPeriodId===subscriptionId&&!tx.attribution)store.saveTransaction({...tx,attribution:attribution||null});
  return true;
}
export function bindWalletEvent(store,event){
  const d=event.data||{};
  if(event.type!=='wallet.linked'||d.subscriptionCreated!==true||!ref(d.requestId)||!UUID.test(d.subscriptionId||''))return false;
  const link=store.campaignPaymentLinks.get(d.requestId);
  if(!link||link.userId!==event.userId||link.planCode&&link.planCode!==d.planCode)return false;
  return bindExternalSubscription(store,{subscriptionId:d.subscriptionId,userId:event.userId,attribution:link.attribution,planCode:d.planCode,requestId:d.requestId});
}
export async function projectExternalPayment({store,client,event,status,clock=()=>Date.now()}){
  if(!event.type.startsWith('payment.'))return null;
  const d=event.data||{},id=d.paymentId,at=iso(event.createdAt);
  if(!UUID.test(id||'')||!at)throw fail('Missing signed payment identity or transition time.');
  const history=await client.payments(event.userId);
  if(!Array.isArray(history)||!history.some(row=>row.id===id))throw fail('Payment ownership could not be confirmed.');
  const row=await client.payment(id);
  if(row?.id!==id||!paymentStates.has(row.status)||!ref(row.txn_ref_no)||row.currency!=='PKR')throw fail('Invalid authoritative payment detail.');
  const amount=Number(row.amount_minor);
  if(!Number.isSafeInteger(amount)||amount<=0)throw fail('Invalid authoritative payment amount.');
  const prior=store.getTransaction(id);
  if(prior&&(prior.userId!==event.userId||prior.provider!=='PaymentService'||prior.providerReference!==row.txn_ref_no||Math.round(prior.amountPkr*100)!==amount))throw fail('Conflicting payment identity.');
  const explicit=d.subscriptionId||null,remote=row.subscription_id||null,old=prior?.subscriptionPeriodId||null;
  const identifiers=[explicit,remote,old].filter(Boolean);
  if(identifiers.some(v=>!UUID.test(v))||new Set(identifiers).size>1)throw fail('Conflicting subscription identity.');
  const subscriptionId=identifiers[0]||null;
  const binding=subscriptionId?store.campaignSubscriptionBindings.get(subscriptionId):null;
  if(binding&&binding.userId!==event.userId)throw fail('Conflicting subscription ownership.');
  const sub=(status?.subscriptions||[]).find(item=>item.id===subscriptionId);
  const planId=plan(sub?.plan_code)||binding?.planCode||prior?.planId||null;
  // This product only counts subscription membership charges, not arbitrary product payments.
  if(!subscriptionId||!planId)throw fail('Subscription/payment relationship is unavailable.');
  const createdAt=iso(row.created_at);if(!createdAt)throw fail('Payment creation time is unavailable.');
  const next={...prior,id,userId:event.userId,kind:'membership',provider:'PaymentService',providerReference:row.txn_ref_no,subscriptionPeriodId:subscriptionId,planId,amountPkr:amount/100,listAmountPkr:amount/100,currency:'PKR',attribution:prior?.attribution||binding?.attribution||null,createdAt,initiatedAt:createdAt,updatedAt:new Date(clock()).toISOString(),status:prior?.status||'pending',providerStatus:row.status,chargeKind:row.charge_kind||null};
  // Do not derive a captured timestamp from updated_at, browser returns, or a subscription status.
  if(event.type==='payment.completed'){
    if(!['completed','refunded'].includes(row.status))throw fail('Completed event is not confirmed by the ledger.');
    next.paidAt=prior?.paidAt||at;next.completedAt=next.paidAt;
    next.status=row.status==='refunded'||prior?.status==='refunded'?'refunded':'paid';
  }else if(event.type==='payment.refunded'){
    if(row.status!=='refunded')throw fail('Refund event is not confirmed by the ledger.');
    next.status='refunded';next.refundedAt=prior?.refundedAt||at;next.refundAmountPkr=amount/100;
  }else if(event.type==='payment.failed'){
    if(!['failed','expired'].includes(row.status)&&!prior?.paidAt)throw fail('Failed event is not confirmed by the ledger.');
    if(!prior?.paidAt&&prior?.status!=='refunded'){next.status='failed';next.failedAt=prior?.failedAt||at;}
  }
  // A delayed pending/failed event cannot undo a completed/refunded transaction.
  const other=[...store.transactions.values()].filter(tx=>tx.id!==id&&tx.provider==='PaymentService'&&tx.subscriptionPeriodId===subscriptionId&&tx.paidAt&&Date.parse(tx.paidAt)<Date.parse(next.paidAt||at));
  next.purpose=other.length?'extension':'activation';
  if(prior)store.saveTransaction(next);else store.createTransaction(next);
  // Late delivery can reveal an earlier captured cycle. Recalculate only this exact subscription.
  const captured=[...store.transactions.values()].filter(tx=>tx.provider==='PaymentService'&&tx.subscriptionPeriodId===subscriptionId&&tx.paidAt).sort((a,b)=>Date.parse(a.paidAt)-Date.parse(b.paidAt)||a.id.localeCompare(b.id));
  captured.forEach((tx,i)=>{const purpose=i?'extension':'activation';if(tx.purpose!==purpose)store.saveTransaction({...tx,purpose});});
  return next;
}
