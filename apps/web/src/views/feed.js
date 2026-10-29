import {getGames} from '../catalogue-runtime.js';
import {getState,toggleFavourite,isPremium} from '../state.js';
import {escapeHtml} from '../ui.js';
import {track} from '../analytics.js';
import {openGame} from '../game-player.js';

function slide(game){
  const locked=game.tier==='premium'&&!isPremium();
  const favourite=getState().favourites.includes(game.id);
  return `<article class="feed-slide" data-game="${game.id}" style="--art:${game.art}"><div class="feed-content"><div class="feed-meta"><span class="badge">${escapeHtml(game.genre)}</span>${game.preview?'<span class="badge">Playable preview</span>':''}${game.tier==='premium'?'<span class="badge premium">Game Arena+</span>':''}<span class="badge">+${game.reward} coins</span></div><h1>${escapeHtml(game.title)}</h1><p>${escapeHtml(game.description)}</p><div class="feed-actions"><button class="button ${locked?'gold':'primary'}" data-play="${game.id}" type="button">${locked?'Unlock with Arena+':'Play now'}</button><button class="button secondary" data-favourite="${game.id}" type="button" aria-pressed="${favourite}">${favourite?'★ Saved':'☆ Save'}</button></div></div></article>`;
}

export function renderFeed(){
  return `<section class="feed" aria-label="Game discovery feed">${getGames().map(slide).join('')}</section>`;
}

export function bindFeed(){
  const games=getGames();
  const root=document.querySelector('.feed');
  root.querySelectorAll('[data-favourite]').forEach(button=>button.addEventListener('click',()=>{
    toggleFavourite(button.dataset.favourite);
    button.textContent=getState().favourites.includes(button.dataset.favourite)?'★ Saved':'☆ Save';
    button.setAttribute('aria-pressed',String(getState().favourites.includes(button.dataset.favourite)));
  }));
  root.querySelectorAll('[data-play]').forEach(button=>button.addEventListener('click',async()=>{
    const game=games.find(item=>item.id===button.dataset.play);
    if(!game)return;
    await openGame(game);
  }));
  if('IntersectionObserver'in window){
    const seen=new Set();
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting&&!seen.has(entry.target.dataset.game)){
        seen.add(entry.target.dataset.game);
        track('game_impression',{gameId:entry.target.dataset.game});
      }
    }),{root,threshold:.65});
    root.querySelectorAll('[data-game]').forEach(node=>observer.observe(node));
  }
}
