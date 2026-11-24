import {logGa4Event} from './ga4.js';
import {logTikTokEvent} from './tiktok-pixel.js';
import {commerceForCampaign} from './landing-campaign.js';

const CONTEXT_KEY='lp_context';
const TOKENS_KEY='lp_sent_tokens';
const PLACEHOLDER_ORDERS=new Set(['landing-return','mock-landing']);

function trafficSource(utm){
  const value=String(utm||'').trim().toUpperCase();
  if(value==='M'||value==='META'||value==='FACEBOOK')return 'meta';
  if(value==='T'||value==='TIKTOK')return 'tiktok';
  return 'direct';
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
  const raw=JSON.stringify(context);
  // sessionStorage can be dropped across JazzCash's cross-site POST; localStorage survives.
  try{sessionStorage.setItem(CONTEXT_KEY,raw);}catch{/* ignore */}
  try{localStorage.setItem(CONTEXT_KEY,raw);}catch{/* ignore */}
}
export function readLandingAnalyticsContext(){
  try{
    const session=sessionStorage.getItem(CONTEXT_KEY);
    if(session)return JSON.parse(session);
  }catch{/* ignore */}
  try{return JSON.parse(localStorage.getItem(CONTEXT_KEY)||'null');}catch{return null;}
}
function grantedOrderId(transactionId){
  const id=String(transactionId||'').trim();
  if(!id||PLACEHOLDER_ORDERS.has(id))return '';
  return id;
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
  logTikTokEvent('PageView');
  logTikTokEvent('ViewContent',commercePayload(context));
}
export function trackAddToCart(context){
  persistLandingAnalyticsContext(context);
  logGa4Event('add_to_cart',{...context,user_state:'new'});
  logGa4Event('begin_checkout',{...context});
  const payload=commercePayload(context);
  // Client-approved TikTok set only: InitiateCheckout + AddPaymentInfo (no AddToCart).
  logTikTokEvent('InitiateCheckout',payload);
  logTikTokEvent('AddPaymentInfo',payload);
}
export function trackPaymentConversion({paymentStatus,transactionId,context}={}){
  const ctx=context||readLandingAnalyticsContext();
  const orderId=grantedOrderId(transactionId);
  logGa4Event('payment_result',{payment_status:paymentStatus,landing:ctx?.landing,plan_code:ctx?.plan_code});
  // Subscribe only after a server-granted subscription/charge id. Wallet-link or a placeholder is not a conversion.
  if(paymentStatus!=='succeeded'||!orderId)return;
  if(!markToken(orderId))return;
  if(ctx)logGa4Event(ctx.conversion_event,{transaction_id:orderId,value:ctx.value,currency:ctx.currency,item_id:ctx.item_id,item_name:ctx.item_name,landing:ctx.landing});
  // Client-approved TikTok conversion only: Subscribe (no CompletePayment).
  logTikTokEvent('Subscribe',ctx?commercePayload(ctx):{content_type:'product',currency:'PKR'},{event_id:orderId});
}
