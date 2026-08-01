import {readFileSync} from 'node:fs';

const path = 'apps/api/src/adapters/postgres-store.mjs';
const source = readFileSync(path, 'utf8');
const forbidden = [
  ['platform_state table', /CREATE TABLE IF NOT EXISTS\s+platform_state/i],
  ['whole-platform JSON encoding', /function\s+encode\s*\(store\)/],
  ['whole-platform JSON restoration', /function\s+restore\s*\(store,state\)/],
  ['single-writer runtime restriction', /single writer replica/i],
  ['advisory transaction lock for whole-state persistence', /pg_advisory_xact_lock/]
];
const failures = forbidden.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);

if (failures.length) {
  console.error('PostgreSQL staging readiness failed. The backend still contains legacy state-blob persistence:');
  failures.forEach(item => console.error(`- ${item}`));
  console.error('Complete issue #52 with normalized transactional PostgreSQL repositories before manual AWS backend deployment.');
  process.exit(1);
}

console.log('PostgreSQL staging readiness passed: no legacy platform_state/single-writer markers remain.');
