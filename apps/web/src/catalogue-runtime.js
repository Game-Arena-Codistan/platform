import {games as fallbackGames,genres as fallbackGenres,previewGame} from './data.js';
import {fetchCatalogue,mode} from './api.js';

const palettes=[['#7c3aed','#22d3ee'],['#db2777','#f97316'],['#0f766e','#84cc16'],['#1d4ed8','#a855f7'],['#b45309','#ef4444'],['#0369a1','#14b8a6']];
const fallbackArt=(index)=>`linear-gradient(135deg,${palettes[index%palettes.length][0]},${palettes[index%palettes.length][1]})`;

let liveGames=null;
let liveGenres=null;
let loading=null;

function enrich(game,index){
  const gameUrl=game.gameUrl||'';
  const downloadUrl=game.downloadUrl||(game.tier==='free'&&gameUrl.startsWith('/')?gameUrl:'');
  return{
    ...game,
    genre:game.genre||'Unclassified',
    description:game.description||'',
    reward:Number(game.reward)||0,
    multiplayer:Boolean(game.multiplayer),
    internalDemo:Boolean(game.internalDemo),
    preview:Boolean(game.preview||game.internalDemo),
    icon:game.iconUrl||game.icon||'',
    banner:game.bannerUrl||game.banner||'',
    art:game.bannerUrl?`linear-gradient(180deg,rgba(3,2,8,.08),rgba(3,2,8,.76)),url("${game.bannerUrl}") center/cover`:fallbackArt(index),
    downloadUrl,
    permissions:game.permissions||{}
  };
}

function sortLive(games){
  const preview=games.find(game=>game.id===previewGame.id);
  const rest=games.filter(game=>game.id!==previewGame.id);
  return preview?[preview,...rest]:games;
}

export function getGames(){return liveGames||fallbackGames;}
export function getGenres(){return liveGenres||fallbackGenres;}
export function catalogueSource(){return liveGames?'live':'fallback';}

export async function ensureCatalogue(){
  if(mode()!=='live')return getGames();
  if(liveGames)return liveGames;
  if(loading)return loading;
  loading=(async()=>{
    const result=await fetchCatalogue();
    const list=sortLive((result.games||[]).map((game,index)=>enrich(game,index)));
    if(!list.length)throw new Error('Live catalogue returned no games.');
    liveGames=list;
    liveGenres=['All',...new Set(list.map(game=>game.genre||'Unclassified'))];
    return liveGames;
  })();
  try{return await loading;}finally{loading=null;}
}
