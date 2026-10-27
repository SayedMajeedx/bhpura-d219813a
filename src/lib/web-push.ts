import { registerWebPushSubscription, removeWebPushSubscription } from "@/lib/data/push";

/**
 * Order alerts while the installed admin is closed (Web Push; the owner's request of 2026-10-27).
 * A member turns them on per device (`OrderAlertsSettings`): the browser asks permission, the
 * service worker (`public/admin-sw.js`) is registered for `/admin/`, and the browser's subscription
 * is kept by `register_web_push_subscription`; the push sender delivers each new order of the
 * store to it (`supabase/functions/send-mobile-push/web-push.ts`). The sound is the device's own
 * notification sound: a page cannot play its chime while it is closed.
 */

/** The platform's public VAPID key (its private half is the push sender's secret). */
export const VAPID_PUBLIC_KEY =
  "BF7pwTsbHu-eE0lo3szbjRl9gmt9l5AeoD57e4h1b5kLRw_Yh6ARvbOBdouNY0h5GzrwAPbAzNa6nGDG5Ka2X6Y";

export const ADMIN_WORKER = "/admin-sw.js";
export const ADMIN_SCOPE = "/admin/";

export type AlertsAvailability = "supported" | "needs-install" | "unsupported";

/**
 * Whether this device can take alerts: an iPhone or iPad only from the app added to its home
 * screen (iOS 16.4 and later; Safari's tabs have no push), everything else from a browser that
 * has service workers, push and notifications.
 */
export function alertsAvailability(device: {
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  ios: boolean;
  standalone: boolean;
}): AlertsAvailability {
  if (device.ios && !device.standalone) return "needs-install";
  if (!device.serviceWorker || !device.pushManager || !device.notification) return "unsupported";
  return "supported";
}

export function thisDevice() {
  if (typeof window === "undefined") {
    return {
      serviceWorker: false,
      pushManager: false,
      notification: false,
      ios: false,
      standalone: false,
    };
  }
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a touch screen tells them apart.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    ios,
    standalone,
  };
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function adminRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration(ADMIN_SCOPE);
}

/** This device's subscription for alerts, if it has one. */
export async function currentAlertSubscription(): Promise<PushSubscription | null> {
  const registration = await adminRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(ADMIN_WORKER, { scope: ADMIN_SCOPE });
  if (registration.active) return registration;
  const worker = registration.installing ?? registration.waiting;
  await new Promise<void>((resolve) => {
    if (!worker) return resolve();
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve();
    });
  });
  return registration;
}

/**
 * Turns alerts on for this device and the store: called from a tap, so the browser's question is
 * asked at once. "blocked" when the person said no (only the browser's settings can undo it).
 */
export async function turnOnOrderAlerts(brandId: string): Promise<"on" | "blocked"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "blocked";
  const registration = await activeRegistration();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
    }));
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error("PUSH_SUBSCRIPTION_INCOMPLETE");
  await registerWebPushSubscription({
    brandId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    deviceName: navigator.userAgent.slice(0, 180),
  });
  return "on";
}

/** Turns alerts off for this device: the platform forgets it, then the browser does. */
export async function turnOffOrderAlerts(): Promise<void> {
  const subscription = await currentAlertSubscription();
  if (!subscription) return;
  await removeWebPushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}

/** A notification shown at once, as an alert will look and sound on this device. */
export async function showTestAlert(title: string, body: string): Promise<void> {
  const registration = await adminRegistration();
  await registration?.showNotification(title, {
    body,
    icon: "/admin-app/icon-192.png",
    badge: "/admin-app/icon-192.png",
    tag: "boutq-test",
    silent: false,
  });
}
