const VERSION='1.0';
const inbound=new Set(['ready','loading','score','progress','reward-request','error','exit']);
const outbound=new Set(['init','pause','resume','mute','unmute','destroy']);
const forbidden=new Set(['email','phone','msisdn','payment','card','cnic','address','token','cookie','session']);

function safePayload(value,depth=0){
  if(depth>4)throw new Error('Bridge payload nesting exceeds limit.');
  if(value===null||['string','number','boolean'].includes(typeof value))return value;
  if(Array.isArray(value)){if(value.length>100)throw new Error('Bridge array exceeds limit.');return value.map(item=>safePayload(item,depth+1));}
  if(value&&typeof value==='object'){const result={};for(const [key,item] of Object.entries(value)){if(forbidden.has(key.toLowerCase()))throw new Error(`Forbidden bridge key: ${key}`);result[key]=safePayload(item,depth+1);}return result;}
  throw new Error('Unsupported bridge payload.');
}
function createMessage(source,type,payload={}){const value={source,version:VERSION,type,payload:safePayload(payload),correlationId:crypto.randomUUID(),timestamp:Date.now()};if(JSON.stringify(value).length>8192)throw new Error('Bridge message exceeds 8 KB.');return value;}

export class GameBridge{
  constructor(iframe,game,onEvent,{readyTimeoutMs=15000}={}){
    this.iframe=iframe;this.game=game;this.onEvent=onEvent;this.started=Date.now();this.ready=false;
    const opaqueSandbox=iframe.hasAttribute('sandbox')&&!iframe.sandbox.contains('allow-same-origin');
    const url=new URL(game.gameUrl||iframe.src,location.href);this.origin=opaqueSandbox?'null':url.origin;this.targetOrigin=opaqueSandbox?'*':url.origin;
    this.receive=this.receive.bind(this);addEventListener('message',this.receive);
    this.timer=setTimeout(()=>{if(!this.ready)this.onEvent?.('error',{code:'bridge_ready_timeout'});},readyTimeoutMs);
  }
  send(type,payload={}){if(!outbound.has(type))throw new Error(`Unsupported host event: ${type}`);this.iframe.contentWindow?.postMessage(createMessage('game-arena',type,payload),this.targetOrigin);}
  receive(event){
    if(event.source!==this.iframe.contentWindow||event.origin!==this.origin)return;const value=event.data;
    if(!value||value.source!=='game-arena-game')return;
    if(value.version!==VERSION){this.onEvent?.('error',{code:'unsupported_bridge_version'});return;}
    if(!inbound.has(value.type)||typeof value.correlationId!=='string'||value.correlationId.length<8||value.correlationId.length>100)return;
    try{const payload=safePayload(value.payload||{});if(value.type==='ready'){this.ready=true;clearTimeout(this.timer);}this.onEvent?.(value.type,payload,{correlationId:value.correlationId,timestamp:Number(value.timestamp)||Date.now()});}catch{this.onEvent?.('error',{code:'invalid_bridge_payload'});}
  }
  init(context){this.send('init',{gameId:this.game.id,gameVersion:this.game.version||'external',locale:'en-PK',...context});}
  pause(){this.send('pause');} resume(){this.send('resume');} mute(){this.send('mute');} unmute(){this.send('unmute');}
  destroy(){clearTimeout(this.timer);try{this.send('destroy');}catch{}removeEventListener('message',this.receive);}
}
