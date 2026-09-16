/* Suraksha Circle — minimal offline-first service worker.
 * Strategy:
 *  - Precache the app shell (HTML + manifest + icons).
 *  - Navigation requests: network-first, fall back to cached "/" when offline.
 *  - Static assets (/_next/static, fonts, icons): cache-first.
 */
const VERSION = "suraksha-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

const SHELL_URLS = ["/", "/manifest.json", "/icon.svg", "/icon-maskable.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL && k !== ASSETS)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept Firestore / Firebase / API traffic — must stay live.
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api") ||
    /firestore|firebase|googleapis|firebasestorage/.test(url.hostname)
  ) {
    return;
  }

  // App navigations: network-first, cached shell fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit || caches.match("/") || offlineResponse())
        )
    );
    return;
  }

  // Static assets: cache-first.
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.json" ||
    url.hostname.endsWith(".gstatic.com")
  ) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
  }
});

function offlineResponse() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline — Suraksha Circle</title></head>
<body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#052e22;color:#fff">
<div style="text-align:center;padding:2rem">
<h1 style="font-size:1.5rem">📡 You're offline</h1>
<p style="opacity:.8">Suraksha Circle will reconnect automatically.<br>For emergencies, dial <strong>112</strong>.</p>
</div></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html" } }
  );
}
