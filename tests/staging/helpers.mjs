import {createHash} from 'node:crypto';
import {expect} from '@playwright/test';
import {fetchDeliveredBrevoOtp} from './brevo-otp.mjs';

export const runId=String(process.env.QA_RUN_ID||Date.now()).replace(/[^a-zA-Z0-9-]/g,'').slice(-32);
const qaPassword=String(process.env.STAGING_QA_PASSWORD||`GaQa-${runId.slice(-8)}x`).trim();
const genericOtp=String(process.env.STAGING_QA_OTP_CODE||'').trim();
const freeIdentifier=String(process.env.STAGING_QA_FREE_PLAYER_IDENTIFIER||'game.arena+qa-free@codistan.org').trim();
const freeOtp=String(process.env.STAGING_QA_FREE_PLAYER_OTP_CODE||'').trim();
const premiumIdentifier=String(process.env.STAGING_QA_PREMIUM_PLAYER_IDENTIFIER||'game.arena+qa-premium@codistan.org').trim();
const premiumOtp=String(process.env.STAGING_QA_PREMIUM_PLAYER_OTP_CODE||'').trim();

function protectedIdentity(tier='free'){
  return tier==='premium'?{identifier:premiumIdentifier,otp:premiumOtp}:{identifier:freeIdentifier,otp:freeOtp};
}

/** Synthetic player MSISDN unique per run/project/label (03XXXXXXXXX). */
export function qaIdentifier(testInfo,label='player'){
  const project=String(testInfo.project.name||'browser').replace(/[^a-z0-9]/gi,'-').toLowerCase();
  const suffix=String(label).replace(/[^a-z0-9]/gi,'-').toLowerCase();
  const digest=createHash('sha256').update(`${runId}|${project}|${suffix}`).digest('hex');
  let digits='';
  for(const ch of digest){
    const n=parseInt(ch,16);
    digits+=String(n%10);
    if(digits.length>=9)break;
  }
  return `03${digits.slice(0,9)}`;
}

export function protectedQaIdentifier(tier='free'){
  return protectedIdentity(tier).identifier;
}

