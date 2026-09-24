import {test,expect,request} from '@playwright/test';
import {signInFromAccount} from './helpers.mjs';

function adminAssertions(){try{return JSON.parse(process.env.STAGING_QA_ADMIN_ASSERTIONS_JSON||'{}');}catch{return{};}}
const playerUrl=String(process.env.STAGING_PLAYER_URL||'').replace(/\/$/,'');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function mutationHeaders(page){
  const cookies=await page.context().cookies();
  const csrf=cookies.find(item=>item.name==='ga_csrf')?.value||'';
  return{origin:new URL(page.url()).origin,'x-csrf-token':decodeURIComponent(csrf)};
}
async function apiPost(page,path,data){
  return page.context().request.post(`/api${path}`,{headers:await mutationHeaders(page),data});
}
async function session(page){
  const response=await page.context().request.get('/api/v1/session');
  expect(response.status()).toBe(200);
  return response.json();
}
async function adjustEntitlement(page,{action,durationDays=30,planId='manual',reason}){
  const current=await session(page);
  expect(current.authenticated).toBe(true);
  const adminUrl=String(process.env.STAGING_ADMIN_URL||'').trim();
  const assertions=adminAssertions();
  if(!adminUrl||!assertions.admin)throw new Error('BLOCKED: signed staging Admin access is required for premium differential fixtures.');
  const context=await request.newContext({baseURL:adminUrl,extraHTTPHeaders:assertions.admin});
  try{
    const payload={action,reason};
    if(action==='grant'||action==='extend')Object.assign(payload,{durationDays,planId});
    const response=await context.post(`/api/v1/admin/subscriptions/${encodeURIComponent(current.user.id)}/adjust`,{data:payload});
    expect(response.status(),`${action} entitlement should succeed`).toBe(200);
    return response.json();
  }finally{await context.dispose();}
}
async function persona(browser,testInfo,label,{premium=false}={}){
  const context=await browser.newContext({baseURL:playerUrl});
  const page=await context.newPage();
  await signInFromAccount(page,testInfo,{label});
  if(premium){
    await adjustEntitlement(page,{action:'grant',durationDays:30,planId:'manual',reason:`AUTO-QA premium differential ${label}`});
    await page.reload();
  }
  const current=await session(page);
  expect(current.entitlement?.tier||current.entitlement).toBe(premium?'premium':'free');
  return{context,page,current};
}
async function completeGame(page,game,{score=1234}={}){
  const startedAt=Date.now();
  const started=await apiPost(page,'/v1/play-sessions',{gameId:game.id});
  expect(started.status(),`start ${game.id}`).toBe(201);
  const play=await started.json();
  await wait(1100);
  const durationMs=Math.max(1000,Date.now()-startedAt);
  const completed=await apiPost(page,`/v1/play-sessions/${encodeURIComponent(play.playSessionId)}/complete`,{
    score,durationMs,completedAt:Date.now(),gameVersion:play.gameVersion,nonce:play.nonce
  });
  expect([200,202],`complete ${game.id}`).toContain(completed.status());
  return completed.json();
}

test('@player @premium-contract free and Arena+ identities stay isolated and every premium title enforces the entitlement boundary',async({browser},testInfo)=>{
  test.setTimeout(240000);
  const free=await persona(browser,testInfo,'premium-matrix-free');
  const premium=await persona(browser,testInfo,'premium-matrix-paid',{premium:true});
  try{
    await free.page.goto('/#/account');
    await expect(free.page.getByText(/Free member/i)).toBeVisible();
    await premium.page.goto('/#/account');
    await expect(premium.page.getByText(/Game Arena\+ member/i)).toBeVisible();

    const catalogueResponse=await free.context.request.get('/api/v1/catalog/games');
    expect(catalogueResponse.status()).toBe(200);
    const catalogue=(await catalogueResponse.json()).games||[];
    const premiumGames=catalogue.filter(game=>game.tier==='premium');
    const freeGames=catalogue.filter(game=>game.tier!=='premium');
    expect(premiumGames.length,'staging must expose premium titles').toBeGreaterThan(0);
    expect(freeGames.length,'staging must expose free titles').toBeGreaterThan(0);

    for(const game of premiumGames){
      const denied=await apiPost(free.page,'/v1/play-sessions',{gameId:game.id});
      expect(denied.status(),`free user must be denied ${game.id}`).toBe(403);
      const deniedBody=await denied.json();
      expect(deniedBody.error?.code,`free denial code for ${game.id}`).toBe('premium_required');

      const allowed=await apiPost(premium.page,'/v1/play-sessions',{gameId:game.id});
      expect(allowed.status(),`premium user must start ${game.id}`).toBe(201);
    }

    const freeAllowed=await apiPost(free.page,'/v1/play-sessions',{gameId:freeGames[0].id});
    expect(freeAllowed.status(),'free user should still start a free title').toBe(201);
  }finally{await free.context.close();await premium.context.close();}
});

