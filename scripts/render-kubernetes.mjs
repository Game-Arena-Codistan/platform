import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/render-kubernetes.mjs <input> <output>');
const environment=process.env.DEPLOY_ENVIRONMENT;
const production=environment==='production';
const values={
  REPLACE_IMAGE_TAG:process.env.IMAGE_TAG,
  REPLACE_ENVIRONMENT:environment,
  REPLACE_PUBLIC_HOST:process.env.PUBLIC_HOST,
  REPLACE_GAME_HOST:process.env.GAME_HOST,
  REPLACE_PUBLIC_ORIGIN:process.env.PUBLIC_ORIGIN,
  REPLACE_ALLOWED_ORIGINS:process.env.ALLOWED_ORIGINS,
  REPLACE_GAME_ORIGIN:process.env.GAME_ORIGIN,
  REPLACE_GAME_HOSTS:process.env.GAME_HOSTS,
  REPLACE_DATABASE_SSL:process.env.DATABASE_SSL,
  REPLACE_OTP_PROVIDER_MODE:process.env.OTP_PROVIDER_MODE,
  REPLACE_ALLOW_DEBUG_OTP:process.env.ALLOW_DEBUG_OTP,
  REPLACE_JAZZCASH_MODE:process.env.JAZZCASH_MODE,
  REPLACE_ADMIN_AUTH_MODE:process.env.ADMIN_AUTH_MODE||'signed-headers',
  REPLACE_SUPPORT_DELIVERY_MODE:process.env.SUPPORT_DELIVERY_MODE||(production?'http':'disabled'),
  REPLACE_ALLOW_EXTERNAL_GAMES:process.env.ALLOW_EXTERNAL_GAMES||(production?'false':'true'),
  REPLACE_COMPETITIONS_ENABLED:process.env.COMPETITIONS_ENABLED||'false',
  REPLACE_TLS_SECRET_NAME:process.env.TLS_SECRET_NAME,
  REPLACE_AWS_CERTIFICATE_ARN:process.env.AWS_CERTIFICATE_ARN
};

const template=await readFile(resolve(input),'utf8');
const tokens=[...new Set(template.match(/REPLACE_[A-Z0-9_]+/g)||[])];
for(const token of tokens){const value=values[token];if(value===undefined||value==='')throw new Error(`Missing deployment value for ${token}`);if(/[\r\n]/.test(value))throw new Error(`${token} must be a single-line value.`);}
if(values.REPLACE_IMAGE_TAG&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(values.REPLACE_IMAGE_TAG))throw new Error('IMAGE_TAG is invalid.');
if(values.REPLACE_ENVIRONMENT&&!/^(staging|production)$/.test(values.REPLACE_ENVIRONMENT))throw new Error('DEPLOY_ENVIRONMENT must be staging or production.');
for(const name of ['REPLACE_PUBLIC_HOST','REPLACE_GAME_HOST'])if(values[name]&&!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(values[name]))throw new Error(`${name} is not a valid DNS hostname.`);
for(const name of ['REPLACE_PUBLIC_ORIGIN','REPLACE_GAME_ORIGIN'])if(values[name]){const url=new URL(values[name]);if(url.protocol!=='https:')throw new Error(`${name} must use HTTPS.`);}
if(values.REPLACE_DATABASE_SSL&&!/^(true|false)$/.test(values.REPLACE_DATABASE_SSL))throw new Error('DATABASE_SSL must be true or false.');
for(const name of ['REPLACE_ALLOW_DEBUG_OTP','REPLACE_ALLOW_EXTERNAL_GAMES','REPLACE_COMPETITIONS_ENABLED'])if(values[name]&&!/^(true|false)$/.test(values[name]))throw new Error(`${name} must be true or false.`);
if(values.REPLACE_OTP_PROVIDER_MODE&&!/^(mock|http|disabled)$/.test(values.REPLACE_OTP_PROVIDER_MODE))throw new Error('OTP_PROVIDER_MODE is invalid.');
if(values.REPLACE_JAZZCASH_MODE&&!/^(mock|hosted|disabled)$/.test(values.REPLACE_JAZZCASH_MODE))throw new Error('JAZZCASH_MODE is invalid.');
if(values.REPLACE_ADMIN_AUTH_MODE&&!/^(local-key|signed-headers)$/.test(values.REPLACE_ADMIN_AUTH_MODE))throw new Error('ADMIN_AUTH_MODE is invalid.');
if(values.REPLACE_SUPPORT_DELIVERY_MODE&&!/^(disabled|http)$/.test(values.REPLACE_SUPPORT_DELIVERY_MODE))throw new Error('SUPPORT_DELIVERY_MODE is invalid.');

let rendered=template;
for(const token of tokens)rendered=rendered.replaceAll(token,values[token]);
const unresolved=rendered.match(/REPLACE_[A-Z0-9_]+/g);
if(unresolved)throw new Error(`Unresolved deployment placeholders: ${[...new Set(unresolved)].join(', ')}`);
await writeFile(resolve(output),rendered,'utf8');
console.log(`Rendered ${input} -> ${output}`);
