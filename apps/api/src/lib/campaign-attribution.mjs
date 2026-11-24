const KEYS=['utm','utm_source','utm_campaign','utm_medium','utm_content','utm_term','package','parameter','payment','landing','landingPath','ref','referral','campaign_id','creative_id'];
const clip=(value,max)=>typeof value==='string'||typeof value==='number'?String(value).trim().slice(0,max):'';
export function platformCode(value){const raw=clip(value,80);const code=raw.toLowerCase();return ({t:'T',tiktok:'T',m:'M',meta:'M',facebook:'M',instagram:'M',s:'S',snapchat:'S',g:'G',google:'G',d:'D',direct:'D',organic:'organic'})[code]||raw||'unknown';}
function safePath(value){const raw=clip(value,512);if(!raw.startsWith('/')||raw.startsWith('//')||raw.includes('\\'))return '';return raw.split(/[?#]/)[0].slice(0,120);}

/** Allowlist + length-clip attribution for storage on payment rows. */
export function sanitizeAttribution(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const out={};
  for(const key of KEYS){
    if(raw[key]===undefined||raw[key]===null||raw[key]==='')continue;
    const max=key==='landingPath'?120:80;
    const value=key==='landingPath'?safePath(raw[key]):clip(raw[key],max);
    if(value)out[key]=value;
  }
  if(out.utm&&!out.utm_source)out.utm_source=out.utm;
  if(!out.utm&&out.utm_source)out.utm=out.utm_source;
  if(out.ref&&!out.referral)out.referral=out.ref;
  if(out.referral&&!out.ref)out.ref=out.referral;
  if(raw.omitFromCampaignReport===true)out.omitFromCampaignReport=true;
  return Object.keys(out).length?out:null;
}

export function attributionDimensions(attr={},fallbackPlan=''){
  const platform=platformCode(attr.utm||attr.utm_source);
  const packageCode=clip(attr.package||fallbackPlan||'unknown',80)||'unknown';
  const parameter=clip(attr.parameter||'unknown',80)||'unknown';
  return{platform,package:packageCode,parameter};
}

export function isOmittedFromCampaignReport(attr){
  return Boolean(attr&&typeof attr==='object'&&attr.omitFromCampaignReport===true);
}
