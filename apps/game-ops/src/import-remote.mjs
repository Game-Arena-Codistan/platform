import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ingestArchive} from './ingest.mjs';
import {assertZipFile,downloadRemoteFile} from './remote-source.mjs';
import {loadContentLimits} from './limits.mjs';

function args(argv){const result={};for(let index=0;index<argv.length;index++){const item=argv[index];if(!item.startsWith('--'))continue;const key=item.slice(2);const next=argv[index+1];if(!next||next.startsWith('--'))result[key]=true;else{result[key]=next;index++;}}return result;}

export async function importRemoteBuild({zipUrl,manifest:inputManifest,outputRoot,auditRoot='reports/audit',actor='remote-import',expectedSha256='',dryRun=false,limits:limitOverrides={}}){
  const limits=loadContentLimits(process.env,limitOverrides);const work=await mkdtemp(join(tmpdir(),'game-arena-remote-'));const archivePath=join(work,'game.zip');
  try{
    const source=await downloadRemoteFile({url:zipUrl,destination:archivePath,maxBytes:limits.maxCompressedBytes});await assertZipFile(archivePath);
    if(expectedSha256&&source.sha256.toLowerCase()!==expectedSha256.toLowerCase())throw new Error(`Archive SHA-256 mismatch: expected ${expectedSha256}, received ${source.sha256}.`);
    const manifest={...inputManifest};if(!manifest.version||manifest.version==='auto')manifest.version=`build-${source.sha256.slice(0,12)}`;
    const manifestPath=join(work,'manifest.json');await writeFile(manifestPath,JSON.stringify(manifest,null,2));const destination=dryRun?join(work,'dry-run-output'):resolve(outputRoot);
    const release=await ingestArchive({archivePath,manifestPath,outputRoot:destination,auditRoot:resolve(auditRoot),actor,sourceUrl:source.sourceUrl,sourceSha256:source.sha256,limits});
    return {dryRun,source,release};
  }finally{await rm(work,{recursive:true,force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const options=args(process.argv.slice(2));if(!options['zip-url'])throw new Error('--zip-url is required.');
  let manifest;if(options.manifest)manifest=JSON.parse(await readFile(resolve(options.manifest),'utf8'));else if(options['manifest-json'])manifest=JSON.parse(options['manifest-json']);else throw new Error('--manifest or --manifest-json is required.');
  const result=await importRemoteBuild({zipUrl:options['zip-url'],manifest,outputRoot:options['output-root']||'../game-origin/public',auditRoot:options['audit-root']||'reports/audit',actor:process.env.GAME_ARENA_ACTOR||'cli',expectedSha256:options['expected-sha256']||'',dryRun:Boolean(options['dry-run'])});console.log(JSON.stringify(result,null,2));
}
