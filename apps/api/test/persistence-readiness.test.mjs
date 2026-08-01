import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNormalizedPostgresRuntime,NORMALIZED_POSTGRES_MODEL} from '../src/lib/persistence-readiness.mjs';

test('development can exercise non-deployed stores',()=>{
  assert.doesNotThrow(()=>assertNormalizedPostgresRuntime({}, {required:false}));
});

test('deployed runtime accepts only the normalized PostgreSQL model',()=>{
  assert.doesNotThrow(()=>assertNormalizedPostgresRuntime({persistenceModel:NORMALIZED_POSTGRES_MODEL},{required:true}));
  assert.throws(
    ()=>assertNormalizedPostgresRuntime({},{required:true}),
    /Normalized PostgreSQL runtime is required/
  );
});
