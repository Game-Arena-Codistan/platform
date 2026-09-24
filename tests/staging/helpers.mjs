import {createHash} from 'node:crypto';
import {expect} from '@playwright/test';
import {fetchDeliveredBrevoOtp} from './brevo-otp.mjs';

export const runId=String(process.env.QA_RUN_ID||Date.now()).replace(/[^a-zA-Z0-9-]/g,'').slice(-32);
const genericOtp=String(process.env.STAGING_QA_OTP_CODE||'').trim();
const freeIdentifier=String(process.env.STAGING_QA_FREE_PLAYER_IDENTIFIER||'game.arena+qa-free@codistan.org').trim();
const freeOtp=String(process.env.STAGING_QA_FREE_PLAYER_OTP_CODE||'').trim();
const premiumIdentifier=String(process.env.STAGING_QA_PREMIUM_PLAYER_IDENTIFIER||'game.arena+qa-premium@codistan.org').trim();
const premiumOtp=String(process.env.STAGING_QA_PREMIUM_PLAYER_OTP_CODE||'').trim();

function protectedIdentity(tier='free'){
  return tier==='premium'?{identifier:premiumIdentifier,otp:premiumOtp}:{identifier:freeIdentifier,otp:freeOtp};
}

export function qaIdentifier(testInfo,label='player'){
  const project=String(testInfo.project.name||'browser').replace(/[^a-z0-9]/gi,'-').toLowerCase();
  const suffix=String(label).replace(/[^a-z0-9]/gi,'-').toLowerCase();
  const token=createHash('sha256').update(`${runId}|${project}|${suffix}`).digest('hex').slice(0,12);
  return `game.arena+qa-auto-${runId.slice(-10)}-${token}@codistan.org`;
}

export function protectedQaIdentifier(tier='free'){
  return protectedIdentity(tier).identifier;
}

export function watchPage(page){
  const failures=[];
  page.on('pageerror',error=>failures.push(`pageerror:${error.message}`));
  page.on('console',message=>{if(message.type()==='error')failures.push(`console:${message.text()}`);});
  return()=>{
    const material=failures.filter(item=>!item.includes('favicon'));
    expect(material,`unexpected browser errors: ${material.join(' | ')}`).toEqual([]);
  };
}

const retriableProtectedOtpMarkers=new Set(['BREVO_OTP_NOT_VISIBLE','BREVO_OTP_DELIVERY_PENDING','BREVO_OTP_CONTENT_PENDING','BREVO_OTP_PROVIDER_RETRYABLE','BREVO_OTP_CODE_NOT_FOUND','BREVO_OTP_NOT_DELIVERED']);
function otpMarker(error){return String(error?.message||'').match(/BREVO_OTP_[A-Z0-9_]+/)?.[0]||'';}

async function resolveOtp({identity,otpResponse,tier,protectedAccount,requestedAt,waitMs=180000}){
  if(!otpResponse.challengeId)throw new Error(`BLOCKED: ${tier} staging QA OTP request did not return a challenge.`);
  if(!protectedAccount){
    const code=String(otpResponse.debugCode||genericOtp||'');
    if(!/^\d{6}$/.test(code))throw new Error(`BLOCKED: synthetic ${tier} staging QA requires debug OTP automation.`);
    return code;
  }
  const configured=protectedIdentity(tier);
  const mode=String(process.env.STAGING_QA_REAL_OTP_MODE||'brevo-remote').trim().toLowerCase();
  if(mode==='static'){
    if(!/^\d{6}$/.test(configured.otp))throw new Error(`BLOCKED: ${tier} protected staging QA OTP code is not configured.`);
    return configured.otp;
  }
  if(mode==='debug'){
    const code=String(otpResponse.debugCode||'');
    if(!/^\d{6}$/.test(code))throw new Error(`BLOCKED: ${tier} protected staging QA debug OTP is unavailable.`);
    return code;
  }
  return fetchDeliveredBrevoOtp(identity,{notBefore:requestedAt,waitMs});
}

async function requestOtpFromOpenModal(page,identity){
  await page.locator('#identifier').fill(identity);
  const requestedAt=Date.now();
  const responsePromise=page.waitForResponse(response=>response.url().includes('/v1/auth/otp')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Send OTP'}).click();
  const response=await responsePromise;
  const payload=await response.json().catch(()=>({}));
  return{response,payload,requestedAt};
}

export async function signInFromAccount(page,testInfo,{label='player',invalidFirst=false,tier='free',protectedAccount=false}={}){
  const suffix=String(label).replace(/[^a-z0-9]/gi,'-').toLowerCase();
  await page.context().setExtraHTTPHeaders({'x-device-id':`autoqa-${runId}-${suffix}`.slice(0,120)});
  await page.goto('/#/account');
  const signIn=page.getByRole('button',{name:'Sign in'});
  await expect(signIn).toBeVisible();
  await signIn.click();
  await expect(page.getByRole('dialog',{name:/Sign in to continue/i})).toBeVisible();
  const identity=protectedAccount?protectedQaIdentifier(tier):qaIdentifier(testInfo,label);
  let request=await requestOtpFromOpenModal(page,identity);
  if(request.response.status()!==202)throw new Error(`BLOCKED: ${tier} staging QA OTP request was not accepted (HTTP ${request.response.status()}).`);
  let code;
  try{
    code=await resolveOtp({identity,otpResponse:request.payload,tier,protectedAccount,requestedAt:request.requestedAt,waitMs:180000});
  }catch(error){
    const marker=otpMarker(error);
    if(!protectedAccount||!retriableProtectedOtpMarkers.has(marker))throw error;
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await signIn.click();
    await expect(page.getByRole('dialog',{name:/Sign in to continue/i})).toBeVisible();
    request=await requestOtpFromOpenModal(page,identity);
    if(request.response.status()!==202)throw new Error(`BLOCKED: ${tier} protected staging QA OTP retry was not accepted (HTTP ${request.response.status()}; after ${marker}).`);
    code=await resolveOtp({identity,otpResponse:request.payload,tier,protectedAccount,requestedAt:request.requestedAt,waitMs:120000});
  }
  if(invalidFirst){
    const invalid=code==='000000'?'111111':'000000';
    await page.locator('#otp').fill(invalid);
    await page.getByRole('button',{name:'Verify'}).click();
    await expect(page.locator('#auth-status')).toContainText(/invalid|expired/i);
  }
  await page.locator('#otp').fill(code);
  await page.getByRole('button',{name:'Verify'}).click();
  await expect(page.getByText(/Signed in successfully/i)).toBeVisible();
  await expect(page.getByRole('heading',{name:/Player|Account/i})).toBeVisible();
}

export async function assertNoHorizontalOverflow(page){
  const dimensions=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  expect(dimensions.scrollWidth,`horizontal overflow ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`).toBeLessThanOrEqual(dimensions.clientWidth+1);
}
