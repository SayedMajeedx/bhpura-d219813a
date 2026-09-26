import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchCallerProfile } from "@/lib/data/profiles";
import { fetchAnyBrandSlug, fetchBrandSlug } from "@/lib/data/brands";

/**
 * /admin smart redirector.
 *
 * Routes signed-in users to their brand workspace:
 * - super admin → /admin/brands (unless they have a brand assigned, then to that brand's dashboard)
 * - brand admin / staff → /admin/b/{their-slug}/dashboard
 * - anyone without a brand assignment → /admin/brands (super admin) or /auth
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const profile = await fetchCallerProfile(user.id);

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it" || email === "majeed@hotmail.com";
    const isSuperAdmin = isFixedSuperAdmin || profile?.role === "super_admin";

    // Super admin workspace is strictly platform tenant management (/admin/brands).
    // Super admins can only access a specific merchant's dashboard via explicit impersonation sessions.
    if (isSuperAdmin) {
      throw redirect({ to: "/admin/brands" });
    }

    if (profile?.brand_id) {
      const slug = await fetchBrandSlug(profile.brand_id);
      if (slug) {
        throw redirect({
          to: profile?.role === "courier" ? "/admin/b/$slug/orders" : "/admin/b/$slug/dashboard",
          params: { slug },
        });
      }
    }

    const fallback = await fetchAnyBrandSlug();
    if (fallback) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: fallback } });
    }

    throw redirect({ to: "/auth" });
  },
});
