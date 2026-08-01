import {createHash} from 'node:crypto';
import {lstat,readdir,readFile,stat} from 'node:fs/promises';
import {join,relative,resolve,sep} from 'node:path';

const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION=/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/;
const SHA256=/^[a-f0-9]{64}$/;
const ENGINE=new Set(['html5','construct2','construct3','unity-webgl','godot-web','other']);
const RUNTIME=new Set(['static','external-api','realtime']);
const ORIENTATION=new Set(['portrait','landscape','responsive']);
const TIERS=new Set(['free','premium']);
const RIGHTS=new Set(['blocked','pending','approved']);
const SOURCE_STATES=new Set(['missing','discovered','archived','reviewable']);
const RELEASE_STATES=new Set(['none','built','scanned','staged','active','retired']);
const CERT_STATES=new Set(['not-started','blocked','in-review','approved','rejected']);
const OPERATION_STATES=new Set(['inactive','paused','active','retired']);

export class PortfolioError extends Error{
  constructor(message,{code='portfolio_invalid',details=[]}={}){super(message);this.code=code;this.details=details;}
}

export async function readRecords(path){
  const source=await readFile(path,'utf8');
  if(path.endsWith('.jsonl')){
    return source.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map((line,index)=>{
      try{return JSON.parse(line);}catch(error){throw new PortfolioError(`${path}:${index+1}: ${error.message}`);}
    });
  }
  const value=JSON.parse(source);
  if(Array.isArray(value))return value;
  if(Array.isArray(value.records))return value.records;
  throw new PortfolioError(`${path} must contain a JSON array, {records: []}, or JSONL records.`);
}

const text=(value,name,{required=true,max=500}={})=>{
  if(value===null&&!required)return;
  if(typeof value!=='string'||(required&&!value.trim())||value.length>max)throw new PortfolioError(`${name} must be ${required?'a non-empty':'a'} string of at most ${max} characters.`);
};
const choice=(value,name,allowed)=>{if(!allowed.has(value))throw new PortfolioError(`${name} has unsupported value: ${value}`);};
const bool=(value,name)=>{if(typeof value!=='boolean')throw new PortfolioError(`${name} must be boolean.`);};

export function validateCatalogueRecord(record){
  if(!record||typeof record!=='object'||Array.isArray(record))throw new PortfolioError('Catalogue record must be an object.');
  if(record.schemaVersion!=='1.0.0')throw new PortfolioError(`${record.slug||'record'}: schemaVersion must be 1.0.0.`);
  text(record.slug,'slug',{max:80});if(!SLUG.test(record.slug))throw new PortfolioError(`${record.slug}: invalid slug.`);
  text(record.title,`${record.slug}.title`,{max:160});
  choice(record.engine,`${record.slug}.engine`,ENGINE);choice(record.runtimeClass,`${record.slug}.runtimeClass`,RUNTIME);
  choice(record.tier,`${record.slug}.tier`,TIERS);choice(record.orientation,`${record.slug}.orientation`,ORIENTATION);
  if(!record.source||typeof record.source!=='object')throw new PortfolioError(`${record.slug}.source is required.`);
  text(record.source.manifestRef,`${record.slug}.source.manifestRef`);choice(record.source.state,`${record.slug}.source.state`,SOURCE_STATES);
  if(record.source.shard!==null&&record.source.shard!==undefined){text(record.source.shard,`${record.slug}.source.shard`);if(!SLUG.test(record.source.shard))throw new PortfolioError(`${record.slug}.source.shard is invalid.`);}
  if(!record.rights||typeof record.rights!=='object')throw new PortfolioError(`${record.slug}.rights is required.`);
  choice(record.rights.state,`${record.slug}.rights.state`,RIGHTS);
  for(const field of ['storage','modify','host','distribute'])bool(record.rights[field],`${record.slug}.rights.${field}`);
  if(record.rights.state==='approved'&&(!record.rights.reference||!record.rights.storage||!record.rights.host||!record.rights.distribute))throw new PortfolioError(`${record.slug}: approved rights require a reference and storage/host/distribute permission.`);
  if(!record.release||typeof record.release!=='object')throw new PortfolioError(`${record.slug}.release is required.`);
  choice(record.release.state,`${record.slug}.release.state`,RELEASE_STATES);
  for(const field of ['activeVersion','candidateVersion'])if(record.release[field]!==null&&record.release[field]!==undefined&&!VERSION.test(record.release[field]))throw new PortfolioError(`${record.slug}.release.${field} is invalid.`);
  if(!record.certification||typeof record.certification!=='object')throw new PortfolioError(`${record.slug}.certification is required.`);
  choice(record.certification.state,`${record.slug}.certification.state`,CERT_STATES);
  if(!record.operations||typeof record.operations!=='object')throw new PortfolioError(`${record.slug}.operations is required.`);
  choice(record.operations.status,`${record.slug}.operations.status`,OPERATION_STATES);
  const rollout=Number(record.operations.rolloutPercentage);if(!Number.isInteger(rollout)||rollout<0||rollout>100)throw new PortfolioError(`${record.slug}.operations.rolloutPercentage must be 0-100.`);
  bool(record.operations.rewardsEnabled,`${record.slug}.operations.rewardsEnabled`);bool(record.operations.competitionsEnabled,`${record.slug}.operations.competitionsEnabled`);
  if(record.operations.status!=='active'&&rollout!==0)throw new PortfolioError(`${record.slug}: non-active records must have rollout 0.`);
  if(record.operations.status==='active'){
    if(record.rights.state!=='approved')throw new PortfolioError(`${record.slug}: active game rights are not approved.`);
    if(record.release.state!=='active'||!record.release.activeVersion)throw new PortfolioError(`${record.slug}: active game must have an active immutable version.`);
    if(record.certification.state!=='approved')throw new PortfolioError(`${record.slug}: active game certification is not approved.`);
  }
  if((record.operations.rewardsEnabled||record.operations.competitionsEnabled)&&record.certification.state!=='approved')throw new PortfolioError(`${record.slug}: rewards/competitions require approved certification.`);
  return record;
}

