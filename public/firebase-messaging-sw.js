/* global importScripts, firebase */
// Firebase Cloud Messaging service worker. Receives background pushes (when the
// tab is closed/backgrounded) and shows the notification. Must live at the site
// root so its scope covers the whole app. Uses the compat builds because a
// service worker can't import from the app bundle.
importScripts(
  "https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyBMaNQrxFAVB2nCP0MbYyKcPblWpQE3o7Y",
  authDomain: "split-bill-noti.firebaseapp.com",
  projectId: "split-bill-noti",
  storageBucket: "split-bill-noti.firebasestorage.app",
  messagingSenderId: "1078287589697",
  appId: "1:1078287589697:web:04130fcbe0d2cf6d0e81c0",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || "New payment receipt";
  const options = {
    body: data.body || "Someone uploaded a transfer for your bill.",
    icon: "/logo.png",
    badge: "/logo.png",
    data: { url: data.url || "/" },
  };
  self.registration.showNotification(title, options);
});

// Focus (or open) the bill when the notification is clicked.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(target) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});

// ── PWA: installability + lightweight offline support ──────────────────────
// This SW doubles as the app's PWA worker so we don't register two competing
// workers at the same scope. Bump the version to invalidate old caches.
const SHELL_CACHE = "bill-split-shell-v1";
const STATIC_CACHE = "bill-split-static-v1";
const CURRENT_CACHES = [SHELL_CACHE, STATIC_CACHE];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !CURRENT_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Immutable, content-hashed build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Page navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/"))
        )
    );
  }
});
