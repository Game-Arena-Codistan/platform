import {writeFile} from 'node:fs/promises';

const apiBase=String(process.env.STAGING_API_URL||'').replace(/\/$/,'');
const playerUrl=String(process.env.STAGING_PLAYER_URL||'').replace(/\/$/,'');
const runId=String(process.env.QA_RUN_ID||Date.now()).replace(/[^a-zA-Z0-9-]/g,'').slice(-32);
const correlation=`AUTO-QA-${runId}`;
const identifier=process.env.STAGING_QA_PLAYER_IDENTIFIER||`autoqa+${runId}@example.invalid`;
if(!apiBase||!playerUrl)throw new Error('STAGING_API_URL and STAGING_PLAYER_URL are required.');

const results=[];
const cookies=new Map();
let csrf='';
let blocked=false;
let failed=false;

function record(name,status,details={}){results.push({name,status,...details});if(status==='BLOCKED')blocked=true;if(status==='FAIL')failed=true;}
function cookieHeader(){return[...cookies].map(([name,value])=>`${name}=${value}`).join('; ');}
function rememberCookies(headers){const values=typeof headers.getSetCookie==='function'?headers.getSetCookie():[headers.get('set-cookie')].filter(Boolean);for(const raw of values){const first=raw.split(';',1)[0];const at=first.indexOf('=');if(at>0)cookies.set(first.slice(0,at),first.slice(at+1));}}
async function call(path,{method='GET',body,headers={},auth=false,redirect='follow'}={}){
  const requestHeaders={'accept':'application/json',...headers};
  if(body!==undefined)requestHeaders['content-type']='application/json';
  if(auth&&cookies.size)requestHeaders.cookie=cookieHeader();
  if(auth&&!['GET','HEAD','OPTIONS'].includes(method)){
    requestHeaders.origin=playerUrl;
    requestHeaders['x-csrf-token']=csrf;
  }
  const response=await fetch(`${apiBase}${path}`,{method,headers:requestHeaders,body:body===undefined?undefined:JSON.stringify(body),redirect});
  rememberCookies(response.headers);
  let data=null;const type=response.headers.get('content-type')||'';
  if(type.includes('json'))data=await response.json().catch(()=>null);
  return{response,data};
}
function expectStatus(actual,allowed,message){if(!allowed.includes(actual))throw new Error(`${message}; expected ${allowed.join('/')}, got ${actual}`);}
async function lane(name,fn){try{const details=await fn();record(name,'PASS',details||{});}catch(error){const status=error?.blocked?'BLOCKED':'FAIL';record(name,status,{error:String(error.message||error).slice(0,300)});}}
function block(message){const error=new Error(message);error.blocked=true;throw error;}

let ready;
let catalogue;
let user;
let paymentTransaction;
await lane('runtime-readiness',async()=>{
  const health=await call('/healthz');expectStatus(health.response.status,[200],'healthz failed');
  const state=await call('/readyz');expectStatus(state.response.status,[200],'readyz failed');
  if(state.data?.status!=='ready')throw new Error('API did not report ready.');
  if(!Number.isInteger(Number(state.data.catalogue))||Number(state.data.catalogue)<1)throw new Error('readyz catalogue is empty.');
  ready=state.data;
  return{catalogueCount:Number(state.data.catalogue),otpMode:state.data.otp,paymentMode:state.data.payments};
});

await lane('catalogue',async()=>{
  const result=await call('/v1/catalog/games');expectStatus(result.response.status,[200],'catalogue failed');
  if(!Array.isArray(result.data?.games)||!result.data.games.length)throw new Error('public catalogue is empty.');
  catalogue=result.data.games;
  const unsafe=catalogue.filter(game=>(game.status&&!['active','live'].includes(String(game.status).toLowerCase()))||Number(game.rolloutPercent??game.rolloutPercentage??100)<=0);
  if(unsafe.length)throw new Error('public catalogue exposed inactive or zero-rollout records.');
  return{publicGames:catalogue.length};
});

