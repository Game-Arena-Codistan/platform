import {readFile,writeFile} from 'node:fs/promises';

async function json(path){try{return JSON.parse(await readFile(path,'utf8'));}catch{return null;}}
function code(name){const raw=process.env[name];if(raw===undefined||raw==='')return null;const value=Number(raw);return Number.isFinite(value)?value:null;}
const expectedSha=process.env.EXPECTED_RELEASE_SHA||'';
const runId=process.env.QA_RUN_ID||'';
const identity=await json(process.env.IDENTITY_RESULT||'identity-results.json');
const api=await json(process.env.API_RESULT||'api-results.json');
const extended=await json(process.env.EXTENDED_RESULT||'extended-results.json');
const restart=await json(process.env.RESTART_RESULT||'restart-results.json');
const visual=await json(process.env.VISUAL_RESULT||'visual-results.json');
const playwright=await json(process.env.PLAYWRIGHT_RESULT||'results.json');
const statuses={
  guard:process.env.GUARD_STATUS||'unknown',
  connectivity:process.env.CONNECTIVITY_STATUS||'unknown',
  identity:process.env.IDENTITY_STATUS||'unknown',
  adminPreparation:process.env.ADMIN_PREP_STATUS||'unknown',
  adminTunnel:process.env.ADMIN_TUNNEL_STATUS||'unknown',
  adminMode:process.env.ADMIN_CERTIFICATION_MODE||'blocked',
  qaCredentialMode:process.env.QA_CREDENTIAL_MODE||'synthetic-only',
  browserSetup:process.env.BROWSER_SETUP_STATUS||'unknown',
  apiExit:code('API_EXIT'),
  extendedExit:code('EXTENDED_EXIT'),
  restartExit:code('RESTART_EXIT'),
  browserExit:code('BROWSER_EXIT'),
  visualExit:code('VISUAL_EXIT')
};

const environmentBlocked=['guard','connectivity','identity','adminPreparation','adminTunnel','browserSetup'].some(key=>statuses[key]!=='success')||!identity||identity.decision!=='PASS';
const readinessBlocked=statuses.adminMode!=='signed-roles'||statuses.qaCredentialMode!=='complete';
const functionalFailed=[statuses.apiExit,statuses.extendedExit,statuses.restartExit,statuses.browserExit].some(value=>value===1||(value!==null&&value>2))||api?.decision==='FAILED'||extended?.decision==='FAILED'||restart?.decision==='FAIL';
const functionalBlocked=environmentBlocked||readinessBlocked||[statuses.apiExit,statuses.extendedExit,statuses.restartExit,statuses.visualExit].some(value=>value===2)||api?.decision==='BLOCKED'||extended?.decision==='BLOCKED'||visual?.decision==='BLOCKED';
const decision=functionalFailed?'FAILED':functionalBlocked?'BLOCKED':'READY FOR UAT';

function collectPlaywright(node,out=[]){
  if(!node||typeof node!=='object')return out;
  if(Array.isArray(node.specs))for(const spec of node.specs){for(const test of spec.tests||[]){const result=test.results?.at(-1);out.push({title:spec.title,project:test.projectName||null,status:result?.status||test.status||'unknown',error:result?.error?.message?String(result.error.message).slice(0,240):null});}}
  for(const suite of node.suites||[])collectPlaywright(suite,out);
  return out;
}
const browserTests=collectPlaywright(playwright);
const browserSummary={total:browserTests.length,passed:browserTests.filter(item=>item.status==='passed').length,failed:browserTests.filter(item=>item.status==='failed').length,skipped:browserTests.filter(item=>item.status==='skipped').length,failures:browserTests.filter(item=>item.status==='failed').map(item=>({title:item.title,project:item.project,error:item.error}))};
const blockers=[];
if(environmentBlocked)blockers.push('STAGING_ENVIRONMENT_OR_ARTIFACT_IDENTITY');
if(statuses.adminMode!=='signed-roles')blockers.push('SIGNED_ADMIN_ROLE_MATRIX_PENDING');
if(statuses.qaCredentialMode!=='complete')blockers.push('PM_QA_ACCOUNTS_PENDING');
if(api?.decision==='BLOCKED')blockers.push('API_CERTIFICATION_BLOCKED');
if(extended?.decision==='BLOCKED')blockers.push('EXTENDED_OR_PAYMENT_CERTIFICATION_BLOCKED');
if(visual?.decision==='BLOCKED')blockers.push('VISUAL_REVIEW_REQUIRED');

