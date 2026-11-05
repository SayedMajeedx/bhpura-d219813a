/*
 * The installed admin's service worker: it shows the order alerts the push sender
 * (supabase/functions/send-mobile-push) delivers while the app is closed, and opens the order
 * when one is tapped, and takes a new subscription when the browser renews one. It caches nothing
 * and handles no requests, so the app is always the latest version. Registered for /admin by
 * src/lib/web-push.ts (devices from before keep it under /admin/).
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
      // Android draws the badge as a white silhouette of its see-through parts: a one-colour mark.
      badge: "/admin-app/badge-96.png",
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

// The browser renewed (or dropped) the subscription: take a new one at once, so pushes reach this
// device again, and tell any open admin window, which gives it to the store (`syncAlertDevice`).
// A window opened later does the same.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        if (!event.newSubscription) {
          const key = event.oldSubscription?.options?.applicationServerKey;
          if (key) {
            await self.registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: key,
            });
          }
        }
      } catch {
        // The open admin subscribes again itself.
      }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: "boutq:push-subscription-changed" });
    })(),
  );
});
