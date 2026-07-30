export const games = [
  {id:'neon-rider',title:'Neon Rider',genre:'Racing',tier:'free',orientation:'landscape',description:'Thread a neon bike through impossible city tracks.',art:'linear-gradient(135deg,#5b21b6,#0e7490)',reward:20},
  {id:'zombie-line',title:'Zombie Line',genre:'Survival',tier:'free',orientation:'landscape',description:'Hold the last checkpoint and beat your best wave.',art:'linear-gradient(135deg,#7f1d1d,#3f3f46)',reward:25},
  {id:'sky-sprint',title:'Sky Sprint',genre:'Running',tier:'free',orientation:'portrait',description:'Dash across floating rooftops in a one-touch runner.',art:'linear-gradient(135deg,#0369a1,#7c3aed)',reward:15},
  {id:'logic-loop',title:'Logic Loop',genre:'Puzzle',tier:'free',orientation:'portrait',description:'Connect every node before the board locks.',art:'linear-gradient(135deg,#0f766e,#312e81)',reward:18},
  {id:'moto-x',title:'Moto X3M Arena',genre:'Racing',tier:'premium',orientation:'landscape',description:'Premium stunt racing with weekly medal challenges.',art:'linear-gradient(135deg,#ea580c,#7c2d12)',reward:50},
  {id:'galaxy-guard',title:'Galaxy Guard',genre:'Arcade',tier:'premium',orientation:'landscape',description:'Defend the arena in a fast score-chasing shooter.',art:'linear-gradient(135deg,#1d4ed8,#6d28d9)',reward:45},
  {id:'word-quest',title:'Word Quest',genre:'Educational',tier:'premium',orientation:'portrait',description:'Build words, unlock maps and climb the learning league.',art:'linear-gradient(135deg,#047857,#a16207)',reward:35},
  {id:'shadow-strike',title:'Shadow Strike',genre:'Action',tier:'premium',orientation:'landscape',description:'Chain precision attacks in a cinematic challenge mode.',art:'linear-gradient(135deg,#111827,#7f1d1d)',reward:55}
];

export const genres = ['All',...new Set(games.map(game=>game.genre))];

export const plans = [
  {id:'monthly',name:'Monthly',price:299,period:'month',description:'Flexible access with simple monthly renewal.'},
  {id:'yearly',name:'Yearly',price:4999,period:'year',description:'One annual payment for committed players.',recommended:true}
];

export const premiumFeatures = [
  'Full catalogue access','Ad-free play','Premium challenges','Tournament access',
  'Reward eligibility','2× Arena Coins','10% member top-up discount'
];

export const challenges = [
  {id:'daily-run',title:'Daily Dash',gameId:'sky-sprint',progress:60,target:'Play 3 runs',reward:40,premium:false},
  {id:'puzzle-master',title:'Puzzle Master',gameId:'logic-loop',progress:25,target:'Solve 4 boards',reward:60,premium:false},
  {id:'stunt-week',title:'Stunt Week',gameId:'moto-x',progress:0,target:'Earn 5 medals',reward:250,premium:true}
];

export const tournaments = [
  {id:'weekend-rush',title:'Weekend Rush',gameId:'neon-rider',starts:'Friday 8:00 PM PKT',entries:1240,premium:false},
  {id:'galaxy-cup',title:'Galaxy Cup',gameId:'galaxy-guard',starts:'Saturday 7:00 PM PKT',entries:640,premium:true}
];

export const benefits = {free:['Selected catalogue','Standard rewards','Basic leaderboards','Ad-supported play'],premium:premiumFeatures};
