/** Interim Codistan portfolio CDN used for Construct builds that cannot run in an opaque same-origin sandbox. */
export const DEFAULT_PORTFOLIO_ORIGIN='https://gamesbundle.codistan.org';

function folderFromAsset(url,originHost){
  try{
    const parsed=new URL(String(url||''));
    if(parsed.hostname!==originHost)return'';
    return parsed.pathname.split('/').filter(Boolean)[0]||'';
  }catch{
    return'';
  }
}

export function portfolioFolderName(game,{origin=DEFAULT_PORTFOLIO_ORIGIN}={}){
  let host='gamesbundle.codistan.org';
  try{host=new URL(origin).hostname;}catch{/* keep default */}
  const fromAsset=folderFromAsset(game?.iconUrl,host)||folderFromAsset(game?.bannerUrl,host);
  if(fromAsset)return fromAsset;
  if(game?.title)return String(game.title).trim().split(/\s+/).join('-');
  return String(game?.id||'').split('-').map(part=>part?part.charAt(0).toUpperCase()+part.slice(1):'').filter(Boolean).join('-');
}

export function portfolioGameUrl(game,{origin=DEFAULT_PORTFOLIO_ORIGIN}={}){
  const base=String(origin||DEFAULT_PORTFOLIO_ORIGIN).replace(/\/$/,'');
  if(!game||game.internalDemo)return'';
  const current=String(game.gameUrl||'');
  if(current.startsWith(base+'/'))return current;
  if(!current.startsWith('/games/'))return'';
  const folder=portfolioFolderName(game,{origin:base});
  if(!folder)return'';
  return`${base}/${folder}/index.html`;
}

/** Rewrite controlled /games/... portfolio entrypoints to the cross-origin bundle CDN when external games are allowed. */
export function applyPortfolioDelivery(games,{origin=DEFAULT_PORTFOLIO_ORIGIN,enabled=true}={}){
  let updated=0;
  if(!enabled)return{updated,origin};
  for(const game of games||[]){
    const next=portfolioGameUrl(game,{origin});
    if(!next||game.gameUrl===next)continue;
    game.gameUrl=next;
    game.localHosted=false;
    game.deliveryOrigin=origin;
    updated+=1;
  }
  return{updated,origin};
}
