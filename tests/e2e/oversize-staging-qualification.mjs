import { chromium, firefox, webkit } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin=(process.env.STAGING_ORIGIN||'https://gsmarena-play.codistan.org').replace(/\/$/,'');
const evidenceFile=resolve(process.env.EVIDENCE_FILE||'report/oversize-staging-qualification.json');
const here=dirname(fileURLToPath(import.meta.url));
const repoRoot=resolve(here,'../..');
const games=[
  ['duck-hunter','1.0.0-pilot.1'],
  ['ranger-vs-zombies','1.0.0-pilot.1'],
  ['robotex','1.0.0-pilot.1'],
  ['swat-vs-zombies','1.0.0-pilot.1']
];
const browsers={chromium,firefox,webkit};
const profiles={
  desktop:{width:1366,height:768,isMobile:false,hasTouch:false},
  mobilePortrait:{width:390,height:844,isMobile:true,hasTouch:true},
  mobileLandscape:{width:844,height:390,isMobile:true,hasTouch:true}
};

const expected=[];
for(const [slug,version] of games){
  const manifest=JSON.parse(await readFile(resolve(repoRoot,`catalogue/releases/${slug}/${version}.json`),'utf8'));
  if(manifest.productionActivation!==false) throw new Error(`${slug}: productionActivation must remain false`);
  if(manifest.slug!==slug||manifest.version!==version) throw new Error(`${slug}: release metadata identity mismatch`);
  expected.push({slug,version,gameUrl:manifest.gameUrl,buildSha256:manifest.buildSha256,entrypoint:manifest.entrypoint});
}

const catalogueResponse=await fetch(`${origin}/api/v1/catalog/games`,{signal:AbortSignal.timeout(20000)});
if(!catalogueResponse.ok) throw new Error(`Catalogue request failed: HTTP ${catalogueResponse.status}`);
const catalogue=await catalogueResponse.json();
const byId=new Map((catalogue.games||[]).map(game=>[game.id,game]));
const catalogueFailures=[];
for(const item of expected){
  const record=byId.get(item.slug);
  if(!record) { catalogueFailures.push(`${item.slug}: missing from public catalogue`); continue; }
  if(record.status!=='live'||Number(record.rolloutPercentage)!==100) catalogueFailures.push(`${item.slug}: not live at 100% rollout`);
  if(record.gameUrl!==item.gameUrl) catalogueFailures.push(`${item.slug}: gameUrl mismatch`);
  if(record.rewardsEnabled!==false||record.competitionsEnabled!==false) catalogueFailures.push(`${item.slug}: rewards or competitions enabled`);
}
if(catalogueFailures.length) throw new Error(catalogueFailures.join('\n'));

