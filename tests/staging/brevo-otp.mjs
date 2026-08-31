import {spawn} from 'node:child_process';

const remoteScript=String.raw`
const identity=Buffer.from(process.env.QA_IDENTITY_B64||'', 'base64url').toString('utf8');
const notBefore=Number(process.env.QA_NOT_BEFORE||0);
const apiKey=process.env.BREVO_API_KEY||'';
if(!identity||!Number.isFinite(notBefore)||!apiKey){process.stderr.write('BREVO_OTP_NOT_CONFIGURED');process.exit(2);}
const headers={accept:'application/json','api-key':apiKey};
const deadline=Date.now()+90000;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
while(Date.now()<deadline){
  try{
    const listResponse=await fetch('https://api.brevo.com/v3/smtp/emails?email='+encodeURIComponent(identity)+'&sort=desc&limit=10',{headers,signal:AbortSignal.timeout(10000)});
    if(!listResponse.ok){
      if(listResponse.status===429||listResponse.status>=500){await pause(3000);continue;}
      process.stderr.write('BREVO_OTP_LIST_REJECTED_'+listResponse.status);process.exit(2);
    }
    const list=await listResponse.json();
    for(const item of list.transactionalEmails||[]){
      const sentAt=Date.parse(item.date||'');
      if(!Number.isFinite(sentAt)||sentAt+5000<notBefore)continue;
      if(!/Game Arena verification code/i.test(String(item.subject||'')))continue;
      if(!item.uuid)continue;
      const contentResponse=await fetch('https://api.brevo.com/v3/smtp/emails/'+encodeURIComponent(item.uuid),{headers,signal:AbortSignal.timeout(10000)});
      if(!contentResponse.ok){
        if(contentResponse.status===429||contentResponse.status>=500){await pause(2000);break;}
        process.stderr.write('BREVO_OTP_CONTENT_REJECTED_'+contentResponse.status);process.exit(2);
      }
      const content=await contentResponse.json();
      const delivered=(content.events||[]).some(event=>String(event.name||'').toLowerCase()==='delivered');
      if(!delivered)continue;
      const readableBody=String(content.body||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
      const match=readableBody.match(/verification code(?: is)?\s+(\d{6})/i);
      if(match){process.stdout.write(match[1]);process.exit(0);}
    }
  }catch{}
  await pause(2000);
}
process.stderr.write('BREVO_OTP_NOT_DELIVERED');
process.exit(3);
`;

function runSsh(args,input,{timeout=105000,maxBuffer=4096}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn('ssh',args,{stdio:['pipe','pipe','pipe']});
    const stdout=[];const stderr=[];let size=0;let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;child.kill('SIGKILL');reject(new Error('BREVO_OTP_SSH_TIMEOUT'));}},timeout);
    const append=(target,chunk)=>{size+=chunk.length;if(size>maxBuffer){if(!settled){settled=true;clearTimeout(timer);child.kill('SIGKILL');reject(new Error('BREVO_OTP_SSH_OUTPUT_LIMIT'));}return;}target.push(chunk);};
    child.stdout.on('data',chunk=>append(stdout,chunk));
    child.stderr.on('data',chunk=>append(stderr,chunk));
    child.on('error',()=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error('BREVO_OTP_SSH_ERROR'));}});
    child.on('close',code=>{if(settled)return;settled=true;clearTimeout(timer);const out=Buffer.concat(stdout).toString('utf8');if(code===0){resolve(out);return;}const err=Buffer.concat(stderr).toString('utf8');const marker=err.match(/BREVO_OTP_[A-Z0-9_]+/)?.[0]||`BREVO_OTP_SSH_EXIT_${code}`;reject(new Error(marker));});
    child.stdin.on('error',()=>{});
    child.stdin.end(input);
  });
}

export async function fetchDeliveredBrevoOtp(identity,{notBefore=Date.now()-5000}={}){
  const host=String(process.env.DEPLOY_HOST||'').trim();
  const user=String(process.env.DEPLOY_USER||'').trim();
  const key=String(process.env.STAGING_QA_SSH_KEY_PATH||`${process.env.HOME||''}/.ssh/game-arena-staging`).trim();
  const imageBase=String(process.env.IMAGE_BASE||'').trim();
  const imageTag=String(process.env.IMAGE_TAG||process.env.EXPECTED_RELEASE_SHA||'').trim();
  if(!host||!user||!key)throw new Error('BLOCKED: real staging OTP retrieval requires the protected staging SSH connection.');
  if(!/^[a-z0-9./:_-]+$/i.test(imageBase)||!/^[0-9a-f]{40}$/.test(imageTag))throw new Error('BLOCKED: real staging OTP retrieval requires the exact immutable staging image identity.');
  const identityB64=Buffer.from(identity,'utf8').toString('base64url');
  const remote=`cd /opt/codistan/platform && IMAGE_BASE=${imageBase} IMAGE_TAG=${imageTag} docker compose -f infra/docker-compose.staging.yml --env-file infra/.env exec -T -e QA_IDENTITY_B64=${identityB64} -e QA_NOT_BEFORE=${Math.floor(notBefore)} api node --input-type=module -`;
  try{
    const stdout=await runSsh(['-i',key,'-o','BatchMode=yes',`${user}@${host}`,remote],remoteScript);
    const code=String(stdout||'').trim();
    if(!/^\d{6}$/.test(code))throw new Error('BREVO_OTP_INVALID_REMOTE_RESPONSE');
    return code;
  }catch(error){
    const marker=String(error?.message||'BREVO_OTP_UNKNOWN').match(/BREVO_OTP_[A-Z0-9_]+/)?.[0]||'BREVO_OTP_UNKNOWN';
    throw new Error(`BLOCKED: delivered Brevo OTP verification failed (${marker}).`);
  }
}
