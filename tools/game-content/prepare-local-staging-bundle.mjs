import {readFile,readdir,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,relative,dirname,join,sep} from 'node:path';

function argument(name, fallback='') {
  const index=process.argv.indexOf(`--${name}`);
  return index>=0 ? process.argv[index+1] : fallback;
}
function required(name) {
  const value=argument(name);
  if(!value) throw new Error(`--${name} is required`);
  return resolve(value);
}
function safeSlug(value) {
  const slug=String(value||'');
  if(!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) throw new Error(`Invalid slug: ${slug}`);
  return slug;
}
function safeVersion(value) {
  const version=String(value||'');
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version)) throw new Error(`Invalid version: ${version}`);
  return version;
}
function safeEntrypoint(value) {
  const entry=String(value||'').replaceAll('\\','/');
  if(!entry || entry.startsWith('/') || entry.split('/').some(part=>!part||part==='.'||part==='..')) throw new Error(`Invalid entrypoint: ${entry}`);
  return entry;
}
function sqlLiteral(value) { return `'${String(value).replaceAll("'","''")}'`; }
function jsonExpression(value) {
  const base64=Buffer.from(JSON.stringify(value),'utf8').toString('base64');
  return `convert_from(decode('${base64}','base64'),'UTF8')::jsonb`;
}
async function collectManifests(root) {
  const found=[];
  async function visit(folder) {
    for(const entry of await readdir(folder,{withFileTypes:true})) {
      const path=join(folder,entry.name);
      if(entry.isDirectory()) await visit(path);
      else if(entry.isFile()&&entry.name==='game-manifest.json') found.push(path);
    }
  }
  await visit(root);
  return found.sort();
}
function firstString(...values) { return values.find(value=>typeof value==='string'&&value.trim())?.trim(); }

const gamesRoot=required('games-root');
const outputRoot=required('output');
const catalogueRoot=required('catalogue-root');
const releaseTag=argument('release-tag');
if(!releaseTag) throw new Error('--release-tag is required');

await mkdir(outputRoot,{recursive:true});
const manifests=await collectManifests(gamesRoot);
if(manifests.length!==60) throw new Error(`Expected exactly 60 packaged game manifests; found ${manifests.length}`);

const seen=new Set();
const runtime=[];
const reviewSql=['BEGIN;'];
const liveSql=['BEGIN;'];
const cert=[];

