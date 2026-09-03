const CACHE = "esteja-no-controle-1-0-20";
const CORE = [
  "./",
  "./index.html",
  "./offline.html",
  "./privacidade.html",
  "./termos.html",
  "./suporte.html",
  "./version.json",
  "./css/styles.css",
  "./js/config.js",
  "./js/supabase-service.js",
  "./js/app.js",
  "./js/finance-core.js",
  "./js/icons.js",
  "./js/card-management.js",
  "./js/card-limit-sync.js",
  "./js/ai-complete.js",
  "./js/benefits.js",
  "./js/benefits-keeper.js",
  "./js/benefits-manager.js",
  "./js/benefits-delete-fix.js",
  "./js/dashboard-accounting.js",
  "./manifest.json",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/fridge.svg",
  "./favicon.ico",
  "./assets/icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put("./index.html", response.clone()));
          return response;
        })
        .catch(async () => (await caches.match("./index.html")) || (await caches.match("./offline.html")))
    );
    return;
  }

  if (url.pathname.endsWith("/version.json") || url.pathname.endsWith("version.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match("./version.json")));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
