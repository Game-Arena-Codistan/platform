import {test,expect} from '@playwright/test';
import {runId,signInFromAccount,watchPage} from './helpers.mjs';

const expectedSha=process.env.EXPECTED_RELEASE_SHA;
const sameOriginPermission=['allow','same-origin'].join('-');

test('@player @critical-mobile deployed shell exposes the exact release and critical routes',async({page})=>{
  const assertClean=watchPage(page);
  await page.goto('/#/home');
  await expect(page).toHaveTitle(/Game Arena/);
  await expect(page.getByRole('heading',{name:/Play instantly/i})).toBeVisible();
  if(expectedSha){
    const release=await page.evaluate(()=>window.GAME_ARENA_CONFIG?.releaseSha);
    expect(release).toBe(expectedSha);
  }
  for(const [label,hash] of [['Games','#/library'],['Compete','#/compete'],['Rewards','#/rewards'],['Account','#/account']]){
    await page.getByRole('link',{name:label,exact:true}).click();
    await expect(page).toHaveURL(new RegExp(hash.replace('/','\\/')));
  }
  assertClean();
});

test('@player @critical-mobile protected OTP sign-in launches a deployed game and reaches fixed-duration checkout',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'critical',invalidFirst:true});

  await page.goto('/#/library');
  const freeCard=page.locator('.game-card').filter({has:page.locator('.badge').filter({hasText:/^Free$/})}).first();
  await expect(freeCard).toBeVisible();
  const playResponse=page.waitForResponse(response=>response.url().includes('/v1/play-sessions')&&response.request().method()==='POST');
  await freeCard.getByRole('button',{name:'Play'}).click();
  expect((await playResponse).status()).toBe(201);
  const frame=page.locator('#game-frame');
  await expect(frame).toBeVisible();
  const frameSrc=await frame.getAttribute('src');
  expect(frameSrc).toMatch(/^https:\/\//);
  const sandbox=await frame.getAttribute('sandbox');
  expect(sandbox||'').not.toContain(sameOriginPermission);
  await page.getByRole('button',{name:'Exit game'}).click();

  await page.goto('/#/premium');
  await expect(page.getByText(/Fixed-duration purchase/i)).toBeVisible();
  await page.locator('[data-plan]').first().click();
  await expect(page.getByRole('dialog',{name:/Activate Game Arena\+/i})).toBeVisible();
  const checkoutResponse=page.waitForResponse(response=>response.url().includes('/v1/payments/jazzcash/checkout')&&response.request().method()==='POST');
  await page.getByRole('button',{name:/Continue to JazzCash/i}).click();
  const checkout=await checkoutResponse;
  expect(checkout.status()).toBe(201);
  const payload=await checkout.json();
  expect(payload.transactionId).toBeTruthy();
  expect(payload.status).toBe('pending');
  await expect(page.locator('#payment-status')).toContainText(/Payment received|Redirecting|Creating checkout|pending/i);
});

test('@player support request is accepted with the certification correlation ID',async({page})=>{
  await page.goto('/#/support');
  await expect(page.getByRole('heading',{name:/How can we help/i})).toBeVisible();
  await page.locator('#support-message').fill(`Automated staging certification ${runId}. Browser support journey verification.`);
  await page.locator('#support-reference').fill(`AUTO-QA-${runId}`);
  await page.getByRole('button',{name:'Submit request'}).click();
  await expect(page.locator('#support-status')).toContainText(/Request .+ received/i);
});
