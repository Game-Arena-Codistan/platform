import {games as fallbackGames,genres as fallbackGenres,previewGame} from './data.js';
import {fetchCatalogue,mode} from './api.js';
import {localReleaseBase,resolveCardArt} from './game-card-art.js';

let liveGames=null;
let liveGenres=null;
let loading=null;

function enrich(game,index){
  const gameUrl=game.gameUrl||'';
  const downloadUrl=game.downloadUrl||(game.tier==='free'&&gameUrl.startsWith('/')?gameUrl:'');
  const base=localReleaseBase(gameUrl);
  const icon=game.iconUrl||game.icon||(base?`${base}/icons/icon-256.png`:'');
  const banner=game.bannerUrl||game.banner||'';
  return{
    ...game,
    genre:game.genre||'Unclassified',
    description:game.description||'',
    reward:Number(game.reward)||0,
    multiplayer:Boolean(game.multiplayer),
    internalDemo:Boolean(game.internalDemo),
    preview:Boolean(game.preview||game.internalDemo),
    icon,
    banner,
    art:resolveCardArt({...game,icon,banner,iconUrl:icon,bannerUrl:banner},index),
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
