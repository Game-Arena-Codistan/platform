import {execFile} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,stat,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,join,resolve} from 'node:path';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {packageBuild} from './package-build.mjs';
import {assertManifest} from './manifest.mjs';
const exec=promisify(execFile);

function validateZipEntries(entries){
  if(entries.length>2500)throw new Error(`ZIP contains ${entries.length} entries; limit is 2500.`);
  for(const entry of entries){
    if(!entry||entry.startsWith('/')||entry.includes('\\')||entry.split('/').includes('..'))throw new Error(`Unsafe ZIP path: ${entry}`);
    if(entry.split('/').some(part=>['.git','.svn','node_modules','__MACOSX'].includes(part)))throw new Error(`Development or metadata directory is prohibited: ${entry}`);
    if(/(?:^|\/)\.(?:env|htaccess|user\.ini)(?:$|\.)/i.test(entry))throw new Error(`Sensitive server file is prohibited: ${entry}`);
    if(/\.(?:php|cgi|pl|py|rb|sh|bash|exe|dll|so|dylib|jar|war|class|bat|cmd|ps1)$/i.test(entry))throw new Error(`Executable/server file is prohibited: ${entry}`);
  }
}
async function exists(path){try{return(await stat(path)).isFile();}catch{return false;}}
async function contentRoot(work,entryFile){if(await exists(resolve(work,entryFile)))return work;const names=(await readdir(work,{withFileTypes:true})).filter(item=>!['__MACOSX','.DS_Store'].includes(item.name));if(names.length===1&&names[0].isDirectory()){const nested=join(work,names[0].name);if(await exists(resolve(nested,entryFile)))return nested;}throw new Error(`Archive does not contain ${entryFile} at its root or inside one top-level directory.`);}

export async function ingestArchive({archivePath,manifestPath,outputRoot,auditRoot='reports/audit',actor='system',sourceUrl='',sourceSha256=''}){
  const archive=await stat(archivePath);if(!archive.isFile())throw new Error('Archive must be a file.');if(archive.size>25*1024*1024)throw new Error('Compressed archive exceeds 25 MB.');
  const {stdout}=await exec('unzip',['-Z1',archivePath],{maxBuffer:4*1024*1024});const entries=stdout.split(/\r?\n/).filter(Boolean);validateZipEntries(entries);
  const work=await mkdtemp(join(tmpdir(),'game-arena-ingest-'));
  try{
    await exec('unzip',['-qq',archivePath,'-d',work],{maxBuffer:4*1024*1024});const manifest=assertManifest(JSON.parse(await readFile(manifestPath,'utf8')));const sourceDir=await contentRoot(work,manifest.entryFile);
    const release=await packageBuild({manifest,sourceDir,outputRoot,auditActor:actor});await mkdir(auditRoot,{recursive:true});
    const record={event:'game_build_accepted',at:new Date().toISOString(),actor,archive:basename(archivePath),sourceUrl,sourceSha256,slug:manifest.slug,version:manifest.version,buildSha256:release.buildSha256,storagePath:release.storagePath};await writeFile(join(auditRoot,`${manifest.slug}-${manifest.version}-${Date.now()}.json`),JSON.stringify(record,null,2));return release;
  }catch(error){await mkdir(auditRoot,{recursive:true});const failure={event:'game_build_rejected',at:new Date().toISOString(),actor,archive:basename(archivePath),sourceUrl,sourceSha256,error:error.message,scan:error.scan??null};await writeFile(join(auditRoot,`rejected-${Date.now()}.json`),JSON.stringify(failure,null,2));throw error;}finally{await rm(work,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [archivePath,manifestPath,outputRoot='../game-origin/public']=process.argv.slice(2);if(!archivePath||!manifestPath)throw new Error('Usage: node src/ingest.mjs <game.zip> <manifest.json> [output-root]');console.log(JSON.stringify(await ingestArchive({archivePath:resolve(archivePath),manifestPath:resolve(manifestPath),outputRoot:resolve(outputRoot),actor:process.env.GAME_ARENA_ACTOR||'cli'}),null,2));}
