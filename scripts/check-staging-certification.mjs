import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const required={
  '.github/workflows/release.yml':['org.opencontainers.image.revision=${{ github.sha }}','provenance: true','sbom: true'],
  '.github/workflows/aws-staging.yml':['automatic-certification:','manual-certification:','aws-staging-certification.yml','release_run_id: ${{ github.event.workflow_run.id }}'],
  '.github/workflows/aws-staging-certification.yml':['name: AWS staging certification','Gate zero — prove deployed artifact identity','imageDigest','imageID','org.opencontainers.image.revision','READY FOR UAT','FAILED','BLOCKED','kubectl -n game-arena port-forward service/admin','STAGING_QA_ADMIN_ASSERTIONS_JSON','staging-certification/$IMAGE_TAG/latest.json','trace','visual-baselines.json'],
  '.github/workflows/aws-production.yml':['uat_record:','Require READY FOR UAT certification for exact SHA','.decision == "READY FOR UAT"','staging-certification/$IMAGE_TAG/latest.json','production-smoke:','No customer, payment, wallet, game or administrative mutation was executed'],
  'tests/staging/playwright.config.mjs':['retries:0','trace:\'off\'','video:\'off\'','mobile-chromium','admin-chromium','visual-chromium'],
  'tests/staging/player.spec.mjs':['debugCode','/v1/payments/jazzcash/checkout','@critical-mobile','support-status'],
  'tests/staging/admin.spec.mjs':['reports.export','subscription.manage_plans','unauthorized','toBe(403)'],
  'tests/staging/api-certification.mjs':['invalid play proof','idempotency-key','browser return incorrectly activated','PAYMENT SANDBOX NOT CONFIGURED','AUTO-QA-'],
  'tests/staging/restart-certification.mjs':['did not survive API restart'],
  'tests/staging/aggregate-certification.mjs':['game-arena-staging-certification.v1','READY FOR UAT','FAILED','BLOCKED','adminTunnel'],
  'tests/staging/verify-visual-baselines.mjs':['VISUAL_REVIEW_REQUIRED','BLOCKED'],
  'tests/staging/visual-baselines.json':['"screenshots":{}'],
  'docs/STAGING-CERTIFICATION.md':['## Deployment identity gate','## Game Arena coverage','## Visual approval','## Human UAT and production']
};
const findings=[];
for(const [relative,markers] of Object.entries(required)){
  let text='';try{text=await readFile(join(root,relative),'utf8');}catch{findings.push({file:relative,code:'missing'});continue;}
  for(const marker of markers)if(!text.includes(marker))findings.push({file:relative,code:'missing_marker',marker});
}
const syntaxFiles=['tests/staging/player.spec.mjs','tests/staging/admin.spec.mjs','tests/staging/api-certification.mjs','tests/staging/restart-certification.mjs','tests/staging/aggregate-certification.mjs','tests/staging/generate-admin-assertions.mjs','tests/staging/verify-visual-baselines.mjs','tests/staging/visual.spec.mjs'];
for(const relative of syntaxFiles){const check=spawnSync(process.execPath,['--check',join(root,relative)],{encoding:'utf8'});if(check.status!==0)findings.push({file:relative,code:'syntax_error',detail:(check.stderr||check.stdout||'').trim().slice(0,400)});}
const cert=await readFile(join(root,'.github/workflows/aws-staging-certification.yml'),'utf8').catch(()=> '');
if(/trace:\s*['"]?(?:on|retain-on-failure)/.test(cert))findings.push({file:'.github/workflows/aws-staging-certification.yml',code:'unsafe_trace_policy'});
if(/video:\s*['"]?(?:on|retain-on-failure)/.test(cert))findings.push({file:'.github/workflows/aws-staging-certification.yml',code:'unsafe_video_policy'});
const production=await readFile(join(root,'.github/workflows/aws-production.yml'),'utf8').catch(()=> '');
if(!production.includes('workflow_dispatch:'))findings.push({file:'.github/workflows/aws-production.yml',code:'production_not_manual'});
if(findings.length){console.error(JSON.stringify({ok:false,findings},null,2));process.exit(1);}
console.log(JSON.stringify({ok:true,filesChecked:Object.keys(required).length,syntaxFiles:syntaxFiles.length}));
