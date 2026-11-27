import {randomUUID} from 'node:crypto';
import {readJson,readPayload,send,problem,corsHeaders,redirect} from './lib/http.mjs';
import {assertCsrf,normalizeIdentifier,parseCookies,safeEqual,sha256,hmac} from './lib/security.mjs';
import {loadPaymentServiceSettings,PaymentServiceClient} from './adapters/payment-service-client.mjs';

const fail=(message,status=400,code='invalid_request',details)=>Object.assign(new Error(message),{status,code,details});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPEN=new Set(['initiated','trialing','active','past_due','paused']);
const TERMINAL=new Set(['payment_failed','expired','canceled']);
const EVENT_TYPES=new Set(['wallet.linked','wallet.unlinked','subscription.created','subscription.activated','subscription.renewed','subscription.past_due','subscription.payment_failed','subscription.expired','subscription.canceled','payment.pending','payment.completed','payment.failed','payment.refunded']);
const asTime=value=>{const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:null;};
const planCode=value=>{const code=String(value||'').trim();if(!/^[A-Za-z0-9._-]{1,64}$/.test(code))throw fail('A valid planCode is required.',400,'invalid_body');return code;};
const msisdn=value=>{const phone=String(value||'').trim();if(!/^(\+92|0)?3\d{9}$/.test(phone.replace(/\s/g,'')))throw fail('JazzCash mobile number must be a valid Pakistani MSISDN (03XXXXXXXXX).',400,'invalid_body');const digits=phone.replace(/\D/g,'');return digits.startsWith('92')?`0${digits.slice(2)}`:digits.startsWith('0')?digits:`0${digits}`;};
const safeReturnPath=value=>{
  const raw=String(value||'').trim();
  if(!raw)return '';
  if(raw.startsWith('/mainLanding')||raw.startsWith('/landing1')||raw.startsWith('/landing2'))return raw.split('#')[0].slice(0,220);
  if(raw==='/'||raw.startsWith('/?'))return raw.slice(0,220);
  return '';
};

function sameEntitlement(a,b){
  return a?.tier===b.tier&&a?.status===b.status&&a?.planId===b.planId&&a?.sourceId===b.sourceId&&Number(a?.expiresAt||0)===Number(b.expiresAt||0)&&Boolean(a?.autoRenew)===Boolean(b.autoRenew);
}
function subscriptionFrom(status){
  const subscriptions=Array.isArray(status?.subscriptions)?status.subscriptions:[];
  return subscriptions.find(item=>OPEN.has(item.status))||subscriptions[0]||null;
}
function resolveAppOrigin(req,config){
  const allowed=config.allowedOrigins||[];
  const origin=req.headers.origin;
  if(origin&&allowed.includes(origin))return origin;
  const referer=String(req.headers.referer||'');
  if(referer){
    try{
      const refOrigin=new URL(referer).origin;
      if(allowed.includes(refOrigin))return refOrigin;
    }catch{/* ignore */}
  }
  return config.publicOrigin;
}

