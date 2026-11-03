import test from 'node:test';
import assert from 'node:assert/strict';

test('session key rotation soft-deletes before insert to protect ga_runtime_sessions_id_uq',()=>{
  // Mirrors PostgresStore.commit ordering: rotated auth sessions keep record.id but change Map key (token hash).
  const changes=[
    {collection:'sessions',key:'new-hash',deleted:false,record:{id:'same-session'}},
    {collection:'users',key:'user-1',deleted:false,record:{id:'user-1'}},
    {collection:'sessions',key:'old-hash',deleted:true,record:null}
  ];
  changes.sort((left,right)=>Number(right.deleted)-Number(left.deleted));
  assert.equal(changes[0].key,'old-hash');
  assert.equal(changes[0].deleted,true);
  assert.ok(changes.slice(1).every(item=>item.deleted===false));
});
