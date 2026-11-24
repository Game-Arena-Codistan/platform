import {logGa4Event} from './ga4.js';
import {logTikTokEvent} from './tiktok-pixel.js';
import {commerceForCampaign} from './landing-campaign.js';
import {telemetryEnabled} from './state.js';

const CONTEXT_KEY='lp_context';
const TOKENS_KEY='lp_sent_tokens';

function trafficSource(utm){
  const value=String(utm||'').trim().toUpperCase();
  if(value==='M'||value==='META'||value==='FACEBOOK')return 'meta';
  if(value==='T'||value==='TIKTOK')return 'tiktok';
  if(value==='S'||value==='SNAPCHAT')return 'snapchat';
  if(value==='G'||value==='GOOGLE')return 'google';
  if(value==='D'||value==='DIRECT')return 'direct';
  return value?value.toLowerCase():'unknown';
}

function commercePayload(context){
  return{
    contents:[{
      content_id:context.item_id,
      content_type:'product',
      content_name:context.item_name
    }],
    content_type:'product',
    value:context.value,
    currency:context.currency,
    traffic_source:context.traffic_source,
    utm_code:context.utm_code,
    banner_parameter:context.banner_parameter,
    landing:context.landing
  };
}

export function buildLandingAnalyticsContext(campaign,{landing}){
  const commerce=commerceForCampaign(campaign);
  return{
    traffic_source:trafficSource(campaign.utm),
    utm_code:campaign.utm||'D',
    package_id:campaign.package,
    banner_parameter:campaign.parameter,
    payment:campaign.payment,
    landing,
    plan_code:commerce.planCode,
    item_id:commerce.item_id,
    item_name:commerce.item_name,
    value:commerce.value,
    currency:commerce.currency,
    conversion_event:commerce.conversion_event
  };
}

export function persistLandingAnalyticsContext(context){
  try{sessionStorage.setItem(CONTEXT_KEY,JSON.stringify(context));}catch{/* ignore */}
}
export function readLandingAnalyticsContext(){
  try{return JSON.parse(sessionStorage.getItem(CONTEXT_KEY)||'null');}catch{return null;}
}
function markToken(id){
  try{
    const list=JSON.parse(sessionStorage.getItem(TOKENS_KEY)||'[]');
    if(list.includes(id))return false;
    list.push(id);
    sessionStorage.setItem(TOKENS_KEY,JSON.stringify(list.slice(-50)));
    return true;
  }catch{return true;}
}

export function trackLandingView(context){
  if(!telemetryEnabled())return;
  persistLandingAnalyticsContext(context);
  logGa4Event('landing_view',{...context});
  logGa4Event('view_item',{item_id:context.item_id,item_name:context.item_name,value:context.value,currency:context.currency,landing:context.landing});
  logTikTokEvent('PageView');
  logTikTokEvent('ViewContent',commercePayload(context));
}
export function trackAddToCart(context){
  if(!telemetryEnabled())return;
  persistLandingAnalyticsContext(context);
  logGa4Event('landing_cta',{...context});
  logGa4Event('subscribe',{...context});
  logGa4Event('add_to_cart',{...context,user_state:'new'});
  logGa4Event('begin_checkout',{...context});
  const payload=commercePayload(context);
  logTikTokEvent('AddToCart',payload);
  logTikTokEvent('InitiateCheckout',payload);
}
export function trackPaymentConversion({verified,transactionId,value,currency,planCode,context}={}){
  if(!telemetryEnabled()||verified!==true||!transactionId||!Number.isFinite(value)||value<=0||!/^[A-Z]{3}$/.test(currency))return;
  const ctx=context||readLandingAnalyticsContext();
  if(!ctx||!markToken(String(transactionId)))return;
  const itemId=planCode||ctx.plan_code;
  const actual={...ctx,item_id:itemId,plan_code:itemId,value,currency};
  logGa4Event('purchase',{transaction_id:String(transactionId),value,currency,items:[{item_id:itemId,item_name:itemId==='yearly'?'Game Premium Yearly':'Game Premium Monthly',price:value,quantity:1}],traffic_source:ctx.traffic_source,utm_code:ctx.utm_code,banner_parameter:ctx.banner_parameter,landing:ctx.landing});
  logTikTokEvent('CompletePayment',commercePayload(actual),{event_id:String(transactionId)});
}
