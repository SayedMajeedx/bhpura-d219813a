import { createFileRoute, redirect } from "@tanstack/react-router";
import { fetchCallerProfile } from "@/lib/data/profiles";
import { fetchAnyBrandSlug, fetchBrandSlug } from "@/lib/data/brands";
import { getCurrentUser } from "@/lib/auth/session";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import { readShortcut, shortcutTarget, type Shortcut } from "@/lib/app-shortcuts";

/**
 * /admin smart redirector.
 *
 * Routes signed-in users to their brand workspace:
 * - super admin → /admin/brands (unless they have a brand assigned, then to that brand's dashboard)
 * - brand admin / staff → /admin/b/{their-slug}/dashboard
 * - anyone without a brand assignment → /admin/brands (super admin) or /auth
 * - `?go=` (the installed app's shortcuts, `src/lib/app-shortcuts.ts`): that page of their store
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  validateSearch: (search: Record<string, unknown>): { go?: Shortcut } => {
    const go = readShortcut(search.go);
    return go ? { go } : {};
  },
  beforeLoad: async ({ search }) => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/auth" });

    const profile = await fetchCallerProfile(user.id);

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === SUPER_ADMIN_EMAIL;
    const isSuperAdmin = isFixedSuperAdmin || profile?.role === "super_admin";

    // Super admin workspace is strictly platform tenant management (/admin/brands).
    // Super admins can only access a specific merchant's dashboard via explicit impersonation sessions.
    if (isSuperAdmin) {
      throw redirect({ to: "/admin/brands" });
    }

    if (profile?.brand_id) {
      const slug = await fetchBrandSlug(profile.brand_id);
      if (slug) {
        throw redirect(shortcutTarget(slug, search?.go, profile?.role === "courier"));
      }
    }

    const fallback = await fetchAnyBrandSlug();
    if (fallback) {
      throw redirect(shortcutTarget(fallback, search?.go, false));
    }

    throw redirect({ to: "/auth" });
  },
});
