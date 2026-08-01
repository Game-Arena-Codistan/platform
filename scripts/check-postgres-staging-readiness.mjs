import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';

const trackingIssue='issue #52';
const adapterRoot='apps/api/src/adapters';
const paths=readdirSync(adapterRoot)
  .filter(name=>name.includes('postgres')&&name.endsWith('.mjs'))
  .map(name=>join(adapterRoot,name));
const source=paths.map(path=>`// ${path}\n${readFileSync(path,'utf8')}`).join('\n');
const forbidden=[
  ['legacy platform-state table creation',/CREATE TABLE IF NOT EXISTS\s+platform_state/i],
  ['legacy platform-state data read',/\bFROM\s+platform_state\b/i],
  ['legacy platform-state insert',/\bINTO\s+platform_state\b/i],
  ['legacy platform-state update',/\bUPDATE\s+platform_state\b/i],
  ['legacy platform-state deletion',/\bDELETE\s+FROM\s+platform_state\b/i],
  ['whole-platform JSON encoding',/function\s+encode\s*\(store\)/],
  ['whole-platform JSON restoration',/function\s+restore\s*\(store,state\)/],
  ['single-writer runtime restriction',/single writer replica/i],
  ['whole-state advisory transaction lock',/pg_advisory_xact_lock/]
];
const required=[
  ['normalized persistence model',/normalized-postgres-v1/],
  ['row revisions',/revision\s*=\s*revision\s*\+\s*1/],
  ['optimistic revision predicate',/AND\s+revision\s*=\s*\$3/],
  ['domain repository tables',/ga_runtime_users/],
  ['conflict response',/persistence_conflict/]
];
const failures=forbidden.filter(([,pattern])=>pattern.test(source)).map(([name])=>name);
for(const [name,pattern] of required)if(!pattern.test(source))failures.push(`missing ${name}`);

if(failures.length){
  console.error(`PostgreSQL staging readiness failed (${trackingIssue}):`);
  failures.forEach(item=>console.error(`- ${item}`));
  console.error(`Inspected: ${paths.join(', ')}`);
  process.exit(1);
}

console.log(`PostgreSQL staging readiness passed across ${paths.length} adapter file(s); ${trackingIssue} repository gate satisfied.`);
