import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {PostgresCampaignRepository,CampaignAnalytics} from '../src/services/campaign-analytics.mjs';
import {CampaignDailyDelivery,DailyDeliveryRepository} from '../src/services/campaign-daily-delivery.mjs';
import {PostgresSubscriptionReportService} from '../src/services/postgres-subscription-reports.mjs';
import {parseReportFilters} from '../src/services/subscription-reports.mjs';

test('isolated PostgreSQL campaign attribution, payment projection, Excel audit and delivery reservation', {skip:!process.env.TEST_DATABASE_URL}, async()=>{
  const {Pool}=await import('pg');const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:4});const {PostgresStore}=await import('../src/adapters/postgres-store.mjs');
  const store=await PostgresStore.connect({connectionString:process.env.TEST_DATABASE_URL,ssl:false});
  const date='2026-11-24',now=Date.parse(date+'T00:05:00+05:00'),config={nodeEnv:'test'},repo=new PostgresCampaignRepository(pool),analytics=new CampaignAnalytics({repository:repo,config,clock:()=>now}),eventId=randomUUID(),parameter='qa-'+randomUUID(),raw={utm:'M',package:'1',parameter,landingPath:'/landing1'};
  const user=store.findOrCreateUser({type:'email',value:randomUUID()+'@example.test'});
  const paidId=randomUUID(),providerReference='fixture-'+randomUUID(),scheduledDate='2026-11-23';
  try{
    const event=await analytics.publicEvent({headers:{}},{eventId,name:'landing_view',raw,consent:true});
    assert.equal(event.accepted,true);assert.ok(event.cookie);
    const req={headers:{cookie:event.cookie.split(';')[0]}};
    await analytics.link(req,user.id);
    const restored=new CampaignAnalytics({repository:new PostgresCampaignRepository(pool),config,clock:()=>now});
    const attr=await restored.checkout(req,{raw:{utm:'T'},userId:user.id});assert.equal(attr.parameter,parameter);assert.ok(attr.attribution_id);
    assert.equal((await restored.publicEvent(req,{eventId,name:'landing_view',raw,consent:true,userId:user.id})).accepted,false);
    await restored.stage('jazzcash_initiated',{attemptId:'attempt-'+paidId,attribution:attr,userId:user.id});
    const tx={id:paidId,userId:user.id,kind:'membership',purpose:'activation',planId:'monthly',provider:'JazzCash',providerReference,amountPkr:990,currency:'PKR',status:'paid',providerStatus:'paid',createdAt:new Date(now).toISOString(),paidAt:new Date(now).toISOString(),completedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),attribution:attr};
    store.createTransaction(tx);await store.commit();
    const filters={...parseReportFilters(new URLSearchParams({from:date,to:date})),parameter,platform:'Meta'};
    const service=new PostgresSubscriptionReportService({pool,clock:()=>now});
    const report=await service.campaignAttribution(filters);assert.equal(report.totals.subscriptions,1);assert.equal(report.totals.amountMinor,99000);
    const day=await restored.daily(date,{parameter,platform:'Meta'});assert.equal(day.landingViews,1);assert.equal(day.jazzCashInitiations,1);assert.equal(day.verifiedSuccessCount,1);assert.equal(day.mpinShown,null);
    const workbook=await service.exportCampaignWorkbook('all',filters,{actor:'fixture-finance',roles:['finance']});
    assert.equal(workbook.body.subarray(0,2).toString(),'PK');const audit=await pool.query('SELECT content_hash FROM ga_report_export_audit WHERE id=$1',[workbook.audit.id]);assert.equal(audit.rows[0].content_hash,createHash('sha256').update(workbook.body).digest('hex'));
    const deliveryRepo=new DailyDeliveryRepository(pool);const other=new DailyDeliveryRepository(pool);
    const reservations=await Promise.all([deliveryRepo.reserve(scheduledDate,'qa@example.test'),other.reserve(scheduledDate,'qa@example.test')]);assert.equal(reservations.filter(Boolean).length,1);
    await deliveryRepo.finish(scheduledDate,'sent','synthetic-qa');assert.equal(await other.reserve(scheduledDate,'qa@example.test'),false);
  }finally{
    await pool.query('DELETE FROM ga_campaign_daily_delivery WHERE report_date=$1',[scheduledDate]);
    await pool.query('DELETE FROM ga_campaign_events WHERE snapshot->>\'parameter\'=$1',[parameter]);
    await pool.query('DELETE FROM ga_campaign_attributions WHERE snapshot->>\'parameter\'=$1',[parameter]);
    await store.close();await pool.end();
  }
});
