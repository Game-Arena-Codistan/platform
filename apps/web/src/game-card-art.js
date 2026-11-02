const palettes=[['#7c3aed','#22d3ee'],['#db2777','#f97316'],['#0f766e','#84cc16'],['#1d4ed8','#a855f7'],['#b45309','#ef4444'],['#0369a1','#14b8a6']];

export function fallbackArt(index=0){
  return `linear-gradient(135deg,${palettes[index%palettes.length][0]},${palettes[index%palettes.length][1]})`;
}

function cssSafeUrl(url){
  return String(url||'').trim().replace(/["\\\n\r\u0000-\u001f]/g,'');
}

function fixBrokenProtocol(url){
  return String(url||'').trim().replace(/^https\/\//i,'https://').replace(/^http\/\//i,'http://');
}

function isSpriteSheet(url){
  return /(?:^|\/)(?:shared-\d+-sheet|background[-_]?sheet|gamebackground-sheet|ground\d*-sheet|groundroad[^/]*-sheet)/i.test(url)
    || /sheet\d*\.(?:png|jpe?g|webp)$/i.test(url);
}

function isUsefulBanner(url){
  if(!url||isSpriteSheet(url))return false;
  return /(?:banner|cover|poster|hero|thumb|preview)\.[a-z0-9]+$/i.test(url)
    || /\.(?:webp|jpe?g)$/i.test(url);
}

/** Map /games/{slug}/{version}/... or /demo-games/{slug}/... to the release root. */
export function localReleaseBase(gameUrl=''){
  const match=String(gameUrl).match(/^(\/(?:games|demo-games)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?)/);
  return match?match[1]:'';
}

/**
 * Prefer CSP-safe same-origin game icons packaged with each title.
 * Fall back to usable catalogue banners/icons, then a palette gradient.
 */
export function resolveCardArt(game={},index=0){
  if((game.preview||game.internalDemo)&&game.art&&!String(game.art).includes('url('))return game.art;

  const base=localReleaseBase(game.gameUrl);
  // Demo shells may not ship Construct icons; portfolio releases do.
  const localIcon=base&&!base.startsWith('/demo-games/')?`${base}/icons/icon-256.png`:'';
  const banner=fixBrokenProtocol(game.bannerUrl||game.banner||'');
  const icon=fixBrokenProtocol(game.iconUrl||game.icon||'');

  let image='';
  if(banner.startsWith('/')&&isUsefulBanner(banner))image=banner;
  else if(localIcon)image=localIcon;
  else if(isUsefulBanner(banner)&&/^https:\/\//i.test(banner))image=banner;
  else if(icon.startsWith('/')||/^https:\/\//i.test(icon))image=icon;

  if(!image){
    if(game.preview||game.internalDemo){
      return 'radial-gradient(circle at 70% 15%,rgba(255,255,255,.28),transparent 22%),linear-gradient(145deg,#5b21b6,#0891b2 55%,#0f172a)';
    }
    return fallbackArt(index);
  }
  const safe=cssSafeUrl(image);
  if(!safe)return fallbackArt(index);
  return `linear-gradient(180deg,rgba(4,3,10,.55) 0%,rgba(4,3,10,.22) 34%,rgba(4,3,10,.88) 72%,rgba(4,3,10,.97) 100%),url("${safe}") center/cover no-repeat`;
}
