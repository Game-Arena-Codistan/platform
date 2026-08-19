import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadConfig} from '../src/config.mjs';

const mapping=JSON.parse(await readFile(new URL('../../../tests/staging/admin-role-mapping.json',import.meta.url),'utf8'));
const expected={
  'autoqa-admin@game-arena.invalid':['admin'],
  'autoqa-operator@game-arena.invalid':['operator'],
  'autoqa-support@game-arena.invalid':['support'],
  'autoqa-security@game-arena.invalid':['security'],
  'autoqa-finance@game-arena.invalid':['finance']
};

test('canonical staging admin mapping contains one deterministic identity per supported role',()=>{
  assert.deepEqual(mapping,expected);
  const config=loadConfig({nodeEnv:'staging',adminIdentityRolesJson:mapping});
  assert.deepEqual(config.adminIdentityRoles,expected);
});

test('staging admin mapping does not grant multiple roles to any QA identity',()=>{
  for(const roles of Object.values(mapping))assert.equal(roles.length,1);
  assert.equal(mapping['autoqa-unmapped@game-arena.invalid'],undefined);
});
