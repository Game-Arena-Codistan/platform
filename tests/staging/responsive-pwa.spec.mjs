import {test,expect} from '@playwright/test';
import {assertNoHorizontalOverflow} from './helpers.mjs';

test('@critical-mobile key player routes fit the mobile viewport without horizontal overflow',async({page})=>{
  for(const route of ['home','library','compete','rewards','premium','account','support']){
    await page.goto(`/#/${route}`);
    await expect(page.locator('#app')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  }
});

test('@player primary navigation is keyboard-operable',async({page})=>{
  await page.goto('/#/home');
  const games=page.getByRole('link',{name:'Games',exact:true});
  await games.focus();
  await expect(games).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/library/);

  const account=page.locator('#profile-button');
  await account.focus();
  await expect(account).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/account/);
});

test('@player PWA manifest and release-scoped service worker are available',async({page})=>{
  const manifest=await page.context().request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  const manifestBody=await manifest.json();
  expect(manifestBody.name||manifestBody.short_name).toMatch(/Game Arena/i);

  const sw=await page.context().request.get('/sw.js');
  expect(sw.status()).toBe(200);
  await page.goto('/#/home');
  const scriptUrl=await page.evaluate(async()=>{
    if(!('serviceWorker' in navigator))return null;
    const registration=await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(resolve=>setTimeout(()=>resolve(null),10000))
    ]);
    return registration?.active?.scriptURL||null;
  });
  expect(scriptUrl).toContain('/sw.js?release=');
});
