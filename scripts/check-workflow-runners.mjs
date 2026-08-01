import {readdir,readFile} from 'node:fs/promises';

const directory=new URL('../.github/workflows/',import.meta.url);
const files=(await readdir(directory)).filter(name=>/\.ya?ml$/i.test(name)).sort();
const hosted=/runs-on\s*:\s*(?:\[[^\]]*)?(?:ubuntu-|windows-|macos-)/i;
const unlabelled=/runs-on\s*:\s*self-hosted\s*$/im;
const failures=[];

for(const file of files){
  const content=await readFile(new URL(file,directory),'utf8');
  if(hosted.test(content))failures.push(`${file}: GitHub-hosted runner selector remains`);
  if(unlabelled.test(content))failures.push(`${file}: self-hosted jobs must include linux, x64 and game-arena-ci labels`);
}

if(failures.length){
  console.error(failures.join('\n'));
  process.exitCode=1;
}else{
  console.log(`Validated ${files.length} workflows: no GitHub-hosted runner selectors remain.`);
}
