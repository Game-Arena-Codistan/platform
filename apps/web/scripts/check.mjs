import {access,readFile,readdir,stat} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const required=['index.html','styles/tokens.css','styles/app.css','styles/responsive.css','manifest.webmanifest','sw.js','src/app.js','src/data.js','src/state.js','src/api.js','src/ui.js','src/analytics.js','src/game-bridge.js','src/views/feed.js','src/views/library.js','src/views/rewards.js','src/views/premium.js','src/views/account.js','assets/icon.svg','assets/logo.svg','legal/privacy.html','legal/terms.html','deploy/nginx.conf','deploy/40-game-arena-config.sh','Dockerfile','_headers','vercel.json','scripts/build.mjs','demo-games/arena-dash/index.html'];
for(const file of required)await access(join(root,file));
const html=await readFile(join(root,'index.html'),'utf8');
const css=await readFile(join(root,'styles/tokens.css'),'utf8')+await readFile(join(root,'styles/app.css'),'utf8')+await readFile(join(root,'styles/responsive.css'),'utf8');
const vercel=await readFile(join(root,'vercel.json'),'utf8');
const demo=await readFile(join(root,'demo-games/arena-dash/index.html'),'utf8');
const runtime=await readFile(join(root,'deploy/40-game-arena-config.sh'),'utf8');
const data=await readFile(join(root,'src/data.js'),'utf8');
if(!html.includes('Content-Security-Policy')||!html.includes('viewport-fit=cover')||!html.includes('role="status"'))throw new Error('Security or accessibility shell requirements missing.');
if(!css.includes('prefers-reduced-motion'))throw new Error('Reduced-motion support missing.');
if(!vercel.includes('npm run build')||!vercel.includes('"outputDirectory":"dist"'))throw new Error('Vercel must build the bundled dist directory.');
if(!demo.includes("source:'game-arena-game'")||!demo.includes("'reward-request'"))throw new Error('Playable preview must implement Game Bridge ready and reward events.');
for(const marker of ['https://*','http://localhost:*','http://127.0.0.1:*','[ "$RELEASE" = dev ]','HTTP game origin is allowed only for the local dev release']){
  if(!runtime.includes(marker))throw new Error(`Runtime origin guard missing: ${marker}`);
}
if(runtime.includes('http://*)'))throw new Error('Runtime origin guard must never allow arbitrary HTTP origins.');
for(const marker of [
  "controlledPilotIds=['duck-hunter','ranger-vs-zombies','robotex','swat-vs-zombies']",
  'filter(game=>!controlledPilots.has(game.id))'
])if(!data.includes(marker))throw new Error(`Mock preview pilot privacy guard missing: ${marker}`);
const scripts=(await readdir(join(root,'src'),{recursive:true})).filter(file=>file.endsWith('.js')).map(file=>join(root,'src',file));
for(const file of [...scripts,join(root,'sw.js'),join(root,'scripts/build.mjs')]){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw new Error(`${file}: ${result.stderr}`);}
const budgetFiles=['index.html','styles/tokens.css','styles/app.css','styles/responsive.css',...scripts.map(file=>relative(root,file))];
const bytes=(await Promise.all(budgetFiles.map(file=>stat(join(root,file))))).reduce((sum,item)=>sum+item.size,0);
if(bytes>125*1024)throw new Error(`Core source ${(bytes/1024).toFixed(1)} KB exceeds 125 KB.`);
console.log(`Checks passed. Core source ${(bytes/1024).toFixed(1)} KB.`);
