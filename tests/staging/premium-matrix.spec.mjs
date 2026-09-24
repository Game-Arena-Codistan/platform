import {test,expect,request} from '@playwright/test';
import {signInFromAccount} from './helpers.mjs';

function adminAssertions(){try{return JSON.parse(process.env.STAGING_QA_ADMIN_ASSERTIONS_JSON||'{}');}catch{return{};}}
async function session(page){const response=await page.context().request.get('/api/v1/session');expect(response.status()).toBe(200);return response.json();}
async function csrfHeaders(page){const cookies=await page.context().cookies();const csrf=cookies.find(item=>item.name==='ga_csrf')?.value||'';return{origin:new URL(page.url()).origin,'x-csrf-token':decodeURIComponent(csrf)};}
async function post(page,path,data){return page.context().request.post(path,{headers:await csrfHeaders(page),data});}
async function provisionPremium(userId,{days=30}={}){
  const adminUrl=String(process.env.STAGING_ADMIN_URL||'').trim();const assertions=adminAssertions();
  if(!adminUrl||!assertions.admin)throw new Error('BLOCKED: signed staging Admin access is required for Premium matrix fixtures.');
  const context=await request.newContext({baseURL:adminUrl,extraHTTPHeaders:assertions.admin});
  try{
    const response=await context.post(`/api/v1/admin/subscriptions/${encodeURIComponent(userId)}/adjust`,{data:{action:'grant',durationDays:days,planId:'manual',reason:'AUTO-QA Premium acceptance matrix'}});
    expect(response.status()).toBe(200);const payload=await response.json();expect(payload.entitlement?.tier).toBe('premium');expect(payload.entitlement?.status).toBe('active');return payload.entitlement;
  }finally{await context.dispose();}
}
async function completeVerifiedPlay(page,game,{score=25}={}){
  const started=await post(page,'/api/v1/play-sessions',{gameId:game.id});expect(started.status()).toBe(201);const play=await started.json();
  await page.waitForTimeout(1150);
  const completed=await post(page,`/api/v1/play-sessions/${encodeURIComponent(play.playSessionId)}/complete`,{score,durationMs:1100,completedAt:Date.now(),gameVersion:play.gameVersion,nonce:play.nonce});
  expect([200,202]).toContain(completed.status());const payload=await completed.json();expect(payload.status).toBe('verified');return payload;
}
async function createPersona(browser,testInfo,{label,premium=false}={}){
  const context=await browser.newContext();const page=await context.newPage();
  await signInFromAccount(page,testInfo,{label});
  let current=await session(page);expect(current.authenticated).toBe(true);
  if(premium){await provisionPremium(current.user.id);await page.reload();current=await session(page);expect(current.entitlement?.tier||current.entitlement).toBe('premium');}
  else expect(current.entitlement?.tier||current.entitlement).toBe('free');
  return{context,page,session:current};
}

