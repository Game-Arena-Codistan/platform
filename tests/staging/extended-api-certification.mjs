import {readFile,writeFile} from 'node:fs/promises';

const apiBase=String(process.env.STAGING_API_URL||'').replace(/\/$/,'');
const playerUrl=String(process.env.STAGING_PLAYER_URL||'').replace(/\/$/,'');
const gameBase=String(process.env.STAGING_GAME_URL||'').replace(/\/$/,'');
const statePath=process.env.API_CERTIFICATION_STATE||'/tmp/game-arena-certification-state.json';
const output=process.env.EXTENDED_CERTIFICATION_OUTPUT||'extended-results.json';
if(!apiBase||!playerUrl)throw new Error('STAGING_API_URL and STAGING_PLAYER_URL are required.');
const state=JSON.parse(await readFile(statePath,'utf8'));
const results=[];let failed=false;let blocked=false;
function record(name,status,details={}){results.push({name,status,...details});if(status==='FAIL')failed=true;if(status==='BLOCKED')blocked=true;}
function expectStatus(actual,allowed,message){if(!allowed.includes(actual))throw new Error(`${message}; expected ${allowed.join('/')}, got ${actual}`);}
function block(message){const error=new Error(message);error.blocked=true;throw error;}
async function lane(name,fn){try{record(name,'PASS',await fn()||{});}catch(error){record(name,error.blocked?'BLOCKED':'FAIL',{error:String(error.message||error).slice(0,300)});}}
async function call(path,{method='GET',body}={}){
  const headers={accept:'application/json',cookie:state.cookie};
  if(body!==undefined)headers['content-type']='application/json';
  if(!['GET','HEAD','OPTIONS'].includes(method)){
    headers.origin=playerUrl;
    headers['x-csrf-token']=state.csrf;
  }
  const response=await fetch(`${apiBase}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=(response.headers.get('content-type')||'').includes('json')?await response.json().catch(()=>null):null;
  return{response,data};
}

await lane('controlled-game-origin-and-catalogue-media',async()=>{
  if(!gameBase)block('STAGING_GAME_URL is not configured; controlled game-origin certification cannot run.');
  const origin=await fetch(`${gameBase}/healthz`,{redirect:'follow'});expectStatus(origin.status,[200],'controlled game origin health failed');
  const catalog=await call('/v1/catalog/games');expectStatus(catalog.response.status,[200],'catalogue fetch failed');
  const sample=(catalog.data?.games||[]).slice(0,3);
  if(!sample.length)throw new Error('catalogue has no representative media sample.');
  const checked=[];
  for(const game of sample){
    for(const [kind,url] of [['game',game.gameUrl],['icon',game.iconUrl],['banner',game.bannerUrl]]){
      if(!url)throw new Error(`${game.id} is missing ${kind} URL.`);
      const base=kind==='game'?gameBase:playerUrl;
      const parsed=new URL(url,base);
      if(parsed.protocol!=='https:')throw new Error(`${game.id} ${kind} URL is not HTTPS.`);
      const response=await fetch(parsed,{redirect:'follow',headers:{'user-agent':'Game-Arena-Staging-Certification/1.0'}});
      if(response.status<200||response.status>=400)throw new Error(`${game.id} ${kind} returned HTTP ${response.status}.`);
      checked.push(`${game.id}:${kind}`);
      try{await response.body?.cancel();}catch{}
    }
  }
  return{controlledOrigin:true,representativeAssets:checked.length};
});

await lane('premium-game-authorization',async()=>{
  const catalog=await call('/v1/catalog/games');expectStatus(catalog.response.status,[200],'catalogue fetch failed');
  const premium=(catalog.data?.games||[]).find(game=>game.tier==='premium');
  if(!premium)block('No premium game fixture is available in staging.');
  const denied=await call('/v1/play-sessions',{method:'POST',body:{gameId:premium.id}});
  expectStatus(denied.response.status,[403],'free player was not denied premium game start');
  if(denied.data?.error?.code!=='premium_required')throw new Error('premium game denial returned the wrong error code.');
  return{gameId:premium.id,freePlayerDenied:true};
});

await lane('competition-authorization-and-fixtures',async()=>{
  const ready=await call('/readyz');expectStatus(ready.response.status,[200],'readyz failed');
  if(ready.data?.competitions!==true)return{status:'NOT_APPLICABLE',reason:'competitions disabled in deployed staging'};
  const challengeResult=await call('/v1/challenges');expectStatus(challengeResult.response.status,[200],'challenge listing failed');
  const tournamentResult=await call('/v1/tournaments');expectStatus(tournamentResult.response.status,[200],'tournament listing failed');
  const challenges=challengeResult.data?.challenges||[];const tournaments=tournamentResult.data?.tournaments||[];
  const freeChallenge=challenges.find(item=>item.premium!==true);
  const premiumChallenge=challenges.find(item=>item.premium===true);
  const premiumTournament=tournaments.find(item=>item.premium===true);
  if(!freeChallenge||!premiumChallenge||!premiumTournament)block('Competitions are enabled but deterministic free/premium challenge and premium tournament fixtures are incomplete.');
  const incomplete=await call(`/v1/challenges/${encodeURIComponent(freeChallenge.id)}/claim`,{method:'POST'});
  expectStatus(incomplete.response.status,[409],'incomplete free challenge claim was not rejected');
  if(incomplete.data?.error?.code!=='challenge_incomplete')throw new Error('incomplete challenge returned the wrong error code.');
  const premiumClaim=await call(`/v1/challenges/${encodeURIComponent(premiumChallenge.id)}/claim`,{method:'POST'});
  expectStatus(premiumClaim.response.status,[403],'free player was not denied premium challenge claim');
  if(premiumClaim.data?.error?.code!=='premium_required')throw new Error('premium challenge denial returned the wrong error code.');
  const premiumJoin=await call(`/v1/tournaments/${encodeURIComponent(premiumTournament.id)}/join`,{method:'POST'});
  expectStatus(premiumJoin.response.status,[403],'free player was not denied premium tournament entry');
  if(premiumJoin.data?.error?.code!=='premium_required')throw new Error('premium tournament denial returned the wrong error code.');
  return{challenges:challenges.length,tournaments:tournaments.length,authorization:true};
});

const baselinePath='certification/baseline-results.json';
try{
  const priorExit=process.exitCode;
  process.exitCode=undefined;
  process.env.BASELINE_CERTIFICATION_OUTPUT=baselinePath;
  await import('./platform-baseline-certification.mjs');
  const baselineExit=Number(process.exitCode||0);
  process.exitCode=priorExit;
  const baseline=JSON.parse(await readFile(baselinePath,'utf8'));
  const counts={pass:baseline.results?.filter(item=>item.status==='PASS').length||0,fail:baseline.results?.filter(item=>item.status==='FAIL').length||0,blocked:baseline.results?.filter(item=>item.status==='BLOCKED').length||0};
  if(baseline.decision==='FAILED'||baselineExit===1)record('platform-security-and-latency-baseline','FAIL',{decision:baseline.decision,p95LimitMs:baseline.p95LimitMs,...counts});
  else if(baseline.decision==='BLOCKED'||baselineExit===2)record('platform-security-and-latency-baseline','BLOCKED',{decision:baseline.decision,p95LimitMs:baseline.p95LimitMs,...counts});
  else record('platform-security-and-latency-baseline','PASS',{decision:baseline.decision,p95LimitMs:baseline.p95LimitMs,...counts});
}catch(error){record('platform-security-and-latency-baseline','BLOCKED',{error:`Security/latency baseline could not execute: ${String(error.message||error).slice(0,220)}`});}

const paymentPath='certification/payment-results.json';
try{
  const priorExit=process.exitCode;
  process.exitCode=undefined;
  process.env.PAYMENT_CERTIFICATION_OUTPUT=paymentPath;
  await import('./payment-callback-certification.mjs');
  const paymentExit=Number(process.exitCode||0);
  process.exitCode=priorExit;
  const payment=JSON.parse(await readFile(paymentPath,'utf8'));
  const counts={pass:payment.results?.filter(item=>item.status==='PASS').length||0,fail:payment.results?.filter(item=>item.status==='FAIL').length||0,blocked:payment.results?.filter(item=>item.status==='BLOCKED').length||0};
  if(payment.decision==='FAILED'||paymentExit===1)record('payment-callback-matrix','FAIL',{decision:payment.decision,...counts});
  else if(payment.decision==='BLOCKED'||paymentExit===2)record('payment-callback-matrix','BLOCKED',{decision:payment.decision,...counts});
  else record('payment-callback-matrix','PASS',{decision:payment.decision,...counts});
}catch(error){record('payment-callback-matrix','BLOCKED',{error:`Payment callback harness could not execute: ${String(error.message||error).slice(0,220)}`});}

const decision=failed?'FAILED':blocked?'BLOCKED':'PASS';
await writeFile(output,JSON.stringify({schemaVersion:'game-arena-staging-extended-api.v1',decision,generatedAt:new Date().toISOString(),results},null,2));
console.log(JSON.stringify({decision,pass:results.filter(item=>item.status==='PASS').length,fail:results.filter(item=>item.status==='FAIL').length,blocked:results.filter(item=>item.status==='BLOCKED').length}));
process.exitCode=failed?1:blocked?2:0;
