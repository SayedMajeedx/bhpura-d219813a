import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PackageLine } from "@/lib/bookings/service-package";

/**
 * What each package of a store includes (service_package_items): the merchant
 * edits it with the package, and the storefront shows it (anyone may read the
 * items of an active package). See supabase/migrations/20261002120000_service_packages.sql.
 */

export const servicePackagesKeys = {
  all: (brandId: string) => ["service-packages", brandId] as const,
  items: (brandId: string) => [...servicePackagesKeys.all(brandId), "items"] as const,
};

/** Every package item of the store, in the order the merchant gave them. */
export async function fetchPackageItems(brandId: string) {
  const { data, error } = await supabase
    .from("service_package_items")
    .select("package_id, product_id, quantity, sort_order")
    .eq("brand_id", brandId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
export type PackageItemRow = Awaited<ReturnType<typeof fetchPackageItems>>[number];

export const servicePackagesQueries = {
  items: (brandId: string) =>
    queryOptions({
      queryKey: servicePackagesKeys.items(brandId),
      queryFn: () => fetchPackageItems(brandId),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
};

export function invalidateServicePackages(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: servicePackagesKeys.all(brandId) });
}

/** What a package includes, by package. */
export function packageLinesById(rows: readonly PackageItemRow[]): Map<string, PackageLine[]> {
  const byPackage = new Map<string, PackageItemRow[]>();
  for (const row of rows)
    byPackage.set(row.package_id, [...(byPackage.get(row.package_id) ?? []), row]);
  return new Map(
    [...byPackage].map(([id, list]) => [
      id,
      [...list]
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((row) => ({ product_id: row.product_id, quantity: row.quantity })),
    ]),
  );
}

/** Replaces what a package includes with these lines (none: it includes nothing). */
export async function savePackageItems(
  brandId: string,
  packageId: string,
  lines: readonly PackageLine[],
) {
  const removed = await supabase
    .from("service_package_items")
    .delete()
    .eq("brand_id", brandId)
    .eq("package_id", packageId);
  if (removed.error) throw removed.error;
  if (lines.length === 0) return;
  const { error } = await supabase.from("service_package_items").insert(
    lines.map((line, index) => ({
      brand_id: brandId,
      package_id: packageId,
      product_id: line.product_id,
      quantity: line.quantity,
      sort_order: index,
    })),
  );
  if (error) throw error;
}
