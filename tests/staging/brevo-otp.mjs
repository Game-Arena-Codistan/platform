import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);

const remoteScript=String.raw`
const identity=Buffer.from(process.env.QA_IDENTITY_B64||'', 'base64url').toString('utf8');
const notBefore=Number(process.env.QA_NOT_BEFORE||0);
const apiKey=process.env.BREVO_API_KEY||'';
if(!identity||!Number.isFinite(notBefore)||!apiKey){process.stderr.write('BREVO_OTP_NOT_CONFIGURED');process.exit(2);}
const headers={accept:'application/json','api-key':apiKey};
const deadline=Date.now()+45000;
while(Date.now()<deadline){
  try{
    const listResponse=await fetch('https://api.brevo.com/v3/smtp/emails?email='+encodeURIComponent(identity)+'&sort=desc&limit=10',{headers,signal:AbortSignal.timeout(10000)});
    if(!listResponse.ok){process.stderr.write('BREVO_OTP_LIST_REJECTED');process.exit(2);}
    const list=await listResponse.json();
    for(const item of list.transactionalEmails||[]){
      const sentAt=Date.parse(item.date||'');
      if(!Number.isFinite(sentAt)||sentAt+5000<notBefore)continue;
      if(!/Game Arena verification code/i.test(String(item.subject||'')))continue;
      if(!item.uuid)continue;
      const contentResponse=await fetch('https://api.brevo.com/v3/smtp/emails/'+encodeURIComponent(item.uuid),{headers,signal:AbortSignal.timeout(10000)});
      if(!contentResponse.ok)continue;
      const content=await contentResponse.json();
      const delivered=(content.events||[]).some(event=>String(event.name||'').toLowerCase()==='delivered');
      if(!delivered)continue;
      const match=String(content.body||'').match(/verification code(?: is)?\s+(\d{6})/i);
      if(match){process.stdout.write(match[1]);process.exit(0);}
    }
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,2000));
}
process.stderr.write('BREVO_OTP_NOT_DELIVERED');
process.exit(3);
`;

export async function fetchDeliveredBrevoOtp(identity,{notBefore=Date.now()-5000}={}){
  const host=String(process.env.DEPLOY_HOST||'').trim();
  const user=String(process.env.DEPLOY_USER||'').trim();
  const key=String(process.env.STAGING_QA_SSH_KEY_PATH||`${process.env.HOME||''}/.ssh/game-arena-staging`).trim();
  if(!host||!user||!key)throw new Error('BLOCKED: real staging OTP retrieval requires the protected staging SSH connection.');
  const identityB64=Buffer.from(identity,'utf8').toString('base64url');
  const remote=`cd /opt/codistan/platform && docker compose -f infra/docker-compose.staging.yml --env-file infra/.env exec -T -e QA_IDENTITY_B64=${identityB64} -e QA_NOT_BEFORE=${Math.floor(notBefore)} api node --input-type=module -`;
  try{
    const {stdout}=await execFileAsync('ssh',['-i',key,'-o','BatchMode=yes',`${user}@${host}`,remote],{input:remoteScript,timeout:60000,maxBuffer:4096});
    const code=String(stdout||'').trim();
    if(!/^\d{6}$/.test(code))throw new Error('invalid remote response');
    return code;
  }catch{
    throw new Error('BLOCKED: a delivered Brevo OTP could not be retrieved for the protected staging QA identity.');
  }
}
