import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ordersQueries } from "@/lib/data/orders";
import {
  businessSettingsQueries,
  invalidateBusinessSettings,
  saveLowStockLevel,
} from "@/lib/data/business-settings";
import { useT, useI18n } from "@/lib/i18n";
import { ActivityLogList } from "@/components/activity-log-list";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { isServicesProfile } from "@/lib/store-profile";
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
import { INVENTORY_VIEW_PARAMS, inventoryViewFromSearch } from "@/features/inventory/lib/list-view";
import { lowStockLevel } from "@/lib/inventory-health";
import { shouldShowPrices } from "@/lib/storefront-mode";
import { useProfile } from "@/lib/profile-context";
import { getFriendlyErrorMessage } from "@/lib/utils";

/** The list's view (tab, search, filters, sort, page: `list-view.ts`) and the "new" action. */
type InventorySearch = Partial<Record<(typeof INVENTORY_VIEW_PARAMS)[number] | "action", string>>;

export const Route = createFileRoute("/_authenticated/admin/b/$slug/inventory")({
  validateSearch: (search: Record<string, unknown>): InventorySearch => {
    const result: InventorySearch = {};
    for (const key of [...INVENTORY_VIEW_PARAMS, "action"] as const) {
      const value = search[key];
      if (typeof value === "string" && value) result[key] = value;
      else if (typeof value === "number") result[key] = String(value);
    }
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
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const [tab, setTab] = useState<"products" | "customizations" | "packaging">("products");
  const { canViewFinancials, hasPermission } = useProfile();
  const initialView = useMemo(() => inventoryViewFromSearch(searchParams), [searchParams]);

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

  const saveLevel = async (level: number) => {
    try {
      await saveLowStockLevel(brandId, level);
    } catch (error) {
      toast.error(
        lang === "ar" ? "تعذّر حفظ حد المخزون المنخفض." : "The low stock level was not saved.",
        { description: getFriendlyErrorMessage(error) },
      );
      return false;
    }
    await invalidateBusinessSettings(qc, brandId);
    toast.success(lang === "ar" ? "تم حفظ حد المخزون المنخفض." : "Low stock level saved.");
    return true;
  };

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
          isServices={isServicesProfile(storeProfile.modules)}
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
          className={`min-w-0 flex-1 break-words rounded-lg py-2 px-2 text-xs sm:px-3 sm:text-sm font-semibold transition-all duration-200 ${tab === "products" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
          onClick={() => setTab("products")}
        >
          {t("inventory.products")}
        </button>
        <button
          className={`min-w-0 flex-1 break-words rounded-lg py-2 px-2 text-xs sm:px-3 sm:text-sm font-semibold transition-all duration-200 ${tab === "customizations" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
          onClick={() => setTab("customizations")}
        >
          {t("inventory.customizations")}
        </button>
        {storeProfile.modules.packaging && (
          <button
            className={`min-w-0 flex-1 break-words rounded-lg py-2 px-2 text-xs sm:px-3 sm:text-sm font-semibold transition-all duration-200 ${tab === "packaging" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:bg-background/20"}`}
            onClick={() => setTab("packaging")}
          >
            {lang === "ar" ? "مواد التغليف" : "Packaging materials"}
          </button>
        )}
      </div>

      {tab === "products" ? (
        <ProductsSection
          initialView={initialView}
          initialAction={searchParams.action}
          lowStockUnits={lowStockLevel(businessName.data?.low_stock_threshold)}
          pricesMatter={shouldShowPrices(businessName.data)}
          canViewCosts={canViewFinancials}
          canEditLowStockLevel={hasPermission("manage_settings")}
          onSaveLowStockLevel={saveLevel}
          products={products.data ?? []}
          variants={variants.data ?? []}
          pendingNotifyCount={backInStockRequests.data ?? 0}
          businessName={businessName.data?.business_name ?? null}
          currency={businessName.data?.currency ?? "BHD"}
          onChanged={() => void invalidateCatalog(qc, brandId)}
          salesHistory={salesHistory.data ?? []}
        />
      ) : tab === "packaging" && storeProfile.modules.packaging ? (
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
