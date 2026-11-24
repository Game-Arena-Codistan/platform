import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
export function createWalletTokenSeal(config){
  const hex=String(config.jazzcashTokenEncryptionKey||'');
  if(hex&&!/^[a-f0-9]{64}$/i.test(hex))throw Error('JAZZCASH_TOKEN_ENCRYPTION_KEY must be 32 bytes hex.');
  if(!hex&&config.jazzcashMode==='orchestrator'&&!['test','development'].includes(config.nodeEnv))throw Error('JAZZCASH_TOKEN_ENCRYPTION_KEY is required for orchestrator mode.');
  const key=hex?Buffer.from(hex,'hex'):randomBytes(32);
  return {
    seal(value,userId){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(String(userId)));const body=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return 'v1.'+Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');},
    open(value,userId){try{if(!String(value).startsWith('v1.'))return '';const bytes=Buffer.from(value.slice(3),'base64url');if(bytes.length<29)return '';const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(Buffer.from(String(userId)));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}catch{return '';}}
  };
}