await lane('otp-session-negative-and-positive',async()=>{
  if(ready?.otp!=='mock')block(`OTP provider mode ${ready?.otp||'unknown'} requires a protected staging QA identity/provider harness.`);
  const otp=await call('/v1/auth/otp',{method:'POST',body:{identifier}});expectStatus(otp.response.status,[202],'OTP request failed');
  const challenge=otp.data?.challengeId;const code=otp.data?.debugCode;
  if(!challenge||!/^\d{6}$/.test(String(code||'')))block('Mock staging did not return a debug OTP code to the private certification runner.');
  const invalidCode=code==='000000'?'111111':'000000';
  const invalid=await call('/v1/auth/otp/verify',{method:'POST',body:{challengeId:challenge,code:invalidCode}});
  expectStatus(invalid.response.status,[400],'invalid OTP was not rejected');
  const verified=await call('/v1/auth/otp/verify',{method:'POST',body:{challengeId:challenge,code}});
  expectStatus(verified.response.status,[200],'valid OTP verification failed');
  if(!verified.data?.user?.id||!verified.data?.csrfToken)throw new Error('OTP verification did not return authenticated state.');
  csrf=verified.data.csrfToken;user=verified.data.user;
  const session=await call('/v1/session',{auth:true});expectStatus(session.response.status,[200],'session lookup failed');
  if(session.data?.authenticated!==true)throw new Error('session is not authenticated after OTP verification.');
  return{authenticated:true};
});

await lane('protected-access',async()=>{
  const unauth=await call('/v1/wallet');expectStatus(unauth.response.status,[401],'unauthenticated wallet access was not denied');
  const wallet=await call('/v1/wallet',{auth:true});expectStatus(wallet.response.status,[200],'authenticated wallet failed');
  if(!Number.isFinite(Number(wallet.data?.balance)))throw new Error('wallet balance is not numeric.');
  return{walletAccessible:true};
});

await lane('play-proof-and-idempotency',async()=>{
  if(!user||!catalogue?.length)block('authentication or catalogue prerequisite unavailable.');
  const game=catalogue.find(item=>item.tier!=='premium')||catalogue[0];
  const started=await call('/v1/play-sessions',{method:'POST',auth:true,body:{gameId:game.id}});expectStatus(started.response.status,[201],'play session start failed');
  const play=started.data;if(!play?.playSessionId||!play?.nonce||!play?.gameVersion)throw new Error('play session proof fields missing.');
  const invalid=await call(`/v1/play-sessions/${play.playSessionId}/complete`,{method:'POST',auth:true,body:{score:1,durationMs:2000,completedAt:Date.now(),gameVersion:play.gameVersion,nonce:'invalid-proof'}});
  expectStatus(invalid.response.status,[422],'invalid play proof was not rejected');
  const payload={score:1,durationMs:2000,completedAt:Date.now(),gameVersion:play.gameVersion,nonce:play.nonce};
  const complete=await call(`/v1/play-sessions/${play.playSessionId}/complete`,{method:'POST',auth:true,body:payload});expectStatus(complete.response.status,[200,202],'valid play completion failed');
  const replay=await call(`/v1/play-sessions/${play.playSessionId}/complete`,{method:'POST',auth:true,body:payload});expectStatus(replay.response.status,[200,202],'play completion replay failed');
  if(replay.data?.idempotent!==true)throw new Error('duplicate play completion was not idempotent.');
  const leaderboard=await call(`/v1/leaderboards/${encodeURIComponent(game.id)}?limit=10`);expectStatus(leaderboard.response.status,[200],'leaderboard failed');
  return{gameId:game.id,completionStatus:complete.data?.status,replayIdempotent:true};
});

await lane('membership-checkout-idempotency-and-return-safety',async()=>{
  if(ready?.payments==='hosted'&&process.env.STAGING_PAYMENT_SANDBOX_READY!=='true')block('PAYMENT SANDBOX NOT CONFIGURED');
  if(!['mock','hosted'].includes(ready?.payments))block(`payment provider mode ${ready?.payments||'unknown'} is not certifiable.`);
  const key=`${correlation}-membership`;
  const first=await call('/v1/payments/jazzcash/checkout',{method:'POST',auth:true,headers:{'idempotency-key':key},body:{planId:'monthly'}});expectStatus(first.response.status,[201],'membership checkout failed');
  const second=await call('/v1/payments/jazzcash/checkout',{method:'POST',auth:true,headers:{'idempotency-key':key},body:{planId:'monthly'}});expectStatus(second.response.status,[201],'membership checkout retry failed');
  if(!first.data?.transactionId||second.data?.transactionId!==first.data.transactionId)throw new Error('repeated membership checkout created a different transaction.');
  paymentTransaction=first.data.transactionId;
  const returned=await call('/v1/payments/jazzcash/return',{method:'POST',redirect:'manual',body:{transactionId:paymentTransaction,status:'paid',amountMinor:29900,currency:'PKR'}});
  expectStatus(returned.response.status,[303],'browser payment return did not redirect safely');
  const status=await call(`/v1/payments/${paymentTransaction}`,{auth:true});expectStatus(status.response.status,[200],'payment status lookup failed');
  if(status.data?.status!=='pending')throw new Error('browser return incorrectly activated payment/entitlement.');
  return{transactionId:paymentTransaction,duplicateCheckoutSuppressed:true,browserReturnStatus:'pending'};
});

