import {copyFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {downloadRemoteFile,inspectImageFile} from './remote-source.mjs';

export async function importArtwork({slug,kind,url,outputRoot='../game-origin/public/artwork',maxBytes=5*1024*1024}){
  if(!/^[a-z0-9][a-z0-9-]*$/.test(slug))throw new Error('Invalid artwork slug.');if(!/^[a-z][a-z0-9-]*$/.test(kind))throw new Error('Invalid artwork kind.');
  const work=await mkdtemp(join(tmpdir(),'game-arena-art-'));const temp=join(work,'asset');
  try{
    const source=await downloadRemoteFile({url,destination:temp,maxBytes});const image=await inspectImageFile(temp,source.contentType);const destination=resolve(outputRoot,slug,`${kind}.${image.extension}`);await mkdir(dirname(destination),{recursive:true});await copyFile(temp,destination);
    const record={slug,kind,path:destination.replace(`${resolve(outputRoot)}/`,''),mime:image.mime,size:image.size,sha256:source.sha256,sourceUrl:source.sourceUrl,importedAt:new Date().toISOString()};await writeFile(`${destination}.json`,JSON.stringify(record,null,2));return record;
  }finally{await rm(work,{recursive:true,force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [slug,kind,url,outputRoot]=process.argv.slice(2);if(!slug||!kind||!url)throw new Error('Usage: node src/artwork-import.mjs <slug> <kind> <https-url> [output-root]');console.log(JSON.stringify(await importArtwork({slug,kind,url,outputRoot}),null,2));
}
