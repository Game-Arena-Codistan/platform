import {randomUUID} from 'node:crypto';
import {catalogue} from '../catalogue/index.mjs';

export class MemoryStore{
  constructor(){
    this.users=new Map();this.usersByIdentity=new Map();this.otp=new Map();this.sessions=new Map();this.entitlements=new Map();this.transactions=new Map();this.ledger=[];this.playSessions=new Map();this.rateLimits=new Map();
    this.games=catalogue.map(game=>({...game}));
  }
  hitRateLimit(key,limit,windowMs,now=Date.now()){const recent=(this.rateLimits.get(key)??[]).filter(time=>time>now-windowMs);recent.push(now);this.rateLimits.set(key,recent);return recent.length>limit;}
  createOtp(challenge){this.otp.set(challenge.id,challenge);return challenge;} getOtp(id){return this.otp.get(id);} saveOtp(challenge){this.otp.set(challenge.id,challenge);}
  findOrCreateUser(identity){let id=this.usersByIdentity.get(`${identity.type}:${identity.value}`);if(!id){id=randomUUID();const user={id,displayName:'Player',createdAt:new Date().toISOString()};this.users.set(id,user);this.usersByIdentity.set(`${identity.type}:${identity.value}`,id);this.entitlements.set(id,{tier:'free',status:'active'});}return this.users.get(id);}
  createSession(session){this.sessions.set(session.hash,session);return session;} getSession(hash){const session=this.sessions.get(hash);return !session||session.expiresAt<Date.now()?null:session;} deleteSession(hash){this.sessions.delete(hash);}
  getUser(id){return this.users.get(id)??null;} getEntitlement(userId){return this.entitlements.get(userId)??{tier:'free',status:'active'};} setEntitlement(userId,value){this.entitlements.set(userId,value);return value;}
  listGames(){return this.games.filter(game=>game.status==='live');} getGame(id){return this.games.find(game=>game.id===id&&game.status==='live')??null;}
  createTransaction(tx){this.transactions.set(tx.id,tx);return tx;} getTransaction(id){return this.transactions.get(id)??null;} saveTransaction(tx){this.transactions.set(tx.id,tx);return tx;}
  wallet(userId){return this.ledger.filter(entry=>entry.userId===userId).reduce((sum,entry)=>sum+entry.amount,0);}
  appendLedger(entry){const duplicate=this.ledger.find(item=>item.idempotencyKey===entry.idempotencyKey);if(duplicate)return duplicate;this.ledger.push(entry);return entry;}
  createPlaySession(session){this.playSessions.set(session.id,session);return session;} getPlaySession(id){return this.playSessions.get(id)??null;} savePlaySession(session){this.playSessions.set(session.id,session);return session;}
}
