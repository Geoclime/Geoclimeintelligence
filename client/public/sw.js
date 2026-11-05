/*
 * GeoClime Intelligence service worker: makes the app installable and usable on a poor or lost
 * connection. Registered only in production builds (src/pwa/pwa-store.ts).
 *
 * What is cached, and how:
 *   - pages (navigations):   network first; offline, the last app shell (the SPA routes itself);
 *   - /assets/* (hashed):    cache first; a new build has new file names, so never stale;
 *   - icons, manifest, fonts: served from cache while refreshed in the background;
 *   - the public API (/api/v1/public/*): network first, the last good answer when offline, so the
 *     alert map and place finder still show something (the offline banner says it may be old).
 * Never cached: anything signed in (the rest of /api/v1), sign-in (Firebase) and map tiles
 * (Mapbox). Personal data never lands in the cache.
 *
 * Bump VERSION when this file's behaviour changes; old caches are deleted on activate.
 */
const VERSION = "v2";
const SHELL = `geoclime-shell-${VERSION}`;
const ASSETS = `geoclime-assets-${VERSION}`;
const STATIC = `geoclime-static-${VERSION}`;
const PUBLIC_API = `geoclime-public-api-${VERSION}`;
const KEEP = [SHELL, ASSETS, STATIC, PUBLIC_API];

/** Hashed build files kept; older ones are dropped so deploys don't pile up. */
const MAX_ASSETS = 120;
/** How long a page waits for the network before using the cached shell. */
const NAVIGATION_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("geoclime-") && !KEEP.includes(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

// Push notifications (Firebase Cloud Messaging). The server sends data-only messages
// (server/src/common/push/push-sender.ts: title, body, link, tag) and this worker shows them, so
// they look the same on every browser. While the app is open and focused it shows nothing: the
// in-app notification, which arrived over the live connection, already covers it.
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let message;
      try {
        const payload = event.data ? event.data.json() : {};
        message = payload.data || payload;
      } catch {
        return;
      }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((client) => client.focused)) return;
      await self.registration.showNotification(message.title || "GeoClime Intelligence", {
        body: message.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: message.tag || "geoclime",
        renotify: true,
        data: { link: message.link || "/" },
      });
    })(),
  );
});

// Tapping a notification opens its page: in an open app window if there is one, else a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.link) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// The page asks a waiting worker to take over when the user accepts "a new version is ready".
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(navigation(request));
  } else if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS));
  } else if (url.origin === self.location.origin && /^\/(icons\/|favicon\.svg$|manifest\.webmanifest$)/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, STATIC));
  } else if (url.pathname.startsWith("/api/v1/public/") && !request.headers.has("Authorization")) {
    event.respondWith(networkFirst(request, PUBLIC_API));
  }
  // Everything else (signed-in API calls, Firebase, Mapbox) goes straight to the network.
});

/** Caches the app shell and the scripts and styles it names, so the app opens offline after one visit. */
async function precacheShell() {
  const cache = await caches.open(SHELL);
  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) return;
  const html = await response.clone().text();
  await cache.put("/", response);
  const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  const assets = await caches.open(ASSETS);
  await Promise.all(files.map((file) => assets.add(file).catch(() => undefined)));
  await caches.open(STATIC).then((staticCache) => staticCache.addAll(["/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png"]).catch(() => undefined));
}

async function navigation(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    // Every route serves the same index.html, so the latest one is kept as the shell.
    if (response.ok) await cache.put("/", response.clone());
    return response;
  } catch {
    return (await cache.match("/")) || offlineResponse();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    void trim(cache, MAX_ASSETS);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") void cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || refresh;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
}

/** Drops the oldest entries beyond `max` (cache keys come back in insertion order). */
async function trim(cache, max) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((key) => cache.delete(key)));
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function offlineResponse() {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · GeoClime Intelligence</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#061819;color:#e6f0f0;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<main><h1 style="font-size:1.4rem">You're offline</h1><p style="color:#a3b8b9;max-width:36ch">GeoClime Intelligence needs a connection the first time it opens. Reconnect and try again.</p>
<p style="color:#a3b8b9">In an emergency, call <a style="color:#62c7ca" href="tel:112">112</a>.</p></main></body>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
