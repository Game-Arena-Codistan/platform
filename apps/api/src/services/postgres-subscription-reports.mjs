import {MemoryStore} from '../adapters/memory-store.mjs';
import {SubscriptionReportService} from './subscription-reports.mjs';

const MAX_REPORT_ROWS=10000;
const OVERFLOW_ROWS=MAX_REPORT_ROWS+1;
const fail=(message,status=413,code='report_query_too_large')=>Object.assign(new Error(message),{status,code});
const uniqueById=rows=>[...new Map(rows.filter(Boolean).map(item=>[item.id??item.version??JSON.stringify(item),item])).values()];
const normalizedPayment=item=>({...item,paidAt:item.paidAt??item.completedAt??null,completedAt:item.completedAt??item.paidAt??null});

function push(values,value){values.push(value);return `$${values.length}`;}
function bounded(rows,label){
  if(rows.length>MAX_REPORT_ROWS)throw fail(`${label} exceeds ${MAX_REPORT_ROWS} rows. Narrow the date range or filters.`);
  return rows;
}
function rangeClause(filters,columns,values){
  const from=push(values,filters.fromIso);const to=push(values,filters.toExclusiveIso);
  return `(${columns.map(column=>`(${column} >= ${from}::timestamptz AND ${column} < ${to}::timestamptz)`).join(' OR ')})`;
}
function response(result){return{...result,dataSource:'postgresql-indexed'};}

export class PostgresSubscriptionReportService{
  constructor({pool,clock=()=>Date.now()}){this.pool=pool;this.clock=clock;}

  async plans(){
    const result=await this.pool.query('SELECT snapshot FROM ga_plan_versions ORDER BY plan_id,version');
    return result.rows.map(row=>row.snapshot);
  }

  async identities(userIds){
    if(!userIds.length)return[];
    const result=await this.pool.query(`SELECT record_key,record FROM ga_runtime_identities
      WHERE deleted_at IS NULL AND record->>'userId'=ANY($1::text[])
      ORDER BY record_key LIMIT ${OVERFLOW_ROWS}`,[userIds]);
    return bounded(result.rows,'Identity lookup');
  }

  async transactions(filters,{userIds=[],membershipOnly=false,extensionsOnly=false}={}){
    const values=[];const conditions=[];
    if(userIds.length)conditions.push(`user_id=ANY(${push(values,userIds)}::uuid[])`);
    else conditions.push(rangeClause(filters,['created_at','completed_at','refunded_at','updated_at'],values));
    if(membershipOnly)conditions.push("kind='membership'");
    if(extensionsOnly)conditions.push("kind='membership' AND purpose='extension' AND internal_status='paid'");
    if(filters.planId)conditions.push(`plan_id=${push(values,filters.planId)}`);
    if(filters.paymentStatus){const status=push(values,filters.paymentStatus);conditions.push(`(internal_status=${status} OR provider_status=${status})`);}
    if(filters.purpose)conditions.push(`purpose=${push(values,filters.purpose)}`);
    if(filters.query){const query=push(values,`%${filters.query}%`);conditions.push(`(lower(id::text) LIKE ${query} OR lower(user_id::text) LIKE ${query} OR lower(COALESCE(provider_reference,'')) LIKE ${query})`);}
    const result=await this.pool.query(`SELECT safe_record FROM ga_payment_attempts
      WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT ${OVERFLOW_ROWS}`,values);
    return bounded(result.rows.map(row=>normalizedPayment(row.safe_record)),'Payment report');
  }

  async subscriptions(filters){
    const values=[];const to=push(values,filters.toExclusiveIso);const from=push(values,filters.fromIso);
    const conditions=[`((activation_at < ${to}::timestamptz AND COALESCE(expires_at,current_period_ends_at,updated_at) >= ${from}::timestamptz)
      OR (updated_at >= ${from}::timestamptz AND updated_at < ${to}::timestamptz))`];
    if(filters.planId)conditions.push(`plan_id=${push(values,filters.planId)}`);
    if(filters.subscriptionStatus)conditions.push(`status=${push(values,filters.subscriptionStatus)}`);
    if(filters.autoRenew==='true'||filters.autoRenew==='false')conditions.push(`auto_renew=${push(values,filters.autoRenew==='true')}`);
    if(filters.query){
      const query=push(values,`%${filters.query}%`);
      conditions.push(`(lower(id::text) LIKE ${query} OR lower(user_id::text) LIKE ${query} OR EXISTS(
        SELECT 1 FROM ga_runtime_identities identity
        WHERE identity.deleted_at IS NULL AND identity.record->>'userId'=ga_subscription_periods.user_id::text
          AND lower(COALESCE(identity.record->>'value','')) LIKE ${query}
      ))`);
    }
    const result=await this.pool.query(`SELECT record FROM ga_subscription_periods
      WHERE ${conditions.join(' AND ')} ORDER BY activation_at DESC,id DESC LIMIT ${OVERFLOW_ROWS}`,values);
    return bounded(result.rows.map(row=>row.record),'Subscription report');
  }

  async reconciliationRows(filters){
    const values=[];const conditions=[rangeClause(filters,['created_at','updated_at'],values)];
    if(filters.query){const query=push(values,`%${filters.query}%`);conditions.push(`(lower(id::text) LIKE ${query} OR lower(COALESCE(transaction_id::text,'')) LIKE ${query} OR lower(reason) LIKE ${query})`);}
    const result=await this.pool.query(`SELECT safe_record FROM ga_reconciliation_cases
      WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT ${OVERFLOW_ROWS}`,values);
    return bounded(result.rows.map(row=>row.safe_record),'Reconciliation report');
  }