for(const manifestPath of manifests) {
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  const slug=safeSlug(manifest.slug);
  const version=safeVersion(manifest.version);
  const entrypoint=safeEntrypoint(manifest.entrypoint);
  const buildSha256=String(manifest.buildSha256||'');
  if(!/^[a-f0-9]{64}$/.test(buildSha256)) throw new Error(`Invalid buildSha256 for ${slug}`);
  if(seen.has(slug)) throw new Error(`Duplicate slug: ${slug}`);
  seen.add(slug);

  const versionDir=dirname(manifestPath);
  const expectedRelative=`${slug}${sep}${version}${sep}game-manifest.json`;
  if(relative(gamesRoot,manifestPath)!==expectedRelative) throw new Error(`Unexpected packaged path for ${slug}: ${relative(gamesRoot,manifestPath)}`);
  const entryPath=resolve(versionDir,entrypoint);
  if(!entryPath.startsWith(`${resolve(versionDir)}${sep}`)) throw new Error(`Entrypoint escapes version directory: ${slug}`);
  await access(entryPath);

  const title=firstString(manifest.title,slug.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase()));
  const genre=firstString(manifest.genre,Array.isArray(manifest.genres)?manifest.genres[0]:undefined,'Arcade');
  const genres=Array.isArray(manifest.genres)&&manifest.genres.length ? manifest.genres.map(String) : [genre];
  const tier=['free','premium'].includes(String(manifest.tier||'')) ? String(manifest.tier) : 'free';
  const orientation=['portrait','landscape','any'].includes(String(manifest.orientation||'')) ? String(manifest.orientation) : 'landscape';
  const minDeviceTier=['lite','standard','high'].includes(String(manifest.minDeviceTier||'')) ? String(manifest.minDeviceTier) : 'lite';
  const gameUrl=`/games/${slug}/${version}/${entrypoint}`;

  const record={
    id:slug,slug,title,
    description:firstString(manifest.description,`Play ${title} on Game Arena.`),
    genre,genres,tier,orientation,
    multiplayer:Boolean(manifest.multiplayer),reward:0,
    status:'review',state:'review',rolloutPercentage:0,
    gameUrl,version,minDeviceTier,
    preview:false,sourceType:'portfolio-bundle-local',
    rewardsEnabled:false,competitionsEnabled:false,
    buildSha256,entrypoint,localHosted:true,ingressRelease:releaseTag
  };
  if(firstString(manifest.iconUrl)) record.iconUrl=manifest.iconUrl;
  if(firstString(manifest.bannerUrl)) record.bannerUrl=manifest.bannerUrl;
  runtime.push(record);

  await writeFile(join(versionDir,'.game-arena-build-sha256'),`${buildSha256}\n`,'utf8');
  await writeFile(join(versionDir,'.game-arena-entrypoint'),`${entrypoint}\n`,'utf8');

  reviewSql.push(`INSERT INTO ga_runtime_games(record_key,revision,record,deleted_at,updated_at) VALUES (${sqlLiteral(slug)},1,${jsonExpression(record)},NULL,clock_timestamp()) ON CONFLICT(record_key) DO UPDATE SET revision=ga_runtime_games.revision+1,record=ga_runtime_games.record || EXCLUDED.record,deleted_at=NULL,updated_at=clock_timestamp();`);
  const livePatch={status:'live',state:'live',rolloutPercentage:100,rewardsEnabled:false,competitionsEnabled:false};
  liveSql.push(`UPDATE ga_runtime_games SET revision=revision+1,record=record || ${jsonExpression(livePatch)},updated_at=clock_timestamp() WHERE record_key=${sqlLiteral(slug)} AND deleted_at IS NULL AND record->>'buildSha256'=${sqlLiteral(buildSha256)};`);

  const releaseDir=join(catalogueRoot,slug);
  await mkdir(releaseDir,{recursive:true});
  await writeFile(join(releaseDir,`${version}.json`),JSON.stringify({
    schemaVersion:manifest.schemaVersion,slug,title,version,entrypoint,gameUrl,
    buildSha256,totalBytes:manifest.totalBytes,fileCount:manifest.fileCount,
    permissions:manifest.permissions,bridgeVersion:manifest.bridgeVersion,minDeviceTier,
    rolloutPercentage:0,publishedAt:manifest.publishedAt,publishedBy:manifest.publishedBy,
    scan:manifest.scan,productionActivation:false,ingressRelease:releaseTag,
    hosting:{mode:'local-staging-server',immutablePath:`games/${slug}/${version}/`}
  },null,2)+'\n','utf8');
  cert.push({slug,version,entrypoint,gameUrl,buildSha256,title});
}

const slugArray=`ARRAY[${runtime.map(item=>sqlLiteral(item.slug)).join(',')}]`;
reviewSql.push(`DO $$ DECLARE n integer; BEGIN SELECT count(*) INTO n FROM ga_runtime_games WHERE record_key=ANY(${slugArray}) AND deleted_at IS NULL; IF n<>60 THEN RAISE EXCEPTION 'Expected 60 staged catalogue records, found %',n; END IF; END $$;`);
reviewSql.push('COMMIT;');
liveSql.push(`DO $$ DECLARE n integer; BEGIN SELECT count(*) INTO n FROM ga_runtime_games WHERE record_key=ANY(${slugArray}) AND deleted_at IS NULL AND record->>'status'='live' AND (record->>'rolloutPercentage')::integer=100; IF n<>60 THEN RAISE EXCEPTION 'Expected 60 live catalogue records, found %',n; END IF; END $$;`);
liveSql.push('COMMIT;');

await writeFile(join(outputRoot,'runtime-review.sql'),reviewSql.join('\n')+'\n','utf8');
await writeFile(join(outputRoot,'runtime-live.sql'),liveSql.join('\n')+'\n','utf8');
await writeFile(join(outputRoot,'runtime-catalogue.json'),JSON.stringify({schemaVersion:1,releaseTag,games:runtime},null,2)+'\n','utf8');
await writeFile(join(outputRoot,'certification.json'),JSON.stringify({schemaVersion:1,releaseTag,games:cert},null,2)+'\n','utf8');
await writeFile(join(outputRoot,'certification.tsv'),cert.map(item=>[item.slug,item.version,item.entrypoint,item.buildSha256].join('\t')).join('\n')+'\n','utf8');
console.log(JSON.stringify({prepared:runtime.length,releaseTag,mode:'local-staging-server'}));
