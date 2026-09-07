import {randomUUID} from 'node:crypto';
import {readJson,readPayload,send,problem,corsHeaders} from './lib/http.mjs';
import {assertCsrf,hmac,parseCookies,safeEqual,sha256} from './lib/security.mjs';
import {loadPaymentServiceSettings,PaymentServiceClient} from './adapters/payment-service-client.mjs';

const fail=(message,status=400,code='invalid_request',details)=>Object.assign(new Error(message),{status,code,details});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPEN=new Set(['initiated','trialing','active','past_due','paused']);
const TERMINAL=new Set(['payment_failed','expired','canceled']);
const EVENT_TYPES=new Set(['wallet.linked','wallet.unlinked','subscription.created','subscription.activated','subscription.renewed','subscription.past_due','subscription.payment_failed','subscription.expired','subscription.canceled','payment.pending','payment.completed','payment.failed','payment.refunded']);
const asTime=value=>{const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:null;};
const planCode=value=>{const code=String(value||'').trim();if(!/^[A-Za-z0-9._-]{1,64}$/.test(code))throw fail('A valid planCode is required.',400,'invalid_body');return code;};
const msisdn=value=>{const phone=String(value||'').trim();if(!/^\+?[0-9]{11,15}$/.test(phone))throw fail('JazzCash mobile number must contain 11 to 15 digits.',400,'invalid_body');return phone;};

function sameEntitlement(a,b){
  return a?.tier===b.tier&&a?.status===b.status&&a?.planId===b.planId&&a?.sourceId===b.sourceId&&Number(a?.expiresAt||0)===Number(b.expiresAt||0)&&Boolean(a?.autoRenew)===Boolean(b.autoRenew);
}
function subscriptionFrom(status){
  const subscriptions=Array.isArray(status?.subscriptions)?status.subscriptions:[];
  return subscriptions.find(item=>OPEN.has(item.status))||subscriptions[0]||null;
}

