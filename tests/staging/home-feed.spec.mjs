import {test,expect} from '@playwright/test';
import {watchPage} from './helpers.mjs';

test('@player home presents the approved product proposition and routes into discovery',async({page})=>{
  const assertClean=watchPage(page);
  await page.goto('/#/home');
  await expect(page.getByRole('heading',{name:/Play instantly/i})).toBeVisible();
  await expect(page.getByText(/Pakistan's mobile game arena/i)).toBeVisible();
  await expect(page.getByText(/server confirms payment and entitlement/i)).toBeVisible();
  await page.getByRole('link',{name:'Start playing'}).click();
  await expect(page).toHaveURL(/#\/feed/);
  await expect(page.locator('.feed-slide').first()).toBeVisible();
  assertClean();
});

test('@player discovery feed can save a title and routes locked premium play to Arena+',async({page})=>{
  await page.goto('/#/feed');
  const firstSlide=page.locator('.feed-slide').first();
  await expect(firstSlide).toBeVisible();
  const save=firstSlide.locator('[data-favourite]');
  await save.click();
  await expect(save).toHaveAttribute('aria-pressed','true');
  await expect(save).toContainText('Saved');

  const premiumSlide=page.locator('.feed-slide').filter({has:page.locator('.badge').filter({hasText:/Game Arena\+/})}).first();
  await expect(premiumSlide).toBeVisible();
  await premiumSlide.locator('[data-play]').click();
  await expect(page).toHaveURL(/#\/premium/);
  await expect(page.getByRole('heading',{name:/More games/i})).toBeVisible();
});
