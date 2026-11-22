import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireSuperAdminRoute } from "@/lib/auth/super-admin-route";
import { fetchPageIdBySlug } from "@/lib/data/platform-pages/admin";

/**
 * The grant survey's applications are the responses of the platform page `grant` since
 * migration 20261219100000: this address, kept for bookmarks and the menu, opens that inbox.
 */
export const Route = createFileRoute("/_authenticated/admin/super/grants")({
  beforeLoad: async () => {
    await requireSuperAdminRoute();
    const id = await fetchPageIdBySlug("grant").catch(() => null);
    throw id
      ? redirect({ to: "/admin/super/responses/$id", params: { id } })
      : redirect({ to: "/admin/super/pages" });
  },
});
