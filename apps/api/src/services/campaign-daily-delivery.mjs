import {campaignError} from './campaign-analytics.mjs';
const fields=[['Landing views','landingViews'],['Identified unique visitors','identifiedUniqueVisitors'],['Unidentified landing views','unidentifiedLandingViews'],['HE traffic','heTraffic'],['NON HE traffic','nonHeTraffic'],['JazzCash initiations','jazzCashInitiations'],['Observed paywall visits','observedPaywallVisits'],['MPIN shown','mpinShown'],['MPIN submitted','mpinSubmitted'],['Verified successful transactions','verifiedSuccessCount'],['Observed payment attempts','observedPaymentAttempts'],['Observed failed attempts','observedFailedAttempts']];
export function dailyRows(data){return [['Report date',data.date],['Timezone',data.timezone],['Generated at',data.generatedAt],...Object.entries(data.filters||{}).map(([k,v])=>['Filter: '+k,v]),...fields.map(([label,key])=>[label,data[key]??'Unavailable']),[],['Failure code','Reason','Attempts'],...(data.failureReasons||[]).map(r=>[r.code,r.reason,r.count]),[],['Data availability','Explanation'],...Object.entries(data.limitations||{})];}
function cell(value){let s=String(value??'');if(typeof value==='string'&&/^[\s\u0000-\u001f]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function dailyCsv(data){return '\uFEFF'+dailyRows(data).map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';}
export function reportDue(now,sendTime){const pkt=new Date(now+5*3600000).toISOString();return pkt.slice(11,16)<sendTime?null:new Date(now+5*3600000-86400000).toISOString().slice(0,10);}
export function validateSchedule(value,allowed){const recipient=String(value?.recipient||'').trim().toLowerCase(),sendTime=String(value?.sendTime||'');if(typeof value?.enabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime))throw campaignError('Invalid daily email schedule.');if((recipient||value.enabled)&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||!allowed.includes(recipient)))throw campaignError('Recipient must be pre-approved by deployment configuration.');return{enabled:value.enabled,recipient,sendTime};}
export class DailyDeliveryRepository{
  constructor(pool){this.pool=pool;}
  async settings(){const {rows}=await this.pool.query('SELECT enabled,recipient,send_time AS "sendTime" FROM ga_campaign_daily_settings WHERE singleton=true');return rows[0]||{enabled:false,recipient:'',sendTime:'09:00'};}
  async update(v){await this.pool.query('UPDATE ga_campaign_daily_settings SET enabled=$1,recipient=$2,send_time=$3,updated_at=now() WHERE singleton=true',[v.enabled,v.recipient,v.sendTime]);return v;}
  async history(){const {rows}=await this.pool.query('SELECT report_date::text AS date,status,reserved_at AS "reservedAt",finished_at AS "finishedAt" FROM ga_campaign_daily_delivery ORDER BY report_date DESC LIMIT 30');return rows;}
  async reserve(date,recipient){const r=await this.pool.query("INSERT INTO ga_campaign_daily_delivery(report_date,recipient,status) VALUES($1,$2,'reserved') ON CONFLICT DO NOTHING",[date,recipient]);return r.rowCount===1;}
  async finish(date,status,messageId=null){await this.pool.query("UPDATE ga_campaign_daily_delivery SET status=$2,finished_at=now(),provider_message_id=$3 WHERE report_date=$1 AND status='reserved'",[date,status,messageId]);}
}
export class CampaignDailyDelivery{
  constructor({repository,analytics,config,env=process.env,clock=()=>Date.now(),fetchImpl=globalThis.fetch}){this.repo=repository;this.analytics=analytics;this.config=config;this.clock=clock;this.fetch=fetchImpl;this.allowed=[...new Set(String(env.CAMPAIGN_REPORT_ALLOWED_RECIPIENTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))];this.configured=Boolean(repository&&env.CAMPAIGN_REPORT_DELIVERY_ENABLED==='true'&&config.brevoApiKey&&config.brevoSenderEmail&&this.allowed.length);}
  async settings(){return{...(this.repo?await this.repo.settings():{enabled:false,recipient:'',sendTime:'09:00'}),deliveryConfigured:this.configured,allowedRecipients:this.allowed,history:this.repo?await this.repo.history():[]};}
  async update(value){if(!this.repo)throw campaignError('Daily report delivery requires PostgreSQL.',503);const s=validateSchedule(value,this.allowed);if(s.enabled&&!this.configured)throw campaignError('Email delivery is not configured.',503);return this.repo.update(s);}
  async tick(){
    if(!this.configured)return{status:'disabled'};
    const settings=await this.repo.settings();if(!settings.enabled||!this.allowed.includes(settings.recipient))return{status:'disabled'};
    const date=reportDue(this.clock(),settings.sendTime);if(!date)return{status:'not-due'};
    const data=await this.analytics.daily(date),attachment=Buffer.from(dailyCsv(data),'utf8').toString('base64');
    if(!await this.repo.reserve(date,settings.recipient))return{status:'already-reserved',date};
    // No blind retry after a network error: acceptance may already have happened.
    try{
      const r=await this.fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','api-key':this.config.brevoApiKey},body:JSON.stringify({sender:{email:this.config.brevoSenderEmail,name:this.config.brevoSenderName||'Game Arena'},to:[{email:settings.recipient}],subject:'Campaign & JazzCash Daily Logs | '+date,textContent:dailyRows(data).map(r=>r.join(' | ')).join('\n'),attachment:[{name:'campaign-jazzcash-'+date+'.csv',content:attachment}]})});
      if(!r.ok)throw Error('Email provider response not accepted');const result=await r.json();await this.repo.finish(date,'sent',typeof result.messageId==='string'?result.messageId.slice(0,255):null);return{status:'sent',date};
    }catch{await this.repo.finish(date,'uncertain');return{status:'uncertain',date};}
  }
}
