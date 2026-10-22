import {logGa4Event} from './ga4.js';
import {commerceForCampaign} from './landing-campaign.js';

const CONTEXT_KEY='lp_context';
const TOKENS_KEY='lp_sent_tokens';

function trafficSource(utm){
  const value=String(utm||'').trim().toUpperCase();
  if(value==='M'||value==='META'||value==='FACEBOOK')return 'meta';
  if(value==='T'||value==='TIKTOK')return 'tiktok';
  return 'direct';
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
  persistLandingAnalyticsContext(context);
  logGa4Event('landing_view',{...context});
  logGa4Event('view_item',{item_id:context.item_id,item_name:context.item_name,value:context.value,currency:context.currency,landing:context.landing});
}
export function trackAddToCart(context){
  persistLandingAnalyticsContext(context);
  logGa4Event('add_to_cart',{...context,user_state:'new'});
  logGa4Event('begin_checkout',{...context});
}
export function trackPaymentConversion({paymentStatus,transactionId,context}={}){
  const ctx=context||readLandingAnalyticsContext();
  logGa4Event('payment_result',{payment_status:paymentStatus,landing:ctx?.landing,plan_code:ctx?.plan_code});
  if(paymentStatus!=='succeeded'||!transactionId||!ctx)return;
  if(!markToken(String(transactionId)))return;
  logGa4Event(ctx.conversion_event,{transaction_id:String(transactionId),value:ctx.value,currency:ctx.currency,item_id:ctx.item_id,item_name:ctx.item_name,landing:ctx.landing});
}
