import test from 'node:test';
import assert from 'node:assert/strict';
import {games,plans,premiumFeatures,previewGame,mockTopups} from '../src/data.js';
test('commercial baseline matches approved plan',()=>{assert.equal(plans.find(plan=>plan.id==='monthly').price,299);assert.equal(plans.find(plan=>plan.id==='yearly').price,4999);assert.ok(premiumFeatures.includes('2× Arena Coins'));assert.ok(premiumFeatures.includes('10% member top-up discount'));});
test('catalogue contains imported games and a playable preview',()=>{assert.ok(games.length>=45);assert.equal(games[0].id,'arena-dash');assert.equal(previewGame.internalDemo,true);assert.equal(new Set(games.map(game=>game.id)).size,games.length);for(const game of games){assert.match(game.id,/^[a-z0-9-]+$/);assert.ok(['free','premium'].includes(game.tier));assert.ok(game.reward>=0);assert.ok(game.gameUrl);}});
test('MVP surfaces have data contracts',()=>{assert.ok(games.some(game=>game.multiplayer));assert.ok(mockTopups.length>=3);assert.ok(premiumFeatures.includes('Downloadable games gallery'));});
