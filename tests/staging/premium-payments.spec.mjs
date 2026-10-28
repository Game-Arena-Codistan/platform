import {test,expect,request} from '@playwright/test';
import {signInFromAccount,watchPage} from './helpers.mjs';

function adminAssertions(){try{return JSON.parse(process.env.STAGING_QA_ADMIN_ASSERTIONS_JSON||'{}');}catch{return{};}}
async function paymentMode(page){const response=await page.context().request.get('/api/v1/billing/plans');if(response.status()!==200)return'legacy';const payload=await response.json().catch(()=>null);const plans=Array.isArray(payload)?payload:payload?.plans;return payload?.enabled!==false&&Array.isArray(plans)&&plans.length?'external':'legacy';}
async function ensurePremiumEntitlement(page){
  const sessionResponse=await page.context().request.get('/api/v1/session');expect(sessionResponse.status()).toBe(200);const session=await sessionResponse.json();expect(session.authenticated).toBe(true);if((session.entitlement?.tier||session.entitlement)==='premium'&&(!session.entitlement?.status||session.entitlement.status==='active')){await page.reload();return;}
  const adminUrl=String(process.env.STAGING_ADMIN_URL||'').trim();const assertions=adminAssertions();if(!adminUrl||!assertions.admin)throw new Error('BLOCKED: signed staging Admin access is required to provision the premium QA fixture.');const context=await request.newContext({baseURL:adminUrl,extraHTTPHeaders:assertions.admin});try{const grant=await context.post(`/api/v1/admin/subscriptions/${encodeURIComponent(session.user.id)}/adjust`,{data:{action:'grant',durationDays:30,planId:'manual',reason:'AUTO-QA protected premium staging fixture'}});expect(grant.status(),'audited premium fixture grant should succeed').toBe(200);const payload=await grant.json();expect(payload.entitlement?.tier).toBe('premium');expect(payload.entitlement?.status).toBe('active');}finally{await context.dispose();}
  await expect.poll(async()=>{const probe=await page.context().request.get('/api/v1/session');const body=await probe.json();return body.entitlement?.tier||body.entitlement;},{timeout:20000}).toBe('premium');
  await page.reload();
}

test('@player premium page states configured billing and preserves fixed-duration billing semantics fallback',async({page})=>{
  const assertClean=watchPage(page);const mode=await paymentMode(page);await page.goto('/#/premium');await expect(page.getByRole('heading',{name:/More games/i})).toBeVisible();const plans=page.locator('[data-plan]');await expect(plans.first()).toBeVisible();
  if(mode==='external'){
    await expect(page.getByRole('button',{name:/Coming soon/i}).first()).toBeVisible();
    await expect(page.getByRole('link',{name:/Go to JazzCash landing/i})).toBeVisible();
    await expect(page.getByText(/Pay first, sign in later|JazzCash wallet|Server-authoritative billing/i).first()).toBeVisible();
    const html=await page.content();expect(html).not.toMatch(/PAYMENT_SERVICE_API_KEY|PAYMENT_SERVICE_WEBHOOK_SECRET|x-api-key/i);
  }else{
    expect(await plans.count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByText('Fixed-duration purchase',{exact:true})).toBeVisible();await expect(page.getByText(/Does it auto-renew/i)).toBeVisible();await expect(page.getByText(/^No\. Monthly and yearly access are fixed-duration purchases/i)).toBeVisible();await expect(page.getByText(/JazzCash checkout/i)).toBeVisible();await expect(page.getByText(/Server-confirmed activation/i)).toBeVisible();
  }
  assertClean();
});

