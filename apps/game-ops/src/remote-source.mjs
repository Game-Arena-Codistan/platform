import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {open,readFile,stat} from 'node:fs/promises';
import {isIP} from 'node:net';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {DEFAULT_CONTENT_LIMITS} from './limits.mjs';

const DEFAULT_MAX_BYTES=DEFAULT_CONTENT_LIMITS.maxCompressedBytes;
const MAX_REDIRECTS=5;

function ipv4Private(host){
  const parts=host.split('.').map(Number);if(parts.length!==4||parts.some(value=>!Number.isInteger(value)||value<0||value>255))return false;
  const [a,b]=parts;
  return a===10||a===127||a===0||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19));
}
function ipv6Private(host){const value=host.toLowerCase();return value==='::1'||value==='::'||value.startsWith('fe80:')||value.startsWith('fc')||value.startsWith('fd');}

export function assertPublicHttpsUrl(input){
  const url=input instanceof URL?new URL(input):new URL(String(input).trim());
  if(url.protocol!=='https:')throw new Error('Remote source must use HTTPS.');
  if(url.username||url.password)throw new Error('Credentials in remote URLs are prohibited.');
  if(url.port&&url.port!=='443')throw new Error('Only the standard HTTPS port is allowed.');
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))throw new Error(`Private host is prohibited: ${host||'(empty)'}`);
  const ipVersion=isIP(host);if((ipVersion===4&&ipv4Private(host))||(ipVersion===6&&ipv6Private(host)))throw new Error(`Private IP source is prohibited: ${host}`);
  return url;
}

export function extractDriveFileId(input){
  const url=new URL(String(input).trim());
  const pathMatch=url.pathname.match(/\/file\/d\/([^/]+)/);if(pathMatch)return pathMatch[1];
  const id=url.searchParams.get('id');return id||null;
}

export function normalizeRemoteUrl(input){
  const original=assertPublicHttpsUrl(input);
  if(['drive.google.com','docs.google.com'].includes(original.hostname)){
    const id=extractDriveFileId(original);if(id){
      const target=new URL('https://drive.usercontent.google.com/download');target.searchParams.set('id',id);target.searchParams.set('export','download');target.searchParams.set('confirm','t');
      const resourceKey=original.searchParams.get('resourcekey');if(resourceKey)target.searchParams.set('resourcekey',resourceKey);return target;
    }
  }
  if(original.hostname==='www.dropbox.com'||original.hostname==='dropbox.com'){original.searchParams.set('dl','1');}
  return original;
}

export function redactRemoteUrl(input){const url=new URL(input);url.username='';url.password='';url.search='';url.hash='';return url.toString();}

async function responseFor(url,{timeoutMs,redirects=0}={}){
  const safe=assertPublicHttpsUrl(url);const response=await fetch(safe,{redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{accept:'application/zip,application/octet-stream,image/*;q=0.9,*/*;q=0.1','user-agent':'GameArenaContentImporter/1.0'}});
  if(response.status>=300&&response.status<400){
    if(redirects>=MAX_REDIRECTS)throw new Error('Remote source exceeded the redirect limit.');
    const location=response.headers.get('location');if(!location)throw new Error(`Redirect ${response.status} did not include a location.`);
    return responseFor(new URL(location,safe),{timeoutMs,redirects:redirects+1});
  }
  if(!response.ok)throw new Error(`Remote source returned HTTP ${response.status}.`);
  return {response,finalUrl:safe};
}

export async function downloadRemoteFile({url,destination,maxBytes=DEFAULT_MAX_BYTES,timeoutMs=30000}){
  const normalized=normalizeRemoteUrl(url);const {response,finalUrl}=await responseFor(normalized,{timeoutMs});
  const declared=Number(response.headers.get('content-length')||0);if(declared>maxBytes)throw new Error(`Remote file declares ${declared} bytes; limit is ${maxBytes}.`);
  if(!response.body)throw new Error('Remote source returned an empty body.');
  const hash=createHash('sha256');let size=0;
  const meter=new Transform({transform(chunk,_encoding,callback){size+=chunk.length;if(size>maxBytes)return callback(new Error(`Remote file exceeded ${maxBytes} bytes.`));hash.update(chunk);callback(null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(destination,{flags:'wx',mode:0o600}));
  const info=await stat(destination);if(!info.isFile()||info.size===0)throw new Error('Remote file is empty.');
  return {size,sha256:hash.digest('hex'),contentType:(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),sourceUrl:redactRemoteUrl(finalUrl)};
}

export async function assertZipFile(path){
  const handle=await open(path,'r');try{const buffer=Buffer.alloc(4);const {bytesRead}=await handle.read(buffer,0,4,0);if(bytesRead<4||!(buffer[0]===0x50&&buffer[1]===0x4b&&[0x03,0x05,0x07].includes(buffer[2])&&[0x04,0x06,0x08].includes(buffer[3])))throw new Error('Downloaded file is not a ZIP archive.');}finally{await handle.close();}
}

export function detectImage(buffer,contentType=''){
  const type=contentType.toLowerCase();
  if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {extension:'png',mime:'image/png'};
  if(buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return {extension:'jpg',mime:'image/jpeg'};
  if(buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return {extension:'webp',mime:'image/webp'};
  if(buffer.length>=6&&['GIF87a','GIF89a'].includes(buffer.toString('ascii',0,6)))return {extension:'gif',mime:'image/gif'};
  const prefix=buffer.toString('utf8',0,Math.min(buffer.length,4096)).trimStart();if(type==='image/svg+xml'||prefix.startsWith('<svg')||prefix.startsWith('<?xml'))return {extension:'svg',mime:'image/svg+xml'};
  throw new Error(`Unsupported image content${contentType?` (${contentType})`:''}.`);
}

export async function inspectImageFile(path,contentType=''){
  const buffer=await readFile(path);const detected=detectImage(buffer,contentType);
  if(detected.extension==='svg'){
    const text=buffer.toString('utf8');if(/<script\b|\bon\w+\s*=|javascript:|data:text\/html|<foreignObject\b/i.test(text))throw new Error('Unsafe active content detected in SVG artwork.');
  }
  return {...detected,size:buffer.length};
}
