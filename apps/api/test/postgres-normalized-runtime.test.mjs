import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NORMALIZED_POSTGRES_MODEL} from '../src/lib/persistence-readiness.mjs';

const connectionString=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL||'';

test('normalized PostgreSQL repositories refresh committed rows and reject stale writers',{skip:!connectionString},async()=>{
  const {PostgresStore}=await import('../src/adapters/postgres-store.mjs');
  const options={connectionString,ssl:false};
  const first=await PostgresStore.connect(options);
  const second=await PostgresStore.connect(options);
  try{
    assert.equal(first.persistenceModel,NORMALIZED_POSTGRES_MODEL);
    const legacy=await first.pool.query("SELECT to_regclass('public.platform_state') AS table_name");
    assert.equal(legacy.rows[0].table_name,null);

    const suffix=randomUUID().replaceAll('-','');
    const identity={type:'email',value:`postgres-${suffix}@example.test`};
    const user=first.findOrCreateUser(identity);
    user.displayName='Initial';
    await first.commit();

    await second.refresh();
    assert.equal(second.getUser(user.id)?.displayName,'Initial');

    first.getUser(user.id).displayName='Committed writer';
    second.getUser(user.id).displayName='Stale writer';
    await first.commit();
    await assert.rejects(()=>second.commit(),/Concurrent PostgreSQL update detected/);

    await second.refresh();
    assert.equal(second.getUser(user.id)?.displayName,'Committed writer');

    const rows=await first.pool.query("SELECT revision,record->>'displayName' AS display_name FROM ga_runtime_users WHERE record_key=$1 AND deleted_at IS NULL",[user.id]);
    assert.equal(rows.rowCount,1);
    assert.ok(Number(rows.rows[0].revision)>=2);
    assert.equal(rows.rows[0].display_name,'Committed writer');
  }finally{
    await first.close();
    await second.close();
  }
});
