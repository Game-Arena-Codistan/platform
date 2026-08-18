import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const required={
  '.github/workflows/release.yml':['org.opencontainers.image.revision=${{ github.sha }}','provenance: true','sbom: true'],
  '.github/workflows/deploy.yml':['Build and publish images','IMAGE_TAG:','Sync exact deployment configuration','Refusing non-SHA staging image','aws-staging-certification.yml','secrets: inherit'],
  '.github/workflows/aws-staging.yml':['Managed AWS staging deployment - future lane','AWS_MANAGED_STAGING_ENABLED'],
  '.github/workflows/aws-staging-certification.yml':['name: Staging certification - EC2 Compose','Gate zero - prove deployed Compose artifact identity','compose-identity-certification.mjs','org.opencontainers.image.revision','STAGING_QA_FREE_PLAYER_IDENTIFIER','STAGING_QA_PREMIUM_PLAYER_IDENTIFIER','STAGING_QA_ADMIN_ASSERTIONS_JSON','STAGING_JAZZCASH_WEBHOOK_SECRET','127.0.0.1:8083','READY FOR UAT','FAILED','BLOCKED','visual-baselines.json'],
  '.github/workflows/promote-production.yml':['workflow_dispatch:','uat_record:','confirmation:','No successful staging deployment + certification workflow','AUTHORIZED FOR PRODUCTION PREPARATION','NO DEPLOYMENT PERFORMED'],
  '.github/workflows/aws-production.yml':['Managed AWS production promotion - future lane','AWS_MANAGED_PRODUCTION_ENABLED','needs: guard'],
  'infra/docker-compose.staging.yml':['${IMAGE_TAG:?IMAGE_TAG is required}','${IMAGE_BASE}-api:${IMAGE_TAG}','${IMAGE_BASE}-web:${IMAGE_TAG}','${IMAGE_BASE}-admin:${IMAGE_TAG}','${IMAGE_BASE}-games:${IMAGE_TAG}','127.0.0.1:8083:8080'],
  'tests/staging/playwright.config.mjs':['retries:0','trace:\'off\'','video:\'off\'','mobile-chromium','admin-chromium','visual-chromium'],
  'tests/staging/helpers.mjs':['STAGING_QA_FREE_PLAYER_IDENTIFIER','STAGING_QA_PREMIUM_PLAYER_IDENTIFIER','STAGING_QA_OTP_CODE','signInFromAccount','assertNoHorizontalOverflow'],
  'tests/staging/player.spec.mjs':['signInFromAccount','/v1/payments/jazzcash/checkout','@critical-mobile','game-frame','sameOriginPermission','support-status'],
  'tests/staging/home-feed.spec.mjs':['approved product proposition','discovery feed','locked premium play'],
  'tests/staging/auth-session.spec.mjs':['OTP rejects a wrong code','resend guard','protected free QA account'],
  'tests/staging/catalogue-gameplay.spec.mjs':['catalogue search','premium title','isolated iframe'],
  'tests/staging/premium-payments.spec.mjs':['fixed-duration billing semantics','pending server transaction','cannot self-activate','protected premium QA account'],
  'tests/staging/rewards.spec.mjs':['top-up','STAGING_QA_VOUCHER_CODE','duplicate'],
  'tests/staging/compete.spec.mjs':['leaderboards','premium tournament','multiplayer room'],
  'tests/staging/account-privacy.spec.mjs':['preferences persist','Export data','STAGING_QA_ALLOW_ACCOUNT_DELETION'],
  'tests/staging/support.spec.mjs':['rejects invalid content','correlated QA request'],
  'tests/staging/responsive-pwa.spec.mjs':['horizontal overflow','keyboard-operable','service worker'],
  'tests/staging/admin.spec.mjs':['reports.export','subscription.manage_plans','every operations section','toBe(403)','signed admin/operator/support/security/finance'],
  'tests/staging/compose-identity-certification.mjs':['game-arena-compose-identity.v1','expectedSha','repoDigest'],
  'tests/staging/platform-baseline-certification.mjs':['game-arena-staging-baseline.v1','https-and-security-boundary','public-latency-baseline','x-content-type-options','STAGING_P95_LIMIT_MS'],
  'tests/staging/api-certification.mjs':['invalid play proof','idempotency-key','browser return incorrectly activated','PAYMENT SANDBOX NOT CONFIGURED','AUTO-QA-'],
  'tests/staging/extended-api-certification.mjs':['controlled-game-origin-and-catalogue-media','premium-game-authorization','competition-authorization-and-fixtures','platform-security-and-latency-baseline','payment-callback-matrix','premium_required','challenge_incomplete'],
  'tests/staging/payment-callback-certification.mjs':['PAYMENT SANDBOX NOT CONFIGURED','amount-mismatch-is-rejected','failure-cannot-later-become-paid','cancel-void-stays-voided','success-replay-and-refund'],
  'tests/staging/restart-certification.mjs':['did not survive API restart'],
  'tests/staging/aggregate-certification.mjs':['game-arena-staging-certification.v2','READY FOR UAT','FAILED','BLOCKED','PM_QA_ACCOUNTS_PENDING','SIGNED_ADMIN_ROLE_MATRIX_PENDING'],
  'tests/staging/verify-visual-baselines.mjs':['VISUAL_REVIEW_REQUIRED','BLOCKED'],
  'tests/staging/visual-baselines.json':['"screenshots":{}'],
  'docs/STAGING-CERTIFICATION.md':['## Deployment identity gate','## Game Arena coverage','## Visual approval','## Human UAT and production','EC2 Compose'],
  'docs/PRODUCTION-CUTOVER.md':['## Entry criteria','## Cutover rule','## Rollback triggers','## Old production retirement','same immutable SHA-tagged application artifacts']
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
  'tests/staging/compose-identity-certification.mjs',
  'tests/staging/platform-baseline-certification.mjs',
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
const stagingCompose=await readFile(join(root,'infra/docker-compose.staging.yml'),'utf8').catch(()=> '');
if(/platform-(?:api|web|admin|games|game-origin):latest/.test(stagingCompose))findings.push({file:'infra/docker-compose.staging.yml',code:'mutable_application_image'});
const production=await readFile(join(root,'.github/workflows/promote-production.yml'),'utf8').catch(()=> '');
if(!production.includes('workflow_dispatch:'))findings.push({file:'.github/workflows/promote-production.yml',code:'production_not_manual'});
if(/docker\s+compose|ssh\s+-i|kubectl\s/.test(production))findings.push({file:'.github/workflows/promote-production.yml',code:'authorization_gate_must_not_deploy'});
if(findings.length){console.error(JSON.stringify({ok:false,findings},null,2));process.exit(1);}
console.log(JSON.stringify({ok:true,filesChecked:Object.keys(required).length,syntaxFiles:syntaxFiles.length}));
