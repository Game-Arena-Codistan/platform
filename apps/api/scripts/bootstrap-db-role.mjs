import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';

const adminUrl=process.env.DATABASE_ADMIN_URL;
const appUser=process.env.DATABASE_APP_USER||'game_arena_app';
const appPassword=process.env.DATABASE_APP_PASSWORD;
const databaseName=process.env.DATABASE_NAME||'game_arena';
if(!adminUrl||!appPassword)throw new Error('DATABASE_ADMIN_URL and DATABASE_APP_PASSWORD are required.');
if(!/^[a-z_][a-z0-9_]{2,62}$/.test(appUser)||!/^[a-z_][a-z0-9_]{2,62}$/.test(databaseName))throw new Error('Database role or name is invalid.');
let ca=process.env.DATABASE_CA_PEM||'';
if(!ca){try{ca=await readFile('/app/certs/rds-global-bundle.pem','utf8');}catch{throw new Error('A trusted RDS CA bundle is required.');}}
const quoteIdentifier=value=>`"${value.replaceAll('"','""')}"`;
const quoteLiteral=value=>`'${value.replaceAll("'","''")}'`;
const role=quoteIdentifier(appUser);const database=quoteIdentifier(databaseName);
const pool=new Pool({connectionString:adminUrl,max:1,ssl:{ca,rejectUnauthorized:true}});
try{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const exists=await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[appUser]);
    if(!exists.rowCount)await client.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);
    await client.query(`ALTER ROLE ${role} PASSWORD ${quoteLiteral(appPassword)}`);
    await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${role}`);
    await client.query('COMMIT');
    console.log(JSON.stringify({ok:true,role:appUser,database:databaseName}));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}finally{await pool.end();}
