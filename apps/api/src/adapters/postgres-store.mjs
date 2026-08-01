import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {MemoryStore} from './memory-store.mjs';
import {AuditLog,Metrics} from '../lib/observability.mjs';
import {NORMALIZED_POSTGRES_MODEL} from '../lib/persistence-readiness.mjs';

const MAP_COLLECTIONS=[
  ['users','ga_runtime_users'],
  ['identities','ga_runtime_identities'],
  ['otp','ga_runtime_otp'],
  ['sessions','ga_runtime_sessions'],
  ['devices','ga_runtime_devices'],
  ['entitlements','ga_runtime_entitlements'],
  ['transactions','ga_runtime_transactions'],
  ['paymentEvents','ga_runtime_payment_events'],
  ['playSessions','ga_runtime_play_sessions'],
  ['rateLimits','ga_runtime_rate_limits'],
  ['challenges','ga_runtime_challenges'],
  ['tournaments','ga_runtime_tournaments'],
  ['adjustments','ga_runtime_adjustments'],
  ['multiplayerRooms','ga_runtime_multiplayer_rooms']
];

const ARRAY_COLLECTIONS=[
  ['entitlementHistory','ga_runtime_entitlement_history',item=>item.id],
  ['reconciliationCases','ga_runtime_reconciliation_cases',item=>item.id],
  ['ledger','ga_runtime_coin_ledger',item=>item.id],
  ['games','ga_runtime_games',item=>item.id],
  ['scoreEvents','ga_runtime_score_events',item=>item.playSessionId],
  ['tournamentEntries','ga_runtime_tournament_entries',item=>item.id],
  ['supportTickets','ga_runtime_support_tickets',item=>item.id],
  ['voucherRedemptions','ga_runtime_voucher_redemptions',item=>item.id],
  ['planVersions','ga_runtime_plan_versions',item=>item.version],
  ['benefitLedger','ga_runtime_benefit_ledger',item=>item.id],
  ['reportExports','ga_runtime_report_exports',item=>item.id],
  ['auditEvents','ga_runtime_audit_events',item=>item.id]
];

const DESCRIPTORS=[
  ...MAP_COLLECTIONS.map(([name,table])=>({name,table,kind:'map',keyOf:(_item,key)=>key})),
  ...ARRAY_COLLECTIONS.map(([name,table,keyOf])=>({name,table,kind:'array',keyOf}))
];
const DESCRIPTOR_BY_NAME=new Map(DESCRIPTORS.map(item=>[item.name,item]));
const LEGACY_MAP_FIELDS=['users','usersByIdentity','identities','otp','sessions','devices','entitlements','transactions','paymentEvents','playSessions','rateLimits','challenges','tournaments','adjustments','multiplayerRooms'];
const LEGACY_ARRAY_FIELDS=['entitlementHistory','reconciliationCases','ledger','games','scoreEvents','tournamentEntries','supportTickets','voucherRedemptions','planVersions','benefitLedger','reportExports'];

async function certificate(input){
  if(input)return input;
  try{return await readFile('/app/certs/rds-global-bundle.pem','utf8');}
  catch{throw new Error('A trusted RDS CA bundle is required when PostgreSQL TLS is enabled.');}
}

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
const canonical=value=>JSON.stringify(stable(value));
const clone=value=>structuredClone(value);
const dateValue=value=>{
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number')return new Date(value).toISOString();
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
};
const safeTransaction=item=>({
  id:item.id,userId:item.userId,kind:item.kind,purpose:item.purpose,planId:item.planId,
  planSnapshot:item.planSnapshot,listAmountPkr:item.listAmountPkr,amountPkr:item.amountPkr,
  discountPkr:item.discountPkr,refundAmountPkr:item.refundAmountPkr,currency:item.currency,
  status:item.status,providerStatus:item.providerStatus,provider:item.provider,
  providerReference:item.providerReference,subscriptionPeriodId:item.subscriptionPeriodId,
  createdAt:item.createdAt,initiatedAt:item.initiatedAt,completedAt:item.completedAt||item.paidAt,
  failedAt:item.failedAt,cancelledAt:item.cancelledAt,refundedAt:item.refundedAt,updatedAt:item.updatedAt
});

