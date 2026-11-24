import {randomUUID} from 'node:crypto';
import {readJson,send,problem} from './lib/http.mjs';
import {parseCookies,randomToken,requestIp,sha256,safeEqual} from './lib/security.mjs';
import {verifyAdminPassword} from './lib/admin-password.mjs';
import {attachNativeAdminPrincipal} from './lib/admin-auth.mjs';
const SESSION='ga_admin_session',CSRF='ga_admin_csrf',TTL=8*3600;
const fail=(message,status=401,code='admin_authentication_required')=>Object.assign(new Error(message),{status,code});
const header=req=>String(req.headers['x-admin-csrf']||'');
const emailOf=value=>typeof value==='string'?value.trim().toLowerCase().slice(0,128):'';
function cookies(req){try{return parseCookies(req.headers.cookie);}catch{return{};}}
function cookie(name,value,ttl,secure,httpOnly){return name+'='+encodeURIComponent(value)+'; Path=/; SameSite=Strict; Max-Age='+ttl+(httpOnly?'; HttpOnly':'')+(secure?'; Secure':'');}
export function createAdminSessionApp({config,store,clock=()=>Date.now()}){
  const hashes=config.adminPasswordHashes||{};
  const enabled=Object.keys(hashes).length>0;
  const secure=!['development','test'].includes(config.nodeEnv);
  const originAllowed=req=>{const origin=String(req.headers.origin||'');return Boolean(origin)&&config.adminLoginOrigins?.includes(origin)&&(!secure||origin.startsWith('https://'));};
  function current(req){
    const c=cookies(req),token=c[SESSION];
    if(!enabled||!token||!/^[A-Za-z0-9_-]{40,64}$/.test(token))return null;
    const key=sha256(token),record=store.adminSessions.get(key);
    if(!record)return null;
    const hash=Object.hasOwn(hashes,record.email)?hashes[record.email]:null;
    const roles=Object.hasOwn(config.adminIdentityRoles,record.email)?config.adminIdentityRoles[record.email]:[];
    if(!hash||!roles?.length||record.expiresAt<=clock()||!safeEqual(record.credentialVersion,sha256(hash))){
      store.adminSessions.delete(key);return null;
    }
    return {key,record,roles,c};
  }
  function requireCsrf(req,session){
    if(!originAllowed(req)||!session.c[CSRF]||!header(req)||!safeEqual(header(req),session.c[CSRF])||!safeEqual(sha256(header(req)),session.record.csrfHash))throw fail('Request verification failed.',403,'admin_csrf_failed');
  }
  return async function adminSessionApp(req,res){
    const path=new URL(req.url,'http://localhost').pathname,method=req.method||'GET';
    if(!path.startsWith('/v1/admin/'))return false;
    const requestId=String(req.headers['x-request-id']||randomUUID()).slice(0,80);
    try{
      const session=current(req);
      if(path==='/v1/admin/auth/session'&&method==='GET'){
        send(res,200,{enabled,authenticated:Boolean(session),localKeyAllowed:config.nodeEnv!=='production'&&Boolean(config.adminPrincipals?.length)});return true;
      }
      if(path==='/v1/admin/auth/login'&&method==='POST'){
        if(!enabled)throw fail('Administrator password sign-in is unavailable.',403,'admin_login_disabled');
        if(!originAllowed(req))throw fail('Origin is not allowed.',403,'origin_rejected');
        const {value}=await readJson(req,4096);
        const email=emailOf(value.email);
        const ip=sha256(requestIp(req)),id=sha256(email);
        const limitedIp=store.hitRateLimit('admin-login-ip:'+ip,20,900000,clock());
        const limitedId=store.hitRateLimit('admin-login-id:'+id,6,900000,clock());
        if(limitedIp||limitedId)throw fail('Too many sign-in attempts. Try again later.',429,'rate_limited');
        const hash=Object.hasOwn(hashes,email)?hashes[email]:null;
        const roles=Object.hasOwn(config.adminIdentityRoles,email)?config.adminIdentityRoles[email]:[];
        const valid=await verifyAdminPassword(value.password,hash);
        if(!valid||!roles?.length)throw fail('Invalid administrator email or password.',401,'invalid_credentials');
        if(session)store.adminSessions.delete(session.key);
        for(const [key,record] of store.adminSessions)if(record.expiresAt<=clock())store.adminSessions.delete(key);
        const token=randomToken(32),csrf=randomToken(24),key=sha256(token),actor=sha256(email).slice(0,24);
        store.adminSessions.set(key,{id:randomUUID(),email,csrfHash:sha256(csrf),credentialVersion:sha256(hash),createdAt:clock(),expiresAt:clock()+TTL*1000});
        store.audit.write({actor:'admin:'+actor,action:'admin.session_started',targetType:'admin_session',targetId:store.adminSessions.get(key).id,requestId});
        send(res,200,{authenticated:true},{'set-cookie':[cookie(SESSION,token,TTL,secure,true),cookie(CSRF,csrf,TTL,secure,false)]});return true;
      }
      if(path==='/v1/admin/auth/logout'&&method==='POST'){
        if(!session)throw fail('Administrative authentication required.');
        requireCsrf(req,session);store.adminSessions.delete(session.key);
        store.audit.write({actor:'admin:'+sha256(session.record.email).slice(0,24),action:'admin.session_ended',targetType:'admin_session',targetId:session.record.id,requestId});
        send(res,200,{authenticated:false},{'set-cookie':[cookie(SESSION,'',0,secure,true),cookie(CSRF,'',0,secure,false)]});return true;
      }
      if(path.startsWith('/v1/admin/auth/'))throw fail('Not found.',404,'not_found');
      const signed=Boolean(String(req.headers['x-admin-identity']||'').trim()||String(req.headers['x-admin-signature']||'').trim());
      if(session&&!signed){
        if(!['GET','HEAD','OPTIONS'].includes(method))requireCsrf(req,session);
        attachNativeAdminPrincipal(req,{id:sha256(session.record.email).slice(0,24),roles:session.roles});
      }
      return false;
    }catch(error){problem(res,error,requestId);return true;}
  };
}
