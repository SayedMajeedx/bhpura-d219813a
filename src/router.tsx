import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 10, // Cache results for 10 seconds before considering stale (instantly speeds up back-and-forth admin views)
        gcTime: 1000 * 60 * 5, // Keep unused cache in memory for 5 minutes
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
    defaultPreload: "intent", // Preloads routes on user intent (mouse hover / swipe focus) for instant navigation speed
    defaultPreloadStaleTime: 1000 * 10, // Preload stale check margin matches staleTime
  });

  return router;
};