  async benefitRows(filters){
    const values=[];const conditions=[rangeClause(filters,['created_at','updated_at'],values)];
    if(filters.query){const query=push(values,`%${filters.query}%`);conditions.push(`(lower(id::text) LIKE ${query} OR lower(user_id::text) LIKE ${query} OR lower(benefit_type) LIKE ${query})`);}
    const result=await this.pool.query(`SELECT safe_record FROM ga_benefit_ledger
      WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT ${OVERFLOW_ROWS}`,values);
    return bounded(result.rows.map(row=>row.safe_record),'Benefit report');
  }

  async exportRows(filters){
    const result=await this.pool.query(`SELECT id,actor_id AS actor,report_type AS "reportType",safe_filters AS filters,
      row_count AS "rowCount",schema_version AS "schemaVersion",content_hash AS "contentHash",generated_at AS "generatedAt"
      FROM ga_report_export_audit WHERE generated_at >= $1 AND generated_at < $2
      ORDER BY generated_at DESC,id DESC LIMIT ${OVERFLOW_ROWS}`,[filters.fromIso,filters.toExclusiveIso]);
    return bounded(result.rows,'Export history');
  }

  async calculator(filters,type){
    const snapshot=new MemoryStore();
    snapshot.transactions=new Map();snapshot.entitlementHistory=[];snapshot.reconciliationCases=[];
    snapshot.benefitLedger=[];snapshot.reportExports=[];snapshot.planVersions=await this.plans();

    let transactions=[];let subscriptions=[];
    if(['summary','payments','subscriptions','recurring-customers'].includes(type)){
      transactions=await this.transactions(filters,{membershipOnly:type==='summary'||type==='subscriptions'||type==='recurring-customers',extensionsOnly:type==='recurring-customers'});
    }
    if(['summary','subscriptions','recurring-customers'].includes(type))subscriptions=await this.subscriptions(filters);
    if((type==='subscriptions'||type==='recurring-customers')&&subscriptions.length){
      const userIds=[...new Set(subscriptions.map(item=>item.userId).filter(Boolean))];
      transactions=uniqueById([...transactions,...await this.transactions(filters,{userIds,membershipOnly:true})]);
    }
    if(type==='summary'){
      const extensionRows=await this.transactions(filters,{membershipOnly:true,extensionsOnly:true});
      transactions=uniqueById([...transactions,...extensionRows]);
    }
    if(type==='reconciliation')snapshot.reconciliationCases=await this.reconciliationRows(filters);
    if(type==='benefit-costs'||type==='summary')snapshot.benefitLedger=await this.benefitRows(filters);
    if(type==='exports')snapshot.reportExports=await this.exportRows(filters);

    snapshot.transactions=new Map(transactions.map(item=>[item.id,item]));
    snapshot.entitlementHistory=subscriptions;
    snapshot.entitlements=new Map();
    for(const item of subscriptions){
      const current=snapshot.entitlements.get(item.userId);
      const itemTime=Number(item.updatedAt??item.expiresAt??item.startsAt??0);
      const currentTime=Number(current?.updatedAt??current?.expiresAt??current?.startsAt??0);
      if(!current||itemTime>=currentTime)snapshot.entitlements.set(item.userId,item);
    }
    const userIds=[...new Set([
      ...transactions.map(item=>item.userId),...subscriptions.map(item=>item.userId),
      ...snapshot.benefitLedger.map(item=>item.userId)
    ].filter(Boolean))];
    snapshot.identities=new Map((await this.identities(userIds)).map(row=>[row.record_key,row.record]));
    snapshot.usersByIdentity=new Map([...snapshot.identities.entries()].map(([key,item])=>[key,item.userId]));
    return new SubscriptionReportService({store:snapshot,clock:this.clock});
  }

  async summary(filters){return response((await this.calculator(filters,'summary')).summary(filters));}
  async paymentLedger(filters){return response((await this.calculator(filters,'payments')).paymentLedger(filters));}
  async subscriptionLedger(filters){return response((await this.calculator(filters,'subscriptions')).subscriptionLedger(filters));}
  async recurringCustomers(filters){return response((await this.calculator(filters,'recurring-customers')).recurringCustomers(filters));}
  async reconciliation(filters){return response((await this.calculator(filters,'reconciliation')).reconciliation(filters));}
  async benefitCosts(filters){return response((await this.calculator(filters,'benefit-costs')).benefitCosts(filters));}
  async exportHistory(filters){return response((await this.calculator(filters,'exports')).exportHistory(filters));}

  async export(type,filters,principal){
    const calculator=await this.calculator(filters,type);
    const result=calculator.export(type,filters,principal);
    const audit=result.audit;
    await this.pool.query(`INSERT INTO ga_report_export_audit(id,actor_id,report_type,selected_range,safe_filters,row_count,schema_version,content_hash,generated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,[
      audit.id,audit.actor,audit.reportType,{from:filters.fromIso,toExclusive:filters.toExclusiveIso},
      filters,result.rowCount,audit.schemaVersion,audit.contentHash,audit.generatedAt
    ]);
    return{...result,dataSource:'postgresql-indexed'};
  }
}