function container(store,descriptor){
  if(descriptor.name==='auditEvents')return store.audit.events;
  return store[descriptor.name];
}
function clearContainer(store,descriptor){
  if(descriptor.kind==='map')store[descriptor.name]=new Map();
  else if(descriptor.name==='auditEvents')store.audit.events=[];
  else store[descriptor.name]=[];
}
function currentRecords(store,descriptor){
  const value=container(store,descriptor);
  if(descriptor.kind==='map')return new Map([...value.entries()].map(([key,record])=>[String(key),record]));
  return new Map(value.map(record=>[String(descriptor.keyOf(record)),record]));
}
function applyRecord(store,descriptor,key,record,deleted){
  const target=container(store,descriptor);
  if(descriptor.kind==='map'){
    if(deleted)target.delete(key);else target.set(key,clone(record));
    return;
  }
  const index=target.findIndex(item=>String(descriptor.keyOf(item))===key);
  if(deleted){if(index>=0)target.splice(index,1);return;}
  if(index>=0)target[index]=clone(record);else target.push(clone(record));
}
function normalizeArrays(store){
  const ascending=(field,number=false)=>(a,b)=>{
    const av=number?Number(a?.[field]||0):Date.parse(a?.[field]||0)||Number(a?.[field]||0);
    const bv=number?Number(b?.[field]||0):Date.parse(b?.[field]||0)||Number(b?.[field]||0);
    return av-bv||String(a?.id||a?.playSessionId||'').localeCompare(String(b?.id||b?.playSessionId||''));
  };
  store.entitlementHistory.sort(ascending('createdAt'));
  store.reconciliationCases.sort(ascending('createdAt'));
  store.ledger.sort(ascending('createdAt'));
  store.scoreEvents.sort(ascending('completedAt',true));
  store.tournamentEntries.sort(ascending('joinedAt',true));
  store.supportTickets.sort(ascending('createdAt'));
  store.voucherRedemptions.sort(ascending('redeemedAt'));
  store.planVersions.sort((a,b)=>String(a.id).localeCompare(String(b.id))||String(a.version).localeCompare(String(b.version)));
  store.benefitLedger.sort(ascending('createdAt'));
  store.reportExports.sort(ascending('generatedAt'));
  store.audit.events.sort(ascending('at'));
  store.games.sort((a,b)=>Number(Boolean(b.preview))-Number(Boolean(a.preview))||String(a.title).localeCompare(String(b.title)));
}
function rebuildDerivedIndexes(store){
  store.usersByIdentity=new Map([...store.identities.entries()].map(([key,item])=>[key,item.userId]));
  normalizeArrays(store);
}

function hydrateLegacySnapshot(store,state){
  if(!state||![1,2,3].includes(state.schemaVersion))return false;
  for(const field of LEGACY_MAP_FIELDS){
    if(field==='usersByIdentity')continue;
    if(Array.isArray(state[field]))store[field]=new Map(state[field]);
  }
  for(const field of LEGACY_ARRAY_FIELDS)if(Array.isArray(state[field]))store[field]=state[field];
  store.audit.events=Array.isArray(state.audit)?state.audit:[];
  store.metrics.counters=new Map(state.metrics?.counters||[]);
  store.metrics.timings=new Map(state.metrics?.timings||[]);
  rebuildDerivedIndexes(store);
  return true;
}

