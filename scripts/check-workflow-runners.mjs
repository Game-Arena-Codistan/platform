import {readdir,readFile} from 'node:fs/promises';

const directory=new URL('../.github/workflows/',import.meta.url);
const files=(await readdir(directory)).filter(name=>/\.ya?ml$/i.test(name)).sort();
const hosted=/runs-on\s*:\s*(?:\[[^\]]*)?(?:ubuntu-|windows-|macos-)/i;
const unlabelled=/runs-on\s*:\s*self-hosted\s*$/im;
const linuxSelector=/runs-on\s*:\s*\[[^\]]*\blinux\b[^\]]*\]/i;
const deferredWindowsPorts=new Set(['aws-deploy.yml']);
const failures=[];

for(const file of files){
  const content=await readFile(new URL(file,directory),'utf8');
  if(hosted.test(content))failures.push(`${file}: GitHub-hosted runner selector remains`);
  if(unlabelled.test(content))failures.push(`${file}: self-hosted jobs must include windows, x64 and game-arena-ci labels`);
  if(linuxSelector.test(content)&&!deferredWindowsPorts.has(file)){
    failures.push(`${file}: Linux runner selector remains; Game Arena uses the existing Windows host`);
  }
}

if(failures.length){
  console.error(failures.join('\n'));
  process.exitCode=1;
}else{
  console.log(`Validated ${files.length} workflows: routine CI and protected controls use the Windows self-hosted runner.`);
  console.log('aws-deploy.yml is a manual reusable workflow and will receive final Windows execution validation during AWS staging.');
}
