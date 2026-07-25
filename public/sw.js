// EcoPulse Service Worker — offline support without pinning users to a stale build.
//
// The previous version answered every request cache-first from a cache whose
// name never changed between deploys. index.html was therefore served from the
// first visit forever, and because it referenced content-hashed asset
// filenames that were themselves cached, a returning visitor could never
// receive a new release. Hence: new deploys appeared on a fresh origin but not
// on the one the browser had already registered a worker for.
//
// Strategy now:
//   • navigations / HTML → network-first (cache only as an offline fallback)
//   • content-hashed build assets → cache-first (the hash makes them immutable)
//   • everything else same-origin → stale-while-revalidate

const VERSION = 'v3';
const SHELL_CACHE = `ecopulse-shell-${VERSION}`;
const ASSET_CACHE = `ecopulse-assets-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];

const OFFLINE_FALLBACK = '/index.html';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(['/', OFFLINE_FALLBACK, '/favicon.svg']))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((k) => !CURRENT_CACHES.includes(k)).map((k) => caches.delete(k)))
            )
            .then(() => self.clients.claim())
    );
});

// Vite emits hashed filenames under /assets/, e.g. index-B3ouHUU9.js. Those are
// safe to serve from cache indefinitely because a rebuild changes the name.
const isHashedAsset = (url) => url.pathname.startsWith('/assets/');

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Leave cross-origin traffic (Supabase, Gemini, fonts, CDN) alone.
    if (url.origin !== self.location.origin) return;
    // Never intercept Vite's dev-server plumbing.
    if (url.pathname.includes('/@') || url.pathname.includes('/node_modules/')) return;

    // ── Navigations: always try the network first so a deploy is picked up on
    // the next load. Fall back to the cached shell only when actually offline.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(SHELL_CACHE).then((cache) => cache.put(OFFLINE_FALLBACK, clone));
                    return response;
                })
                .catch(() => caches.match(OFFLINE_FALLBACK).then((cached) => cached || Response.error()))
        );
        return;
    }

    // ── Immutable hashed assets: cache-first is correct and fast.
    if (isHashedAsset(url)) {
        event.respondWith(
            caches.match(request).then(
                (cached) =>
                    cached ||
                    fetch(request).then((response) => {
                        if (response.ok) {
                            const clone = response.clone();
                            caches.open(ASSET_CACHE).then((cache) => cache.put(request, clone));
                        }
                        return response;
                    })
            )
        );
        return;
    }

    // ── Everything else same-origin: serve cache for speed, refresh in the
    // background so the next load is current.
    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});

// Lets the page tell a waiting worker to take over immediately.
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            if (clients.length > 0) return clients[0].focus();
            return self.clients.openWindow('/');
        })
    );
});
