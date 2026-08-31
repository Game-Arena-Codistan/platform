import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {controlledPilotIds,games,plans,premiumFeatures,previewGame,mockTopups} from '../src/data.js';

const contract=JSON.parse(await readFile(new URL('../../../contracts/api/v1/mock-responses.json',import.meta.url),'utf8'));
const apiSource=await readFile(new URL('../src/api.js',import.meta.url),'utf8');
const appSource=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const uiSource=await readFile(new URL('../src/ui.js',import.meta.url),'utf8');
const librarySource=await readFile(new URL('../src/views/library.js',import.meta.url),'utf8');
const competeSource=await readFile(new URL('../src/views/compete.js',import.meta.url),'utf8');

test('commercial baseline matches approved plan',()=>{
  assert.equal(plans.find(plan=>plan.id==='monthly').price,299);
  assert.equal(plans.find(plan=>plan.id==='yearly').price,4999);
  assert.equal(plans.some(plan=>plan.recommended),false);
  assert.ok(premiumFeatures.includes('2× Arena Coins'));
  assert.ok(premiumFeatures.includes('10% member top-up discount'));
  assert.equal(premiumFeatures.includes('Downloadable games gallery'),false);
  assert.equal(premiumFeatures.includes('Ad-free play'),false);
});

test('catalogue contains active imported games and a playable preview',()=>{
  assert.equal(games.length,43);
  assert.equal(games[0].id,'arena-dash');
  assert.equal(previewGame.internalDemo,true);
  assert.equal(new Set(games.map(game=>game.id)).size,games.length);
  for(const id of controlledPilotIds)assert.equal(games.some(game=>game.id===id),false,`${id} must remain private while paused`);
  for(const game of games){
    assert.match(game.id,/^[a-z0-9-]+$/);
    assert.ok(['free','premium'].includes(game.tier));
    assert.ok(game.reward>=0);
    assert.ok(game.gameUrl);
  }
});

test('MVP surfaces have launch-safe data contracts',()=>{
  assert.ok(games.some(game=>game.multiplayer));
  assert.ok(mockTopups.length>=3);
  assert.match(librarySource,/game\.tier==='free'&&Boolean\(game\.downloadUrl\)/);
  assert.match(librarySource,/!game\?\.downloadUrl\|\|game\.tier!=='free'/);
  assert.match(competeSource,/games\.filter\(item=>item\.multiplayer\)/);
  assert.doesNotMatch(competeSource,/item\.multiplayer\|\|item\.internalDemo/);
});

test('auth and PWA wiring preserve the staging browser contract',()=>{
  assert.match(uiSource,/form\.onsubmit=async event=>/);
  assert.doesNotMatch(uiSource,/form\.addEventListener\('submit'/);
  assert.match(appSource,/document\.readyState==='complete'/);
  assert.match(appSource,/registerServiceWorker\(\)/);
});

test('Vercel preview mocks match contract 1.0.0',()=>{
  assert.equal(contract.contractVersion,'1.0.0');
  assert.equal(contract.examples.otpRequested.debugCode,'123456');
  assert.equal(contract.examples.otpVerified.entitlement,'free');
  assert.equal(contract.examples.wallet.balance,120);
  assert.equal(contract.examples.topups.offers.length,mockTopups.length);
  assert.deepEqual(contract.examples.topups.offers.map(item=>item.coins),mockTopups.map(item=>item.coins));
  assert.match(apiSource,/code!=='123456'/);
  assert.ok(apiSource.includes("mode:'mock'"));
  for(const game of contract.examples.catalogue.games.filter(item=>item.version==='1.0.0-pilot.1')){
    assert.equal(game.status,'paused');
    assert.equal(game.rolloutPercentage,0);
  }
});
