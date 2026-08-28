import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadConfig} from '../src/config.mjs';

const mapping=JSON.parse(await readFile(new URL('../../../tests/staging/admin-role-mapping.json',import.meta.url),'utf8'));
const expected={
  'game.arena+qa-admin@codistan.org':['admin'],
  'game.arena+qa-operator@codistan.org':['operator'],
  'game.arena+qa-support@codistan.org':['support'],
  'game.arena+qa-security@codistan.org':['security'],
  'game.arena+qa-finance@codistan.org':['finance']
};

test('canonical staging admin mapping contains one deterministic identity per supported role',()=>{
  assert.deepEqual(mapping,expected);
  const config=loadConfig({nodeEnv:'staging',adminIdentityRolesJson:mapping});
  assert.deepEqual(config.adminIdentityRoles,expected);
});

test('staging admin mapping does not grant multiple roles to any QA identity',()=>{
  for(const roles of Object.values(mapping))assert.equal(roles.length,1);
  assert.equal(mapping['game.arena+qa-unmapped@codistan.org'],undefined);
});
