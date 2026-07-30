import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export const sha256=value=>createHash('sha256').update(String(value)).digest('hex');
export const randomToken=(bytes=24)=>randomBytes(bytes).toString('base64url');
export const sixDigitCode=()=>String(Number.parseInt(randomBytes(4).toString('hex'),16)%1000000).padStart(6,'0');
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
export function parseCookies(header=''){return Object.fromEntries(header.split(';').map(item=>item.trim()).filter(Boolean).map(item=>{const index=item.indexOf('=');return[decodeURIComponent(item.slice(0,index)),decodeURIComponent(item.slice(index+1))];}));}
export function sessionCookie(name,value,ttl,secure){return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure?'; Secure':''}`;}
export function clearCookie(name,secure){return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`;}
