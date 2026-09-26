import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { publicSupabase, supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

/**
 * The super admin's platform screens: tenants (plans, pending subscriptions,
 * a brand's usage before deletion, deletion), white-label apps and builds,
 * grant applications, entitlement overrides, system health and tenant
 * requests. RLS lets only super admins read most of these.
 */

export const superAdminKeys = {
  all: () => ["super-admin"] as const,
  activePlans: () => [...superAdminKeys.all(), "active-plans"] as const,
  /** Every pending-subscription lookup (prefix of `pendingSubscriptions`). */
  pendingSubscriptionsAll: () => [...superAdminKeys.all(), "pending-subscriptions"] as const,
  pendingSubscriptions: (brandIds: string[]) =>
    [...superAdminKeys.pendingSubscriptionsAll(), brandIds] as const,
  brandUsage: (brandId: string) => [...superAdminKeys.all(), "brand-usage", brandId] as const,
  whiteLabelApps: () => [...superAdminKeys.all(), "white-label-apps"] as const,
  whiteLabelBuilds: () => [...superAdminKeys.all(), "white-label-builds"] as const,
  grantApplications: () => [...superAdminKeys.all(), "grant-applications"] as const,
  entitlementOverrides: (brandId: string) =>
    [...superAdminKeys.all(), "entitlement-overrides", brandId] as const,
  systemHealth: () => [...superAdminKeys.all(), "system-health"] as const,
  tenantRequests: () => [...superAdminKeys.all(), "tenant-requests"] as const,
};

// ── Tenants ─────────────────────────────────────────────────────────────────

/** The active plans, in display order. A failed read is an empty list (the approval picker is optional). */
export async function fetchActivePlans() {
  const { data } = await supabase
    .from("saas_plans")
    .select("id, code, name_ar, name_en, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

/** The subscriptions of brands awaiting approval, with the plan they asked for. A failed read is none. */
export async function fetchPendingSubscriptions(brandIds: string[]) {
  if (brandIds.length === 0) return [];
  const { data } = await supabase
    .from("brand_subscriptions")
    .select(
      `
      id,
      brand_id,
      billing_interval,
      renewal_target_plan_id,
      target_plan:saas_plans!brand_subscriptions_renewal_target_plan_id_fkey(
        id,
        code,
        name_ar,
        name_en
      )
    `,
    )
    .in("brand_id", brandIds);
  return data ?? [];
}

/** How many orders, products and customers a brand holds (shown before deleting it). */
export async function fetchBrandUsage(brandId: string) {
  const count = (table: "orders" | "products" | "customers") =>
    supabase.from(table).select("id", { head: true, count: "exact" }).eq("brand_id", brandId);
  const [orders, products, customers] = await Promise.all([
    count("orders"),
    count("products"),
    count("customers"),
  ]);
  return {
    orders: orders.count ?? 0,
    products: products.count ?? 0,
    customers: customers.count ?? 0,
  };
}

/**
 * Deletes a brand (soft, or hard with its data). Throws the database error as
 * is: the dialog reads its message (BRAND_NOT_FOUND after a partial purge).
 */
export async function deleteBrand(brandId: string, hard: boolean) {
  const { error } = await supabase.rpc("delete_brand", { p_brand_id: brandId, p_hard: hard });
  if (error) throw error;
}

// ── White-label apps ────────────────────────────────────────────────────────

export async function fetchWhiteLabelApps() {
  const { data, error } = await supabase
    .from("white_label_apps_public")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchWhiteLabelBuilds() {
  const { data, error } = await supabase
    .from("white_label_app_builds_public")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Prepares (or rebuilds) a brand's white-label app. Throws the function's own
 * error message when it reports one.
 */
export async function provisionWhiteLabelApp(brandId: string, rebuild: boolean) {
  const { data, error } = await supabase.functions.invoke("provision-white-label-app", {
    body: { brand_id: brandId, rebuild },
  });
  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "Provisioning failed");
  }
  return data as { requires_github_connection?: boolean };
}

/** Makes a build the one customers download. */
export async function activateWhiteLabelBuild(buildId: string) {
  const { error } = await supabase.rpc("activate_white_label_build", { p_build_id: buildId });
  if (error) throw error;
}

// ── Grant applications ──────────────────────────────────────────────────────

export async function fetchGrantApplications() {
  const { data, error } = await supabase
    .from("merchant_grant_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateGrantApplication(
  applicationId: string,
  patch: TablesUpdate<"merchant_grant_applications">,
) {
  const { error } = await supabase
    .from("merchant_grant_applications")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", applicationId);
  if (error) throw error;
}

export async function deleteGrantApplication(applicationId: string) {
  const { error } = await supabase
    .from("merchant_grant_applications")
    .delete()
    .eq("id", applicationId);
  if (error) throw error;
}

/**
 * A merchant's grant application from the public page (anonymous client).
 * Returns the application's id.
 */
export async function submitGrantApplication(application: {
  businessName: string;
  instagramHandle: string;
  whatsappNumber: string;
  productCategory: string;
  readinessStatus: string;
  currentSalesChannel: string;
  biggestChallenge: string | null;
}) {
  const { data, error } = await publicSupabase.rpc("submit_grant_application", {
    p_business_name: application.businessName,
    p_instagram_handle: application.instagramHandle,
    p_whatsapp_number: application.whatsappNumber,
    p_product_category: application.productCategory,
    p_readiness_status: application.readinessStatus,
    p_current_sales_channel: application.currentSalesChannel,
    p_biggest_challenge: application.biggestChallenge ?? undefined,
  });
  if (error) throw error;
  return data;
}

// ── Entitlement overrides, health, tenant requests ──────────────────────────

export async function fetchEntitlementOverrides(brandId: string) {
  const { data, error } = await supabase
    .from("brand_entitlement_overrides")
    .select("*")
    .eq("brand_id", brandId);
  if (error) throw error;
  return data ?? [];
}

/** The latest 500 health events and the app's own readiness probe. */
export async function fetchSystemHealth() {
  const [{ data, error }, readyResponse] = await Promise.all([
    supabase
      .from("system_health_events")
      .select("id,service,status,correlation_id,duration_ms,metrics,error_code,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    fetch("/api/health/ready", { cache: "no-store" }),
  ]);
  if (error) throw error;
  const readiness = (await readyResponse.json()) as {
    status: string;
    database: string;
    latencyMs: number;
  };
  return { events: data ?? [], readiness, readyOk: readyResponse.ok };
}

/** Store requests waiting for a decision, newest first. */
export async function fetchPendingTenantRequests() {
  const { data, error } = await supabase
    .from("tenant_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const superAdminQueries = {
  activePlans: () =>
    queryOptions({ queryKey: superAdminKeys.activePlans(), queryFn: fetchActivePlans }),
  pendingSubscriptions: (brandIds: string[]) =>
    queryOptions({
      queryKey: superAdminKeys.pendingSubscriptions(brandIds),
      queryFn: () => fetchPendingSubscriptions(brandIds),
      enabled: brandIds.length > 0,
    }),
  brandUsage: (brandId: string) =>
    queryOptions({
      queryKey: superAdminKeys.brandUsage(brandId),
      queryFn: () => fetchBrandUsage(brandId),
    }),
  whiteLabelApps: () =>
    queryOptions({ queryKey: superAdminKeys.whiteLabelApps(), queryFn: fetchWhiteLabelApps }),
  whiteLabelBuilds: () =>
    queryOptions({ queryKey: superAdminKeys.whiteLabelBuilds(), queryFn: fetchWhiteLabelBuilds }),
  grantApplications: () =>
    queryOptions({
      queryKey: superAdminKeys.grantApplications(),
      queryFn: fetchGrantApplications,
    }),
  entitlementOverrides: (brandId: string) =>
    queryOptions({
      queryKey: superAdminKeys.entitlementOverrides(brandId),
      queryFn: () => fetchEntitlementOverrides(brandId),
      enabled: Boolean(brandId),
    }),
  systemHealth: () =>
    queryOptions({ queryKey: superAdminKeys.systemHealth(), queryFn: fetchSystemHealth }),
  tenantRequests: () =>
    queryOptions({
      queryKey: superAdminKeys.tenantRequests(),
      queryFn: fetchPendingTenantRequests,
    }),
};

export function invalidateWhiteLabel(qc: QueryClient, { builds = true } = {}) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: superAdminKeys.whiteLabelApps() }),
    builds ? qc.invalidateQueries({ queryKey: superAdminKeys.whiteLabelBuilds() }) : undefined,
  ]);
}
