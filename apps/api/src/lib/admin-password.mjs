import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
const options={N:32768,r:8,p:3,maxmem:64*1024*1024};
export const ADMIN_HASH_PATTERN=/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{64}$/;
const DUMMY_HASH='scrypt-v1:'+('0'.repeat(32))+':'+('0'.repeat(64));
export async function hashAdminPassword(password){
  if(typeof password!=='string'||password.length<16||password.length>256)throw new Error('Administrator password must contain 16–256 characters.');
  const salt=randomBytes(16).toString('hex');
  const derived=await derive(password,salt,32,options);
  return 'scrypt-v1:'+salt+':'+Buffer.from(derived).toString('hex');
}
export async function verifyAdminPassword(password,stored){
  const valid=typeof stored==='string'&&ADMIN_HASH_PATTERN.test(stored);
  const [,salt,hex]=(valid?stored:DUMMY_HASH).split(':');
  const bounded=typeof password==='string'&&password.length<=256;
  const actual=await derive(bounded?password:'invalid',salt,32,options);
  const same=timingSafeEqual(Buffer.from(actual),Buffer.from(hex,'hex'));
  return valid&&bounded&&same;
}
export function adminPasswordHashes(value){
  if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('Invalid ADMIN_PASSWORD_HASHES_JSON');
  const result=Object.create(null);
  for(const [email,hash] of Object.entries(value)){
    if(email!==email.toLowerCase()||email.length>128||!/^[a-z0-9][a-z0-9_.+@-]*@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)||!ADMIN_HASH_PATTERN.test(hash))throw new Error('Invalid ADMIN_PASSWORD_HASHES_JSON');
    result[email]=hash;
  }
  return Object.freeze(result);
}
