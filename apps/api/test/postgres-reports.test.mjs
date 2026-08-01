import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReportFilters} from '../src/services/subscription-reports.mjs';
import {PostgresSubscriptionReportService} from '../src/services/postgres-subscription-reports.mjs';

const connectionString=process.env.TEST_DATABASE_URL;
const options={skip:!connectionString};
const runtimeTables=[
  'ga_runtime_users','ga_runtime_identities','ga_runtime_otp','ga_runtime_sessions',
  'ga_runtime_devices','ga_runtime_entitlements','ga_runtime_entitlement_history',
  'ga_runtime_transactions','ga_runtime_payment_events','ga_runtime_reconciliation_cases',
  'ga_runtime_coin_ledger','ga_runtime_games','ga_runtime_play_sessions','ga_runtime_score_events',
  'ga_runtime_rate_limits','ga_runtime_challenges','ga_runtime_tournaments',
  'ga_runtime_tournament_entries','ga_runtime_adjustments','ga_runtime_multiplayer_rooms',
  'ga_runtime_support_tickets','ga_runtime_voucher_redemptions','ga_runtime_plan_versions',
  'ga_runtime_benefit_ledger','ga_runtime_report_exports','ga_runtime_audit_events',
  'ga_plan_versions','ga_payment_attempts','ga_payment_events','ga_subscription_periods',
  'ga_reconciliation_cases','ga_benefit_ledger','ga_report_export_audit','ga_audit_events'
];

async function database(){const {Pool}=await import('pg');return new Pool({connectionString,max:2});}
async function reset(pool){await pool.query(`TRUNCATE ${runtimeTables.join(',')} RESTART IDENTITY CASCADE`);}

function filters(){
  return parseReportFilters(new URLSearchParams('from=2026-08-01&to=2026-08-03&limit=50'),()=>Date.parse('2026-08-02T12:00:00.000Z'));
}

