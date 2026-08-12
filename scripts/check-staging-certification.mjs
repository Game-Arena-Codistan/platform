import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const required={
  '.github/workflows/release.yml':['org.opencontainers.image.revision=${{ github.sha }}','provenance: true','sbom: true'],
  '.github/workflows/aws-staging.yml':['automatic-certification:','manual-certification:','aws-staging-certification.yml','release_run_id: ${{ github.event.workflow_run.id }}'],
  '.github/workflows/aws-staging-certification.yml':['name: AWS staging certification','Gate zero — prove deployed artifact identity','imageDigest','imageID','org.opencontainers.image.revision','Run media, premium and competition certification','READY FOR UAT','FAILED','BLOCKED','kubectl -n game-arena port-forward service/admin','STAGING_QA_ADMIN_ASSERTIONS_JSON','key="staging-certification/$IMAGE_TAG"','visual-baselines.json'],
  '.github/workflows/aws-production.yml':['uat_record:','Require READY FOR UAT certification for exact SHA','.decision == "READY FOR UAT"','staging-certification/$IMAGE_TAG/latest.json','production-smoke:','No customer, payment, wallet, game or administrative mutation was executed'],
  'tests/staging/playwright.config.mjs':['retries:0','trace:\'off\'','video:\'off\'','mobile-chromium','admin-chromium','visual-chromium'],
  'tests/staging/helpers.mjs':['STAGING_QA_FREE_PLAYER_IDENTIFIER','STAGING_QA_PREMIUM_PLAYER_IDENTIFIER','STAGING_QA_OTP_CODE','signInFromAccount','assertNoHorizontalOverflow'],
  'tests/staging/player.spec.mjs':['signInFromAccount','/v1/payments/jazzcash/checkout','@critical-mobile','game-frame','sameOriginPermission','support-status'],
  'tests/staging/home-feed.spec.mjs':['approved product proposition','discovery feed','locked premium play'],
  'tests/staging/auth-session.spec.mjs':['OTP rejects a wrong code','resend guard','authenticated'],
  'tests/staging/catalogue-gameplay.spec.mjs':['catalogue search','premium title','isolated iframe'],
  'tests/staging/premium-payments.spec.mjs':['fixed-duration billing semantics','pending server transaction','cannot self-activate','STAGING_QA_PREMIUM_PLAYER_IDENTIFIER'],
  'tests/staging/rewards.spec.mjs':['top-up','STAGING_QA_VOUCHER_CODE','duplicate'],
  'tests/staging/compete.spec.mjs':['leaderboards','premium tournament','multiplayer room'],
  'tests/staging/account-privacy.spec.mjs':['preferences persist','Export data','STAGING_QA_ALLOW_ACCOUNT_DELETION'],
  'tests/staging/support.spec.mjs':['rejects invalid content','correlated QA request'],
  'tests/staging/responsive-pwa.spec.mjs':['horizontal overflow','keyboard-operable','service worker'],
  'tests/staging/admin.spec.mjs':['reports.export','subscription.manage_plans','every operations section','toBe(403)','without reports.export'],
  'tests/staging/api-certification.mjs':['invalid play proof','idempotency-key','browser return incorrectly activated','PAYMENT SANDBOX NOT CONFIGURED','AUTO-QA-'],
  'tests/staging/extended-api-certification.mjs':['controlled-game-origin-and-catalogue-media','premium-game-authorization','competition-authorization-and-fixtures','payment-callback-matrix','premium_required','challenge_incomplete'],
  'tests/staging/payment-callback-certification.mjs':['PAYMENT SANDBOX NOT CONFIGURED','amount-mismatch-is-rejected','failure-cannot-later-become-paid','cancel-void-stays-voided','success-replay-and-refund','application-secret-arn'],
  'tests/staging/restart-certification.mjs':['did not survive API restart'],
  'tests/staging/aggregate-certification.mjs':['game-arena-staging-certification.v1','READY FOR UAT','FAILED','BLOCKED','adminTunnel','extendedExit'],
  'tests/staging/verify-visual-baselines.mjs':['VISUAL_REVIEW_REQUIRED','BLOCKED'],
  'tests/staging/visual-baselines.json':['"screenshots":{}'],
  'docs/STAGING-CERTIFICATION.md':['## Deployment identity gate','## Game Arena coverage','## Visual approval','## Human UAT and production']
};
const findings=[];
for(const [relative,markers] of Object.entries(required)){
  let text='';try{text=await readFile(join(root,relative),'utf8');}catch{findings.push({file:relative,code:'missing'});continue;}
  for(const marker of markers)if(!text.includes(marker))findings.push({file:relative,code:'missing_marker',marker});
}
const syntaxFiles=[
  'tests/staging/helpers.mjs',
  'tests/staging/player.spec.mjs',
  'tests/staging/home-feed.spec.mjs',
  'tests/staging/auth-session.spec.mjs',
  'tests/staging/catalogue-gameplay.spec.mjs',
  'tests/staging/premium-payments.spec.mjs',
  'tests/staging/rewards.spec.mjs',
  'tests/staging/compete.spec.mjs',
  'tests/staging/account-privacy.spec.mjs',
  'tests/staging/support.spec.mjs',
  'tests/staging/responsive-pwa.spec.mjs',
  'tests/staging/admin.spec.mjs',
  'tests/staging/api-certification.mjs',
  'tests/staging/extended-api-certification.mjs',
  'tests/staging/payment-callback-certification.mjs',
  'tests/staging/restart-certification.mjs',
  'tests/staging/aggregate-certification.mjs',
  'tests/staging/generate-admin-assertions.mjs',
  'tests/staging/verify-visual-baselines.mjs',
  'tests/staging/visual.spec.mjs'
];
for(const relative of syntaxFiles){const check=spawnSync(process.execPath,['--check',join(root,relative)],{encoding:'utf8'});if(check.status!==0)findings.push({file:relative,code:'syntax_error',detail:(check.stderr||check.stdout||'').trim().slice(0,400)});}
const cert=await readFile(join(root,'.github/workflows/aws-staging-certification.yml'),'utf8').catch(()=> '');
if(/trace:\s*['"]?(?:on|retain-on-failure)/.test(cert))findings.push({file:'.github/workflows/aws-staging-certification.yml',code:'unsafe_trace_policy'});
if(/video:\s*['"]?(?:on|retain-on-failure)/.test(cert))findings.push({file:'.github/workflows/aws-staging-certification.yml',code:'unsafe_video_policy'});
const production=await readFile(join(root,'.github/workflows/aws-production.yml'),'utf8').catch(()=> '');
if(!production.includes('workflow_dispatch:'))findings.push({file:'.github/workflows/aws-production.yml',code:'production_not_manual'});
if(findings.length){console.error(JSON.stringify({ok:false,findings},null,2));process.exit(1);}
console.log(JSON.stringify({ok:true,filesChecked:Object.keys(required).length,syntaxFiles:syntaxFiles.length}));
