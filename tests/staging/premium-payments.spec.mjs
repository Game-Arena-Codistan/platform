import {test,expect,request} from '@playwright/test';
import {signInFromAccount,watchPage} from './helpers.mjs';

function adminAssertions(){
  try{return JSON.parse(process.env.STAGING_QA_ADMIN_ASSERTIONS_JSON||'{}');}catch{return{};}
}

async function ensurePremiumEntitlement(page){
  const sessionResponse=await page.context().request.get('/api/v1/session');
  expect(sessionResponse.status()).toBe(200);
  const session=await sessionResponse.json();
  expect(session.authenticated).toBe(true);
  if((session.entitlement?.tier||session.entitlement)==='premium'&&(!session.entitlement?.status||session.entitlement.status==='active'))return;
  const adminUrl=String(process.env.STAGING_ADMIN_URL||'').trim();
  const assertions=adminAssertions();
  if(!adminUrl||!assertions.admin)throw new Error('BLOCKED: signed staging Admin access is required to provision the premium QA fixture.');
  const context=await request.newContext({baseURL:adminUrl,extraHTTPHeaders:assertions.admin});
  try{
    const grant=await context.post(`/api/v1/admin/subscriptions/${encodeURIComponent(session.user.id)}/adjust`,{data:{action:'grant',durationDays:30,planId:'manual',reason:'AUTO-QA protected premium staging fixture'}});
    expect(grant.status(),'audited premium fixture grant should succeed').toBe(200);
    const payload=await grant.json();
    expect(payload.entitlement?.tier).toBe('premium');
    expect(payload.entitlement?.status).toBe('active');
  }finally{await context.dispose();}
  await page.reload();
}

test('@player premium page states the approved fixed-duration billing semantics',async({page})=>{
  const assertClean=watchPage(page);
  await page.goto('/#/premium');
  await expect(page.getByRole('heading',{name:/More games/i})).toBeVisible();
  await expect(page.getByText('Fixed-duration purchase',{exact:true})).toBeVisible();
  await expect(page.getByText(/Does it auto-renew/i)).toBeVisible();
  await expect(page.getByText(/^No\. Monthly and yearly access are fixed-duration purchases/i)).toBeVisible();
  const plans=page.locator('[data-plan]');
  expect(await plans.count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(/JazzCash checkout/i)).toBeVisible();
  await expect(page.getByText(/Server-confirmed activation/i)).toBeVisible();
  assertClean();
});

test('@player authenticated membership checkout creates one pending server transaction',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'membership-checkout'});
  await page.goto('/#/premium');
  const plan=page.locator('[data-plan]').first();
  await plan.click();
  await expect(page.getByRole('dialog',{name:/Activate Game Arena\+/i})).toBeVisible();
  await expect(page.getByText(/never collects your JazzCash PIN or card details/i)).toBeVisible();
  const responsePromise=page.waitForResponse(response=>response.url().includes('/v1/payments/jazzcash/checkout')&&response.request().method()==='POST');
  await page.getByRole('button',{name:/Continue to JazzCash/i}).click();
  const response=await responsePromise;
  expect(response.status()).toBe(201);
  const body=await response.json();
  expect(body.transactionId).toMatch(/^[a-f0-9-]+$/);
  expect(body.status).toBe('pending');
  const pending=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('game-arena:pending-payment')||'null'));
  expect(pending?.transactionId).toBe(body.transactionId);
  await expect(page.locator('#payment-status')).toContainText(/received|redirecting|pending|creating/i);
});

test('@player a browser payment return cannot self-activate Arena+ without server confirmation',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'return-safety'});
  await page.goto('/#/premium');
  await page.locator('[data-plan]').first().click();
  const checkoutResponse=page.waitForResponse(response=>response.url().includes('/v1/payments/jazzcash/checkout')&&response.request().method()==='POST');
  await page.getByRole('button',{name:/Continue to JazzCash/i}).click();
  const checkout=await (await checkoutResponse).json();
  expect(checkout.transactionId).toBeTruthy();
  await page.goto(`/#/payment-return?transactionId=${encodeURIComponent(checkout.transactionId)}&status=paid`);
  await expect(page.getByText(/Game Arena\+ is active on this account/i)).toHaveCount(0,{timeout:3000});
  const status=await page.context().request.get(`/api/v1/payments/${encodeURIComponent(checkout.transactionId)}`);
  expect(status.status()).toBe(200);
  expect((await status.json()).status).toBe('pending');
});

test('@player protected premium QA account authenticates with delivered OTP, receives audited staging entitlement, authorizes premium play and enforces approved runtime hosting',async({page},testInfo)=>{
  test.slow();
  const assertions=adminAssertions();
  test.skip(!String(process.env.STAGING_ADMIN_URL||'').trim()||!assertions.admin,'BLOCKED: signed staging Admin access is required to provision the premium QA fixture.');
  await signInFromAccount(page,testInfo,{label:'premium-entitlement',tier:'premium',protectedAccount:true});
  await ensurePremiumEntitlement(page);
  await expect(page.getByText(/Game Arena\+ member/i)).toBeVisible();
  await page.goto('/#/premium');
  await expect(page.getByText(/Game Arena\+ is active on this account/i)).toBeVisible();
  await page.goto('/#/library');
  const premiumCard=page.locator('.game-card').filter({has:page.locator('.badge').filter({hasText:/Arena\+/})}).first();
  await expect(premiumCard).toBeVisible();
  const play=page.waitForResponse(response=>response.url().includes('/v1/play-sessions')&&response.request().method()==='POST');
  await premiumCard.getByRole('button',{name:'Play'}).click();
  expect((await play).status()).toBe(201);
  await expect(page.locator('.game-stage')).toBeVisible();
  const frame=page.locator('#game-frame');
  if(await frame.count()){
    await expect(frame).toBeVisible();
  }else{
    await expect(page.getByText('Game runtime unavailable',{exact:true})).toBeVisible();
    await expect(page.getByText(/approved hosted build/i)).toBeVisible();
  }
});
