import {access,mkdtemp,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const exec=promisify(execFile);
const root=resolve(new URL('..',import.meta.url).pathname);
const required=[
  '.github/workflows/deploy-kubernetes.yml',
  '.github/workflows/vercel-preview.yml',
  'apps/web/vercel.json',
  'infra/kubernetes/platform.yaml',
  'infra/kubernetes/admin.yaml',
  'infra/kubernetes/migration-job.yaml',
  'infra/kubernetes/edge-digitalocean.yaml',
  'infra/kubernetes/edge-aws.yaml',
  'scripts/render-kubernetes.mjs'
];
for(const file of required)await access(join(root,file));

const env={
  ...process.env,
  IMAGE_TAG:'0123456789abcdef',
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
  ADMIN_AUTH_MODE:'local-key',
  TLS_SECRET_NAME:'game-arena-tls',
  AWS_CERTIFICATE_ARN:'arn:aws:acm:ap-south-1:123456789012:certificate/example'
};
const temp=await mkdtemp(join(tmpdir(),'game-arena-cloud-'));
try{
  for(const file of ['platform.yaml','admin.yaml','migration-job.yaml','edge-digitalocean.yaml','edge-aws.yaml']){
    const output=join(temp,file);
    await exec(process.execPath,['scripts/render-kubernetes.mjs',`infra/kubernetes/${file}`,output],{cwd:root,env});
    const rendered=await readFile(output,'utf8');
    if(/REPLACE_[A-Z0-9_]+/.test(rendered))throw new Error(`${file} contains unresolved placeholders.`);
  }
  const core=await readFile(join(root,'infra/kubernetes/platform.yaml'),'utf8');
  const digitalocean=await readFile(join(root,'infra/kubernetes/edge-digitalocean.yaml'),'utf8');
  const aws=await readFile(join(root,'infra/kubernetes/edge-aws.yaml'),'utf8');
  const deploy=await readFile(join(root,'.github/workflows/deploy-kubernetes.yml'),'utf8');
  const vercel=await readFile(join(root,'.github/workflows/vercel-preview.yml'),'utf8');
  const webConfig=await readFile(join(root,'apps/web/config.js'),'utf8');
  if(!core.includes('imagePullSecrets')||!core.includes('game-arena-secrets'))throw new Error('Kubernetes core must use private image and application secrets.');
  if(core.includes('kind: Ingress'))throw new Error('Cloud-neutral core must not contain a provider ingress.');
  if(!digitalocean.includes('gatewayClassName: cilium')||!digitalocean.includes('URLRewrite'))throw new Error('DigitalOcean edge must use managed Gateway API routing and API prefix rewriting.');
  if(!aws.includes('ingressClassName: alb')||!aws.includes('transforms.api')||!aws.includes('REPLACE_AWS_CERTIFICATE_ARN'))throw new Error('AWS edge must use ALB TLS and API prefix rewriting.');
  for(const marker of ['digitalocean/action-doctl@v2','aws-actions/configure-aws-credentials@v4','Run backwards-compatible migrations','Production cannot use mock OTP','GHCR_READ_TOKEN'])if(!deploy.includes(marker))throw new Error(`Deployment workflow is missing ${marker}.`);
  if(!vercel.includes('vercel@58.0.0')||!vercel.includes('vercel deploy --prebuilt'))throw new Error('Vercel preview must use the pinned prebuilt deployment flow.');
  if(!webConfig.includes("mode:'mock'"))throw new Error('Frontend-only previews must default to mock mode.');
  console.log('Cloud deployment checks passed.');
}finally{
  await rm(temp,{recursive:true,force:true});
}
