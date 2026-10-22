const DEFAULT_LANDING_CAMPAIGN={utm:'D',package:'default',parameter:'default',payment:'jazzcash'};
const LANDING2_CAMPAIGN={utm:'T',package:'2',parameter:'20percentoff',payment:'jazzcash'};
const pick=(value,fallback)=>{const raw=String(value??'').trim();return raw||fallback;};
export function normalizeLandingCampaign(input={},defaults=DEFAULT_LANDING_CAMPAIGN){
  return{
    utm:pick(input.utm,defaults.utm),
    package:pick(input.package,defaults.package),
    parameter:pick(input.parameter,defaults.parameter),
    payment:pick(input.payment,defaults.payment)
  };
}
export function normalizeLanding2Campaign(input={}){return normalizeLandingCampaign(input,LANDING2_CAMPAIGN);}
export function planCodeForPackage(packageId){
  const value=String(packageId||'').trim().toLowerCase();
  if(value==='2'||value==='yearly')return 'yearly';
  return 'monthly';
}
export function buildLandingQuery(campaign){
  const params=new URLSearchParams({utm:campaign.utm,package:campaign.package,parameter:campaign.parameter,payment:campaign.payment});
  return `?${params.toString()}`;
}
export function buildLandingPath(campaign){return `/mainLanding${buildLandingQuery(campaign)}`;}
export function buildLanding2Path(campaign){return `/landing2${buildLandingQuery(campaign)}`;}
export function campaignFromSearchParams(searchParams,landing){
  const input=Object.fromEntries(new URLSearchParams(searchParams).entries());
  return landing==='landing2'?normalizeLanding2Campaign(input):normalizeLandingCampaign(input);
}
export function commerceForCampaign(campaign){
  const planCode=planCodeForPackage(campaign.package);
  const discounted=planCode==='yearly'&&String(campaign.parameter).toLowerCase()==='20percentoff';
  const value=planCode==='yearly'?(discounted?3999:4999):599;
  return{
    planCode,
    item_id:planCode,
    item_name:planCode==='yearly'?'Game Arena+ Yearly':'Game Arena+ Monthly',
    value,
    currency:'PKR',
    conversion_event:planCode==='yearly'?'purchase':'subscribe',
    comingSoon:planCode==='yearly'
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
export{DEFAULT_LANDING_CAMPAIGN,LANDING2_CAMPAIGN};
