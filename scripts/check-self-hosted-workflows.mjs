import {existsSync,readFileSync} from 'node:fs';

const files=[
  '.github/workflows/platform-ci.yml',
  '.github/workflows/platform-qualification.yml',
  '.github/workflows/runner-smoke.yml'
];
const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const text=path=>readFileSync(path,'utf8');

for(const path of files){
  assert(existsSync(path),`Missing self-hosted workflow: ${path}`);
  if(!existsSync(path))continue;
  const source=text(path);
  assert(source.includes('runs-on: [self-hosted, windows, x64, game-arena-ci]'),`${path} must use the dedicated Windows runner labels.`);
  assert(source.includes("vars.SELF_HOSTED_CI_ENABLED == 'true'"),`${path} must remain disabled until runner qualification.`);
  assert(source.includes('scripts/check-self-hosted-runner.sh'),`${path} must verify runner prerequisites.`);
  assert(source.includes('scripts/cleanup-self-hosted-runner.sh'),`${path} must clean the persistent runner.`);
  for(const match of source.matchAll(/uses:\s*[^@\s]+@([^\s#]+)/g)){
    assert(/^[0-9a-f]{40}$/.test(match[1]),`${path} contains an unpinned action reference: ${match[0]}`);
  }
  assert(!/runs-on:\s*(?:ubuntu-latest|windows-latest|macos-latest)/.test(source),`${path} must not allocate a GitHub-hosted runner.`);
  assert(!/AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/.test(source),`${path} must not use long-lived AWS keys.`);
}

if(existsSync('.github/workflows/platform-ci.yml')){
  const source=text('.github/workflows/platform-ci.yml');
  for(const marker of [
    'node scripts/security-check.mjs',
    'node scripts/check-pre-staging.mjs',
    'node scripts/check-api-contract.mjs',
    'node scripts/check-indexed-postgres-reports.mjs',
    'apps/api','apps/web','apps/game-ops','packages/game-bridge','apps/admin',
    'docker compose -f infra/docker-compose.yml config --quiet',
    'cancel-in-progress: true'
  ])assert(source.includes(marker),`Platform CI is missing coverage: ${marker}`);
}

if(existsSync('.github/workflows/platform-qualification.yml')){
  const source=text('.github/workflows/platform-qualification.yml');
  for(const marker of [
    'postgres:16-alpine',
    'test/postgres*.test.mjs',
    'node scripts/check-indexed-postgres-reports.mjs',
    'bash scripts/compose-integration.sh',
    'chromium firefox webkit',
    'tofu -chdir=infra/opentofu/aws validate',
    'github/codeql-action/init@',
    'github/codeql-action/analyze@',
    'cancel-in-progress: false',
    'retention-days: 7'
  ])assert(source.includes(marker),`Platform Qualification is missing coverage: ${marker}`);
}

if(existsSync('.github/workflows/runner-smoke.yml')){
  const source=text('.github/workflows/runner-smoke.yml');
  for(const marker of ['workflow_dispatch','postgres:16-alpine','playwright install chromium','tofu -chdir=infra/opentofu/aws validate']){
    assert(source.includes(marker),`Runner Smoke is missing: ${marker}`);
  }
}

for(const path of ['scripts/check-self-hosted-runner.sh','scripts/cleanup-self-hosted-runner.sh','docs/SELF-HOSTED-CI.md']){
  assert(existsSync(path),`Missing self-hosted CI support artifact: ${path}`);
}

if(failures.length){
  console.error(`Self-hosted workflow gate failed with ${failures.length} finding(s):`);
  failures.forEach(item=>console.error(`- ${item}`));
  process.exit(1);
}
console.log('Optional Windows self-hosted workflow gate passed.');
