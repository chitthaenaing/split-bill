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
