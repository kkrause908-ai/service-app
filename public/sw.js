// Service Worker - allow all
const CACHE_NAME = 'service-app-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Allow all requests - don't block
  event.respondWith(fetch(event.request));
});
