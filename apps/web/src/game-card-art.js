const palettes=[['#7c3aed','#22d3ee'],['#db2777','#f97316'],['#0f766e','#84cc16'],['#1d4ed8','#a855f7'],['#b45309','#ef4444'],['#0369a1','#14b8a6']];

/** Curated full-bleed card art for demos / unusable packaged icons (e.g. Construct defaults). */
export const CARD_ART_OVERRIDES={
  'arena-dash':'/assets/card-art/arena-dash.jpg',
  'car-physics':'/assets/card-art/car-physics.jpg'
};

/** Titles whose packaged snap lives at release-root icon-256.png instead of icons/. */
const ROOT_ICON_SLUGS=new Set(['candy-super-lines','super-color-lines-match-5']);

export function fallbackArt(index=0){
  return `linear-gradient(135deg,${palettes[index%palettes.length][0]},${palettes[index%palettes.length][1]})`;
}

function cssSafeUrl(url){
  return String(url||'').trim().replace(/["\\\n\r\u0000-\u001f]/g,'');
}

function fixBrokenProtocol(url){
  return String(url||'').trim().replace(/^https\/\//i,'https://').replace(/^http\/\//i,'http://');
}

/** games.codistan.org icon hosts often 400; portfolio CDN uses Title-Case folders. */
function rewriteDeadGamesHost(url=''){
  const raw=String(url||'').trim();
  const match=raw.match(/^https:\/\/games\.codistan\.org\/([A-Za-z0-9._-]+)(\/.*)?$/i);
  if(!match)return raw;
  const folder=match[1].split(/[-_]/).filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1).toLowerCase()).join('-');
  const rest=match[2]||'/icons/icon-256.png';
  return `https://gamesbundle.codistan.org/${folder}${rest.startsWith('/')?rest:`/${rest}`}`;
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

function isLikelyIcon(url){
  if(!url||isSpriteSheet(url))return false;
  return /\/icons\/icon-\d+\.(?:png|jpe?g|webp)$/i.test(url)
    || /(?:^|\/)icon-\d+\.(?:png|jpe?g|webp)$/i.test(url)
    || /\/icons\//i.test(url);
}

function gameSlug(game={}){
  const raw=String(game.slug||game.id||'').trim().toLowerCase();
  return /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(raw)?raw:'';
}

function releaseVersion(game={}){
  const version=String(game.version||'').trim();
  if(!version||version==='demo'||version==='external')return'';
  return version;
}

/**
 * Map /games/{slug}/{version}/... or /demo-games/{slug}/... to the release root.
 * Never include entry HTML (index.html) in the base.
 */
export function localReleaseBase(gameUrl=''){
  const raw=String(gameUrl||'');
  const demo=raw.match(/^(\/demo-games\/[A-Za-z0-9._-]+)/);
  if(demo)return demo[1];
  const hosted=raw.match(/^(\/games\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)/);
  return hosted?hosted[1]:'';
}

/** Same-origin packaged snap when slug/version are known (works even if gameUrl was rewritten to CDN). */
export function packagedIconPath(game={}){
  if(game.internalDemo||game.preview)return'';
  const slug=gameSlug(game);
  const version=releaseVersion(game);
  if(!slug||!version)return'';
  if(ROOT_ICON_SLUGS.has(slug))return `/games/${slug}/${version}/icon-256.png`;
  return `/games/${slug}/${version}/icons/icon-256.png`;
}

function withArtOverlay(imageUrl){
  const safe=cssSafeUrl(imageUrl);
  if(!safe)return'';
  // Use single-quoted url() so style="--art:..." is not truncated by double quotes.
  return `linear-gradient(180deg,rgba(4,3,10,.28) 0%,rgba(4,3,10,.12) 42%,rgba(4,3,10,.82) 78%,rgba(4,3,10,.96) 100%),url('${safe}') center/cover no-repeat`;
}

/**
 * Prefer curated snaps, then CSP-safe same-origin packaged icons, then catalogue icons.
 * Catalogue banners often 404 on the portfolio CDN — never prefer them over working icons.
 */
export function resolveCardArt(game={},index=0){
  const id=String(game.id||game.slug||'').trim();
  const curated=CARD_ART_OVERRIDES[id]||'';
  // Curated snaps win first so demos like Arena Dash still show real card art.
  if(curated)return withArtOverlay(curated);

  if((game.preview||game.internalDemo)&&game.art&&!String(game.art).includes('url('))return game.art;

  const base=localReleaseBase(game.gameUrl);
  const localIcon=base&&!base.startsWith('/demo-games/')?`${base}/icons/icon-256.png`:'';
  const packaged=packagedIconPath(game);
  const banner=rewriteDeadGamesHost(fixBrokenProtocol(game.bannerUrl||game.banner||''));
  const icon=rewriteDeadGamesHost(fixBrokenProtocol(game.iconUrl||game.icon||''));
  // Mock catalogue gameUrls are on games.codistan.org — derive a portfolio icon when none is packaged.
  const portfolioFromGameUrl=rewriteDeadGamesHost(fixBrokenProtocol(game.gameUrl||'').replace(/\/?$/,'/icons/icon-256.png'));

  let image='';
  if(packaged)image=packaged;
  else if(localIcon)image=localIcon;
  else if(isLikelyIcon(icon)&&(/^https:\/\//i.test(icon)||icon.startsWith('/')))image=icon;
  else if(isLikelyIcon(portfolioFromGameUrl)&&/^https:\/\//i.test(portfolioFromGameUrl))image=portfolioFromGameUrl;
  else if(banner.startsWith('/')&&isUsefulBanner(banner))image=banner;
  else if(isUsefulBanner(banner)&&/^https:\/\//i.test(banner))image=banner;
  else if(icon.startsWith('/')||/^https:\/\//i.test(icon))image=icon;

  if(!image){
    if(game.preview||game.internalDemo){
      return 'radial-gradient(circle at 70% 15%,rgba(255,255,255,.28),transparent 22%),linear-gradient(145deg,#5b21b6,#0891b2 55%,#0f172a)';
    }
    return fallbackArt(index);
  }
  return withArtOverlay(rewriteDeadGamesHost(image))||fallbackArt(index);
}
