import {test,expect} from '@playwright/test';
import {signInFromAccount,runId} from './helpers.mjs';

test('@player rewards page explains wallet semantics and gates account actions for guests',async({page})=>{
  await page.goto('/#/rewards');
  await expect(page.getByRole('heading',{name:/^\d[\d,]* coins$/i})).toBeVisible();
  await expect(page.getByText(/non-transferable, non-withdrawable and have no cash value/i)).toBeVisible();
  const challenge=page.locator('[data-challenge]').first();
  await expect(challenge).toBeVisible();
  if(await challenge.getAttribute('data-complete')!=='true'){
    await challenge.click();
    await expect(page.getByText(/Keep playing to complete this challenge/i)).toBeVisible();
  }
  await page.locator('[data-topup]').first().click();
  await expect(page.getByRole('dialog',{name:/Sign in to continue/i})).toBeVisible();
  await page.getByRole('button',{name:'Close'}).click();
  await page.locator('#voucher-form input[name="code"]').fill('AUTO-QA-NOOP');
  await page.getByRole('button',{name:'Redeem'}).click();
  await expect(page.getByRole('dialog',{name:/Sign in to continue/i})).toBeVisible();
});

test('@player authenticated rewards loads authoritative wallet and creates a top-up only when offers are enabled',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'rewards-topup'});
  const offersResponse=await page.context().request.get('/api/v1/offers/topups');
  expect(offersResponse.status()).toBe(200);
  const offerPayload=await offersResponse.json();
  test.skip(!offerPayload.enabled||!offerPayload.offers?.length,'No live top-up offers are configured in this staging deployment.');

  await page.goto('/#/rewards');
  const walletResponse=page.waitForResponse(response=>response.url().includes('/v1/wallet')&&response.request().method()==='GET');
  await page.getByRole('button',{name:'Refresh wallet'}).click();
  expect((await walletResponse).status()).toBe(200);

  const offer=offerPayload.offers[0];
  const button=page.locator(`[data-topup="${offer.id}"]`);
  await expect(button).toBeVisible();
  const checkoutResponse=page.waitForResponse(response=>response.url().includes('/v1/offers/topups/checkout')&&response.request().method()==='POST');
  await button.click();
  const response=await checkoutResponse;
  expect(response.status()).toBe(201);
  const checkout=await response.json();
  expect(checkout.transactionId).toBeTruthy();
  const pending=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('game-arena:pending-payment')||'null'));
  expect(pending?.kind).toBe('topup');
  expect(pending?.transactionId).toBe(checkout.transactionId);
});

test('@player deterministic staging voucher redeems once through the browser when configured',async({page},testInfo)=>{
  const voucher=String(process.env.STAGING_QA_VOUCHER_CODE||'').trim();
  test.skip(!voucher,'No protected staging QA voucher is configured.');
  await signInFromAccount(page,testInfo,{label:'voucher'});
  await page.goto('/#/rewards');
  await page.locator('#voucher-form input[name="code"]').fill(voucher);
  const redemption=page.waitForResponse(response=>response.url().includes('/v1/vouchers/redeem')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Redeem'}).click();
  const response=await redemption;
  expect([200,201]).toContain(response.status());
  await expect(page.locator('#voucher-status')).toContainText(/Voucher redeemed: \+\d+ coins/i);
  const second=await page.context().request.post('/api/v1/vouchers/redeem',{headers:{origin:new URL(page.url()).origin,'x-csrf-token':decodeURIComponent((await page.context().cookies()).find(cookie=>cookie.name==='ga_csrf')?.value||'')},data:{code:voucher}});
  expect(second.status()).toBe(200);
  expect((await second.json()).duplicate).toBe(true);
});
