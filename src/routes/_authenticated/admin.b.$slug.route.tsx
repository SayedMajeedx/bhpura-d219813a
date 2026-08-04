import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BrandProvider, type Brand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCw, AlertTriangle, ArrowLeft } from "lucide-react";

function getImpersonationToken(request?: Request): string | null {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(^|;)\s*boutq_impersonation_token\s*=\s*([^;]+)/);
    return match ? match[2] : null;
  }
  if (request) {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/(^|;)\s*boutq_impersonation_token\s*=\s*([^;]+)/);
    return match ? match[2] : null;
  }
  return null;
}

function decodeBase64(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "base64").toString("utf-8");
  }
  return atob(str);
}

export const Route = createFileRoute("/_authenticated/admin/b/$slug")({
  beforeLoad: async ({ context: { queryClient }, params }) => {
    // Retry helper for transient network glitches in route beforeLoad
    const fetchWithRetry = async <T,>(fn: () => Promise<T>, retries = 2): Promise<T> => {
      try {
        return await fn();
      } catch (err: any) {
        if (err && typeof err === "object" && "to" in err) throw err; // Don't catch redirects!
        if (retries > 0) {
          await new Promise((res) => setTimeout(res, 200));
          return fetchWithRetry(fn, retries - 1);
        }
        throw err;
      }
    };

    const user = await fetchWithRetry(() =>
      queryClient.ensureQueryData({
        queryKey: ["auth_user"],
        queryFn: async () => {
          const { data, error } = await supabase.auth.getUser();
          if (error || !data.user) throw redirect({ to: "/auth" });
          return data.user;
        },
        staleTime: 1000 * 60 * 5,
      }),
    );

    // Concurrently fetch target brand, caller profile, and business settings with 5m staleTime
    const [brand, profile, iconSettings] = await Promise.all([
      fetchWithRetry(() =>
        queryClient.ensureQueryData({
          queryKey: ["brand_by_slug", params.slug],
          queryFn: async () => {
            const { data: brand, error: brandErr } = await (supabase as any)
              .from("brands")
              .select(
                "id, slug, name_en, name_ar, logo_url, is_active, subscription_tier, subscription_status, subscription_expires_at, payment_receipt_url, payment_receipt_uploaded_at, custom_domain, support_access_enabled, plan_type, trial_ends_at, created_at",
              )
              .eq("slug", params.slug)
              .maybeSingle();

            if (brandErr || !brand) {
              throw redirect({ to: "/admin" });
            }
            return brand;
          },
          staleTime: 1000 * 60 * 5,
        }),
      ),
      fetchWithRetry(() =>
        queryClient.ensureQueryData({
          queryKey: ["caller_profile", user.id],
          queryFn: async () => {
            const { data: profile } = await supabase
              .from("profiles")
              .select("role, status, brand_id, email")
              .eq("id", user.id)
              .maybeSingle();
            return profile ?? null;
          },
          staleTime: 1000 * 60 * 5,
        }),
      ),
      fetchWithRetry(() =>
        queryClient.ensureQueryData({
          queryKey: ["brand_icon_settings", params.slug],
          queryFn: async () => {
            const { data: brandData } = await (supabase as any)
              .from("brands")
              .select("id")
              .eq("slug", params.slug)
              .maybeSingle();
            if (!brandData) return null;

            const { data: iconSettings } = await (supabase.from("business_settings") as any)
              .select("favicon_url, logo_url")
              .eq("brand_id", brandData.id)
              .maybeSingle();

            return iconSettings ?? null;
          },
          staleTime: 1000 * 60 * 5,
        }),
      ),
    ]);

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it" || email === "majeed@hotmail.com";
    const isSuperAdmin = isFixedSuperAdmin || profile?.role === "super_admin";
    const isActive = !profile || profile.status === "active";

    if (!isActive) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    const belongsToBrand = profile?.brand_id === brand.id;

    if (!isSuperAdmin && !belongsToBrand) {
      throw redirect({ to: "/admin" });
    }

    if (isSuperAdmin && !belongsToBrand) {
      const accessEnabled = brand.support_access_enabled !== false;
      if (!accessEnabled) {
        throw redirect({ to: "/admin/brands" });
      }

      const token = getImpersonationToken();
      if (!token) {
        throw redirect({ to: "/admin/brands" });
      }

      try {
        const payload = JSON.parse(decodeBase64(token));
        const matchesBrand = payload.targetTenantId === brand.id;
        const isNotExpired = payload.issuedAt > Date.now() - 1000 * 60 * 60 * 24;

        if (!matchesBrand || !isNotExpired) {
          throw redirect({ to: "/admin/brands" });
        }
      } catch {
        throw redirect({ to: "/admin/brands" });
      }
    }

    if (!brand.is_active && !isSuperAdmin) {
      throw redirect({ to: "/admin" });
    }

    return {
      brand: {
        ...brand,
        favicon_url: iconSettings?.favicon_url ?? null,
        logo_url: iconSettings?.logo_url ?? brand.logo_url ?? null,
      } as Brand,
    };
  },
  component: BrandLayout,
  errorComponent: BrandError,
  notFoundComponent: () => <BrandError />,
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
  const { lang } = useI18n();
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6 animate-fade-in">
      <Card className="max-w-md w-full p-8 text-center space-y-4 shadow-lg border-border/60 rounded-2xl bg-card/80 backdrop-blur-md">
        <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <div className="text-lg font-bold font-heading text-foreground">
            {lang === "ar" ? "تعذر تحميل مساحة عمل المتجر" : "Error loading brand workspace"}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {lang === "ar"
              ? "حدث انقطاع مؤقت في الاتصال أو انتهت الجلسة. أعد تحميل الصفحة أو انقر على زر العودة."
              : "A temporary connection issue occurred or session expired. Reload page or click back."}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
          <Button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto h-9 min-h-[36px] gap-2 font-bold shadow-sm"
          >
            <RotateCw className="h-4 w-4" />
            <span>{lang === "ar" ? "إعادة تحميل الصفحة" : "Reload Page"}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              } else {
                window.location.href = "/admin";
              }
            }}
            className="w-full sm:w-auto h-9 min-h-[36px] gap-2 font-semibold"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            <span>{lang === "ar" ? "العودة" : "Go Back"}</span>
          </Button>
        </div>
      </Card>
    </div>
  );
}
