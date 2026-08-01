import test from 'node:test';
import assert from 'node:assert/strict';

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
async function Store(){return(await import('../src/adapters/postgres-store.mjs')).PostgresStore;}
async function reset(){
  const {Pool}=await import('pg');
  const pool=new Pool({connectionString,max:1});
  try{
    await pool.query(`TRUNCATE ${runtimeTables.join(',')} RESTART IDENTITY CASCADE`);
    await pool.query("DELETE FROM ga_runtime_schema_state WHERE id='legacy-import-complete'");
    await pool.query('UPDATE ga_legacy_state_archive SET imported_at=NULL');
  }finally{await pool.end();}
}

test('PostgreSQL state survives a committed restart',options,async()=>{
  const PostgresStore=await Store();
  await reset();
  let store=await PostgresStore.connect({connectionString,ssl:false});
  const user=store.findOrCreateUser({type:'phone',value:'+923001234567'});
  store.appendLedger({userId:user.id,amount:75,reason:'test',idempotencyKey:'test:ledger'});
  store.createTransaction({id:'11111111-1111-4111-8111-111111111111',userId:user.id,kind:'membership',provider:'JazzCash',planId:'monthly',amountPkr:299,status:'pending',idempotencyKey:'test:payment',purchaseFingerprint:'test'});
  await store.commit();
  await store.close();
  store=await PostgresStore.connect({connectionString,ssl:false});
  assert.equal(store.getUser(user.id).id,user.id);
  assert.equal(store.wallet(user.id),75);
  assert.equal(store.getTransaction('11111111-1111-4111-8111-111111111111').amountPkr,299);
  const duplicate=store.appendLedger({userId:user.id,amount:75,reason:'test',idempotencyKey:'test:ledger'});
  assert.equal(duplicate.duplicate,true);
  await store.close();
});

test('PostgreSQL allows unrelated writers and rejects same-row conflicts',options,async()=>{
  const PostgresStore=await Store();
  await reset();
  const seed=await PostgresStore.connect({connectionString,ssl:false});
  const user=seed.findOrCreateUser({type:'email',value:'multi-writer@example.test'});
  await seed.commit();
  await seed.close();

  const first=await PostgresStore.connect({connectionString,ssl:false});
  const second=await PostgresStore.connect({connectionString,ssl:false});
  try{
    first.createSupportTicket({topic:'first',message:'First writer creates an unrelated durable support record.'});
    second.createSupportTicket({topic:'second',message:'Second writer creates a different durable support record.'});
    await first.commit();
    await second.commit();
    await first.refresh();
    assert.equal(first.supportTickets.filter(item=>['first','second'].includes(item.topic)).length,2);

    first.getUser(user.id).displayName='Committed writer';
    second.getUser(user.id).displayName='Stale writer';
    await first.commit();
    await assert.rejects(()=>second.commit(),/Concurrent PostgreSQL update detected/);
    await second.refresh();
    assert.equal(second.getUser(user.id).displayName,'Committed writer');
  }finally{
    await first.close();
    await second.pool.end();
  }
});
