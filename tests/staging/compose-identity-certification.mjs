import {readFile,writeFile} from 'node:fs/promises';

const expectedSha=String(process.env.EXPECTED_RELEASE_SHA||'').trim();
const imageBase=String(process.env.EXPECTED_IMAGE_BASE||'ghcr.io/game-arena-codistan/platform').replace(/\/$/,'');
const input=process.env.COMPOSE_IDENTITY_INPUT||'/tmp/game-arena-compose-identity.tsv';
const output=process.env.IDENTITY_RESULT||'identity-results.json';
if(!/^[0-9a-f]{40}$/.test(expectedSha))throw new Error('EXPECTED_RELEASE_SHA must be a full SHA.');

const componentFor={api:'api',web:'web',admin:'admin','game-origin':'games'};
const lines=(await readFile(input,'utf8')).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
const components=[];let blocked=false;
for(const line of lines){
  const [service,expectedImage,runningImage,imageId,repoDigest,revision,state]=line.split('|');
  const component=componentFor[service];
  if(!component)continue;
  const canonical=`${imageBase}-${component}:${expectedSha}`;
  const ok=expectedImage===canonical&&runningImage===canonical&&Boolean(imageId)&&revision===expectedSha&&state==='running';
  if(!ok)blocked=true;
  components.push({service,component,expectedImage,runningImage,imageId,repoDigest:repoDigest||null,ociRevision:revision||null,state,ok});
}
for(const service of Object.keys(componentFor))if(!components.some(item=>item.service===service))blocked=true;
const deployedSha=String(process.env.DEPLOYED_SHA||'').trim();
if(deployedSha!==expectedSha)blocked=true;
const decision=blocked?'BLOCKED':'PASS';
await writeFile(output,JSON.stringify({schemaVersion:'game-arena-compose-identity.v1',decision,expectedSha,deployedSha:deployedSha||null,components},null,2));
console.log(JSON.stringify({decision,expectedSha,components:components.length}));
if(blocked)process.exitCode=2;
