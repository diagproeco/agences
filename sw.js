/* Diag Pro Eco - appli agences : fonctionne aussi sans réseau (sauf l'envoi, mis en attente) */
var CACHE = 'agences-v1';
var FICHIERS = ['./', './index.html', './regles.js', './app.js', './manifest.webmanifest', './logo-96.png', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FICHIERS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return; // adresses et relais : toujours par le réseau
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) { var copie = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copie); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('./index.html'); });
    })
  );
});
