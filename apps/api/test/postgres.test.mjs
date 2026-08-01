import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

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
async function Pool(){return(await import('pg')).Pool;}
async function reset(){
  const DatabasePool=await Pool();const pool=new DatabasePool({connectionString,max:1});
  try{
    await pool.query(`TRUNCATE ${runtimeTables.join(',')} RESTART IDENTITY CASCADE`);
    await pool.query("DELETE FROM ga_runtime_schema_state WHERE id='legacy-import-complete'");
    await pool.query('UPDATE ga_legacy_state_archive SET imported_at=NULL');
    await pool.query('DROP TABLE IF EXISTS platform_state');
  }finally{await pool.end();}
}

test('PostgreSQL state survives a committed restart',options,async()=>{
  const PostgresStore=await Store();await reset();
  let store=await PostgresStore.connect({connectionString,ssl:false});
  const user=store.findOrCreateUser({type:'phone',value:'+923001234567'});
  store.appendLedger({userId:user.id,amount:75,reason:'test',idempotencyKey:'test:ledger'});
  store.createTransaction({id:'11111111-1111-4111-8111-111111111111',userId:user.id,kind:'membership',provider:'JazzCash',planId:'monthly',amountPkr:299,status:'pending',idempotencyKey:'test:payment',purchaseFingerprint:'test'});
  await store.commit();await store.close();
  store=await PostgresStore.connect({connectionString,ssl:false});
  assert.equal(store.getUser(user.id).id,user.id);assert.equal(store.wallet(user.id),75);
  assert.equal(store.getTransaction('11111111-1111-4111-8111-111111111111').amountPkr,299);
  assert.equal(store.appendLedger({userId:user.id,amount:75,reason:'test',idempotencyKey:'test:ledger'}).duplicate,true);
  await store.close();
});

test('PostgreSQL allows unrelated writers and rejects same-row conflicts',options,async()=>{
  const PostgresStore=await Store();await reset();
  const seed=await PostgresStore.connect({connectionString,ssl:false});
  const user=seed.findOrCreateUser({type:'email',value:'multi-writer@example.test'});
  await seed.commit();await seed.close();

  const first=await PostgresStore.connect({connectionString,ssl:false});
  const second=await PostgresStore.connect({connectionString,ssl:false});
  try{
    first.createSupportTicket({topic:'first',message:'First writer creates an unrelated durable support record.'});
    second.createSupportTicket({topic:'second',message:'Second writer creates a different durable support record.'});
    await first.commit();await second.commit();await first.refresh();
    assert.equal(first.supportTickets.filter(item=>['first','second'].includes(item.topic)).length,2);

    first.getUser(user.id).displayName='Committed writer';second.getUser(user.id).displayName='Stale writer';
    await first.commit();await assert.rejects(()=>second.commit(),/Concurrent PostgreSQL update detected/);
    await second.refresh();assert.equal(second.getUser(user.id).displayName,'Committed writer');
  }finally{await first.close();await second.pool.end();}
});

test('legacy state is archived, expanded and removed transactionally',options,async()=>{
  await reset();
  const DatabasePool=await Pool();const pool=new DatabasePool({connectionString,max:1});
  const userId='22222222-2222-4222-8222-222222222222';
  const ledgerId='33333333-3333-4333-8333-333333333333';
  const createdAt='2026-08-01T00:00:00.000Z';
  const identityKey='email:legacy@example.test';
  const state={
    schemaVersion:3,
    users:[[userId,{id:userId,displayName:'Legacy Player',status:'active',createdAt}]],
    identities:[[identityKey,{type:'email',value:'legacy@example.test',userId,createdAt}]],
    ledger:[{id:ledgerId,userId,amount:40,reason:'legacy-import',idempotencyKey:'legacy:ledger',createdAt}],
    games:[{id:'legacy-game',title:'Legacy Game',genre:'Arcade',tier:'free',status:'paused',rolloutPercentage:0,version:'legacy-1'}],
    audit:[]
  };
  try{
    await pool.query('CREATE TABLE platform_state(id text PRIMARY KEY,revision bigint NOT NULL,state jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())');
    await pool.query('INSERT INTO platform_state(id,revision,state) VALUES($1,$2,$3)',['primary',7,state]);
    const migration=await readFile(new URL('../migrations/911_archive_legacy_platform_state.sql',import.meta.url),'utf8');
    await pool.query(migration);
    assert.equal((await pool.query("SELECT to_regclass('public.platform_state') AS name")).rows[0].name,null);
    const archive=(await pool.query("SELECT source_revision,imported_at FROM ga_legacy_state_archive WHERE id='primary'")).rows[0];
    assert.equal(Number(archive.source_revision),7);assert.ok(archive.imported_at);
  }finally{await pool.end();}

  const PostgresStore=await Store();const store=await PostgresStore.connect({connectionString,ssl:false});
  try{
    assert.equal(store.getUser(userId).displayName,'Legacy Player');
    assert.equal(store.wallet(userId),40);
    assert.equal(store.getGame('legacy-game').status,'paused');
  }finally{await store.close();}
});
