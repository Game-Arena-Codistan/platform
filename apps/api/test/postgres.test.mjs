import test from 'node:test';
import assert from 'node:assert/strict';

const connectionString=process.env.TEST_DATABASE_URL;
const options={skip:!connectionString};
async function Store(){return(await import('../src/adapters/postgres-store.mjs')).PostgresStore;}
async function reset(){const PostgresStore=await Store();const store=await PostgresStore.connect({connectionString,ssl:false});await store.pool.query('DELETE FROM platform_state');await store.pool.end();}

test('PostgreSQL state survives a committed restart',options,async()=>{const PostgresStore=await Store();await reset();let store=await PostgresStore.connect({connectionString,ssl:false});const user=store.findOrCreateUser({type:'phone',value:'+923001234567'});store.appendLedger({userId:user.id,amount:75,reason:'test',idempotencyKey:'test:ledger'});store.createTransaction({id:'11111111-1111-4111-8111-111111111111',userId:user.id,kind:'membership',provider:'JazzCash',planId:'monthly',amountPkr:299,status:'pending',idempotencyKey:'test:payment',purchaseFingerprint:'test'});await store.commit();await store.close();store=await PostgresStore.connect({connectionString,ssl:false});assert.equal(store.getUser(user.id).id,user.id);assert.equal(store.wallet(user.id),75);assert.equal(store.getTransaction('11111111-1111-4111-8111-111111111111').amountPkr,299);const duplicate=store.appendLedger({userId:user.id,amount:75,reason:'test',idempotencyKey:'test:ledger'});assert.equal(duplicate.duplicate,true);await store.close();});

test('PostgreSQL rejects a second stale writer',options,async()=>{const PostgresStore=await Store();await reset();const first=await PostgresStore.connect({connectionString,ssl:false});const second=await PostgresStore.connect({connectionString,ssl:false});first.createSupportTicket({topic:'first',message:'First writer creates a durable support record.'});await first.commit();second.createSupportTicket({topic:'second',message:'Second stale writer must not overwrite the first.'});await assert.rejects(()=>second.commit(),/Concurrent platform state writer/);await first.close();await second.pool.end();});
