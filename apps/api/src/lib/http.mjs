const SECURITY_HEADERS={
  'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=()',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};
export function send(res,status,payload,headers={}){const body=payload===null?'':JSON.stringify(payload);res.writeHead(status,{...SECURITY_HEADERS,'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(body);}
export function redirect(res,status,location){res.writeHead(status,{...SECURITY_HEADERS,location,'cache-control':'no-store'});res.end();}
export function problem(res,error,requestId){const status=error.status??500;send(res,status,{error:{code:error.code??(status>=500?'internal_error':'request_error'),message:status>=500?'Unexpected server error.':error.message,requestId,details:status<500?error.details:undefined}});}
export async function readRaw(req,maxBytes=32768){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>maxBytes)throw Object.assign(new Error('Request body is too large.'),{status:413,code:'payload_too_large'});chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
export async function readJson(req,maxBytes=32768){const raw=await readRaw(req,maxBytes);if(!raw)return{value:{},raw:''};try{return{value:JSON.parse(raw),raw};}catch{throw Object.assign(new Error('Malformed JSON.'),{status:400,code:'invalid_json'});}}
export async function readPayload(req,maxBytes=32768){const raw=await readRaw(req,maxBytes);const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();if(!raw)return{value:{},raw:''};if(type==='application/x-www-form-urlencoded')return{value:Object.fromEntries(new URLSearchParams(raw)),raw};if(type==='application/json'||type==='')try{return{value:JSON.parse(raw),raw};}catch{throw Object.assign(new Error('Malformed JSON.'),{status:400,code:'invalid_json'});}throw Object.assign(new Error('Unsupported content type.'),{status:415,code:'unsupported_media_type'});}
export function corsHeaders(origin,allowed=[]){return origin&&allowed.includes(origin)?{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','vary':'Origin'}:{};}
