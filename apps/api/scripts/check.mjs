import {access,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
for(const file of ['package.json','src/server.mjs','src/app.mjs','migrations/001_initial.sql','Dockerfile'])await access(join(root,file));
const files=(await readdir(join(root,'src'),{recursive:true})).filter(file=>file.endsWith('.mjs')).map(file=>join(root,'src',file));
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);}
const migration=await readFile(join(root,'migrations/001_initial.sql'),'utf8');
for(const table of ['users','otp_challenges','sessions','games','game_versions','entitlements','payment_transactions','payment_events','coin_ledger','play_sessions','outbox_events'])if(!migration.includes(`CREATE TABLE ${table}`))throw new Error(`Missing table ${table}`);
console.log(`Backend checks passed (${files.length} modules).`);
