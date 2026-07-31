import {readdir,readFile,stat} from 'node:fs/promises';
import {extname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const skipped=new Set(['.git','node_modules','reports','dist','coverage','.terraform']);
const textExtensions=new Set([
  '.js','.mjs','.cjs','.json','.yml','.yaml','.html','.css','.md','.sql','.conf',
  '.webmanifest','.example','.tf','.tfvars','.sh','.toml','.lock','.txt','.xml'
]);
const textNames=new Set(['Dockerfile','Makefile','.dockerignore','.gitignore']);
const findings=[];

async function walk(dir,files=[]){
  for(const name of await readdir(dir)){
    if(skipped.has(name))continue;
    const path=join(dir,name);
    const info=await stat(path);
    if(info.isDirectory())await walk(path,files);
    else if(textExtensions.has(extname(path))||textNames.has(name)||name.startsWith('.env'))files.push(path);
  }
  return files;
}

const secretPatterns=[
  ['private_key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['aws_access_key',/AKIA[0-9A-Z]{16}/],
  ['github_token',/gh[pousr]_[A-Za-z0-9_]{30,}/],
  ['generic_secret',/(?:api[_-]?key|secret|password)\s*[:=]\s*["'][A-Za-z0-9+/=_-]{24,}["']/i]
];
const unfinishedPattern=/\b(?:TODO|FIXME|HACK|XXX)\b/i;
const files=await walk(root);

for(const file of files){
  const rel=relative(root,file).replaceAll('\\','/');
  if(rel==='scripts/security-check.mjs')continue;
  const text=await readFile(file,'utf8');
  for(const [code,pattern] of secretPatterns){
    if(pattern.test(text)&&!rel.endsWith('.env.example'))findings.push({file:rel,code});
  }
  if(/postMessage\s*\([^,]+,\s*["']\*["']\s*\)/.test(text))findings.push({file:rel,code:'wildcard_postmessage'});
  if(/localStorage\.setItem\([^,]*(?:token|session|auth)/i.test(text)&&!rel.endsWith('apps/web/src/state.js')){
    findings.push({file:rel,code:'browser_auth_storage'});
  }
  if(/allow-same-origin/.test(text)&&/sandbox/.test(text))findings.push({file:rel,code:'unsafe_game_sandbox'});
  if(unfinishedPattern.test(text)&&!rel.startsWith('docs/REPOSITORY-AUDIT.md')){
    findings.push({file:rel,code:'unfinished_marker'});
  }
}

const manifests=files.filter(file=>file.endsWith('package.json'));
for(const file of manifests){
  const json=JSON.parse(await readFile(file,'utf8'));
  for(const group of ['dependencies','devDependencies','optionalDependencies']){
    for(const [name,version] of Object.entries(json[group]||{})){
      if(/^(?:latest|\*|>=?|~|\^)/.test(version)){
        findings.push({file:relative(root,file).replaceAll('\\','/'),code:'unpinned_dependency',dependency:name,version});
      }
    }
  }
}

if(findings.length){
  console.error(JSON.stringify({ok:false,findings},null,2));
  process.exit(1);
}
console.log(JSON.stringify({ok:true,filesScanned:files.length,manifests:manifests.length}));
