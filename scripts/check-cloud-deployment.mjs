import {access,mkdtemp,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const exec=promisify(execFile);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const required=[
  '.github/workflows/aws-deploy.yml',
  '.github/workflows/aws-infrastructure.yml',
  '.github/workflows/aws-production.yml',
  '.github/workflows/aws-rollback.yml',
  '.github/workflows/aws-staging.yml',
  '.github/workflows/aws-staging-synthetic.yml',
  '.github/workflows/release.yml',
  '.github/workflows/vercel-preview.yml',
  'apps/web/vercel.json',
  'infra/kubernetes/platform.yaml',
  'infra/kubernetes/admin.yaml',
  'infra/kubernetes/migration-job.yaml',
  'infra/kubernetes/edge-aws.yaml',
  'infra/opentofu/aws/main.tf',
  'infra/opentofu/aws/variables.tf',
  'infra/opentofu/aws/outputs.tf',
  'scripts/render-kubernetes.mjs'
];
for(const file of required)await access(join(root,file));

for(const obsolete of [
  '.github/workflows/deploy-kubernetes.yml',
  '.github/workflows/infrastructure-opentofu.yml',
  'infra/kubernetes/edge-digitalocean.yaml'
]){
  try{
    await access(join(root,obsolete));
    throw new Error(`Obsolete deployment path is still active: ${obsolete}`);
  }catch(error){
    if(error?.code!=='ENOENT')throw error;
  }
}

const env={
  ...process.env,
  IMAGE_TAG:'0123456789abcdef0123456789abcdef01234567',
  DEPLOY_ENVIRONMENT:'staging',
  PUBLIC_HOST:'preview.example.com',
  GAME_HOST:'games.example.com',
  PUBLIC_ORIGIN:'https://preview.example.com',
  ALLOWED_ORIGINS:'https://preview.example.com',
  GAME_ORIGIN:'https://games.example.com/games',
  GAME_HOSTS:'games.example.com',
  DATABASE_SSL:'true',
  OTP_PROVIDER_MODE:'mock',
  ALLOW_DEBUG_OTP:'true',
  JAZZCASH_MODE:'mock',
  ADMIN_AUTH_MODE:'gateway',
  AWS_CERTIFICATE_ARN:'arn:aws:acm:ap-south-1:123456789012:certificate/example',
  ECR_REGISTRY:'123456789012.dkr.ecr.ap-south-1.amazonaws.com',
  ECR_PREFIX:'game-arena/staging'
};

const temp=await mkdtemp(join(tmpdir(),'game-arena-cloud-'));
try{
  for(const file of ['platform.yaml','admin.yaml','migration-job.yaml','edge-aws.yaml']){
    const output=join(temp,file);
    await exec(process.execPath,['scripts/render-kubernetes.mjs',`infra/kubernetes/${file}`,output],{cwd:root,env});
    const rendered=await readFile(output,'utf8');
    if(/REPLACE_[A-Z0-9_]+/.test(rendered))throw new Error(`${file} contains unresolved placeholders.`);
  }

  const core=await readFile(join(root,'infra/kubernetes/platform.yaml'),'utf8');
  const awsEdge=await readFile(join(root,'infra/kubernetes/edge-aws.yaml'),'utf8');
  const awsDeploy=await readFile(join(root,'.github/workflows/aws-deploy.yml'),'utf8');
  const awsProduction=await readFile(join(root,'.github/workflows/aws-production.yml'),'utf8');
  const awsInfrastructure=await readFile(join(root,'.github/workflows/aws-infrastructure.yml'),'utf8');
  const release=await readFile(join(root,'.github/workflows/release.yml'),'utf8');
  const vercel=await readFile(join(root,'.github/workflows/vercel-preview.yml'),'utf8');
  const webConfig=await readFile(join(root,'apps/web/config.js'),'utf8');

  if(!core.includes('imagePullSecrets')||!core.includes('game-arena-secrets')){
    throw new Error('Kubernetes core must use private image and application secrets.');
  }
  if(core.includes('kind: Ingress'))throw new Error('Cloud-neutral core must not contain provider ingress.');
  if(!awsEdge.includes('ingressClassName: alb')||!awsEdge.includes('transforms.api')||!awsEdge.includes('REPLACE_AWS_CERTIFICATE_ARN')){
    throw new Error('AWS edge must use ALB TLS and API prefix rewriting.');
  }
  for(const marker of [
    'Production requires OTP_PROVIDER_MODE=http.',
    'Production requires JAZZCASH_MODE=hosted.',
    'Production cannot expose debug OTP codes.',
    'Verify staging evidence and promotion records',
    'Verify rollback target was previously healthy',
    'Promote immutable images from GHCR to environment ECR'
  ]){
    if(!awsDeploy.includes(marker))throw new Error(`AWS deployment workflow is missing ${marker}`);
  }
  if(!awsProduction.includes('require_staging_evidence: true')||!awsProduction.includes('confirmation must be PROMOTE.')){
    throw new Error('Production promotion must require staging evidence and explicit confirmation.');
  }
  if(!awsInfrastructure.includes('id-token: write')||!awsInfrastructure.includes('tofu plan')){
    throw new Error('AWS infrastructure workflow must use OIDC and reviewed OpenTofu plans.');
  }
  if(!release.includes('provenance: true')||!release.includes('sbom: true')){
    throw new Error('Release images must publish provenance and SBOM metadata.');
  }
  if(!vercel.includes('vercel@58.0.0')||!vercel.includes('vercel deploy --prebuilt')){
    throw new Error('Vercel preview must use the pinned prebuilt deployment flow.');
  }
  if(!webConfig.includes("mode:'mock'"))throw new Error('Frontend-only previews must default to mock mode.');

  console.log('AWS deployment checks passed.');
}finally{
  await rm(temp,{recursive:true,force:true});
}
