const META_NAME='game-arena-tiktok-pixel-id';
const SCRIPT_ID='game-arena-tiktok-pixel';
const DEFAULT_PIXEL_ID='DBU5QTJC77UCDH70PUBG';

function resolvePixelId(){
  try{
    const meta=document.querySelector(`meta[name="${META_NAME}"]`)?.getAttribute('content')||'';
    const fromConfig=String(window.GAME_ARENA_CONFIG?.tiktokPixelId||'').trim();
    const fromEnv=String(window.GAME_ARENA_CONFIG?.TIKTOK_PIXEL_ID||'').trim();
    const id=(meta||fromConfig||fromEnv||DEFAULT_PIXEL_ID).trim();
    return /^[A-Z0-9]{10,}$/i.test(id)?id:'';
  }catch{return '';}
}

function ensureTtq(){
  const id=resolvePixelId();
  if(!id)return null;
  if(typeof window.ttq?.track==='function'&&window.__GAME_ARENA_TIKTOK_PIXEL_ID===id)return window.ttq;
  window.TiktokAnalyticsObject='ttq';
  const ttq=window.ttq=window.ttq||[];
  if(!ttq.loaded){
    ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];
    ttq.setAndDefer=function(target,method){target[method]=function(){target.push([method].concat(Array.prototype.slice.call(arguments,0)));};};
    for(const method of ttq.methods)ttq.setAndDefer(ttq,method);
    ttq.instance=function(name){
      const instance=ttq._i[name]||[];
      ttq._i[name]=instance;
      for(const method of ttq.methods)ttq.setAndDefer(instance,method);
      return instance;
    };
    ttq.load=function(pixelId,options){
      const url='https://analytics.tiktok.com/i18n/pixel/events.js';
      ttq._i=ttq._i||{};
      ttq._i[pixelId]=[];
      ttq._i[pixelId]._u=url;
      ttq._t=ttq._t||{};
      ttq._t[pixelId]=+new Date();
      ttq._o=ttq._o||{};
      ttq._o[pixelId]=options||{};
      if(!document.getElementById(SCRIPT_ID)){
        const script=document.createElement('script');
        script.id=SCRIPT_ID;
        script.async=true;
        script.src=`${url}?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`;
        document.head.append(script);
      }
    };
    ttq.loaded=true;
  }
  if(window.__GAME_ARENA_TIKTOK_PIXEL_ID!==id){
    ttq.load(id);
    window.__GAME_ARENA_TIKTOK_PIXEL_ID=id;
  }
  return ttq;
}

export function logTikTokEvent(eventName,params={},options={}){
  try{
    const ttq=ensureTtq();
    if(!ttq)return;
    if(eventName==='PageView'){
      ttq.page();
      return;
    }
    const cleaned={};
    for(const [key,value] of Object.entries(params||{})){
      if(value!==undefined&&value!==null&&value!=='')cleaned[key]=value;
    }
    const eventOptions={};
    if(options.event_id)eventOptions.event_id=String(options.event_id);
    if(Object.keys(eventOptions).length)ttq.track(eventName,cleaned,eventOptions);
    else ttq.track(eventName,cleaned);
  }catch{/* analytics must never break checkout */}
}

export function tiktokPixelId(){return resolvePixelId();}
