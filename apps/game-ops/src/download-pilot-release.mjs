import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';

function args(argv){const out={};for(let i=0;i<argv.length;i++){const item=argv[i];if(!item.startsWith('--'))continue;const next=argv[i+1];if(!next||next.startsWith('--'))out[item.slice(2)]=true;else{out[item.slice(2)]=next;i++;}}return out;}
async function githubJson(url,token){const response=await fetch(url,{headers:{accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'x-github-api-version':'2022-11-28','user-agent':'GameArenaPilotImporter/1.0'}});if(!response.ok)throw new Error(`GitHub API ${response.status}: ${await response.text()}`);return response.json();}

export async function resolveReleaseByTag({repository,tag,token,request=githubJson}){
  if(!repository||!repository.includes('/'))throw new Error('GitHub repository is required.');if(!tag)throw new Error('Release tag is required.');if(!token)throw new Error('GitHub token is required.');
  for(let page=1;page<=10;page++){
    const releases=await request(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,token);
    if(!Array.isArray(releases))throw new Error('GitHub releases response must be an array.');
    const release=releases.find(item=>item?.tag_name===tag);if(release)return release;if(releases.length<100)break;
  }
  throw new Error(`Release not found in authenticated release list: ${tag}`);
}

async function downloadAsset(asset,destination,token,expected){
  const response=await fetch(asset.url,{redirect:'follow',headers:{accept:'application/octet-stream',authorization:`Bearer ${token}`,'x-github-api-version':'2022-11-28','user-agent':'GameArenaPilotImporter/1.0'}});
  if(!response.ok||!response.body)throw new Error(`Unable to download ${asset.name}: HTTP ${response.status}`);
  const hash=createHash('sha256');let size=0;const meter=new Transform({transform(chunk,_enc,cb){size+=chunk.length;hash.update(chunk);cb(null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(destination,{flags:'wx',mode:0o600}));
  const sha256=hash.digest('hex');if(size!==expected.compressedBytes)throw new Error(`${asset.name} size mismatch: expected ${expected.compressedBytes}, received ${size}.`);if(sha256!==expected.sha256)throw new Error(`${asset.name} SHA-256 mismatch: expected ${expected.sha256}, received ${sha256}.`);
  return {assetName:asset.name,path:destination,size,sha256};
}

export async function downloadPilotRelease({tag,registryPath,outputRoot,repository=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN}){
  if(!tag)throw new Error('Release tag is required.');if(!repository||!repository.includes('/'))throw new Error('GITHUB_REPOSITORY is required.');if(!token)throw new Error('GITHUB_TOKEN is required.');
  const registry=JSON.parse(await readFile(resolve(registryPath),'utf8'));await mkdir(resolve(outputRoot),{recursive:true});
  const release=await resolveReleaseByTag({repository,tag,token});
  if(!release.draft)throw new Error('Pilot ingress release must remain a draft.');
  const downloaded=[];
  for(const game of registry.games){const asset=release.assets.find(item=>item.name===game.assetName);if(!asset)throw new Error(`Release asset is missing: ${game.assetName}`);downloaded.push(await downloadAsset(asset,join(resolve(outputRoot),basename(game.assetName)),token,game));}
  return {tag,releaseId:release.id,releaseUrl:release.html_url,downloaded};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const options=args(process.argv.slice(2));const result=await downloadPilotRelease({tag:options.tag,registryPath:options.registry||'catalogue/pilots/oversize-four.json',outputRoot:options.output||'pilot-ingress'});console.log(JSON.stringify(result,null,2));}
