import {hmac,safeEqual,sha256} from './security.mjs';

const ALL_ROLES=new Set(['admin','operator','support','security','finance']);
const fail=(message,status=401,code='admin_authentication_required')=>Object.assign(new Error(message),{status,code});

function normalizeRoles(value){
  const items=Array.isArray(value)?value:String(value||'').split(',');
  return [...new Set(items.map(item=>String(item).trim().toLowerCase()).filter(item=>ALL_ROLES.has(item)))];
}

function authorize(principal,allowedRoles){
  const allowed=new Set(allowedRoles.includes('any')?[...ALL_ROLES]:allowedRoles);
  const role=principal.roles.find(item=>allowed.has(item));
  if(!role)throw fail('Administrative role is not permitted.',403,'admin_forbidden');
  return{actor:`admin:${principal.id}`,identity:principal.id,role,roles:[...principal.roles]};
}

function localPrincipal(req,config){
  if(config.nodeEnv==='production'||config.adminAuthMode!=='local-key')throw fail('Local administrator keys are disabled.');
  const key=String(req.headers['x-admin-key']||'');
  if(!key)throw fail('Administrative authentication required.');
  const principal=config.adminPrincipals.find(item=>safeEqual(item.key,key));
  if(!principal)throw fail('Administrative authentication required.');
  return principal;
}

function signedPrincipal(req,config){
  if(config.adminAuthMode!=='signed-headers'||!config.adminProxySecret)throw fail('Administrative identity proxy is not configured.');
  const identity=String(req.headers['x-admin-identity']||'').trim();
  const roles=normalizeRoles(req.headers['x-admin-roles']);
  const issuedAt=Number(req.headers['x-admin-issued-at']);
  const signature=String(req.headers['x-admin-signature']||'');
  if(!/^[a-z0-9][a-z0-9_.:@-]{2,127}$/i.test(identity)||!roles.length||!Number.isFinite(issuedAt)||!signature)throw fail('Administrative authentication required.');
  if(Math.abs(Date.now()-issuedAt)>config.adminProxyMaxSkewSeconds*1000)throw fail('Administrator proxy assertion expired.');
  const canonical=`${identity}\n${roles.slice().sort().join(',')}\n${issuedAt}`;
  if(!safeEqual(hmac(config.adminProxySecret,canonical),signature.toLowerCase()))throw fail('Administrative authentication required.');
  const mapped=config.adminIdentityRoles[identity];
  const effective=mapped?.length?roles.filter(role=>mapped.includes(role)):[];
  if(!effective.length)throw fail('Administrative identity is not authorized.',403,'admin_forbidden');
  return{id:sha256(identity).slice(0,24),roles:effective};
}

export function authenticateAdmin(req,config,allowedRoles=['admin']){
  const principal=config.adminAuthMode==='signed-headers'?signedPrincipal(req,config):localPrincipal(req,config);
  return authorize(principal,allowedRoles);
}

export function signAdminAssertion({identity,roles,issuedAt=Date.now(),secret}){
  const normalized=normalizeRoles(roles).sort();
  return hmac(secret,`${identity}\n${normalized.join(',')}\n${issuedAt}`);
}
