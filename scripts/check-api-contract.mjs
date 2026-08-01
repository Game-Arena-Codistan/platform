import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const readJson=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const routes=await readJson('contracts/api/v1/routes.json');
const mocks=await readJson('contracts/api/v1/mock-responses.json');
const intake=await readJson('infra/opentofu/aws/staging-account-intake.example.json');

const requiredVersion='1.0.0';
if(routes.contractVersion!==requiredVersion||mocks.contractVersion!==requiredVersion){
  throw new Error('API contract versions must all be 1.0.0.');
}
if(!Array.isArray(routes.routes)||routes.routes.length<25)throw new Error('Route manifest is incomplete.');

const seen=new Set();
for(const route of routes.routes){
  const key=`${route.method} ${route.path}`;
  if(seen.has(key))throw new Error(`Duplicate route: ${key}`);
  seen.add(key);
  if(!['public','optional','session'].includes(route.auth))throw new Error(`Invalid auth mode for ${key}`);
  if(!Number.isInteger(route.successStatus))throw new Error(`Invalid success status for ${key}`);
  if(route.mockExample&&!Object.hasOwn(mocks.examples,route.mockExample))throw new Error(`Mock example ${route.mockExample} is missing for ${key}`);
}

const normalize=value=>value.replaceAll('\\/','/');
const backend=normalize([
  await readFile(resolve(root,'apps/api/src/app.mjs'),'utf8'),
  await readFile(resolve(root,'apps/api/src/mvp-app.mjs'),'utf8'),
  await readFile(resolve(root,'apps/api/src/admin-app.mjs'),'utf8')
].join('\n'));
for(const route of routes.routes){
  const prefix=route.path.split('{')[0];
  if(!backend.includes(prefix))throw new Error(`Backend route source is missing prefix ${prefix} for ${route.method} ${route.path}`);
}

const frontend=await readFile(resolve(root,'apps/web/src/api.js'),'utf8');
const frontendPaths=[
  '/v1/session','/v1/auth/otp','/v1/auth/otp/verify','/v1/auth/logout','/v1/auth/logout-all',
  '/v1/account/sessions','/v1/account/export','/v1/account','/v1/payments/jazzcash/checkout',
  '/v1/payments/','/v1/play-sessions','/complete','/v1/challenges','/claim','/v1/tournaments',
  '/join','/v1/leaderboards/','/v1/wallet','/v1/offers/topups','/v1/offers/topups/checkout',
  '/v1/vouchers/redeem','/v1/multiplayer/rooms','/v1/support/tickets'
];
for(const path of frontendPaths)if(!frontend.includes(path))throw new Error(`Frontend API adapter is missing ${path}`);

const previewConfig=await readFile(resolve(root,'apps/web/config.js'),'utf8');
if(!previewConfig.includes("mode:'mock'"))throw new Error('Vercel/default frontend configuration must remain mock.');
if(/(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/.test(JSON.stringify(mocks))){
  throw new Error('Mock contract contains a credential-like value.');
}
const forbiddenKeys=/^(password|secret|apiKey|merchantId|integritySalt|databaseUrl)$/i;
const inspect=(value,path='mock')=>{
  if(Array.isArray(value))return value.forEach((item,index)=>inspect(item,`${path}[${index}]`));
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
    if(forbiddenKeys.test(key))throw new Error(`Mock contract contains forbidden secret field ${path}.${key}`);
    inspect(item,`${path}.${key}`);
  }
};
inspect(mocks);

if(mocks.examples.otpRequested.debugCode!=='123456')throw new Error('Preview OTP must remain the documented mock code.');
if(mocks.examples.topups.offers.length<3)throw new Error('Mock top-up contract requires at least three offers.');
for(const slug of ['duck-hunter','ranger-vs-zombies','robotex']){
  const game=mocks.examples.catalogue.games.find(item=>item.id===slug);
  if(!game||game.status!=='paused'||game.rolloutPercentage!==0)throw new Error(`${slug} must stay paused at zero rollout in the handoff fixture.`);
}

if(intake.awsStagingEnabled!==false||intake.status!=='awaiting-account')throw new Error('AWS staging intake must fail closed before an account exists.');
if(intake.account.id!=='000000000000')throw new Error('Committed AWS intake must contain only the placeholder account.');
if(intake.staging.otpProviderMode!=='mock'||intake.staging.jazzCashMode!=='mock'||intake.staging.allowDebugOtp!==true){
  throw new Error('Initial AWS staging provider modes must remain mock/mock/debug.');
}

for(const path of ['docs/BACKEND-HANDOFF.md','docs/AWS-STAGING-ACCOUNT-INTAKE.md']){
  const content=await readFile(resolve(root,path),'utf8');
  if(content.length<1000)throw new Error(`${path} is unexpectedly incomplete.`);
}
console.log(`API contract ${requiredVersion} passed: ${routes.routes.length} routes, ${Object.keys(mocks.examples).length} examples, AWS staging disabled.`);
