import {catalogue,quarantinedCatalogue} from '../../api/src/catalogue/index.mjs';

const allowedHosts=new Set(['games.codistan.org']);
const ids=new Set();
const errors=[];

for(const game of catalogue){
  if(!/^[a-z0-9-]+$/.test(game.id))errors.push(`${game.title}: invalid id`);
  if(ids.has(game.id))errors.push(`${game.title}: duplicate id`);ids.add(game.id);
  if(!['free','premium'].includes(game.tier))errors.push(`${game.title}: invalid tier`);
  if(!['portrait','landscape'].includes(game.orientation))errors.push(`${game.title}: invalid orientation`);
  if(game.status!=='live'||game.qaStatus!=='working')errors.push(`${game.title}: not release-approved`);
  try{const url=new URL(game.gameUrl);if(url.protocol!=='https:'||!allowedHosts.has(url.hostname))errors.push(`${game.title}: unapproved game URL`);}catch{errors.push(`${game.title}: invalid game URL`);}
}

const quarantinedIds=new Set(quarantinedCatalogue.map(game=>game.id).filter(Boolean));
for(const id of ids)if(quarantinedIds.has(id))errors.push(`${id}: appears in live and quarantine catalogues`);
if(catalogue.length!==44)errors.push(`expected 44 live games, found ${catalogue.length}`);
if(quarantinedCatalogue.length!==17)errors.push(`expected 17 quarantined games, found ${quarantinedCatalogue.length}`);
if(errors.length)throw new Error(errors.join('\n'));
console.log(`Catalogue checks passed: ${catalogue.length} live, ${quarantinedCatalogue.length} quarantined.`);
