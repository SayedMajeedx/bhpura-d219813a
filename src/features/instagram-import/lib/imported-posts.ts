/**
 * Which Instagram posts a brand has already brought in, so one is never imported twice.
 *
 * A post counts only while the product made from it still exists: a merchant who deletes a
 * product (to import it again, say) must be able to import that post again. Each import run
 * records which product it made from which posts; an older run, from before that was recorded,
 * counts when a product of the brand was made within a couple of minutes before it.
 */

export type ImportRunRow = { created_at: string; issues: unknown };
export type ProductRow = { id: string; created_at: string; custom_fields: unknown };

/** How long before a run's own row its products were inserted (they are written one after another). */
export const LEGACY_RUN_WINDOW_MS = 120_000;

type RunIssues = {
  imported_post_ids?: unknown;
  products?: { product_id?: unknown; post_ids?: unknown }[];
};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

export function importedPostIds(runs: ImportRunRow[], products: ProductRow[]): Set<string> {
  const found = new Set<string>();
  const productIds = new Set(products.map((product) => product.id));
  const madeAt = products.map((product) => Date.parse(product.created_at)).filter(Number.isFinite);

  for (const run of runs) {
    const issues = (run.issues ?? {}) as RunIssues;
    if (Array.isArray(issues.products)) {
      for (const made of issues.products) {
        if (productIds.has(String(made.product_id)))
          strings(made.post_ids).forEach((id) => found.add(id));
      }
      continue;
    }
    const ranAt = Date.parse(run.created_at);
    const hasProduct = madeAt.some((at) => at <= ranAt && ranAt - at <= LEGACY_RUN_WINDOW_MS);
    if (hasProduct) strings(issues.imported_post_ids).forEach((id) => found.add(id));
  }

  // The oldest importer kept the post on the product itself.
  for (const row of products) {
    const fields = row.custom_fields;
    if (Array.isArray(fields)) {
      for (const item of fields as Record<string, unknown>[]) {
        if (item?.key === "instagram_post_id" && item.value) found.add(String(item.value));
      }
    } else if (fields && typeof fields === "object") {
      const value = (fields as Record<string, unknown>).instagram_post_id;
      if (value) found.add(String(value));
    }
  }
  return found;
}
