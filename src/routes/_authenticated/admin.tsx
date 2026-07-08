import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Legacy /dashboard redirector.
 *
 * Routes signed-in users to their brand workspace:
 * - super admin → /brands (unless they have a brand assigned, then to that brand's dashboard)
 * - brand admin / staff → /b/{their-slug}/dashboard
 * - anyone without a brand assignment → /brands (super admin) or /auth (with a message)
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, brand_id, email")
      .eq("id", user.id)
      .maybeSingle();

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it";
    const isSuperAdmin = isFixedSuperAdmin || profile?.role === "super_admin";

    // If user has a brand, go there.
    if (profile?.brand_id) {
      const { data: brand } = await supabase
        .from("brands")
        .select("slug")
        .eq("id", profile.brand_id)
        .maybeSingle();
      if (brand?.slug) {
        throw redirect({ to: "/b/$slug/dashboard", params: { slug: brand.slug } });
      }
    }

    // Super admin without an assigned brand → /brands
    if (isSuperAdmin) {
      throw redirect({ to: "/brands" });
    }

    // Fallback: try the default 'pura' brand
    const { data: fallback } = await supabase
      .from("brands")
      .select("slug")
      .eq("slug", "pura")
      .maybeSingle();
    if (fallback?.slug) {
      throw redirect({ to: "/b/$slug/dashboard", params: { slug: fallback.slug } });
    }

    throw redirect({ to: "/auth" });
  },
});
