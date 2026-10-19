/**
 * FinalCircle service worker (from Planecircle; production build only, registered by main.tsx).
 * - /assets/* (named by their hash), /sounds/* and /icons/*: from the cache after the first visit; a new version of a
 *   file replaces the old one (same name prefix);
 * - card images (/ffimg/*): from their own cache after the first view (a card's image does not change), so that the
 *   relay and the CDN are asked once per device; a refused image (404, 503) is not kept;
 * - the page: network first, the cache when offline (a game against the AI without network).
 * Neither online play (/ws) nor /healthz go through the cache.
 */
const CACHE = "finalcircle-v1";
const IMAGES = "finalcircle-images-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== IMAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** "index-CtvfSpgD.js" → "index-": the old versions of the same file. */
const prefixOf = (path) => path.replace(/-[\w-]{6,}\.(js|css)$/, "-");

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/assets/")) {
      const prefix = prefixOf(path);
      for (const old of await cache.keys()) {
        const p = new URL(old.url).pathname;
        if (p !== path && p.startsWith("/assets/") && prefixOf(p) === prefix) await cache.delete(old);
      }
    }
    await cache.put(request, res.clone());
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put("/", res.clone());
    return res;
  } catch {
    return (await cache.match("/")) ?? Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.startsWith("/ffimg/")) e.respondWith(cacheFirst(e.request, IMAGES));
  else if (path.startsWith("/assets/") || path.startsWith("/sounds/") || path.startsWith("/icons/"))
    e.respondWith(cacheFirst(e.request, CACHE));
  else if (e.request.mode === "navigate") e.respondWith(networkFirst(e.request));
});
