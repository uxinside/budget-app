/* 우리집 가계부 — 서비스워커 (네트워크 우선, 오프라인 폴백) */
var V = 'hb-1.16.0';
var SHELL = ['./', './index.html', './app.css?v=1.16.0', './app.js?v=1.16.0',
             './manifest.webmanifest', './icon-192.png', './favicon.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return c.add(u).catch(function () {});
    }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === V ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;
  var url = new URL(r.url);
  if (url.origin !== self.location.origin) return;   // API·구글은 통과

  e.respondWith(
    fetch(r).then(function (res) {
      if (res && res.status === 200) {
        var cp = res.clone();
        caches.open(V).then(function (c) { c.put(r, cp); });
      }
      return res;
    }).catch(function () {
      return caches.match(r).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
