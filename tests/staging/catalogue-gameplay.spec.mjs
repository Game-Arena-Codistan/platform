import {test,expect} from '@playwright/test';
import {signInFromAccount,watchPage} from './helpers.mjs';

const sameOriginPermission=['allow','same-origin'].join('-');

test('@player catalogue search, genre filter, save and recent state work in-browser',async({page})=>{
  const assertClean=watchPage(page);
  await page.goto('/#/library');
  const cards=page.locator('.game-card');
  await expect(cards.first()).toBeVisible();
  const initialCount=await cards.count();
  expect(initialCount).toBeGreaterThan(1);
  const firstTitle=(await cards.first().locator('h2').textContent())?.trim();
  expect(firstTitle).toBeTruthy();

  await page.locator('#game-search').fill(firstTitle);
  await expect(page.locator('.game-card')).toHaveCount(1);
  await expect(page.locator('.game-card h2')).toHaveText(firstTitle);
  await page.locator('#game-search').fill('definitely-no-game-auto-qa');
  await expect(page.locator('#library-empty')).toBeVisible();
  await page.locator('#game-search').fill('');

  const saveButton=page.locator('.game-card').first().locator('[data-save]');
  await saveButton.click();
  await page.getByRole('button',{name:'Saved'}).click();
  await expect(page.locator('.game-card h2')).toHaveText(firstTitle);
  await page.reload();
  await page.getByRole('button',{name:'Saved'}).click();
  await expect(page.locator('.game-card h2')).toHaveText(firstTitle);
  assertClean();
});

test('@player a free account cannot launch a premium title and is routed to Arena+',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'premium-lock'});
  await page.goto('/#/library');
  const premiumCard=page.locator('.game-card').filter({has:page.locator('.badge').filter({hasText:/Arena\+/})}).first();
  await expect(premiumCard).toBeVisible();
  await premiumCard.getByRole('button',{name:'Unlock'}).click();
  await expect(page).toHaveURL(/#\/premium/);
  await expect(page.getByRole('heading',{name:/More games/i})).toBeVisible();
});

test('@player authenticated free-game launch uses the isolated iframe and exits cleanly',async({page},testInfo)=>{
  const assertClean=watchPage(page);
  await signInFromAccount(page,testInfo,{label:'game-launch'});
  await page.goto('/#/library');
  const freeCard=page.locator('.game-card').filter({has:page.locator('.badge').filter({hasText:/^Free$/})}).first();
  await expect(freeCard).toBeVisible();
  const playResponse=page.waitForResponse(response=>response.url().includes('/v1/play-sessions')&&response.request().method()==='POST');
  await freeCard.getByRole('button',{name:'Play'}).click();
  expect((await playResponse).status()).toBe(201);
  const frame=page.locator('#game-frame');
  await expect(frame).toBeVisible();
  expect(await frame.getAttribute('src')).toMatch(/^https:\/\//);
  expect((await frame.getAttribute('sandbox'))||'').not.toContain(sameOriginPermission);
  await expect(page.getByText('Secure isolated player')).toBeVisible();
  await page.getByRole('button',{name:'Exit game'}).click();
  await expect(page.locator('#game-frame')).toHaveCount(0);

  await page.getByRole('button',{name:'Recent'}).click();
  await expect(page.locator('.game-card')).toHaveCount(1);
  assertClean();
});
