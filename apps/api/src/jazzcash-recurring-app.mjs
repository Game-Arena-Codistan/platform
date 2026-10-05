import {randomUUID} from 'node:crypto';
import {readJson,readPayload,send,problem,corsHeaders,redirect} from './lib/http.mjs';
import {assertCsrf,parseCookies,sha256} from './lib/security.mjs';
import {PLAN_DEFINITIONS} from './services/payments.mjs';
import {jazzCashRequestId,jazzCashTxnRefNo} from './adapters/jazzcash-orchestrator.mjs';

const fail=(message,status=400,code='invalid_request',details)=>Object.assign(new Error(message),{status,code,details});
const msisdn=value=>{const phone=String(value||'').trim();if(!/^(\+92|0)?3\d{9}$/.test(phone.replace(/\s/g,'')))throw fail('JazzCash mobile number must be a valid Pakistani MSISDN (03XXXXXXXXX).',400,'invalid_body');const digits=phone.replace(/\D/g,'');return digits.startsWith('92')?`0${digits.slice(2)}`:digits.startsWith('0')?digits:`0${digits}`;};
const planCode=value=>{const code=String(value||'').trim();if(!/^[A-Za-z0-9._-]{1,64}$/.test(code))throw fail('A valid planCode is required.',400,'invalid_body');return code;};

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
    recommended:plan.id==='yearly'
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

function sealToken(token,secret){
  return Buffer.from(String(token),'utf8').toString('base64url');
}
function openToken(sealed){
  try{return Buffer.from(String(sealed),'base64url').toString('utf8');}catch{return '';}
}

