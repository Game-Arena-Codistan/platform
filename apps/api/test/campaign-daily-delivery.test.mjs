import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignDailyDelivery,dailyCsv,reportDue,validateSchedule} from '../src/services/campaign-daily-delivery.mjs';
const now=Date.parse('2026-11-24T04:00:00Z'),recipient='reports@example.test';
const data={date:'2026-11-23',timezone:'Asia/Karachi',generatedAt:'2026-11-24T04:00:00Z',landingViews:4,mpinShown:null,failureReasons:[{code:'=2+2',reason:'unmapped',count:1}],limitations:{mpin:'Unavailable'}};
test('PKT previous day, formula-safe CSV, recipient validation',()=>{
  assert.equal(reportDue(now,'09:00'),'2026-11-23');assert.equal(reportDue(now-60000,'09:00'),null);
  assert.throws(()=>validateSchedule({enabled:true,recipient:'wrong@example.test',sendTime:'09:00'},[recipient]));
  assert.throws(()=>validateSchedule({enabled:true,recipient,sendTime:'25:00'},[recipient]));
  assert.match(dailyCsv(data),/"'=2\+2"/);assert.match(dailyCsv(data),/"MPIN shown","Unavailable"/);
});
for(const fail of [false,true])test('delivery reserves once before network send: '+(fail?'uncertain':'sent'),async()=>{
  const calls=[],reserved=new Set(),results=[];
  const repository={settings:async()=>({enabled:true,recipient,sendTime:'09:00'}),reserve:async date=>{if(reserved.has(date))return false;reserved.add(date);return true;},finish:async(...args)=>results.push(args)};
  const delivery=new CampaignDailyDelivery({repository,analytics:{daily:async()=>data},config:{brevoApiKey:'test',brevoSenderEmail:'sender@example.test'},env:{CAMPAIGN_REPORT_DELIVERY_ENABLED:'true',CAMPAIGN_REPORT_ALLOWED_RECIPIENTS:recipient},clock:()=>now,fetchImpl:async(_,options)=>{calls.push(JSON.parse(options.body));if(fail)throw Error('timeout');return{ok:true,json:async()=>({messageId:'synthetic'})};}});
  assert.equal((await delivery.tick()).status,fail?'uncertain':'sent');assert.equal((await delivery.tick()).status,'already-reserved');
  assert.equal(calls.length,1);assert.equal(calls[0].subject,'Campaign & JazzCash Daily Logs | 2026-11-23');
  assert.equal(Buffer.from(calls[0].attachment[0].content,'base64').toString(),dailyCsv(data));assert.equal(results[0][1],fail?'uncertain':'sent');
  const disabled=new CampaignDailyDelivery({repository,analytics:{daily:async()=>data},config:{},env:{},fetchImpl:()=>assert.fail('must not send')});assert.equal((await disabled.tick()).status,'disabled');
});
