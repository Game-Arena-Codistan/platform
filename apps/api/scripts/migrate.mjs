import {Pool} from 'pg';
import {readdir,readFile} from 'node:fs/promises';
const connectionString=process.env.DATABASE_URL;if(!connectionString)throw new Error('DATABASE_URL is required.');const tls=String(process.env.DATABASE_SSL).toLowerCase()==='true';const ca=process.env.DATABASE_CA_PEM||'';if(tls&&!ca)throw new Error('DATABASE_CA_PEM is required when DATABASE_SSL=true.');const pool=new Pool({connectionString,ssl:tls?{ca,rejectUnauthorized:true}:undefined,max:1});
function transactionalBody(sql){return sql.replace(/^\s*BEGIN\s*;?/i,'').replace(/COMMIT\s*;?\s*$/i,'').trim();}
try{
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');const applied=new Set((await pool.query('SELECT version FROM schema_migrations')).rows.map(row=>row.version));
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort()){
    if(applied.has(file))continue;const sql=transactionalBody(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));const client=await pool.connect();
    try{await client.query('BEGIN');await client.query(sql);await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);await client.query('COMMIT');console.log(`Applied ${file}`);}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}finally{await pool.end();}
