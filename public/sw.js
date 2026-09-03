// Push-only service worker.
//
// It has NO `fetch` listener, and that is the point. A worker that intercepts
// fetches and caches RSC payloads breaks a Next.js app in ways that persist in
// the user's browser long after the code is fixed — stale routes, half-hydrated
// pages, and no way for us to clear it remotely. This one only wakes for a push
// and for a click on the notification it showed, so it cannot serve anything
// stale. Offline support, if it is ever wanted, is a separate decision that
// needs testing on a real device.

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close —
  // there is no old cached content to protect.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Clerkr OS", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Clerkr OS";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Same tag replaces rather than stacks, so ten sweeps can't bury the
      // phone in duplicates of one fact.
      tag: payload.tag || title,
      data: { href: payload.href || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus a window that is already open rather than stacking another one.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(href);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
