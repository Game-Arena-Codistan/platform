#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {
  PortfolioError,archivePlan,buildPlan,discoverPortfolio,hydratePlan,
  readRecords,reconcilePortfolio,selectRecords,shardPlan,
  validateCatalogue,validateSourceManifest
} from './portfolio-core.mjs';

function parse(argv){
  const [command,...rest]=argv;const options={_:[]};
  for(let index=0;index<rest.length;index+=1){
    const token=rest[index];
    if(!token.startsWith('--')){options._.push(token);continue;}
    const [name,inline]=token.slice(2).split('=',2);
    const value=inline??(rest[index+1]&&!rest[index+1].startsWith('--')?rest[++index]:true);
    if(options[name]===undefined)options[name]=value;
    else options[name]=[].concat(options[name],value);
  }
  return{command,options};
}
function required(options,name){const value=options[name];if(!value||value===true)throw new PortfolioError(`--${name} is required.`);return String(value);}
function list(value){return value===undefined?[]:[].concat(value).flatMap(item=>String(item).split(',')).map(item=>item.trim()).filter(Boolean);}
async function json(path){return JSON.parse(await readFile(path,'utf8'));}
async function output(value,path){
  const serialized=`${JSON.stringify(value,null,2)}\n`;
  if(!path||path==='-'){process.stdout.write(serialized);return;}
  await mkdir(dirname(resolve(path)),{recursive:true});await writeFile(path,serialized,{encoding:'utf8',mode:0o600});
  console.error(`Wrote ${path}`);
}
async function inputs(options){
  const catalogue=validateCatalogue(await readRecords(required(options,'catalogue')),{maxTitles:Number(options['max-titles']||500)});
  const selected=selectRecords(catalogue,list(options.slugs));
  const sourcePath=options.sources?String(options.sources):'';
  const sources=sourcePath?(await readRecords(sourcePath)).map(validateSourceManifest):[];
  return{catalogue,selected,sources};
}

const usage=`Game Arena portfolio CLI

Commands:
  inventory --root DIR [--output FILE]
  verify --catalogue FILE [--sources FILE] [--max-titles 500]
  archive --catalogue FILE --sources FILE [--slugs a,b] [--environment staging] [--output FILE]
  hydrate --catalogue FILE --sources FILE [--slugs a,b] [--output FILE]
  build --catalogue FILE --sources FILE [--slugs a,b] [--output FILE]
  shard-plan --catalogue FILE [--max-titles 50] [--output FILE]
  reconcile --catalogue FILE --sources FILE --releases FILE --source-inventory FILE --artifact-inventory FILE [--output FILE]

All commands are deterministic metadata operations. They never upload source, change an active version, or enable rollout.`;

async function main(){
  const {command,options}=parse(process.argv.slice(2));
  if(!command||command==='help'||options.help){console.log(usage);return;}
  if(command==='inventory')return output(await discoverPortfolio(required(options,'root')),options.output);
  if(command==='verify'){
    const {catalogue,sources}=await inputs(options);const sourceSlugs=new Set(sources.map(item=>item.slug));
    const missing=catalogue.filter(item=>item.source.state!=='missing'&&!sourceSlugs.has(item.slug)).map(item=>item.slug);
    if(missing.length)throw new PortfolioError(`Source manifests missing for: ${missing.join(', ')}`);
    return output({schemaVersion:'1.0.0',kind:'portfolio-verification',ok:true,catalogueCount:catalogue.length,sourceManifestCount:sources.length,activeCount:catalogue.filter(item=>item.operations.status==='active').length,pausedCount:catalogue.filter(item=>item.operations.status==='paused').length,generatedAt:new Date().toISOString()},options.output);
  }
  if(command==='archive'){
    const {selected,sources}=await inputs(options);return output(archivePlan(selected,sources,{environment:String(options.environment||'staging')}),options.output);
  }
  if(command==='hydrate'){
    const {selected,sources}=await inputs(options);return output(hydratePlan(selected,sources),options.output);
  }
  if(command==='build'){
    const {selected,sources}=await inputs(options);return output(buildPlan(selected,sources),options.output);
  }
  if(command==='shard-plan'){
    const {catalogue}=await inputs(options);return output(shardPlan(catalogue,{maxTitles:Number(options['max-titles']||50),maxEstimatedBytes:Number(options['max-bytes']||2*1024*1024*1024)}),options.output);
  }
  if(command==='reconcile'){
    const {catalogue,sources}=await inputs(options);
    const releases=await readRecords(required(options,'releases'));
    const sourceInventory=await json(required(options,'source-inventory'));
    const artifactInventory=await json(required(options,'artifact-inventory'));
    const result=reconcilePortfolio(catalogue,sources,releases,{sourceInventory,artifactInventory});
    await output(result,options.output);if(!result.ok)process.exitCode=2;return;
  }
  throw new PortfolioError(`Unknown command: ${command}\n\n${usage}`);
}

main().catch(error=>{
  const code=error instanceof PortfolioError?error.code:'portfolio_failed';
  console.error(JSON.stringify({error:{code,message:error.message,details:error.details||[]}},null,2));
  process.exitCode=1;
});
