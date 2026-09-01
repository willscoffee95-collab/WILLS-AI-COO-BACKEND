const CACHE='wills-ai-coo-v0.4.1-mobile-behavior';
const SHELL=[
  './','./index.html','./styles.css?v=0.4.1','./app.js?v=0.4.1','./manifest.json',
  './assets/wills-intelligence.png','./assets/wills-brand.png',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-1024.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  if(u.origin!==location.origin)return;
  if(u.pathname.endsWith('/config.js')||u.pathname.endsWith('config.js')){
    e.respondWith(fetch(e.request,{cache:'no-store'}));
    return;
  }
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{
    const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;
  }).catch(()=>caches.match(e.request)));
});
