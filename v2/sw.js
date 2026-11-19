const PREFIX='enc-v2:'+new URL(self.registration.scope).pathname+':';
const CACHE=PREFIX+'source-51ba3f123a009c18';
const STATIC=["./app.js","./assets/icon-192.png","./assets/icon-512.png","./assets/icon-maskable-512.png","./config.js","./domain/base.js","./domain/book.js","./domain/commands.js","./domain/copilot.js","./domain/demo.js","./domain/engine.js","./domain/language.js","./index.html","./manifest.json","./open-finance/provider.js","./open-finance/reconciliation.js","./store.js","./styles.css","./ui/forms.js","./ui/html.js","./ui/views.js"];
const paths=new Set(STATIC.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC.map(p=>new Request(p,{cache:'reload'}))))));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith(PREFIX)&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE')e.waitUntil(self.skipWaiting());});
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==location.origin||r.headers.has('authorization')||u.search)return;
 const base=new URL(self.registration.scope);
 const home=r.mode==='navigate'&&(u.pathname===base.pathname||u.href===new URL('index.html',base).href);
 if(!home&&!paths.has(u.href))return;
 e.respondWith((async()=>{const cache=await caches.open(CACHE);
   const key=home?new URL('index.html',base).href:u.href;
   return await cache.match(key)||fetch(r);
 })());
});
