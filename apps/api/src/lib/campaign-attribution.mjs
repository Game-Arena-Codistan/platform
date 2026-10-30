const KEYS=['utm','utm_source','package','parameter','payment','landing','landingPath'];
const clip=(value,max)=>String(value??'').trim().slice(0,max);

/** Allowlist + length-clip attribution for storage on payment rows. */
export function sanitizeAttribution(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const out={};
  for(const key of KEYS){
    if(raw[key]===undefined||raw[key]===null||raw[key]==='')continue;
    const max=key==='landingPath'?120:80;
    const value=clip(raw[key],max);
    if(value)out[key]=value;
  }
  if(out.utm&&!out.utm_source)out.utm_source=out.utm;
  if(raw.omitFromCampaignReport===true)out.omitFromCampaignReport=true;
  return Object.keys(out).length?out:null;
}

export function attributionDimensions(attr={},fallbackPlan=''){
  const platform=clip(attr.utm||attr.utm_source||'unknown',80)||'unknown';
  const packageCode=clip(attr.package||fallbackPlan||'unknown',80)||'unknown';
  const parameter=clip(attr.parameter||'unknown',80)||'unknown';
  return{platform,package:packageCode,parameter};
}

export function isOmittedFromCampaignReport(attr){
  return Boolean(attr&&typeof attr==='object'&&attr.omitFromCampaignReport===true);
}
