import {access,readFile} from 'node:fs/promises';

const requiredFiles=[
  'render.yaml',
  'infra/render-gateway/Dockerfile',
  'infra/render-gateway/default.conf.template',
  'apps/api/Dockerfile',
  'apps/web/Dockerfile',
  'apps/admin/Dockerfile',
  'apps/game-origin/Dockerfile'
];
for(const file of requiredFiles)await access(new URL(`../${file}`,import.meta.url));
const blueprint=await readFile(new URL('../render.yaml',import.meta.url),'utf8');
const gateway=await readFile(new URL('../infra/render-gateway/default.conf.template',import.meta.url),'utf8');
const gameOrigin=await readFile(new URL('../apps/game-origin/nginx.conf',import.meta.url),'utf8');
const requiredMarkers=[
  'name: game-arena-staging',
  'name: game-arena-web-staging',
  'name: game-arena-api-staging',
  'name: game-arena-admin-staging',
  'name: game-arena-games-staging',
  'name: game-arena-staging-db',
  'property: connectionString',
  'preDeployCommand: npm run migrate',
  'generateValue: true',
  'GAME_ARENA_MODE',
  'JAZZCASH_MODE',
  'OTP_PROVIDER_MODE'
];
const missing=requiredMarkers.filter(marker=>!blueprint.includes(marker));
if(missing.length)throw new Error(`Render blueprint is missing: ${missing.join(', ')}`);
if(/(?:JAZZCASH_(?:PASSWORD|INTEGRITY_SALT)|OTP_(?:PRIMARY|SECONDARY)_API_KEY):?\s*\n?\s*value:\s*\S+/i.test(blueprint))throw new Error('Provider credentials must not be committed to render.yaml.');
if(!blueprint.includes('value: mock'))throw new Error('Staging providers must default to mock mode.');
if(!gateway.includes('location /api/')||!gateway.includes('location /ops/'))throw new Error('Gateway must route API and operations traffic.');
if(gateway.includes('location /games/'))throw new Error('Games must remain on a separate public origin.');
if(!gameOrigin.includes('frame-ancestors ${GAME_ARENA_FRAME_ANCESTORS}'))throw new Error('Game origin must use a configurable frame ancestor allow-list.');
console.log('Render staging blueprint checks passed.');
