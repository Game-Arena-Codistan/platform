import {readFile} from 'node:fs/promises';

const EOCD=0x06054b50;
const CENTRAL=0x02014b50;
const MAX_COMMENT=0xffff;
const FILE_TYPES=new Set([0,0o100000,0o040000]);

function locateEocd(buffer){
  const start=Math.max(0,buffer.length-(22+MAX_COMMENT));
  for(let offset=buffer.length-22;offset>=start;offset--)if(buffer.readUInt32LE(offset)===EOCD)return offset;
  throw new Error('ZIP end-of-central-directory record is missing.');
}

function safePath(name){
  const normalized=name.normalize('NFC');
  if(!normalized||normalized.startsWith('/')||normalized.includes('\\')||normalized.includes('\0')||normalized.split('/').includes('..'))throw new Error(`Unsafe ZIP path: ${name}`);
  if(normalized.length>240)throw new Error(`ZIP path is too long: ${name}`);
  return normalized.replace(/^\.\//,'');
}

export async function preflightZip(archivePath,{maxEntries=2500,maxExpandedBytes=25*1024*1024,maxCompressionRatio=250}={}){
  const buffer=await readFile(archivePath);
  const eocd=locateEocd(buffer);
  const disk=buffer.readUInt16LE(eocd+4);const centralDisk=buffer.readUInt16LE(eocd+6);
  const entriesOnDisk=buffer.readUInt16LE(eocd+8);const totalEntries=buffer.readUInt16LE(eocd+10);
  const centralSize=buffer.readUInt32LE(eocd+12);const centralOffset=buffer.readUInt32LE(eocd+16);
  if(disk!==0||centralDisk!==0||entriesOnDisk!==totalEntries)throw new Error('Multi-disk ZIP archives are not supported.');
  if(totalEntries===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff)throw new Error('ZIP64 archives are not supported.');
  if(totalEntries>maxEntries)throw new Error(`ZIP contains ${totalEntries} entries; limit is ${maxEntries}.`);
  if(centralOffset+centralSize>eocd||centralOffset<0)throw new Error('ZIP central directory is invalid.');
  const seen=new Set();const entries=[];let expandedBytes=0;let offset=centralOffset;
  for(let index=0;index<totalEntries;index++){
    if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==CENTRAL)throw new Error('ZIP central directory entry is malformed.');
    const versionMadeBy=buffer.readUInt16LE(offset+4);const flags=buffer.readUInt16LE(offset+8);const compression=buffer.readUInt16LE(offset+10);
    const compressedBytes=buffer.readUInt32LE(offset+20);const uncompressedBytes=buffer.readUInt32LE(offset+24);
    const nameLength=buffer.readUInt16LE(offset+28);const extraLength=buffer.readUInt16LE(offset+30);const commentLength=buffer.readUInt16LE(offset+32);
    const externalAttributes=buffer.readUInt32LE(offset+38);const end=offset+46+nameLength+extraLength+commentLength;
    if(end>buffer.length)throw new Error('ZIP central directory entry exceeds archive bounds.');
    const nameBuffer=buffer.subarray(offset+46,offset+46+nameLength);const name=safePath(nameBuffer.toString(flags&0x800?'utf8':'latin1'));
    if(flags&1)throw new Error(`Encrypted ZIP entries are prohibited: ${name}`);
    if(![0,8].includes(compression))throw new Error(`Unsupported ZIP compression method for ${name}.`);
    const host=(versionMadeBy>>8)&0xff;const mode=host===3?(externalAttributes>>>16)&0xffff:0;const type=mode&0o170000;
    if(host===3&&!FILE_TYPES.has(type))throw new Error(`Symlink, device or special ZIP entry is prohibited: ${name}`);
    const directory=name.endsWith('/')||type===0o040000;
    if(directory&&uncompressedBytes!==0)throw new Error(`Directory entry has content: ${name}`);
    const collision=name.normalize('NFKC').toLowerCase();if(seen.has(collision))throw new Error(`Duplicate or case-colliding ZIP path: ${name}`);seen.add(collision);
    expandedBytes+=uncompressedBytes;if(expandedBytes>maxExpandedBytes)throw new Error(`ZIP expanded size exceeds ${maxExpandedBytes} bytes.`);
    if(!directory&&compressedBytes===0&&uncompressedBytes>0)throw new Error(`Suspicious zero-byte compressed entry: ${name}`);
    if(compressedBytes>0&&uncompressedBytes/compressedBytes>maxCompressionRatio)throw new Error(`Suspicious compression ratio for ${name}.`);
    entries.push({name,directory,compressedBytes,uncompressedBytes,mode,compression});offset=end;
  }
  if(offset!==centralOffset+centralSize)throw new Error('ZIP central directory size does not match its entries.');
  return{entries,summary:{entries:entries.length,expandedBytes,compressedBytes:buffer.length}};
}
