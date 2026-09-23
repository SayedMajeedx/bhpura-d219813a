import type { QueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves the signed-in user for a route guard, or null when there is no
 * session.
 *
 * Two things this gets right that a naive guard does not:
 *
 * 1. It never throws a router `redirect` from inside the queryFn. TanStack
 *    Query treats a thrown redirect as a query error, so the router never sees
 *    it and the route sits on its pending component — /admin hung on
 *    "Loading..." for 28s in production for exactly this reason. Callers
 *    redirect from their own `beforeLoad` scope instead.
 *
 * 2. It keeps a transport failure retryable. A genuine "no session" is a value
 *    (null), while a network error is thrown so React Query can retry it per
 *    the client's retry policy. Returning null for both would sign a user out
 *    after a single flaky request.
 */
export async function ensureSessionUser(queryClient: QueryClient): Promise<User | null> {
  try {
    return await queryClient.ensureQueryData({
      queryKey: ["auth_user"],
      queryFn: async () => {
        const { data, error } = await supabase.auth.getUser();
        // Thrown, not returned: let the retry policy handle transient failures.
        if (error) throw error;
        return data.user ?? null;
      },
      staleTime: 1000 * 60 * 5,
    });
  } catch {
    // Retries are exhausted; treat it as unauthenticated so the caller can
    // redirect rather than leaving the route pending forever.
    return null;
  }
}
