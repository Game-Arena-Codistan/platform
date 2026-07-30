const SECURITY_HEADERS={
  'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};
export function send(res,status,payload,headers={}){
  const body=payload===null?'':JSON.stringify(payload);
  res.writeHead(status,{...SECURITY_HEADERS,'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(body);
}
export function problem(res,error,requestId){const status=error.status??500;send(res,status,{error:{code:error.code??(status>=500?'internal_error':'request_error'),message:status>=500?'Unexpected server error.':error.message,requestId}});}
export async function readJson(req,maxBytes=32768){
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>maxBytes)throw Object.assign(new Error('Request body is too large.'),{status:413,code:'payload_too_large'});chunks.push(chunk);}
  const raw=Buffer.concat(chunks).toString('utf8');if(!raw)return{value:{},raw:''};
  try{return{value:JSON.parse(raw),raw};}catch{throw Object.assign(new Error('Malformed JSON.'),{status:400,code:'invalid_json'});}
}
