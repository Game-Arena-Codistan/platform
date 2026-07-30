import test from 'node:test';
import assert from 'node:assert/strict';
import {games,plans,premiumFeatures,challenges,tournaments} from '../src/data.js';

test('commercial baseline matches approved plan',()=>{
  assert.equal(plans.find(plan=>plan.id==='monthly').price,299);
  assert.equal(plans.find(plan=>plan.id==='yearly').price,4999);
  assert.ok(premiumFeatures.includes('2× Arena Coins'));
  assert.ok(premiumFeatures.includes('10% member top-up discount'));
});
test('catalogue metadata is valid',()=>{
  assert.equal(games.length,45);
  assert.equal(new Set(games.map(game=>game.id)).size,games.length);
  for(const game of games){assert.match(game.id,/^[a-z0-9-]+$/);assert.ok(['free','premium'].includes(game.tier));assert.ok(game.reward>=0);assert.ok(game.art);assert.ok(game.gameUrl.startsWith('/demo-games/')||/^https:\/\/games\.codistan\.org\//.test(game.gameUrl));}
  const preview=games.find(game=>game.id==='arena-dash-preview');
  assert.ok(preview?.preview);
  assert.equal(preview.tier,'free');
});
test('challenge and tournament games exist',()=>{
  const ids=new Set(games.map(game=>game.id));
  for(const item of [...challenges,...tournaments])assert.ok(ids.has(item.gameId));
});
