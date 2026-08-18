import {readFile,writeFile} from 'node:fs/promises';
const apiBase=String(process.env.STAGING_API_URL||'').replace(/\/$/,'');
const statePath=process.env.API_CERTIFICATION_STATE||'/tmp/game-arena-certification-state.json';
const output=process.env.RESTART_CERTIFICATION_OUTPUT||'restart-results.json';
if(!apiBase)throw new Error('STAGING_API_URL is required.');
const state=JSON.parse(await readFile(statePath,'utf8'));
const headers={cookie:state.cookie};
const session=await fetch(`${apiBase}/v1/session`,{headers});
const sessionData=await session.json().catch(()=>null);
let decision='PASS';let error=null;
if(session.status!==200||sessionData?.authenticated!==true){decision='FAIL';error='authenticated session did not survive API restart';}
if(decision==='PASS'&&state.paymentTransaction){
  const payment=await fetch(`${apiBase}/v1/payments/${encodeURIComponent(state.paymentTransaction)}`,{headers});
  const data=await payment.json().catch(()=>null);
  if(payment.status!==200||data?.status!=='pending'){decision='FAIL';error='acknowledged payment state did not survive API restart';}
}
await writeFile(output,JSON.stringify({schemaVersion:'game-arena-staging-restart.v1',decision,generatedAt:new Date().toISOString(),checks:{session:true,payment:Boolean(state.paymentTransaction)},...(error?{error}: {})},null,2));
if(decision!=='PASS')process.exitCode=1;