test('@player @premium-contract verified play credits exactly 2x Arena Coins to Arena+ versus a fresh free account',async({browser},testInfo)=>{
  test.setTimeout(120000);
  const free=await persona(browser,testInfo,'reward-matrix-free');
  const premium=await persona(browser,testInfo,'reward-matrix-paid',{premium:true});
  try{
    const response=await free.context.request.get('/api/v1/catalog/games');
    const games=(await response.json()).games||[];
    const game=games.find(item=>item.tier!=='premium'&&Number(item.reward)>0);
    expect(game,'a rewarded free title is required').toBeTruthy();

    const freeResult=await completeGame(free.page,game,{score:4321});
    const premiumResult=await completeGame(premium.page,game,{score:4321});
    expect(freeResult.status).toBe('verified');
    expect(premiumResult.status).toBe('verified');
    expect(Number(freeResult.reward)).toBeGreaterThan(0);
    expect(Number(premiumResult.reward)).toBe(Number(freeResult.reward)*2);

    await free.page.goto('/#/rewards');
    await expect(free.page.locator('.metric-row')).toContainText('1×');
    await premium.page.goto('/#/rewards');
    await expect(premium.page.locator('.metric-row')).toContainText('2×');
  }finally{await free.context.close();await premium.context.close();}
});

test('@player @premium-contract premium challenge and tournament deny Free but complete successfully for Arena+',async({browser},testInfo)=>{
  test.setTimeout(180000);
  const free=await persona(browser,testInfo,'competition-matrix-free');
  const premium=await persona(browser,testInfo,'competition-matrix-paid',{premium:true});
  try{
    const readyResponse=await free.context.request.get('/api/readyz');
    const ready=await readyResponse.json();
    test.skip(ready.competitions!==true,'Competitions are disabled in this deployment.');

    const challengesResponse=await premium.context.request.get('/api/v1/challenges');
    const tournamentsResponse=await premium.context.request.get('/api/v1/tournaments');
    expect(challengesResponse.status()).toBe(200);expect(tournamentsResponse.status()).toBe(200);
    const challenges=(await challengesResponse.json()).challenges||[];
    const tournaments=(await tournamentsResponse.json()).tournaments||[];
    const challenge=challenges.find(item=>item.premium===true);
    const tournament=tournaments.find(item=>item.premium===true);
    expect(challenge,'premium challenge fixture is required').toBeTruthy();
    expect(tournament,'premium tournament fixture is required').toBeTruthy();

    const freeClaim=await apiPost(free.page,`/v1/challenges/${encodeURIComponent(challenge.id)}/claim`,{});
    expect(freeClaim.status()).toBe(403);
    expect((await freeClaim.json()).error?.code).toBe('premium_required');

    const freeJoin=await apiPost(free.page,`/v1/tournaments/${encodeURIComponent(tournament.id)}/join`,{});
    expect(freeJoin.status()).toBe(403);
    expect((await freeJoin.json()).error?.code).toBe('premium_required');

    const catalogue=(await (await premium.context.request.get('/api/v1/catalog/games')).json()).games||[];
    const challengeGame=catalogue.find(item=>(challenge.gameIds||[]).includes(item.id));
    expect(challengeGame,'challenge game must exist in catalogue').toBeTruthy();
    if(challenge.target?.type==='completions'){
      for(let index=0;index<Number(challenge.target.value);index++)await completeGame(premium.page,challengeGame,{score:1000+index});
    }else{
      await completeGame(premium.page,challengeGame,{score:Number(challenge.target?.value||1000)});
    }
    const premiumClaim=await apiPost(premium.page,`/v1/challenges/${encodeURIComponent(challenge.id)}/claim`,{});
    expect(premiumClaim.status(),'premium challenge claim should succeed').toBe(200);

    const premiumJoin=await apiPost(premium.page,`/v1/tournaments/${encodeURIComponent(tournament.id)}/join`,{});
    expect(premiumJoin.status(),'premium tournament join should succeed').toBe(201);
  }finally{await free.context.close();await premium.context.close();}
});

