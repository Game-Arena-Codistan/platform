import {getGames,getGenres} from '../catalogue-runtime.js';
import {getState,isPremium,hasPendingGuestPremium} from '../state.js';
import {plans as legacyPlans,premiumFeatures} from '../data.js';
import {escapeHtml,money,openAuth} from '../ui.js';
import {openGame} from '../game-player.js';
import {defaultLandingHref} from '../landing-campaign.js';
import {track} from '../analytics.js';

let query='';
let genre='All';
let tab='all';

function canBrowseFullCatalogue(){
  return isPremium()||hasPendingGuestPremium();
}

function needsPlans(){
  return !canBrowseFullCatalogue();
}

function filtered(){
  const state=getState();
  const games=getGames();
  let list=games.filter(game=>(genre==='All'||game.genre===genre)&&(`${game.title} ${game.description} ${game.genre}`.toLowerCase().includes(query.toLowerCase())));
  if(tab==='recent')list=state.recent.map(id=>list.find(game=>game.id===id)).filter(Boolean);
  return list;
}

function card(game){
  const pendingGuest=hasPendingGuestPremium();
  const needsAuth=game.tier==='premium'&&pendingGuest&&!getState().user;
  const needsPurchase=game.tier==='premium'&&!canBrowseFullCatalogue();
  const locked=needsAuth||needsPurchase;
  const actionLabel=needsAuth?'Sign in':needsPurchase?'Unlock':'Play';
  return `<article class="card game-card" style="--art:${game.art}"><div class="game-card-shade"></div><div class="badge-row game-card-badges"><span class="badge ${game.tier==='premium'?'premium':''}">${game.tier==='premium'?'Premium':'Free'}</span>${game.multiplayer?'<span class="badge">Multiplayer</span>':''}</div><div class="game-card-content"><h2>${escapeHtml(game.title)}</h2><button class="text-link game-card-see-more" type="button" data-see-more="${escapeHtml(game.id)}" aria-expanded="false">See more...</button><p class="game-card-desc" data-desc-for="${escapeHtml(game.id)}" hidden>${escapeHtml(game.description)}</p><div class="game-actions"><button class="button ${locked?'gold':'primary'}" data-play="${game.id}" type="button">${actionLabel}</button></div></div></article>`;
}

function planCard(plan){
  const recommended=Boolean(plan.recommended);
  const comingSoon=Boolean(plan.comingSoon||plan.status==='coming_soon');
  const href=defaultLandingHref(plan.id);
  return `<article class="card plan ${recommended?'recommended':''}">${recommended?'<span class="badge premium">Best value</span>':''}<h2>${escapeHtml(plan.name)}</h2><div class="price">${money(plan.price)} <small>/ ${escapeHtml(plan.period)}</small></div><p class="muted">${escapeHtml(comingSoon?'Coming soon.':plan.description)}</p>${comingSoon
    ?`<button class="button secondary" type="button" disabled>Coming soon</button>`
    :`<a class="button ${recommended?'gold':'primary'}" href="${href}" data-library-plan="${escapeHtml(plan.id)}">Choose ${escapeHtml(plan.name)}</a>`}</article>`;
}

function renderPlansSection(){
  if(!needsPlans())return '';
  return `<section class="library-plans" aria-label="Premium plans"><header class="section-head"><div><span class="eyebrow">Premium</span><h2>Choose a plan to unlock premium games</h2><p>Pay with JazzCash first${getState().user?'':', then sign in with the same number'}. Includes ${premiumFeatures.slice(0,3).join(', ').toLowerCase()} and more.</p></div></header><div class="plan-grid">${legacyPlans.map(planCard).join('')}</div></section>`;
}

function headerCopy(){
  if(hasPendingGuestPremium()){
    return {
      title:'Your premium catalogue is ready',
      body:'All 60 games are listed. Free titles play now — sign in with your JazzCash number to play Premium games.',
      cta:`<button class="button gold" id="library-signin" type="button">Sign up / Sign in</button>`
    };
  }
  if(isPremium()){
    return {
      title:'Discover your next game',
      body:'Search, save, revisit and launch games from one mobile-first library.',
      cta:'<a class="button secondary" href="#/feed">Open swipe feed</a>'
    };
  }
  return {
    title:'Discover your next game',
    body:'10 free games for guests. Unlock the full Premium catalogue.',
    cta:''
  };
}

export function renderLibrary(){
  const games=getGames();
  const genres=getGenres();
  const list=filtered();
  const head=headerCopy();
  return `<section class="page"><header class="page-head"><div><span class="eyebrow">Games catalogue</span><h1>${head.title}</h1><p>${head.body}</p></div>${head.cta}</header>${renderPlansSection()}<div class="tab-row" data-library-games role="tablist"><button class="chip ${tab==='all'?'active':''}" data-tab="all">All</button><button class="chip ${tab==='recent'?'active':''}" data-tab="recent">Recent</button></div><div class="searchbar"><input id="game-search" type="search" value="${escapeHtml(query)}" placeholder="Search ${games.length} games" aria-label="Search games"></div><div class="chip-row" aria-label="Genres">${genres.map(item=>`<button class="chip ${item===genre?'active':''}" data-genre="${item}" type="button">${escapeHtml(item)}</button>`).join('')}</div><div id="library-grid" class="grid">${list.map(card).join('')}</div><div id="library-empty" class="empty" ${list.length?'hidden':''}><h3>No games here yet</h3><p>Try another filter or play a game to build your recent list.</p></div></section>`;
}

export function bindLibrary(){
  const root=document.querySelector('#app');
  const games=getGames();
  const repaint=()=>{root.innerHTML=renderLibrary();bindLibrary();};
  document.querySelector('#library-signin')?.addEventListener('click',()=>openAuth('signup'));
  document.querySelector('#game-search')?.addEventListener('input',event=>{query=event.target.value;repaint();});
  root.querySelectorAll('[data-genre]').forEach(button=>button.addEventListener('click',()=>{genre=button.dataset.genre;repaint();}));
  root.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.tab;repaint();}));
  root.querySelectorAll('[data-see-more]').forEach(button=>button.addEventListener('click',event=>{
    event.stopPropagation();
    const card=button.closest('.game-card');
    const desc=card?.querySelector('.game-card-desc');
    if(!card||!desc)return;
    const open=desc.hasAttribute('hidden');
    if(open)desc.removeAttribute('hidden');
    else desc.setAttribute('hidden','');
    card.classList.toggle('is-desc-open',open);
    button.setAttribute('aria-expanded',String(open));
    button.textContent=open?'See less':'See more...';
  }));
  root.querySelectorAll('[data-play]').forEach(button=>button.addEventListener('click',()=>openGame(games.find(item=>item.id===button.dataset.play))));
  root.querySelectorAll('[data-library-plan]').forEach(link=>link.addEventListener('click',()=>{
    track('plan_select',{planId:link.dataset.libraryPlan,source:'library'});
  }));
  track('route_view',{route:'library'});
}
