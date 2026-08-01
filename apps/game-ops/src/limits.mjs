const MIB=1024*1024;

export const DEFAULT_CONTENT_LIMITS=Object.freeze({
  maxCompressedBytes:25*MIB,
  maxExpandedBytes:25*MIB,
  maxEntries:2500,
  maxCompressionRatio:250,
  extractionTimeoutMs:30000,
  freeSpaceReserveBytes:512*MIB
});

export const HARD_CONTENT_LIMITS=Object.freeze({
  maxCompressedBytes:256*MIB,
  maxExpandedBytes:1024*MIB,
  maxEntries:10000,
  maxCompressionRatio:500,
  extractionTimeoutMs:10*60*1000,
  freeSpaceReserveBytes:10*1024*MIB
});

const ENV_KEYS=Object.freeze({
  maxCompressedBytes:'GAME_ARENA_MAX_COMPRESSED_BYTES',
  maxExpandedBytes:'GAME_ARENA_MAX_EXPANDED_BYTES',
  maxEntries:'GAME_ARENA_MAX_ENTRIES',
  maxCompressionRatio:'GAME_ARENA_MAX_COMPRESSION_RATIO',
  extractionTimeoutMs:'GAME_ARENA_EXTRACTION_TIMEOUT_MS',
  freeSpaceReserveBytes:'GAME_ARENA_FREE_SPACE_RESERVE_BYTES'
});

function positiveInteger(value,label){
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<1)throw new Error(`${label} must be a positive safe integer.`);
  return number;
}

export function loadContentLimits(env=process.env,overrides={}){
  const result={...DEFAULT_CONTENT_LIMITS};
  for(const [key,envKey] of Object.entries(ENV_KEYS))if(env[envKey]!==undefined&&env[envKey]!=='')result[key]=positiveInteger(env[envKey],envKey);
  for(const [key,value] of Object.entries(overrides)){
    if(!(key in result))throw new Error(`Unknown content limit: ${key}`);
    if(value!==undefined&&value!==null)result[key]=positiveInteger(value,key);
  }
  for(const [key,value] of Object.entries(result))if(value>HARD_CONTENT_LIMITS[key])throw new Error(`${key}=${value} exceeds the hard safety ceiling ${HARD_CONTENT_LIMITS[key]}.`);
  return Object.freeze(result);
}

export function publicContentLimits(limits=loadContentLimits()){
  return Object.fromEntries(Object.entries(limits));
}
