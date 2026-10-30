import {randomUUID} from 'node:crypto';
import {readJson,readPayload,send,problem,corsHeaders,redirect} from './lib/http.mjs';
import {assertCsrf,normalizeIdentifier,parseCookies,sha256} from './lib/security.mjs';
import {PLAN_DEFINITIONS} from './services/payments.mjs';
import {jazzCashRequestId,jazzCashTxnRefNo} from './adapters/jazzcash-orchestrator.mjs';
import {sanitizeAttribution} from './lib/campaign-attribution.mjs';

const fail=(message,status=400,code='invalid_request',details)=>Object.assign(new Error(message),{status,code,details});
const msisdn=value=>{const phone=String(value||'').trim();if(!/^(\+92|0)?3\d{9}$/.test(phone.replace(/\s/g,'')))throw fail('JazzCash mobile number must be a valid Pakistani MSISDN (03XXXXXXXXX).',400,'invalid_body');const digits=phone.replace(/\D/g,'');return digits.startsWith('92')?`0${digits.slice(2)}`:digits.startsWith('0')?digits:`0${digits}`;};
const planCode=value=>{const code=String(value||'').trim();if(!/^[A-Za-z0-9._-]{1,64}$/.test(code))throw fail('A valid planCode is required.',400,'invalid_body');return code;};
const safeReturnPath=value=>{const raw=String(value||'/mainLanding').trim();if(raw.startsWith('/mainLanding')||raw.startsWith('/landing2'))return raw.split('#')[0].slice(0,200);return '/mainLanding';};

function ensureJazzCashState(store){
  if(!store.jazzcashLinkIntents)store.jazzcashLinkIntents=new Map();
  if(!store.jazzcashWallets)store.jazzcashWallets=new Map();
  if(!store.jazzcashSubscriptions)store.jazzcashSubscriptions=new Map();
}

function planCatalog(){
  return Object.values(PLAN_DEFINITIONS).map(plan=>({
    code:plan.id,
    planCode:plan.id,
    interval:plan.id,
    fullAmountMinor:Math.round(plan.pricePkr*100),
    full_amount_minor:Math.round(plan.pricePkr*100),
    currency:plan.currency,
    trialHours:0,
    recommended:plan.id==='monthly',
    status:plan.status||'live',
    comingSoon:plan.status==='coming_soon'
  }));
}

function walletStatus(userId,store){
  ensureJazzCashState(store);
  const wallet=store.jazzcashWallets.get(userId);
  if(!wallet||wallet.status==='unlinked')return{status:'none'};
  return{status:wallet.status,msisdnMasked:wallet.msisdn?`${wallet.msisdn.slice(0,4)}******${wallet.msisdn.slice(-2)}`:null,linkedAt:wallet.linkedAt||null};
}

function subscriptionStatus(userId,store,clock){
  ensureJazzCashState(store);
  const sub=store.jazzcashSubscriptions.get(userId);
  const entitlement=store.getEntitlement(userId,clock());
  if(entitlement?.tier==='premium'&&entitlement?.status==='active'){
    return{
      id:sub?.id||entitlement.sourceId||randomUUID(),
      plan_code:sub?.planCode||entitlement.planId||'monthly',
      status:sub?.status||'active',
      current_period_end:entitlement.expiresAt?new Date(entitlement.expiresAt).toISOString():null,
      amount_minor:sub?.amountMinor||null
    };
  }
  return sub||null;
}

function billingStatusPayload(userId,store,clock){
  const wallet=walletStatus(userId,store);
  const subscription=subscriptionStatus(userId,store,clock);
  const state=subscription?.status||null;
  return{
    wallet,
    subscriptions:subscription?[subscription]:[],
    status:{
      wallet_linked:wallet.status==='linked',
      subscription_status:state,
      current_period_paid:state==='active'
    }
  };
}

function sealToken(token){
  return Buffer.from(String(token),'utf8').toString('base64url');
}
function openToken(sealed){
  try{return Buffer.from(String(sealed),'base64url').toString('utf8');}catch{return '';}
}

