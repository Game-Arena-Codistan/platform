import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {catalogue} from '../../api/src/catalogue/index.mjs';

const allowedHosts=new Set(['games.codistan.org']);

export async function probeGame(game,{timeoutMs=15000,fetchImpl=fetch}={}){
  const started=Date.now();
  try{
    const response=await fetchImpl(game.gameUrl,{redirect:'follow',signal:AbortSignal.timeout(timeoutMs),headers:{'user-agent':'GameArenaRuntimeProbe/1.0'}});
    const finalUrl=new URL(response.url||game.gameUrl);
    const contentType=response.headers.get('content-type')||'';
    const reader=response.body?.getReader();let bytes=0;let sample='';
    while(reader&&bytes<524288){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;sample+=new TextDecoder().decode(value,{stream:true});}
    await reader?.cancel();
    const checks={status:response.ok,https:finalUrl.protocol==='https:',host:allowedHosts.has(finalUrl.hostname),html:/text\/html/i.test(contentType)&&/<html|<!doctype/i.test(sample)};
    return {id:game.id,title:game.title,sourceUrl:game.gameUrl,finalUrl:finalUrl.href,status:response.status,durationMs:Date.now()-started,contentType,bytesSampled:bytes,checks,ok:Object.values(checks).every(Boolean)};
  }catch(error){return{id:game.id,title:game.title,sourceUrl:game.gameUrl,durationMs:Date.now()-started,ok:false,error:error.name==='TimeoutError'?'timeout':String(error.message||error)};}
}

export async function runProbe({games=catalogue,strict=process.env.GAME_PROBE_STRICT==='1'}={}){
  const results=[];
  for(let index=0;index<games.length;index+=5){results.push(...await Promise.all(games.slice(index,index+5).map(game=>probeGame(game))));}
  const summary={generatedAt:new Date().toISOString(),total:results.length,passed:results.filter(item=>item.ok).length,failed:results.filter(item=>!item.ok).length,strict};
  await mkdir('reports',{recursive:true});
  await writeFile('reports/runtime-probe.json',JSON.stringify({summary,results},null,2));
  const rows=results.map(item=>`| ${item.title} | ${item.ok?'PASS':'FAIL'} | ${item.status??'-'} | ${item.durationMs} ms | ${item.error??Object.entries(item.checks||{}).filter(([,ok])=>!ok).map(([key])=>key).join(', ')} |`);
  await writeFile('reports/runtime-probe.md',[`# Game runtime probe`,``,`Generated: ${summary.generatedAt}`,``,`Passed: ${summary.passed}/${summary.total}`,``,`| Game | Result | HTTP | Time | Note |`,`|---|---:|---:|---:|---|`,...rows].join('\n'));
  console.log(JSON.stringify(summary));
  if(strict&&summary.failed)process.exitCode=1;
  return{summary,results};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runProbe();
