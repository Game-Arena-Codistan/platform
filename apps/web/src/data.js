import catalogue1 from './catalogue-1.js';
import catalogue2 from './catalogue-2.js';
import {catalogueArtwork} from './catalogue-art.js';

const palettes=[['#7c3aed','#22d3ee'],['#db2777','#f97316'],['#0f766e','#84cc16'],['#1d4ed8','#a855f7'],['#b45309','#ef4444'],['#0369a1','#14b8a6']];
const normalize=url=>{try{const value=new URL(url,location.origin);return value.href.replace(/\/+$/,'/');}catch{return String(url||'');}};
const fallbackArt=(index)=>`linear-gradient(135deg,${palettes[index%palettes.length][0]},${palettes[index%palettes.length][1]})`;
export const controlledPilotIds=['duck-hunter','ranger-vs-zombies','robotex','swat-vs-zombies'];
const controlledPilots=new Set(controlledPilotIds);
const source=[...catalogue1,...catalogue2].filter(game=>!controlledPilots.has(game.id));
const enriched=source.map((game,index)=>{const media=catalogueArtwork[normalize(game.gameUrl)]||{};return{...game,icon:media.icon||'',banner:media.banner||'',art:media.banner?`linear-gradient(180deg,rgba(3,2,8,.08),rgba(3,2,8,.76)),url("${media.banner}") center/cover`:fallbackArt(index),downloadUrl:game.downloadUrl||'',multiplayer:Boolean(game.multiplayer),internalDemo:false};});
export const previewGame={id:'arena-dash',title:'Arena Dash',genre:'Arcade',tier:'free',orientation:'portrait',description:'Dodge neon gates, build a streak and finish a complete reward-enabled run in the browser.',reward:20,gameUrl:'/demo-games/arena-dash/index.html',multiplayer:false,internalDemo:true,preview:true,downloadUrl:'/demo-games/arena-dash/index.html',art:'radial-gradient(circle at 70% 15%,rgba(255,255,255,.28),transparent 22%),linear-gradient(145deg,#5b21b6,#0891b2 55%,#0f172a)'};
export const games=[previewGame,...enriched];
export const genres=['All',...new Set(games.map(game=>game.genre))];
export const plans=[
  {id:'monthly',name:'Monthly',price:299,period:'month',description:'Fixed-duration access for one month.'},
  {id:'yearly',name:'Yearly',price:4999,period:'year',description:'Fixed-duration access for one year.'}
];
export const premiumFeatures=['Full catalogue access','Premium challenges','Tournament access','Reward eligibility','2× Arena Coins','10% member top-up discount'];
export const benefits={free:['Selected catalogue','Standard rewards','Basic leaderboards','Configurable play limits'],premium:premiumFeatures};
export const fallbackChallenges=[
  {id:'daily-play',title:'Daily Play',gameIds:['arena-dash'],target:{type:'completions',value:3},reward:40,premium:false,status:'live',progress:{value:1,target:3,complete:false}},
  {id:'arena-plus-week',title:'Arena+ Week',gameIds:games.filter(item=>item.tier==='premium').slice(0,5).map(item=>item.id),target:{type:'score',value:1000},reward:250,premium:true,status:'live',progress:{value:420,target:1000,complete:false}}
];
export const fallbackTournaments=[
  {id:'weekend-arena',title:'Weekend Arena',gameId:'arena-dash',startsAt:Date.now()-3600000,endsAt:Date.now()+3*86400000,premium:false,status:'open',entries:1240},
  {id:'arena-plus-cup',title:'Arena+ Cup',gameId:games.find(item=>item.tier==='premium')?.id||'arena-dash',startsAt:Date.now()+86400000,endsAt:Date.now()+5*86400000,premium:true,status:'open',entries:640}
];
export const mockTopups=[
  {id:'demo-small',label:'Starter Coins',coins:100,amountPkr:99,status:'preview'},
  {id:'demo-value',label:'Value Coins',coins:550,amountPkr:499,status:'preview',recommended:true},
  {id:'demo-max',label:'Max Coins',coins:1200,amountPkr:999,status:'preview'}
];
export const mockRooms=[
  {id:'room-neon-1',gameId:'arena-dash',name:'Neon Sprint',players:1,maxPlayers:2,status:'open',hostName:'Player One'},
  {id:'room-weekend-4',gameId:games.find(item=>item.multiplayer)?.id||'arena-dash',name:'Weekend Match',players:2,maxPlayers:4,status:'open',hostName:'Arena Host'}
];
export const supportTopics=['Account or sign-in','Premium or payment','Game not loading','Rewards or coins','Tournament or multiplayer','Privacy or account deletion','Other'];
