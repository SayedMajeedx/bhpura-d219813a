import {
  alertSyncStep,
  forgetAlertDevice,
  rememberAlertDevice,
  rememberedAlertDevice,
} from "@/lib/alert-device";
import { getCurrentUser } from "@/lib/auth/session";
import {
  fetchAlertChoices,
  registerWebPushSubscription,
  removeWebPushSubscription,
  saveAlertChoices,
} from "@/lib/data/push";

/**
 * Order alerts while the installed admin is closed (Web Push; the owner's request of 2026-10-27).
 * A member turns them on per device (`OrderAlertsSettings`): the browser asks permission, the
 * service worker (`public/admin-sw.js`) is registered for `/admin/`, and the browser's subscription
 * is kept by `register_web_push_subscription`; the push sender delivers each new order of the
 * store to it (`supabase/functions/send-mobile-push/web-push.ts`). The sound is the device's own
 * notification sound: a page cannot play its chime while it is closed.
 */

/** The platform's public VAPID key (its private half is the push sender's secret). */
// prettier-ignore
export const VAPID_PUBLIC_KEY = "BF7pwTsbHu-eE0lo3szbjRl9gmt9l5AeoD57e4h1b5kLRw_Yh6ARvbOBdouNY0h5GzrwAPbAzNa6nGDG5Ka2X6Y"; // gitleaks:allow (a public key)

export const ADMIN_WORKER = "/admin-sw.js";
/**
 * The worker covers `/admin` itself, the installed app's start: the server sends `/admin/` to
 * `/admin`, which a `/admin/` scope did not cover. Devices that turned alerts on before keep their
 * subscription under the old scope (`LEGACY_SCOPE`), served by the same worker file.
 */
export const ADMIN_SCOPE = "/admin";
export const LEGACY_SCOPE = "/admin/";
/** The one-colour, see-through icon Android draws in its status bar. */
export const ALERT_BADGE = "/admin-app/badge-96.png";
export const ALERT_ICON = "/admin-app/icon-192.png";

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

/** The admin's worker registrations: the current scope first, then the one from before. */
async function adminRegistrations(): Promise<ServiceWorkerRegistration[]> {
  if (!("serviceWorker" in navigator)) return [];
  const all = await navigator.serviceWorker.getRegistrations();
  const at = (scope: string) => all.find((r) => new URL(r.scope).pathname === scope) ?? null;
  return [at(ADMIN_SCOPE), at(LEGACY_SCOPE)].filter(
    (r): r is ServiceWorkerRegistration => r !== null,
  );
}

async function adminRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  return (await adminRegistrations())[0];
}

/** This device's subscription for alerts, if it has one (under either scope). */
export async function currentAlertSubscription(): Promise<PushSubscription | null> {
  for (const registration of await adminRegistrations()) {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) return subscription;
  }
  return null;
}

/**
 * Registers the admin's worker for every member, not only those with alerts on: it is what makes
 * the installed app open without a connection (its offline page) and keeps alerts working when the
 * browser renews a subscription. Registering again is harmless; a refusal is ignored.
 */
export async function ensureAdminWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register(ADMIN_WORKER, { scope: ADMIN_SCOPE });
  } catch {
    // A private window or a browser setting can refuse it: the admin works as a website.
  }
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
  // A subscription from before (under either scope) is kept: the device is the same.
  const subscription =
    (await currentAlertSubscription()) ??
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
  const user = await getCurrentUser();
  if (user) rememberAlertDevice({ brandId, endpoint, userId: user.id });
  return "on";
}

/** Gives the store this browser's subscription, under the person's alert choices so far. */
async function giveSubscription(
  brandId: string,
  subscription: PushSubscription,
  oldEndpoint: string | null,
  userId: string,
) {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) return;
  // The old subscription's choices, while the platform still has it.
  const choices = oldEndpoint ? await fetchAlertChoices(oldEndpoint).catch(() => null) : null;
  await registerWebPushSubscription({
    brandId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    deviceName: navigator.userAgent.slice(0, 180),
  });
  if (choices) {
    const kept = Object.fromEntries(
      Object.entries(choices).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
      ),
    );
    if (Object.keys(kept).length) await saveAlertChoices(endpoint, kept);
  }
  if (oldEndpoint) await removeWebPushSubscription(oldEndpoint).catch(() => undefined);
  rememberAlertDevice({ brandId, endpoint, userId });
}

/**
 * When the admin opens (and when the worker says the browser renewed the subscription): keeps the
 * alerts this person turned on in this browser working (`alertSyncStep`). Quiet: a refusal (the
 * person lost the permission, the store is gone) leaves things as they are.
 */
export async function syncAlertDevice(): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    const remembered = rememberedAlertDevice();
    if (!remembered || Notification.permission !== "granted") return;
    const user = await getCurrentUser();
    if (!user) return;
    const subscription = await currentAlertSubscription();
    const known = subscription
      ? (await fetchAlertChoices(subscription.endpoint).catch(() => null)) !== null
      : false;
    const step = alertSyncStep({
      permission: Notification.permission,
      endpoint: subscription?.endpoint ?? null,
      remembered,
      known,
      userId: user.id,
    });
    if (step.kind === "none") return;
    const current =
      subscription ??
      (await (
        await activeRegistration()
      ).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
      }));
    await giveSubscription(step.brandId, current, step.oldEndpoint, user.id);
  } catch {
    // Alerts are given again from the alerts card in the settings.
  }
}

/** Turns alerts off for this device: the platform forgets it, then the browser does. */
export async function turnOffOrderAlerts(): Promise<void> {
  const subscription = await currentAlertSubscription();
  if (!subscription) return;
  await removeWebPushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
  forgetAlertDevice();
}

/** A notification shown at once, as an alert will look and sound on this device. */
export async function showTestAlert(title: string, body: string): Promise<void> {
  const registration = await adminRegistration();
  await registration?.showNotification(title, {
    body,
    icon: ALERT_ICON,
    badge: ALERT_BADGE,
    tag: "boutq-test",
    silent: false,
  });
}

/** This device's alert choices, or null when it takes no alerts. */
export async function deviceAlertChoices(): Promise<Record<string, unknown> | null> {
  const subscription = await currentAlertSubscription();
  return subscription ? fetchAlertChoices(subscription.endpoint) : null;
}

/** Turns one kind of alert on or off for this device; answers every choice as saved. */
export async function setDeviceAlertChoice(
  kind: string,
  on: boolean,
): Promise<Record<string, unknown>> {
  const subscription = await currentAlertSubscription();
  if (!subscription) throw new Error("NO_SUBSCRIPTION");
  return saveAlertChoices(subscription.endpoint, { [kind]: on });
}
