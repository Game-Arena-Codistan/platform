import {dirname,resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {importArtwork} from './artwork-import.mjs';
import {readRichSheet} from './google-sheets.mjs';
import {importRemoteBuild} from './import-remote.mjs';

const normalize=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
const slugify=value=>String(value||'game').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
function parseArgs(argv){const result={};for(let index=0;index<argv.length;index++){const item=argv[index];if(!item.startsWith('--'))continue;const key=item.slice(2);const next=argv[index+1];if(!next||next.startsWith('--'))result[key]=true;else{result[key]=next;index++;}}return result;}
function valueFor(record,names){for(const name of names){const cell=record[normalize(name)];if(cell?.link)return cell.link;if(cell?.text)return cell.text;}return'';}
function recordsFromRows(rows){if(rows.length<2)return[];const headers=rows[0].map(cell=>normalize(cell.text));return rows.slice(1).map(cells=>Object.fromEntries(headers.map((header,index)=>[header,cells[index]||{text:'',link:null}]))).filter(record=>Object.values(record).some(cell=>cell.text||cell.link));}
function manifestFor(record){
  const title=valueFor(record,['Game Name','World of Warcraft Classic grapich','Title']);const slug=slugify(title);const orientation=valueFor(record,['Orientation']).toLowerCase();
  return {slug,title:title.trim(),version:'auto',entryFile:'index.html',orientation:['portrait','landscape'].includes(orientation)?orientation:'any',permissions:{fullscreen:true,pointerLock:false,orientationLock:false},bridge:{required:false,version:'1.0'},metadata:{source:'Game Now Submission',description:valueFor(record,['Game Description (150 words or less)']),genre:valueFor(record,['Genre 1'])}};
}

export async function importCatalogue({rows,outputRoot,auditRoot,artworkRoot,dryRun=false,limit=100,onlySlug=''}){
  const records=recordsFromRows(rows);const results=[];
  for(const record of records){if(results.length>=limit)break;const manifest=manifestFor(record);if(!manifest.slug||onlySlug&&manifest.slug!==onlySlug)continue;const zipUrl=valueFor(record,['Zip URL','ZIP','Build URL']);if(!zipUrl){results.push({slug:manifest.slug,status:'skipped',reason:'missing_zip_url'});continue;}
    try{
      const imported=await importRemoteBuild({zipUrl,manifest,outputRoot,auditRoot,actor:'catalogue-import',dryRun});const artwork=[];
      if(!dryRun){for(const [kind,names] of Object.entries({icon:['Icons/Logo','Icon URL'],banner:['Banners (For Premium Games - 345x200 For New Games - 260 x 160 For Exclusive Games - 260 x 160)','Banner URL'],featured:['Featured Graphics','Featured Banner - 260x160']})){const url=valueFor(record,names);if(url)artwork.push(await importArtwork({slug:manifest.slug,kind,url,outputRoot:artworkRoot}));}}
      results.push({slug:manifest.slug,status:'imported',release:imported.release,artwork});
    }catch(error){results.push({slug:manifest.slug,status:'failed',error:error.message});}
  }
  return {createdAt:new Date().toISOString(),dryRun,total:results.length,imported:results.filter(item=>item.status==='imported').length,failed:results.filter(item=>item.status==='failed').length,skipped:results.filter(item=>item.status==='skipped').length,results};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const options=parseArgs(process.argv.slice(2));let rows;
  if(options['input-json'])rows=JSON.parse(await readFile(resolve(options['input-json']),'utf8'));else{
    if(!options['spreadsheet-id']||!options['sheet-name'])throw new Error('Use --input-json or provide --spreadsheet-id and --sheet-name.');rows=await readRichSheet({spreadsheetId:options['spreadsheet-id'],sheetName:options['sheet-name'],endRow:Number(options['end-row']||1000)});
  }
  const report=await importCatalogue({rows,outputRoot:resolve(options['output-root']||'../game-origin/public'),auditRoot:resolve(options['audit-root']||'reports/audit'),artworkRoot:resolve(options['artwork-root']||'../game-origin/public/artwork'),dryRun:Boolean(options['dry-run']),limit:Number(options.limit||100),onlySlug:options.slug||''});
  const reportPath=resolve(options.report||'reports/catalogue-import.json');await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
}