test('deployed reports read indexed PostgreSQL projections and persist export audit',options,async()=>{
  const pool=await database();await reset(pool);
  const userId='44444444-4444-4444-8444-444444444444';
  const transactionId='55555555-5555-4555-8555-555555555555';
  const periodId='66666666-6666-4666-8666-666666666666';
  const benefitId='77777777-7777-4777-8777-777777777777';
  const caseId='88888888-8888-4888-8888-888888888888';
  const createdAt='2026-08-01T10:00:00.000Z';
  const paidAt='2026-08-01T10:05:00.000Z';
  const safePayment={id:transactionId,userId,kind:'membership',purpose:'activation',planId:'monthly',planSnapshot:{id:'monthly',name:'Monthly',pricePkr:299,currency:'PKR',billingMode:'single'},listAmountPkr:299,amountPkr:299,discountPkr:0,refundAmountPkr:0,currency:'PKR',status:'paid',providerStatus:'paid',provider:'JazzCash',providerReference:'sandbox-reference',subscriptionPeriodId:periodId,createdAt,initiatedAt:createdAt,completedAt:paidAt,paidAt,updatedAt:paidAt};
  const subscription={id:periodId,userId,tier:'premium',planId:'monthly',planSnapshot:safePayment.planSnapshot,origin:'paid',purpose:'activation',status:'active',startsAt:Date.parse(paidAt),currentPeriodStartsAt:Date.parse(paidAt),currentPeriodEndsAt:Date.parse('2026-09-01T10:05:00.000Z'),expiresAt:Date.parse('2026-09-01T10:05:00.000Z'),autoRenew:false,sourceType:'payment',sourceId:transactionId,createdAt:paidAt,updatedAt:paidAt};
  const benefit={id:benefitId,userId,transactionId,type:'member_topup_discount',status:'redeemed',issuedAmountPkr:30,redeemedAmountPkr:30,reversedAmountPkr:0,createdAt:paidAt,updatedAt:paidAt};
  const reconciliation={id:caseId,transactionId,reason:'provider_status_review',status:'open',createdAt:paidAt,updatedAt:paidAt};
  try{
    await pool.query(`INSERT INTO ga_runtime_identities(record_key,record) VALUES($1,$2)`,['email:report@example.test',{type:'email',value:'report@example.test',userId,createdAt}]);
    await pool.query(`INSERT INTO ga_plan_versions(version,plan_id,name,status,price_pkr,currency,duration_days,billing_mode,benefits_version,effective_at,snapshot)
      VALUES('monthly-v1','monthly','Monthly','active',299,'PKR',30,'single','v1',$1,$2)`,[createdAt,safePayment.planSnapshot]);
    await pool.query(`INSERT INTO ga_payment_attempts(id,user_id,kind,purpose,plan_id,plan_snapshot,list_amount_pkr,charged_amount_pkr,discount_pkr,refund_amount_pkr,currency,internal_status,provider_status,provider_reference,subscription_period_id,created_at,initiated_at,completed_at,updated_at,safe_record)
      VALUES($1,$2,'membership','activation','monthly',$3,299,299,0,0,'PKR','paid','paid','sandbox-reference',$4,$5,$5,$6,$6,$7)`,[transactionId,userId,safePayment.planSnapshot,periodId,createdAt,paidAt,safePayment]);
    await pool.query(`INSERT INTO ga_subscription_periods(id,user_id,plan_id,plan_snapshot,origin,purpose,status,activation_at,current_period_starts_at,current_period_ends_at,expires_at,auto_renew,cancel_at_period_end,source_type,source_id,record,updated_at)
      VALUES($1,$2,'monthly',$3,'paid','activation','active',$4,$4,$5,$5,false,false,'payment',$6,$7,$4)`,[periodId,userId,safePayment.planSnapshot,paidAt,'2026-09-01T10:05:00.000Z',transactionId,subscription]);
    await pool.query(`INSERT INTO ga_benefit_ledger(id,user_id,transaction_id,benefit_type,status,issued_amount_pkr,redeemed_amount_pkr,credited_amount_pkr,failed_amount_pkr,reversal_required_amount_pkr,reversed_amount_pkr,created_at,updated_at,safe_record)
      VALUES($1,$2,$3,'member_topup_discount','redeemed',30,30,0,0,0,0,$4,$4,$5)`,[benefitId,userId,transactionId,paidAt,benefit]);
    await pool.query(`INSERT INTO ga_reconciliation_cases(id,transaction_id,reason,status,created_at,updated_at,safe_record)
      VALUES($1,$2,'provider_status_review','open',$3,$3,$4)`,[caseId,transactionId,paidAt,reconciliation]);

    const service=new PostgresSubscriptionReportService({pool,clock:()=>Date.parse('2026-08-02T12:00:00.000Z')});
    const reportFilters=filters();
    const summary=await service.summary(reportFilters);
    assert.equal(summary.dataSource,'postgresql-indexed');
    assert.equal(summary.kpis.grossCollectionsPkr,299);
    assert.equal(summary.kpis.newPaidActivations,1);
    assert.equal(summary.kpis.activeSubscriptions,1);
    assert.equal(summary.kpis.benefitCostPkr,30);

    const payments=await service.paymentLedger(reportFilters);
    assert.equal(payments.rows.length,1);
    assert.equal(payments.rows[0].providerReference,'sandbox-reference');
    assert.equal(payments.rows[0].customer.masked,'r***@example.test');

    const subscriptions=await service.subscriptionLedger(reportFilters);
    assert.equal(subscriptions.rows.length,1);
    assert.equal(subscriptions.rows[0].origin,'paid');
    assert.equal(subscriptions.rows[0].lifetimeCollectedPkr,299);

    const attention=await service.reconciliation(reportFilters);
    assert.equal(attention.rows.length,1);
    const benefits=await service.benefitCosts(reportFilters);
    assert.equal(benefits.rows.length,1);

    const exported=await service.export('payments',reportFilters,{actor:'finance-test',roles:['finance']});
    assert.equal(exported.dataSource,'postgresql-indexed');
    assert.match(exported.body,/sandbox-reference/);
    const audit=await pool.query('SELECT actor_id,report_type,row_count FROM ga_report_export_audit');
    assert.equal(audit.rowCount,1);
    assert.equal(audit.rows[0].actor_id,'finance-test');
    assert.equal(audit.rows[0].report_type,'payments');
    assert.equal(Number(audit.rows[0].row_count),1);
  }finally{await pool.end();}
});
