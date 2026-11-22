import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * What the super admin's home reads besides the stores themselves (`brandQueries.list()`): each
 * store's own figures and subscription (`platform_store_stats`, migration 20261220100000), the
 * stores that were deleted (`saas_audit_logs`, `brand.deleted`) and the platform pages' new
 * responses. Super admins only, by the database's rules.
 */

export const superAdminHomeKeys = {
  all: () => ["super-admin", "home"] as const,
  storeStats: () => [...superAdminHomeKeys.all(), "store-stats"] as const,
  deletedStores: () => [...superAdminHomeKeys.all(), "deleted-stores"] as const,
  newResponses: () => [...superAdminHomeKeys.all(), "new-responses"] as const,
};

export type StoreStats = {
  brandId: string;
  vertical: string | null;
  currency: string;
  orders30d: number;
  sales30d: number;
  ordersTotal: number;
  lastOrderAt: string | null;
  products: number;
  subscription: {
    status: string;
    interval: string;
    planCode: string;
    periodEnd: string | null;
    priceMonthly: number;
    priceAnnual: number;
    currency: string;
  } | null;
};

/** Each store's own figures and its subscription. */
export async function fetchStoreStats(): Promise<StoreStats[]> {
  const { data, error } = await supabase.rpc("platform_store_stats");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    brandId: row.brand_id,
    vertical: row.store_vertical ?? null,
    currency: row.currency || "BHD",
    orders30d: Number(row.orders_30d ?? 0),
    sales30d: Number(row.sales_30d ?? 0),
    ordersTotal: Number(row.orders_total ?? 0),
    lastOrderAt: row.last_order_at ?? null,
    products: Number(row.products ?? 0),
    subscription: row.sub_plan_code
      ? {
          status: row.sub_status ?? "",
          interval: row.sub_interval ?? "",
          planCode: row.sub_plan_code,
          periodEnd: row.sub_period_end ?? null,
          priceMonthly: Number(row.sub_price_monthly ?? 0),
          priceAnnual: Number(row.sub_price_annual ?? 0),
          currency: row.sub_currency || "BHD",
        }
      : null,
  }));
}

export type DeletedStoreRecord = {
  brandId: string;
  mode: "soft" | "hard";
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  createdAt: string | null;
  deletedAt: string;
  deletedBy: string | null;
};

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

/** The stores deleted since the platform kept a record, newest first. */
export async function fetchDeletedStoreRecords(): Promise<DeletedStoreRecord[]> {
  const { data, error } = await supabase
    .from("saas_audit_logs")
    .select("target_id, actor_email, changes, created_at")
    .eq("action", "brand.deleted")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const changes = (row.changes ?? {}) as Record<string, unknown>;
    return {
      brandId: row.target_id,
      mode: changes.mode === "hard" ? "hard" : "soft",
      slug: text(changes.slug) ?? "",
      nameEn: text(changes.name_en),
      nameAr: text(changes.name_ar),
      createdAt: text(changes.created_at),
      deletedAt: row.created_at,
      deletedBy: row.actor_email,
    };
  });
}

export type NewResponses = { pageId: string; slug: string; count: number };

/** The platform pages that hold responses no one has looked at yet, with how many. */
export async function fetchNewResponses(): Promise<NewResponses[]> {
  const { data, error } = await supabase
    .from("platform_page_responses")
    .select("page_id, platform_pages(slug)")
    .eq("status", "new")
    .limit(1000);
  if (error) throw error;
  const byPage = new Map<string, NewResponses>();
  for (const row of data ?? []) {
    const page = row.platform_pages as { slug: string } | null;
    const entry = byPage.get(row.page_id) ?? {
      pageId: row.page_id,
      slug: page?.slug ?? "",
      count: 0,
    };
    entry.count += 1;
    byPage.set(row.page_id, entry);
  }
  return [...byPage.values()];
}

export const superAdminHomeQueries = {
  storeStats: () =>
    queryOptions({ queryKey: superAdminHomeKeys.storeStats(), queryFn: fetchStoreStats }),
  deletedStores: () =>
    queryOptions({
      queryKey: superAdminHomeKeys.deletedStores(),
      queryFn: fetchDeletedStoreRecords,
    }),
  newResponses: () =>
    queryOptions({ queryKey: superAdminHomeKeys.newResponses(), queryFn: fetchNewResponses }),
};
