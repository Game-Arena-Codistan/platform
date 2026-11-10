import {randomUUID} from 'node:crypto';
import {readJson,readPayload,send,problem,corsHeaders,redirect} from './lib/http.mjs';
import {assertCsrf,normalizeIdentifier,parseCookies,requestIp,sha256} from './lib/security.mjs';
import {PLAN_DEFINITIONS} from './services/payments.mjs';
import {jazzCashRequestId,jazzCashTxnRefNo} from './adapters/jazzcash-orchestrator.mjs';
import {sanitizeAttribution} from './lib/campaign-attribution.mjs';

const fail=(message,status=400,code='invalid_request',details)=>Object.assign(new Error(message),{status,code,details});
const msisdn=value=>{const phone=String(value||'').trim();if(!/^(\+92|0)?3\d{9}$/.test(phone.replace(/\s/g,'')))throw fail('JazzCash mobile number must be a valid Pakistani MSISDN (03XXXXXXXXX).',400,'invalid_body');const digits=phone.replace(/\D/g,'');return digits.startsWith('92')?`0${digits.slice(2)}`:digits.startsWith('0')?digits:`0${digits}`;};
const planCode=value=>{const code=String(value||'').trim();if(!/^[A-Za-z0-9._-]{1,64}$/.test(code))throw fail('A valid planCode is required.',400,'invalid_body');return code;};
const safeReturnPath=value=>{const raw=String(value||'/mainLanding').trim();if(raw.startsWith('/mainLanding')||raw.startsWith('/landing2'))return raw.split('#')[0].slice(0,200);return '/mainLanding';};
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
    // Never invent a random id — cancel clients must be able to address this row stably.
    return{
      id:sub?.id||entitlement.sourceId||'current',
      plan_code:sub?.planCode||entitlement.planId||'monthly',
      status:(sub?.status&&sub.status!=='canceled'&&sub.status!=='cancelled')?sub.status:'active',
      current_period_end:entitlement.expiresAt?new Date(entitlement.expiresAt).toISOString():null,
      amount_minor:sub?.amountMinor||null
    };
  }
  if(!sub)return null;
  return{
    id:sub.id||entitlement?.sourceId||'current',
    plan_code:sub.planCode||entitlement?.planId||'monthly',
    status:sub.status||'canceled',
    current_period_end:sub.currentPeriodEnd||(entitlement?.expiresAt?new Date(entitlement.expiresAt).toISOString():null),
    amount_minor:sub.amountMinor||null,
    canceledAt:sub.canceledAt||null
  };
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
  /** Find an existing account by JazzCash MSISDN without creating one. */
  function resolveUserIdByMsisdn(phone){
    const local=msisdn(phone);
    let identity;
    try{identity=normalizeIdentifier(local);}catch{return null;}
    const byIdentity=store.usersByIdentity.get(`${identity.type}:${identity.value}`);
    if(byIdentity)return byIdentity;
    ensureJazzCashState(store);
    for(const [userId,wallet] of store.jazzcashWallets.entries()){
      if(wallet?.msisdn===local)return userId;
    }
    return null;
  }
  function activeSubscriptionSnapshot(userId){
    ensureJazzCashState(store);
    const entitlement=store.getEntitlement(userId,clock());
    const sub=store.jazzcashSubscriptions.get(userId);
    const subActive=Boolean(sub&&!['canceled','cancelled','expired','payment_failed'].includes(String(sub.status||'')));
    const premium=entitlement?.tier==='premium'&&(!entitlement.status||entitlement.status==='active');
    if(!premium&&!subActive)return null;
    return{
      subscriptionId:sub?.id||entitlement?.sourceId||'current',
      planCode:sub?.planCode||entitlement?.planId||'monthly',
      status:sub?.status||(premium?'active':'unknown')
    };
  }
  function maskMsisdn(phone){
    const local=String(phone||'');
    if(local.length<6)return'******';
    return`${local.slice(0,4)}******${local.slice(-2)}`;
  }
  async function cancelSubscriptionForUser(userId,{subscriptionId='current',actor=userId,action='jazzcash.subscription_canceled'}={}){
    ensureJazzCashState(store);
    const sub=store.jazzcashSubscriptions.get(userId);
    const entitlement=store.getEntitlement(userId,clock());
    const canCancel=Boolean(sub)||entitlement?.tier==='premium';
    if(!canCancel)throw fail('You don\'t have any active subscription.',404,'no_active_subscription');
    if(sub){
      sub.status='canceled';
      sub.canceledAt=new Date(clock()).toISOString();
      store.jazzcashSubscriptions.set(userId,sub);
    }
    const tokenLifecycle=await clearJazzCashPaymentToken(userId);
    const appEntitlement=revokePremiumToFree(userId,'user_cancel',sub?.id||entitlement?.sourceId||subscriptionId);
    store.audit.write({actor,action,targetType:'user',targetId:userId,metadata:{subscriptionId,revokedImmediately:true,tokenCleared:tokenLifecycle.tokenCleared}});
    return{
      status:'canceled',
      id:sub?.id||entitlement?.sourceId||subscriptionId,
      tokenCleared:tokenLifecycle.tokenCleared,
      tokenInquiryCode:tokenLifecycle.inquiryResult?.pp_ResponseCode||null,
      appEntitlement:{tier:appEntitlement.tier,status:appEntitlement.status,expiresAt:appEntitlement.expiresAt||null,autoRenew:false}
    };
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
    // Reconcile with Status Inquiry (no pp_Version). PayViaToken 000 remains authoritative if inquiry is unavailable.
    let inquiry=null;
    try{inquiry=await orchestrator.statusInquiry({txnRefNo});}catch(error){
      store.audit.write({actor:userId,action:'jazzcash.status_inquiry_failed',targetType:'provider_reference',targetId:txnRefNo,metadata:{message:String(error.message||error).slice(0,180)}});
    }
    const inquiryCode=inquiry?String(inquiry.pp_ResponseCode||''):'';
    if(inquiry&&!['000','121'].includes(inquiryCode)){
      store.audit.write({actor:userId,action:'jazzcash.status_inquiry_mismatch',targetType:'provider_reference',targetId:txnRefNo,metadata:{payCode:pay?.pp_ResponseCode,inquiryCode,inquiryMessage:String(inquiry.pp_ResponseMessage||'').slice(0,180)}});
    }
    const now=clock();const expiresAt=now+plan.durationDays*86400000;
    const attribution=sanitizeAttribution(attributionRaw);
    const paidAt=new Date(now).toISOString();
    const priorPaid=[...store.transactions.values()].some(item=>item.userId===userId&&item.kind==='membership'&&item.status==='paid');
    const purpose=priorPaid?'extension':'activation';
    const sub={id:randomUUID(),planCode:planCodeValue,status:'active',amountMinor,txnRefNo,billReference,activatedAt:paidAt,attribution,inquiryCode:inquiryCode||null};
    store.jazzcashSubscriptions.set(userId,sub);
    const planSnapshot={id:plan.id,name:plan.name,version:`${plan.id}-launch-v1`,pricePkr:plan.pricePkr,currency:plan.currency,durationDays:plan.durationDays,durationMs:plan.durationMs,billingMode:plan.billingMode||'single',benefitsVersion:plan.benefitsVersion||'launch-v1'};
    store.createTransaction({id:sub.id,kind:'membership',purpose,userId,provider:'JazzCash',planId:planCodeValue,planSnapshot,listAmountPkr:plan.pricePkr,amountPkr:plan.pricePkr,discountPkr:0,currency:plan.currency||'PKR',status:'paid',providerStatus:inquiryCode||'paid',providerReference:txnRefNo,subscriptionPeriodId:sub.id,attribution,createdAt:paidAt,initiatedAt:paidAt,paidAt,completedAt:paidAt,updatedAt:paidAt,attempts:1});
    store.setEntitlement(userId,{tier:'premium',status:'active',origin:'paid',purpose,planId:planCodeValue,planSnapshot,sourceType:'jazzcash_orchestrator',sourceId:sub.id,startsAt:now,currentPeriodStartsAt:now,currentPeriodEndsAt:expiresAt,expiresAt:expiresAt,autoRenew:true});
    store.audit.write({actor:userId,action:'jazzcash.subscription_activated',targetType:'user',targetId:userId,metadata:{planCode:planCodeValue,txnRefNo,purpose,inquiryCode:inquiryCode||null,attribution:attribution||null}});
    return sub;
  }

  /** Delete Token + Token Inquiry (expect 999) + clear local wallet seal. */
  async function clearJazzCashPaymentToken(userId){
    ensureJazzCashState(store);
    const wallet=store.jazzcashWallets.get(userId);
    const msisdnValue=wallet?.msisdn||'';
    const token=wallet?.status==='linked'?openToken(wallet.paymentTokenSeal):'';
    let deleteResult=null;
    let inquiryResult=null;
    if(token){
      try{deleteResult=await orchestrator.deleteToken({requestId:jazzCashRequestId(),paymentToken:token});}
      catch(error){deleteResult={pp_ResponseCode:'error',pp_ResponseMessage:String(error.message||error).slice(0,180)};}
      if(msisdnValue&&orchestrator.mockClearedMobiles)orchestrator.mockClearedMobiles.add(msisdnValue);
    }
    if(msisdnValue){
      try{inquiryResult=await orchestrator.tokenInquiry({requestId:jazzCashRequestId(),mobileNumber:msisdnValue});}
      catch(error){inquiryResult={pp_ResponseCode:'error',pp_ResponseMessage:String(error.message||error).slice(0,180)};}
    }
    store.jazzcashWallets.set(userId,{status:'unlinked',msisdn:msisdnValue||null,unlinkedAt:new Date(clock()).toISOString()});
    const tokenCleared=String(inquiryResult?.pp_ResponseCode||'')==='999';
    store.audit.write({actor:userId,action:'jazzcash.token_cleared',targetType:'user',targetId:userId,metadata:{
      deleteCode:deleteResult?.pp_ResponseCode||null,
      inquiryCode:inquiryResult?.pp_ResponseCode||null,
      tokenCleared
    }});
    return{deleteResult,inquiryResult,tokenCleared};
  }

  function revokePremiumToFree(userId,sourceType,sourceId=null){
    const now=clock();
    const entitlement=store.getEntitlement(userId,now);
    if(entitlement?.tier==='premium'){
      store.setEntitlement(userId,{...entitlement,id:randomUUID(),status:'cancelled',cancelledAt:now,sourceType:`${sourceType}:cancelled_period`,origin:entitlement.origin||'paid',autoRenew:false,cancelAtPeriodEnd:true});
    }
    return store.setEntitlement(userId,{tier:'free',status:'active',origin:'system',sourceType,sourceId,startsAt:now,expiresAt:null,autoRenew:false});
  }

  function findTxnByRef(txnRefNo){
    const ref=String(txnRefNo||'').trim();
    if(!ref)return null;
    return[...store.transactions.values()].find(item=>item.providerReference===ref||item.id===ref)||null;
  }

  function findSubByTxnRef(txnRefNo){
    const ref=String(txnRefNo||'').trim();
    if(!ref)return null;
    ensureJazzCashState(store);
    for(const [userId,sub] of store.jazzcashSubscriptions.entries()){
      if(sub?.txnRefNo===ref)return{userId,sub};
    }
    return null;
  }

  /** Idempotent ack for JazzCash async payment notifications (IPN / inquiry settle). */
  function acknowledgeProviderPayment(fields={}){
    const txnRefNo=String(fields.pp_TxnRefNo||fields.txnRefNo||'').trim();
    const responseCode=String(fields.pp_ResponseCode||'').trim();
    const paid=responseCode==='000'||responseCode==='121';
    if(!txnRefNo)return{accepted:true,ignored:true,reason:'missing_txn_ref'};
    const transaction=findTxnByRef(txnRefNo);
    const linked=findSubByTxnRef(txnRefNo);
    const providerEventId=`jazzcash-ipn:${txnRefNo}:${responseCode||'none'}`;
    if(transaction){
      const recorded=store.addPaymentEvent({transactionId:transaction.id,providerEventId,signatureValid:true,kind:paid?'paid':'provider_notice',providerStatus:responseCode||null,payload:fields});
      if(recorded.duplicate)return{accepted:true,duplicate:true,txnRefNo,transactionId:transaction.id};
      if(paid&&transaction.status!=='paid'){
        transaction.status='paid';
        transaction.providerStatus='paid';
        transaction.providerReference=txnRefNo;
        transaction.paidAt=transaction.paidAt||new Date(clock()).toISOString();
        transaction.completedAt=transaction.completedAt||transaction.paidAt;
        store.saveTransaction(transaction);
      }
      store.audit.write({actor:'jazzcash',action:'jazzcash.ipn_received',targetType:'transaction',targetId:transaction.id,metadata:{txnRefNo,responseCode,paid}});
      return{accepted:true,duplicate:false,txnRefNo,transactionId:transaction.id,paid};
    }
    if(linked){
      store.audit.write({actor:'jazzcash',action:'jazzcash.ipn_received',targetType:'user',targetId:linked.userId,metadata:{txnRefNo,responseCode,paid,subscriptionId:linked.sub.id}});
      return{accepted:true,duplicate:false,txnRefNo,subscriptionId:linked.sub.id,paid};
    }
    store.audit.write({actor:'jazzcash',action:'jazzcash.ipn_unmatched',targetType:'provider_reference',targetId:txnRefNo.slice(0,64),metadata:{responseCode}});
    return{accepted:true,ignored:true,reason:'unknown_txn_ref',txnRefNo};
  }

  return async function jazzCashRecurringApp(req,res){
    const url=new URL(req.url,'http://localhost');const path=url.pathname;const method=req.method??'GET';
    const billing=path.startsWith('/v1/billing/');
    const callback=path==='/v1/jazzcash/wallet/callback';
    const ipn=path==='/v1/jazzcash/ipn';
    if(!billing&&!callback&&!ipn)return false;
    const requestId=String(req.headers['x-request-id']||randomUUID()).slice(0,80);
    const origin=req.headers.origin;const cors=corsHeaders(origin,config.allowedOrigins);
    const reply=(status,payload,headers={})=>send(res,status,payload,{...cors,'cache-control':'no-store',...headers});

    try{
      if(method==='OPTIONS'&&origin&&config.allowedOrigins.includes(origin)&&billing)return reply(204,null,{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-csrf-token,x-request-id','access-control-max-age':'600'});

      // JazzCash IPN — no Trusted Origin / CSRF (provider is the caller).
      if(ipn){
        if(method==='GET'){
          res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
          res.end('JazzCash IPN ready');
          return true;
        }
        if(method!=='POST')throw fail('Method not allowed.',405,'method_not_allowed');
        const {value}=await readPayload(req,65536);
        const fields={...Object.fromEntries(url.searchParams.entries()),...(value&&typeof value==='object'?value:{})};
        if(!Object.keys(fields).length)return reply(200,{accepted:true,ignored:true,reason:'empty'});
        if(!orchestrator.verifyReturnFields(fields)&&Object.keys(fields).some(key=>key.startsWith('pp_'))){
          // Soft-fail unknown/unsigned payloads as accepted ignore so JazzCash stops endless retries on probes.
          if(fields.pp_SecureHash)throw fail('JazzCash IPN signature is invalid.',401,'invalid_signature');
          return reply(200,{accepted:true,ignored:true,reason:'unsigned'});
        }
        return reply(200,acknowledgeProviderPayment(fields));
      }

      if(callback&&(method==='GET'||method==='POST')){
        const {value}=await readPayload(req,65536);
        const fields={...Object.fromEntries(url.searchParams.entries()),...(value&&typeof value==='object'?value:{})};
        const intentId=String(fields.pp_RequestID||'');
        ensureJazzCashState(store);
        const intent=store.jazzcashLinkIntents.get(intentId);
        const returnPath=safeReturnPath(intent?.returnPath);
        const appOrigin=(intent?.returnOrigin&&config.allowedOrigins.includes(intent.returnOrigin))?intent.returnOrigin:config.publicOrigin;
        let userId=intent?.userId||null;
        if(!userId){const session=authContext(req);userId=session?.user?.id||null;}
        if(!userId)return redirect(res,303,`${appOrigin}${returnPath}?payment=failed`);
        try{
          await completeWalletLink(userId,fields);
          const planCodeValue=intent?.planCode||'monthly';
          const sub=await chargeLinkedWallet(userId,planCodeValue,intent?.attribution);
          return redirect(res,303,`${appOrigin}/?payment=succeeded&orderId=${encodeURIComponent(sub.id)}`);
        }catch(error){
          store.audit.write({actor:userId,action:'jazzcash.wallet_link_failed',targetType:'user',targetId:userId,metadata:{message:String(error.message||error).slice(0,180)}});
          return redirect(res,303,`${appOrigin}${returnPath}?payment=failed`);
        }
      }

      if(method==='GET'&&path==='/v1/billing/plans')return reply(200,{enabled:true,mode:'jazzcash_orchestrator',plans:planCatalog()});

      // Proxies JazzCash Status Inquiry (no pp_Version). Frontend never calls JazzCash directly.
      if(method==='POST'&&path==='/v1/billing/jazzcash/inquiry'){
        const {user}=requireUser(req);mutation(req);
        const {value}=await readJson(req,8192);
        const txnRefNo=String(value.txnRefNo||value.pp_TxnRefNo||'').trim();
        if(!txnRefNo)throw fail('txnRefNo is required.',400,'invalid_body');
        const owned=findTxnByRef(txnRefNo);
        const linked=findSubByTxnRef(txnRefNo);
        if(owned&&owned.userId!==user.id)throw fail('Transaction not found.',404,'not_found');
        if(!owned&&linked&&linked.userId!==user.id)throw fail('Transaction not found.',404,'not_found');
        if(!owned&&!linked)throw fail('Transaction not found.',404,'not_found');
        const inquiry=await orchestrator.statusInquiry({txnRefNo});
        const settled=acknowledgeProviderPayment({
          pp_TxnRefNo:txnRefNo,
          pp_ResponseCode:inquiry?.pp_ResponseCode,
          pp_ResponseMessage:inquiry?.pp_ResponseMessage,
          pp_Amount:inquiry?.pp_Amount
        });
        store.audit.write({actor:user.id,action:'jazzcash.status_inquiry',targetType:'provider_reference',targetId:txnRefNo.slice(0,64),metadata:{responseCode:inquiry?.pp_ResponseCode||null}});
        return reply(200,{
          txnRefNo,
          responseCode:inquiry?.pp_ResponseCode||null,
          responseMessage:inquiry?.pp_ResponseMessage||null,
          amount:inquiry?.pp_Amount||null,
          settled,
          raw:{pp_ResponseCode:inquiry?.pp_ResponseCode,pp_ResponseMessage:inquiry?.pp_ResponseMessage,pp_TxnRefNo:inquiry?.pp_TxnRefNo,pp_Amount:inquiry?.pp_Amount}
        });
      }

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
        const returnOrigin=resolveAppOrigin(req,config);
        store.jazzcashLinkIntents.set(requestIdValue,{userId:user.id,msisdn:phone,planCode:selectedPlan,status:'pending',createdAt:clock(),returnPath,returnOrigin,attribution:sanitizeAttribution(value.attribution)});
        const form=orchestrator.createLinkWalletForm({msisdn:phone,requestId:requestIdValue});
        store.audit.write({actor:user.id,action:'jazzcash.wallet_link_started',targetType:'user',targetId:user.id,metadata:{requestId:requestIdValue,planCode:selectedPlan,returnOrigin,guest:!authContext(req)}});
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
        const tokenLifecycle=await clearJazzCashPaymentToken(user.id);
        const appEntitlement=revokePremiumToFree(user.id,'jazzcash_wallet_unlink');
        store.audit.write({actor:user.id,action:'jazzcash.wallet_unlinked',targetType:'user',targetId:user.id,metadata:{tokenCleared:tokenLifecycle.tokenCleared}});
        return reply(200,{
          status:'unlinked',
          tokenCleared:tokenLifecycle.tokenCleared,
          tokenInquiryCode:tokenLifecycle.inquiryResult?.pp_ResponseCode||null,
          appEntitlement:{tier:appEntitlement.tier,status:appEntitlement.status,expiresAt:appEntitlement.expiresAt||null,autoRenew:false}
        });
      }

      if(method==='POST'&&path==='/v1/billing/subscriptions'){
        const {user}=requireUser(req);mutation(req);const {value}=await readJson(req,8192);
        const sub=await chargeLinkedWallet(user.id,planCode(value.planCode||'monthly'),value.attribution);
        return reply(201,sub);
      }

      if(method==='POST'&&path==='/v1/billing/unsubscribe/lookup'){
        mutation(req,{allowGuest:true});
        const ipHash=sha256(requestIp(req));
        if(store.hitRateLimit(`unsubscribe-lookup:${ipHash}`,30,3600000,clock()))throw fail('Too many unsubscribe checks. Try again later.',429,'rate_limited');
        const {value}=await readJson(req,4096);
        const phone=msisdn(value.msisdn);
        const userId=resolveUserIdByMsisdn(phone);
        const active=userId?activeSubscriptionSnapshot(userId):null;
        return reply(200,{
          hasActiveSubscription:Boolean(active),
          msisdnMasked:maskMsisdn(phone),
          planCode:active?.planCode||null,
          plansPath:'/#/library'
        });
      }

      if(method==='POST'&&path==='/v1/billing/unsubscribe'){
        mutation(req,{allowGuest:true});
        const ipHash=sha256(requestIp(req));
        if(store.hitRateLimit(`unsubscribe:${ipHash}`,15,3600000,clock()))throw fail('Too many unsubscribe attempts. Try again later.',429,'rate_limited');
        const {value}=await readJson(req,4096);
        if(value.confirm!==true)throw fail('Confirm cancellation to continue.',400,'confirm_required');
        const phone=msisdn(value.msisdn);
        const userId=resolveUserIdByMsisdn(phone);
        if(!userId||!activeSubscriptionSnapshot(userId))throw fail('You don\'t have any active subscription.',404,'no_active_subscription');
        const result=await cancelSubscriptionForUser(userId,{actor:userId,action:'jazzcash.subscription_canceled_by_msisdn'});
        return reply(200,{...result,msisdnMasked:maskMsisdn(phone)});
      }

      const cancelMatch=path.match(/^\/v1\/billing\/subscriptions\/([^/]+)\/cancel$/);
      if(method==='POST'&&cancelMatch){
        const {user}=requireUser(req);mutation(req);
        const subscriptionId=decodeURIComponent(cancelMatch[1]);
        return reply(200,await cancelSubscriptionForUser(user.id,{subscriptionId,actor:user.id}));
      }

      return false;
    }catch(error){problem(res,error,requestId);return true;}
  };
}
