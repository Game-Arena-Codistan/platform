import {test,expect} from '@playwright/test';
import {qaIdentifier,runId,signInFromAccount,watchPage} from './helpers.mjs';

test('@player guest browsing stays anonymous until an action needs identity',async({page})=>{
  const assertClean=watchPage(page);
  await page.goto('/#/account');
  await expect(page.getByRole('heading',{name:'Guest player'})).toBeVisible();
  await page.goto('/#/library');
  await expect(page.getByRole('heading',{name:/Choose a plan to play|Activate Game Arena\+/i})).toBeVisible();
  await expect(page.locator('.game-card')).toHaveCount(0);
  await expect(page.getByRole('link',{name:/Subscribe with JazzCash|Open checkout|Upgrade/i}).first()).toBeVisible();
  await page.goto('/#/premium');
  await page.locator('[data-plan]:not([disabled])').first().click();
  await expect(page).toHaveURL(/\/mainLanding/);
  assertClean();
});

test('@player password auth rejects a wrong password, accepts the correct one, persists session, and signs out',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'auth-session',invalidFirst:true});
  await expect(page.getByText(/Free member|Subscribed.*Game Arena\+|Game Arena\+ member|Current plan/i)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:/Player|QA/i})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Guest player'})).toBeVisible();
  const session=await page.context().request.get('/api/v1/session');
  expect(session.status()).toBe(200);
  expect((await session.json()).authenticated).toBe(false);
});

test('@player password signup and sign-in mode switch works for a fresh MSISDN',async({page},testInfo)=>{
  await page.context().setExtraHTTPHeaders({'x-device-id':`autoqa-${runId}-pwd-switch`.slice(0,120)});
  const msisdn=qaIdentifier(testInfo,'pwd-switch');
  await page.goto('/#/account');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.getByRole('dialog',{name:/Sign in/i})).toBeVisible();
  await page.locator('[data-auth-mode="signup"]').click();
  await expect(page.getByRole('dialog',{name:/Sign up/i})).toBeVisible();
  await page.locator('#auth-msisdn').fill(msisdn);
  await page.locator('#auth-name').fill('QA Switch');
  await page.locator('#auth-password').fill('SwitchPass1');
  await page.locator('#auth-confirm').fill('SwitchPass1');
  const register=page.waitForResponse(response=>response.url().includes('/v1/auth/register')&&response.request().method()==='POST',{timeout:15000});
  await page.getByRole('button',{name:'Create account'}).click();
  expect((await register).status()).toBe(201);
  await expect(page.getByText(/Signed in successfully|Signed in · Game Arena\+/i)).toBeVisible();
});

test('@player protected free QA account authenticates with delivered OTP and remains on the free entitlement',async({page},testInfo)=>{
  test.setTimeout(360000);
  await signInFromAccount(page,testInfo,{label:'free-entitlement',tier:'free',protectedAccount:true});
  await expect(page.getByText(/Free member/i)).toBeVisible();
  const session=await page.context().request.get('/api/v1/session');
  expect(session.status()).toBe(200);
  const payload=await session.json();
  expect(payload.authenticated).toBe(true);
  expect(payload.entitlement?.tier||payload.entitlement).toBe('free');
});
