import {test,expect} from '@playwright/test';
import {runId,signInFromAccount,watchPage} from './helpers.mjs';

test('@player support form rejects invalid content without losing the entered reference',async({page})=>{
  await page.goto('/#/support');
  const reference=`AUTO-QA-${runId}-invalid`;
  await page.locator('#support-message').fill('too short');
  await page.locator('#support-reference').fill(reference);
  const responsePromise=page.waitForResponse(response=>response.url().includes('/v1/support/tickets')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Submit request'}).click();
  const response=await responsePromise;
  expect(response.status()).toBe(400);
  await expect(page.locator('#support-status')).toContainText(/between 10 and 1500 characters/i);
  await expect(page.locator('#support-reference')).toHaveValue(reference);
});

test('@player support form submits a correlated QA request and clears the form',async({page},testInfo)=>{
  const assertClean=watchPage(page);
  await signInFromAccount(page,testInfo,{label:'support-browser'});
  await page.goto('/#/support');
  const reference=`AUTO-QA-${runId}-browser`;
  await page.locator('#support-topic').selectOption({index:0});
  await page.locator('#support-message').fill(`Automated staging certification ${runId}. Browser support regression journey.`);
  await page.locator('#support-reference').fill(reference);
  const responsePromise=page.waitForResponse(response=>response.url().includes('/v1/support/tickets')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Submit request'}).click();
  const response=await responsePromise;
  expect(response.status()).toBe(201);
  const body=await response.json();
  expect(body.ticket?.id).toMatch(/^GA-/);
  await expect(page.locator('#support-status')).toContainText(body.ticket.id);
  await expect(page.locator('#support-message')).toHaveValue('');
  await expect(page.locator('#support-reference')).toHaveValue('');
  assertClean();
});
