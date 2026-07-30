export const VERSION='1.0';
export const HOST_EVENTS=new Set(['init','pause','resume','mute','unmute','destroy']);
export const GAME_EVENTS=new Set(['ready','loading','score','progress','reward-request','error','exit']);
const FORBIDDEN_KEYS=new Set(['email','phone','msisdn','payment','card','cnic','address','token','cookie','session']);

function clean(value,depth=0){
  if(depth>4)throw new Error('Payload nesting exceeds limit.');
  if(value===null||typeof value==='boolean'||typeof value==='number'||typeof value==='string')return value;
  if(Array.isArray(value)){if(value.length>100)throw new Error('Payload array exceeds limit.');return value.map(item=>clean(item,depth+1));}
  if(value&&typeof value==='object'){
    const result={};for(const [key,item] of Object.entries(value)){if(FORBIDDEN_KEYS.has(key.toLowerCase()))throw new Error(`Forbidden telemetry key: ${key}`);result[key]=clean(item,depth+1);}return result;
  }
  throw new Error('Unsupported payload value.');
}

export function createMessage({source,type,payload={},correlationId=crypto.randomUUID(),timestamp=Date.now()}){
  const allowed=source==='game-arena'?HOST_EVENTS:source==='game-arena-game'?GAME_EVENTS:null;
  if(!allowed||!allowed.has(type))throw new Error(`Unsupported bridge event: ${type}`);
  const safePayload=clean(payload);const message={source,version:VERSION,type,payload:safePayload,correlationId,timestamp};
  if(JSON.stringify(message).length>8192)throw new Error('Bridge message exceeds 8 KB.');return message;
}

export function parseMessage(value,{source,events}){
  if(!value||typeof value!=='object'||value.source!==source)return{ok:false,reason:'invalid_source'};
  if(value.version!==VERSION)return{ok:false,reason:'unsupported_version'};
  if(!events.has(value.type))return{ok:false,reason:'unsupported_event'};
  if(typeof value.correlationId!=='string'||value.correlationId.length<8||value.correlationId.length>100)return{ok:false,reason:'invalid_correlation_id'};
  try{return{ok:true,value:createMessage({source,type:value.type,payload:value.payload,correlationId:value.correlationId,timestamp:Number(value.timestamp)||Date.now()})};}catch(error){return{ok:false,reason:error.message};}
}
