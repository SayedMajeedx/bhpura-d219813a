/**
 * Pure helpers for the product CSV importer (Shopify, Salla, Zid or custom
 * exports, Arabic or English headers).
 */

export type ProductColumnMappings = { name: number; price: number; image: number; stock: number };

/** -1 means "no column mapped". */
export const DEFAULT_PRODUCT_MAPPINGS: ProductColumnMappings = {
  name: -1,
  price: -1,
  image: -1,
  stock: -1,
};

/** Header aliases per field, matched case-insensitively. */
export const PRODUCT_HEADER_MAPS = {
  name: ["title", "name", "اسم المنتج", "عنوان المنتج", "product name", "product_name"],
  price: [
    "price",
    "price (bhd)",
    "price (sar)",
    "السعر",
    "سعر البيع",
    "selling_price",
    "price_bhd",
  ],
  image: [
    "image src",
    "image",
    "media",
    "صورة المنتج",
    "روابط الصور",
    "image_url",
    "image url",
    "image_src",
  ],
  stock: [
    "variant inventory qty",
    "stock",
    "الكمية",
    "المخزون",
    "inventory",
    "qty",
    "quantity",
    "stock_main",
  ],
};

/**
 * Picks the first column whose header equals or contains an alias of each
 * field. "Contains" is deliberate (it matches "Price (BHD)"), but it also means
 * a header like "Cost price" maps to `price`; the importer always shows the
 * mapping for confirmation before importing.
 */
export function detectProductColumns(headers: readonly string[]): ProductColumnMappings {
  const mappings: ProductColumnMappings = { ...DEFAULT_PRODUCT_MAPPINGS };
  for (const [field, aliases] of Object.entries(PRODUCT_HEADER_MAPS)) {
    mappings[field as keyof ProductColumnMappings] = headers.findIndex((header) =>
      aliases.some(
        (alias) =>
          header.toLowerCase() === alias.toLowerCase() ||
          header.toLowerCase().includes(alias.toLowerCase()),
      ),
    );
  }
  return mappings;
}

export type ImportRunSummary = {
  session_id: string;
  status: string;
  total_count: number;
  success_count: number;
  skipped_count: number;
  failed_count: number;
};

/**
 * One import session can write several `import_runs` rows (one per batch).
 * Sums their counts per session, keeps "failed"/"partial" if any batch had it,
 * and returns the first `limit` sessions in their original (newest-first) order.
 */
export function mergeImportRunsBySession<T extends ImportRunSummary>(
  rows: readonly T[],
  limit: number,
): T[] {
  const sessions = new Map<string, T>();
  for (const row of rows) {
    const existing = sessions.get(row.session_id);
    const current = existing ?? { ...row };
    if (existing) {
      current.total_count += row.total_count;
      current.success_count += row.success_count;
      current.skipped_count += row.skipped_count;
      current.failed_count += row.failed_count;
      if (row.status === "failed" || row.status === "partial") current.status = row.status;
    }
    sessions.set(row.session_id, current);
  }
  return [...sessions.values()].slice(0, limit);
}
