const SLUG=/^[a-z0-9][a-z0-9-]{1,63}$/;
const VERSION=/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/i;
const SAFE_PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/;
const ORIENTATIONS=new Set(['portrait','landscape','any']);
const TIERS=new Set(['free','premium']);
const INPUTS=new Set(['touch','keyboard','mouse','gamepad']);
const DEVICE_TIERS=new Set(['lite','standard','high']);
const PERMISSIONS=['fullscreen','orientationLock','pointerLock','autoplayAudio'];

export function validateManifest(value){
  const errors=[];
  const manifest=value&&typeof value==='object'?structuredClone(value):{};
  if(manifest.schemaVersion!==1)errors.push('schemaVersion must be 1');
  if(!SLUG.test(String(manifest.slug||'')))errors.push('slug must be 2–64 lowercase letters, numbers or hyphens');
  if(typeof manifest.title!=='string'||manifest.title.trim().length<2||manifest.title.length>80)errors.push('title must be 2–80 characters');
  if(!VERSION.test(String(manifest.version||'')))errors.push('version must be semantic version format');
  if(!Array.isArray(manifest.genres)||manifest.genres.length<1||manifest.genres.length>5||manifest.genres.some(item=>typeof item!=='string'||item.length>32))errors.push('genres must contain 1–5 short values');
  if(!ORIENTATIONS.has(manifest.orientation))errors.push('orientation must be portrait, landscape or any');
  if(!TIERS.has(manifest.tier))errors.push('tier must be free or premium');
  if(!Array.isArray(manifest.inputModes)||manifest.inputModes.length<1||manifest.inputModes.some(item=>!INPUTS.has(item)))errors.push('inputModes contains unsupported values');
  if(!SAFE_PATH.test(String(manifest.entryFile||''))||!String(manifest.entryFile||'').toLowerCase().endsWith('.html'))errors.push('entryFile must be a safe relative HTML path');
  if(manifest.bridgeVersion!=='1.0')errors.push('bridgeVersion must be 1.0');
  if(manifest.minDeviceTier&&!DEVICE_TIERS.has(manifest.minDeviceTier))errors.push('minDeviceTier is invalid');
  if(manifest.rolloutPercentage!==undefined&&(!Number.isInteger(manifest.rolloutPercentage)||manifest.rolloutPercentage<0||manifest.rolloutPercentage>100))errors.push('rolloutPercentage must be 0–100');
  if(manifest.assets!==undefined&&(!Array.isArray(manifest.assets)||manifest.assets.some(item=>!SAFE_PATH.test(String(item)))))errors.push('assets must contain safe relative paths');
  if(manifest.permissions!==undefined){
    if(!manifest.permissions||typeof manifest.permissions!=='object'||Array.isArray(manifest.permissions))errors.push('permissions must be an object');
    else for(const [key,val] of Object.entries(manifest.permissions))if(!PERMISSIONS.includes(key)||typeof val!=='boolean')errors.push(`unsupported permission: ${key}`);
  }
  if(errors.length)return{ok:false,errors};
  return{ok:true,value:{schemaVersion:1,slug:manifest.slug,title:manifest.title.trim(),version:manifest.version,genres:[...new Set(manifest.genres.map(item=>item.trim()))],orientation:manifest.orientation,tier:manifest.tier,inputModes:[...new Set(manifest.inputModes)],entryFile:manifest.entryFile,assets:manifest.assets??[],permissions:Object.fromEntries(PERMISSIONS.map(key=>[key,Boolean(manifest.permissions?.[key])])),bridgeVersion:'1.0',minDeviceTier:manifest.minDeviceTier??'lite',rolloutPercentage:manifest.rolloutPercentage??100,description:String(manifest.description??'').slice(0,500)}};
}

export function assertManifest(value){const result=validateManifest(value);if(!result.ok)throw new Error(result.errors.join('\n'));return result.value;}
