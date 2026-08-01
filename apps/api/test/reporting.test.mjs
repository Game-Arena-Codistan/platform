import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../src/adapters/memory-store.mjs';
import {PaymentService} from '../src/services/payments.mjs';
import {SubscriptionReportService,capabilitiesFor,parseReportFilters,requireCapability} from '../src/services/subscription-reports.mjs';

function fixture(){
  let now=Date.parse('2026-08-01T00:30:00+05:00');
  const clock=()=>now;
  const store=new MemoryStore();
  const provider={async createCheckout({transactionId,amountPkr}){return{providerReference:`JC-${transactionId}`,expected:{merchantId:'mock-merchant',billReference:transactionId,amountMinor:amountPkr*100,currency:'PKR'},checkout:{method:'POST',actionUrl:'https://example.invalid',fields:{pp_Password:'must-not-persist',pp_SecureHash:'must-not-persist'}}};}};
  const payments=new PaymentService({store,provider,clock});
  const reports=new SubscriptionReportService({store,clock});
  const user=identity=>store.findOrCreateUser({type:'phone',value:identity});
  const paidEvent=(transaction,providerReference=`JC-PAID-${transaction.id}`)=>payments.applyEvent({transactionId:transaction.id,status:'paid',providerReference,providerEventId:`event-${transaction.id}`,signatureValid:true,event:{billReference:transaction.id,amountMinor:transaction.amountPkr*100,currency:'PKR',merchantId:'mock-merchant'}});
  const advance=ms=>{now+=ms;};
  return{store,payments,reports,user,paidEvent,advance,clock};
}
function customFilters(from='2026-07-01',to='2026-09-30'){return parseReportFilters(new URLSearchParams({from,to,aggregation:'daily',limit:'200'}),()=>Date.parse('2026-08-10T00:00:00+05:00'));}

test('single-charge reporting separates activation, extension, recurring customer and MRR',async()=>{
  const f=fixture();const firstUser=f.user('03001234567');const secondUser=f.user('03007654321');
  const first=await f.payments.checkout({userId:firstUser.id,planId:'monthly',idempotencyKey:'first'});
  assert.equal(f.store.getTransaction(first.id).checkout,undefined);
  assert.equal(JSON.stringify(f.store.getTransaction(first.id)).includes('must-not-persist'),false);
  f.paidEvent(first);f.advance(1000);
  const extension=await f.payments.checkout({userId:firstUser.id,planId:'monthly',idempotencyKey:'second'});
  assert.equal(extension.purpose,'extension');f.paidEvent(extension,'=HYPERLINK("https://invalid")');
  const otherActivation=await f.payments.checkout({userId:secondUser.id,planId:'yearly',idempotencyKey:'other'});f.paidEvent(otherActivation);f.advance(1000);
  const failedExtension=await f.payments.checkout({userId:secondUser.id,planId:'yearly',idempotencyKey:'other-extension'});
  f.payments.applyEvent({transactionId:failedExtension.id,status:'failed',providerReference:'JC-FAILED',providerEventId:`event-${failedExtension.id}`,signatureValid:true,event:{}});
  f.store.setEntitlement(secondUser.id,{tier:'premium',status:'active',origin:'manual_grant',sourceType:'manual_grant',sourceId:'manual-test',startsAt:f.clock(),expiresAt:f.clock()+86400000});
  const summary=f.reports.summary(customFilters());
  assert.equal(summary.kpis.newPaidActivations,2);assert.equal(summary.kpis.successfulRenewals,1);assert.equal(summary.kpis.failedRenewals,1);assert.equal(summary.kpis.recurringCustomers,1);assert.equal(summary.kpis.monthlyRecurringRevenue.applicability,'not_applicable');assert.equal(summary.kpis.annualRecurringRevenue.value,null);assert.equal(summary.kpis.grossCollectionsPkr,5597);assert.equal(summary.kpis.netCollectionsPkr,5597);
});

test('member top-up discount is persisted as benefit cost and reverses on refund',async()=>{
  const f=fixture();const user=f.user('03001112222');
  const topup=await f.payments.checkoutTopup({userId:user.id,offer:{id:'starter',label:'Starter',coins:1000,amountPkr:1000},idempotencyKey:'topup',isPremium:true});
  assert.equal(topup.listAmountPkr,1000);assert.equal(topup.amountPkr,900);assert.equal(topup.discountPkr,100);
  f.paidEvent(topup);let report=f.reports.benefitCosts(customFilters());assert.equal(report.summary.netCostPkr,100);assert.equal(report.rows[0].status,'redeemed');
  f.payments.refund(topup.id,{providerReference:'refund-1',reason:'test'});report=f.reports.benefitCosts(customFilters());assert.equal(report.summary.netCostPkr,0);assert.equal(report.rows[0].status,'reversed');
});

test('refunds are reported separately and exports protect spreadsheet formulas',async()=>{
  const f=fixture();const user=f.user('03003334444');const transaction=await f.payments.checkout({userId:user.id,planId:'monthly',idempotencyKey:'refund'});f.paidEvent(transaction,'=CMD|unsafe');f.advance(1000);f.payments.refund(transaction.id,{providerReference:'refund-2',reason:'test'});
  const summary=f.reports.summary(customFilters());assert.equal(summary.kpis.grossCollectionsPkr,299);assert.equal(summary.kpis.refundsPkr,299);assert.equal(summary.kpis.netCollectionsPkr,0);
  const principal={actor:'admin:finance',roles:['finance']};const exported=f.reports.export('payments',customFilters(),principal);assert.match(exported.body,/'=CMD\|unsafe/);assert.equal(exported.audit.rowCount,1);assert.equal(f.store.reportExports.length,1);assert.equal(f.store.audit.events.some(item=>item.action==='report.export_generated'),true);
});

test('Pakistan-local date presets use UTC storage with exact boundaries',()=>{
  const now=Date.parse('2026-08-01T00:30:00+05:00');const today=parseReportFilters(new URLSearchParams({preset:'today'}),()=>now);assert.equal(today.fromIso,'2026-07-31T19:00:00.000Z');assert.equal(today.toExclusiveIso,'2026-08-01T19:00:00.000Z');
  const previous=parseReportFilters(new URLSearchParams({preset:'previousmonth'}),()=>now);assert.equal(previous.fromIso,'2026-06-30T19:00:00.000Z');assert.equal(previous.toExclusiveIso,'2026-07-31T19:00:00.000Z');
});

test('report and export capabilities are separate and server enforced',()=>{
  assert.equal(capabilitiesFor(['support']).includes('reports.read'),true);assert.equal(capabilitiesFor(['support']).includes('reports.export'),false);assert.throws(()=>requireCapability({roles:['support']},'reports.export'),error=>error.code==='admin_capability_forbidden');assert.doesNotThrow(()=>requireCapability({roles:['finance']},'reports.export'));
});
