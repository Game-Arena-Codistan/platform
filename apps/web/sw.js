const CACHE='game-arena-shell-v1';
const SHELL=['/','/index.html','/manifest.webmanifest','/styles/tokens.css','/styles/app.css','/styles/responsive.css','/assets/icon.svg','/assets/logo.svg','/src/app.js','/src/data.js','/src/state.js','/src/api.js','/src/ui.js','/src/analytics.js','/src/game-bridge.js','/src/views/feed.js','/src/views/library.js','/src/views/rewards.js','/src/views/premium.js','/src/views/account.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('/index.html',copy));return response;}).catch(()=>caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok&&['style','script','image','manifest'].includes(request.destination)){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;})));
});
