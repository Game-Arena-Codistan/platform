import {randomUUID} from 'node:crypto';
import {readJson,send,problem} from './lib/http.mjs';
import {clearCookie,normalizeIdentifier,parseCookies,randomToken,sessionCookie,sha256,sixDigitCode,safeEqual} from './lib/security.mjs';

const PLANS={monthly:{price:299,days:31},yearly:{price:4999,days:366}};
const fail=(message,status=400,code='invalid_request')=>Object.assign(new Error(message),{status,code});

export function createApp({config,store,jazzcash,clock=()=>Date.now()}){
  async function currentUser(req){const token=parseCookies(req.headers.cookie)[config.sessionCookieName];if(!token)return null;const session=store.getSession(sha256(token));return session?store.getUser(session.userId):null;}
  async function requireUser(req){const user=await currentUser(req);if(!user)throw fail('Sign in is required.',401,'authentication_required');return user;}
  return async function handler(req,res){
    const requestId=req.headers['x-request-id']?.slice(0,80)||randomUUID();res.setHeader('x-request-id',requestId);
    try{
      const url=new URL(req.url,'http://localhost');const path=url.pathname;const method=req.method??'GET';
      if(method==='GET'&&path==='/healthz')return send(res,200,{status:'ok',service:'game-arena-api',time:new Date(clock()).toISOString()});
      if(method==='GET'&&path==='/v1/catalog/games')return send(res,200,{games:store.listGames()},{'cache-control':'public, max-age=30'});
      if(method==='POST'&&path==='/v1/auth/otp'){
        const {value}=await readJson(req);const identity=normalizeIdentifier(value.identifier);const key=`otp:${identity.type}:${identity.value}`;
        if(store.hitRateLimit(key,5,15*60*1000,clock()))throw fail('Too many verification requests. Try again later.',429,'rate_limited');
        const code=sixDigitCode();const challenge={id:randomUUID(),identity,codeHash:sha256(code),expiresAt:clock()+config.otpTtlSeconds*1000,attempts:0,consumed:false};store.createOtp(challenge);
        return send(res,202,{challengeId:challenge.id,expiresIn:config.otpTtlSeconds,resendIn:config.otpResendSeconds,...(config.allowDebugOtp?{debugCode:code}:{})});
      }
      if(method==='POST'&&path==='/v1/auth/otp/verify'){
        const {value}=await readJson(req);const challenge=store.getOtp(value.challengeId);
        if(!challenge||challenge.expiresAt<clock()||challenge.consumed)throw fail('Verification code is invalid or expired.',400,'invalid_otp');
        challenge.attempts+=1;if(challenge.attempts>5){store.saveOtp(challenge);throw fail('Too many attempts. Request a new code.',429,'otp_attempts_exceeded');}
        if(!/^\d{6}$/.test(String(value.code??''))||!safeEqual(challenge.codeHash,sha256(value.code))){store.saveOtp(challenge);throw fail('Verification code is invalid or expired.',400,'invalid_otp');}
        challenge.consumed=true;store.saveOtp(challenge);const user=store.findOrCreateUser(challenge.identity);const token=randomToken();store.createSession({hash:sha256(token),userId:user.id,expiresAt:clock()+config.sessionTtlSeconds*1000});
        return send(res,200,{user,entitlement:store.getEntitlement(user.id).tier,coins:store.wallet(user.id)},{'set-cookie':sessionCookie(config.sessionCookieName,token,config.sessionTtlSeconds,config.nodeEnv==='production')});
      }
      if(method==='GET'&&path==='/v1/session'){const user=await currentUser(req);return send(res,200,user?{authenticated:true,user,entitlement:store.getEntitlement(user.id),coins:store.wallet(user.id)}:{authenticated:false});}
      if(method==='POST'&&path==='/v1/auth/logout'){const token=parseCookies(req.headers.cookie)[config.sessionCookieName];if(token)store.deleteSession(sha256(token));return send(res,204,null,{'set-cookie':clearCookie(config.sessionCookieName,config.nodeEnv==='production')});}
      if(method==='GET'&&path==='/v1/entitlements/me'){const user=await requireUser(req);const entitlement=store.getEntitlement(user.id);return send(res,200,{entitlement:entitlement.tier,status:entitlement.status});}
      if(method==='POST'&&path==='/v1/payments/jazzcash/checkout'){
        const user=await requireUser(req);const {value}=await readJson(req);const plan=PLANS[value.planId];if(!plan)throw fail('Unknown premium plan.',400,'invalid_plan');
        const transaction={id:randomUUID(),userId:user.id,planId:value.planId,amountPkr:plan.price,status:'pending',createdAt:new Date(clock()).toISOString()};const provider=await jazzcash.createCheckout({transactionId:transaction.id,planId:value.planId});store.createTransaction({...transaction,...provider});
        return send(res,201,{transactionId:transaction.id,status:'pending',provider:'JazzCash',redirectUrl:provider.redirectUrl});
      }
      if(method==='POST'&&path==='/v1/payments/jazzcash/webhook'){
        const {value,raw}=await readJson(req);if(!jazzcash.verifyWebhook(raw,req.headers['x-jazzcash-signature']))throw fail('Invalid payment signature.',401,'invalid_signature');
        const tx=store.getTransaction(value.transactionId);if(!tx)throw fail('Unknown transaction.',404,'transaction_not_found');
        if(tx.status!=='paid'&&value.status==='paid'){tx.status='paid';tx.providerReference=value.providerReference??tx.providerReference;store.saveTransaction(tx);const plan=PLANS[tx.planId];store.setEntitlement(tx.userId,{tier:'premium',status:'active',sourceTransactionId:tx.id,expiresAt:clock()+plan.days*86400000});}
        return send(res,202,{accepted:true});
      }
      if(method==='GET'&&path==='/v1/wallet'){const user=await requireUser(req);return send(res,200,{balance:store.wallet(user.id),currency:'Arena Coins'});}
      if(method==='POST'&&path==='/v1/play-sessions'){
        const user=await requireUser(req);const {value}=await readJson(req);const game=store.getGame(value.gameId);if(!game)throw fail('Game not found.',404,'game_not_found');if(game.tier==='premium'&&store.getEntitlement(user.id).tier!=='premium')throw fail('Game Arena+ is required.',403,'premium_required');
        const session=store.createPlaySession({id:randomUUID(),userId:user.id,gameId:game.id,startedAt:clock(),status:'active'});return send(res,201,{playSessionId:session.id});
      }
      const completion=path.match(/^\/v1\/play-sessions\/([^/]+)\/complete$/);
      if(method==='POST'&&completion){
        const user=await requireUser(req);const {value}=await readJson(req);const session=store.getPlaySession(completion[1]);if(!session||session.userId!==user.id)throw fail('Play session not found.',404,'play_session_not_found');
        if(session.status==='completed')return send(res,200,{accepted:true,reward:session.reward,balance:store.wallet(user.id),idempotent:true});
        const score=Number(value.score);const durationMs=Number(value.durationMs);if(!Number.isFinite(score)||score<0||!Number.isFinite(durationMs)||durationMs<1000||durationMs>4*60*60*1000)throw fail('Implausible game result.',422,'result_rejected');
        const game=store.getGame(session.gameId);const reward=game.reward*(store.getEntitlement(user.id).tier==='premium'?2:1);store.appendLedger({id:randomUUID(),userId:user.id,amount:reward,reason:'game_completion',idempotencyKey:`play:${session.id}`,createdAt:new Date(clock()).toISOString()});session.status='completed';session.reward=reward;session.score=score;session.durationMs=durationMs;store.savePlaySession(session);
        return send(res,200,{accepted:true,reward,balance:store.wallet(user.id),idempotent:false});
      }
      return send(res,404,{error:{code:'not_found',message:'Route not found.',requestId}});
    }catch(error){console.error(JSON.stringify({level:'error',requestId,message:error.message,code:error.code??'internal_error'}));return problem(res,error,requestId);}
  };
}
