const CACHE_NAME = 'dm-tool-v1';
const assets = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './data/sample_monsters.json',
  './data/custom_spells.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(assets)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});