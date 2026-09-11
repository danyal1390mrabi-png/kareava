// Service worker حداقلی فقط برای قابل‌نصب‌شدن (PWA) — هیچ کش اجباری‌ای روی
// داده‌های آگهی یا محتوای صفحه اعمال نمی‌کند تا رفتار فعلی سایت تغییر نکند.
const CACHE_NAME = 'kareava-shell-v1';
const CORE_ASSETS = ['./', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
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

// همیشه شبکه اول؛ فقط وقتی کاملاً آفلاینه سراغ کش می‌ره (و فقط برای صفحه‌ی اصلی)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
