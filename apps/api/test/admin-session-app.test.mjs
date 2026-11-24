import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {MemoryStore} from '../src/adapters/memory-store.mjs';
import {loadConfig} from '../src/config.mjs';
import {hashAdminPassword} from '../src/lib/admin-password.mjs';
import {authenticateAdmin} from '../src/lib/admin-auth.mjs';
import {createAdminSessionApp} from '../src/admin-session-app.mjs';
import {send,problem} from '../src/lib/http.mjs';
test('native admin login, session roles, CSRF, logout, expiry and rate limits',async()=>{
  const email='qa-admin@example.invalid',password='synthetic-long-password-22';
  const hash=await hashAdminPassword(password);let time=Date.now();
  const origin='http://localhost:8080';
  const config=loadConfig({nodeEnv:'test',adminAuthMode:'signed-headers',adminIdentityRoles:{[email]:['finance']},adminPasswordHashes:{[email]:hash},adminLoginOrigins:[origin]});
  const store=new MemoryStore(),app=createAdminSessionApp({config,store,clock:()=>time});
  const server=createServer(async(req,res)=>{try{if(await app(req,res)!==false)return;send(res,200,authenticateAdmin(req,config,req.url==='/v1/admin/restricted'?['admin']:['finance']));}catch(error){problem(res,error,'test');}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const post=(path,body={},headers={})=>fetch(base+path,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    assert.equal((await fetch(base+'/v1/admin/protected')).status,401);
    assert.equal((await post('/v1/admin/auth/login',{email,password:'wrong'})).status,401);
    assert.equal((await post('/v1/admin/auth/login',{email,password},{origin:'http://invalid.example'})).status,403);
    const login=await post('/v1/admin/auth/login',{email,password});assert.equal(login.status,200);
    const set=login.headers.getSetCookie();assert.equal(set.length,2);assert.match(set[0],/HttpOnly/);assert.match(set[0],/SameSite=Strict/);
    const cookie=set.map(v=>v.split(';')[0]).join('; '),csrf=set[1].split(';')[0].split('=')[1];
    assert.equal((await fetch(base+'/v1/admin/protected',{headers:{cookie}})).status,200);
    assert.equal((await fetch(base+'/v1/admin/restricted',{headers:{cookie}})).status,403);
    assert.equal((await post('/v1/admin/protected',{}, {cookie})).status,403);
    assert.equal((await post('/v1/admin/protected',{}, {cookie,'x-admin-csrf':csrf})).status,200);
    assert.equal((await post('/v1/admin/auth/logout',{}, {cookie,'x-admin-csrf':csrf})).status,200);
    assert.equal((await fetch(base+'/v1/admin/protected',{headers:{cookie}})).status,401);
    const again=await post('/v1/admin/auth/login',{email,password});assert.equal(again.status,200);const cookie2=again.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
    time+=9*3600000;assert.equal((await fetch(base+'/v1/admin/protected',{headers:{cookie:cookie2}})).status,401);
    for(let i=0;i<6;i++)assert.equal((await post('/v1/admin/auth/login',{email,password:'wrong'})).status,401);
    assert.equal((await post('/v1/admin/auth/login',{email,password})).status,429);
    assert.equal(JSON.stringify([...store.adminSessions.values()]).includes(password),false);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
