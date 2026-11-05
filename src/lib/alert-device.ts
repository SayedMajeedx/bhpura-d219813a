/**
 * Keeping a device's order alerts alive (the PWA review of 2026-11-05). A browser renews a push
 * subscription now and then (`pushsubscriptionchange`), and the platform only knows the old one:
 * the sender's next push to it is refused, it forgets the device, and the alerts stop with nothing
 * said. This browser remembers which store it took alerts for and the subscription it gave
 * (`rememberAlertDevice`), so the admin, when it opens, can give the store the new one
 * (`syncAlertDevice` in `web-push.ts`). A per-browser note for the person who turned alerts on:
 * on a shared device another person's subscription is never taken over, and a device with no note
 * (alerts turned on before it was kept) is left as it is.
 */

export type AlertDevice = { brandId: string; endpoint: string; userId: string };

const KEY = "boutq:alert-device";

export function rememberAlertDevice(device: AlertDevice) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(device));
  } catch {
    // Storage refused: a renewed subscription is given again from the alerts card.
  }
}

export function forgetAlertDevice() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
}

export function rememberedAlertDevice(): AlertDevice | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<AlertDevice>;
    return raw &&
      typeof raw.brandId === "string" &&
      typeof raw.endpoint === "string" &&
      typeof raw.userId === "string"
      ? { brandId: raw.brandId, endpoint: raw.endpoint, userId: raw.userId }
      : null;
  } catch {
    return null;
  }
}

export type AlertSyncStep =
  /** Nothing to do. */
  | { kind: "none" }
  /** The browser lost the subscription: subscribe again, then tell the store. */
  | { kind: "resubscribe"; brandId: string; oldEndpoint: string }
  /** The browser has a subscription the store does not know: tell the store. */
  | { kind: "register"; brandId: string; oldEndpoint: string | null };

/**
 * What the admin does for this device's alerts when it opens: only for the person who turned them
 * on in this browser, while notifications are allowed, for the store they chose.
 */
export function alertSyncStep(state: {
  permission: NotificationPermission | "unsupported";
  /** The browser's subscription now, if any. */
  endpoint: string | null;
  remembered: AlertDevice | null;
  /** The platform knows `endpoint` for this person (asked only when there is one). */
  known: boolean;
  /** The person signed in. */
  userId: string;
}): AlertSyncStep {
  const device = state.remembered;
  if (state.permission !== "granted" || !device || device.userId !== state.userId) {
    return { kind: "none" };
  }
  if (!state.endpoint) {
    return { kind: "resubscribe", brandId: device.brandId, oldEndpoint: device.endpoint };
  }
  if (device.endpoint !== state.endpoint || !state.known) {
    return {
      kind: "register",
      brandId: device.brandId,
      oldEndpoint: device.endpoint !== state.endpoint ? device.endpoint : null,
    };
  }
  return { kind: "none" };
}
