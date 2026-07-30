import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {probeGame} from '../src/probe.mjs';
import {packageBuild} from '../src/package-build.mjs';

const response=(body,{url='https://games.codistan.org/example/',status=200,type='text/html'}={})=>({
  url,status,ok:status>=200&&status<300,headers:new Headers({'content-type':type}),body:new Response(body).body
});

test('probe accepts an HTTPS HTML entry point on the approved host',async()=>{
  const result=await probeGame({id:'example',title:'Example',gameUrl:'https://games.codistan.org/example/'},{fetchImpl:async()=>response('<!doctype html><html></html>')});
  assert.equal(result.ok,true);
});

test('probe rejects redirects outside the approved host',async()=>{
  const result=await probeGame({id:'example',title:'Example',gameUrl:'https://games.codistan.org/example/'},{fetchImpl:async()=>response('<html></html>',{url:'https://example.com/game/'})});
  assert.equal(result.ok,false);assert.equal(result.checks.host,false);
});

test('packager creates a versioned build with hashes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'arena-game-'));const source=join(root,'source');const output=join(root,'out');await mkdir(source);
  await writeFile(join(source,'index.html'),'<!doctype html><script src="game.js"></script>');await writeFile(join(source,'game.js'),'console.log("ready")');
  const manifest=await packageBuild({id:'example-game',version:'1.0.0',sourceDir:source,outputRoot:output});
  assert.equal(manifest.files.length,2);assert.equal(manifest.entrypoint,'/games/example-game/1.0.0/index.html');
  const stored=JSON.parse(await readFile(join(output,'games/example-game/1.0.0/game-manifest.json'),'utf8'));assert.equal(stored.totalBytes,manifest.totalBytes);
});
