import { useSyncExternalStore } from "react";

/**
 * Installing the admin as an app from inside it (the PWA review of 2026-11-05): a browser that
 * can install it says so once (`beforeinstallprompt`); the admin keeps that and offers "Install
 * Boutq" in the account settings (`InstallAppCard`). An iPhone has no such prompt: it is told the
 * two taps in Safari. An app already opened from the home screen says it is installed.
 */

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

let deferred: InstallEvent | null = null;
let installed = false;
let listening = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Starts listening for the browser's offer; harmless to call again. */
export function captureInstallPrompt(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

/** Opens the browser's own install question; answers whether the person installed it. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") {
    installed = true;
    emit();
  }
  return outcome === "accepted";
}

export type InstallState = "installed" | "prompt" | "ios" | "browser-menu";

/** What the card offers on this device. */
export function installState(device: {
  standalone: boolean;
  installedNow: boolean;
  canPrompt: boolean;
  ios: boolean;
}): InstallState {
  if (device.standalone || device.installedNow) return "installed";
  if (device.canPrompt) return "prompt";
  if (device.ios) return "ios";
  return "browser-menu";
}

const snapshot = () => (deferred ? 1 : 0) + (installed ? 2 : 0);

/** Whether the browser's offer is held, and whether the app was installed while open. */
export function useInstallOffer(): { canPrompt: boolean; installedNow: boolean } {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot,
    () => 0,
  );
  return { canPrompt: (value & 1) === 1, installedNow: (value & 2) === 2 };
}
