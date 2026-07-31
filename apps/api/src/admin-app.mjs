import {randomUUID} from 'node:crypto';
import {corsHeaders,readJson,send} from './lib/http.mjs';
import {requestIp,sha256} from './lib/security.mjs';
import {authenticateAdmin} from './lib/admin-auth.mjs';
const ANALYTICS=new Set(['route_view','game_impression','game_play_intent','game_start','game_exit','game_complete','upgrade_view','plan_select','checkout_start','checkout_complete','otp_request','otp_complete','account_export','setting_change','web_vital','frontend_error']);
const SENSITIVE=/(phone|email|otp|token|secret|payment|identifier|session|cnic|address)/i;
const fail=(message,status=400,code='invalid_request')=>Object.assign(new Error(message),{status,code});
export function createSupplementalApp({config,store}){
  const admin=(req,roles)=>authenticateAdmin(req,config,roles);
  return async function supplemental(req,res){const url=new URL(req.url,'http://localhost');const path=url.pathname;const method=req.method||'GET';const cors=corsHeaders(req.headers.origin,config.allowedOrigins);const reply=(status,payload)=>send(res,status,payload,cors);
    if(method==='POST'&&path==='/v1/events'){
      try{const ipHash=sha256(requestIp(req));if(store.hitRateLimit(`analytics:${ipHash}`,120,60000))throw fail('Too many events.',429,'rate_limited');const {value}=await readJson(req,8192);if(!ANALYTICS.has(value.name))throw fail('Unsupported analytics event.',400,'invalid_event');const properties=Object.fromEntries(Object.entries(value.properties||{}).filter(([key,item])=>!SENSITIVE.test(key)&&['string','number','boolean'].includes(typeof item)).slice(0,20));store.metrics.increment('analytics_events_total',{name:value.name});if(value.name==='web_vital'&&Number.isFinite(Number(properties.value)))store.metrics.observe(`web_vital_${String(properties.metric||'unknown').replace(/[^a-z0-9_-]/gi,'_')}`,Number(properties.value));return reply(202,{accepted:true,eventId:randomUUID()});}catch(error){return reply(error.status||400,{error:{code:error.code||'invalid_event',message:error.message}});}
    }
    if(!path.startsWith('/v1/admin/'))return false;
    try{
      if(method==='GET'&&path==='/v1/admin/games'){admin(req,['admin','operator','support','security']);return reply(200,{games:store.games.map(game=>({...game,state:game.status,versions:[{version:game.version||'external',gameUrl:game.gameUrl,status:game.status}]})),reports:[]});}
      if(method==='GET'&&path==='/v1/admin/reviews'){admin(req,['admin','operator','support','security','finance']);return reply(200,{results:store.scoreEvents.filter(item=>item.status==='review'||item.status==='rejected').slice(-500),adjustments:[...store.adjustments.values()].filter(item=>item.status==='pending_approval'),reconciliationCases:store.reconciliationCases.filter(item=>item.status==='open')});}
      return false;
    }catch(error){reply(error.status||500,{error:{code:error.code||'internal_error',message:error.status>=500?'Unexpected server error.':error.message}});return true;}
  };
}
