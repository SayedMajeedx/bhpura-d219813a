/*
 * The installed admin's service worker: it shows the order alerts the push sender
 * (supabase/functions/send-mobile-push) delivers while the app is closed, and opens the order
 * when one is tapped. It caches nothing and handles no requests, so the app is always the
 * latest version. Registered for /admin/ by src/lib/web-push.ts.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { title: event.data ? event.data.text() : "" };
  }
  const title = message.title || "Boutq";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: message.body || "",
      icon: "/admin-app/icon-192.png",
      badge: "/admin-app/icon-192.png",
      tag: message.tag || undefined,
      renotify: Boolean(message.tag),
      // The phone's own notification sound and vibration: a page cannot play its chime while closed.
      silent: false,
      data: { url: message.url || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/admin", self.location.origin);
  // An admin page of this same site only: a message never sends anyone elsewhere.
  const path = target.pathname.startsWith("/admin") ? target.pathname + target.search : "/admin";
  const url = self.location.origin + path;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).pathname.startsWith("/admin"));
      if (open) {
        try {
          await open.focus();
          await open.navigate(url);
          return;
        } catch {
          // A window this worker does not control cannot be moved: open the order in a new one.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
