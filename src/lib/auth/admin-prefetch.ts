import type { QueryClient } from "@tanstack/react-query";
import { getCurrentSession } from "@/lib/auth/session";
import { profilesQueries } from "@/lib/data/profiles";
import { brandQueries } from "@/lib/data/brands";

/** The store an admin address opens: "/admin/b/pura/dashboard" gives "pura". */
export function adminSlugOf(pathname: string | null | undefined): string | null {
  const match = /^\/admin\/b\/([^/?#]+)/.exec(pathname ?? "");
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Starts the reads the admin's guards wait for (the caller's profile; the store and its icons for
 * a store's page) at the same moment as the sign-in check, from the session the browser already
 * holds. The guards then await the same queries, already on their way: the four once ran as a
 * chain (sign-in, then profile, then store, then icons), about two seconds before a page could
 * start loading its own data. Nothing is decided here: the guards still check every answer.
 */
export async function prefetchAdminShell(queryClient: QueryClient, pathname: string) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) return;
  void queryClient.prefetchQuery(profilesQueries.caller(userId));
  const slug = adminSlugOf(pathname);
  if (!slug) return;
  void queryClient.prefetchQuery(brandQueries.adminBySlug(slug));
  void queryClient.prefetchQuery(brandQueries.iconsBySlug(slug));
}
