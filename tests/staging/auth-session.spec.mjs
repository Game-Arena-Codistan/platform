import {test,expect} from '@playwright/test';
import {qaIdentifier,signInFromAccount,watchPage} from './helpers.mjs';

test('@player guest browsing stays anonymous until an action needs identity',async({page})=>{
  const assertClean=watchPage(page);
  await page.goto('/#/account');
  await expect(page.getByRole('heading',{name:'Guest player'})).toBeVisible();
  await page.goto('/#/library');
  await expect(page.locator('.game-card').first()).toBeVisible();
  await page.goto('/#/premium');
  await page.locator('[data-plan]').first().click();
  await expect(page.getByRole('dialog',{name:/Sign in to continue/i})).toBeVisible();
  assertClean();
});

test('@player OTP rejects a wrong code, accepts the correct code, persists session, and signs out',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'auth-session',invalidFirst:true});
  await expect(page.getByText(/Free member|Game Arena\+ member/i)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:/Player/i})).toBeVisible();
  await expect(page.locator('#session-summary')).toContainText(/active session/i);
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page.getByRole('heading',{name:'Guest player'})).toBeVisible();
  const session=await page.context().request.get('/api/v1/session');
  expect(session.status()).toBe(200);
  expect((await session.json()).authenticated).toBe(false);
});

test('@player OTP resend guard is enumeration-safe for the same pending challenge',async({page},testInfo)=>{
  await page.goto('/#/account');
  await page.getByRole('button',{name:'Sign in'}).click();
  await page.locator('#identifier').fill(qaIdentifier(testInfo,'otp-resend'));
  const first=page.waitForResponse(response=>response.url().includes('/v1/auth/otp')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Send OTP'}).click();
  expect((await first).status()).toBe(202);
  await page.reload();
  await page.getByRole('button',{name:'Sign in'}).click();
  await page.locator('#identifier').fill(qaIdentifier(testInfo,'otp-resend'));
  const second=page.waitForResponse(response=>response.url().includes('/v1/auth/otp')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Send OTP'}).click();
  const response=await second;
  expect(response.status()).toBe(429);
  await expect(page.locator('#auth-status')).toContainText(/wait|try again/i);
});

test('@player protected free QA account authenticates with delivered OTP and remains on the free entitlement',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'free-entitlement',tier:'free',protectedAccount:true});
  await expect(page.getByText(/Free member/i)).toBeVisible();
  const session=await page.context().request.get('/api/v1/session');
  expect(session.status()).toBe(200);
  const payload=await session.json();
  expect(payload.authenticated).toBe(true);
  expect(payload.entitlement?.tier||payload.entitlement).toBe('free');
});
