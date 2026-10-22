const META_NAME='game-arena-ga-measurement-id';
const SCRIPT_ID='game-arena-gtag-js';
function resolveMeasurementId(){
  try{
    const meta=document.querySelector(`meta[name="${META_NAME}"]`)?.getAttribute('content')||'';
    const fromEnv=String(window.GAME_ARENA_CONFIG?.gaMeasurementId||'').trim();
    const id=(meta||fromEnv).trim();
    return /^G-[A-Z0-9]+$/i.test(id)?id:'';
  }catch{return '';}
}
function ensureGtag(){
  const id=resolveMeasurementId();
  if(!id)return null;
  window.dataLayer=window.dataLayer||[];
  if(typeof window.gtag!=='function'){
    window.gtag=function gtag(){window.dataLayer.push(arguments);};
  }
  if(!document.getElementById(SCRIPT_ID)){
    const script=document.createElement('script');
    script.id=SCRIPT_ID;script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.append(script);
    window.gtag('js',new Date());
    window.gtag('config',id,{send_page_view:false});
  }
  return window.gtag;
}
export function logGa4Event(eventName,params={}){
  try{
    const gtag=ensureGtag();
    if(!gtag)return;
    const cleaned={};
    for(const [key,value] of Object.entries(params)){if(value!==undefined)cleaned[key]=value;}
    gtag('event',eventName,cleaned);
  }catch{/* analytics must never break checkout */}
}
