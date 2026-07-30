import {createHash,createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
export const sha256=value=>createHash('sha256').update(String(value)).digest('hex');
export const randomToken=(bytes=24)=>randomBytes(bytes).toString('base64url');
export const sixDigitCode=()=>String(randomInt(0,1000000)).padStart(6,'0');
export function safeEqual(left,right){const a=Buffer.from(String(left));const b=Buffer.from(String(right));return a.length===b.length&&timingSafeEqual(a,b);}
export function hmac(secret,value){return createHmac('sha256',secret).update(value).digest('hex');}
export function normalizeIdentifier(value){
  const raw=String(value??'').trim().toLowerCase();
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))return{type:'email',value:raw};
  const digits=raw.replace(/\D/g,'');
  if(/^03\d{9}$/.test(digits))return{type:'phone',value:`+92${digits.slice(1)}`};
  if(/^923\d{9}$/.test(digits))return{type:'phone',value:`+${digits}`};
  throw Object.assign(new Error('Enter a valid Pakistani mobile number or email.'),{status:400,code:'invalid_identifier'});
}
export function parseCookies(header=''){return Object.fromEntries(header.split(';').map(item=>item.trim()).filter(Boolean).map(item=>{const index=item.indexOf('=');if(index<1)return['',''];return[decodeURIComponent(item.slice(0,index)),decodeURIComponent(item.slice(index+1))];}).filter(([key])=>key));}
export function sessionCookie(name,value,ttl,secure){return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure?'; Secure':''}`;}
export function csrfCookie(name,value,ttl,secure){return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Strict; Max-Age=${ttl}${secure?'; Secure':''}`;}
export function clearCookie(name,secure,httpOnly=true){return `${name}=; Path=/; ${httpOnly?'HttpOnly; ':''}SameSite=Lax; Max-Age=0${secure?'; Secure':''}`;}
export function requestIp(req){const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();return forwarded||req.socket?.remoteAddress||'unknown';}
export function deviceFingerprint(req){return sha256([String(req.headers['user-agent']||'').slice(0,300),String(req.headers['sec-ch-ua-platform']||''),String(req.headers['x-device-id']||'')].join('|'));}
export function assertCsrf(req,config){const cookies=parseCookies(req.headers.cookie);const cookie=cookies[config.csrfCookieName];const header=req.headers['x-csrf-token'];if(!cookie||!header||!safeEqual(cookie,header))throw Object.assign(new Error('Request verification failed.'),{status:403,code:'csrf_failed'});}
