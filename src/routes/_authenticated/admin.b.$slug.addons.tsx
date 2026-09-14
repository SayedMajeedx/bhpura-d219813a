import { createFileRoute } from "@tanstack/react-router";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { OsPageHeader } from "@/components/os/os-page-header";
import { AddonStore } from "@/components/addons/AddonStore";
import { Puzzle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { StoreVertical } from "@/lib/store-profile";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/addons")({
  component: AddonsPageRoute,
});

function AddonsPageRoute() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const brandId = brand.id;
  const slug = brand.slug;

  const { data: businessSettings } = useQuery({
    queryKey: queryKeys.brand.businessSettings(brandId || ""),
    queryFn: async () => {
      if (!brandId) return null;
      const { data, error } = await (supabase.from("business_settings") as any)
        .select("store_vertical")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(brandId),
  });

  const storeVertical = (businessSettings?.store_vertical as StoreVertical) || null;

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      <OsPageHeader
        eyebrow={
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Puzzle className="size-3.5 text-primary" />
            <span>{isAr ? "إدارة وتوسعات المتجر" : "Store Extensions"}</span>
          </div>
        }
        title={isAr ? "متجر الإضافات" : "Add-ons Store"}
        description={
          isAr
            ? "استكشف الإضافات وثبّت الوحدات التخصصية المناسبة لنشاطك التجاري، وخصّص إعداداتها بكل سهولة."
            : "Explore, install, and configure specialized modular add-ons tailored to your boutique vertical."
        }
      />

      {brandId ? <AddonStore brandId={brandId} slug={slug} storeVertical={storeVertical} /> : null}
    </div>
  );
}
