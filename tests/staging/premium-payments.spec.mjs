import {test,expect} from '@playwright/test';
import {signInFromAccount,watchPage} from './helpers.mjs';

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

test('@player protected premium QA account sees active entitlement and can start a premium title',async({page},testInfo)=>{
  test.skip(!String(process.env.STAGING_QA_PREMIUM_PLAYER_IDENTIFIER||'').trim(),'No protected premium QA account is configured.');
  await signInFromAccount(page,testInfo,{label:'premium-entitlement',tier:'premium'});
  await expect(page.getByText(/Game Arena\+ member/i)).toBeVisible();
  await page.goto('/#/premium');
  await expect(page.getByText(/Game Arena\+ is active on this account/i)).toBeVisible();
  await page.goto('/#/library');
  const premiumCard=page.locator('.game-card').filter({has:page.locator('.badge').filter({hasText:/Arena\+/})}).first();
  await expect(premiumCard).toBeVisible();
  const play=page.waitForResponse(response=>response.url().includes('/v1/play-sessions')&&response.request().method()==='POST');
  await premiumCard.getByRole('button',{name:'Play'}).click();
  expect((await play).status()).toBe(201);
  await expect(page.locator('#game-frame')).toBeVisible();
});
