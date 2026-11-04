import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {controlledPilotIds,games,plans,premiumFeatures,previewGame,mockTopups} from '../src/data.js';

const contract=JSON.parse(await readFile(new URL('../../../contracts/api/v1/mock-responses.json',import.meta.url),'utf8'));
const apiSource=await readFile(new URL('../src/api.js',import.meta.url),'utf8');
const appSource=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const uiSource=await readFile(new URL('../src/ui.js',import.meta.url),'utf8');
const billingApiSource=await readFile(new URL('../src/billing-api.js',import.meta.url),'utf8');
const premiumSource=await readFile(new URL('../src/views/premium.js',import.meta.url),'utf8');
const accountSource=await readFile(new URL('../src/views/account.js',import.meta.url),'utf8');
const librarySource=await readFile(new URL('../src/views/library.js',import.meta.url),'utf8');
const competeSource=await readFile(new URL('../src/views/compete.js',import.meta.url),'utf8');
const landingSource=await readFile(new URL('../src/landing.js',import.meta.url),'utf8');
const stateSource=await readFile(new URL('../src/state.js',import.meta.url),'utf8');
const billingAccountSource=await readFile(new URL('../src/billing-account.js',import.meta.url),'utf8');

test('commercial baseline matches approved legacy fallback plan',()=>{
  assert.equal(plans.find(plan=>plan.id==='monthly').price,599);
  assert.equal(plans.find(plan=>plan.id==='yearly').price,4999);
  assert.equal(plans.find(plan=>plan.id==='monthly').recommended,true);
  assert.equal(plans.find(plan=>plan.id==='yearly').comingSoon,true);
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

test('library card art prefers CSP-safe game snaps over sprite sheets',async()=>{
  const {localReleaseBase,packagedIconPath,resolveCardArt}=await import('../src/game-card-art.js');
  assert.equal(localReleaseBase('/games/balloon-paradise/1.0.0/index.html'),'/games/balloon-paradise/1.0.0');
  assert.equal(localReleaseBase('/demo-games/arena-dash/index.html'),'/demo-games/arena-dash');
  assert.equal(packagedIconPath({id:'balloon-paradise',slug:'balloon-paradise',version:'1.0.0'}),'/games/balloon-paradise/1.0.0/icons/icon-256.png');
  assert.equal(packagedIconPath({id:'candy-super-lines',version:'1.0.0'}),'/games/candy-super-lines/1.0.0/icon-256.png');
  // Prefer packaged icon over 404-prone catalogue banners even when gameUrl was rewritten to the portfolio CDN.
  const hosted=resolveCardArt({
    id:'balloon-paradise',
    slug:'balloon-paradise',
    version:'1.0.0',
    gameUrl:'https://gamesbundle.codistan.org/Balloon-Paradise/index.html',
    bannerUrl:'https://gamesbundle.codistan.org/Balloon-Paradise/images/baloon%20paradaise.webp',
    iconUrl:'https://gamesbundle.codistan.org/Balloon-Paradise/icons/icon-256.png'
  },0);
  assert.match(hosted,/url\('\/games\/balloon-paradise\/1\.0\.0\/icons\/icon-256\.png'\)/);
  assert.doesNotMatch(hosted,/baloon%20paradaise\.webp/);
  assert.doesNotMatch(hosted,/url\("/);
  assert.match(hosted,/rgba\(4,3,10/);
  const sheetSkipped=resolveCardArt({gameUrl:'https://games.codistan.org/touchball/',bannerUrl:'https://games.codistan.org/touchball/images/shared-0-sheet0.png',iconUrl:'https://games.codistan.org/touchball/icons/icon-256.png'},1);
  assert.match(sheetSkipped,/icon-256\.png/);
  assert.doesNotMatch(sheetSkipped,/shared-0-sheet0/);
  const curated=resolveCardArt({id:'arena-dash',preview:true,internalDemo:true,gameUrl:'/demo-games/arena-dash/index.html',version:'demo'},0);
  assert.match(curated,/\/assets\/card-art\/arena-dash\.jpg/);
  const carPhysics=resolveCardArt({id:'car-physics',slug:'car-physics',version:'1.0.0',gameUrl:'/games/car-physics/1.0.0/index.html',iconUrl:'https://gamesbundle.codistan.org/Car-Physics/icons/icon-256.png'},2);
  assert.match(carPhysics,/\/assets\/card-art\/car-physics\.jpg/);
});

test('MVP surfaces have launch-safe data contracts',()=>{
  assert.ok(games.some(game=>game.multiplayer));
  assert.ok(mockTopups.length>=3);
  assert.match(librarySource,/game\.tier==='free'&&Boolean\(game\.downloadUrl\)/);
  assert.match(librarySource,/!game\?\.downloadUrl\|\|game\.tier!=='free'/);
  assert.match(competeSource,/getGames\(\)\.filter\(item=>item\.multiplayer\)|games\.filter\(item=>item\.multiplayer\)/);
  assert.match(competeSource,/item\.multiplayer/);
  assert.doesNotMatch(competeSource,/item\.multiplayer\|\|item\.internalDemo/);
});

test('live catalogue runtime and rewards wallet empty copy are wired for staging UX',async()=>{
  const rewardsSource=await readFile(new URL('../src/views/rewards.js',import.meta.url),'utf8');
  const runtimeSource=await readFile(new URL('../src/catalogue-runtime.js',import.meta.url),'utf8');
  assert.match(appSource,/ensureCatalogue\(\)/);
  assert.match(librarySource,/getGames\(\)/);
  assert.match(librarySource,/getGames\(\)|Search \$\{games\.length\} games|Choose a plan to play/);
  assert.match(apiSource,/fetchCatalogue/);
  assert.match(apiSource,/\/v1\/catalog\/games/);
  assert.match(runtimeSource,/export async function ensureCatalogue/);
  assert.match(rewardsSource,/export function walletEmptyCopy/);
  assert.match(rewardsSource,/Sign in to load wallet activity/);
  assert.match(rewardsSource,/Loading wallet activity/);
  assert.match(rewardsSource,/No wallet activity yet/);
  assert.match(rewardsSource,/walletEmptyCopy\(state\)/);
  assert.match(apiSource,/crossOriginAllowlisted|versionInPath/);
  assert.match(rewardsSource,/getState\(\)\.user&&!getState\(\)\.walletLoaded/);
});

test('auth and PWA wiring preserve the staging browser contract',()=>{
  assert.match(uiSource,/form\.onsubmit=async event=>/);
  assert.doesNotMatch(uiSource,/form\.addEventListener\('submit'/);
  assert.match(appSource,/document\.readyState==='complete'/);
  assert.match(appSource,/registerServiceWorker\(\)/);
});

test('external billing UI remains a BFF-only trust boundary',()=>{
  assert.match(billingApiSource,/\/v1\/billing\/plans/);
  assert.match(billingApiSource,/\/v1\/billing\/wallets\/link/);
  assert.match(billingApiSource,/\/v1\/billing\/status/);
  assert.match(billingApiSource,/consentToAutoPay/);
  assert.match(landingSource,/consentToAutoPay:true/);
  assert.match(landingSource,/\/landing1/);
  assert.match(landingSource,/\/mainLanding/);
  assert.match(landingSource,/Terms and Conditions/);
  assert.match(landingSource,/jazzcash-logo\.png/);
  assert.match(landingSource,/main-mobile\.jpeg|landing1-mobile\.jpeg/);
  assert.match(premiumSource,/mainLanding|defaultLandingHref/);
  assert.match(premiumSource,/createBillingSubscription/);
  assert.match(librarySource,/10 free games for guests|Unlock with JazzCash/);
  assert.match(accountSource,/renderBillingPanel/);
  assert.match(accountSource,/Subscribed/);
  assert.match(accountSource,/subscription_cancel/);
  assert.match(accountSource,/pending-subscription/);
  assert.match(stateSource,/export function entitlementTier/);
  assert.match(stateSource,/entitlementTier\(\)==='premium'/);
  assert.doesNotMatch(stateSource,/status==='active'&&value\?\.tier!=='free'/);
  assert.match(billingAccountSource,/syncEntitlementTier/);
  assert.match(billingAccountSource,/entitlementTier\(\)===tier/);
  assert.doesNotMatch(billingAccountSource,/getState\(\)\.entitlement!==status\.appEntitlement\.tier/);
  assert.match(uiSource,/auth-password|Create account|data-auth-mode/);
  assert.match(apiSource,/registerAccount|loginAccount/);
  assert.match(landingSource,/landing-msisdn|Enter Your JazzCash Number/);
  assert.match(landingSource,/landing-css-ready/);
  assert.match(landingSource,/ensureLandingStyles\(\)\.then/);
  assert.match(landingSource,/ga-lp-above[\s\S]*ga-lp-trust[\s\S]*ga-lp-legal[\s\S]*<\/div>\s*<\/div>\s*\$\{benefitsFooter\(\)\}/);
  assert.match(landingSource,/minHeight|100dvh|Premium Benefits stays below the fold/);
  assert.match(accountSource,/account-stack/);
  assert.doesNotMatch(`${billingApiSource}\n${premiumSource}\n${accountSource}\n${landingSource}`,/PAYMENT_SERVICE_API_KEY|PAYMENT_SERVICE_WEBHOOK_SECRET|x-api-key/i);
  assert.doesNotMatch(billingApiSource,/amountMinor\s*:/);
  assert.doesNotMatch(premiumSource,/pp_PaymentToken|pp_Password|pp_SecureHash/);
  assert.doesNotMatch(landingSource,/pp_PaymentToken|pp_Password|pp_SecureHash/);
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
