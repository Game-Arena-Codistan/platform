const DEFAULT_LANDING_CAMPAIGN={utm:'D',package:'default',parameter:'default',payment:'jazzcash'};
const LANDING1_CAMPAIGN={utm:'T',package:'1',parameter:'monthly10k',payment:'jazzcash'};
const pick=(value,fallback)=>{const raw=String(value??'').trim();return raw||fallback;};

export function normalizeLandingCampaign(input={},defaults=DEFAULT_LANDING_CAMPAIGN){
  return{
    utm:pick(input.utm,defaults.utm),
    package:pick(input.package,defaults.package),
    parameter:pick(input.parameter,defaults.parameter),
    payment:pick(input.payment,defaults.payment)
  };
}
export function normalizeLanding1Campaign(input={}){return normalizeLandingCampaign(input,LANDING1_CAMPAIGN);}
/** @deprecated Use normalizeLanding1Campaign */
export function normalizeLanding2Campaign(input={}){return normalizeLanding1Campaign(input);}

export function planCodeForPackage(packageId){
  const value=String(packageId||'').trim().toLowerCase();
  if(value==='2'||value==='yearly')return 'yearly';
  return 'monthly';
}

export function buildLandingQuery(campaign){
  const params=new URLSearchParams({utm:campaign.utm,package:campaign.package,parameter:campaign.parameter,payment:campaign.payment});
  return `?${params.toString()}`;
}
export function buildLandingPath(campaign=DEFAULT_LANDING_CAMPAIGN){return `/mainLanding${buildLandingQuery(normalizeLandingCampaign(campaign))}`;}
export function buildLanding1Path(campaign=LANDING1_CAMPAIGN){return `/landing1${buildLandingQuery(normalizeLanding1Campaign(campaign))}`;}
/** @deprecated Use buildLanding1Path */
export function buildLanding2Path(campaign){return buildLanding1Path(campaign);}

export function defaultLandingHref(planId='monthly'){
  const yearly=planId==='yearly'||planId==='2';
  return buildLandingPath({utm:'D',package:yearly?'2':'default',parameter:'default',payment:'jazzcash'});
}

export function campaignFromSearchParams(searchParams,landing){
  const input=Object.fromEntries(new URLSearchParams(searchParams).entries());
  return landing==='landing1'?normalizeLanding1Campaign(input):normalizeLandingCampaign(input);
}

export function commerceForCampaign(campaign){
  const planCode=planCodeForPackage(campaign.package);
  const monthly10k=String(campaign.parameter).toLowerCase()==='monthly10k';
  const discounted=planCode==='yearly'&&String(campaign.parameter).toLowerCase()==='20percentoff';
  const value=planCode==='yearly'?(discounted?3999:4999):599;
  return{
    planCode,
    item_id:planCode,
    item_name:planCode==='yearly'?'Game Arena+ Yearly':'Game Arena+ Monthly',
    value,
    currency:'PKR',
    conversion_event:planCode==='yearly'?'purchase':'subscribe',
    comingSoon:planCode==='yearly',
    promotion:monthly10k?'Win PKR 10,000 JazzCash Credit Every Month':null,
    offerNote:monthly10k
      ?'Subscribe Now click kertay he Rs. 1 kat lia jae ga. Ye limited TikTok offer sirf aj k din k liye valid hai. Us k bad PKR 599/m lago hun gay.'
      :'Subscribe Now click kertay he Rs. 1 kat lia jae ga. Ye limited offer sirf aj k din k liye valid hai. Us k bad PKR 599/m lago hun gay.'
  };
}

export function attributionForLanding(campaign,{landing,landingPath}){
  return{
    utm:campaign.utm,
    utm_source:campaign.utm,
    package:campaign.package,
    parameter:campaign.parameter,
    payment:campaign.payment,
    landing,
    landingPath
  };
}

export{DEFAULT_LANDING_CAMPAIGN,LANDING1_CAMPAIGN,LANDING1_CAMPAIGN as LANDING2_CAMPAIGN};
