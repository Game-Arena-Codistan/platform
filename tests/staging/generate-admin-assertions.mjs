import {createHmac} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

const secret=process.env.ADMIN_PROXY_SECRET;
const roles=JSON.parse(process.env.ADMIN_IDENTITY_ROLES_JSON||'{}');
const output=process.env.ADMIN_ASSERTIONS_OUTPUT||'/tmp/game-arena-admin-assertions.json';
if(!secret)throw new Error('ADMIN_PROXY_SECRET is required.');
if(!roles||typeof roles!=='object'||Array.isArray(roles))throw new Error('ADMIN_IDENTITY_ROLES_JSON must be an object.');

const wanted=['admin','operator','support','security','finance'];
const selected={};
for(const role of wanted){
  const identity=Object.keys(roles).find(key=>Array.isArray(roles[key])&&roles[key].map(value=>String(value).toLowerCase()).includes(role));
  if(!identity)throw new Error(`BLOCKED: staging admin identity mapping does not contain role ${role}`);
  selected[role]=identity;
}
selected.unauthorized='autoqa-unmapped@game-arena.invalid';

const issuedAt=Date.now();
function headers(identity,requestedRoles){
  const normalized=[...new Set(requestedRoles.map(value=>String(value).trim().toLowerCase()))].sort();
  const canonical=`${identity}\n${normalized.join(',')}\n${issuedAt}`;
  const signature=createHmac('sha256',secret).update(canonical).digest('hex');
  return{
    'x-admin-identity':identity,
    'x-admin-roles':normalized.join(','),
    'x-admin-issued-at':String(issuedAt),
    'x-admin-signature':signature,
    'x-admin-request':'1'
  };
}

const assertions={};
for(const role of wanted)assertions[role]=headers(selected[role],[role]);
assertions.unauthorized=headers(selected.unauthorized,['admin']);
await writeFile(output,JSON.stringify(assertions),{mode:0o600});
