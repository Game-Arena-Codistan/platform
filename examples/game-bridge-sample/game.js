import {GameClient} from '../../packages/game-bridge/src/index.js';
const params=new URLSearchParams(location.search);const hostOrigin=params.get('hostOrigin')||'http://localhost:8080';let score=0;let started=Date.now();let muted=false;
const status=document.querySelector('#status');const output=document.querySelector('#score');
const bridge=new GameClient({hostOrigin,onEvent(type,payload){
  if(type==='init'){status.textContent=`Ready: ${payload.locale||'en-PK'}`;started=Date.now();}
  if(type==='pause')status.textContent='Paused';
  if(type==='resume')status.textContent='Playing';
  if(type==='mute'){muted=true;status.textContent='Muted';}
  if(type==='unmute'){muted=false;status.textContent='Playing';}
  if(type==='destroy')bridge.destroy();
}});
bridge.announceReady({input:['touch','mouse'],orientation:'any',audio:true});
document.querySelector('#play').addEventListener('click',()=>{score+=1;output.textContent=score;bridge.score(score,{muted});bridge.progress(Math.min(score/10,1));});
document.querySelector('#finish').addEventListener('click',()=>{bridge.requestReward({reason:'game_completion',score,durationMs:Date.now()-started});status.textContent='Reward requested';});
