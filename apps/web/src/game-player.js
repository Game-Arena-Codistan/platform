import {getState,isPremium,hasPendingGuestPremium,addRecent,update} from './state.js';
import {completePlay,gameUrl,startPlay,mode} from './api.js';
import {escapeHtml,modal,openAuth,requireAuth,toast} from './ui.js';
import {GameBridge} from './game-bridge.js';
import {track} from './analytics.js';
import {defaultLandingHref} from './landing-campaign.js';

export async function openGame(game){
  if(!game)return;
  if(game.tier==='premium'&&!getState().user&&(isPremium()||hasPendingGuestPremium())){
    track('auth_required',{source:'premium_game',gameId:game.id});
    update({continuation:{type:'game',gameId:game.id}});
    if(!await openAuth('signup')||!getState().user)return;
  }
  if(game.tier==='premium'&&!isPremium()){
    track('upgrade_view',{source:'locked_game',gameId:game.id});
    location.assign(defaultLandingHref('monthly'));
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
  // Construct builds need a real origin for module workers. Only grant the same-origin
  // sandbox token when the game is cross-origin so it cannot touch the player shell.
  const crossOrigin=Boolean(url)&&(()=>{try{return new URL(url).origin!==location.origin;}catch{return false;}})();
  const sameOriginToken=['allow','same-origin'].join('-');
  const sandbox=['allow-scripts',...(crossOrigin?[sameOriginToken]:[]),...(permissions.pointerLock?['allow-pointer-lock']:[])].join(' ');
  const allow=[...(permissions.fullscreen?['fullscreen']:[]),...(permissions.orientationLock?['screen-wake-lock']:[])].join('; ');
  const orientation=game.orientation==='portrait'?'portrait':'landscape';
  const body=url
    ?`<div class="game-stage game-player-shell game-orientation-${orientation}" data-game-shell><iframe id="game-frame" title="${escapeHtml(game.title)}" src="${escapeHtml(url)}" sandbox="${sandbox}" allow="${allow}"></iframe><button class="game-fullscreen-button" data-game-fullscreen type="button" aria-label="Rotate screen to landscape" title="Rotate screen to landscape">↻</button><p class="game-rotate-hint" data-rotate-hint>For the best experience, rotate your device to landscape.</p></div>`
    :`<div class="game-stage game-player-shell game-orientation-${orientation}" data-game-shell><div class="empty"><h3>Game runtime unavailable</h3><p>This title needs an approved hosted build.</p></div></div>`;
  const playerModal=modal(game.title,`${body}<div class="game-toolbar"><span class="muted">${guestFree?'Guest free play':'Secure isolated player'}</span><button class="button secondary" data-close-game type="button">Exit game</button></div>`,{wide:true});
  playerModal.classList.add('game-modal');
  playerModal.closest('.modal-backdrop')?.classList.add('game-modal-backdrop');
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
  const shell=document.querySelector('[data-game-shell]');
  const mobile=window.matchMedia('(max-width: 699px) and (pointer: coarse)').matches;
  let enteredFullscreen=false;
  const enterMobileFullscreen=async()=>{
    if(!mobile||!shell)return;
    try{
      if(document.fullscreenElement!==shell&&shell.requestFullscreen){
        await shell.requestFullscreen({navigationUI:'hide'});
        enteredFullscreen=true;
      }
    }catch{/* Fullscreen is unavailable on some mobile browsers. */}
    try{
      if(screen.orientation?.lock)await screen.orientation.lock('landscape');
    }catch{/* Orientation lock is optional and unsupported on some iOS browsers. */}
    shell.classList.add('mobile-game-active');
  };
  const leaveMobileFullscreen=async()=>{
    shell?.classList.remove('mobile-game-active');
    try{if(screen.orientation?.unlock)screen.orientation.unlock();}catch{/* ignore unsupported unlock */}
    if(enteredFullscreen&&document.fullscreenElement){
      try{await document.exitFullscreen();}catch{/* browser may already have exited */}
    }
  };
  document.querySelector('[data-game-fullscreen]')?.addEventListener('click',()=>{
    if(document.fullscreenElement)void leaveMobileFullscreen();
    else void enterMobileFullscreen();
  });
  const fullscreenButton=document.querySelector('[data-game-fullscreen]');
  const syncFullscreenButton=()=>{
    if(!fullscreenButton)return;
    const active=Boolean(document.fullscreenElement);
    fullscreenButton.textContent=active?'↙':'↻';
    fullscreenButton.setAttribute('aria-label',active?'Exit fullscreen':'Rotate screen to landscape');
    fullscreenButton.title=active?'Exit fullscreen':'Rotate screen to landscape';
  };
  syncFullscreenButton();
  void enterMobileFullscreen();
  const cleanupFullscreen=()=>{void leaveMobileFullscreen();};
  document.querySelector('[data-close]')?.addEventListener('click',cleanupFullscreen,{once:true});
  document.addEventListener('fullscreenchange',()=>{
    if(!document.fullscreenElement)shell?.classList.remove('mobile-game-active');
    syncFullscreenButton();
  });
}
