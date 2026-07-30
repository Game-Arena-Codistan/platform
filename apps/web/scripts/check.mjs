import {access,readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const required=['index.html','styles/tokens.css','styles/app.css','styles/responsive.css','manifest.webmanifest','sw.js','src/app.js','src/data.js','src/state.js','src/api.js','src/ui.js','src/analytics.js','src/game-bridge.js','src/views/feed.js','src/views/library.js','src/views/rewards.js','src/views/premium.js','src/views/account.js','assets/icon.svg','assets/logo.svg','legal/privacy.html','legal/terms.html','deploy/nginx.conf','Dockerfile','_headers'];
for(const file of required)await access(join(root,file));
const html=await readFile(join(root,'index.html'),'utf8');
const css=await readFile(join(root,'styles/tokens.css'),'utf8')+await readFile(join(root,'styles/app.css'),'utf8')+await readFile(join(root,'styles/responsive.css'),'utf8');
if(!html.includes('Content-Security-Policy')||!html.includes('viewport-fit=cover')||!html.includes('role="status"'))throw new Error('Security or accessibility shell requirements missing.');
if(!css.includes('prefers-reduced-motion'))throw new Error('Reduced-motion support missing.');
const scripts=(await readdir(join(root,'src'),{recursive:true})).filter(file=>file.endsWith('.js')).map(file=>join(root,'src',file));
for(const file of [...scripts,join(root,'sw.js')]){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw new Error(`${file}: ${result.stderr}`);}
const budgetFiles=['index.html','styles/tokens.css','styles/app.css','styles/responsive.css',...scripts.map(file=>file.slice(root.length+1))];
const bytes=(await Promise.all(budgetFiles.map(file=>stat(join(root,file))))).reduce((sum,item)=>sum+item.size,0);
if(bytes>115*1024)throw new Error(`Core shell ${(bytes/1024).toFixed(1)} KB exceeds 115 KB.`);
console.log(`Checks passed. Core shell ${(bytes/1024).toFixed(1)} KB.`);
