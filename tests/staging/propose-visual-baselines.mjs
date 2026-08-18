import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const captureDir=process.env.VISUAL_CAPTURE_DIR||'visual-captures';
const output=process.env.VISUAL_BASELINE_PROPOSAL||'visual-baselines.proposed.json';
const stagingSha=String(process.env.EXPECTED_RELEASE_SHA||'').trim();

if(!/^[0-9a-f]{40}$/.test(stagingSha))throw new Error('EXPECTED_RELEASE_SHA must be the exact 40-character staging SHA.');
const files=(await readdir(captureDir)).filter(name=>name.endsWith('.png')).sort();
if(!files.length)throw new Error('No visual captures found; refusing to propose an empty baseline.');

const screenshots={};
for(const name of files){
  screenshots[name]=createHash('sha256').update(await readFile(join(captureDir,name))).digest('hex');
}

const proposal={
  schemaVersion:'game-arena-visual-baselines.v1',
  approvedFromStagingSha:stagingSha,
  screenshots
};
await writeFile(output,JSON.stringify(proposal,null,2)+'\n');
console.log(JSON.stringify({proposal:output,stagingSha,captures:files.length}));
