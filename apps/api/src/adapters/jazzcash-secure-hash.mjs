import {createHmac} from 'node:crypto';
import {safeEqual} from '../lib/security.mjs';

/** JazzCash 2026 orchestrator SecureHash (ASCII field-name sort, no trailing &). */
export function jazzCashSecureHash(fields, integritySalt){
  const values=Object.entries(fields||{})
    .filter(([key,value])=>key!=='pp_SecureHash'&&key.startsWith('pp_')&&String(value??'').trim().length>0)
    .sort(([left],[right])=>(left<right?-1:left>right?1:0))
    .map(([,value])=>String(value).trim());
  const message=[integritySalt,...values].join('&');
  return createHmac('sha256',integritySalt).update(message,'utf8').digest('hex').toUpperCase();
}

export function verifyJazzCashSecureHash(fields, integritySalt){
  const provided=String(fields?.pp_SecureHash??'').trim().toUpperCase();
  if(!provided||!integritySalt)return false;
  return safeEqual(jazzCashSecureHash(fields,integritySalt),provided);
}
