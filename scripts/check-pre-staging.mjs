import {readFileSync,existsSync} from 'node:fs';

const requiredActionPins=new Map([
  ['actions/checkout','11d5960a326750d5838078e36cf38b85af677262'],
  ['actions/setup-node','49933ea5288caeca8642d1e84afbd3f7d6820020'],
  ['azure/setup-kubectl','776406bce94f63e41d621b960d78ee25c8b76ede'],
  ['azure/setup-helm','1a275c3b69536ee54be43f2070a358922e12c8d4'],
  ['aws-actions/configure-aws-credentials','7474bc4690e29a8392af63c5b98e7449536d5c3a'],
  ['actions/upload-artifact','ea165f8d65b6e75b540449e92b4886f43607fa02'],
  ['opentofu/setup-opentofu','9d84900f3238fab8cd84ce47d658d25dd008be2f'],
  ['github/codeql-action','f205ea1c3313d32999d8d6a48b4f6530d4437b38'],
  ['docker/setup-buildx-action','8d2750c68a42422c14e847fe6c8ac0403b4cbd6f'],
  ['docker/login-action','c94ce9fb468520275223c153574b00df6fe4bcc9'],
  ['docker/build-push-action','10e90e3645eae34f1e60eeb005ba3a3d33f178e8']
]);

const criticalWorkflows=[
  '.github/workflows/aws-deploy.yml',
  '.github/workflows/aws-infrastructure.yml',
  '.github/workflows/aws-production.yml',
  '.github/workflows/aws-runtime-controls.yml',
  '.github/workflows/aws-staging-synthetic.yml',
  '.github/workflows/game-content-import.yml',
  '.github/workflows/release.yml',
  '.github/workflows/codeql.yml'
];

const failures=[];
const text=path=>readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)failures.push(message);};
function hclBlock(source,header){
  const start=source.indexOf(header);
  if(start<0)return'';
  const open=source.indexOf('{',start);
  if(open<0)return'';
  let depth=0;
  for(let index=open;index<source.length;index+=1){
    if(source[index]==='{')depth+=1;
    if(source[index]==='}'){
      depth-=1;
      if(depth===0)return source.slice(start,index+1);
    }
  }
  return'';
}

for(const path of criticalWorkflows){
  assert(existsSync(path),`Missing critical workflow: ${path}`);
  if(!existsSync(path))continue;
  const source=text(path);
  for(const match of source.matchAll(/uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\/[A-Za-z0-9_./-]+)?@([^\s#]+)/g)){
    const [,action,ref]=match;
    const expected=requiredActionPins.get(action);
    if(expected)assert(ref===expected,`${path} must pin ${action} to ${expected}; found ${ref}`);
    else assert(/^[0-9a-f]{40}$/.test(ref),`${path} contains an unreviewed action ref: ${action}@${ref}`);
  }
}

for(const path of [
  '.github/workflows/aws-deploy.yml',
  '.github/workflows/aws-infrastructure.yml',
  '.github/workflows/aws-production.yml',
  '.github/workflows/aws-runtime-controls.yml',
  '.github/workflows/aws-staging-synthetic.yml',
  '.github/workflows/game-content-import.yml'
]){
  const source=text(path);
  assert(source.includes('vars.AWS_ACCOUNT_ID'),`${path} must require AWS_ACCOUNT_ID.`);
  assert(source.includes('allowed-account-ids:'),`${path} must pass allowed-account-ids to AWS authentication.`);
}

const deploy=text('.github/workflows/aws-deploy.yml');
assert(!deploy.includes('ADMIN_API_KEYS'),'.github/workflows/aws-deploy.yml must not deploy ADMIN_API_KEYS.');
assert(!deploy.includes('admin_api_keys'),'.github/workflows/aws-deploy.yml must not read legacy admin_api_keys.');

const versions=text('infra/opentofu/aws/versions.tf');
for(const marker of [
  'required_version = "= 1.12.1"',
  'version = "= 6.57.1"',
  'version = "= 3.9.0"',
  'version = "= 4.3.0"',
  'allowed_account_ids = [var.expected_aws_account_id]'
]){
  assert(versions.includes(marker),`OpenTofu dependency or account pin missing: ${marker}`);
}

const variables=text('infra/opentofu/aws/variables.tf');
const kubernetesBlock=hclBlock(variables,'variable "kubernetes_version"');
assert(Boolean(kubernetesBlock),'Missing kubernetes_version variable.');
assert(kubernetesBlock.includes('type        = string'),'kubernetes_version must be a string.');
assert(kubernetesBlock.includes('validation {'),'kubernetes_version must be validated.');
assert(!kubernetesBlock.includes('default'),'kubernetes_version must not have a default.');
assert(!kubernetesBlock.includes('nullable'),'kubernetes_version must be non-nullable.');

const operations=text('infra/opentofu/aws/operations-variables.tf');
for(const name of ['operations_alert_email','github_runtime_role_arn']){
  const block=hclBlock(operations,`variable "${name}"`);
  assert(Boolean(block),`Missing required variable ${name}.`);
  assert(!block.includes('default'),`${name} must not have a default.`);
  assert(!block.includes('nullable'),`${name} must be non-nullable.`);
  assert(block.includes('validation {'),`${name} must be validated.`);
}

const controls=text('infra/opentofu/aws/pre-staging-controls.tf');
for(const marker of ['expected_aws_account_id','monthly_budget_usd','aws_budgets_budget','terraform_data','precondition','data.aws_caller_identity.current.account_id']){
  assert(controls.includes(marker),`Blocking pre-staging control missing: ${marker}`);
}

for(const path of ['infra/opentofu/aws/staging.tfvars.example','infra/opentofu/aws/production.tfvars.example']){
  const source=text(path);
  for(const marker of ['expected_aws_account_id','kubernetes_version','operations_alert_email','monthly_budget_usd','github_runtime_role_arn']){
    assert(source.includes(marker),`${path} is missing ${marker}.`);
  }
}

if(failures.length){
  console.error(`Pre-staging gate failed with ${failures.length} finding(s):`);
  failures.forEach(item=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Pre-staging repository gate passed.');
