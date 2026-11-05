/*
 * The installed admin's service worker: it shows the order alerts the push sender
 * (supabase/functions/send-mobile-push) delivers while the app is closed, and opens the order
 * when one is tapped, takes a new subscription when the browser renews one, marks the app's icon for
 * a new order, and shows a page of its own when the app opens with no connection. It keeps that
 * page only, so the app is always the latest version. Registered for /admin by src/lib/web-push.ts
 * (devices from before keep it under /admin/).
 */

// The one page kept on the device: what the installed app shows when it opens with no connection.
// Pages, data and files are never cached, so the app is always the latest version.
const OFFLINE_CACHE = "boutq-admin-offline-v1";
const OFFLINE_PAGE = "/admin-app/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(OFFLINE_CACHE);
        await cache.add(new Request(OFFLINE_PAGE, { cache: "reload" }));
      } catch {
        // No connection while installing: the next update keeps it.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("boutq-admin-offline-") && name !== OFFLINE_CACHE)
          .map((name) => caches.delete(name)),
      );
      // The page's own request starts at once, while the worker wakes: no wait added online.
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          // Not offered by this browser.
        }
      }
      await self.clients.claim();
    })(),
  );
});

// Opening an admin page goes to the network as always; only when it cannot be reached does the
// offline page answer. Nothing else passes through the worker.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  if (!new URL(request.url).pathname.startsWith("/admin")) return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(request);
      } catch {
        const offline = await caches.match(OFFLINE_PAGE);
        return (
          offline ||
          new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
        );
      }
    })(),
  );
});

// What a new order (or booking, or a gift card sold) puts on the app's icon: a mark, cleared when
// the orders page is opened. The count of those that arrived while the app was open is the page's.
const BADGE_EVENTS = ["order_new", "booking_new", "gift_card_new"];

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { title: event.data ? event.data.text() : "" };
  }
  const title = message.title || "Boutq";
  const marks = BADGE_EVENTS.some((kind) => String(message.tag || "").startsWith(kind));
  if (marks && self.navigator && typeof self.navigator.setAppBadge === "function") {
    self.navigator.setAppBadge().catch(() => undefined);
  }
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
