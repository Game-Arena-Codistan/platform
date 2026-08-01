import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  PortfolioError,archivePlan,buildPlan,discoverPortfolio,hydratePlan,
  readRecords,reconcilePortfolio,shardPlan,validateCatalogue,validateCatalogueRecord
} from '../src/portfolio-core.mjs';

const examples=new URL('../../../portfolio/examples/',import.meta.url);
const catalogue=validateCatalogue(await readRecords(new URL('catalogue.jsonl',examples)));
const sources=await readRecords(new URL('sources.jsonl',examples));
const releases=await readRecords(new URL('releases.jsonl',examples));

test('catalogue enforces activation, rights and rollout invariants',()=>{
  assert.equal(catalogue.length,2);
  const unsafe=structuredClone(catalogue[1]);unsafe.operations.status='active';unsafe.operations.rolloutPercentage=5;
  assert.throws(()=>validateCatalogueRecord(unsafe),PortfolioError);
  const duplicate=[catalogue[0],structuredClone(catalogue[0])];
  assert.throws(()=>validateCatalogue(duplicate),/Duplicate catalogue slug/);
});

test('archive, hydrate and build plans are deterministic and rights-bound',()=>{
  const archive=archivePlan(catalogue,sources);
  assert.equal(archive.items.length,2);
  assert.equal(archive.items[0].packages[0].requiredEncryption,'aws:kms');
  const hydrate=hydratePlan([catalogue[0]],sources);
  assert.equal(hydrate.items[0].objects[0].vaultKey,'sources/html5/arena-dash/1111111111111111111111111111111111111111111111111111111111111111.zip');
  const build=buildPlan([catalogue[0]],sources);
  assert.equal(build.items[0].artifactPrefix,'games/arena-dash/1.0.0/');
  assert.throws(()=>buildPlan([catalogue[1]],sources),/rights are not approved/);
});

test('shard plan caps titles and groups by engine',()=>{
  const expanded=[];
  for(let index=0;index<103;index+=1){const item=structuredClone(catalogue[0]);item.slug=`game-${index}`;item.title=`Game ${index}`;item.source.manifestRef=`sources/game-${index}.json`;expanded.push(item);}
  const plan=shardPlan(expanded,{maxTitles:50});
  assert.deepEqual(plan.shards.map(item=>item.titleCount),[50,50,3]);
  assert.ok(plan.shards.every(item=>item.engine==='html5'));
});

test('source inventory hashes a stable tree and rejects symlinks',async()=>{
  const root=await mkdtemp(join(tmpdir(),'game-arena-portfolio-'));
  try{
    const game=join(root,'Test Game');await mkdir(join(game,'assets'),{recursive:true});
    await writeFile(join(game,'index.html'),'<main>test</main>');
    await writeFile(join(game,'assets','data.json'),'{}');
    const inventory=await discoverPortfolio(root);
    assert.equal(inventory.titleCount,1);
    assert.equal(inventory.titles[0].slug,'test-game');
    assert.equal(inventory.titles[0].engine,'html5');
    assert.equal(inventory.titles[0].fileCount,2);
    assert.match(inventory.titles[0].treeSha256,/^[a-f0-9]{64}$/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('reconciliation proves immutable objects and fails closed on missing artifacts',()=>{
  const sourceInventory={Contents:sources.flatMap(item=>item.packages.map(pkg=>({Key:pkg.vaultKey}))) };
  const artifactInventory={Contents:[{Key:releases[0].artifact.key},{Key:releases[0].artifact.manifestKey}]};
  const result=reconcilePortfolio(catalogue,sources,releases,{sourceInventory,artifactInventory});
  assert.equal(result.ok,true);
  const broken=reconcilePortfolio(catalogue,sources,releases,{sourceInventory,artifactInventory:{Contents:[]}});
  assert.equal(broken.ok,false);
  assert.ok(broken.findings.some(item=>item.code==='artifact_object_missing'));
});
