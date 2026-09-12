const CACHE = 'eh-trainer-v57';
const MEDIA = 'eh-media';   /* Bewegungsbilder überleben App-Updates */
const SHELL = ['./', 'index.html', 'app.js', 'data.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE && k !== MEDIA).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

/* Cache-first: die App muss im Keller ohne Netz laufen.
   Bilder mit ?keep=1 (die großen Detailbilder) landen im Medien-Cache und
   bleiben dort auch nach einem Update — die Listen zeigen ihre Vorschau nur
   aus diesem Cache und laden selbst nichts nach. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const keep = e.request.url.indexOf('keep=1') > -1;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(keep ? MEDIA : CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
