// Service Worker for Study Allowance App
const CACHE_VERSION = '1.9.7';
const CACHE_NAME = `study-allowance-app-v${CACHE_VERSION}`;
const urlsToCache = [
  '/',
  '/index.html',
  '/css/main.css',
  '/css/main.dark.css',
  '/css/onboarding.css',
  '/css/onboarding.dark.css',
  '/js/main.js',
  '/js/onboarding.js',
  '/js/languages.js',
  '/js/state.js',
  '/js/ui.js',
  '/js/api.js',
  '/js/eventHandlers.js',
  '/js/utils.js',
  '/js/donation.js',
  '/js/iap-products.js',
  '/Img/STUDY.PNG',
  '/Img/calender.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(() => {})
          )
        );
      })
      .catch(() => {})
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        );
      })
      .catch(() => {})
  );
  return self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, responseToCache))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => {
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (request.destination === 'document' || request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return new Response('', { status: 404, statusText: 'Not Found' });
          });
      })
  );
});
