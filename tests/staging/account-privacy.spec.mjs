import {test,expect} from '@playwright/test';
import {signInFromAccount} from './helpers.mjs';

test('@player account preferences persist locally and legal documents stay reachable',async({page})=>{
  await page.goto('/#/account');
  const reduced=page.locator('[data-setting="reducedMotion"]');
  await expect(reduced).not.toBeChecked();
  await reduced.check();
  await expect(reduced).toBeChecked();
  await page.reload();
  await expect(page.locator('[data-setting="reducedMotion"]')).toBeChecked();
  const reducedClass=await page.evaluate(()=>document.documentElement.classList.contains('reduce-motion'));
  expect(reducedClass).toBe(true);

  for(const path of ['/legal/privacy.html','/legal/terms.html','/legal/rewards.html']){
    const response=await page.context().request.get(path);
    expect(response.status(),`${path} should be reachable`).toBe(200);
  }
});

test('@player signed-in account exposes active sessions, export, and other-device revocation',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'account-controls'});
  await expect(page.locator('#session-summary')).toContainText(/active session/i);

  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export data'}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('game-arena-account.json');

  await page.getByRole('button',{name:'Sign out other devices'}).click();
  await expect(page.getByText(/other session.*signed out/i)).toBeVisible();
  await expect(page.getByRole('heading',{name:/Player/i})).toBeVisible();
});

test('@player account deletion is executable only with the explicit synthetic-account safety flag',async({page},testInfo)=>{
  test.skip(process.env.STAGING_QA_ALLOW_ACCOUNT_DELETION!=='true','Destructive synthetic-account deletion is disabled by default.');
  await signInFromAccount(page,testInfo,{label:'account-deletion'});
  page.once('dialog',dialog=>dialog.accept());
  const deletion=page.waitForResponse(response=>response.url().endsWith('/v1/account')&&response.request().method()==='DELETE');
  await page.getByRole('button',{name:'Delete account'}).click();
  expect((await deletion).status()).toBe(202);
  await expect(page.getByRole('heading',{name:'Guest player'})).toBeVisible();
});