export function createPaymentServiceApp({config,store,clock=()=>Date.now(),fetchImpl=globalThis.fetch,settings:settingsOverride}={}){
  const settings=settingsOverride??loadPaymentServiceSettings({publicOrigin:config.publicOrigin});
  if(settings.mode!=='external'){
    return async function disabledPaymentServiceApp(req,res){
      const url=new URL(req.url,'http://localhost');const path=url.pathname;const method=req.method??'GET';
      if(path!=='/v1/billing/plans')return false;
      const origin=req.headers.origin;const cors=corsHeaders(origin,config.allowedOrigins);
      if(method==='OPTIONS'&&origin&&config.allowedOrigins.includes(origin))return send(res,204,null,{...cors,'access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type,x-request-id','access-control-max-age':'600'});
      if(method==='GET')return send(res,200,{enabled:false,mode:'disabled',checkoutMode:'diy',plans:[]},{...cors,'cache-control':'no-store'});
      return false;
    };
  }
  const client=new PaymentServiceClient({...settings,fetchImpl});

  function authContext(req){
    const cookies=parseCookies(req.headers.cookie);const token=cookies[config.sessionCookieName];if(!token)return null;
    const session=store.getSession(sha256(token));if(!session)return null;const user=store.getUser(session.userId);return user?{user,session}:null;
  }
  function requireUser(req){const context=authContext(req);if(!context)throw fail('Sign in is required.',401,'authentication_required');return context;}
  function assertOrigin(req){
    const origin=req.headers.origin;const referer=String(req.headers.referer||'');
    if(origin){
      if(config.allowedOrigins.length&&!config.allowedOrigins.includes(origin))throw fail('Origin is not allowed.',403,'origin_rejected');
      return;
    }
    if(referer){
      try{
        const refOrigin=new URL(referer).origin;
        if(config.allowedOrigins.length&&!config.allowedOrigins.includes(refOrigin))throw fail('Origin is not allowed.',403,'origin_rejected');
        return;
      }catch{/* fall through */}
    }
  }
  function mutation(req,{allowGuest=false}={}){
    const origin=req.headers.origin;
    const referer=String(req.headers.referer||'');
    if(allowGuest&&!authContext(req)){
      if(!origin&&!referer)throw fail('Origin is not allowed.',403,'origin_rejected');
      assertOrigin(req);
      return;
    }
    assertOrigin(req);
    assertCsrf(req,config);
  }
  function resolveCheckoutUser(req,phone){
    const session=authContext(req);
    if(session?.user)return session.user;
    const identity=normalizeIdentifier(phone);
    return store.findOrCreateUser(identity);
  }
  function resolveAppReturnUrl(req,value){
    const origin=resolveAppOrigin(req,config);
    const path=safeReturnPath(value?.returnPath||value?.landingPath||value?.appReturnPath);
    if(path.startsWith('/landing1')||path.startsWith('/mainLanding')||path.startsWith('/landing2'))return `${origin}${path}`;
    if(path==='/'||path.startsWith('/?'))return `${origin}${path==='/'?'/':path}`;
    if(settings.appReturnUrl)return settings.appReturnUrl;
    return `${origin}/#/premium`;
  }
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
  function revokePremiumImmediately(userId,sourceType,sourceId=null){
    const now=clock();const existing=store.getEntitlement(userId,now);
    if(existing?.tier==='premium')store.setEntitlement(userId,{...existing,id:randomUUID(),status:'cancelled',cancelledAt:now,sourceType:`${sourceType}:cancelled_period`,origin:existing.origin||'paid',autoRenew:false,cancelAtPeriodEnd:true});
    const next={tier:'free',status:'active',origin:'system',sourceType,sourceId,startsAt:now,expiresAt:null,autoRenew:false};
    if(!sameEntitlement(store.getEntitlement(userId,now),next))return store.setEntitlement(userId,next);
    return store.getEntitlement(userId,now);
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
    if(status?.wallet?.status==='unlinked')return preservePaidPeriod(userId,subscription,status,`${sourceType}:wallet_unlinked`);
    if(state==='canceled')return revokePremiumImmediately(userId,`${sourceType}:canceled`,subscription?.id||null);
    if(state==='payment_failed'||state==='expired')return preservePaidPeriod(userId,subscription,status,`${sourceType}:${state}`);
    if(state==='past_due'){
      if(paid&&expiry&&expiry>now)return preservePaidPeriod(userId,subscription,status,`${sourceType}:past_due_paid_period`);
      const next={tier:'free',status:'active',origin:'system',sourceType:`${sourceType}:past_due`,sourceId:subscription?.id||null,startsAt:now,expiresAt:null,autoRenew:false};
      if(!sameEntitlement(existing,next))return store.setEntitlement(userId,next);return existing;
    }
    if(TERMINAL.has(state))return preservePaidPeriod(userId,subscription,status,`${sourceType}:${state}`);
    return existing;
  }
  async function authoritativeStatus(userId,sourceType){const status=await client.status(userId);const entitlement=reconcileEntitlement(userId,status,{sourceType});return{status,entitlement};}

  async function handleCallbackBridge(req,res,url){
    const {value}=await readPayload(req,65536);
    const fields={...Object.fromEntries(url.searchParams.entries()),...(value&&typeof value==='object'?value:{})};
    const productId=String(fields.productId||url.searchParams.get('productId')||'').trim();
    const userId=String(fields.userId||url.searchParams.get('userId')||'').trim();
    if(!productId||!userId){
      // Digisphere bridge expects both; without them fall through so DIY can handle if mounted.
      return false;
    }
    const forwarded=await client.forwardWalletReturn({productId,userId,fields});
    if(forwarded.location&&forwarded.status>=300&&forwarded.status<400){
      redirect(res,forwarded.status===301?301:303,forwarded.location);
      return true;
    }
    if(forwarded.status>=200&&forwarded.status<300){
      // Some Digisphere builds return 200 with a Location-like body; prefer Location header.
      if(forwarded.location){redirect(res,303,forwarded.location);return true;}
      send(res,forwarded.status||200,{accepted:true,checkoutMode:'digisphere'},{'cache-control':'no-store'});
      return true;
    }
    throw fail('Digisphere wallet-return failed.',502,'payment_service_wallet_return_failed');
  }

  return async function paymentServiceApp(req,res){
    const url=new URL(req.url,'http://localhost');const path=url.pathname;const method=req.method??'GET';
    const billing=path.startsWith('/v1/billing/');
    const webhook=path==='/v1/webhooks/payments'||path==='/v1/webhook/payment-service';
    const callback=path==='/v1/jazzcash/wallet/callback'||path==='/callback';
    if(!billing&&!webhook&&!callback)return false;
    const requestId=String(req.headers['x-request-id']||randomUUID()).slice(0,80);const origin=req.headers.origin;const cors=corsHeaders(origin,config.allowedOrigins);const reply=(status,payload,headers={})=>send(res,status,payload,{...cors,'cache-control':'no-store',...headers});
    try{
      if(callback&&(method==='GET'||method==='POST')){
        const handled=await handleCallbackBridge(req,res,url);
        if(handled!==false)return true;
        return false;
      }
      if(method==='OPTIONS'&&origin&&config.allowedOrigins.includes(origin)&&billing)return reply(204,null,{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-csrf-token,x-request-id','access-control-max-age':'600'});
      if(method==='GET'&&path==='/v1/billing/plans')return reply(200,{enabled:true,mode:'external',checkoutMode:'digisphere',plans:await client.plans()});
      if(method==='POST'&&path==='/v1/billing/wallets/link'){
        mutation(req,{allowGuest:true});
        const {value}=await readJson(req,16384);
        if(value.consentToAutoPay!==true&&value.consent!==true)throw fail('Automatic billing consent is required.',400,'consent_required');
        const phone=msisdn(value.msisdn);
        const selectedPlan=value.planCode?planCode(value.planCode):'monthly';
        const user=resolveCheckoutUser(req,phone);
        const appReturnUrl=resolveAppReturnUrl(req,value);
        let result;
        try{
          result=await client.linkWallet(user.id,{msisdn:phone,planCode:selectedPlan,appReturnUrl});
        }catch(error){
          if(error.status===409&&(error.code==='already_linked'||error.code==='already_subscribed'||/already linked|already subscribed/i.test(String(error.message||'')))){
            const reconciled=await authoritativeStatus(user.id,'payment_service_already_linked').catch(()=>({status:null,entitlement:store.getEntitlement(user.id,clock())}));
            throw fail(error.message||'Wallet already linked.',409,error.code||'already_linked',{appEntitlement:reconciled.entitlement,checkoutMode:'digisphere'});
          }
          throw error;
        }
        store.audit.write({actor:user.id,action:'payment_service.wallet_link_started',targetType:'user',targetId:user.id,requestId,metadata:{planCode:selectedPlan,requestId:result?.requestId||null,guest:!authContext(req),appReturnUrl:Boolean(appReturnUrl)}});
        return reply(201,{...result,checkoutMode:'digisphere',userId:user.id,appReturnUrl});
      }
      if(method==='GET'&&path==='/v1/billing/wallets'){const {user}=requireUser(req);return reply(200,await client.wallet(user.id));}
      if(method==='POST'&&path==='/v1/billing/wallets/unlink'){
        const {user}=requireUser(req);mutation(req);const result=await client.unlinkWallet(user.id);const reconciled=await authoritativeStatus(user.id,'payment_service_unlink');
        store.audit.write({actor:user.id,action:'payment_service.wallet_unlinked',targetType:'user',targetId:user.id,requestId});
        return reply(200,{...result,appEntitlement:reconciled.entitlement,checkoutMode:'digisphere'});
      }
      if(method==='GET'&&path==='/v1/billing/status'){
        const {user}=requireUser(req);const result=await authoritativeStatus(user.id,'payment_service_poll');return reply(200,{...result.status,appEntitlement:result.entitlement,checkoutMode:'digisphere'});
      }
      if(method==='POST'&&path==='/v1/billing/subscriptions'){
        const {user}=requireUser(req);mutation(req);const {value}=await readJson(req,8192);const result=await client.subscribe(user.id,{planCode:planCode(value.planCode),skipTrial:Boolean(value.skipTrial)});return reply(201,{...result,checkoutMode:'digisphere'});
      }
      const cancel=path.match(/^\/v1\/billing\/subscriptions\/([^/]+)\/cancel$/);
      if(method==='POST'&&cancel){const {user}=requireUser(req);mutation(req);const current=await client.status(user.id);if(!current?.subscriptions?.some(item=>item.id===cancel[1]))throw fail('Subscription not found.',404,'not_found');const result=await client.cancelSubscription(cancel[1]);const reconciled=await authoritativeStatus(user.id,'payment_service_cancel');return reply(200,{...result,appEntitlement:reconciled.entitlement,checkoutMode:'digisphere'});}
      if(method==='GET'&&path==='/v1/billing/payments'){const {user}=requireUser(req);return reply(200,await client.payments(user.id));}
      const payment=path.match(/^\/v1\/billing\/payments\/([^/]+)$/);
      if(method==='GET'&&payment){const {user}=requireUser(req);const list=await client.payments(user.id);if(!Array.isArray(list)||!list.some(item=>item.id===payment[1]))throw fail('Payment not found.',404,'not_found');return reply(200,await client.payment(payment[1]));}
      if(method==='POST'&&webhook){
        const {value,raw}=await readPayload(req,65536);const signature=String(req.headers['x-payment-signature']||'').trim().toLowerCase();const eventHeader=String(req.headers['x-payment-event']||'').trim();
        const expected=hmac(settings.webhookSecret,raw).toLowerCase();if(!signature||!safeEqual(signature,expected))throw fail('Invalid payment webhook signature.',401,'invalid_signature');
        if(!value||typeof value!=='object'||!UUID.test(String(value.eventId||''))||!EVENT_TYPES.has(String(value.type||''))||eventHeader!==value.type||!String(value.userId||'').trim())throw fail('Invalid payment webhook event.',400,'invalid_webhook');
        const user=store.getUser(String(value.userId));if(!user)throw fail('Webhook user is unknown.',404,'user_not_found');
        const transactionId=UUID.test(String(value.data?.paymentId||''))?String(value.data.paymentId):String(value.eventId);
        const recorded=store.addPaymentEvent({transactionId,providerEventId:String(value.eventId),signatureValid:true,kind:String(value.type),providerStatus:String(value.type),userId:user.id,eventCreatedAt:String(value.createdAt||''),processedAt:null,protectedEvidenceReference:`payment-service:${value.eventId}`});
        if(recorded.duplicate&&recorded.event?.processedAt)return reply(202,{accepted:true,duplicate:true});
        const reconciled=await authoritativeStatus(user.id,`payment_service_webhook:${value.type}`);
        recorded.event.processedAt=new Date(clock()).toISOString();recorded.event.duplicate=Boolean(recorded.duplicate);store.paymentEvents.set(String(value.eventId),recorded.event);
        if(String(value.type).startsWith('payment.')){
          try{await client.payments(user.id);}catch{store.createReconciliationCase({transactionId,reason:'payment_history_reconciliation_failed',providerStatus:value.type});}
        }
        store.audit.write({actor:'payment-service',action:'payment_service.webhook_processed',targetType:'user',targetId:user.id,requestId,metadata:{eventId:value.eventId,type:value.type,subscriptionStatus:reconciled.status?.status?.subscription_status||null}});
        return reply(202,{accepted:true,duplicate:Boolean(recorded.duplicate)});
      }
      return false;
    }catch(error){problem(res,error,requestId);return true;}
  };
}
