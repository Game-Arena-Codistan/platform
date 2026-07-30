import {getState,subscribe} from './state.js';
import {observeVitals,observeErrors,track} from './analytics.js';
import {renderFeed,bindFeed} from './views/feed.js';
import {renderLibrary,bindLibrary} from './views/library.js';
import {renderPremium,bindPremium} from './views/premium.js';
import {renderRewards,bindRewards} from './views/rewards.js';
import {renderAccount,bindAccount} from './views/account.js';

const routes={feed:[renderFeed,bindFeed],library:[renderLibrary,bindLibrary],rewards:[renderRewards,bindRewards],premium:[renderPremium,bindPremium],account:[renderAccount,bindAccount]};
const app=document.querySelector('#app');
const balance=document.querySelector('#coin-balance');
const network=document.querySelector('#network-status');
let current='';

function route(){
  const name=location.hash.replace(/^#\//,'').split(/[/?]/)[0]||'feed';
  return routes[name]?name:'feed';
}
function render(force=false){
  const name=route();
  if(force||name!==current){
    current=name;
    const [view,bind]=routes[name];
    app.innerHTML=view();
    bind?.();
    document.querySelectorAll('[data-route]').forEach(link=>link.classList.toggle('active',link.dataset.route===name));
    app.focus({preventScroll:true});
    track('route_view',{route:name});
  }
  const state=getState();
  balance.textContent=Number(state.coins||0).toLocaleString('en-PK');
  document.querySelector('#profile-button').textContent=state.user?'P1':'GA';
}
function setNetwork(){const online=navigator.onLine;network.textContent=online?'Online':'Offline';network.classList.toggle('offline',!online);}

addEventListener('hashchange',()=>render());
addEventListener('online',setNetwork);
addEventListener('offline',setNetwork);
document.querySelector('#profile-button').addEventListener('click',()=>location.hash='#/account');
document.querySelector('#coins-button').addEventListener('click',()=>location.hash='#/rewards');
subscribe(()=>render(true));
observeVitals();
observeErrors();
setNetwork();
if(!location.hash)location.replace('#/feed');else render();
if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
