const allowed=new Set(['route_view','game_impression','game_play_intent','game_start','game_exit','upgrade_view','plan_select','checkout_start','checkout_complete','otp_request','otp_complete','setting_change','web_vital','frontend_error']);

export function track(name,properties={}){
  if(!allowed.has(name))return;
  const safe=Object.fromEntries(Object.entries(properties).filter(([key])=>!/(phone|email|otp|token|secret|payment)/i.test(key)));
  window.dispatchEvent(new CustomEvent('game-arena:analytics',{detail:{name,properties:safe,timestamp:Date.now()}}));
  if(window.GAME_ARENA_CONFIG?.analyticsEndpoint){
    navigator.sendBeacon?.(window.GAME_ARENA_CONFIG.analyticsEndpoint,JSON.stringify({name,properties:safe}));
  }
}

export function observeVitals(){
  if(!('PerformanceObserver'in window))return;
  try{
    new PerformanceObserver(list=>list.getEntries().forEach(entry=>track('web_vital',{metric:entry.entryType,value:Math.round(entry.duration||entry.value||0)}))).observe({type:'largest-contentful-paint',buffered:true});
  }catch{}
}

export function observeErrors(){
  addEventListener('error',event=>track('frontend_error',{kind:'error',message:String(event.message||'Unknown').slice(0,160)}));
  addEventListener('unhandledrejection',event=>track('frontend_error',{kind:'promise',message:String(event.reason||'Unknown').slice(0,160)}));
}
