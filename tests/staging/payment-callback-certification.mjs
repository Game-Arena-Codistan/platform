import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';

const apiBase=String(process.env.STAGING_API_URL||'').replace(/\/$/,'');
const playerUrl=String(process.env.STAGING_PLAYER_URL||'').replace(/\/$/,'');
const runId=String(process.env.QA_RUN_ID||Date.now()).replace(/[^a-zA-Z0-9-]/g,'').slice(-32);
const statePath=process.env.API_CERTIFICATION_STATE||'/tmp/game-arena-certification-state.json';
const output=process.env.PAYMENT_CERTIFICATION_OUTPUT||'payment-results.json';
if(!apiBase||!playerUrl)throw new Error('STAGING_API_URL and STAGING_PLAYER_URL are required.');
const state=JSON.parse(await readFile(statePath,'utf8'));
const results=[];let failed=false;let blocked=false;
function record(name,status,details={}){results.push({name,status,...details});if(status==='FAIL')failed=true;if(status==='BLOCKED')blocked=true;}
function expectStatus(actual,allowed,message){if(!allowed.includes(actual))throw new Error(`${message}; expected ${allowed.join('/')}, got ${actual}`);}
async function lane(name,fn){try{record(name,'PASS',await fn()||{});}catch(error){record(name,error.blocked?'BLOCKED':'FAIL',{error:String(error.message||error).slice(0,300)});}}
function block(message){const error=new Error(message);error.blocked=true;throw error;}
function awsText(args){return execFileSync('aws',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
function resolveRuntimeWebhookSecret(){
  const host=String(process.env.DEPLOY_HOST||'').trim();
  const user=String(process.env.DEPLOY_USER||'').trim();
  const key=String(process.env.STAGING_QA_SSH_KEY_PATH||`${process.env.HOME||''}/.ssh/game-arena-staging`).trim();
  if(!host||!user||!key)return'';
  const script=`set -euo pipefail\ncd /opt/codistan/platform\nvalue="$(grep -m1 '^JAZZCASH_WEBHOOK_SECRET=' infra/.env | cut -d= -f2- || true)"\nvalue="\${value#\\\"}"; value="\${value%\\\"}"\nvalue="\${value#\\'}"; value="\${value%\\'}"\nprintf '%s' "$value"\n`;
  try{return execFileSync('ssh',['-i',key,'-o','BatchMode=yes',`${user}@${host}`,'bash -s'],{encoding:'utf8',input:script,stdio:['pipe','pipe','ignore']}).trim();}
  catch{return'';}
}
function resolveWebhookSecret(){
  if(process.env.JAZZCASH_WEBHOOK_SECRET)return process.env.JAZZCASH_WEBHOOK_SECRET;
  const runtime=resolveRuntimeWebhookSecret();if(runtime)return runtime;
  const prefix=process.env.AWS_CONFIG_PREFIX||'/game-arena/staging';
  try{
    const arn=awsText(['ssm','get-parameter','--name',`${prefix}/application-secret-arn`,'--query','Parameter.Value','--output','text']);
    const secret=awsText(['secretsmanager','get-secret-value','--secret-id',arn,'--query','SecretString','--output','text']);
    return String(JSON.parse(secret).jazzcash_webhook_secret||'');
  }catch{return'';}
}
const webhookSecret=resolveWebhookSecret();
async function authCall(path,{method='GET',body,headers={}}={}){
  const requestHeaders={accept:'application/json',cookie:state.cookie,...headers};
  if(body!==undefined)requestHeaders['content-type']='application/json';
  if(!['GET','HEAD','OPTIONS'].includes(method)){requestHeaders.origin=playerUrl;requestHeaders['x-csrf-token']=state.csrf;}
  const response=await fetch(`${apiBase}${path}`,{method,headers:requestHeaders,body:body===undefined?undefined:JSON.stringify(body)});
  const data=(response.headers.get('content-type')||'').includes('json')?await response.json().catch(()=>null):null;
  return{response,data};
}
async function checkout(suffix){
  const result=await authCall('/v1/payments/jazzcash/checkout',{method:'POST',headers:{'idempotency-key':`AUTO-QA-${runId}-${suffix}`},body:{planId:'monthly'}});
  expectStatus(result.response.status,[201],`checkout ${suffix} failed`);
  if(!result.data?.transactionId)throw new Error(`checkout ${suffix} did not return a transaction ID.`);
  return result.data.transactionId;
}
async function paymentStatus(transactionId){
  const result=await authCall(`/v1/payments/${encodeURIComponent(transactionId)}`);
  expectStatus(result.response.status,[200],'payment status lookup failed');
  return result.data;
}
function event(transactionId,status,eventId,{amountMinor=29900}={}){
  return{transactionId,providerReference:`QA-${runId}-${status}`,providerEventId:eventId,status,merchantId:'mock-merchant',billReference:transactionId,currency:'PKR',amountMinor};
}
async function webhook(fields){
  const raw=JSON.stringify(fields);
  const signature=createHmac('sha256',webhookSecret).update(raw).digest('hex');
  const response=await fetch(`${apiBase}/v1/payments/jazzcash/webhook`,{method:'POST',headers:{'content-type':'application/json','x-jazzcash-signature':signature},body:raw});
  const data=(response.headers.get('content-type')||'').includes('json')?await response.json().catch(()=>null):null;
  return{response,data};
}

await lane('provider-mode',async()=>{
  const ready=await fetch(`${apiBase}/readyz`);expectStatus(ready.status,[200],'readyz failed');
  const data=await ready.json();
  if(data.payments==='hosted')block('PAYMENT SANDBOX NOT CONFIGURED — hosted JazzCash requires provider-specific sandbox automation under #17.');
  if(data.payments!=='mock')block(`Payment mode ${data.payments||'unknown'} is not certifiable by the mock callback harness.`);
  if(!webhookSecret)block('Staging mock payment webhook secret is unavailable to the protected certification job.');
  return{mode:'mock',externalTimeoutScenario:'NOT_APPLICABLE_IN_MOCK'};
});

if(!blocked){
  await lane('pending-callback-stays-pending',async()=>{
    const transactionId=await checkout('pending');
    const response=await webhook(event(transactionId,'pending',`AUTO-QA-${runId}-pending`));
    expectStatus(response.response.status,[202],'pending callback failed');
    const current=await paymentStatus(transactionId);
    if(current.status!=='pending')throw new Error(`pending callback produced ${current.status}.`);
    return{transactionId,status:'pending'};
  });

  await lane('amount-mismatch-is-rejected',async()=>{
    const transactionId=await checkout('mismatch');
    const response=await webhook(event(transactionId,'paid',`AUTO-QA-${runId}-mismatch`,{amountMinor:1}));
    expectStatus(response.response.status,[422],'amount mismatch was not rejected');
    if(response.data?.error?.code!=='payment_value_mismatch')throw new Error('amount mismatch returned the wrong error code.');
    const current=await paymentStatus(transactionId);
    if(current.status!=='pending')throw new Error('amount mismatch mutated the transaction out of pending.');
    return{transactionId,rejected:true};
  });

  await lane('failure-cannot-later-become-paid',async()=>{
    const transactionId=await checkout('failed');
    const failedEvent=await webhook(event(transactionId,'failed',`AUTO-QA-${runId}-failed`));
    expectStatus(failedEvent.response.status,[202],'failed callback failed');
    let current=await paymentStatus(transactionId);if(current.status!=='failed')throw new Error('failed payment did not remain failed.');
    const latePaid=await webhook(event(transactionId,'paid',`AUTO-QA-${runId}-late-paid`));
    expectStatus(latePaid.response.status,[202],'late paid callback was not handled');
    if(latePaid.data?.reconciled!==true)throw new Error('late paid callback did not create reconciliation handling.');
    current=await paymentStatus(transactionId);if(current.status!=='failed')throw new Error('failed payment incorrectly became paid.');
    return{transactionId,latePaidReconciled:true,status:'failed'};
  });

  await lane('cancel-void-stays-voided',async()=>{
    const transactionId=await checkout('voided');
    const response=await webhook(event(transactionId,'voided',`AUTO-QA-${runId}-voided`));
    expectStatus(response.response.status,[202],'voided callback failed');
    const current=await paymentStatus(transactionId);if(current.status!=='voided')throw new Error('voided payment did not remain voided.');
    return{transactionId,status:'voided'};
  });

  await lane('success-replay-and-refund',async()=>{
    const transactionId=await checkout('paid');
    const paidFields=event(transactionId,'paid',`AUTO-QA-${runId}-paid`);
    const first=await webhook(paidFields);expectStatus(first.response.status,[202],'paid callback failed');
    if(first.data?.duplicate!==false)throw new Error('first paid callback was incorrectly marked duplicate.');
    let current=await paymentStatus(transactionId);
    if(current.status!=='paid'||current.entitlement?.tier!=='premium'||current.entitlement?.status!=='active')throw new Error('paid callback did not activate the matching entitlement.');
    const replay=await webhook(paidFields);expectStatus(replay.response.status,[202],'paid callback replay failed');
    if(replay.data?.duplicate!==true)throw new Error('duplicate paid callback was not recognized as replay.');
    current=await paymentStatus(transactionId);if(current.status!=='paid')throw new Error('duplicate callback changed paid state.');
    const refund=await webhook(event(transactionId,'refunded',`AUTO-QA-${runId}-refund`));expectStatus(refund.response.status,[202],'refund callback failed');
    current=await paymentStatus(transactionId);
    if(current.status!=='refunded'||current.entitlement?.tier!=='free')throw new Error('refund did not reverse the paid entitlement safely.');
    return{transactionId,paid:true,replayIdempotent:true,refunded:true};
  });
}

const decision=failed?'FAILED':blocked?'BLOCKED':'PASS';
await writeFile(output,JSON.stringify({schemaVersion:'game-arena-staging-payment-callback.v1',decision,generatedAt:new Date().toISOString(),results},null,2));
console.log(JSON.stringify({decision,pass:results.filter(item=>item.status==='PASS').length,fail:results.filter(item=>item.status==='FAIL').length,blocked:results.filter(item=>item.status==='BLOCKED').length}));
process.exitCode=failed?1:blocked?2:0;
