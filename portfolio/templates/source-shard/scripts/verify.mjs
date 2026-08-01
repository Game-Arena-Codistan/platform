import {access,readdir,lstat} from 'node:fs/promises';
import {join,relative} from 'node:path';

const root=new URL('..',import.meta.url).pathname;
const blocked=/\.(zip|7z|rar|tar|gz|apk|aab|ipa|exe|dll|dylib|so|key|pem|p12|pfx|keystore|jks)$/i;
const blockedDirectories=new Set(['node_modules','export','exports','build','dist','temp','tmp','.cache']);
const findings=[];

async function walk(path){
  for(const name of await readdir(path)){
    if(blockedDirectories.has(name)){findings.push(`Blocked directory: ${relative(root,join(path,name))}`);continue;}
    const target=join(path,name);const info=await lstat(target);
    if(info.isSymbolicLink()){findings.push(`Symlink is not allowed: ${relative(root,target)}`);continue;}
    if(info.isDirectory())await walk(target);
    else if(blocked.test(name))findings.push(`Blocked file: ${relative(root,target)}`);
  }
}

await access(join(root,'catalogue','records.jsonl'));
await walk(join(root,'games'));
if(findings.length){console.error(findings.join('\n'));process.exit(1);}
console.log('Source-shard verification passed.');
