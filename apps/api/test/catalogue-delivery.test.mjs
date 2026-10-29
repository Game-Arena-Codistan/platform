import assert from 'node:assert/strict';
import test from 'node:test';
import {applyPortfolioDelivery,portfolioFolderName,portfolioGameUrl} from '../src/lib/catalogue-delivery.mjs';

test('portfolio folder prefers gamesbundle asset path then title casing',()=>{
  assert.equal(portfolioFolderName({id:'touch-ball',title:'Touch Ball',iconUrl:'https://gamesbundle.codistan.org/Touch-Ball/icons/icon-256.png'}),'Touch-Ball');
  assert.equal(portfolioFolderName({id:'swat-vs-zombies',title:'Swat vs Zombies'}),'Swat-vs-Zombies');
  assert.equal(portfolioFolderName({id:'super-pongoal',title:'Super PonGoal'}),'Super-PonGoal');
});

test('portfolio delivery rewrites controlled /games paths when enabled',()=>{
  const games=[
    {id:'touch-ball',title:'Touch Ball',gameUrl:'/games/touch-ball/1.0.0/index.html',iconUrl:'https://gamesbundle.codistan.org/Touch-Ball/icons/icon-256.png'},
    {id:'arena-dash',title:'Arena Dash',gameUrl:'/demo-games/arena-dash/index.html',internalDemo:true},
    {id:'already',title:'Already',gameUrl:'https://gamesbundle.codistan.org/Already/index.html'}
  ];
  const result=applyPortfolioDelivery(games,{enabled:true});
  assert.equal(result.updated,1);
  assert.equal(games[0].gameUrl,'https://gamesbundle.codistan.org/Touch-Ball/index.html');
  assert.equal(games[1].gameUrl,'/demo-games/arena-dash/index.html');
  assert.equal(portfolioGameUrl(games[2]),'https://gamesbundle.codistan.org/Already/index.html');
});

test('portfolio delivery is a no-op when disabled',()=>{
  const games=[{id:'touch-ball',title:'Touch Ball',gameUrl:'/games/touch-ball/1.0.0/index.html'}];
  const result=applyPortfolioDelivery(games,{enabled:false});
  assert.equal(result.updated,0);
  assert.equal(games[0].gameUrl,'/games/touch-ball/1.0.0/index.html');
});
