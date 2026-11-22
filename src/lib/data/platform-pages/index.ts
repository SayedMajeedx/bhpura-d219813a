import { queryOptions } from "@tanstack/react-query";
import { publicSupabase } from "@/integrations/supabase/client";
import { readPage, type PlatformPage } from "@/lib/platform-pages/page";

/**
 * Platform pages (`boutq.store/p/<slug>`), as a visitor reads them: a published or closed page,
 * never a draft (`platform_page_public`, migration 20261218100000).
 */

export const platformPagesKeys = {
  all: ["platform-pages"] as const,
  page: (slug: string) => [...platformPagesKeys.all, "page", slug] as const,
};

/** The page at this address, or null when there is none a visitor may read. */
export async function fetchPlatformPage(slug: string): Promise<PlatformPage | null> {
  const { data, error } = await publicSupabase.rpc("platform_page_public", { p_slug: slug });
  if (error) throw error;
  return readPage(data);
}

export const platformPagesQueries = {
  page: (slug: string) =>
    queryOptions({
      queryKey: platformPagesKeys.page(slug),
      queryFn: () => fetchPlatformPage(slug),
      staleTime: 60_000,
    }),
};
