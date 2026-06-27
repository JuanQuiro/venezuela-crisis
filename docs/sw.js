const CACHE = 'vzla-crisis-v1';
const PRECACHE = [
  '/', '/index.html', '/app.js', '/style.css', '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];
const API_CACHE = 'vzla-crisis-api-v1';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE && k !== API_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (url.origin === 'https://eedvfmohqletqcgkxcuf.supabase.co') {
    e.respondWith(networkFirst(e.request, API_CACHE));
    return;
  }

  if (url.origin === 'https://earthquake.usgs.gov') {
    e.respondWith(networkFirst(e.request, API_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  e.respondWith(networkFirst(e.request, CACHE));
});

self.addEventListener('push', e => {
  const data = e.data?.json() || { title: '🔴 Venezuela Crisis', body: 'Nuevo reporte en la plataforma', icon: '/icons/icon-192.png', tag: 'vzla-crisis' };
  self.registration.showNotification(data.title, { body: data.body, icon: data.icon, tag: data.tag, vibrate: [200,100,200], requireInteraction: true });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  clients.openWindow(url);
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  return cached || fetch(req).then(r => {
    const clone = r.clone();
    caches.open(CACHE).then(c => c.put(req, clone));
    return r;
  });
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    const clone = res.clone();
    caches.open(cacheName).then(c => c.put(req, clone));
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('Sin conexión', { status: 503 });
  }
}
