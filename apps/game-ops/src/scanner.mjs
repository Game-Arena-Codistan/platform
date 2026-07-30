import {lstat,readdir,readFile} from 'node:fs/promises';
import {extname,join,relative} from 'node:path';
import {createHash} from 'node:crypto';

const TEXT_EXTENSIONS=new Set(['.html','.htm','.js','.mjs','.css','.json','.xml','.txt','.svg']);
const BLOCKED_EXTENSIONS=new Set(['.php','.cgi','.pl','.py','.rb','.sh','.bash','.exe','.dll','.so','.dylib','.jar','.war','.class','.bat','.cmd','.ps1']);
const TRACKERS=[/google-analytics\.com/i,/googletagmanager\.com/i,/facebook\.net\/.*fbevents/i,/hotjar\.com/i,/segment\.com\/analytics/i,/mixpanel\.com/i];
const UNSAFE=[
  ['dynamic_code',/\beval\s*\(|new\s+Function\s*\(/i],
  ['cookie_access',/document\.cookie/i],
  ['storage_access',/\b(?:localStorage|sessionStorage|indexedDB)\b/i],
  ['clipboard_access',/navigator\.clipboard/i],
  ['media_capture',/getUserMedia\s*\(/i],
  ['geolocation',/navigator\.geolocation/i],
  ['popup',/window\.open\s*\(/i],
  ['top_navigation',/(?:window\.)?top\.location|parent\.location/i],
  ['service_worker',/serviceWorker\.register\s*\(/i]
];

async function walk(root,current=root,files=[]){
  for(const name of await readdir(current)){
    const path=join(current,name);const info=await lstat(path);const rel=relative(root,path).replaceAll('\\','/');
    if(rel.split('/').some(part=>part==='..')||rel.length>240)throw new Error(`Unsafe path: ${rel}`);
    if(info.isSymbolicLink())throw new Error(`Symlink is not allowed: ${rel}`);
    if(info.isDirectory())await walk(root,path,files);else files.push({path,rel,bytes:info.size});
  }
  return files;
}

export async function scanBuild(root,{maxFiles=2500,maxExpandedBytes=25*1024*1024}={}){
  const files=await walk(root);const errors=[];const warnings=[];let totalBytes=0;const inventory=[];
  if(files.length>maxFiles)errors.push({code:'file_count_limit',message:`Build has ${files.length} files; limit is ${maxFiles}.`});
  for(const file of files){
    totalBytes+=file.bytes;const extension=extname(file.rel).toLowerCase();
    if(BLOCKED_EXTENSIONS.has(extension))errors.push({code:'server_or_executable_file',file:file.rel,message:'Server or executable files are prohibited.'});
    const buffer=await readFile(file.path);inventory.push({path:file.rel,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')});
    if(!TEXT_EXTENSIONS.has(extension)||buffer.length>2*1024*1024)continue;
    const text=buffer.toString('utf8');
    if(/(?:src|href)\s*=\s*["']http:\/\//i.test(text)||/fetch\s*\(\s*["']http:\/\//i.test(text))errors.push({code:'mixed_content',file:file.rel,message:'Insecure HTTP resource detected.'});
    if(/<script[^>]+src\s*=\s*["']https?:\/\//i.test(text)||/import\s*(?:\(|[^;]+from\s*)["']https?:\/\//i.test(text))errors.push({code:'remote_script',file:file.rel,message:'Remote executable scripts are prohibited.'});
    for(const pattern of TRACKERS)if(pattern.test(text))errors.push({code:'tracker',file:file.rel,message:'Third-party analytics or tracking endpoint detected.'});
    for(const [code,pattern] of UNSAFE)if(pattern.test(text))warnings.push({code,file:file.rel,message:`Potentially unsafe API detected: ${code}.`});
  }
  if(totalBytes>maxExpandedBytes)errors.push({code:'expanded_size_limit',message:`Expanded size ${totalBytes} exceeds ${maxExpandedBytes}.`});
  inventory.sort((a,b)=>a.path.localeCompare(b.path));
  return{ok:errors.length===0,summary:{files:files.length,totalBytes,errors:errors.length,warnings:warnings.length},errors,warnings,inventory};
}