const report={
  schemaVersion:'game-arena-staging-certification.v2',
  decision,
  expectedSha,
  releaseRunId:process.env.RELEASE_RUN_ID||null,
  deploymentRunId:process.env.DEPLOYMENT_RUN_ID||null,
  certificationRunId:runId,
  correlation:`AUTO-QA-${runId}`,
  generatedAt:new Date().toISOString(),
  origins:{player:process.env.STAGING_PLAYER_URL||null,api:process.env.STAGING_API_URL||null,game:process.env.STAGING_GAME_URL||null,admin:'private-ssh-tunnel'},
  statuses,
  blockers,
  identity,
  api,
  extended,
  restart,
  browser:browserSummary,
  visual,
  uatRule:'Human UAT is permitted only when decision is READY FOR UAT. Production still requires separate explicit approval.'
};
await writeFile(process.env.CERTIFICATION_JSON||'certification.json',JSON.stringify(report,null,2));
const lines=[
  '# Game Arena staging certification',
  '',
  `**Decision: ${decision}**`,
  '',
  `- Expected SHA: \`${expectedSha}\``,
  `- Release workflow run: ${report.releaseRunId||'unproven'}`,
  `- Deployment workflow run: ${report.deploymentRunId||'unproven'}`,
  `- Certification run: ${runId||'unknown'}`,
  `- Player: ${report.origins.player||'unresolved'}`,
  `- API: ${report.origins.api||'unresolved'}`,
  `- Game origin: ${report.origins.game||'unresolved'}`,
  `- Browser tests: ${browserSummary.passed}/${browserSummary.total} passed (${browserSummary.skipped} skipped)`,
  `- Admin certification mode: ${statuses.adminMode}`,
  `- PM QA credential mode: ${statuses.qaCredentialMode}`,
  `- Visual review items: ${visual?.reviewRequired??'not executed'}`,
  '',
  '## Machine gates',
  '',
  `- Deployment identity: ${identity?.decision||'BLOCKED'}`,
  `- API/auth/payment/play: ${api?.decision||'BLOCKED'}`,
  `- Media/premium/competitions: ${extended?.decision||'BLOCKED'}`,
  `- Restart durability: ${restart?.decision||'BLOCKED'}`,
  `- Private Admin tunnel: ${statuses.adminTunnel==='success'?'PASS':'BLOCKED'}`,
  `- Signed Admin role matrix: ${statuses.adminMode==='signed-roles'?'PASS':'BLOCKED'}`,
  `- PM free/premium QA accounts: ${statuses.qaCredentialMode==='complete'?'PASS':'BLOCKED'}`,
  `- Browser: ${statuses.browserExit===0?'PASS':statuses.browserExit===null?'BLOCKED':'FAIL'}`,
  `- Visual: ${visual?.decision||'BLOCKED'}`,
  '',
  ...(blockers.length?['## Outstanding blockers','',...blockers.map(item=>`- ${item}`),'']:[]),
  'Human UAT and production approval remain separate manual gates.'
];
await writeFile(process.env.CERTIFICATION_MD||'certification.md',lines.join('\n')+'\n');
console.log(JSON.stringify({decision,expectedSha,browser:browserSummary,blockers,visualReview:visual?.reviewRequired??null}));
if(decision!=='READY FOR UAT')process.exitCode=decision==='FAILED'?1:2;
