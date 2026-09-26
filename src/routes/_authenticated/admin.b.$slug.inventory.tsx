import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ordersQueries } from "@/lib/data/orders";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { useT, useI18n } from "@/lib/i18n";
import { ActivityLogList } from "@/components/activity-log-list";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { InventoryCommandHeader } from "@/components/inventory/InventoryCommandHeader";
import { PackagingMaterialsTab } from "@/components/inventory/PackagingMaterialsTab";
import {
  catalogInsightQueries,
  catalogQueries,
  invalidateCatalog,
  invalidateCustomizations,
} from "@/lib/data/catalog";

import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { OsLoadFailedState, combinedLoadState } from "@/components/os/os-load-failed-state";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";
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

  const products = useQuery({ ...catalogQueries.products(brandId), refetchOnWindowFocus: false });

  const variants = useQuery({ ...catalogQueries.variants(brandId), refetchOnWindowFocus: false });

  const customizations = useQuery({
    ...catalogQueries.customizations(brandId),
    refetchOnWindowFocus: false,
  });

  const backInStockRequests = useQuery({
    ...catalogInsightQueries.backInStockCount(brandId),
    refetchOnWindowFocus: false,
  });

  const businessName = useQuery({
    ...businessSettingsQueries.detail(brandId),
    refetchOnWindowFocus: false,
  });

  const salesHistory = useQuery({
    ...ordersQueries.variantSales(brandId, 45),
    refetchOnWindowFocus: false,
  });

  if (!brandId) {
    return <RoutePendingSkeleton />;
  }

  const loadState = combinedLoadState([products, variants]);
  if (loadState === "loading") {
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

  if (loadState === "failed") {
    return (
      <OsLoadFailedState
        isAr={lang === "ar"}
        title={lang === "ar" ? "تعذّر تحميل المخزون" : "Inventory could not be loaded"}
        description={
          lang === "ar"
            ? "لم يتم تغيير أي منتجات أو كميات. تحقق من الاتصال ثم أعد المحاولة."
            : "No products or quantities were changed. Check the connection and try again."
        }
        queries={[products, variants]}
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
          onChanged={() => void invalidateCatalog(qc, brandId)}
          salesHistory={salesHistory.data ?? []}
        />
      ) : tab === "packaging" ? (
        <PackagingMaterialsTab />
      ) : (
        <CustomizationsSection
          brandId={brandId}
          items={customizations.data ?? []}
          products={products.data ?? []}
          onChanged={() => invalidateCustomizations(qc, brandId)}
        />
      )}

      <div className="mt-8">
        <ActivityLogList scope="inventory" brandId={brandId} />
      </div>
    </div>
  );
}
