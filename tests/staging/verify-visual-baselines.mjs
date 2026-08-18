import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const captureDir=process.env.VISUAL_CAPTURE_DIR||'visual-captures';
const baselinePath=process.env.VISUAL_BASELINE_FILE||'visual-baselines.json';
const output=process.env.VISUAL_RESULT_OUTPUT||'visual-results.json';
const baseline=JSON.parse(await readFile(baselinePath,'utf8'));
const files=(await readdir(captureDir)).filter(name=>name.endsWith('.png')).sort();
const results=[];
let reviewRequired=0;
for(const name of files){
  const digest=createHash('sha256').update(await readFile(join(captureDir,name))).digest('hex');
  const expected=baseline.screenshots?.[name];
  if(!expected){reviewRequired++;results.push({name,status:'VISUAL_REVIEW_REQUIRED',actualSha256:digest,reason:'no human-approved baseline'});continue;}
  if(expected!==digest){reviewRequired++;results.push({name,status:'VISUAL_REVIEW_REQUIRED',actualSha256:digest,expectedSha256:expected,reason:'screenshot changed'});continue;}
  results.push({name,status:'PASS',sha256:digest});
}
if(!files.length){reviewRequired++;results.push({name:'visual-captures',status:'VISUAL_REVIEW_REQUIRED',reason:'no screenshots were captured'});}
const decision=reviewRequired?'BLOCKED':'PASS';
await writeFile(output,JSON.stringify({schemaVersion:'game-arena-staging-visual.v1',decision,reviewRequired,approvedFromStagingSha:baseline.approvedFromStagingSha||null,results},null,2));
console.log(JSON.stringify({decision,reviewRequired,captures:files.length}));
process.exitCode=reviewRequired?2:0;
