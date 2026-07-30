import catalogue1 from './catalogue-1.js';
import catalogue2 from './catalogue-2.js';

const previewGame={
  id:'arena-dash-preview',title:'Arena Dash',genre:'Arcade',tier:'free',orientation:'any',
  description:'A fast, touch-friendly target challenge included directly in this preview build.',
  reward:20,gameUrl:'/demo-games/arena-dash/index.html',multiplayer:false,
  permissions:{fullscreen:true},preview:true
};
const art=[
  'linear-gradient(135deg,#7b61ff 0%,#24194d 48%,#071c2b 100%)',
  'linear-gradient(135deg,#0f6c78 0%,#122448 45%,#251643 100%)',
  'linear-gradient(135deg,#7a2d54 0%,#341948 50%,#101525 100%)',
  'linear-gradient(135deg,#895b19 0%,#3b2546 48%,#071b2b 100%)'
];
export const games=[previewGame,...catalogue1,...catalogue2].map((game,index)=>({...game,art:game.art||art[index%art.length]}));
export const genres=['All',...new Set(games.map(game=>game.genre))];

export const plans=[
  {id:'monthly',name:'Monthly',price:299,period:'month',description:'Flexible access with one fixed-duration monthly purchase.'},
  {id:'yearly',name:'Yearly',price:4999,period:'year',description:'One fixed-duration annual purchase for committed players.',recommended:true}
];

export const premiumFeatures=[
  'Full catalogue access','Ad-free play','Premium challenges','Tournament access',
  'Reward eligibility','2× Arena Coins','10% member top-up discount'
];

export const challenges=[
  {id:'daily-run',title:'Daily Dash',gameId:'crazy-runner',progress:60,target:'Play 3 runs',reward:40,premium:false},
  {id:'puzzle-master',title:'Puzzle Master',gameId:'jelly-match-3',progress:25,target:'Solve 4 boards',reward:60,premium:false},
  {id:'candy-week',title:'Candy Week',gameId:'candy-match-3',progress:0,target:'Clear 5 boards',reward:250,premium:true}
];

export const tournaments=[
  {id:'weekend-rush',title:'Weekend Rush',gameId:'speed-racer',starts:'Friday 8:00 PM PKT',entries:1240,premium:false},
  {id:'space-cup',title:'Space Cup',gameId:'space-purge',starts:'Saturday 7:00 PM PKT',entries:640,premium:true}
];

export const benefits={free:['Selected catalogue','Standard rewards','Basic leaderboards','Ad-supported play'],premium:premiumFeatures};
