import {catalogue,pilotCatalogue,quarantinedCatalogue} from '../../api/src/catalogue/index.mjs';

const allowedHosts=new Set(['games.codistan.org']);
const pilotIds=new Set(pilotCatalogue.map(game=>game.id));
const ids=new Set();
const errors=[];
let activeCount=0;
let pilotCount=0;

for(const game of catalogue){
  if(!/^[a-z0-9-]+$/.test(game.id))errors.push(`${game.title}: invalid id`);
  if(ids.has(game.id))errors.push(`${game.title}: duplicate id`);ids.add(game.id);
  if(!['free','premium'].includes(game.tier))errors.push(`${game.title}: invalid tier`);
  if(!['portrait','landscape'].includes(game.orientation))errors.push(`${game.title}: invalid orientation`);

  if(pilotIds.has(game.id)){
    pilotCount+=1;
    if(game.status!=='paused')errors.push(`${game.title}: controlled pilot must remain paused`);
    if(Number(game.rolloutPercentage)!==0)errors.push(`${game.title}: controlled pilot rollout must remain zero`);
    if(game.version!=='1.0.0-pilot.1')errors.push(`${game.title}: unexpected controlled pilot version`);
    if(game.sourceType!=='controlled-pilot')errors.push(`${game.title}: controlled pilot source type missing`);
    if(game.rewardsEnabled!==false)errors.push(`${game.title}: controlled pilot rewards must remain disabled`);
    if(game.competitionsEnabled!==false)errors.push(`${game.title}: controlled pilot competitions must remain disabled`);
    if(game.gameUrl)errors.push(`${game.title}: controlled pilot must not expose an external URL`);
    continue;
  }

  activeCount+=1;
  if(game.status!=='live'||(game.qaStatus&&game.qaStatus!=='working'))errors.push(`${game.title}: not release-approved`);
  try{
    const url=new URL(game.gameUrl);
    if(url.protocol!=='https:'||!allowedHosts.has(url.hostname))errors.push(`${game.title}: unapproved game URL`);
  }catch{errors.push(`${game.title}: invalid game URL`);}
}

const quarantinedIds=new Set(quarantinedCatalogue.map(game=>game.id).filter(Boolean));
for(const id of ids){
  if(quarantinedIds.has(id)&&!pilotIds.has(id))errors.push(`${id}: appears in active and quarantine catalogues`);
}
for(const id of pilotIds)if(!ids.has(id))errors.push(`${id}: controlled pilot missing from runtime catalogue`);

if(catalogue.length!==46)errors.push(`expected 46 runtime catalogue records, found ${catalogue.length}`);
if(activeCount!==42)errors.push(`expected 42 active external games, found ${activeCount}`);
if(pilotCount!==4)errors.push(`expected four controlled pilots, found ${pilotCount}`);
if(quarantinedCatalogue.length!==17)errors.push(`expected 17 quarantined source rows, found ${quarantinedCatalogue.length}`);
if(errors.length)throw new Error(errors.join('\n'));
console.log(`Catalogue checks passed: ${activeCount} active external, ${pilotCount} controlled pilots, ${quarantinedCatalogue.length} quarantined source rows.`);