export function validateCatalogue(records,{maxTitles=500}={}){
  if(!Array.isArray(records)||records.length===0)throw new PortfolioError('Catalogue must contain at least one record.');
  if(records.length>maxTitles)throw new PortfolioError(`Catalogue has ${records.length} records; maximum is ${maxTitles}.`);
  const seen=new Set();const validated=[];
  for(const record of records){validateCatalogueRecord(record);if(seen.has(record.slug))throw new PortfolioError(`Duplicate catalogue slug: ${record.slug}`);seen.add(record.slug);validated.push(record);}
  return validated;
}

export function validateSourceManifest(record){
  if(!record||record.schemaVersion!=='1.0.0')throw new PortfolioError('Source manifest schemaVersion must be 1.0.0.');
  if(!SLUG.test(record.slug||''))throw new PortfolioError('Source manifest slug is invalid.');
  choice(record.engine,`${record.slug}.engine`,ENGINE);choice(record.runtimeClass,`${record.slug}.runtimeClass`,RUNTIME);
  if(!Array.isArray(record.packages)||record.packages.length<1||record.packages.length>4)throw new PortfolioError(`${record.slug}: source packages must contain 1-4 records.`);
  const kinds=new Set();
  for(const pkg of record.packages){
    choice(pkg.kind,`${record.slug}.packages.kind`,new Set(['original','modified','build','documentation']));
    if(kinds.has(pkg.kind))throw new PortfolioError(`${record.slug}: duplicate source package kind ${pkg.kind}.`);kinds.add(pkg.kind);
    text(pkg.relativePath,`${record.slug}.packages.relativePath`);if(pkg.relativePath.includes('..')||pkg.relativePath.startsWith('/')||/^[A-Za-z]:/.test(pkg.relativePath))throw new PortfolioError(`${record.slug}: unsafe source relativePath.`);
    if(!SHA256.test(pkg.sha256||''))throw new PortfolioError(`${record.slug}: invalid package sha256.`);
    if(!Number.isInteger(pkg.bytes)||pkg.bytes<0)throw new PortfolioError(`${record.slug}: invalid package bytes.`);
  }
  return record;
}

async function walk(root,current=root,entries=[]){
  for(const name of (await readdir(current)).sort()){
    const path=join(current,name);const info=await lstat(path);const rel=relative(root,path).split(sep).join('/');
    if(info.isSymbolicLink())throw new PortfolioError(`Symlink is not allowed in portfolio source: ${rel}`);
    if(info.isDirectory())await walk(root,path,entries);
    else if(info.isFile())entries.push({path,relativePath:rel,bytes:info.size});
  }
  return entries;
}

