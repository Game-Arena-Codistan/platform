const KEY='game-arena:v2';
const defaults={
  user:null,entitlement:'free',coins:120,favourites:[],recent:[],selectedPlan:'monthly',
  onboardingComplete:false,installPromptAvailable:false,
  settings:{dataSaver:true,reducedMotion:false,sound:true,analytics:false},
  continuation:null,rewardsLoaded:false,liveChallenges:[],liveTournaments:[],
  walletLoaded:false,walletEntries:[],roomsLoaded:false,rooms:[],leaderboardGameId:'arena-dash',leaderboardLoaded:false,leaderboard:[]
};
function load(){try{const value=JSON.parse(localStorage.getItem(KEY)||'null');return value&&value.version===2?{...defaults,...value.data,settings:{...defaults.settings,...value.data.settings}}:{...defaults};}catch{return{...defaults};}}
let state=load();const listeners=new Set();
function persist(){localStorage.setItem(KEY,JSON.stringify({version:2,data:state}));listeners.forEach(listener=>listener(state));}
export function getState(){return state;}
export function subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export function update(patch){state={...state,...(typeof patch==='function'?patch(state):patch)};persist();return state;}
export function setSetting(name,value){update(current=>({settings:{...current.settings,[name]:value}}));}
export function toggleFavourite(id){update(current=>({favourites:current.favourites.includes(id)?current.favourites.filter(item=>item!==id):[...current.favourites,id]}));}
export function addRecent(id){update(current=>({recent:[id,...current.recent.filter(item=>item!==id)].slice(0,20)}));}
/** Normalize string or object entitlement shapes to a tier id. */
export function entitlementTier(value=state.entitlement){
  if(value==null)return 'free';
  if(typeof value==='string')return value||'free';
  return value.tier||'free';
}
export function isPremium(){return entitlementTier()==='premium';}
/** Drop Game Arena+ locally after a successful unsubscribe (blocks stale billing polls from restoring it). */
export function revokePremiumLocally(){
  try{sessionStorage.removeItem('game-arena:pending-subscription');}catch{/* ignore */}
  return update({entitlement:'free',premiumRevokedAt:Date.now()});
}
/** Arena+/Explore/Upgrade CTAs: library shows plans when locked, full catalogue when entitled. */
export function goArenaPlus(){location.hash='#/library';}
export function hasPendingGuestPremium(){
  if(state.user)return false;
  try{if(JSON.parse(sessionStorage.getItem('game-arena:pending-subscription')||'null'))return true;}catch{/* ignore */}
  return entitlementTier()==='premium';
}
export function telemetryEnabled(){return Boolean(state.settings.analytics);}
export function resetSession(){update({user:null,entitlement:'free',continuation:null,rewardsLoaded:false,liveChallenges:[],liveTournaments:[],walletLoaded:false,walletEntries:[],roomsLoaded:false,rooms:[],leaderboardLoaded:false,leaderboard:[]});}
