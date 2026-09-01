import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {catalogue} from '../../apps/api/src/catalogue/index.mjs';

function args(argv){
  const out={};
  for(let i=0;i<argv.length;i++){
    const item=argv[i];
    if(!item.startsWith('--'))continue;
    const next=argv[i+1];
    if(!next||next.startsWith('--'))out[item.slice(2)]=true;
    else{out[item.slice(2)]=next;i++;}
  }
  return out;
}

async function githubJson(url,token){
  const response=await fetch(url,{headers:{
    accept:'application/vnd.github+json',
    authorization:`Bearer ${token}`,
    'x-github-api-version':'2022-11-28',
    'user-agent':'GameArenaLocalRegistryRepair/1.0'
  }});
  if(!response.ok)throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return response.json();
}

async function releaseByTag(repository,tag,token){
  for(let page=1;page<=10;page++){
    const releases=await githubJson(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,token);
    if(!Array.isArray(releases))throw new Error('GitHub releases response must be an array.');
    const release=releases.find(item=>item?.tag_name===tag);
    if(release)return release;
    if(releases.length<100)break;
  }
  throw new Error(`Draft release not found: ${tag}`);
}

const titleize=slug=>slug.split('-').filter(Boolean).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
const allowedOrientation=new Set(['portrait','landscape','any']);
const allowedTier=new Set(['free','premium']);
const oversize=new Map([
  ['duck-hunter',{version:'1.0.0-pilot.1',genres:['arcade'],minDeviceTier:'standard'}],
  ['ranger-vs-zombies',{version:'1.0.0-pilot.1',genres:['action'],minDeviceTier:'standard'}],
  ['robotex',{version:'1.0.0-pilot.1',genres:['arcade'],minDeviceTier:'standard'}],
  ['swat-vs-zombies',{version:'1.0.0-pilot.1',genres:['action'],minDeviceTier:'high'}]
]);

export async function repairRegistry({registryPath,tag,repository,token,reportPath}){
  if(!registryPath)throw new Error('Registry path is required.');
  if(!tag)throw new Error('Release tag is required.');
  if(!repository||!repository.includes('/'))throw new Error('GitHub repository is required.');
  if(!token)throw new Error('GitHub token is required.');

  const path=resolve(registryPath);
  const registry=JSON.parse(await readFile(path,'utf8'));
  const existingGames=Array.isArray(registry.games)?registry.games:[];
  if(existingGames.length===60)return {repaired:false,count:60};
  if(existingGames.length!==59)throw new Error(`Registry repair only permits the observed 59-to-60 correction; found ${existingGames.length}.`);
  if(registry.schemaVersion!==1||registry.productionActivation!==false)throw new Error('Registry safety envelope is invalid.');

  const release=await releaseByTag(repository,tag,token);
  if(!release.draft)throw new Error('Bundle ingress release must remain draft/private.');
  const zipAssets=(release.assets||[]).filter(asset=>/^[a-z0-9][a-z0-9-]{1,63}\.zip$/.test(String(asset.name||'')));
  if(zipAssets.length!==60)throw new Error(`Expected exactly 60 ZIP assets in the draft release; found ${zipAssets.length}.`);

  const registered=new Set(existingGames.map(game=>String(game.assetName||'')));
  const missing=zipAssets.filter(asset=>!registered.has(asset.name));
  if(missing.length!==1)throw new Error(`Expected exactly one ZIP omitted from the registry; found ${missing.length}.`);

  const asset=missing[0];
  const slug=asset.name.slice(0,-4);
  if(existingGames.some(game=>game.slug===slug))throw new Error(`Registry already contains slug ${slug} under a different asset name.`);
  const digest=String(asset.digest||'').replace(/^sha256:/,'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(digest))throw new Error(`Release asset has no trusted SHA-256 digest: ${asset.name}`);
  const compressedBytes=Number(asset.size);
  if(!Number.isSafeInteger(compressedBytes)||compressedBytes<=0||compressedBytes>134217728)throw new Error(`Invalid release asset size: ${asset.name}`);

  const known=catalogue.find(game=>game.id===slug);
  const special=oversize.get(slug);
  const genres=Array.isArray(known?.genres)&&known.genres.length?known.genres.map(String):known?.genre?[String(known.genre)]:special?.genres||['Arcade'];
  const title=String(known?.title||titleize(slug));
  const manifest={
    schemaVersion:1,
    slug,
    title,
    version:special?.version||'1.0.0',
    genres,
    orientation:allowedOrientation.has(known?.orientation)?known.orientation:'any',
    tier:allowedTier.has(known?.tier)?known.tier:'free',
    inputModes:['touch','mouse'],
    entryFile:'index.html',
    assets:[],
    permissions:{},
    bridgeVersion:'1.0',
    minDeviceTier:special?.minDeviceTier||'standard',
    rolloutPercentage:0,
    description:String(known?.description||`Local staging portfolio build for ${title}.`).slice(0,500)
  };
  const added={slug,title,assetName:asset.name,compressedBytes,sha256:digest,manifest};
  const repaired={...registry,games:[...existingGames,added].sort((a,b)=>String(a.slug).localeCompare(String(b.slug)))};
  if(repaired.games.length!==60)throw new Error('Registry repair did not produce exactly 60 games.');
  await writeFile(path,JSON.stringify(repaired,null,2)+'\n','utf8');

  const report={
    schemaVersion:1,
    repairedAt:new Date().toISOString(),
    releaseTag:tag,
    releaseId:release.id,
    observedRegistryCount:59,
    releaseZipCount:60,
    repairedSlug:slug,
    repairedAsset:asset.name,
    sha256:digest,
    compressedBytes,
    metadataSource:known?'existing-live-catalogue':'conservative-local-defaults',
    productionActivation:false
  };
  if(reportPath){
    const target=resolve(reportPath);
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,JSON.stringify(report,null,2)+'\n','utf8');
  }
  return {repaired:true,count:60,...report};
}

if(process.argv[1]){
  const options=args(process.argv.slice(2));
  const result=await repairRegistry({
    registryPath:options.registry,
    tag:options.tag||process.env.RELEASE_TAG,
    repository:options.repository||process.env.GITHUB_REPOSITORY,
    token:process.env.GITHUB_TOKEN,
    reportPath:options.report||'apps/game-ops/reports/registry-repair.json'
  });
  console.log(JSON.stringify(result,null,2));
}