await lane('topup-offers',async()=>{
  const offers=await call('/v1/offers/topups',{auth:true});expectStatus(offers.response.status,[200],'top-up offers failed');
  if(!offers.data?.enabled||!offers.data?.offers?.length)return{status:'NOT_APPLICABLE',reason:'no live top-up offers'};
  const offer=offers.data.offers[0];const key=`${correlation}-topup`;
  const first=await call('/v1/offers/topups/checkout',{method:'POST',auth:true,headers:{'idempotency-key':key},body:{offerId:offer.id}});expectStatus(first.response.status,[201],'top-up checkout failed');
  const second=await call('/v1/offers/topups/checkout',{method:'POST',auth:true,headers:{'idempotency-key':key},body:{offerId:offer.id}});expectStatus(second.response.status,[201],'top-up checkout retry failed');
  if(first.data?.transactionId!==second.data?.transactionId)throw new Error('repeated top-up checkout created a duplicate transaction.');
  return{offerId:offer.id,duplicateCheckoutSuppressed:true};
});

await lane('voucher',async()=>{
  const code=process.env.STAGING_QA_VOUCHER_CODE;
  if(!code)return{status:'NOT_APPLICABLE',reason:'no protected deterministic QA voucher configured'};
  const first=await call('/v1/vouchers/redeem',{method:'POST',auth:true,body:{code}});expectStatus(first.response.status,[200,201],'voucher redemption failed');
  const second=await call('/v1/vouchers/redeem',{method:'POST',auth:true,body:{code}});expectStatus(second.response.status,[200],'voucher replay failed');
  if(second.data?.duplicate!==true)throw new Error('voucher replay was not idempotent.');
  return{duplicateRedemptionSuppressed:true};
});

await lane('multiplayer-room-coordination',async()=>{
  const rooms=await call('/v1/multiplayer/rooms');expectStatus(rooms.response.status,[200],'room listing failed');
  const game=catalogue?.find(item=>item.multiplayer===true);
  if(!game)return{status:'NOT_APPLICABLE',reason:'no public multiplayer-capable game'};
  const created=await call('/v1/multiplayer/rooms',{method:'POST',auth:true,body:{gameId:game.id,name:`QA ${runId.slice(-12)}`,maxPlayers:2}});expectStatus(created.response.status,[201],'room creation failed');
  if(created.data?.room?.gameId!==game.id)throw new Error('created room is not correlated to the selected game.');
  return{gameId:game.id,roomCreated:true};
});

await lane('support',async()=>{
  const support=await call('/v1/support/tickets',{method:'POST',auth:true,body:{topic:'Other',message:`Automated staging certification ${correlation}. API support journey verification.`,reference:correlation}});
  if(support.response.status===503)block('support delivery is not configured/reachable in staging.');
  expectStatus(support.response.status,[201],'support ticket creation failed');
  if(!support.data?.ticket?.id)throw new Error('support ticket did not return a reference.');
  return{ticketId:support.data.ticket.id};
});

if(cookies.size&&csrf){
  await writeFile(process.env.API_CERTIFICATION_STATE||'/tmp/game-arena-certification-state.json',JSON.stringify({cookie:cookieHeader(),csrf,paymentTransaction}),{mode:0o600});
}
const decision=failed?'FAILED':blocked?'BLOCKED':'PASS';
const document={schemaVersion:'game-arena-staging-api.v1',runId,correlation,decision,generatedAt:new Date().toISOString(),results};
await writeFile(process.env.API_CERTIFICATION_OUTPUT||'api-results.json',JSON.stringify(document,null,2));
console.log(JSON.stringify({decision,pass:results.filter(item=>item.status==='PASS').length,fail:results.filter(item=>item.status==='FAIL').length,blocked:results.filter(item=>item.status==='BLOCKED').length}));
process.exitCode=failed?1:blocked?2:0;
