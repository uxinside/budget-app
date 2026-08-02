/* 우리집 가계부 – 껍데기(shell) 캐시용 서비스 워커.
   구글 앱스크립트 쪽 요청은 절대 가로채지 않는다. */
const CACHE = 'budget-shell-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './favicon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;   // 구글 요청은 그대로 통과
  if (e.request.method !== 'GET') return;

  /* network-first.
     GitHub Pages 가 HTML 에 max-age 를 걸어두기 때문에 브라우저 HTTP 캐시를 거치면
     새로 올린 버전이 최대 10분간 안 보인다. cache:'no-store' 로 항상 원본을 확인하고,
     실패(오프라인)하면 캐시로 대체한다. 셸 전체가 30KB 남짓이라 비용은 무시할 수준. */
  e.respondWith(
    fetch(url.href, { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html')))
  );
});
