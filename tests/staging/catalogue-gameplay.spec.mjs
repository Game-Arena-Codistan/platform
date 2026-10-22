import {test,expect,request} from '@playwright/test';
import {signInFromAccount,watchPage} from './helpers.mjs';

const sameOriginPermission=['allow','same-origin'].join('-');
function adminAssertions(){try{return JSON.parse(process.env.STAGING_QA_ADMIN_ASSERTIONS_JSON||'{}');}catch{return{};}}
async function ensurePremiumEntitlement(page){
  const sessionResponse=await page.context().request.get('/api/v1/session');expect(sessionResponse.status()).toBe(200);const session=await sessionResponse.json();expect(session.authenticated).toBe(true);if((session.entitlement?.tier||session.entitlement)==='premium'&&(!session.entitlement?.status||session.entitlement.status==='active'))return;
  const adminUrl=String(process.env.STAGING_ADMIN_URL||'').trim();const assertions=adminAssertions();if(!adminUrl||!assertions.admin)throw new Error('BLOCKED: signed staging Admin access is required to provision the premium QA fixture.');const context=await request.newContext({baseURL:adminUrl,extraHTTPHeaders:assertions.admin});try{const grant=await context.post(`/api/v1/admin/subscriptions/${encodeURIComponent(session.user.id)}/adjust`,{data:{action:'grant',durationDays:30,planId:'manual',reason:'AUTO-QA protected premium catalogue fixture'}});expect(grant.status(),'audited premium fixture grant should succeed').toBe(200);}finally{await context.dispose();}await page.reload();
}

test('@player guest Games surface shows plans only until an active paid plan unlocks the catalogue',async({page})=>{
  const assertClean=watchPage(page);
  await page.goto('/#/library');
  await expect(page.getByRole('heading',{name:/Choose a plan to play|Activate Game Arena\+/i})).toBeVisible();
  await expect(page.locator('.game-card')).toHaveCount(0);
  await expect(page.getByRole('link',{name:/Subscribe with JazzCash|Open checkout/i}).first()).toBeVisible();
  assertClean();
});

test('@player catalogue search, genre filter, save and recent state work in-browser',async({page},testInfo)=>{
  test.skip(!String(process.env.STAGING_ADMIN_URL||'').trim()||!adminAssertions().admin,'BLOCKED: signed staging Admin access is required to unlock the catalogue fixture.');
  const assertClean=watchPage(page);
  await signInFromAccount(page,testInfo,{label:'catalogue-search'});
  await ensurePremiumEntitlement(page);
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

test('@player a free account cannot browse the catalogue and is routed to JazzCash plans',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'premium-lock'});
  await page.goto('/#/library');
  await expect(page.getByRole('heading',{name:/Activate Game Arena\+/i})).toBeVisible();
  await expect(page.locator('.game-card')).toHaveCount(0);
  await page.getByRole('link',{name:/Open checkout|Subscribe with JazzCash/i}).first().click();
  await expect(page).toHaveURL(/\/mainLanding/);
  await expect(page.getByRole('heading',{name:/Unlock the full game catalogue/i})).toBeVisible();
});

test('@player authenticated free-game launch uses the isolated iframe and exits cleanly',async({page},testInfo)=>{
  test.skip(!String(process.env.STAGING_ADMIN_URL||'').trim()||!adminAssertions().admin,'BLOCKED: signed staging Admin access is required to unlock the catalogue fixture.');
  const assertClean=watchPage(page);
  await signInFromAccount(page,testInfo,{label:'game-launch'});
  await ensurePremiumEntitlement(page);
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
