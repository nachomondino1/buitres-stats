// App shell cacheado para que abra rápido (y sin red) después de la primera
// visita; data.json se pide siempre a la red primero porque los datos
// cambian con cada partido cargado, y solo se cae al cache si no hay señal.
const CACHE = "buitres-v1";
const ASSETS = [
  "./",
  "index.html",
  "css/styles.css",
  "js/ui.js",
  "js/stats.js",
  "js/charts.js",
  "vendor/chart.min.js",
  "manifest.json",
  "media/cuadrada-transparente.png",
  "media/icon-192.png",
  "media/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.endsWith("data/data.json")) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copia));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
