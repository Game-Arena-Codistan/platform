import {getState,isPremium,addRecent,update} from './state.js';
import {completePlay,gameUrl,startPlay,mode} from './api.js';
import {escapeHtml,modal,requireAuth,toast} from './ui.js';
import {GameBridge} from './game-bridge.js';
import {track} from './analytics.js';

export async function openGame(game){
  if(!game)return;
  if(game.tier==='premium'&&!isPremium()){
    track('upgrade_view',{source:'locked_game',gameId:game.id});
    location.assign('/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash');
    return;
  }
  const guestFree=game.tier==='free'&&!getState().user;
  const canGuestDemo=game.internalDemo&&mode()==='mock';
  if(!guestFree&&!canGuestDemo&&!await requireAuth({type:'game',gameId:game.id}))return;
  addRecent(game.id);
  track('game_play_intent',{gameId:game.id,guest:guestFree});
  let play=null;
  if(!guestFree){
    try{play=await startPlay(game.id);}
    catch(error){toast(error.message);return;}
  }
  const url=gameUrl(game);
  const permissions=game.permissions||{};
  const sandbox=['allow-scripts',...(permissions.pointerLock?['allow-pointer-lock']:[])].join(' ');
  const allow=[...(permissions.fullscreen?['fullscreen']:[]),...(permissions.orientationLock?['screen-wake-lock']:[])].join('; ');
  const body=url
    ?`<div class="game-stage"><iframe id="game-frame" title="${escapeHtml(game.title)}" src="${escapeHtml(url)}" sandbox="${sandbox}" allow="${allow}"></iframe></div>`
    :`<div class="game-stage"><div class="empty"><h3>Game runtime unavailable</h3><p>This title needs an approved hosted build.</p></div></div>`;
  modal(game.title,`${body}<div class="game-toolbar"><span class="muted">${guestFree?'Guest free play':'Secure isolated player'}</span><button class="button secondary" data-close-game type="button">Exit game</button></div>`,{wide:true});
  const iframe=document.querySelector('#game-frame');
  if(!iframe)return;
  let bridge;
  let submitting=false;
  bridge=new GameBridge(iframe,game,async(type,payload)=>{
    if(type==='ready')track('game_start',{gameId:game.id,guest:guestFree});
    if(type==='exit')document.querySelector('[data-close]')?.click();
    if(type==='reward-request'&&!submitting){
      if(!play?.playSessionId){toast('Sign in to earn Arena Coins from this game.');return;}
      submitting=true;
      try{
        const result=await completePlay(play.playSessionId,{score:payload.score,durationMs:payload.durationMs,completedAt:Date.now(),gameVersion:play.gameVersion,nonce:play.nonce});
        if(result.accepted){update({coins:result.balance});toast(`+${result.reward} Arena Coins`);}
        else toast('Result submitted for review.');
        track('game_complete',{gameId:game.id,status:result.status});
      }catch(error){toast(error.message);}
      finally{submitting=false;}
    }
  });
  iframe.addEventListener('load',()=>bridge.init({premium:isPremium(),playSessionId:play?.playSessionId||null}),{once:true});
  const visibility=()=>document.hidden?bridge.pause():bridge.resume();
  document.addEventListener('visibilitychange',visibility);
  const close=()=>{document.removeEventListener('visibilitychange',visibility);bridge.destroy();};
  document.querySelector('[data-close]')?.addEventListener('click',close,{once:true});
  document.querySelector('[data-close-game]')?.addEventListener('click',()=>document.querySelector('[data-close]')?.click());
}
