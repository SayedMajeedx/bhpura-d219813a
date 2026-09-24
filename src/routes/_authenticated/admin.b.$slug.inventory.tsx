import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { ActivityLogList } from "@/components/activity-log-list";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { InventoryCommandHeader } from "@/components/inventory/InventoryCommandHeader";
import { PackagingMaterialsTab } from "@/components/inventory/PackagingMaterialsTab";

import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";
import type { Product, Variant, Customization } from "@/features/inventory/types";
import { CustomizationsSection } from "@/features/inventory/components/CustomizationsSection";

import { ProductsSection } from "@/features/inventory/components/ProductsSection";
type InventorySearch = {
  filter?: string;
  scope?: string;
  action?: string;
};

export const Route = createFileRoute("/_authenticated/admin/b/$slug/inventory")({
  validateSearch: (search: Record<string, unknown>): InventorySearch => {
    const result: InventorySearch = {};
    if (typeof search.filter === "string") result.filter = search.filter;
    if (typeof search.scope === "string") result.scope = search.scope;
    if (typeof search.action === "string") result.action = search.action;
    return result;
  },
  component: Inventory,
});

function Inventory() {
  const searchParams = Route.useSearch();
  const t = useT();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;
  useEntitlements({ brandId });
  const [tab, setTab] = useState<"products" | "customizations" | "packaging">("products");

  useState<string | null>(null);

  useRealtimeInvalidate(
    [
      { table: "products", brandId, queryKey: queryKeys.products.all(brandId) },
      { table: "product_variants", brandId, queryKey: queryKeys.variants.all(brandId) },
      { table: "customization_options", brandId, queryKey: queryKeys.customizations.all(brandId) },
    ],
    `inventory-${brandId}`,
  );

  const products = useQuery({
    queryKey: queryKeys.products.all(brandId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        ...p,
        media: Array.isArray(p.media) ? p.media : [],
        custom_fields: Array.isArray(p.custom_fields) ? p.custom_fields : [],
      })) as Product[];
    },
  });

  const variants = useQuery({
    queryKey: queryKeys.variants.all(brandId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at");
      if (error) throw error;
      return data as unknown as Variant[];
    },
  });

  const customizations = useQuery({
    queryKey: queryKeys.customizations.all(brandId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customization_options")
        .select("*")
        .eq("brand_id", brandId)
        .order("name");
      if (error) throw error;
      return data as Customization[];
    },
  });

  const backInStockRequests = useQuery({
    queryKey: ["admin", brandId, "back-in-stock-count"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("back_in_stock_requests")
        .select("*", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .is("notified_at", null);
      if (error) return 0;
      return count ?? 0;
    },
  });

  const businessName = useQuery({
    queryKey: ["business-name", brandId],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("business_name, currency")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const salesHistory = useQuery({
    queryKey: ["inventory-sales-past45", brandId],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const past45Days = new Date();
      past45Days.setDate(past45Days.getDate() - 45);
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, order_items(variant_id, quantity)")
        .eq("brand_id", brandId)
        .in("status", ["confirmed", "paid", "shipped", "completed"])
        .gte("created_at", past45Days.toISOString());
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (!brandId) {
    return <RoutePendingSkeleton />;
  }

  if (products.isLoading || variants.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-1 sm:p-2 animate-fade-in">
        <InventoryCommandHeader
          lang={lang === "ar" ? "ar" : "en"}
          productCount={0}
          isCourier={false}
          onCreateNew={() => {}}
        />
        <RoutePendingSkeleton />
      </div>
    );
  }

  if (products.isError || variants.isError) {
    return (
      <OsEmptyState
        icon={AlertTriangle}
        title={lang === "ar" ? "تعذّر تحميل المخزون" : "Inventory could not be loaded"}
        description={
          lang === "ar"
            ? "لم يتم تغيير أي منتجات أو كميات. تحقق من الاتصال ثم أعد المحاولة."
            : "No products or quantities were changed. Check the connection and try again."
        }
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => void Promise.all([products.refetch(), variants.refetch()])}
          >
            <RefreshCw className="h-4 w-4 me-1.5" />
            {lang === "ar" ? "إعادة المحاولة" : "Try again"}
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-1 sm:p-2 animate-fade-in">
      <div className="flex p-1.5 gap-1.5 bg-muted rounded-xl border border-border-subtle max-w-lg">
        <button
          className={`flex-1 rounded-lg py-2 px-3 text-sm font-semibold transition-all duration-200 ${tab === "products" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
          onClick={() => setTab("products")}
        >
          {t("inventory.products")}
        </button>
        <button
          className={`flex-1 rounded-lg py-2 px-3 text-sm font-semibold transition-all duration-200 ${tab === "customizations" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
          onClick={() => setTab("customizations")}
        >
          {t("inventory.customizations")}
        </button>
        <button
          className={`flex-1 rounded-lg py-2 px-3 text-sm font-semibold transition-all duration-200 ${tab === "packaging" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
          onClick={() => setTab("packaging")}
        >
          {lang === "ar" ? "مواد التغليف" : "Packaging materials"}
        </button>
      </div>

      {tab === "products" ? (
        <ProductsSection
          initialFilter={searchParams.scope || searchParams.filter}
          initialAction={searchParams.action}
          products={products.data ?? []}
          variants={variants.data ?? []}
          pendingNotifyCount={backInStockRequests.data ?? 0}
          businessName={businessName.data?.business_name ?? null}
          currency={businessName.data?.currency ?? "BHD"}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: queryKeys.products.all(brandId) });
            qc.invalidateQueries({ queryKey: queryKeys.variants.all(brandId) });
          }}
          salesHistory={salesHistory.data ?? []}
        />
      ) : tab === "packaging" ? (
        <PackagingMaterialsTab />
      ) : (
        <CustomizationsSection
          brandId={brandId}
          items={customizations.data ?? []}
          products={products.data ?? []}
          onChanged={() =>
            qc.invalidateQueries({ queryKey: queryKeys.customizations.all(brandId) })
          }
        />
      )}

      <div className="mt-8">
        <ActivityLogList scope="inventory" brandId={brandId} />
      </div>
    </div>
  );
}
