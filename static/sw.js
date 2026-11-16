// ============================================================================
// Alexandria Darkroom - Lightweight PWA Service Worker
//
// 設計考量（Design Rationale）:
// 1. 本應用為 Local-first RAW 相片工作站，使用者的照片通常高達數十至數百 MB。
//    為了避免填滿手機快取配額（QuotaExceededError），本 Service Worker
//    絕對不攔截或快取任何 Blob、Data URL 或使用者本機檔案。
// 2. 針對靜態 3D LUT 色彩表（/luts/*.cube，每個約 1.4MB），採用 Cache-First 策略，
//    實現手機暗房切換風格濾鏡零延遲秒載，並支援離線調色。
// 3. 核心 App Shell 採用 Stale-While-Revalidate，兼顧秒開與背景更新。
// ============================================================================

const CACHE_NAME = 'alexandria-darkroom-v1';
const PRECACHE_ASSETS = [
  './',
  './favicon.png',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 僅針對 HTTP/HTTPS 的 GET 請求進行處理；忽略非同源 API、Tauri IPC 與 POST 請求
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 1. LUT 色彩查找表：Cache-First 策略（極速調色體驗）
  if (url.pathname.includes('/luts/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 2. 一般同源靜態資源：Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});
