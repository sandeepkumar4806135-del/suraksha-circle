/* Suraksha Circle — Firebase Cloud Messaging service worker.
 *
 * Handles background push delivery when the app tab is closed / in the
 * background. Foreground messages are handled in-app via onMessage() in
 * lib/push-notifications.ts.
 *
 * NOTE: A service worker cannot read Next.js env vars, so the public web
 * config is passed as query params at registration time:
 *
 *   navigator.serviceWorker.register(
 *     "/firebase-messaging-sw.js?apiKey=...&senderId=...&projectId=...&appId=..."
 *   )
 *
 * Only the public web config is exposed here (safe per Firebase docs —
 * enforced by Firestore rules + FCM server key on the backend).
 * Uses the compat build so importScripts works inside a worker context.
 */
importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js"
);

(function () {
  var params = new URLSearchParams(self.location.search || "");
  var apiKey = params.get("apiKey") || "";
  var senderId = params.get("senderId") || "";
  var projectId = params.get("projectId") || "";
  var appId = params.get("appId") || "";

  if (!apiKey || !senderId || !projectId || !appId) {
    // Config incomplete (e.g. demo mode) — stay inert, never crash install.
    return;
  }

  firebase.initializeApp({
    apiKey: apiKey,
    authDomain: projectId + ".firebaseapp.com",
    projectId: projectId,
    messagingSenderId: senderId,
    appId: appId,
  });

  var messaging = firebase.messaging();

  // Background SOS / alert push → loud system notification.
  messaging.onBackgroundMessage(function (payload) {
    var data = (payload && payload.data) || {};
    var notification = (payload && payload.notification) || {};
    var title =
      notification.title || data.title || "🚨 Suraksha Circle SOS";
    var body =
      notification.body ||
      data.body ||
      "A family member needs help right now. Tap to open Suraksha Circle.";
    var url = data.url || "/";

    self.registration.showNotification(title, {
      body: body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "suraksha-sos",
      renotify: true,
      requireInteraction: true,
      data: { url: url },
      vibrate: [300, 100, 300, 100, 300],
    });
  });

  // Tapping the notification focuses / opens the app.
  self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    var target =
      (event.notification.data && event.notification.data.url) || "/";
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then(function (windows) {
          for (var i = 0; i < windows.length; i++) {
            var w = windows[i];
            if (w.url.indexOf(self.location.origin) === 0) {
              return w.focus();
            }
          }
          return self.clients.openWindow(target);
        })
    );
  });
})();