test('@player Premium matrix: Free is denied premium games while Arena+ can launch them',async({browser},testInfo)=>{
  test.setTimeout(120000);
  const free=await createPersona(browser,testInfo,{label:'matrix-free-game'});const premium=await createPersona(browser,testInfo,{label:'matrix-premium-game',premium:true});
  try{
    const catalogResponse=await free.page.context().request.get('/api/v1/catalog/games');expect(catalogResponse.status()).toBe(200);const games=(await catalogResponse.json()).games||[];const game=games.find(item=>item.tier==='premium');expect(game,'staging must expose at least one premium game').toBeTruthy();
    const denied=await post(free.page,'/api/v1/play-sessions',{gameId:game.id});expect(denied.status()).toBe(403);expect((await denied.json()).error?.code).toBe('premium_required');
    const allowed=await post(premium.page,'/api/v1/play-sessions',{gameId:game.id});expect(allowed.status()).toBe(201);const body=await allowed.json();expect(body.playSessionId).toBeTruthy();
    await free.page.goto('/#/library');const freeCard=free.page.locator('.game-card').filter({has:free.page.locator('.badge').filter({hasText:/Arena\+/})}).first();await expect(freeCard).toBeVisible();await freeCard.getByRole('button',{name:/Unlock/i}).click();await expect(free.page).toHaveURL(/#\/premium/);
    await premium.page.goto('/#/library');const premiumCard=premium.page.locator('.game-card').filter({has:premium.page.locator('.badge').filter({hasText:/Arena\+/})}).first();await expect(premiumCard).toBeVisible();await expect(premiumCard.getByRole('button',{name:'Play'})).toBeVisible();
  }finally{await free.context.close();await premium.context.close();}
});

test('@player Premium matrix: Arena+ receives exactly 2x verified game-completion coins',async({browser},testInfo)=>{
  test.setTimeout(120000);
  const free=await createPersona(browser,testInfo,{label:'matrix-free-reward'});const premium=await createPersona(browser,testInfo,{label:'matrix-premium-reward',premium:true});
  try{
    const response=await free.page.context().request.get('/api/v1/catalog/games');expect(response.status()).toBe(200);const games=(await response.json()).games||[];const game=games.find(item=>item.tier!=='premium'&&Number(item.reward)>0);expect(game,'staging must expose a reward-bearing free game').toBeTruthy();
    const freeResult=await completeVerifiedPlay(free.page,game,{score:31});const premiumResult=await completeVerifiedPlay(premium.page,game,{score:37});
    expect(freeResult.reward).toBeGreaterThan(0);expect(premiumResult.reward).toBe(freeResult.reward*2);
  }finally{await free.context.close();await premium.context.close();}
});

test('@player Premium matrix: premium challenge and tournament reject Free and accept Arena+',async({browser},testInfo)=>{
  test.setTimeout(150000);
  const free=await createPersona(browser,testInfo,{label:'matrix-free-compete'});const premium=await createPersona(browser,testInfo,{label:'matrix-premium-compete',premium:true});
  try{
    const readyResponse=await free.page.context().request.get('/api/readyz');expect(readyResponse.status()).toBe(200);const ready=await readyResponse.json();test.skip(ready.competitions!==true,'Competitions are not enabled on this staging environment.');
    const challengesResponse=await free.page.context().request.get('/api/v1/challenges');const tournamentsResponse=await free.page.context().request.get('/api/v1/tournaments');expect(challengesResponse.status()).toBe(200);expect(tournamentsResponse.status()).toBe(200);
    const challenges=(await challengesResponse.json()).challenges||[];const tournaments=(await tournamentsResponse.json()).tournaments||[];const challenge=challenges.find(item=>item.premium===true);const tournament=tournaments.find(item=>item.premium===true);expect(challenge,'premium challenge fixture required').toBeTruthy();expect(tournament,'premium tournament fixture required').toBeTruthy();
    const freeClaim=await post(free.page,`/api/v1/challenges/${encodeURIComponent(challenge.id)}/claim`,{});expect(freeClaim.status()).toBe(403);expect((await freeClaim.json()).error?.code).toBe('premium_required');
    const freeJoin=await post(free.page,`/api/v1/tournaments/${encodeURIComponent(tournament.id)}/join`,{});expect(freeJoin.status()).toBe(403);expect((await freeJoin.json()).error?.code).toBe('premium_required');
    const catalog=await premium.page.context().request.get('/api/v1/catalog/games');const games=(await catalog.json()).games||[];const challengeGame=games.find(game=>(challenge.gameIds||[]).includes(game.id)&&game.tier==='premium');expect(challengeGame,'premium challenge needs an available premium game').toBeTruthy();
    const progress=await completeVerifiedPlay(premium.page,challengeGame,{score:Number(challenge.target?.value||1000)});expect(progress.status).toBe('verified');
    const premiumClaim=await post(premium.page,`/api/v1/challenges/${encodeURIComponent(challenge.id)}/claim`,{});expect(premiumClaim.status()).toBe(200);expect((await premiumClaim.json()).reward).toBeGreaterThan(0);
    const premiumJoin=await post(premium.page,`/api/v1/tournaments/${encodeURIComponent(tournament.id)}/join`,{});expect(premiumJoin.status()).toBe(201);expect((await premiumJoin.json()).entry?.id).toBeTruthy();
  }finally{await free.context.close();await premium.context.close();}
});

test('@player Premium matrix: member top-up pricing is 10% lower whenever supported top-ups are enabled',async({browser},testInfo)=>{
  test.setTimeout(120000);
  const free=await createPersona(browser,testInfo,{label:'matrix-free-topup'});const premium=await createPersona(browser,testInfo,{label:'matrix-premium-topup',premium:true});
  try{
    const freeResponse=await free.page.context().request.get('/api/v1/offers/topups');const premiumResponse=await premium.page.context().request.get('/api/v1/offers/topups');expect(freeResponse.status()).toBe(200);expect(premiumResponse.status()).toBe(200);const freeBody=await freeResponse.json();const premiumBody=await premiumResponse.json();
    test.skip(!freeBody.enabled||!freeBody.offers?.length,'No supported live top-up offers are enabled; Premium 10% top-up discount is not launch-active in this environment.');
    expect(premiumBody.enabled).toBe(true);expect(premiumBody.offers?.length).toBe(freeBody.offers.length);
    for(const freeOffer of freeBody.offers){const premiumOffer=premiumBody.offers.find(item=>item.id===freeOffer.id);expect(premiumOffer).toBeTruthy();expect(Number(freeOffer.memberDiscountPercent||0)).toBe(0);expect(Number(premiumOffer.memberDiscountPercent)).toBe(10);expect(Number(premiumOffer.memberAmountPkr)).toBe(Math.max(1,Math.round(Number(freeOffer.amountPkr)*.9)));}
  }finally{await free.context.close();await premium.context.close();}
});

test('@player @critical-mobile Premium matrix: Free and Arena+ account UI reflect authoritative membership',async({browser},testInfo)=>{
  test.setTimeout(120000);
  const free=await createPersona(browser,testInfo,{label:'matrix-free-ui'});const premium=await createPersona(browser,testInfo,{label:'matrix-premium-ui',premium:true});
  try{
    await free.page.goto('/#/account');await expect(free.page.getByText(/Free member/i)).toBeVisible();await expect(free.page.getByRole('link',{name:/Upgrade to Arena\+/i})).toBeVisible();
    await premium.page.goto('/#/account');await expect(premium.page.getByText(/Game Arena\+ member/i)).toBeVisible();await expect(premium.page.getByRole('link',{name:/Upgrade to Arena\+/i})).toHaveCount(0);
    await premium.page.goto('/#/premium');await expect(premium.page.getByText(/Game Arena\+ is active on this account/i)).toBeVisible();
    await premium.page.reload();await expect(premium.page.getByText(/Game Arena\+ is active on this account/i)).toBeVisible();
    const plans=await premium.page.context().request.get('/api/v1/billing/plans');expect(plans.status()).toBe(200);const planBody=await plans.json();if(planBody.enabled!==false){const codes=(planBody.plans||[]).map(item=>String(item.code||item.planCode||item.id));expect(codes).toContain('monthly');expect(codes).toContain('yearly');}
  }finally{await free.context.close();await premium.context.close();}
});
