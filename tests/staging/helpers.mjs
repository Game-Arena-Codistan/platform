import {expect} from '@playwright/test';

export const runId=String(process.env.QA_RUN_ID||Date.now()).replace(/[^a-zA-Z0-9-]/g,'').slice(-32);
const genericIdentifier=String(process.env.STAGING_QA_PLAYER_IDENTIFIER||'').trim();
const genericOtp=String(process.env.STAGING_QA_OTP_CODE||'').trim();
const freeIdentifier=String(process.env.STAGING_QA_FREE_PLAYER_IDENTIFIER||'').trim();
const freeOtp=String(process.env.STAGING_QA_FREE_PLAYER_OTP_CODE||'').trim();
const premiumIdentifier=String(process.env.STAGING_QA_PREMIUM_PLAYER_IDENTIFIER||'').trim();
const premiumOtp=String(process.env.STAGING_QA_PREMIUM_PLAYER_OTP_CODE||'').trim();

function configuredIdentity(tier='free'){
  if(tier==='premium')return{identifier:premiumIdentifier,otp:premiumOtp};
  return{identifier:freeIdentifier||genericIdentifier,otp:freeOtp||genericOtp};
}

export function qaIdentifier(testInfo,label='player',{tier='free'}={}){
  const configured=configuredIdentity(tier).identifier;
  if(configured)return configured;
  const project=String(testInfo.project.name||'browser').replace(/[^a-z0-9]/gi,'-').toLowerCase();
  const suffix=String(label).replace(/[^a-z0-9]/gi,'-').toLowerCase();
  return `autoqa+${runId}-${project}-${suffix}@example.invalid`;
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

export async function signInFromAccount(page,testInfo,{label='player',invalidFirst=false,tier='free'}={}){
  await page.goto('/#/account');
  const signIn=page.getByRole('button',{name:'Sign in'});
  await expect(signIn).toBeVisible();
  await signIn.click();
  await expect(page.getByRole('dialog',{name:/Sign in to continue/i})).toBeVisible();
  await page.locator('#identifier').fill(qaIdentifier(testInfo,label,{tier}));
  const otpResponse=page.waitForResponse(response=>response.url().includes('/v1/auth/otp')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Send OTP'}).click();
  const otp=await (await otpResponse).json();
  const code=String(otp.debugCode||configuredIdentity(tier).otp||'');
  if(!otp.challengeId||!/^\d{6}$/.test(code))throw new Error(`BLOCKED: ${tier} staging QA OTP automation requires debugCode or a protected QA OTP code.`);
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
