import {expect} from '@playwright/test';

export const runId=String(process.env.QA_RUN_ID||Date.now()).replace(/[^a-zA-Z0-9-]/g,'').slice(-32);
const configuredIdentifier=String(process.env.STAGING_QA_PLAYER_IDENTIFIER||'').trim();
const configuredOtp=String(process.env.STAGING_QA_OTP_CODE||'').trim();

export function qaIdentifier(testInfo,label='player'){
  if(configuredIdentifier)return configuredIdentifier;
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

export async function signInFromAccount(page,testInfo,{label='player',invalidFirst=false}={}){
  await page.goto('/#/account');
  const signIn=page.getByRole('button',{name:'Sign in'});
  await expect(signIn).toBeVisible();
  await signIn.click();
  await expect(page.getByRole('dialog',{name:/Sign in to continue/i})).toBeVisible();
  await page.locator('#identifier').fill(qaIdentifier(testInfo,label));
  const otpResponse=page.waitForResponse(response=>response.url().includes('/v1/auth/otp')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Send OTP'}).click();
  const otp=await (await otpResponse).json();
  const code=String(otp.debugCode||configuredOtp||'');
  if(!otp.challengeId||!/^\d{6}$/.test(code))throw new Error('BLOCKED: staging QA OTP automation requires debugCode or protected STAGING_QA_OTP_CODE.');
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
