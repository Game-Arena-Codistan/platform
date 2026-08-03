import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const required={
  'AGENTS.md':['## Mission','## Architecture invariants','## Game Arena+ feature rules','## Game onboarding rules','## Validation matrix'],
  'CONTRIBUTING.md':['## Before starting','## Required validation','## Payments and premium features','## Adding or changing a game'],
  'docs/AI-NATIVE-DEVELOPMENT.md':['## Context layers','## Standard work packet','## Premium-feature development lane','## Game-integration lane','## AI review protocol'],
  'docs/ISSUE-GOVERNANCE.md':['## Issue classes','## Priority convention','## Lifecycle','## Closing rules','## AI-assisted triage'],
  '.github/pull_request_template.md':['## Outcome','## Architecture and data','## Safety and operations','## Evidence boundary'],
  '.github/ISSUE_TEMPLATE/bug.yml':['name: Bug report','id: reproduce','id: baseline','id: safety'],
  '.github/ISSUE_TEMPLATE/feature.yml':['name: Feature proposal','id: outcome','id: rollout','id: acceptance'],
  '.github/ISSUE_TEMPLATE/game-onboarding.yml':['name: Game onboarding','id: rights','id: bridge','id: defaults'],
  '.github/ISSUE_TEMPLATE/config.yml':['blank_issues_enabled: false','AWS staging and production gate']
};

const findings=[];
const texts=new Map();
for(const [relative,markers] of Object.entries(required)){
  let text='';
  try{text=await readFile(join(root,relative),'utf8');}
  catch{findings.push({file:relative,code:'missing_required_context'});continue;}
  texts.set(relative,text);
  for(const marker of markers)if(!text.includes(marker))findings.push({file:relative,code:'missing_context_marker',marker});
}

const readme=await readFile(join(root,'README.md'),'utf8');
for(const link of ['AGENTS.md','CONTRIBUTING.md','docs/AI-NATIVE-DEVELOPMENT.md','docs/ISSUE-GOVERNANCE.md']){
  if(!readme.includes(link))findings.push({file:'README.md',code:'missing_development_link',link});
}

const agents=texts.get('AGENTS.md')||'';
for(const invariant of ['PostgreSQL is the deployed source of truth','Games are untrusted content','Vercel stays deterministic and mock-only','AWS access is OIDC-based']){
  if(!agents.includes(invariant))findings.push({file:'AGENTS.md',code:'missing_safety_invariant',invariant});
}

const gameTemplate=texts.get('.github/ISSUE_TEMPLATE/game-onboarding.yml')||'';
for(const safeDefault of ['paused at rollout 0','Rewards remain disabled','Competitions remain disabled','No game archive']){
  if(!gameTemplate.includes(safeDefault))findings.push({file:'.github/ISSUE_TEMPLATE/game-onboarding.yml',code:'missing_game_safe_default',safeDefault});
}

if(findings.length){
  console.error(JSON.stringify({ok:false,findings},null,2));
  process.exit(1);
}

console.log(JSON.stringify({ok:true,contextFiles:Object.keys(required).length,readmeLinks:4}));