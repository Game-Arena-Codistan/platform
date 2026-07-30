import {build} from 'esbuild';
import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve(new URL('..',import.meta.url).pathname,'..');
const dist=resolve(root,'dist');
await rm(dist,{recursive:true,force:true});
await mkdir(resolve(dist,'assets'),{recursive:true});

for(const name of ['config.js','manifest.webmanifest','sw.js'])await cp(resolve(root,name),resolve(dist,name));
for(const name of ['assets','styles','legal','demo-games'])await cp(resolve(root,name),resolve(dist,name),{recursive:true});

let html=await readFile(resolve(root,'index.html'),'utf8');
html=html.replace('<script type="module" src="/src/app.js"></script>','<script type="module" src="/assets/app.js"></script>');
await writeFile(resolve(dist,'index.html'),html);

await build({
  entryPoints:[resolve(root,'src/app.js')],
  bundle:true,
  format:'esm',
  platform:'browser',
  target:['es2022'],
  minify:true,
  sourcemap:true,
  legalComments:'none',
  outfile:resolve(dist,'assets/app.js')
});

console.log('Built Vercel preview in apps/web/dist');
