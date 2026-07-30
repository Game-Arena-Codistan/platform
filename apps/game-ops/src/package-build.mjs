import {cp,lstat,mkdir,readdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';

const safeName=value=>/^[a-z0-9][a-z0-9.-]*$/.test(value);

async function walk(root,current=root,files=[]){
  for(const name of await readdir(current)){
    const path=join(current,name);const info=await lstat(path);
    if(info.isSymbolicLink())throw new Error(`Symlink is not allowed: ${relative(root,path)}`);
    if(info.isDirectory())await walk(root,path,files);else files.push(path);
  }
  return files;
}

export async function packageBuild({id,version,sourceDir,outputRoot}){
  if(!safeName(id)||!safeName(version))throw new Error('Invalid game id or version.');
  const sourceInfo=await stat(sourceDir);if(!sourceInfo.isDirectory())throw new Error('Source must be a directory.');
  const files=await walk(sourceDir);if(!files.some(path=>relative(sourceDir,path)==='index.html'))throw new Error('index.html is required.');
  let totalBytes=0;const manifestFiles=[];
  for(const path of files){
    const rel=relative(sourceDir,path).replaceAll('\\','/');
    if(/\.(?:php|cgi|pl|py|sh|exe|dll|so)$/i.test(rel))throw new Error(`Executable/server file is not allowed: ${rel}`);
    const buffer=await readFile(path);totalBytes+=buffer.length;
    if(totalBytes>25*1024*1024)throw new Error('Game build exceeds the 25 MB release limit.');
    manifestFiles.push({path:rel,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')});
  }
  const destination=join(outputRoot,'games',id,version);await rm(destination,{recursive:true,force:true});await mkdir(destination,{recursive:true});await cp(sourceDir,destination,{recursive:true});
  const manifest={schemaVersion:1,id,version,totalBytes,entrypoint:`/games/${id}/${version}/index.html`,files:manifestFiles.sort((a,b)=>a.path.localeCompare(b.path))};
  await writeFile(join(destination,'game-manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [id,version,sourceDir,outputRoot='../game-origin/public']=process.argv.slice(2);
  if(!id||!version||!sourceDir)throw new Error('Usage: node src/package-build.mjs <id> <version> <source-dir> [output-root]');
  console.log(JSON.stringify(await packageBuild({id,version,sourceDir,outputRoot}),null,2));
}
