import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadContentLimits} from '../src/limits.mjs';
import {preflightZip} from '../src/zip-preflight.mjs';
import {scanBuild} from '../src/scanner.mjs';

function centralZip(entries){
  const central=[];
  for(const entry of entries){
    const name=Buffer.from(entry.name);const header=Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50,0);header.writeUInt16LE(0x0314,4);header.writeUInt16LE(20,6);header.writeUInt16LE(0,8);header.writeUInt16LE(0,10);
    header.writeUInt32LE(entry.compressedBytes??entry.uncompressedBytes,20);header.writeUInt32LE(entry.uncompressedBytes,24);header.writeUInt16LE(name.length,28);header.writeUInt32LE(0,42);
    central.push(header,name);
  }
  const directory=Buffer.concat(central);const eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(entries.length,8);eocd.writeUInt16LE(entries.length,10);eocd.writeUInt32LE(directory.length,12);eocd.writeUInt32LE(0,16);
  return Buffer.concat([directory,eocd]);
}

async function withTemp(fn){const root=await mkdtemp(join(tmpdir(),'game-arena-test-'));try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}}

test('pilot limits can be raised without changing safe defaults',()=>{
  const limits=loadContentLimits({GAME_ARENA_MAX_COMPRESSED_BYTES:String(128*1024*1024),GAME_ARENA_MAX_EXPANDED_BYTES:String(512*1024*1024),GAME_ARENA_MAX_ENTRIES:'5000'});
  assert.equal(limits.maxCompressedBytes,128*1024*1024);assert.equal(limits.maxExpandedBytes,512*1024*1024);assert.equal(limits.maxEntries,5000);
});

test('hard ceilings fail closed',()=>assert.throws(()=>loadContentLimits({GAME_ARENA_MAX_COMPRESSED_BYTES:String(257*1024*1024)}),/hard safety ceiling/));

test('ZIP preflight reports index and measured limits',()=>withTemp(async root=>{
  const path=join(root,'game.zip');await writeFile(path,centralZip([{name:'index.html',uncompressedBytes:100,compressedBytes:100},{name:'media/sound.ogg',uncompressedBytes:400,compressedBytes:200}]));
  const result=await preflightZip(path,{maxCompressedBytes:1024,maxExpandedBytes:1024,maxEntries:10,maxCompressionRatio:10});
  assert.equal(result.summary.entries,2);assert.equal(result.summary.expandedBytes,500);assert.equal(result.summary.rootIndex,'index.html');assert.equal(result.summary.maxCompressionRatio,2);
}));

test('ZIP preflight rejects expanded content above configured boundary',()=>withTemp(async root=>{
  const path=join(root,'game.zip');await writeFile(path,centralZip([{name:'index.html',uncompressedBytes:501,compressedBytes:501}]));
  await assert.rejects(preflightZip(path,{maxCompressedBytes:2048,maxExpandedBytes:500,maxEntries:10}),/expanded size exceeds/);
}));

test('scanner observes configured expanded-size ceiling',()=>withTemp(async root=>{
  await mkdir(join(root,'game'));await writeFile(join(root,'game','index.html'),'x'.repeat(101));
  const result=await scanBuild(join(root,'game'),{maxExpandedBytes:100,maxEntries:10});assert.equal(result.ok,false);assert.equal(result.errors[0].code,'expanded_size_limit');
}));
