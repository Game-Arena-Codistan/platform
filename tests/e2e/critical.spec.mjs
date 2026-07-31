import {test,expect} from '@playwright/test';

test('public player shell exposes all launch-critical routes',async({page})=>{
  await page.goto('/#/home');
  await expect(page).toHaveTitle(/Game Arena/);
  await expect(page.getByRole('heading',{name:/Play instantly/i})).toBeVisible();
  for(const [label,hash,heading] of [
    ['Games','#/library',/Games|catalogue|Discover your next game/i],
    ['Compete','#/compete',/Compete|leaderboard|tournament/i],
    ['Rewards','#/rewards',/Rewards|Arena Coins/i],
    ['Account','#/account',/Guest player|Player/i]
  ]){
    await page.getByRole('link',{name:label,exact:true}).click();
    await expect(page).toHaveURL(new RegExp(hash.replace('/','\\/')));
    await expect(page.getByRole('heading',{name:heading}).first()).toBeVisible();
  }
});

test('premium purchase is disclosed as fixed-duration',async({page})=>{
  await page.goto('/#/premium');
  await expect(page.getByText(/fixed-duration|single charge/i).first()).toBeVisible();
  await expect(page.locator('.plan .price').filter({hasText:/299/}).first()).toBeVisible();
  await expect(page.locator('.plan .price').filter({hasText:/4,?999/}).first()).toBeVisible();
});

test('built-in Arena Dash can open without an external host',async({page})=>{
  await page.goto('/#/library');
  const play=page.locator('[data-play="arena-dash"]').first();
  await expect(play).toBeVisible();
  await play.click();
  await expect(page.locator('iframe[title*="Arena Dash"]')).toBeVisible();
});
