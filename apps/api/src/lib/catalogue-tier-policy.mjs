/** Guest-playable free titles from the 60-game Codistan bundle. All other portfolio games are premium. */
export const FREE_PORTFOLIO_GAME_IDS=Object.freeze([
  'touch-ball',
  'brick-out',
  'fruit-slasher',
  'flappy-ball',
  'jelly-match-3',
  'duck-shooter',
  'crazy-runner',
  'fishing-frenzy',
  'traffic',
  'quick-dice'
]);

const freeSet=new Set(FREE_PORTFOLIO_GAME_IDS);

export function isFreePortfolioGame(id){
  return freeSet.has(String(id||''));
}

/** Apply free/premium policy to runtime catalogue records. Keeps Arena Dash free. */
export function applyCatalogueTier(games,{preserveDemo=true}={}){
  let updated=0;
  for(const game of games||[]){
    if(preserveDemo&&(game.internalDemo||game.id==='arena-dash')){
      if(game.tier!=='free'){game.tier='free';updated+=1;}
      continue;
    }
    const next=isFreePortfolioGame(game.id)?'free':'premium';
    if(game.tier!==next){game.tier=next;updated+=1;}
  }
  return{updated,free:FREE_PORTFOLIO_GAME_IDS.length};
}
