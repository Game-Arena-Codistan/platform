import {randomBytes} from 'node:crypto';
import {appendFileSync} from 'node:fs';
import {hashAdminPassword} from '../apps/api/src/lib/admin-password.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||!process.env.GITHUB_ENV)throw Error('CI-only fixture preparation');
const random=()=>randomBytes(24).toString('hex');
const admin=random(),support=random();
const values={QA_ADMIN_PASSWORD:admin,QA_SUPPORT_PASSWORD:support,LOCAL_JAZZCASH_TOKEN_KEY:randomBytes(32).toString('hex'),LOCAL_PUBLIC_ORIGIN:'http://127.0.0.1:8095',LOCAL_ALLOWED_ORIGINS:'http://127.0.0.1:8095,http://localhost:8080,http://localhost:8083',LOCAL_ADMIN_HASHES:JSON.stringify({'qa-admin@example.test':await hashAdminPassword(admin),'qa-support@example.test':await hashAdminPassword(support)}),LOCAL_ADMIN_ROLES:JSON.stringify({'qa-admin@example.test':['admin'],'qa-support@example.test':['support']})};
for(const [k,v] of Object.entries(values)){if(k.includes('PASSWORD')||k.includes('KEY')||k.includes('HASHES'))console.log('::add-mask::'+v);appendFileSync(process.env.GITHUB_ENV,k+'='+v+'\n');}