async function readLegacySnapshot(pool){
  const exists=await pool.query("SELECT to_regclass('public.platform_state') AS table_name");
  if(!exists.rows[0]?.table_name)return null;
  const result=await pool.query('SELECT revision,state FROM platform_state WHERE id=$1',['primary']);
  return result.rows[0]??null;
}
async function archiveLegacySnapshot(pool,legacy){
  if(!legacy)return;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS ga_legacy_state_archive(
      id text PRIMARY KEY,source_revision bigint NOT NULL,state jsonb NOT NULL,
      archived_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
    await client.query(`INSERT INTO ga_legacy_state_archive(id,source_revision,state,archived_at)
      VALUES('primary',$1,$2,clock_timestamp())
      ON CONFLICT(id) DO UPDATE SET source_revision=EXCLUDED.source_revision,state=EXCLUDED.state,archived_at=clock_timestamp()`,[legacy.revision,legacy.state]);
    await client.query('DROP TABLE platform_state');
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

async function projectChange(client,change){
  const {collection,key,record,deleted}=change;
  if(collection==='planVersions'){
    if(deleted)return client.query('DELETE FROM ga_plan_versions WHERE version=$1',[key]);
    return client.query(`INSERT INTO ga_plan_versions(version,plan_id,name,status,price_pkr,currency,duration_days,billing_mode,benefits_version,effective_at,scheduled_at,retired_at,snapshot,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,clock_timestamp())
      ON CONFLICT(version) DO UPDATE SET plan_id=EXCLUDED.plan_id,name=EXCLUDED.name,status=EXCLUDED.status,price_pkr=EXCLUDED.price_pkr,currency=EXCLUDED.currency,duration_days=EXCLUDED.duration_days,billing_mode=EXCLUDED.billing_mode,benefits_version=EXCLUDED.benefits_version,effective_at=EXCLUDED.effective_at,scheduled_at=EXCLUDED.scheduled_at,retired_at=EXCLUDED.retired_at,snapshot=EXCLUDED.snapshot,updated_at=clock_timestamp()`,[record.version,record.id,record.name,record.status,record.pricePkr,record.currency||'PKR',record.durationDays??null,record.billingMode||'single',record.benefitsVersion||null,dateValue(record.effectiveAt),dateValue(record.scheduledAt),dateValue(record.retiredAt),record]);
  }
  if(collection==='transactions'){
    if(deleted)return client.query('DELETE FROM ga_payment_attempts WHERE id=$1',[key]);
    return client.query(`INSERT INTO ga_payment_attempts(id,user_id,kind,purpose,plan_id,plan_snapshot,list_amount_pkr,charged_amount_pkr,discount_pkr,refund_amount_pkr,currency,internal_status,provider_status,provider_reference,subscription_period_id,created_at,initiated_at,completed_at,failed_at,cancelled_at,refunded_at,updated_at,safe_record)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      ON CONFLICT(id) DO UPDATE SET purpose=EXCLUDED.purpose,plan_id=EXCLUDED.plan_id,plan_snapshot=EXCLUDED.plan_snapshot,list_amount_pkr=EXCLUDED.list_amount_pkr,charged_amount_pkr=EXCLUDED.charged_amount_pkr,discount_pkr=EXCLUDED.discount_pkr,refund_amount_pkr=EXCLUDED.refund_amount_pkr,currency=EXCLUDED.currency,internal_status=EXCLUDED.internal_status,provider_status=EXCLUDED.provider_status,provider_reference=EXCLUDED.provider_reference,subscription_period_id=EXCLUDED.subscription_period_id,initiated_at=EXCLUDED.initiated_at,completed_at=EXCLUDED.completed_at,failed_at=EXCLUDED.failed_at,cancelled_at=EXCLUDED.cancelled_at,refunded_at=EXCLUDED.refunded_at,updated_at=EXCLUDED.updated_at,safe_record=EXCLUDED.safe_record`,[record.id,record.userId,record.kind||'membership',record.purpose||(record.kind==='topup'?'topup':'activation'),record.planId||null,record.planSnapshot||null,record.listAmountPkr??record.amountPkr,record.amountPkr||0,record.discountPkr||0,record.refundAmountPkr||0,record.currency||'PKR',record.status,record.providerStatus||record.status,record.providerReference||null,record.subscriptionPeriodId||null,dateValue(record.createdAt)||new Date().toISOString(),dateValue(record.initiatedAt||record.createdAt),dateValue(record.completedAt||record.paidAt),dateValue(record.failedAt),dateValue(record.cancelledAt),dateValue(record.refundedAt),dateValue(record.updatedAt||record.createdAt)||new Date().toISOString(),safeTransaction(record)]);
  }
  if(collection==='paymentEvents'){
    if(deleted)return client.query('DELETE FROM ga_payment_events WHERE id=$1',[key]);
    return client.query(`INSERT INTO ga_payment_events(id,transaction_id,event_type,provider_status,signature_valid,received_at,processed_at,duplicate,protected_evidence_reference)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(id) DO UPDATE SET event_type=EXCLUDED.event_type,provider_status=EXCLUDED.provider_status,signature_valid=EXCLUDED.signature_valid,processed_at=EXCLUDED.processed_at,duplicate=EXCLUDED.duplicate`,[record.id||key,record.transactionId,record.kind||'unknown',record.providerStatus||record.kind||null,Boolean(record.signatureValid),dateValue(record.receivedAt)||new Date().toISOString(),dateValue(record.processedAt),Boolean(record.duplicate),record.protectedEvidenceReference||null]);
  }
  if(collection==='entitlementHistory'){
    if(deleted||record.tier!=='premium')return client.query('DELETE FROM ga_subscription_periods WHERE id=$1',[key]);
    return client.query(`INSERT INTO ga_subscription_periods(id,user_id,plan_id,plan_snapshot,origin,purpose,status,activation_at,current_period_starts_at,current_period_ends_at,expires_at,grace_ends_at,cancelled_at,next_renewal_at,auto_renew,cancel_at_period_end,source_type,source_id,record,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,clock_timestamp())
      ON CONFLICT(id) DO UPDATE SET plan_id=EXCLUDED.plan_id,plan_snapshot=EXCLUDED.plan_snapshot,origin=EXCLUDED.origin,purpose=EXCLUDED.purpose,status=EXCLUDED.status,current_period_starts_at=EXCLUDED.current_period_starts_at,current_period_ends_at=EXCLUDED.current_period_ends_at,expires_at=EXCLUDED.expires_at,grace_ends_at=EXCLUDED.grace_ends_at,cancelled_at=EXCLUDED.cancelled_at,next_renewal_at=EXCLUDED.next_renewal_at,auto_renew=EXCLUDED.auto_renew,cancel_at_period_end=EXCLUDED.cancel_at_period_end,source_type=EXCLUDED.source_type,source_id=EXCLUDED.source_id,record=EXCLUDED.record,updated_at=clock_timestamp()`,[record.id,record.userId,record.planId||null,record.planSnapshot||null,record.origin||(String(record.sourceType||'').startsWith('manual')?'manual_grant':'paid'),record.purpose||null,record.status,dateValue(record.startsAt||record.createdAt),dateValue(record.currentPeriodStartsAt||record.startsAt),dateValue(record.currentPeriodEndsAt||record.expiresAt),dateValue(record.expiresAt),dateValue(record.graceEndsAt),dateValue(record.cancelledAt),dateValue(record.nextRenewalAt),Boolean(record.autoRenew),Boolean(record.cancelAtPeriodEnd),record.sourceType||null,record.sourceId||null,record]);
  }
  if(collection==='reconciliationCases'){
    if(deleted)return client.query('DELETE FROM ga_reconciliation_cases WHERE id=$1',[key]);
    return client.query(`INSERT INTO ga_reconciliation_cases(id,transaction_id,reason,status,created_at,updated_at,owner_id,resolution_reference,safe_record)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(id) DO UPDATE SET reason=EXCLUDED.reason,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,owner_id=EXCLUDED.owner_id,resolution_reference=EXCLUDED.resolution_reference,safe_record=EXCLUDED.safe_record`,[record.id,record.transactionId||null,record.reason,record.status||'open',dateValue(record.createdAt)||new Date().toISOString(),dateValue(record.updatedAt),record.ownerId||null,record.resolutionReference||null,record]);
  }
  if(collection==='benefitLedger'){
    if(deleted)return client.query('DELETE FROM ga_benefit_ledger WHERE id=$1',[key]);
    return client.query(`INSERT INTO ga_benefit_ledger(id,user_id,transaction_id,subscription_period_id,benefit_type,status,issued_amount_pkr,redeemed_amount_pkr,credited_amount_pkr,failed_amount_pkr,reversal_required_amount_pkr,reversed_amount_pkr,created_at,updated_at,safe_record)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,redeemed_amount_pkr=EXCLUDED.redeemed_amount_pkr,credited_amount_pkr=EXCLUDED.credited_amount_pkr,failed_amount_pkr=EXCLUDED.failed_amount_pkr,reversal_required_amount_pkr=EXCLUDED.reversal_required_amount_pkr,reversed_amount_pkr=EXCLUDED.reversed_amount_pkr,updated_at=EXCLUDED.updated_at,safe_record=EXCLUDED.safe_record`,[record.id,record.userId,record.transactionId||null,record.subscriptionPeriodId||null,record.type,record.status,record.issuedAmountPkr||0,record.redeemedAmountPkr||0,record.creditedAmountPkr||0,record.failedAmountPkr||0,record.reversalRequiredAmountPkr||0,record.reversedAmountPkr||0,dateValue(record.createdAt)||new Date().toISOString(),dateValue(record.updatedAt||record.createdAt)||new Date().toISOString(),record]);
  }
  if(collection==='reportExports'){
    if(deleted)return client.query('DELETE FROM ga_report_export_audit WHERE id=$1',[key]);
    return client.query(`INSERT INTO ga_report_export_audit(id,actor_id,report_type,selected_range,safe_filters,row_count,schema_version,content_hash,generated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,[record.id,record.actor,record.reportType,{from:record.filters?.from,toExclusive:record.filters?.toExclusive},record.filters||{},record.rowCount,record.schemaVersion,record.contentHash,dateValue(record.generatedAt)||new Date().toISOString()]);
  }
  if(collection==='auditEvents'){
    if(deleted)return client.query('DELETE FROM ga_audit_events WHERE id=$1',[key]);
    return client.query(`INSERT INTO ga_audit_events(id,occurred_at,actor_id,action,target_type,target_id,request_id,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,[record.id,dateValue(record.at)||new Date().toISOString(),record.actor,record.action,record.targetType||null,record.targetId||null,record.requestId||null,record.metadata||{}]);
  }
}

function conflict(collection,key){
  return Object.assign(new Error(`Concurrent PostgreSQL update detected for ${collection}/${key}. Retry the request against the refreshed repository state.`),{code:'persistence_conflict',status:409});
}

export class PostgresStore extends MemoryStore{
  static async connect({connectionString,ssl=false,ca=''}){
    const trustedCa=ssl?await certificate(ca):'';
    const pool=new Pool({connectionString,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:10000,ssl:ssl?{ca:trustedCa,rejectUnauthorized:true}:undefined});
    await pool.query('SELECT 1');
    const model=await pool.query("SELECT value->>'name' AS name FROM ga_runtime_schema_state WHERE id='persistence-model'");
    if(model.rows[0]?.name!==NORMALIZED_POSTGRES_MODEL){await pool.end();throw new Error('Normalized PostgreSQL migrations are not applied. Run the database migration job before starting the API.');}
    const store=new PostgresStore({pool});
    const fallback={games:clone(store.games),challenges:new Map([...store.challenges].map(([key,value])=>[key,clone(value)])),tournaments:new Map([...store.tournaments].map(([key,value])=>[key,clone(value)]))};
    for(const descriptor of DESCRIPTORS)clearContainer(store,descriptor);
    const legacy=await readLegacySnapshot(pool);
    if(legacy)hydrateLegacySnapshot(store,legacy.state);
    else await store.refresh({initial:true});
    if(!store.games.length)store.games=fallback.games;
    if(!store.challenges.size)store.challenges=fallback.challenges;
    if(!store.tournaments.size)store.tournaments=fallback.tournaments;
    rebuildDerivedIndexes(store);
    await store.commit();
    if(legacy)await archiveLegacySnapshot(pool,legacy);
    await store.refresh({initial:true});
    return store;
  }

  constructor({pool}){
    super({audit:new AuditLog(),metrics:new Metrics()});
    this.pool=pool;
    this.persistenceModel=NORMALIZED_POSTGRES_MODEL;
    this.planVersions??=[];this.benefitLedger??=[];this.reportExports??=[];
    this.snapshots=new Map(DESCRIPTORS.map(item=>[item.name,new Map()]));
    this.revisions=new Map(DESCRIPTORS.map(item=>[item.name,new Map()]));
    this.lastRefreshAt='1970-01-01T00:00:00.000Z';
    this.requestQueue=Promise.resolve();
  }

  runExclusive(task){
    const run=this.requestQueue.then(task,task);
    this.requestQueue=run.catch(()=>{});
    return run;
  }

  async refresh({initial=false}={}){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const cutoff=(await client.query('SELECT transaction_timestamp() AS cutoff')).rows[0].cutoff.toISOString();
      const since=initial?'1970-01-01T00:00:00.000Z':this.lastRefreshAt;
      const union=DESCRIPTORS.map((descriptor,index)=>`SELECT '${descriptor.name}' AS collection,record_key,revision,record,deleted_at,updated_at FROM ${descriptor.table} WHERE updated_at >= $1`).join(' UNION ALL ');
      const result=await client.query(`${union} ORDER BY updated_at,collection,record_key`,[since]);
      for(const row of result.rows){
        const descriptor=DESCRIPTOR_BY_NAME.get(row.collection);if(!descriptor)continue;
        const key=String(row.record_key);const deleted=Boolean(row.deleted_at);
        applyRecord(this,descriptor,key,row.record,deleted);
        this.snapshots.get(descriptor.name).set(key,deleted?null:canonical(row.record));
        this.revisions.get(descriptor.name).set(key,Number(row.revision));
      }
      await client.query('COMMIT');
      this.lastRefreshAt=cutoff;
      rebuildDerivedIndexes(this);
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  collectChanges(){
    const changes=[];
    for(const descriptor of DESCRIPTORS){
      const current=currentRecords(this,descriptor);const snapshots=this.snapshots.get(descriptor.name);const revisions=this.revisions.get(descriptor.name);
      for(const [key,record] of current){
        if(!key||key==='undefined'||key==='null')throw new Error(`Missing persistence key in ${descriptor.name}.`);
        const next=canonical(record);const previous=snapshots.get(key);
        if(previous!==next)changes.push({collection:descriptor.name,descriptor,key,record:clone(record),deleted:false,previous,expectedRevision:revisions.get(key)});
      }
      for(const [key,previous] of snapshots){
        if(previous!==null&&!current.has(key))changes.push({collection:descriptor.name,descriptor,key,record:null,deleted:true,previous,expectedRevision:revisions.get(key)});
      }
    }
    return changes;
  }

  async commit(){
    const changes=this.collectChanges();if(!changes.length)return;
    const client=await this.pool.connect();const committed=[];
    try{
      await client.query('BEGIN');
      const cutoff=(await client.query('SELECT transaction_timestamp() AS cutoff')).rows[0].cutoff.toISOString();
      for(const change of changes){
        const {descriptor,key,record,deleted,previous,expectedRevision}=change;let result;
        if(expectedRevision===undefined){
          if(deleted)continue;
          result=await client.query(`INSERT INTO ${descriptor.table}(record_key,revision,record,deleted_at,updated_at) VALUES($1,1,$2,NULL,$3) ON CONFLICT(record_key) DO NOTHING RETURNING revision`,[key,record,cutoff]);
        }else if(deleted){
          result=await client.query(`UPDATE ${descriptor.table} SET revision=revision+1,deleted_at=$2,updated_at=$2 WHERE record_key=$1 AND revision=$3 AND deleted_at IS NULL RETURNING revision`,[key,cutoff,expectedRevision]);
        }else{
          result=await client.query(`UPDATE ${descriptor.table} SET revision=revision+1,record=$2,deleted_at=NULL,updated_at=$4 WHERE record_key=$1 AND revision=$3 RETURNING revision`,[key,record,expectedRevision,cutoff]);
        }
        if(result.rowCount!==1)throw conflict(descriptor.name,key);
        change.nextRevision=Number(result.rows[0].revision);
        await projectChange(client,change);
        committed.push(change);
      }
      await client.query('COMMIT');
      for(const change of committed){
        this.snapshots.get(change.collection).set(change.key,change.deleted?null:canonical(change.record));
        this.revisions.get(change.collection).set(change.key,change.nextRevision);
      }
      this.lastRefreshAt=cutoff;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async close(){await this.runExclusive(async()=>{await this.commit();});await this.pool.end();}
}
