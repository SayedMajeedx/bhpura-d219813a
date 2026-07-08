import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BrandProvider, type Brand } from "@/lib/brand-context";
import { useT } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/b/$slug")({
  beforeLoad: async ({ params }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    // Load target brand
    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .select("id, slug, name_en, name_ar, logo_url, is_active")
      .eq("slug", params.slug)
      .maybeSingle();

    if (brandErr || !brand) {
      throw redirect({ to: "/dashboard" });
    }

    // Load caller profile (may be null for legacy users; treat email match as super admin)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, brand_id, email")
      .eq("id", user.id)
      .maybeSingle();

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it";
    const isSuperAdmin = isFixedSuperAdmin || profile?.role === "super_admin";
    const isActive = !profile || profile.status === "active";

    if (!isActive) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    const belongsToBrand = profile?.brand_id === brand.id;

    if (!isSuperAdmin && !belongsToBrand) {
      // Non-super-admin trying to access a brand they don't belong to.
      // Send them to their own workspace, or to the dashboard redirector.
      throw redirect({ to: "/dashboard" });
    }

    if (!brand.is_active && !isSuperAdmin) {
      throw redirect({ to: "/dashboard" });
    }

    return { brand: brand as Brand };
  },
  component: BrandLayout,
  errorComponent: BrandError,
  notFoundComponent: BrandError,
});

function BrandLayout() {
  const { brand } = Route.useRouteContext();
  return (
    <BrandProvider brand={brand}>
      <Outlet />
    </BrandProvider>
  );
}

function BrandError() {
  const t = useT();
  return (
    <div className="p-8 max-w-lg mx-auto">
      <Card className="p-8 text-center">
        <h2 className="text-xl font-display mb-2">{t("app.title")}</h2>
        <p className="text-muted-foreground">Brand not found or unavailable.</p>
      </Card>
    </div>
  );
}
