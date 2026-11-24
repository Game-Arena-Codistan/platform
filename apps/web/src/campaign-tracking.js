import {telemetryEnabled} from './state.js';
const config={mode:'mock',apiBaseUrl:'',...(window.GAME_ARENA_CONFIG||{})};
let pending=Promise.resolve();
export function campaignEvent(name,campaign){
  if(config.mode!=='live')return Promise.resolve();
  const event={eventId:crypto.randomUUID(),name,campaign,consent:telemetryEnabled()};
  pending=pending.catch(()=>{}).then(async()=>{
    try{await fetch(config.apiBaseUrl+'/v1/campaign/events',{method:'POST',credentials:'include',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify(event),signal:AbortSignal.timeout(4000)});}catch{/* analytics never blocks checkout */}
  });
  return pending;
}