const results=[];
for(const [browserName,browserType] of Object.entries(browsers)){
  const browser=await browserType.launch({headless:true});
  try{
    for(const item of expected){
      for(const [profileName,profile] of Object.entries(profiles)){
        const context=await browser.newContext({
          viewport:{width:profile.width,height:profile.height},
          isMobile:profile.isMobile,
          hasTouch:profile.hasTouch,
          ignoreHTTPSErrors:false
        });
        const page=await context.newPage();
        const pageErrors=[];
        const consoleErrors=[];
        const requestFailures=[];
        const badResponses=[];
        page.on('pageerror',error=>pageErrors.push(error.message));
        page.on('console',message=>{ if(message.type()==='error') consoleErrors.push(message.text()); });
        page.on('requestfailed',request=>requestFailures.push({url:request.url(),resourceType:request.resourceType(),error:request.failure()?.errorText||'failed'}));
        page.on('response',response=>{ if(response.status()>=400) badResponses.push({url:response.url(),status:response.status(),resourceType:response.request().resourceType()}); });
        const started=Date.now();
        let navigationStatus=null;
        let render={};
        let fatal='';
        try{
          const response=await page.goto(`${origin}${item.gameUrl}`,{waitUntil:'domcontentloaded',timeout:45000});
          navigationStatus=response?.status()??null;
          if(!response||!response.ok()) throw new Error(`navigation HTTP ${navigationStatus}`);
          await page.waitForTimeout(5000);
          render=await page.evaluate(()=>{
            const visible=element=>{
              const rect=element.getBoundingClientRect();
              const style=getComputedStyle(element);
              return rect.width>8&&rect.height>8&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0;
            };
            const canvases=[...document.querySelectorAll('canvas')].filter(visible).map(canvas=>({width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height}));
            const otherSurfaces=[...document.querySelectorAll('video,img,iframe')].filter(visible).length;
            const resources=performance.getEntriesByType('resource');
            const navigation=performance.getEntriesByType('navigation')[0];
            const bridgeDetected=Boolean(globalThis.GameArena||globalThis.gameArena||globalThis.GameBridge||globalThis.gameBridge);
            return {
              readyState:document.readyState,
              visibleCanvasCount:canvases.length,
              canvases,
              visibleOtherSurfaceCount:otherSurfaces,
              bodyTextLength:(document.body?.innerText||'').trim().length,
              bodyChildCount:document.body?.children.length||0,
              resourceCount:resources.length,
              transferredBytes:resources.reduce((sum,entry)=>sum+(entry.transferSize||entry.encodedBodySize||0),0),
              domContentLoadedMs:navigation?.domContentLoadedEventEnd||null,
              loadEventMs:navigation?.loadEventEnd||null,
              bridgeDetected,
              audioElementCount:document.querySelectorAll('audio').length
            };
          });
          const hasSurface=render.visibleCanvasCount>0||render.visibleOtherSurfaceCount>0||render.bodyTextLength>20;
          if(!hasSurface) throw new Error('no visible render surface after launch');
          const criticalRequestFailures=requestFailures.filter(item=>['document','script','stylesheet'].includes(item.resourceType));
          const criticalBadResponses=badResponses.filter(item=>['document','script','stylesheet'].includes(item.resourceType));
          if(criticalRequestFailures.length) throw new Error(`critical request failures: ${criticalRequestFailures.length}`);
          if(criticalBadResponses.length) throw new Error(`critical HTTP errors: ${criticalBadResponses.length}`);
          if(pageErrors.length) throw new Error(`uncaught page errors: ${pageErrors.length}`);
        }catch(error){
          fatal=error?.message||String(error);
        }
        results.push({
          slug:item.slug,
          version:item.version,
          browser:browserName,
          profile:profileName,
          viewport:{width:profile.width,height:profile.height},
          url:`${origin}${item.gameUrl}`,
          navigationStatus,
          durationMs:Date.now()-started,
          render,
          pageErrors,
          consoleErrors,
          requestFailures,
          badResponses,
          fatal,
          passed:!fatal
        });
        await context.close();
      }
    }
  }finally{
    await browser.close();
  }
}

const failed=results.filter(result=>!result.passed);
const evidence={
  schemaVersion:1,
  decision:failed.length?'NOT_READY':'READY',
  origin,
  games:expected,
  catalogueGames:Array.isArray(catalogue.games)?catalogue.games.length:0,
  expectedTitles:4,
  browsers:Object.keys(browsers),
  profiles:Object.keys(profiles),
  checksRun:results.length,
  checksPassed:results.length-failed.length,
  rewardsEnabled:false,
  competitionsEnabled:false,
  playOnlyQualification:true,
  scoreIntegrityCertified:false,
  rightsCertified:false,
  productionActivation:false,
  results,
  failures:failed.map(result=>({slug:result.slug,browser:result.browser,profile:result.profile,fatal:result.fatal}))
};
await mkdir(dirname(evidenceFile),{recursive:true});
await writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n','utf8');
console.log(JSON.stringify({decision:evidence.decision,checksRun:evidence.checksRun,checksPassed:evidence.checksPassed,failures:evidence.failures}));
if(failed.length) process.exitCode=1;