test('@player authenticated Premium action uses configured server boundary and preserves legacy pending server transaction contract',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'membership-checkout'});const mode=await paymentMode(page);await page.goto('/#/premium');const plan=page.locator('[data-plan]').first();await plan.click();
  if(mode==='external'){
    await expect(page).toHaveURL(/\/mainLanding/);
    await expect(page.getByRole('heading',{name:/Enter Your JazzCash Number/i})).toBeVisible();
    await expect(page.getByLabel(/JazzCash mobile number/i)).toBeVisible();
    await expect(page.getByText(/I agree to Game Arena/i)).toBeVisible();
    await expect(page.getByRole('button',{name:/Subscribe Now/i})).toBeVisible();
    return;
  }
  await expect(page.getByRole('dialog',{name:/Activate Game Arena\+/i})).toBeVisible();await expect(page.getByText(/never collects your JazzCash PIN or card details/i)).toBeVisible();const responsePromise=page.waitForResponse(response=>response.url().includes('/v1/payments/jazzcash/checkout')&&response.request().method()==='POST');await page.getByRole('button',{name:/Continue to JazzCash/i}).click();const response=await responsePromise;expect(response.status()).toBe(201);const body=await response.json();expect(body.transactionId).toMatch(/^[a-f0-9-]+$/);expect(body.status).toBe('pending');const pending=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('game-arena:pending-payment')||'null'));expect(pending?.transactionId).toBe(body.transactionId);await expect(page.locator('#payment-status')).toContainText(/received|redirecting|pending|creating/i);
});

test('@player browser return/query state cannot self-activate Arena+ without server confirmation',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'return-safety'});const mode=await paymentMode(page);
  if(mode==='external'){await page.goto('/#/premium?wallet=linked&subscription_status=active&status=paid');await expect(page.getByText(/Game Arena\+ is active on this account/i)).toHaveCount(0,{timeout:3000});const session=await page.context().request.get('/api/v1/session');expect(session.status()).toBe(200);const body=await session.json();expect(body.entitlement?.tier||body.entitlement).not.toBe('premium');return;}
  await page.goto('/#/premium');await page.locator('[data-plan]').first().click();const checkoutResponse=page.waitForResponse(response=>response.url().includes('/v1/payments/jazzcash/checkout')&&response.request().method()==='POST');await page.getByRole('button',{name:/Continue to JazzCash/i}).click();const checkout=await (await checkoutResponse).json();expect(checkout.transactionId).toBeTruthy();await page.goto(`/#/payment-return?transactionId=${encodeURIComponent(checkout.transactionId)}&status=paid`);await expect(page.getByText(/Game Arena\+ is active on this account/i)).toHaveCount(0,{timeout:3000});const status=await page.context().request.get(`/api/v1/payments/${encodeURIComponent(checkout.transactionId)}`);expect(status.status()).toBe(200);expect((await status.json()).status).toBe('pending');
});

test('@player protected premium QA account authenticates with delivered OTP, receives audited staging entitlement, authorizes premium play and enforces approved runtime hosting',async({page},testInfo)=>{
  test.setTimeout(360000);const assertions=adminAssertions();test.skip(!String(process.env.STAGING_ADMIN_URL||'').trim()||!assertions.admin,'BLOCKED: signed staging Admin access is required to provision the premium QA fixture.');await signInFromAccount(page,testInfo,{label:'premium-entitlement',tier:'premium',protectedAccount:true});await ensurePremiumEntitlement(page);await expect(page.getByText(/Subscribed|Game Arena\+ member/i)).toBeVisible();await page.goto('/#/premium');await expect(page.getByText(/Game Arena\+ is active on this account/i)).toBeVisible();await page.goto('/#/library');const premiumCard=page.locator('.game-card').filter({has:page.locator('.badge').filter({hasText:/Arena\+/})}).first();await expect(premiumCard).toBeVisible();const play=page.waitForResponse(response=>response.url().includes('/v1/play-sessions')&&response.request().method()==='POST');await premiumCard.getByRole('button',{name:'Play'}).click();expect((await play).status()).toBe(201);await expect(page.locator('.game-stage')).toBeVisible();const frame=page.locator('#game-frame');if(await frame.count())await expect(frame).toBeVisible();else{await expect(page.getByText('Game runtime unavailable',{exact:true})).toBeVisible();await expect(page.getByText(/approved hosted build/i)).toBeVisible();}
});