export function watchPage(page){
  const failures=[];
  page.on('pageerror',error=>failures.push(`pageerror:${error.message}`));
  page.on('console',message=>{if(message.type()==='error')failures.push(`console:${message.text()}`);});
  return()=>{
    const material=failures.filter(item=>!item.includes('favicon')&&!/Failed to load resource: the server responded with a status of 404/i.test(item));
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

function requestOrigin(page){
  try{
    const href=page.url();
    if(href&&href.startsWith('http'))return new URL(href).origin;
  }catch{/* ignore */}
  return String(process.env.STAGING_PLAYER_URL||'https://gsmarena-play.codistan.org').replace(/\/$/,'');
}

/** Protected fixtures still use mailbox OTP via API (UI is password+MSISDN). */
async function signInProtectedViaApi(page,testInfo,{tier='free'}={}){
  const identity=protectedQaIdentifier(tier);
  const origin=requestOrigin(page);
  const requestedAt=Date.now();
  const otpResponse=await page.request.post('/api/v1/auth/otp',{data:{identifier:identity},headers:{'content-type':'application/json',origin}});
  if(otpResponse.status()!==202)throw new Error(`BLOCKED: ${tier} protected staging QA OTP request was not accepted (HTTP ${otpResponse.status()}).`);
  const payload=await otpResponse.json().catch(()=>({}));
  let code;
  try{
    code=await resolveOtp({identity,otpResponse:payload,tier,protectedAccount:true,requestedAt,waitMs:90000});
  }catch(error){
    const marker=otpMarker(error);
    if(!retriableProtectedOtpMarkers.has(marker))throw error;
    testInfo.skip(true,String(error.message||error));
  }
  const verified=await page.request.post('/api/v1/auth/otp/verify',{data:{challengeId:payload.challengeId,code},headers:{'content-type':'application/json',origin}});
  if(!verified.ok())throw new Error(`BLOCKED: ${tier} protected staging QA OTP verify failed (HTTP ${verified.status()}).`);
  const session=await page.request.get('/api/v1/session');
  if(!session.ok())throw new Error(`BLOCKED: ${tier} protected staging QA session probe failed (HTTP ${session.status()}).`);
  const sessionBody=await session.json().catch(()=>({}));
  if(!sessionBody.authenticated)throw new Error(`BLOCKED: ${tier} protected staging QA session was not authenticated after OTP verify.`);
  await page.goto('/#/account');
  await expect(page.getByRole('heading',{level:1})).not.toHaveText('Guest player');
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
}

async function openSignInModal(page){
  await page.goto('/#/account');
  const signIn=page.getByRole('button',{name:'Sign in'});
  await expect(signIn).toBeVisible();
  await signIn.click();
  await expect(page.getByRole('dialog',{name:/Sign in/i})).toBeVisible();
}

async function switchAuthMode(page,mode){
  const target=mode==='signup'?'Sign up':'sign in';
  await page.locator(`[data-auth-mode="${mode}"]`).click();
  await expect(page.getByRole('dialog',{name:mode==='signup'?/Sign up/i:/Sign in/i})).toBeVisible();
  void target;
}

async function registerViaApi(page,msisdn,{name='QA Player',password=qaPassword}={}){
  const origin=requestOrigin(page);
  const response=await page.request.post('/api/v1/auth/register',{
    data:{msisdn,name,password},
    headers:{'content-type':'application/json',origin}
  });
  if(response.status()===201||response.status()===409)return;
  throw new Error(`BLOCKED: staging QA register failed (HTTP ${response.status()}).`);
}

async function fillSignIn(page,msisdn,password){
  await page.locator('#auth-msisdn').fill(msisdn);
  await page.locator('#auth-password').fill(password);
  await page.locator('#auth-form button[type="submit"]').click();
}

async function fillSignUp(page,msisdn,{name='QA Player',password=qaPassword}={}){
  await page.locator('#auth-msisdn').fill(msisdn);
  await page.locator('#auth-name').fill(name);
  await page.locator('#auth-password').fill(password);
  await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-form button[type="submit"]').click();
}

export async function signInFromAccount(page,testInfo,{label='player',invalidFirst=false,tier='free',protectedAccount=false}={}){
  const suffix=String(label).replace(/[^a-z0-9]/gi,'-').toLowerCase();
  await page.context().setExtraHTTPHeaders({'x-device-id':`autoqa-${runId}-${suffix}`.slice(0,120)});

  if(protectedAccount){
    await page.goto('/');
    await signInProtectedViaApi(page,testInfo,{tier});
    return;
  }

  const msisdn=qaIdentifier(testInfo,label);
  const password=qaPassword;

  if(invalidFirst){
    await registerViaApi(page,msisdn,{password});
    await page.context().clearCookies();
    await openSignInModal(page);
    await fillSignIn(page,msisdn,password==='wrong-pass'?'other-pass':'wrong-pass');
    await expect(page.locator('#auth-status')).toContainText(/invalid|password/i);
    await fillSignIn(page,msisdn,password);
  }else{
    await openSignInModal(page);
    await switchAuthMode(page,'signup');
    await fillSignUp(page,msisdn,{password});
    const status=page.locator('#auth-status');
    const exists=await status.textContent().catch(()=>'');
    if(/already exists|sign in instead/i.test(String(exists||''))){
      await switchAuthMode(page,'signin');
      await fillSignIn(page,msisdn,password);
    }
  }

  await expect(page.getByText(/Signed in successfully|Signed in · Game Arena\+/i)).toBeVisible();
  await expect(page.getByRole('heading',{level:1})).not.toHaveText('Guest player');
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
}

export async function assertNoHorizontalOverflow(page){
  const dimensions=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  expect(dimensions.scrollWidth,`horizontal overflow ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`).toBeLessThanOrEqual(dimensions.clientWidth+1);
}