export function createJazzCashRecurringApp({config,store,orchestrator,clock=()=>Date.now()}){
  if(!['orchestrator','mock'].includes(config.jazzcashMode))return async()=>false;
  ensureJazzCashState(store);

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
    // Same-origin navigations / form posts without Origin are allowed for callback only.
  }
  function mutation(req,{allowGuest=false}={}){
    assertOrigin(req);
    if(allowGuest&&!authContext(req))return;
    assertCsrf(req,config);
  }
  function resolveCheckoutUser(req,phone){
    const session=authContext(req);
    if(session?.user)return session.user;
    const identity=normalizeIdentifier(phone);
    return store.findOrCreateUser(identity);
  }

  async function completeWalletLink(userId,fields){
    if(!orchestrator.verifyReturnFields(fields))throw fail('JazzCash return signature is invalid.',401,'invalid_signature');
    const normalized=orchestrator.normalizeLinkReturn(fields);
    ensureJazzCashState(store);
    const intent=store.jazzcashLinkIntents.get(normalized.requestId);
    if(intent&&intent.userId!==userId)throw fail('Wallet link intent does not belong to this account.',403,'forbidden');
    if(!normalized.success)throw fail(normalized.responseMessage||'JazzCash wallet linking failed.',422,'wallet_link_failed');
    const msisdnValue=normalized.msisdn||intent?.msisdn||'';
    store.jazzcashWallets.set(userId,{status:'linked',msisdn:msisdnValue,paymentTokenSeal:sealToken(normalized.paymentToken),linkedAt:new Date(clock()).toISOString(),requestId:normalized.requestId});
    if(intent){intent.status='completed';intent.completedAt=clock();store.jazzcashLinkIntents.set(normalized.requestId,intent);}
    store.audit.write({actor:userId,action:'jazzcash.wallet_linked',targetType:'user',targetId:userId,metadata:{requestId:normalized.requestId,alreadyLinked:normalized.alreadyLinked}});
    return normalized;
  }

  async function chargeLinkedWallet(userId,planCodeValue,attributionRaw=null){
    ensureJazzCashState(store);
    const wallet=store.jazzcashWallets.get(userId);
    if(!wallet||wallet.status!=='linked')throw fail('Link a JazzCash wallet before subscribing.',409,'wallet_not_linked');
    const plan=PLAN_DEFINITIONS[planCodeValue];if(!plan)throw fail('Unknown premium plan.',400,'invalid_plan');
    if(plan.status==='coming_soon')throw fail('This plan is coming soon.',409,'plan_unavailable');
    const token=openToken(wallet.paymentTokenSeal);
    const txnRefNo=jazzCashTxnRefNo(randomUUID().replaceAll('-',''));
    const amountMinor=Math.round(plan.pricePkr*100);
    const billReference=randomUUID();
    const pay=await orchestrator.payViaToken({paymentToken:token,txnRefNo,amountMinor,billReference,description:`Game Arena+ ${planCodeValue}`});
    if(String(pay?.pp_ResponseCode)!=='000')throw fail(String(pay?.pp_ResponseMessage||'JazzCash payment failed.'),402,'payment_failed');
    const now=clock();const expiresAt=now+plan.durationDays*86400000;
    const attribution=sanitizeAttribution(attributionRaw);
    const paidAt=new Date(now).toISOString();
    const priorPaid=[...store.transactions.values()].some(item=>item.userId===userId&&item.kind==='membership'&&item.status==='paid');
    const purpose=priorPaid?'extension':'activation';
    const sub={id:randomUUID(),planCode:planCodeValue,status:'active',amountMinor,txnRefNo,billReference,activatedAt:paidAt,attribution};
    store.jazzcashSubscriptions.set(userId,sub);
    const planSnapshot={id:plan.id,name:plan.name,version:`${plan.id}-launch-v1`,pricePkr:plan.pricePkr,currency:plan.currency,durationDays:plan.durationDays,durationMs:plan.durationMs,billingMode:plan.billingMode||'single',benefitsVersion:plan.benefitsVersion||'launch-v1'};
    store.createTransaction({id:sub.id,kind:'membership',purpose,userId,provider:'JazzCash',planId:planCodeValue,planSnapshot,listAmountPkr:plan.pricePkr,amountPkr:plan.pricePkr,discountPkr:0,currency:plan.currency||'PKR',status:'paid',providerStatus:'paid',providerReference:txnRefNo,subscriptionPeriodId:sub.id,attribution,createdAt:paidAt,initiatedAt:paidAt,paidAt,completedAt:paidAt,updatedAt:paidAt,attempts:1});
    store.setEntitlement(userId,{tier:'premium',status:'active',origin:'paid',purpose,planId:planCodeValue,planSnapshot,sourceType:'jazzcash_orchestrator',sourceId:sub.id,startsAt:now,currentPeriodStartsAt:now,currentPeriodEndsAt:expiresAt,expiresAt:expiresAt,autoRenew:true});
    store.audit.write({actor:userId,action:'jazzcash.subscription_activated',targetType:'user',targetId:userId,metadata:{planCode:planCodeValue,txnRefNo,purpose,attribution:attribution||null}});
    return sub;
  }

  return async function jazzCashRecurringApp(req,res){
    const url=new URL(req.url,'http://localhost');const path=url.pathname;const method=req.method??'GET';
    const billing=path.startsWith('/v1/billing/');
    const callback=path==='/v1/jazzcash/wallet/callback';
    if(!billing&&!callback)return false;
    const requestId=String(req.headers['x-request-id']||randomUUID()).slice(0,80);
    const origin=req.headers.origin;const cors=corsHeaders(origin,config.allowedOrigins);
    const reply=(status,payload,headers={})=>send(res,status,payload,{...cors,'cache-control':'no-store',...headers});

    try{
      if(method==='OPTIONS'&&origin&&config.allowedOrigins.includes(origin)&&billing)return reply(204,null,{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-csrf-token,x-request-id','access-control-max-age':'600'});

      if(callback&&(method==='GET'||method==='POST')){
        const {value}=await readPayload(req,65536);
        const fields={...Object.fromEntries(url.searchParams.entries()),...(value&&typeof value==='object'?value:{})};
        const intentId=String(fields.pp_RequestID||'');
        ensureJazzCashState(store);
        const intent=store.jazzcashLinkIntents.get(intentId);
        const returnPath=safeReturnPath(intent?.returnPath);
        let userId=intent?.userId||null;
        if(!userId){const session=authContext(req);userId=session?.user?.id||null;}
        if(!userId)return redirect(res,303,`${config.publicOrigin}${returnPath}?payment=failed`);
        try{
          await completeWalletLink(userId,fields);
          const planCodeValue=intent?.planCode||'monthly';
          const sub=await chargeLinkedWallet(userId,planCodeValue,intent?.attribution);
          return redirect(res,303,`${config.publicOrigin}/#/home?payment=succeeded&orderId=${encodeURIComponent(sub.id)}`);
        }catch(error){
          store.audit.write({actor:userId,action:'jazzcash.wallet_link_failed',targetType:'user',targetId:userId,metadata:{message:String(error.message||error).slice(0,180)}});
          return redirect(res,303,`${config.publicOrigin}${returnPath}?payment=failed`);
        }
      }

      if(method==='GET'&&path==='/v1/billing/plans')return reply(200,{enabled:true,mode:'jazzcash_orchestrator',plans:planCatalog()});

      if(method==='POST'&&path==='/v1/billing/wallets/link'){
        mutation(req,{allowGuest:true});
        const {value}=await readJson(req,16384);
        if(value.consentToAutoPay!==true&&value.consent!==true)throw fail('Automatic billing consent is required.',400,'consent_required');
        const phone=msisdn(value.msisdn);
        const selectedPlan=planCode(value.planCode||'monthly');
        const plan=PLAN_DEFINITIONS[selectedPlan];
        if(!plan||plan.status==='coming_soon')throw fail('This plan is coming soon.',409,'plan_unavailable');
        ensureJazzCashState(store);
        const user=resolveCheckoutUser(req,phone);
        // Always start a fresh JazzCash link portal. Shared staging wallets
        // (e.g. 03123456789) must be able to re-link without already_linked 409s.
        const requestIdValue=jazzCashRequestId();
        const returnPath=safeReturnPath(value.returnPath||value.landingPath);
        store.jazzcashLinkIntents.set(requestIdValue,{userId:user.id,msisdn:phone,planCode:selectedPlan,status:'pending',createdAt:clock(),returnPath,attribution:sanitizeAttribution(value.attribution)});
        const form=orchestrator.createLinkWalletForm({msisdn:phone,requestId:requestIdValue});
        store.audit.write({actor:user.id,action:'jazzcash.wallet_link_started',targetType:'user',targetId:user.id,metadata:{requestId:requestIdValue,planCode:selectedPlan,guest:!authContext(req)}});
        return reply(201,{requestId:requestIdValue,portalUrl:form.portalUrl,actionUrl:form.actionUrl,method:form.method,fields:form.fields});
      }

      if(method==='GET'&&path==='/v1/billing/wallets'){const {user}=requireUser(req);return reply(200,walletStatus(user.id,store));}
      if(method==='GET'&&path==='/v1/billing/status'){
        const {user}=requireUser(req);
        const payload=billingStatusPayload(user.id,store,clock);
        const entitlement=store.getEntitlement(user.id,clock());
        return reply(200,{...payload,appEntitlement:{tier:entitlement.tier,status:entitlement.status,expiresAt:entitlement.expiresAt||null,autoRenew:Boolean(entitlement.autoRenew)}});
      }

      if(method==='POST'&&path==='/v1/billing/wallets/unlink'){
        const {user}=requireUser(req);mutation(req);
        ensureJazzCashState(store);
        const wallet=store.jazzcashWallets.get(user.id);
        if(wallet?.status==='linked'){
          const token=openToken(wallet.paymentTokenSeal);
          if(token)await orchestrator.deleteToken({requestId:jazzCashRequestId(),paymentToken:token}).catch(()=>null);
        }
        store.jazzcashWallets.set(user.id,{status:'unlinked',unlinkedAt:new Date(clock()).toISOString()});
        const entitlement=store.getEntitlement(user.id,clock());
        if(entitlement?.tier==='premium')store.setEntitlement(user.id,{...entitlement,autoRenew:false,cancelAtPeriodEnd:true});
        store.audit.write({actor:user.id,action:'jazzcash.wallet_unlinked',targetType:'user',targetId:user.id});
        return reply(200,{status:'unlinked',appEntitlement:store.getEntitlement(user.id,clock())});
      }

      if(method==='POST'&&path==='/v1/billing/subscriptions'){
        const {user}=requireUser(req);mutation(req);const {value}=await readJson(req,8192);
        const sub=await chargeLinkedWallet(user.id,planCode(value.planCode||'monthly'),value.attribution);
        return reply(201,sub);
      }

      const cancelMatch=path.match(/^\/v1\/billing\/subscriptions\/([^/]+)\/cancel$/);
      if(method==='POST'&&cancelMatch){
        const {user}=requireUser(req);mutation(req);
        ensureJazzCashState(store);
        const subscriptionId=decodeURIComponent(cancelMatch[1]);
        const sub=store.jazzcashSubscriptions.get(user.id);
        const entitlement=store.getEntitlement(user.id,clock());
        const matchesSub=sub&&(sub.id===subscriptionId||entitlement?.sourceId===subscriptionId);
        const matchesEntitlement=!sub&&entitlement?.tier==='premium'&&(entitlement.sourceId===subscriptionId||subscriptionId==='current');
        if(!matchesSub&&!matchesEntitlement)throw fail('Subscription not found.',404,'not_found');
        if(sub){
          sub.status='canceled';
          sub.canceledAt=new Date(clock()).toISOString();
          store.jazzcashSubscriptions.set(user.id,sub);
        }
        if(entitlement?.tier==='premium'){
          store.setEntitlement(user.id,{...entitlement,autoRenew:false,cancelAtPeriodEnd:true});
        }
        store.audit.write({actor:user.id,action:'jazzcash.subscription_canceled',targetType:'user',targetId:user.id,metadata:{subscriptionId}});
        return reply(200,{status:'canceled',id:sub?.id||subscriptionId,appEntitlement:store.getEntitlement(user.id,clock())});
      }

      return false;
    }catch(error){problem(res,error,requestId);return true;}
  };
}
