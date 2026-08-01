import {cp,lstat,mkdir,readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertManifest} from './manifest.mjs';
import {scanBuild} from './scanner.mjs';

const safeName=value=>/^[a-z0-9][a-z0-9.-]*$/.test(value);
async function exists(path){try{await stat(path);return true;}catch{return false;}}
async function walk(root,current=root,files=[]){for(const name of await readdir(current)){const path=join(current,name);const info=await lstat(path);if(info.isSymbolicLink())throw new Error(`Symlink is not allowed: ${relative(root,path)}`);if(info.isDirectory())await walk(root,path,files);else files.push(path);}return files;}

export async function packageBuild({manifest:inputManifest,sourceDir,outputRoot,auditActor='system',limits={}}){
  const manifest=assertManifest(inputManifest);const {slug:id,version,entryFile}=manifest;
  if(!safeName(id)||!safeName(version))throw new Error('Invalid game id or version.');
  const sourceInfo=await stat(sourceDir);if(!sourceInfo.isDirectory())throw new Error('Source must be a directory.');
  const scan=await scanBuild(sourceDir,limits);if(!scan.ok)throw Object.assign(new Error(scan.errors.map(item=>`${item.code}: ${item.file??''} ${item.message}`).join('\n')),{scan});
  const entry=resolve(sourceDir,entryFile);const relEntry=relative(resolve(sourceDir),entry);if(!relEntry||relEntry.startsWith('..')||isAbsolute(relEntry)||!(await exists(entry)))throw new Error(`Entrypoint does not exist: ${entryFile}`);
  const files=await walk(sourceDir);const contentHash=createHash('sha256');
  for(const item of scan.inventory)contentHash.update(item.path).update(':').update(item.sha256).update('\n');
  const buildSha256=contentHash.digest('hex');const destination=join(outputRoot,'games',id,version);
  if(await exists(destination)){
    const previous=JSON.parse(await readFile(join(destination,'game-manifest.json'),'utf8'));
    if(previous.buildSha256!==buildSha256)throw new Error(`Immutable version already exists with different content: ${id}@${version}`);
    return previous;
  }
  await mkdir(dirname(destination),{recursive:true});await cp(sourceDir,destination,{recursive:true,errorOnExist:true,force:false});
  const release={...manifest,buildSha256,totalBytes:scan.summary.totalBytes,fileCount:scan.summary.files,storagePath:`games/${id}/${version}`,entrypoint:`/games/${id}/${version}/${entryFile}`,files:scan.inventory,scan:{warnings:scan.warnings,limits:scan.summary.limits},publishedAt:new Date().toISOString(),publishedBy:auditActor};
  await writeFile(join(destination,'game-manifest.json'),JSON.stringify(release,null,2));return release;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [manifestPath,sourceDir,outputRoot='../game-origin/public']=process.argv.slice(2);
  if(!manifestPath||!sourceDir)throw new Error('Usage: node src/package-build.mjs <manifest.json> <source-dir> [output-root]');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));console.log(JSON.stringify(await packageBuild({manifest,sourceDir,outputRoot}),null,2));
}