export function createJazzCashRecurringApp({config,store,orchestrator,clock=()=>Date.now()}){
  if(config.jazzcashMode!=='orchestrator')return async()=>false;
  ensureJazzCashState(store);

  function authContext(req){
    const cookies=parseCookies(req.headers.cookie);const token=cookies[config.sessionCookieName];if(!token)return null;
    const session=store.getSession(sha256(token));if(!session)return null;const user=store.getUser(session.userId);return user?{user,session}:null;
  }
  function requireUser(req){const context=authContext(req);if(!context)throw fail('Sign in is required.',401,'authentication_required');return context;}
  function mutation(req){assertCsrf(req,config);const origin=req.headers.origin;if(origin&&config.allowedOrigins.length&&!config.allowedOrigins.includes(origin))throw fail('Origin is not allowed.',403,'origin_rejected');}

  async function completeWalletLink(userId,fields){
    if(!orchestrator.verifyReturnFields(fields))throw fail('JazzCash return signature is invalid.',401,'invalid_signature');
    const normalized=orchestrator.normalizeLinkReturn(fields);
    ensureJazzCashState(store);
    const intent=store.jazzcashLinkIntents.get(normalized.requestId);
    if(intent&&intent.userId!==userId)throw fail('Wallet link intent does not belong to this account.',403,'forbidden');
    if(!normalized.success)throw fail(normalized.responseMessage||'JazzCash wallet linking failed.',422,'wallet_link_failed');
    const msisdnValue=normalized.msisdn||intent?.msisdn||'';
    store.jazzcashWallets.set(userId,{status:'linked',msisdn:msisdnValue,paymentTokenSeal:sealToken(normalized.paymentToken,config.jazzcashWebhookSecret),linkedAt:new Date(clock()).toISOString(),requestId:normalized.requestId});
    if(intent){intent.status='completed';intent.completedAt=clock();store.jazzcashLinkIntents.set(normalized.requestId,intent);}
    store.audit.write({actor:userId,action:'jazzcash.wallet_linked',targetType:'user',targetId:userId,metadata:{requestId:normalized.requestId,alreadyLinked:normalized.alreadyLinked}});
    return normalized;
  }

  async function chargeLinkedWallet(userId,planCodeValue){
    ensureJazzCashState(store);
    const wallet=store.jazzcashWallets.get(userId);
    if(!wallet||wallet.status!=='linked')throw fail('Link a JazzCash wallet before subscribing.',409,'wallet_not_linked');
    const plan=PLAN_DEFINITIONS[planCodeValue];if(!plan)throw fail('Unknown premium plan.',400,'invalid_plan');
    const token=openToken(wallet.paymentTokenSeal);
    const txnRefNo=jazzCashTxnRefNo(randomUUID().replaceAll('-',''));
    const amountMinor=Math.round(plan.pricePkr*100);
    const billReference=randomUUID();
    const pay=await orchestrator.payViaToken({paymentToken:token,txnRefNo,amountMinor,billReference,description:`Game Arena+ ${planCodeValue}`});
    if(String(pay?.pp_ResponseCode)!=='000')throw fail(String(pay?.pp_ResponseMessage||'JazzCash payment failed.'),402,'payment_failed');
    const now=clock();const expiresAt=now+plan.durationDays*86400000;
    const sub={id:randomUUID(),planCode:planCodeValue,status:'active',amountMinor,txnRefNo,billReference,activatedAt:new Date(now).toISOString()};
    store.jazzcashSubscriptions.set(userId,sub);
    store.setEntitlement(userId,{tier:'premium',status:'active',origin:'paid',purpose:'activation',planId:planCodeValue,sourceType:'jazzcash_orchestrator',sourceId:sub.id,startsAt:now,currentPeriodStartsAt:now,currentPeriodEndsAt:expiresAt,expiresAt:expiresAt,autoRenew:true});
    store.audit.write({actor:userId,action:'jazzcash.subscription_activated',targetType:'user',targetId:userId,metadata:{planCode:planCodeValue,txnRefNo}});
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
        let userId=null;
        const intentId=String(fields.pp_RequestID||'');
        ensureJazzCashState(store);
        const intent=store.jazzcashLinkIntents.get(intentId);
        if(intent)userId=intent.userId;
        if(!userId){const session=authContext(req);userId=session?.user?.id||null;}
        if(!userId)return redirect(res,303,`${config.publicOrigin}/#/premium?wallet=failed`);
        const normalized=await completeWalletLink(userId,fields);
        try{
          const planCodeValue=intent?.planCode||'monthly';
          await chargeLinkedWallet(userId,planCodeValue);
          return redirect(res,303,`${config.publicOrigin}/#/premium?wallet=linked&subscription_status=active&status=paid`);
        }catch(error){
          store.audit.write({actor:userId,action:'jazzcash.wallet_linked_payment_pending',targetType:'user',targetId:userId,metadata:{message:String(error.message||error).slice(0,180)}});
          return redirect(res,303,`${config.publicOrigin}/#/premium?wallet=linked&subscription_status=initiated&status=pending`);
        }
      }

      if(method==='GET'&&path==='/v1/billing/plans')return reply(200,{enabled:true,mode:'jazzcash_orchestrator',plans:planCatalog()});

      if(method==='POST'&&path==='/v1/billing/wallets/link'){
        const {user}=requireUser(req);mutation(req);const {value}=await readJson(req,16384);
        const phone=msisdn(value.msisdn);const selectedPlan=planCode(value.planCode||'monthly');
        ensureJazzCashState(store);
        const existing=store.jazzcashWallets.get(user.id);
        if(existing?.status==='linked')throw fail('Wallet already linked.',409,'already_linked');
        const requestIdValue=jazzCashRequestId();
        store.jazzcashLinkIntents.set(requestIdValue,{userId:user.id,msisdn:phone,planCode:selectedPlan,status:'pending',createdAt:clock()});
        const form=orchestrator.createLinkWalletForm({msisdn:phone,requestId:requestIdValue});
        store.audit.write({actor:user.id,action:'jazzcash.wallet_link_started',targetType:'user',targetId:user.id,metadata:{requestId:requestIdValue,planCode:selectedPlan}});
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
        const sub=await chargeLinkedWallet(user.id,planCode(value.planCode||'monthly'));
        return reply(201,sub);
      }

      return false;
    }catch(error){problem(res,error,requestId);return true;}
  };
}
