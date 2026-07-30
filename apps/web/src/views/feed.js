import {games} from '../data.js';
import {getState,toggleFavourite,isPremium,addRecent} from '../state.js';
import {escapeHtml,requireAuth,toast} from '../ui.js';
import {gameUrl} from '../api.js';
import {track} from '../analytics.js';
import {GameBridge} from '../game-bridge.js';

function slide(game){
  const locked=game.tier==='premium'&&!isPremium();
  const favourite=getState().favourites.includes(game.id);
  return `<article class="feed-slide" data-game="${game.id}" style="--art:${game.art}"><div class="feed-content"><div class="feed-meta"><span class="badge">${escapeHtml(game.genre)}</span>${game.tier==='premium'?'<span class="badge premium">Game Arena+</span>':''}<span class="badge">+${game.reward} coins</span></div><h1>${escapeHtml(game.title)}</h1><p>${escapeHtml(game.description)}</p><div class="feed-actions"><button class="button ${locked?'gold':'primary'}" data-play="${game.id}" type="button">${locked?'Unlock with Arena+':'Play now'}</button><button class="button secondary" data-favourite="${game.id}" type="button" aria-pressed="${favourite}">${favourite?'★ Saved':'☆ Save'}</button></div></div></article>`;
}

export function renderFeed(){return `<section class="feed" aria-label="Game discovery feed">${games.map(slide).join('')}</section>`;}

export function bindFeed(){
  const root=document.querySelector('.feed');
  root.querySelectorAll('[data-favourite]').forEach(button=>button.addEventListener('click',()=>{toggleFavourite(button.dataset.favourite);button.textContent=getState().favourites.includes(button.dataset.favourite)?'★ Saved':'☆ Save';button.setAttribute('aria-pressed',String(getState().favourites.includes(button.dataset.favourite)));}));
  root.querySelectorAll('[data-play]').forEach(button=>button.addEventListener('click',async()=>{
    const game=games.find(item=>item.id===button.dataset.play);if(!game)return;
    if(game.tier==='premium'&&!isPremium()){track('upgrade_view',{source:'locked_game',gameId:game.id});location.hash='#/premium';return;}
    if(!await requireAuth({type:'game',gameId:game.id}))return;
    openGame(game);
  }));
  if('IntersectionObserver'in window){
    const seen=new Set();const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting&&!seen.has(entry.target.dataset.game)){seen.add(entry.target.dataset.game);track('game_impression',{gameId:entry.target.dataset.game});}}),{root,threshold:.65});
    root.querySelectorAll('[data-game]').forEach(node=>observer.observe(node));
  }
}

function openGame(game){
  addRecent(game.id);track('game_play_intent',{gameId:game.id});
  const url=gameUrl(game);
  const body=url?`<div class="game-stage"><iframe id="game-frame" title="${escapeHtml(game.title)}" src="${escapeHtml(url)}" sandbox="allow-scripts allow-pointer-lock" allow="fullscreen"></iframe></div>`:`<div class="game-stage"><div class="empty"><h3>Game runtime ready</h3><p>Connect the real HTML5 build in the next integration phase.</p><button class="button primary" id="demo-score" type="button">Simulate completed run</button></div></div>`;
  import('../ui.js').then(({modal})=>{modal(game.title,`${body}<p class="muted">Games run in an isolated frame and cannot change your coin balance directly.</p>`);const iframe=document.querySelector('#game-frame');if(iframe){const bridge=new GameBridge(iframe,game,(type)=>{if(type==='ready')track('game_start',{gameId:game.id});if(type==='exit')document.querySelector('[data-close]')?.click();});iframe.addEventListener('load',()=>bridge.init({premium:isPremium()}),{once:true});}document.querySelector('#demo-score')?.addEventListener('click',()=>toast('Run submitted for server validation'));});
}
