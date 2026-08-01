import {createHash} from 'node:crypto';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ingestArchive} from './ingest.mjs';
import {preflightZip} from './zip-preflight.mjs';
import {loadContentLimits,publicContentLimits} from './limits.mjs';

function args(argv){const out={};for(let i=0;i<argv.length;i++){const item=argv[i];if(!item.startsWith('--'))continue;const next=argv[i+1];if(!next||next.startsWith('--'))out[item.slice(2)]=true;else{out[item.slice(2)]=next;i++;}}return out;}
async function sha256(path){const data=await readFile(path);return createHash('sha256').update(data).digest('hex');}

export async function importPilotRelease({registryPath,ingressRoot,outputRoot,auditRoot,reportPath,actor='pilot-import'}){
  const registry=JSON.parse(await readFile(resolve(registryPath),'utf8'));const limits=loadContentLimits();const results=[];await mkdir(resolve(auditRoot),{recursive:true});
  for(const game of registry.games){
    const archivePath=join(resolve(ingressRoot),game.assetName);const info=await stat(archivePath);if(info.size!==game.compressedBytes)throw new Error(`${game.slug} size mismatch.`);const digest=await sha256(archivePath);if(digest!==game.sha256)throw new Error(`${game.slug} SHA-256 mismatch.`);
    const preflight=await preflightZip(archivePath,limits);if(!preflight.summary.rootIndex&&!preflight.summary.oneDirectoryIndex)throw new Error(`${game.slug} does not contain index.html at the root or within one top-level directory.`);
    const manifestPath=join(resolve(auditRoot),`${game.slug}-manifest-input.json`);await writeFile(manifestPath,JSON.stringify(game.manifest,null,2));
    const release=await ingestArchive({archivePath,manifestPath,outputRoot:resolve(outputRoot),auditRoot:resolve(auditRoot),actor,sourceUrl:`github-release:${game.assetName}`,sourceSha256:digest,limits});
    results.push({slug:game.slug,title:game.title,assetName:game.assetName,sourceSha256:digest,preflight:preflight.summary,release});
  }
  const report={schemaVersion:1,createdAt:new Date().toISOString(),productionActivation:false,limits:publicContentLimits(limits),results};await writeFile(resolve(reportPath),JSON.stringify(report,null,2));return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const options=args(process.argv.slice(2));for(const name of ['registry','ingress','output','audit','report'])if(!options[name])throw new Error(`--${name} is required.`);console.log(JSON.stringify(await importPilotRelease({registryPath:options.registry,ingressRoot:options.ingress,outputRoot:options.output,auditRoot:options.audit,reportPath:options.report,actor:process.env.GAME_ARENA_ACTOR||'pilot-import'}),null,2));}
