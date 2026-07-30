import {createMessage,parseMessage,GAME_EVENTS,HOST_EVENTS,VERSION} from './schema.js';

export class GameClient{
  constructor({hostOrigin,parentWindow=window.parent,onEvent=()=>{}}){
    if(!hostOrigin)throw new Error('hostOrigin is required.');this.hostOrigin=new URL(hostOrigin).origin;this.parentWindow=parentWindow;this.onEvent=onEvent;this.ready=false;this.receive=this.receive.bind(this);addEventListener('message',this.receive);
  }
  receive(event){if(event.source!==this.parentWindow||event.origin!==this.hostOrigin)return;const parsed=parseMessage(event.data,{source:'game-arena',events:HOST_EVENTS});if(!parsed.ok){if(parsed.reason==='unsupported_version')this.emit('error',{code:'unsupported_bridge_version'});return;}this.onEvent(parsed.value.type,parsed.value.payload,parsed.value);}
  emit(type,payload={}){const message=createMessage({source:'game-arena-game',type,payload});this.parentWindow.postMessage(message,this.hostOrigin);return message.correlationId;}
  announceReady(capabilities={}){this.ready=true;return this.emit('ready',{capabilities});}
  score(score,meta={}){if(!Number.isFinite(score)||score<0)throw new Error('Score must be a non-negative number.');return this.emit('score',{score,...meta});}
  progress(value,meta={}){if(!Number.isFinite(value)||value<0||value>1)throw new Error('Progress must be 0–1.');return this.emit('progress',{value,...meta});}
  requestReward({reason,score,durationMs,challengeId}){return this.emit('reward-request',{reason:String(reason||'game_completion').slice(0,40),score:Number(score)||0,durationMs:Number(durationMs)||0,...(challengeId?{challengeId}: {})});}
  destroy(){removeEventListener('message',this.receive);}
}

export class HostClient{
  constructor({iframe,gameOrigin,onEvent=()=>{},readyTimeoutMs=15000}){
    if(!iframe||!gameOrigin)throw new Error('iframe and gameOrigin are required.');this.iframe=iframe;this.gameOrigin=new URL(gameOrigin).origin;this.onEvent=onEvent;this.ready=false;this.receive=this.receive.bind(this);addEventListener('message',this.receive);this.timer=setTimeout(()=>{if(!this.ready)this.onEvent('error',{code:'bridge_ready_timeout'});},readyTimeoutMs);
  }
  receive(event){if(event.source!==this.iframe.contentWindow||event.origin!==this.gameOrigin)return;const parsed=parseMessage(event.data,{source:'game-arena-game',events:GAME_EVENTS});if(!parsed.ok){if(parsed.reason==='unsupported_version')this.onEvent('error',{code:'unsupported_bridge_version'});return;}if(parsed.value.type==='ready'){this.ready=true;clearTimeout(this.timer);}this.onEvent(parsed.value.type,parsed.value.payload,parsed.value);}
  send(type,payload={}){const message=createMessage({source:'game-arena',type,payload});this.iframe.contentWindow?.postMessage(message,this.gameOrigin);return message.correlationId;}
  init(context){return this.send('init',context);} pause(){return this.send('pause');} resume(){return this.send('resume');} mute(){return this.send('mute');} unmute(){return this.send('unmute');}
  destroy(){clearTimeout(this.timer);try{this.send('destroy');}finally{removeEventListener('message',this.receive);}}
}

export {createMessage,parseMessage,GAME_EVENTS,HOST_EVENTS,VERSION};
