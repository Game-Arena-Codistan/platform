import catalogue1 from './catalogue-1.js';
import catalogue2 from './catalogue-2.js';

export const games=[...catalogue1,...catalogue2];
export const genres=['All',...new Set(games.map(game=>game.genre))];

export const plans=[
  {id:'monthly',name:'Monthly',price:299,period:'month',description:'Flexible access with simple monthly renewal.'},
  {id:'yearly',name:'Yearly',price:4999,period:'year',description:'One annual payment for committed players.',recommended:true}
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
