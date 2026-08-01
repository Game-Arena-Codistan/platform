import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogue,pilotCatalogue,quarantinedCatalogue} from '../src/catalogue/index.mjs';
import {MemoryStore} from '../src/adapters/memory-store.mjs';

const pilotIds=['duck-hunter','ranger-vs-zombies','robotex','swat-vs-zombies'];

test('controlled pilot overlay owns all four pilot catalogue records',()=>{
  assert.deepEqual(pilotCatalogue.map(item=>item.id),pilotIds);
  for(const id of pilotIds){
    const records=catalogue.filter(item=>item.id===id);
    assert.equal(records.length,1,`${id} should have exactly one runtime catalogue record`);
    const game=records[0];
    assert.equal(game.status,'paused');
    assert.equal(game.rolloutPercentage,0);
    assert.equal(game.version,'1.0.0-pilot.1');
    assert.equal(game.sourceType,'controlled-pilot');
    assert.equal(game.rewardsEnabled,false);
    assert.equal(game.competitionsEnabled,false);
  }
});

test('paused pilots stay private while source quarantine evidence is preserved',()=>{
  const store=new MemoryStore();
  const publicIds=store.listGames().map(item=>item.id);
  for(const id of pilotIds)assert.equal(publicIds.includes(id),false,`${id} must not be publicly listed while paused`);
  assert.equal(quarantinedCatalogue.some(item=>item.id==='duck-hunter'),true);
  assert.equal(quarantinedCatalogue.some(item=>item.id==='swat-vs-zombies'),true);
});