export async function hashFile(path){
  const data=await readFile(path);return createHash('sha256').update(data).digest('hex');
}

export async function inventoryDirectory(root){
  const absolute=resolve(root);const entries=await walk(absolute);
  const hash=createHash('sha256');let bytes=0;
  const files=[];
  for(const entry of entries){const sha256=await hashFile(entry.path);bytes+=entry.bytes;hash.update(`${entry.relativePath}\0${entry.bytes}\0${sha256}\n`);files.push({path:entry.relativePath,bytes:entry.bytes,sha256});}
  return{root:absolute,fileCount:files.length,bytes,treeSha256:hash.digest('hex'),files};
}

export async function discoverPortfolio(root){
  const absolute=resolve(root);const titles=[];
  for(const name of (await readdir(absolute)).sort()){
    const path=join(absolute,name);if(!(await stat(path)).isDirectory())continue;
    const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if(!SLUG.test(slug))continue;
    const inventory=await inventoryDirectory(path);
    const lower=inventory.files.map(item=>item.path.toLowerCase());
    const engine=lower.some(path=>path.endsWith('.c3p'))?'construct3':lower.some(path=>path.endsWith('.capx'))?'construct2':lower.includes('index.html')?'html5':'other';
    titles.push({slug,title:name,engine,runtimeClass:'static',sourcePath:relative(absolute,path).split(sep).join('/'),...inventory});
  }
  return{schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),root:absolute,titleCount:titles.length,totalBytes:titles.reduce((sum,item)=>sum+item.bytes,0),titles};
}

export function selectRecords(records,slugs=[]){
  if(!slugs.length)return records;
  const requested=new Set(slugs);const selected=records.filter(item=>requested.has(item.slug));
  const missing=[...requested].filter(slug=>!selected.some(item=>item.slug===slug));
  if(missing.length)throw new PortfolioError(`Unknown catalogue slug(s): ${missing.join(', ')}`);
  return selected;
}

export function archivePlan(records,sourceManifests,{environment='staging'}={}){
  const bySlug=new Map(sourceManifests.map(item=>[item.slug,validateSourceManifest(item)]));
  return{
    schemaVersion:'1.0.0',kind:'archive-plan',environment,generatedAt:new Date().toISOString(),
    items:records.map(record=>{
      const source=bySlug.get(record.slug);if(!source)throw new PortfolioError(`${record.slug}: source manifest missing.`);
      if(record.rights.state==='blocked'||!record.rights.storage)throw new PortfolioError(`${record.slug}: source storage is not permitted.`);
      return{slug:record.slug,manifestRef:record.source.manifestRef,packages:source.packages.map(pkg=>({kind:pkg.kind,relativePath:pkg.relativePath,sha256:pkg.sha256,bytes:pkg.bytes,vaultKey:`sources/${record.engine}/${record.slug}/${pkg.sha256}.zip`,requiredEncryption:'aws:kms',requiredChecksum:'SHA256'}))};
    })
  };
}

export function hydratePlan(records,sourceManifests){
  const bySlug=new Map(sourceManifests.map(item=>[item.slug,validateSourceManifest(item)]));
  return{schemaVersion:'1.0.0',kind:'hydrate-plan',generatedAt:new Date().toISOString(),items:records.map(record=>{
    const source=bySlug.get(record.slug);if(!source)throw new PortfolioError(`${record.slug}: source manifest missing.`);
    const packages=source.packages.filter(item=>item.archiveState==='archived'||item.archiveState==='verified');
    if(!packages.length)throw new PortfolioError(`${record.slug}: no archived source package is available.`);
    return{slug:record.slug,shard:record.source.shard,destination:`games/${record.slug}/`,objects:packages.map(item=>({kind:item.kind,vaultKey:item.vaultKey,sha256:item.sha256,bytes:item.bytes}))};
  })};
}