test('@player @premium-contract member top-up pricing is exactly 10 percent lower when live offers are configured',async({browser},testInfo)=>{
  test.setTimeout(120000);
  const free=await persona(browser,testInfo,'topup-matrix-free');
  const premium=await persona(browser,testInfo,'topup-matrix-paid',{premium:true});
  try{
    const freeResponse=await free.context.request.get('/api/v1/offers/topups');
    const premiumResponse=await premium.context.request.get('/api/v1/offers/topups');
    expect(freeResponse.status()).toBe(200);expect(premiumResponse.status()).toBe(200);
    const freePayload=await freeResponse.json();const premiumPayload=await premiumResponse.json();
    test.skip(!freePayload.enabled||!freePayload.offers?.length,'No live top-up offers are configured; 10% Arena+ discount is not active in this deployment.');
    const freeOffer=freePayload.offers[0];
    const premiumOffer=premiumPayload.offers.find(item=>item.id===freeOffer.id);
    expect(premiumOffer).toBeTruthy();
    expect(Number(freeOffer.memberDiscountPercent||0)).toBe(0);
    expect(Number(premiumOffer.memberDiscountPercent)).toBe(10);
    expect(Number(premiumOffer.memberAmountPkr)).toBe(Math.max(1,Math.round(Number(freeOffer.amountPkr)*0.9)));

    const freeCheckout=await apiPost(free.page,'/v1/offers/topups/checkout',{offerId:freeOffer.id});
    const premiumCheckout=await apiPost(premium.page,'/v1/offers/topups/checkout',{offerId:freeOffer.id});
    expect(freeCheckout.status()).toBe(201);expect(premiumCheckout.status()).toBe(201);
    const freeTx=await freeCheckout.json();const premiumTx=await premiumCheckout.json();
    expect(Number(premiumTx.amountPkr)).toBe(Math.max(1,Math.round(Number(freeTx.amountPkr)*0.9)));
  }finally{await free.context.close();await premium.context.close();}
});

test('@player @premium-contract configured Free play limit blocks Free while Arena+ remains unlimited',async({browser},testInfo)=>{
  test.setTimeout(120000);
  const free=await persona(browser,testInfo,'limit-matrix-free');
  const premium=await persona(browser,testInfo,'limit-matrix-paid',{premium:true});
  try{
    const ready=await (await free.context.request.get('/api/readyz')).json();
    const limit=Number(ready.freePlayDailyLimit||0);
    test.skip(limit<=0,'FREE_PLAY_DAILY_LIMIT is disabled; this Premium distinction is not active in the deployment.');
    test.skip(limit>10,`Configured free-play limit ${limit} is too high for deterministic release-gate exercise.`);
    const catalogue=(await (await free.context.request.get('/api/v1/catalog/games')).json()).games||[];
    const game=catalogue.find(item=>item.tier!=='premium');
    expect(game).toBeTruthy();
    for(let index=0;index<limit;index++)expect((await apiPost(free.page,'/v1/play-sessions',{gameId:game.id})).status()).toBe(201);
    const blocked=await apiPost(free.page,'/v1/play-sessions',{gameId:game.id});
    expect(blocked.status()).toBe(429);
    expect((await blocked.json()).error?.code).toBe('free_play_limit_reached');
    for(let index=0;index<limit+1;index++)expect((await apiPost(premium.page,'/v1/play-sessions',{gameId:game.id})).status()).toBe(201);
  }finally{await free.context.close();await premium.context.close();}
});

test('@player @premium-contract audited revoke immediately removes Premium authorization without affecting the account session',async({browser},testInfo)=>{
  test.setTimeout(120000);
  const premium=await persona(browser,testInfo,'revoke-matrix-paid',{premium:true});
  try{
    const catalogue=(await (await premium.context.request.get('/api/v1/catalog/games')).json()).games||[];
    const premiumGame=catalogue.find(item=>item.tier==='premium');
    expect(premiumGame).toBeTruthy();
    expect((await apiPost(premium.page,'/v1/play-sessions',{gameId:premiumGame.id})).status()).toBe(201);

    await adjustEntitlement(premium.page,{action:'revoke',reason:'AUTO-QA premium differential revoke'});
    const after=await session(premium.page);
    expect(after.authenticated).toBe(true);
    expect(after.entitlement?.tier||after.entitlement).toBe('free');
    const denied=await apiPost(premium.page,'/v1/play-sessions',{gameId:premiumGame.id});
    expect(denied.status()).toBe(403);
    expect((await denied.json()).error?.code).toBe('premium_required');
  }finally{await premium.context.close();}
});
