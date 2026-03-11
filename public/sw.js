// EcoPulse Service Worker — caches app shell for offline use
const CACHE_NAME = 'ecopulse-v2';
const SHELL = [
    '/',
    '/index.html',
    '/favicon.svg',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Skip cross-origin requests (Supabase, Gemini API, fonts, etc.)
    if (url.origin !== self.location.origin) return;
    // Skip Vite HMR in dev
    if (url.pathname.includes('/@') || url.pathname.includes('/node_modules/')) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Cache HTML, static assets, and build output (JS/CSS)
                if (response.ok && (
                    url.pathname.endsWith('.html') ||
                    url.pathname.endsWith('.svg') ||
                    url.pathname.endsWith('.png') ||
                    url.pathname.endsWith('.js') ||
                    url.pathname.endsWith('.css') ||
                    url.pathname === '/'
                )) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                // Fallback to index.html for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            });
        })
    );
});

// Show notification from service worker (called by frontend)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            if (clients.length > 0) return clients[0].focus();
            return self.clients.openWindow('/');
        })
    );
});
