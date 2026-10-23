// Caches the app shell so the page opens offline. API calls are never cached.
const CACHE = 'sprechpartner-v42';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './css/avatar.css',
  './js/main.js',
  './js/api.js',
  './js/avatars.js',
  './js/personas.js',
  './js/prompt.js',
  './js/punctuate.js',
  './js/speech.js',
  './js/storage.js',
  './js/streak.js',
  './js/text.js',
  './js/ui.js',
  './assets/avatars/g.png',
  './assets/avatars/i.png',
  './assets/avatars/k.png',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network first so edits show up after a deploy, cache as offline fallback.
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