export function buildPlan(records,sourceManifests){
  const bySlug=new Map(sourceManifests.map(item=>[item.slug,validateSourceManifest(item)]));
  return{schemaVersion:'1.0.0',kind:'build-plan',generatedAt:new Date().toISOString(),items:records.map(record=>{
    const source=bySlug.get(record.slug);if(!source)throw new PortfolioError(`${record.slug}: source manifest missing.`);
    if(record.rights.state!=='approved'||!record.rights.modify||!record.rights.host)throw new PortfolioError(`${record.slug}: build/hosting rights are not approved.`);
    const version=record.release.candidateVersion;if(!version)throw new PortfolioError(`${record.slug}: candidateVersion is required for build.`);
    return{slug:record.slug,version,engine:record.engine,runtimeClass:record.runtimeClass,sourceManifestRef:record.source.manifestRef,sourceShard:record.source.shard,sourcePath:source.reviewableSource.path,artifactPrefix:`games/${record.slug}/${version}/`,requiredChecks:['archive-preflight','static-scan','network-scan','manifest-hash','bridge-contract']};
  })};
}

export function shardPlan(records,{maxTitles=50,maxEstimatedBytes=2*1024*1024*1024}={}){
  if(!Number.isInteger(maxTitles)||maxTitles<1||maxTitles>100)throw new PortfolioError('maxTitles must be 1-100.');
  const groups=new Map();for(const record of records){const key=record.engine;const list=groups.get(key)||[];list.push(record);groups.set(key,list);}
  const shards=[];
  for(const [engine,items] of [...groups.entries()].sort()){
    let current=[];let index=1;
    for(const item of items.sort((a,b)=>a.slug.localeCompare(b.slug))){
      if(current.length>=maxTitles){shards.push({name:`game-source-${engine}-${String(index++).padStart(2,'0')}`,engine,titleCount:current.length,slugs:current});current=[];}
      current.push(item.slug);
    }
    if(current.length)shards.push({name:`game-source-${engine}-${String(index).padStart(2,'0')}`,engine,titleCount:current.length,slugs:current});
  }
  return{schemaVersion:'1.0.0',kind:'shard-plan',generatedAt:new Date().toISOString(),constraints:{maxTitles,maxEstimatedBytes},shards};
}

const objectKeys=input=>{
  if(Array.isArray(input))return new Set(input.map(item=>typeof item==='string'?item:item.Key).filter(Boolean));
  if(Array.isArray(input?.Contents))return new Set(input.Contents.map(item=>item.Key).filter(Boolean));
  if(Array.isArray(input?.objects))return new Set(input.objects.map(item=>typeof item==='string'?item:item.key).filter(Boolean));
  return new Set();
};

export function reconcilePortfolio(records,sourceManifests,releases,{sourceInventory,artifactInventory}){
  const sourceKeys=objectKeys(sourceInventory);const artifactKeys=objectKeys(artifactInventory);
  const sourceBySlug=new Map(sourceManifests.map(item=>[item.slug,validateSourceManifest(item)]));
  const releaseBySlug=new Map(releases.map(item=>[`${item.slug}@${item.version}`,item]));
  const findings=[];
  for(const record of records){
    const source=sourceBySlug.get(record.slug);
    if(!source)findings.push({severity:'error',slug:record.slug,code:'source_manifest_missing'});
    else for(const pkg of source.packages.filter(item=>item.archiveState==='archived'||item.archiveState==='verified'))if(!pkg.vaultKey||!sourceKeys.has(pkg.vaultKey))findings.push({severity:'error',slug:record.slug,code:'source_object_missing',key:pkg.vaultKey});
    for(const version of [record.release.activeVersion,record.release.candidateVersion].filter(Boolean)){
      const release=releaseBySlug.get(`${record.slug}@${version}`);
      if(!release)findings.push({severity:'error',slug:record.slug,version,code:'release_manifest_missing'});
      else for(const key of [release.artifact?.key,release.artifact?.manifestKey].filter(Boolean))if(!artifactKeys.has(key))findings.push({severity:'error',slug:record.slug,version,code:'artifact_object_missing',key});
    }
    if(record.operations.status==='active'&&(record.rights.state!=='approved'||record.certification.state!=='approved'))findings.push({severity:'error',slug:record.slug,code:'active_without_approval'});
  }
  return{schemaVersion:'1.0.0',kind:'portfolio-reconciliation',generatedAt:new Date().toISOString(),recordCount:records.length,sourceObjectCount:sourceKeys.size,artifactObjectCount:artifactKeys.size,findings,ok:!findings.some(item=>item.severity==='error')};
}
