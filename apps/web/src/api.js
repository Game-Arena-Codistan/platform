const config={mode:'mock',apiBaseUrl:'',gameOrigin:'',gameHosts:[],releaseSha:'preview',...(window.GAME_ARENA_CONFIG||{})};
const wait=(ms=350)=>new Promise(resolve=>setTimeout(resolve,ms));
const defaultPortfolioHosts=['gamesbundle.codistan.org'];
const allowedGameHosts=new Set([location.hostname,...defaultPortfolioHosts,...(config.gameHosts||[]).map(value=>String(value).trim()).filter(Boolean)]);
function cookie(name){return document.cookie.split(';').map(item=>item.trim()).find(item=>item.startsWith(`${name}=`))?.slice(name.length+1)||'';}
async function request(path,options={}){const method=options.method||'GET';const headers={'content-type':'application/json',...(options.headers||{})};if(!['GET','HEAD','OPTIONS'].includes(method))headers['x-csrf-token']=decodeURIComponent(cookie('ga_csrf'));const response=await fetch(`${config.apiBaseUrl}${path}`,{credentials:'include',...options,headers});const data=response.status===204?null:await response.json().catch(()=>null);if(!response.ok){const error=new Error(data?.error?.message||`Request failed: ${response.status}`);error.code=data?.error?.code;error.status=response.status;error.details=data?.error?.details;throw error;}return data;}
export async function getSession(){if(config.mode==='live')return request('/v1/session');return{authenticated:false};}
export async function fetchCatalogue(){if(config.mode==='live')return request('/v1/catalog/games');return{games:[]};}
export async function requestOtp(identifier){if(config.mode==='live')return request('/v1/auth/otp',{method:'POST',body:JSON.stringify({identifier})});await wait();return{challengeId:crypto.randomUUID(),expiresIn:300,resendIn:30};}
export async function verifyOtp(challengeId,code){if(config.mode==='live')return request('/v1/auth/otp/verify',{method:'POST',body:JSON.stringify({challengeId,code})});await wait();if(code!=='123456')throw new Error('Invalid code. Use 123456 in demo mode.');return{user:{id:'demo-user',displayName:'Player One'},entitlement:'free',coins:120,csrfToken:'demo'};}
const ACCOUNT_KEY='game-arena:local-accounts';
function readAccounts(){try{return JSON.parse(localStorage.getItem(ACCOUNT_KEY)||'{}');}catch{return{};}}
function writeAccounts(map){localStorage.setItem(ACCOUNT_KEY,JSON.stringify(map));}
function normalizeMsisdn(value){return String(value||'').replace(/\s+/g,'').replace(/^\+92/,'0');}
function pendingPremium(msisdn){
  try{
    const pending=JSON.parse(sessionStorage.getItem('game-arena:pending-subscription')||'null');
    if(!pending)return false;
    if(pending.msisdn&&normalizeMsisdn(pending.msisdn)!==normalizeMsisdn(msisdn))return false;
    return true;
  }catch{return false;}
}
export async function registerAccount({msisdn,name,password}){
  const mobile=normalizeMsisdn(msisdn);
  if(!/^03\d{9}$/.test(mobile)&&!/^3\d{9}$/.test(mobile))throw new Error('Enter a valid Pakistani mobile number (03XXXXXXXXX).');
  const phone=mobile.startsWith('0')?mobile:`0${mobile}`;
  if(!String(name||'').trim())throw new Error('Name is required.');
  if(String(password||'').length<6)throw new Error('Password must be at least 6 characters.');
  if(config.mode==='live'){
    const result=await request('/v1/auth/register',{method:'POST',body:JSON.stringify({msisdn:phone,name:String(name).trim(),password})});
    try{sessionStorage.removeItem('game-arena:landing-msisdn');sessionStorage.removeItem('game-arena:pending-subscription');}catch{/* ignore */}
    return result;
  }
  await wait();
  const accounts=readAccounts();
  if(accounts[phone])throw new Error('An account already exists for this number. Sign in instead.');
  accounts[phone]={id:`local-${phone}`,displayName:String(name).trim(),password:String(password),msisdn:phone};
  writeAccounts(accounts);
  const premium=pendingPremium(phone);
  if(premium)try{sessionStorage.removeItem('game-arena:pending-subscription');sessionStorage.removeItem('game-arena:landing-msisdn');}catch{/* ignore */}
  return{user:{id:accounts[phone].id,displayName:accounts[phone].displayName,msisdn:phone},entitlement:premium?'premium':'free',coins:120,csrfToken:'demo'};
}
export async function loginAccount({msisdn,password}){
  const mobile=normalizeMsisdn(msisdn);
  const phone=mobile.startsWith('0')?mobile:(/^3\d{9}$/.test(mobile)?`0${mobile}`:mobile);
  if(config.mode==='live'){
    const result=await request('/v1/auth/login',{method:'POST',body:JSON.stringify({msisdn:phone,password})});
    try{sessionStorage.removeItem('game-arena:landing-msisdn');sessionStorage.removeItem('game-arena:pending-subscription');}catch{/* ignore */}
    return result;
  }
  await wait();
  const account=readAccounts()[phone];
  if(!account||account.password!==String(password||''))throw new Error('Invalid mobile number or password.');
  const premium=pendingPremium(phone);
  if(premium)try{sessionStorage.removeItem('game-arena:pending-subscription');sessionStorage.removeItem('game-arena:landing-msisdn');}catch{/* ignore */}
  return{user:{id:account.id,displayName:account.displayName,msisdn:phone},entitlement:premium?'premium':'free',coins:120,csrfToken:'demo'};
}
export async function logout(){if(config.mode==='live')return request('/v1/auth/logout',{method:'POST'});}
export async function logoutAll(){if(config.mode==='live')return request('/v1/auth/logout-all',{method:'POST'});return{revoked:0};}
export async function listSessions(){if(config.mode==='live')return request('/v1/account/sessions');return{sessions:[{id:'demo-session',createdAt:new Date().toISOString(),lastSeenAt:Date.now(),risk:'normal'}]};}
export async function exportAccount(){if(config.mode==='live')return request('/v1/account/export');return{exportedAt:new Date().toISOString(),status:'preview'};}
export async function deleteAccount(){if(config.mode==='live')return request('/v1/account',{method:'DELETE'});return{status:'deletion_pending'};}
export async function createCheckout(planId){if(config.mode==='live')return request('/v1/payments/jazzcash/checkout',{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify({planId})});await wait();return{transactionId:crypto.randomUUID(),status:'pending',provider:'JazzCash',checkout:{method:'mock'}};}
export function submitCheckout(checkout){if(!checkout||checkout.method==='mock')return false;if(checkout.method==='POST'&&checkout.actionUrl){const form=document.createElement('form');form.method='POST';form.action=checkout.actionUrl;form.hidden=true;for(const [name,value] of Object.entries(checkout.fields||{})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(value);form.append(input);}document.body.append(form);form.submit();return true;}if(checkout.redirectUrl){location.assign(checkout.redirectUrl);return true;}return false;}
export async function paymentStatus(transactionId){if(config.mode==='live')return request(`/v1/payments/${encodeURIComponent(transactionId)}`);await wait(450);return{transactionId,status:'paid',entitlement:{tier:'premium',status:'active'}};}
export async function refreshEntitlement(transactionId,{attempts=12,intervalMs=2000}={}){if(config.mode!=='live'){await wait(600);return{entitlement:'premium',status:'active'};}for(let attempt=0;attempt<attempts;attempt++){const result=await paymentStatus(transactionId);if(result.status==='paid')return{entitlement:result.entitlement?.tier||'premium',status:result.entitlement?.status||'active'};if(['failed','refunded','voided'].includes(result.status))throw new Error(`Payment ${result.status}.`);await wait(intervalMs);}return{entitlement:'free',status:'pending'};}
export async function startPlay(gameId){if(config.mode==='live')return request('/v1/play-sessions',{method:'POST',body:JSON.stringify({gameId})});return{playSessionId:crypto.randomUUID(),gameVersion:'demo',nonce:'demo'};}
export async function completePlay(playSessionId,result){if(config.mode==='live')return request(`/v1/play-sessions/${encodeURIComponent(playSessionId)}/complete`,{method:'POST',body:JSON.stringify(result)});return{accepted:true,reward:20,balance:140,status:'verified'};}
export async function fetchChallenges(){if(config.mode==='live')return request('/v1/challenges');return{challenges:[]};}
export async function claimChallenge(id){if(config.mode==='live')return request(`/v1/challenges/${encodeURIComponent(id)}/claim`,{method:'POST'});return{reward:40,balance:160};}
export async function fetchTournaments(){if(config.mode==='live')return request('/v1/tournaments');return{tournaments:[]};}
export async function joinTournament(id){if(config.mode==='live')return request(`/v1/tournaments/${encodeURIComponent(id)}/join`,{method:'POST'});return{entry:{id:crypto.randomUUID(),tournamentId:id}};}
export async function fetchLeaderboard(gameId){if(config.mode==='live')return request(`/v1/leaderboards/${encodeURIComponent(gameId)}?limit=25`);return{gameId,entries:[{rank:1,displayName:'NeonFox',score:9840,durationMs:74200},{rank:2,displayName:'PixelRider',score:9210,durationMs:80100},{rank:3,displayName:'KarachiAce',score:8650,durationMs:83600},{rank:4,displayName:'Player One',score:7420,durationMs:90200}]};}
export async function fetchWallet(){if(config.mode==='live')return request('/v1/wallet');return{balance:120,currency:'Arena Coins',entries:[{id:'welcome',amount:120,reason:'welcome_reward',createdAt:new Date().toISOString()}]};}
export async function fetchTopupOffers(){if(config.mode==='live')return request('/v1/offers/topups');return{enabled:true,preview:true,offers:[]};}
export async function createTopupCheckout(offerId){if(config.mode==='live')return request('/v1/offers/topups/checkout',{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify({offerId})});await wait();return{transactionId:crypto.randomUUID(),status:'paid',coins:offerId==='demo-max'?1200:offerId==='demo-value'?550:100,checkout:{method:'mock'}};}
export async function redeemVoucher(code){if(config.mode==='live')return request('/v1/vouchers/redeem',{method:'POST',body:JSON.stringify({code})});await wait();if(String(code).trim().toUpperCase()!=='ARENA100')throw new Error('Voucher not recognised. Demo code: ARENA100');return{reward:100,balance:220};}
export async function fetchRooms(){if(config.mode==='live')return request('/v1/multiplayer/rooms');return{rooms:[]};}
export async function createRoom(payload){if(config.mode==='live')return request('/v1/multiplayer/rooms',{method:'POST',body:JSON.stringify(payload)});await wait();return{room:{id:crypto.randomUUID(),name:payload.name,gameId:payload.gameId,players:1,maxPlayers:Number(payload.maxPlayers)||2,status:'open',hostName:'Player One'}};}
export async function joinRoom(id){if(config.mode==='live')return request(`/v1/multiplayer/rooms/${encodeURIComponent(id)}/join`,{method:'POST'});await wait();return{room:{id,status:'ready'}};}
export async function submitSupportTicket(payload){if(config.mode==='live')return request('/v1/support/tickets',{method:'POST',body:JSON.stringify(payload)});await wait();return{ticket:{id:`GA-${Math.random().toString(36).slice(2,8).toUpperCase()}`,status:'open'}};}
export function gameUrl(game){try{if(game?.gameUrl){const url=new URL(game.gameUrl,location.origin);if(url.protocol!=='https:'&&url.origin!==location.origin)return'';if(url.origin!==location.origin&&!allowedGameHosts.has(url.hostname))return'';const crossOriginAllowlisted=url.origin!==location.origin&&allowedGameHosts.has(url.hostname);const versionInPath=!game.version||game.version==='external'||game.internalDemo||url.pathname.includes(`/${encodeURIComponent(game.version)}/`);if(config.mode==='live'&&!versionInPath&&!crossOriginAllowlisted)return'';return url.href;}if(!config.gameOrigin||!game?.version||game.version==='external')return'';const url=new URL(`${config.gameOrigin.replace(/\/$/,'')}/${encodeURIComponent(game.id)}/${encodeURIComponent(game.version)}/index.html`);if(url.protocol!=='https:'&&location.protocol==='https:')return'';if(url.origin!==location.origin&&!allowedGameHosts.has(url.hostname))return'';return url.href;}catch{return''}}
export function mode(){return config.mode;}
export function releaseSha(){return config.releaseSha;}
