import {logGa4Event} from './ga4.js';
import {logTikTokEvent} from './tiktok-pixel.js';
import {commerceForCampaign} from './landing-campaign.js';

const CONTEXT_KEY='lp_context';
const TOKENS_KEY='lp_sent_tokens';
const PENDING_KEY='game-arena:pending-subscription';
const PLACEHOLDER_ORDERS=new Set(['landing-return','mock-landing']);

function trafficSource(utm){
  const value=String(utm||'').trim().toUpperCase();
  if(value==='M'||value==='META'||value==='FACEBOOK')return 'meta';
  if(value==='T'||value==='TIKTOK')return 'tiktok';
  return 'direct';
}

function commercePayload(context,extra={}){
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
    landing:context.landing,
    ...extra
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

export function persistCheckoutPending(pending){
  const raw=JSON.stringify(pending||{});
  try{sessionStorage.setItem(PENDING_KEY,raw);}catch{/* ignore */}
  try{localStorage.setItem(PENDING_KEY,raw);}catch{/* ignore */}
}
export function readCheckoutPending(){
  try{
    const session=sessionStorage.getItem(PENDING_KEY);
    if(session)return JSON.parse(session);
  }catch{/* ignore */}
  try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'null');}catch{return null;}
}

function grantedOrderId(transactionId){
  const id=String(transactionId||'').trim();
  if(!id||PLACEHOLDER_ORDERS.has(id))return '';
  return id;
}

/** Digisphere returns have no JazzCash order/cv — synthesize a stable Subscribe event id. */
export function resolveSubscribeOrderId({transactionId,requestId,userId,trialEndsAt,wallet}={}){
  const explicit=grantedOrderId(transactionId)||grantedOrderId(requestId);
  if(explicit)return explicit;
  const pending=readCheckoutPending();
  const pendingRequest=grantedOrderId(pending?.requestId);
  if(pendingRequest)return pendingRequest;
  if(String(wallet||'').toLowerCase()==='linked'&&userId){
    return `digisphere:${String(userId).trim()}:${String(trialEndsAt||'linked').trim()}`;
  }
  return '';
}

function markToken(id){
  const token=`subscribe:${id}`;
  try{
    const list=JSON.parse(sessionStorage.getItem(TOKENS_KEY)||'[]');
    if(list.includes(id)||list.includes(token))return false;
    list.push(token);
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
export function trackPaymentConversion({
  paymentStatus,
  transactionId,
  context,
  wallet,
  userId,
  trialEndsAt,
  requestId,
  checkoutMode,
  subscriptionStatus
}={}){
  const ctx=context||readLandingAnalyticsContext();
  const pending=readCheckoutPending();
  const linked=String(wallet||'').toLowerCase()==='linked'
    || paymentStatus==='succeeded'
    || ['trialing','active','initiated'].includes(String(subscriptionStatus||'').toLowerCase());
  const mode=checkoutMode||pending?.checkoutMode||(wallet||userId?'digisphere':undefined);
  const orderId=resolveSubscribeOrderId({
    transactionId,
    requestId:requestId||pending?.requestId,
    userId,
    trialEndsAt,
    wallet:linked?'linked':wallet
  });
  logGa4Event('payment_result',{
    payment_status:paymentStatus||(linked?'succeeded':'failed'),
    landing:ctx?.landing,
    plan_code:ctx?.plan_code,
    checkout_mode:mode||null,
    wallet:wallet||null,
    subscription_status:subscriptionStatus||null
  });
  // Subscribe after DIY granted orderId OR Digisphere wallet=linked (no JazzCash order/cv).
  if(!linked||!orderId)return;
  if(!markToken(orderId))return;
  if(ctx)logGa4Event(ctx.conversion_event,{transaction_id:orderId,value:ctx.value,currency:ctx.currency,item_id:ctx.item_id,item_name:ctx.item_name,landing:ctx.landing,checkout_mode:mode||null});
  // Client-approved TikTok conversion only: Subscribe (no CompletePayment).
  logTikTokEvent(
    'Subscribe',
    ctx?commercePayload(ctx,{checkout_mode:mode||'diy',txnRefNo:orderId,paymentId:orderId}):{content_type:'product',currency:'PKR',checkout_mode:mode||'diy'},
    {event_id:orderId}
  );
}

export function digisphereReturnFromParams(params){
  const wallet=String(params.get('wallet')||'').trim().toLowerCase();
  const payment=String(params.get('payment')||'').trim().toLowerCase();
  const subscriptionStatus=String(params.get('subscriptionStatus')||params.get('subscription_status')||'').trim();
  const userId=String(params.get('userId')||params.get('user_id')||'').trim();
  const trialEndsAt=String(params.get('trialEndsAt')||params.get('trial_ends_at')||'').trim();
  const requestId=String(params.get('requestId')||params.get('request_id')||'').trim();
  const orderId=String(params.get('orderId')||params.get('txn')||params.get('transactionId')||params.get('txnRefNo')||'').trim();
  return{wallet,payment,subscriptionStatus,userId,trialEndsAt,requestId,orderId};
}
