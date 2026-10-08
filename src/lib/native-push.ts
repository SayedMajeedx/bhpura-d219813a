import { registerMobilePushDevice } from "@/lib/data/push";

/**
 * The merchant app (a shell around this admin) tells the page its push token; the page registers it
 * for the signed-in person. When that person signs out, the phone must stop getting their
 * notifications, so the page remembers the token and turns the device off just before signing out.
 * On a plain browser no token is ever sent, and none of this does anything.
 */

const STORAGE_KEY = "boutq.native-push-device";

type NativePushDevice = { token: string; platform: "ios" | "android" };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Called for each registration the app shell sends. A device the shell turned off is forgotten. */
export function rememberNativePushDevice(detail: {
  token?: unknown;
  enabled?: unknown;
  platform?: unknown;
}) {
  const store = storage();
  if (!store || typeof detail.token !== "string" || !detail.token) return;
  try {
    if (detail.enabled === false) {
      store.removeItem(STORAGE_KEY);
      return;
    }
    const device: NativePushDevice = {
      token: detail.token,
      platform: detail.platform === "ios" ? "ios" : "android",
    };
    store.setItem(STORAGE_KEY, JSON.stringify(device));
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

function rememberedDevice(): NativePushDevice | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const device = JSON.parse(raw) as Partial<NativePushDevice>;
    return typeof device.token === "string" && device.token
      ? { token: device.token, platform: device.platform === "ios" ? "ios" : "android" }
      : null;
  } catch {
    return null;
  }
}

/**
 * Turns this phone's notifications off for the signed-in person. Best effort and never throws: a
 * failure here must not stop someone from signing out. The next person to sign in on this phone
 * gets the device registered to them by the app shell, which sends it again.
 */
export async function releaseNativePushDevice() {
  const device = rememberedDevice();
  if (!device) return;
  try {
    await registerMobilePushDevice({
      token: device.token,
      enabled: false,
      platform: device.platform,
      deviceName: typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 180),
      // null keeps the preferences already saved for the device.
      preferences: null,
    });
  } catch {
    /* signing out matters more */
  }
}
