import {test,expect} from '@playwright/test';

test('public player shell exposes the current launch-critical routes',async({page})=>{
  await page.goto('/#/home');
  await expect(page).toHaveTitle(/Game Arena/);
  await expect(page.getByRole('heading',{name:/Play instantly|Your hub for online/i})).toBeVisible();
  // Compete was intentionally removed on main; guest accounts use the sign-up action.
  await expect(page.locator('[data-route="compete"]')).toHaveCount(0);
  for(const [route,heading] of [['library',/Games|catalogue|Discover your next game/i],['rewards',/coins/i]]){
    const link=page.locator('a[data-route="'+route+'"]:visible').first();
    if(!await link.count()){const toggle=page.locator('#mobile-menu-toggle');await expect(toggle).toBeVisible();await toggle.click();}
    await page.locator('a[data-route="'+route+'"]:visible').first().click();
    await expect(page).toHaveURL(new RegExp('#/'+route));
    await expect(page.getByRole('heading',{name:heading}).first()).toBeVisible();
  }
  await page.goto('/#/account');await expect(page.getByRole('heading',{name:/Guest player/i})).toBeVisible();
});

test('premium discloses current catalog and wallet-based automatic billing',async({page})=>{
  await page.goto('/#/premium');
  const monthly=page.locator('.plan').filter({has:page.getByRole('heading',{name:'Monthly',exact:true})});
  const yearly=page.locator('.plan').filter({has:page.getByRole('heading',{name:'Yearly',exact:true})});
  await expect(monthly.locator('.price')).toContainText(/990/);
  await expect(monthly).toContainText(/automatic JazzCash billing/i);
  await expect(yearly.locator('.price')).toContainText(/4,?999/);
  await expect(yearly.getByRole('button',{name:/Coming soon/i})).toBeDisabled();
  await expect(page.getByText(/never asks for or stores your MPIN/i)).toBeVisible();
});

test('forged success URL does not unlock premium',async({page})=>{
  await page.goto('/?payment=succeeded&orderId=forged');
  await expect(page.locator('#payment-success-banner')).toContainText(/checking payment confirmation|sign in to view/i);
  await expect(page.locator('#premium-button')).toBeVisible();
  const entitlement=await page.evaluate(()=>JSON.parse(localStorage.getItem('game-arena:v2')||'{}').data?.entitlement);
  expect(entitlement).not.toBe('premium');
});

test('built-in Arena Dash can open without an external host',async({page})=>{
  await page.goto('/#/library');
  const play=page.locator('[data-play="arena-dash"]').first();
  await expect(play).toBeVisible();await play.click();
  await expect(page.locator('iframe[title*="Arena Dash"]')).toBeVisible();
});
