import test from 'node:test';
import assert from 'node:assert/strict';

const connectionString=process.env.TEST_DATABASE_URL;

test('PostgreSQL TLS startup fails closed without a trusted RDS CA bundle',{skip:!connectionString},async()=>{
  const {PostgresStore}=await import('../src/adapters/postgres-store.mjs');
  await assert.rejects(
    ()=>PostgresStore.connect({connectionString,ssl:true,ca:''}),
    error=>{
      assert.match(String(error?.message||error),/trusted RDS CA bundle|SSL|certificate/i);
      return true;
    }
  );
});
