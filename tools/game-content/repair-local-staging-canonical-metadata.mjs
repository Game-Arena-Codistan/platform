import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {catalogue as canonicalCatalogue} from '../../apps/api/src/catalogue/index.mjs';

function argument(name,fallback=''){
  const index=process.argv.indexOf(`--${name}`);
  return index>=0?process.argv[index+1]:fallback;
}
function sqlLiteral(value){return `'${String(value).replaceAll("'","''")}'`;}
function jsonExpression(value){
  const base64=Buffer.from(JSON.stringify(value),'utf8').toString('base64');
  return `convert_from(decode('${base64}','base64'),'UTF8')::jsonb`;
}
function firstString(...values){return values.find(value=>typeof value==='string'&&value.trim())?.trim();}

const releasesRoot=argument('releases-root','catalogue/releases');
const output=argument('output');
const evidenceOutput=argument('evidence');
if(!output)throw new Error('--output is required');
if(!evidenceOutput)throw new Error('--evidence is required');

const canonicalById=new Map(canonicalCatalogue.map(game=>[game.id,game]));
const releaseRows=[];
for(const slug of await readdir(releasesRoot)){
  const folder=join(releasesRoot,slug);
  let files;
  try{files=await readdir(folder);}catch{continue;}
  const manifests=files.filter(name=>name.endsWith('.json')).sort();
  if(!manifests.length)continue;
  const parsed=[];
  for(const name of manifests){
    const release=JSON.parse(await readFile(join(folder,name),'utf8'));
    if(release.hosting?.mode!=='local-staging-server'||release.productionActivation!==false)continue;
    if(!/^[a-f0-9]{64}$/.test(String(release.buildSha256||'')))continue;
    parsed.push(release);
  }
  if(parsed.length!==1)continue;
  releaseRows.push(parsed[0]);
}
if(releaseRows.length!==60)throw new Error(`Expected exactly 60 local-staging release manifests; found ${releaseRows.length}`);

const statements=['BEGIN;'];
const repaired=[];
const skippedNoCanonical=[];
const multiplayerIds=[];
const orderedReleases=releaseRows.sort((a,b)=>a.slug.localeCompare(b.slug));
for(const release of orderedReleases){
  const canonical=canonicalById.get(release.slug);
  if(!canonical){
    skippedNoCanonical.push(release.slug);
    continue;
  }
  const genre=firstString(canonical.genre,Array.isArray(canonical.genres)?canonical.genres[0]:undefined,'Arcade');
  const patch={
    title:firstString(canonical.title,release.title,release.slug),
    description:firstString(canonical.description,`Play ${release.title||release.slug} on Game Arena.`),
    genre,
    genres:Array.isArray(canonical.genres)&&canonical.genres.length?canonical.genres.map(String):[genre],
    tier:['free','premium'].includes(String(canonical.tier||''))?canonical.tier:'free',
    orientation:['portrait','landscape','any'].includes(String(canonical.orientation||''))?canonical.orientation:'landscape',
    multiplayer:Boolean(canonical.multiplayer),
    reward:Number.isFinite(Number(canonical.reward))?Number(canonical.reward):0
  };
  if(firstString(canonical.matchSupport))patch.matchSupport=canonical.matchSupport;
  if(firstString(canonical.iconUrl))patch.iconUrl=canonical.iconUrl;
  if(firstString(canonical.bannerUrl))patch.bannerUrl=canonical.bannerUrl;
  if(patch.multiplayer)multiplayerIds.push(release.slug);
  const slug=sqlLiteral(release.slug);
  const sha=sqlLiteral(release.buildSha256);
  statements.push(`DO $$ DECLARE affected integer; BEGIN UPDATE ga_runtime_games SET revision=revision+1,record=record || ${jsonExpression(patch)},updated_at=clock_timestamp() WHERE record_key=${slug} AND deleted_at IS NULL AND record->>'sourceType'='portfolio-bundle-local' AND record->>'buildSha256'=${sha}; GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RAISE EXCEPTION 'Canonical metadata repair guard failed for ${release.slug}: affected %',affected; END IF; END $$;`);
  repaired.push({slug:release.slug,buildSha256:release.buildSha256,multiplayer:patch.multiplayer,tier:patch.tier,orientation:patch.orientation,reward:patch.reward});
}
if(!repaired.length)throw new Error('No reviewed canonical local-staging records were found to repair.');
if(!repaired.some(item=>item.slug==='tank-wars'&&item.multiplayer===true))throw new Error('Tank Wars canonical multiplayer metadata is not present in the repair set.');
const allSlugs=orderedReleases.map(item=>sqlLiteral(item.slug)).join(',');
statements.push(`DO $$ DECLARE n integer; BEGIN SELECT count(*) INTO n FROM ga_runtime_games WHERE record_key=ANY(ARRAY[${allSlugs}]) AND deleted_at IS NULL AND record->>'sourceType'='portfolio-bundle-local' AND record->>'status'='live' AND (record->>'rolloutPercentage')::integer=100 AND COALESCE((record->>'rewardsEnabled')::boolean,false)=false AND COALESCE((record->>'competitionsEnabled')::boolean,false)=false; IF n<>60 THEN RAISE EXCEPTION 'Post-repair safety verification expected 60 live guarded records, found %',n; END IF; END $$;`);
statements.push('COMMIT;');

await writeFile(output,statements.join('\n')+'\n','utf8');
await writeFile(evidenceOutput,JSON.stringify({schemaVersion:1,decision:'READY_TO_REPAIR',scannedRecords:60,records:repaired.length,skippedNoCanonical,multiplayerIds,repaired,productionActivation:false},null,2)+'\n','utf8');
console.log(JSON.stringify({scanned:60,prepared:repaired.length,skippedNoCanonical:skippedNoCanonical.length,multiplayer:multiplayerIds.length,productionActivation:false}));
