const VERSION='1.0';
const inbound=new Set(['ready','loading','score','progress','reward-request','error','exit']);

export class GameBridge{
  constructor(iframe,game,onEvent){
    this.iframe=iframe;this.game=game;this.onEvent=onEvent;this.started=Date.now();
    this.receive=this.receive.bind(this);addEventListener('message',this.receive);
  }
  send(type,payload={}){
    this.iframe.contentWindow?.postMessage({source:'game-arena',version:VERSION,type,payload,correlationId:crypto.randomUUID()},'*');
  }
  receive(event){
    if(event.source!==this.iframe.contentWindow)return;
    const message=event.data;
    if(!message||message.source!=='game-arena-game'||message.version!==VERSION||!inbound.has(message.type))return;
    const serialized=JSON.stringify(message.payload||{});
    if(serialized.length>4096)return;
    this.onEvent?.(message.type,message.payload||{});
  }
  init(context){this.send('init',{gameId:this.game.id,locale:'en-PK',...context});}
  pause(){this.send('pause');}
  resume(){this.send('resume');}
  mute(){this.send('mute');}
  destroy(){this.send('destroy');removeEventListener('message',this.receive);}
}
