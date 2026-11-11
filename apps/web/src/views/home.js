import {getGames,getGenres} from '../catalogue-runtime.js';
import {premiumFeatures} from '../data.js';
import {escapeHtml,money} from '../ui.js';
import {openGame} from '../game-player.js';
import {track} from '../analytics.js';

const FEATURES=[
  {icon:'⚡',title:'Instant play',body:'Launch HTML5 games directly in the browser.',tone:'play'},
  {icon:'⌕',title:'Genre discovery',body:'Browse active genre groups and save favourites.',tone:'discover',dynamic:true},
  {icon:'♟',title:'Multiplayer',body:'Create or join game rooms from the competition hub.',tone:'multi'},
  {icon:'🏆',title:'Tournaments',body:'Join open events and follow verified leaderboard scores.',tone:'cup'},
  {icon:'◉',title:'Rewards',body:'Collect Arena Coins from verified play and challenges.',tone:'coin'},
  {icon:'🎟',title:'Vouchers & top-ups',body:'Redeem offers and access member discounts when enabled.',tone:'voucher'}
];

function gameCard(game){
  return `<article class="spotlight-card" data-reveal style="--art:${game.art}"><div class="spotlight-copy"><span class="badge ${game.tier==='premium'?'premium':''}">${game.tier==='premium'?'Arena+':'Free'}</span>${game.multiplayer?'<span class="badge">Multiplayer</span>':''}<h3>${escapeHtml(game.title)}</h3><button class="text-link game-card-see-more" type="button" data-home-see-more="${escapeHtml(game.id)}" aria-expanded="false">See more...</button><p class="game-card-desc" hidden>${escapeHtml(game.description)}</p><button class="button primary" data-home-play="${game.id}" type="button">Play now</button></div></article>`;
}

function featureCard(item,genreCount){
  const body=item.dynamic?`Browse ${genreCount} active genre groups and save favourites.`:item.body;
  return `<article class="feature-card feature-card--${item.tone}" data-reveal>
    <div class="feature-card-copy"><span class="feature-icon" aria-hidden="true">${item.icon}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(body)}</p></div>
    <div class="feature-card-art" aria-hidden="true"></div>
  </article>`;
}

export function renderHome(){
  const games=getGames();
  const genres=getGenres();
  const featured=games.slice(0,6);
  const genreCount=Math.max(genres.length-1,1);
  return `<section class="home-page">
  <section class="home-hero" data-reveal>
    <div class="home-hero-copy">
      <p class="home-brand-mark"><img src="/assets/logo.svg" alt="" width="28" height="28"><span>Game Arena</span></p>
      <h1>Your hub for online <span class="accent-underline">gaming.</span></h1>
      <p class="home-hero-lead">Play popular games, join tournaments and unlock exclusive experiences.</p>
      <div class="hero-actions">
        <a class="button lime" href="#/feed"><span aria-hidden="true">▶</span> Play now</a>
        <a class="button ghost" href="#/library"><span aria-hidden="true">🎮</span> Explore Arena+</a>
      </div>
    </div>
    <div class="home-hero-visual" data-reveal style="--reveal-delay:120ms">
      <img class="home-hero-image" src="/assets/home/hero-banner.jpeg" alt="Game Arena player celebrating with headphones and featured games" width="960" height="720" decoding="async" fetchpriority="high">
      <div class="home-float home-float--crown" aria-hidden="true">♛</div>
    </div>
  </section>

  <section class="section-block home-featured" data-reveal>
    <header class="section-head"><div><span class="eyebrow">Featured now</span><h2>Find your next game</h2></div><a href="#/library">View all games →</a></header>
    <div class="spotlight-grid">${featured.map(gameCard).join('')}</div>
  </section>

  <section class="home-about" data-reveal>
    <div class="home-about-copy">
      <p class="eyebrow cyan-line">About Game Arena</p>
      <h2>One arena. Endless <span class="text-gold">play.</span></h2>
      <p>Discover games, challenge friends and join the action.</p>
    </div>
    <div class="home-about-visual" data-reveal style="--reveal-delay:100ms">
      <img src="/assets/home/about-banner.jpeg" alt="Game Arena collage with controller, portal and tournament icons" width="960" height="640" loading="lazy" decoding="async">
    </div>
  </section>

  <section class="section-block home-features" data-reveal>
    <div class="home-features-bg" aria-hidden="true"></div>
    <header class="section-head home-features-head">
      <div>
        <span class="eyebrow cyan-line center">Everything in one arena</span>
        <h2>Built for playing, <span class="text-gold underline-gold">not waiting.</span></h2>
      </div>
    </header>
    <div class="feature-showcase">${FEATURES.map(item=>featureCard(item,genreCount)).join('')}</div>
  </section>

  <section class="section-block premium-banner" data-reveal>
    <div><span class="eyebrow">Game Arena+</span><h2>Unlock the full Game Arena catalogue.</h2><p>${premiumFeatures.slice(0,4).join(' · ')}</p></div>
    <div class="premium-price"><strong>${money(599)}</strong><small>monthly JazzCash</small><a class="button gold" href="#/library">See plans</a></div>
  </section>

  <section class="section-block steps" data-reveal>
    <header class="section-head"><div><span class="eyebrow">Simple activation</span><h2>Four steps to premium</h2></div></header>
    <div class="step-grid">
      <article data-reveal><b>1</b><h3>Select plan</h3><p>Choose monthly or yearly access.</p></article>
      <article data-reveal><b>2</b><h3>Pay via JazzCash</h3><p>Continue to the provider's secure checkout.</p></article>
      <article data-reveal><b>3</b><h3>Premium activates</h3><p>The server confirms payment and entitlement.</p></article>
      <article data-reveal><b>4</b><h3>Benefits unlock</h3><p>Premium games, tournaments and stronger rewards become available.</p></article>
    </div>
  </section>
</section>`;
}

export function bindHome(){
  const games=getGames();
  document.querySelectorAll('[data-home-see-more]').forEach(button=>button.addEventListener('click',event=>{
    event.stopPropagation();
    const card=button.closest('.spotlight-card');
    const desc=card?.querySelector('.game-card-desc');
    if(!card||!desc)return;
    const open=desc.hasAttribute('hidden');
    if(open)desc.removeAttribute('hidden');
    else desc.setAttribute('hidden','');
    card.classList.toggle('is-desc-open',open);
    button.setAttribute('aria-expanded',String(open));
    button.textContent=open?'See less':'See more...';
  }));
  document.querySelectorAll('[data-home-play]').forEach(button=>button.addEventListener('click',()=>{
    const game=games.find(item=>item.id===button.dataset.homePlay);
    track('game_play_intent',{source:'home',gameId:game?.id});
    openGame(game);
  }));
}
