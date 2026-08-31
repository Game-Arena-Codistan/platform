import live1 from './live-1.mjs';
import live2 from './live-2.mjs';
import live3 from './live-3.mjs';
import live4 from './live-4.mjs';
import pilots from './pilots.mjs';
import quarantine1 from './quarantine-1.mjs';
import quarantine2 from './quarantine-2.mjs';

const arenaDash={id:'arena-dash',title:'Arena Dash',description:'Dodge neon gates, build a streak and finish a complete reward-enabled run in the browser.',genre:'Arcade',tier:'free',orientation:'portrait',multiplayer:false,reward:20,status:'live',rolloutPercentage:100,gameUrl:'/demo-games/arena-dash/index.html',version:'demo',internalDemo:true,preview:true,sourceType:'internal-demo',rewardsEnabled:true,competitionsEnabled:false};
const byId=new Map([[arenaDash.id,arenaDash],...[...live1,...live2,...live3,...live4].map(game=>[game.id,game])]);
for(const pilot of pilots)byId.set(pilot.id,pilot);

export const catalogue=[...byId.values()];
export const pilotCatalogue=pilots.map(game=>({...game}));
export const quarantinedCatalogue=[...quarantine1,...quarantine2];
