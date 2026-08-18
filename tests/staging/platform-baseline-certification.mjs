import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';

const player=String(process.env.STAGING_PLAYER_URL||'').replace(/\/$/,'');
const api=String(process.env.STAGING_API_URL||'').replace(/\/$/,'');
const game=String(process.env.STAGING_GAME_URL||'').replace(/\/$/,'');
const output=process.env.BASELINE_CERTIFICATION_OUTPUT||'baseline-results.json';
const samples=Math.max(5,Math.min(30,Number(process.env.STAGING_BASELINE_SAMPLES||10)));
const p95LimitMs=Math.max(500,Number(process.env.STAGING_P95_LIMIT_MS||2500));
const results=[];let failed=false;let blocked=false;

function record(name,status,details={}){results.push({name,status,...details});if(status==='FAIL')failed=true;if(status==='BLOCKED')blocked=true;}
async function lane(name,fn){try{record(name,'PASS',await fn()||{});}catch(error){record(name,error.blocked?'BLOCKED':'FAIL',{error:String(error.message||error).slice(0,300)});}}
function block(message){const error=new Error(message);error.blocked=true;throw error;}
function percentile(values,p){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1))];}
async function timed(url){const start=performance.now();const response=await fetch(url,{redirect:'follow',headers:{'user-agent':'Game-Arena-Staging-Certification/1.0','cache-control':'no-cache'}});const elapsed=Math.round((performance.now()-start)*10)/10;try{await response.body?.cancel();}catch{}return{status:response.status,elapsed,headers:response.headers};}

await lane('https-and-security-boundary',async()=>{
  if(!player||!api)block('STAGING_PLAYER_URL and STAGING_API_URL must be configured.');
  for(const [name,url] of [['player',player],['api',api],...(game?[['game',game]]:[])]){
    const parsed=new URL(url);
    if(parsed.protocol!=='https:')block(`${name} staging origin is not HTTPS.`);
  }
  if(!game)block('STAGING_GAME_URL is not configured; HTTPS game-origin boundary is unproven.');
  const home=await fetch(`${player}/#/home`,{redirect:'follow'});
  if(!home.ok)throw new Error(`player returned HTTP ${home.status}`);
  if(String(home.headers.get('x-content-type-options')||'').toLowerCase()!=='nosniff')throw new Error('player is missing X-Content-Type-Options: nosniff.');
  const hostile=await fetch(`${api}/v1/session`,{headers:{origin:'https://attacker.invalid'}});
  if(![200,401,403].includes(hostile.status))throw new Error(`session CORS probe returned HTTP ${hostile.status}`);
  const allowOrigin=String(hostile.headers.get('access-control-allow-origin')||'');
  if(allowOrigin==='*'||allowOrigin==='https://attacker.invalid')throw new Error('API reflected or wildcarded an unapproved Origin.');
  return{https:true,nosniff:true,unapprovedOriginRejected:true};
});

await lane('public-latency-baseline',async()=>{
  if(!player||!api)block('Staging public origins are unresolved.');
  const targets=[['player-home',`${player}/#/home`],['api-ready',`${api}/readyz`],['catalogue',`${api}/v1/catalog/games`]];
  const measurements={};
  for(const [name,url] of targets){
    const times=[];
    for(let i=0;i<samples;i++){
      const {status,elapsed}=await timed(url);
      if(status<200||status>=400)throw new Error(`${name} returned HTTP ${status} during baseline sample ${i+1}.`);
      times.push(elapsed);
    }
    const p95=percentile(times,.95);
    const average=Math.round((times.reduce((sum,value)=>sum+value,0)/times.length)*10)/10;
    measurements[name]={samples:times.length,averageMs:average,p95Ms:p95,maxMs:Math.max(...times)};
    if(p95>p95LimitMs)throw new Error(`${name} p95 ${p95}ms exceeds staging gate ${p95LimitMs}ms.`);
  }
  return{p95LimitMs,measurements};
});

const decision=failed?'FAILED':blocked?'BLOCKED':'PASS';
await writeFile(output,JSON.stringify({schemaVersion:'game-arena-staging-baseline.v1',decision,generatedAt:new Date().toISOString(),samples,p95LimitMs,results},null,2));
console.log(JSON.stringify({decision,samples,p95LimitMs}));
process.exitCode=failed?1:blocked?2:0;
