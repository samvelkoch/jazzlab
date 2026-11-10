// Service worker: keeps the ~40 ES modules of one visit from the same deploy, and lets visited screens open offline.
// For the page itself and everything under app/js/, app/css/ and content/: network first, revalidated
// (cache: 'no-cache' sends If-None-Match / If-Modified-Since, so an unchanged file is a cheap 304), every good answer
// copied into the cache; the cache is used only when the network fails. Everything else (piano samples, icons, fonts,
// other origins) is left to the browser. No precache list and no version constant: nothing to bump on a deploy.
const CACHE = 'jazzlab-runtime';
const PATHS = ['app/js/', 'app/css/', 'content/'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function ours(req) {
  if (req.method !== 'GET') return false;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  const scope = new URL(self.registration.scope).pathname; // '/jazzlab/' on GitHub Pages, '/' locally
  if (!url.pathname.startsWith(scope)) return false;
  const rel = url.pathname.slice(scope.length);
  return req.mode === 'navigate' || rel === '' || rel === 'index.html' || PATHS.some((p) => rel.startsWith(p));
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const nav = req.mode === 'navigate';
  // a navigation request cannot be re-issued with options: fetch its URL (the hash never reaches the network)
  const key = nav ? new URL(req.url).origin + new URL(req.url).pathname : req.url;
  try {
    const res = await fetch(nav ? key : req, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = (await cache.match(key)) || (nav ? (await cache.match(self.registration.scope)) || (await cache.match(self.registration.scope + 'index.html')) : null);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  if (ours(e.request)) e.respondWith(networkFirst(e.request));
});