export function createPaymentServiceApp({config,store,clock=()=>Date.now(),fetchImpl=globalThis.fetch,settings:settingsOverride}={}){
  const settings=settingsOverride??loadPaymentServiceSettings({publicOrigin:config.publicOrigin});
  if(settings.mode!=='external')return async()=>false;
  const client=new PaymentServiceClient({...settings,fetchImpl});

  function authContext(req){
    const cookies=parseCookies(req.headers.cookie);const token=cookies[config.sessionCookieName];if(!token)return null;
    const session=store.getSession(sha256(token));if(!session)return null;const user=store.getUser(session.userId);return user?{user,session}:null;
  }
  function requireUser(req){const context=authContext(req);if(!context)throw fail('Sign in is required.',401,'authentication_required');return context;}
  function mutation(req){assertCsrf(req,config);const origin=req.headers.origin;if(origin&&config.allowedOrigins.length&&!config.allowedOrigins.includes(origin))throw fail('Origin is not allowed.',403,'origin_rejected');}
  function chooseExpiry(subscription,status){return asTime(subscription?.current_period_end)||asTime(subscription?.trial_ends_at)||asTime(status?.status?.next_due_at)||null;}
  function preservePaidPeriod(userId,subscription,status,sourceType){
    const now=clock();const existing=store.getEntitlement(userId,now);const remoteExpiry=chooseExpiry(subscription,status);const expiry=Math.max(Number(existing?.expiresAt||0),Number(remoteExpiry||0));
    if(existing?.tier==='premium'&&existing?.status==='active'&&expiry>now){
      const next={tier:'premium',status:'active',origin:existing.origin||'paid',purpose:existing.purpose,planId:subscription?.plan_code||existing.planId,planSnapshot:existing.planSnapshot,sourceType,sourceId:subscription?.id||existing.sourceId,startsAt:existing.startsAt||now,currentPeriodStartsAt:existing.currentPeriodStartsAt||now,currentPeriodEndsAt:expiry,expiresAt:expiry,autoRenew:false,cancelAtPeriodEnd:true};
      if(!sameEntitlement(existing,next))return store.setEntitlement(userId,next);return existing;
    }
    const next={tier:'free',status:'active',origin:'system',sourceType,sourceId:subscription?.id||null,startsAt:now,expiresAt:null,autoRenew:false};
    if(!sameEntitlement(existing,next))return store.setEntitlement(userId,next);return existing;
  }
  function reconcileEntitlement(userId,status,{sourceType='payment_service_status'}={}){
    const now=clock();const subscription=subscriptionFrom(status);const remote=status?.status||{};const state=subscription?.status||remote.subscription_status||null;const paid=Boolean(remote.current_period_paid);const expiry=chooseExpiry(subscription,status);
    const existing=store.getEntitlement(userId,now);
    if(state==='trialing'){
      const trialExpiry=asTime(subscription?.trial_ends_at)||expiry;
      if(!trialExpiry||trialExpiry<=now)return preservePaidPeriod(userId,subscription,status,`${sourceType}:trial_expired`);
      const next={tier:'premium',status:'active',origin:'trial',purpose:'activation',planId:subscription?.plan_code||null,sourceType,sourceId:subscription?.id||null,startsAt:now,currentPeriodStartsAt:now,currentPeriodEndsAt:trialExpiry,expiresAt:trialExpiry,autoRenew:true};
      if(!sameEntitlement(existing,next))return store.setEntitlement(userId,next);return existing;
    }
    if(state==='active'&&paid&&expiry&&expiry>now){
      const next={tier:'premium',status:'active',origin:'paid',purpose:existing?.tier==='premium'?'extension':'activation',planId:subscription?.plan_code||null,sourceType,sourceId:subscription?.id||null,startsAt:existing?.tier==='premium'&&existing?.startsAt?existing.startsAt:now,currentPeriodStartsAt:now,currentPeriodEndsAt:expiry,expiresAt:expiry,autoRenew:true};
      if(!sameEntitlement(existing,next))return store.setEntitlement(userId,next);return existing;
    }
    if(state==='canceled'||state==='payment_failed'||state==='expired'||status?.wallet?.status==='unlinked')return preservePaidPeriod(userId,subscription,status,`${sourceType}:${state||'wallet_unlinked'}`);
    if(state==='past_due'){
      if(paid&&expiry&&expiry>now)return preservePaidPeriod(userId,subscription,status,`${sourceType}:past_due_paid_period`);
      const next={tier:'free',status:'active',origin:'system',sourceType:`${sourceType}:past_due`,sourceId:subscription?.id||null,startsAt:now,expiresAt:null,autoRenew:false};
      if(!sameEntitlement(existing,next))return store.setEntitlement(userId,next);return existing;
    }
    if(TERMINAL.has(state))return preservePaidPeriod(userId,subscription,status,`${sourceType}:${state}`);
    return existing;
  }
  async function authoritativeStatus(userId,sourceType){const status=await client.status(userId);const entitlement=reconcileEntitlement(userId,status,{sourceType});return{status,entitlement};}

  return async function paymentServiceApp(req,res){
    const url=new URL(req.url,'http://localhost');const path=url.pathname;const method=req.method??'GET';
    if(!path.startsWith('/v1/billing/')&&path!=='/v1/webhooks/payments')return false;
    const requestId=String(req.headers['x-request-id']||randomUUID()).slice(0,80);const origin=req.headers.origin;const cors=corsHeaders(origin,config.allowedOrigins);const reply=(status,payload,headers={})=>send(res,status,payload,{...cors,'cache-control':'no-store',...headers});
    try{
      if(method==='OPTIONS'&&origin&&config.allowedOrigins.includes(origin)&&path.startsWith('/v1/billing/'))return reply(204,null,{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-csrf-token,x-request-id','access-control-max-age':'600'});
      if(method==='GET'&&path==='/v1/billing/plans')return reply(200,await client.plans());
      if(method==='POST'&&path==='/v1/billing/wallets/link'){
        const {user}=requireUser(req);mutation(req);const {value}=await readJson(req,16384);
        const result=await client.linkWallet(user.id,{msisdn:msisdn(value.msisdn),planCode:value.planCode?planCode(value.planCode):undefined,appReturnUrl:settings.appReturnUrl||undefined});
        store.audit.write({actor:user.id,action:'payment_service.wallet_link_started',targetType:'user',targetId:user.id,requestId,metadata:{planCode:value.planCode||null}});
        return reply(201,result);
      }
      if(method==='GET'&&path==='/v1/billing/wallets'){const {user}=requireUser(req);return reply(200,await client.wallet(user.id));}
      if(method==='POST'&&path==='/v1/billing/wallets/unlink'){
        const {user}=requireUser(req);mutation(req);const result=await client.unlinkWallet(user.id);const reconciled=await authoritativeStatus(user.id,'payment_service_unlink');
        store.audit.write({actor:user.id,action:'payment_service.wallet_unlinked',targetType:'user',targetId:user.id,requestId});
        return reply(200,{...result,appEntitlement:reconciled.entitlement});
      }
      if(method==='GET'&&path==='/v1/billing/status'){
        const {user}=requireUser(req);const result=await authoritativeStatus(user.id,'payment_service_poll');return reply(200,{...result.status,appEntitlement:result.entitlement});
      }
      if(method==='POST'&&path==='/v1/billing/subscriptions'){
        const {user}=requireUser(req);mutation(req);const {value}=await readJson(req,8192);const result=await client.subscribe(user.id,{planCode:planCode(value.planCode),skipTrial:Boolean(value.skipTrial)});return reply(201,result);
      }
      const cancel=path.match(/^\/v1\/billing\/subscriptions\/([^/]+)\/cancel$/);
      if(method==='POST'&&cancel){const {user}=requireUser(req);mutation(req);const current=await client.status(user.id);if(!current?.subscriptions?.some(item=>item.id===cancel[1]))throw fail('Subscription not found.',404,'not_found');const result=await client.cancelSubscription(cancel[1]);const reconciled=await authoritativeStatus(user.id,'payment_service_cancel');return reply(200,{...result,appEntitlement:reconciled.entitlement});}
      if(method==='GET'&&path==='/v1/billing/payments'){const {user}=requireUser(req);return reply(200,await client.payments(user.id));}
      const payment=path.match(/^\/v1\/billing\/payments\/([^/]+)$/);
      if(method==='GET'&&payment){const {user}=requireUser(req);const list=await client.payments(user.id);if(!Array.isArray(list)||!list.some(item=>item.id===payment[1]))throw fail('Payment not found.',404,'not_found');return reply(200,await client.payment(payment[1]));}
      if(method==='POST'&&path==='/v1/webhooks/payments'){
        const {value,raw}=await readPayload(req,65536);const signature=String(req.headers['x-payment-signature']||'').trim().toLowerCase();const eventHeader=String(req.headers['x-payment-event']||'').trim();
        const expected=hmac(settings.webhookSecret,raw).toLowerCase();if(!signature||!safeEqual(signature,expected))throw fail('Invalid payment webhook signature.',401,'invalid_signature');
        if(!value||typeof value!=='object'||!UUID.test(String(value.eventId||''))||!EVENT_TYPES.has(String(value.type||''))||eventHeader!==value.type||!String(value.userId||'').trim())throw fail('Invalid payment webhook event.',400,'invalid_webhook');
        const user=store.getUser(String(value.userId));if(!user)throw fail('Webhook user is unknown.',404,'user_not_found');
        const transactionId=UUID.test(String(value.data?.paymentId||''))?String(value.data.paymentId):String(value.eventId);
        const recorded=store.addPaymentEvent({transactionId,providerEventId:String(value.eventId),signatureValid:true,kind:String(value.type),providerStatus:String(value.type),userId:user.id,eventCreatedAt:String(value.createdAt||''),processedAt:new Date(clock()).toISOString(),protectedEvidenceReference:`payment-service:${value.eventId}`});
        if(recorded.duplicate)return reply(202,{accepted:true,duplicate:true});
        const reconciled=await authoritativeStatus(user.id,`payment_service_webhook:${value.type}`);
        if(String(value.type).startsWith('payment.')){
          try{await client.payments(user.id);}catch{store.createReconciliationCase({transactionId,reason:'payment_history_reconciliation_failed',providerStatus:value.type});}
        }
        store.audit.write({actor:'payment-service',action:'payment_service.webhook_processed',targetType:'user',targetId:user.id,requestId,metadata:{eventId:value.eventId,type:value.type,subscriptionStatus:reconciled.status?.status?.subscription_status||null}});
        return reply(202,{accepted:true,duplicate:false});
      }
      return false;
    }catch(error){problem(res,error,requestId);return true;}
  };
}
