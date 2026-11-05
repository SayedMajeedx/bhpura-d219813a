import { useEffect } from "react";
import { ensureAdminWorker, syncAlertDevice } from "@/lib/web-push";

/**
 * The admin as an installed app, on this device (the PWA review of 2026-11-05): its worker is
 * registered for every member (it opens the app without a connection and keeps alerts alive), and
 * the alerts this person turned on here are given again when the browser renews them, at once when
 * the worker says so, else the next time the admin opens. Draws nothing.
 */
export function AdminAppDevice() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void ensureAdminWorker().then(() => syncAlertDevice());
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "boutq:push-subscription-changed") void syncAlertDevice();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}
