import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30, // 30s stale time for instant cached transitions
        gcTime: 1000 * 60 * 10, // 10 minutes cache retention
        refetchOnWindowFocus: false, // Prevent aggressive and redundant database refetches when switching browser tabs
        refetchOnReconnect: "always",
        retry: 1, // Fail fast on bad networks rather than hanging the UI
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent", // Preload route chunks & beforeLoad on hover/touch for instantaneous transitions
    defaultPreloadStaleTime: 1000 * 30,
    // A page's loading shape shows only when a navigation takes long enough to be noticed (300ms),
    // and then stays long enough to be read (250ms): at 120ms a fast tap flashed a skeleton for a
    // moment before the page, which reads as a stutter.
    defaultPendingMs: 300,
    defaultPendingMinMs: 250,
    // No view transition between pages: the browser snapshots the old page before React may
    // draw the new one, which held every admin page back about 270ms (orders to inventory went
    // from 153ms to 420ms, tests/navigation-perf.spec.ts). The page wrapper's own fade
    // (`.os-page-transition`) moves without waiting.
  });

  return router;
};
