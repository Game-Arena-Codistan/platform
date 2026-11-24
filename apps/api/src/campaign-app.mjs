import {randomUUID} from 'node:crypto';
import {readJson,send,problem} from './lib/http.mjs';
import {parseCookies,sha256,requestIp} from './lib/security.mjs';
import {authenticateAdmin} from './lib/admin-auth.mjs';
import {campaignConfig,campaignLink,campaignError} from './services/campaign-analytics.mjs';
const deny=()=>campaignError('Origin is not allowed.',403,'origin_rejected');
function userFor(req,config,store){try{const token=parseCookies(req.headers.cookie)[config.sessionCookieName];return token?store.getSession(sha256(token))?.userId||null:null;}catch{return null;}}
export function createCampaignApp({config,store,analytics}){
  return async(req,res)=>{
    const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method||'GET';
    if(path!=='/v1/campaign/events'&&!path.startsWith('/v1/admin/campaign/'))return false;
    const requestId=String(req.headers['x-request-id']||randomUUID()).slice(0,80);
    try{
      if(path==='/v1/campaign/events'&&method==='POST'){
        if(!config.allowedOrigins.includes(req.headers.origin))throw deny();
        if(store.hitRateLimit('campaign-events:'+sha256(requestIp(req)),90,60000))throw campaignError('Too many events.',429,'rate_limited');
        const {value}=await readJson(req,8192);
        const result=await analytics.publicEvent(req,{eventId:value.eventId,name:value.name,raw:value.campaign||{},consent:value.consent,userId:userFor(req,config,store)});
        send(res,202,{accepted:result.accepted},result.cookie?{'set-cookie':result.cookie}:{});return true;
      }
      if(path==='/v1/admin/campaign/configs'&&method==='GET'){
        authenticateAdmin(req,config,['admin','finance','operator','support','security']);
        const campaigns=(await analytics.repo.list()).map(c=>({...c,link:campaignLink(c,config.publicOrigin)}));
        send(res,200,{campaigns});return true;
      }
      const configMatch=path.match(/^\/v1\/admin\/campaign\/configs\/([0-9a-f-]{36})$/i);
      if(path==='/v1/admin/campaign/configs'&&method==='POST'||configMatch&&method==='PATCH'){
        const principal=authenticateAdmin(req,config,['admin']);
        const {value}=await readJson(req,8192);
        const old=configMatch?await analytics.repo.get(configMatch[1]):null;
        if(configMatch&&!old)throw campaignError('Campaign not found.',404,'not_found');
        const item=campaignConfig(old?{...old.snapshot,name:old.name,active:old.active,...value}:value,old?.id);
        await analytics.repo.put(item);
        store.audit.write({actor:principal.actor,action:old?'campaign.updated':'campaign.created',targetType:'campaign',targetId:item.id,metadata:{active:item.active}});
        send(res,old?200:201,{campaign:{...item,link:campaignLink(item,config.publicOrigin)}});return true;
      }
      if(path==='/v1/admin/campaign/daily-log'&&method==='GET'){
        authenticateAdmin(req,config,['admin','finance','operator','support','security']);
        const filters=Object.fromEntries(['platform','planId','parameter','landingPage','referral','campaignId'].filter(k=>url.searchParams.get(k)).map(k=>[k,url.searchParams.get(k).slice(0,120)]));
        const data=await analytics.daily(url.searchParams.get('date')||'',filters);
        send(res,200,data);return true;
      }
      throw campaignError('Not found.',404,'not_found');
    }catch(error){problem(res,error,requestId);return true;}
  };
}
