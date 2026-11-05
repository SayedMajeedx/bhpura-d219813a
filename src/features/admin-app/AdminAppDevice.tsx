import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ensureAdminWorker, syncAlertDevice } from "@/lib/web-push";
import { captureInstallPrompt } from "@/lib/install-prompt";
import { appBadgeFor, showAppBadge } from "@/lib/app-badge";
import { useNewArrivals } from "@/lib/new-arrivals";

/**
 * The admin as an installed app, on this device (the PWA review of 2026-11-05): its worker is
 * registered for every member (it opens the app without a connection and keeps alerts alive), and
 * the alerts this person turned on here are given again when the browser renews them, at once when
 * the worker says so, else the next time the admin opens. It keeps the browser's offer to install
 * the app (`InstallAppCard`) and the number on the app's icon (`appBadgeFor`). Draws nothing.
 */
export function AdminAppDevice() {
  const arrivals = useNewArrivals();
  const onOrders = useRouterState({
    select: (state) => /\/orders(\/|$)/.test(state.location.pathname),
  });
  useEffect(() => showAppBadge(appBadgeFor(arrivals, onOrders)), [arrivals, onOrders]);

  useEffect(() => {
    captureInstallPrompt();
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
