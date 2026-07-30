import {randomUUID} from 'node:crypto';
const STATES=new Set(['draft','review','scheduled','live','paused','retired']);
const TRANSITIONS={draft:new Set(['review','retired']),review:new Set(['draft','scheduled','live','retired']),scheduled:new Set(['review','live','paused','retired']),live:new Set(['paused','retired']),paused:new Set(['live','retired']),retired:new Set([])};
const EDITABLE=new Set(['title','description','genre','genres','tier','orientation','iconUrl','bannerUrl','minDeviceTier','rolloutPercentage']);

export class CatalogueAdmin{
  constructor(initial=[]){this.games=new Map();this.audit=[];this.reports=[];for(const game of initial)this.importGame(game,{actor:'catalogue-import',reason:'initial import'});}
  record(actor,action,target,details={}){const event={id:randomUUID(),at:new Date().toISOString(),actor,action,target,details};this.audit.push(event);return event;}
  importGame(game,{actor,reason='bulk import'}={}){
    if(!actor)throw new Error('actor is required');if(!game?.id)throw new Error('game id is required');
    const existing=this.games.get(game.id);const version=game.version||'external';
    const record=existing??{id:game.id,state:'draft',versions:[],activeVersion:null,createdAt:new Date().toISOString()};
    if(!record.versions.some(item=>item.version===version))record.versions.push({version,gameUrl:game.gameUrl,manifest:structuredClone(game),status:'review',createdAt:new Date().toISOString()});
    Object.assign(record,structuredClone(game),{state:existing?.state??(game.status==='live'?'live':'draft'),activeVersion:existing?.activeVersion??version,updatedAt:new Date().toISOString()});this.games.set(record.id,record);this.record(actor,'game.imported',record.id,{version,reason});return structuredClone(record);
  }
  bulkImport(games,context){return games.map(game=>this.importGame(game,context));}
  edit(id,patch,{actor,reason}={}){const game=this.require(id);if(!actor||!reason)throw new Error('actor and reason are required');for(const key of Object.keys(patch))if(!EDITABLE.has(key))throw new Error(`Field is not editable: ${key}`);if(patch.rolloutPercentage!==undefined&&(!Number.isInteger(patch.rolloutPercentage)||patch.rolloutPercentage<0||patch.rolloutPercentage>100))throw new Error('rolloutPercentage must be 0–100');Object.assign(game,structuredClone(patch),{updatedAt:new Date().toISOString()});this.record(actor,'game.edited',id,{fields:Object.keys(patch),reason});return structuredClone(game);}
  transition(id,next,{actor,reason,scheduledAt}={}){const game=this.require(id);if(!STATES.has(next)||!TRANSITIONS[game.state].has(next))throw new Error(`Invalid transition ${game.state} -> ${next}`);if(!actor||!reason)throw new Error('actor and reason are required');if(next==='scheduled'&&!scheduledAt)throw new Error('scheduledAt is required');const previous=game.state;game.state=next;game.status=next;game.scheduledAt=next==='scheduled'?scheduledAt:null;game.updatedAt=new Date().toISOString();this.record(actor,'game.state_changed',id,{previous,next,reason,scheduledAt});return structuredClone(game);}
  addVersion(id,version,{actor,reason}={}){const game=this.require(id);if(!actor||!reason||!version?.version)throw new Error('actor, reason and version are required');if(game.versions.some(item=>item.version===version.version))throw new Error('version already exists');game.versions.push({...structuredClone(version),status:'review',createdAt:new Date().toISOString()});this.record(actor,'game.version_added',id,{version:version.version,reason});return structuredClone(game);}
  rollback(id,version,{actor,reason}={}){const game=this.require(id);if(!actor||!reason)throw new Error('actor and reason are required');const target=game.versions.find(item=>item.version===version);if(!target)throw new Error('version not found');const previous=game.activeVersion;game.activeVersion=version;game.gameUrl=target.gameUrl??game.gameUrl;game.updatedAt=new Date().toISOString();this.record(actor,'game.rolled_back',id,{previous,version,reason});return structuredClone(game);}
  reportBroken(id,{actor='player',version,code,details}={}){const game=this.require(id);const report={id:randomUUID(),gameId:id,version:version||game.activeVersion,code:String(code||'unknown').slice(0,80),details:String(details||'').slice(0,500),createdAt:new Date().toISOString(),status:'open'};this.reports.push(report);this.record(actor,'game.broken_reported',id,{reportId:report.id,version:report.version,code:report.code});return structuredClone(report);}
  visibleFor(id,{deviceTier='lite',bucket=0}={}){const game=this.require(id);const order={lite:0,standard:1,high:2};return game.state==='live'&&order[deviceTier]>=order[game.minDeviceTier||'lite']&&bucket<=(game.rolloutPercentage??100);}
  listAudit({target}={}){return this.audit.filter(item=>!target||item.target===target).map(structuredClone);}
  require(id){const game=this.games.get(id);if(!game)throw new Error('game not found');return game;}
}
