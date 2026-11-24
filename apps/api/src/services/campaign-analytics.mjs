import {randomUUID} from 'node:crypto';
import {randomToken,sha256,parseCookies} from '../lib/security.mjs';
const TTL=30*86400000,COOKIE='ga_campaign',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const paths=new Set(['/mainLanding','/landing1','/landing2']);
const publicEvents=new Set(['landing_view','landing_cta','subscribe','begin_checkout','consent_changed']);
const stageEvents=new Set(['jazzcash_initiated','payment_attempt','payment_failed','payment_cancelled','payment_succeeded','wallet_link_failed']);
const safeCode=value=>{const s=typeof value==='string'?value.trim().slice(0,80):'';return /^[A-Za-z0-9._ -]+$/.test(s)&&!/\d{10,}/.test(s)?s:'';};
const platform=value=>{const s=safeCode(value).toLowerCase();const aliases={m:'Meta',meta:'Meta',facebook:'Meta',instagram:'Meta',t:'TikTok',tiktok:'TikTok',s:'Snapchat',snapchat:'Snapchat',g:'Google',google:'Google',d:'Direct',direct:'Direct',organic:'Organic'};return Object.hasOwn(aliases,s)?aliases[s]:s?'Unknown':'Direct';};
export const campaignError=(message,status=400,code='invalid_campaign')=>Object.assign(new Error(message),{status,code});
export function campaignSnapshot(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
  const out={};
  for(const key of ['utm','utm_source','utm_campaign','utm_medium','utm_content','utm_term','package','parameter','ref','creative_id']){const value=safeCode(raw[key]);if(value)out[key]=value;}
  if(raw.campaign_id&&UUID.test(raw.campaign_id))out.campaign_id=raw.campaign_id;
  const path=String(raw.landingPath||raw.landing_page||'').split(/[?#]/)[0];
  if(paths.has(path))out.landingPath=path;
  if(['landing1','landing2','mainLanding'].includes(raw.landing))out.landing=raw.landing;
  out.platform=platform(out.utm||out.utm_source);
  if(out.utm&&!out.utm_source)out.utm_source=out.utm;
  if(out.utm_source&&!out.utm)out.utm=out.utm_source;
  if(out.ref)out.referral=out.ref;
  return out;
}
export function campaignConfig(raw,id=randomUUID()){
  const snapshot=campaignSnapshot({...raw,campaign_id:id});
  if(!snapshot.landingPath)throw campaignError('Choose a supported landing page.');
  if(!['default','1','2','monthly','yearly'].includes(snapshot.package||''))throw campaignError('Choose a supported package.');
  if(!snapshot.utm||!snapshot.parameter)throw campaignError('Platform and parameter are required.');
  const name=safeCode(raw.name);
  if(!name)throw campaignError('A campaign name is required.');
  return{id,name,snapshot,active:raw.active!==false};
}
export function campaignLink(config,origin){
  const url=new URL(config.snapshot.landingPath,origin);
  for(const key of ['campaign_id','utm','utm_source','utm_campaign','utm_medium','utm_content','utm_term','package','parameter','ref','creative_id'])if(config.snapshot[key])url.searchParams.set(key,config.snapshot[key]);
  url.searchParams.set('payment','jazzcash');return url.toString();
}
export function pakistanDay(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw campaignError('Date must be YYYY-MM-DD.');
  const start=Date.parse(date+'T00:00:00+05:00');
  if(!Number.isFinite(start)||new Date(start+5*3600000).toISOString().slice(0,10)!==date)throw campaignError('Invalid reporting date.');
  return{from:new Date(start).toISOString(),to:new Date(start+86400000).toISOString()};
}
const snapshotFields={platform:'platform',planId:'package',parameter:'parameter',landingPage:'landingPath',referral:'ref',campaignId:'campaign_id'};
function matches(snapshot,filters){return Object.entries(snapshotFields).every(([filter,key])=>!filters[filter]||String(snapshot?.[key]||'')===filters[filter]);}
function eventMetrics(rows){
  const list=name=>rows.filter(r=>r.eventName===name),unique=(items,key)=>new Set(items.map(r=>r[key]).filter(Boolean)).size;
  const landing=list('landing_view'),paywall=list('paywall_view'),initiated=list('jazzcash_initiated'),attempts=list('payment_attempt'),failed=list('payment_failed');
  const failures=new Map();for(const r of failed){const code=r.failureCode||'unknown';if(!failures.has(code))failures.set(code,new Set());failures.get(code).add(r.attemptId||r.eventKey);}
  return{landingViews:landing.length,identifiedUniqueVisitors:unique(landing,'anonymousId'),unidentifiedLandingViews:landing.filter(r=>!r.anonymousId).length,jazzCashInitiations:unique(initiated,'attemptId'),observedPaywallVisits:paywall.length?unique(paywall,'attemptId'):null,observedPaymentAttempts:unique(attempts,'attemptId'),observedFailedAttempts:unique(failed,'attemptId'),failureReasons:[...failures].map(([code,ids])=>({code,reason:'unmapped',count:ids.size})),heTraffic:null,nonHeTraffic:null,mpinShown:null,mpinSubmitted:null};
}
export class MemoryCampaignRepository{
  constructor(){this.configs=new Map();this.attributions=new Map();this.events=new Map();}
  async list(){return [...this.configs.values()].slice(0,500);}
  async get(id){return this.configs.get(id)||null;}
  async put(config){this.configs.set(config.id,structuredClone(config));return config;}
  async attribution(hash,now){const r=this.attributions.get(hash);return r&&!r.revokedAt&&r.expiresAt>now?structuredClone(r):null;}
  async createAttribution(row){this.attributions.set(row.tokenHash,structuredClone(row));return row;}
  async claim(hash,userId,now){const r=await this.attribution(hash,now);if(!r||r.userId&&r.userId!==userId)return null;r.userId=userId;this.attributions.set(hash,r);return r;}
  async revoke(hash,now){const r=this.attributions.get(hash);if(r)r.revokedAt=now;}
  async event(row){if(this.events.has(row.eventKey))return false;this.events.set(row.eventKey,structuredClone(row));return true;}
  async daily(range,filters){const rows=[...this.events.values()].filter(r=>r.occurredAt>=range.from&&r.occurredAt<range.to&&matches(r.snapshot,filters));return{...eventMetrics(rows),verifiedSuccessCount:null};}
}
export class PostgresCampaignRepository{
  constructor(pool){this.pool=pool;}
  async list(){const r=await this.pool.query('SELECT snapshot FROM ga_campaign_configs ORDER BY updated_at DESC LIMIT 500');return r.rows.map(x=>x.snapshot);}
  async get(id){if(!UUID.test(id||''))return null;const r=await this.pool.query('SELECT snapshot FROM ga_campaign_configs WHERE id=$1',[id]);return r.rows[0]?.snapshot||null;}
  async put(config){await this.pool.query('INSERT INTO ga_campaign_configs(id,snapshot,active) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET snapshot=EXCLUDED.snapshot,active=EXCLUDED.active,updated_at=now()',[config.id,config,config.active]);return config;}
  async attribution(hash,now){const r=await this.pool.query('SELECT id,token_hash AS "tokenHash",anonymous_id AS "anonymousId",user_id AS "userId",snapshot,extract(epoch FROM first_seen_at)*1000 AS "firstSeenAt",extract(epoch FROM expires_at)*1000 AS "expiresAt" FROM ga_campaign_attributions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>$2',[hash,new Date(now)]);return r.rows[0]||null;}
  async createAttribution(r){await this.pool.query('INSERT INTO ga_campaign_attributions(id,token_hash,anonymous_id,user_id,snapshot,first_seen_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[r.id,r.tokenHash,r.anonymousId,r.userId,r.snapshot,new Date(r.firstSeenAt),new Date(r.expiresAt)]);return r;}
  async claim(hash,userId,now){const r=await this.pool.query('UPDATE ga_campaign_attributions SET user_id=$2 WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>$3 AND (user_id IS NULL OR user_id=$2) RETURNING id',[hash,userId,new Date(now)]);return r.rowCount?this.attribution(hash,now):null;}
  async revoke(hash,now){await this.pool.query('UPDATE ga_campaign_attributions SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL',[hash,new Date(now)]);}
  async event(r){const result=await this.pool.query('INSERT INTO ga_campaign_events(event_key,event_name,occurred_at,attribution_id,anonymous_id,user_id,attempt_id,order_id,snapshot,failure_code,consent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(event_key) DO NOTHING',[r.eventKey,r.eventName,r.occurredAt,r.attributionId,r.anonymousId,r.userId,r.attemptId,r.orderId,r.snapshot,r.failureCode,r.consent]);return result.rowCount===1;}
  async daily(range,filters){
    const values=[range.from,range.to],clauses=['occurred_at >= $1','occurred_at < $2'];
    for(const [name,key] of Object.entries(snapshotFields))if(filters[name]){values.push(filters[name]);clauses.push("snapshot->>'"+key+"'=$"+values.length);}
    const where=clauses.join(' AND ');
    const r=await this.pool.query("SELECT count(*) FILTER(WHERE event_name='landing_view') AS landing_views,count(DISTINCT anonymous_id) FILTER(WHERE event_name='landing_view') AS unique_visitors,count(*) FILTER(WHERE event_name='landing_view' AND anonymous_id IS NULL) AS unidentified,count(DISTINCT attempt_id) FILTER(WHERE event_name='jazzcash_initiated') AS initiated,count(DISTINCT attempt_id) FILTER(WHERE event_name='payment_attempt') AS attempts,count(DISTINCT attempt_id) FILTER(WHERE event_name='payment_failed') AS failures FROM ga_campaign_events WHERE "+where,values);
    const counts=r.rows[0];const failures=await this.pool.query("SELECT coalesce(failure_code,'unknown') AS code,count(DISTINCT attempt_id) AS count FROM ga_campaign_events WHERE "+where+" AND event_name='payment_failed' GROUP BY 1 ORDER BY count DESC LIMIT 100",values);
    // Official successful charges are read from the payment projection, never public event counters.
    const payValues=[range.from,range.to],payClauses=["kind='membership'","internal_status IN ('paid','refunded')","completed_at >= $1","completed_at < $2"];
    for(const [name,key] of Object.entries(snapshotFields))if(filters[name]){payValues.push(filters[name]);payClauses.push("safe_record->'attribution'->>'"+key+"'=$"+payValues.length);}
    const success=await this.pool.query("SELECT count(DISTINCT coalesce(provider_reference,id::text)) AS count FROM ga_payment_attempts WHERE "+payClauses.join(' AND '),payValues);
    return{landingViews:Number(counts.landing_views),identifiedUniqueVisitors:Number(counts.unique_visitors),unidentifiedLandingViews:Number(counts.unidentified),jazzCashInitiations:Number(counts.initiated),observedPaywallVisits:null,observedPaymentAttempts:Number(counts.attempts),observedFailedAttempts:Number(counts.failures),failureReasons:failures.rows.map(row=>({code:row.code,reason:'unmapped',count:Number(row.count)})),verifiedSuccessCount:Number(success.rows[0].count),heTraffic:null,nonHeTraffic:null,mpinShown:null,mpinSubmitted:null};
  }
}
function readToken(req){try{const token=parseCookies(req.headers.cookie)[COOKIE];return /^[A-Za-z0-9_-]{43}$/.test(token||'')?token:null;}catch{return null;}}
function consentState(value){return value===true?'granted':value===false?'denied':'unknown';}
export class CampaignAnalytics{
  constructor({repository,config,clock=()=>Date.now()}){this.repo=repository;this.config=config;this.clock=clock;}
  cookie(token,age){return COOKIE+'='+encodeURIComponent(token)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(['test','development'].includes(this.config.nodeEnv)?'':'; Secure');}
  async snapshot(raw){const s=campaignSnapshot(raw);if(s.campaign_id){const found=await this.repo.get(s.campaign_id);if(found?.active)return found.snapshot;delete s.campaign_id;}return s;}
  async capture(req,{raw,consent,userId=null}){
    const token=readToken(req),now=this.clock();const state=consentState(consent);const snapshot=await this.snapshot(raw);
    if(state!=='granted'){if(token&&state==='denied')await this.repo.revoke(sha256(token),now);return{snapshot,record:null,consent:state,cookie:token&&state==='denied'?this.cookie('',0):null};}
    let record=token?await this.repo.attribution(sha256(token),now):null;
    if(record&&record.userId&&record.userId!==userId)record=null;
    if(record&&userId&&!record.userId)record=await this.repo.claim(sha256(token),userId,now);
    if(record)return{snapshot:record.snapshot,record,consent:state,cookie:null};
    const next=randomToken(32);
    record=await this.repo.createAttribution({id:randomUUID(),tokenHash:sha256(next),anonymousId:randomUUID(),userId,snapshot,firstSeenAt:now,expiresAt:now+TTL});
    return{snapshot:record.snapshot,record,consent:state,cookie:this.cookie(next,TTL/1000)};
  }
  async link(req,userId){const token=readToken(req);if(token)await this.repo.claim(sha256(token),userId,this.clock());}
  async checkout(req,{raw,userId=null}){
    const token=readToken(req),record=token?await this.repo.attribution(sha256(token),this.clock()):null;
    if(record&&(!record.userId||record.userId===userId)){
      if(userId&&!record.userId)await this.repo.claim(sha256(token),userId,this.clock());
      return{...record.snapshot,attribution_id:record.id,anonymous_id:record.anonymousId,consent:'granted'};
    }
    return{...await this.snapshot(raw),consent:'unknown'};
  }
  async publicEvent(req,{eventId,name,raw,consent,userId=null}){
    if(!UUID.test(eventId||'')||!publicEvents.has(name))throw campaignError('Unsupported campaign event.');
    const context=await this.capture(req,{raw,consent,userId});
    const accepted=await this.repo.event({eventKey:'browser:'+eventId,eventName:name,occurredAt:new Date(this.clock()).toISOString(),attributionId:context.record?.id||null,anonymousId:context.record?.anonymousId||null,userId:context.record?userId:null,attemptId:null,orderId:null,snapshot:context.snapshot,failureCode:null,consent:context.consent});
    return{accepted,cookie:context.cookie};
  }
  async stage(name,{attemptId,orderId=null,attribution={},failureCode=null,userId=null}){
    if(!stageEvents.has(name)||!attemptId||String(attemptId).length>100)return false;
    const snapshot=campaignSnapshot(attribution),id=String(attemptId);
    return this.repo.event({eventKey:'server:'+name+':'+id,eventName:name,occurredAt:new Date(this.clock()).toISOString(),attributionId:UUID.test(attribution.attribution_id||'')?attribution.attribution_id:null,anonymousId:UUID.test(attribution.anonymous_id||'')?attribution.anonymous_id:null,userId,attemptId:id,orderId,snapshot,failureCode:safeCode(failureCode)||null,consent:['granted','denied'].includes(attribution.consent)?attribution.consent:'unknown'});
  }
  async daily(date,filters={}){return{date,timezone:'Asia/Karachi',generatedAt:new Date(this.clock()).toISOString(),filters,...await this.repo.daily(pakistanDay(date),filters),limitations:{he:'unavailable — provider/product classification required',mpin:'unavailable — provider telemetry required',paywall:'provider page visits unavailable; JazzCash initiations reported separately',failureReasons:'provider code mapping pending; observed charge failures only',uniqueVisitors:'only consented server attribution identities counted; unconsented traffic counted separately',success:'captured membership payment projection; external provider projection and refund/renewal policy pending'}};}
}
