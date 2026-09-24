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

export type ImportedVariantPayload = {
  size: string | null;
  size_unit: null;
  color: string | null;
  fabric: null;
  sku: string;
  barcode: null;
  cost_price: number;
  selling_price: number;
  stock_main: number;
  stock_incubator: number;
};

export type ImportedProductPayload = {
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string;
  description_ar: string | null;
  description_en: string | null;
  category: string;
  image_url: string | null;
  is_active: boolean;
  variants: ImportedVariantPayload[];
};

const defaultSku = () => `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

/**
 * Turns CSV rows into product payloads for `importProductCatalog`.
 *
 * - `preset` selects platform-specific column names (Shopify, WooCommerce,
 *   Salla/Zid); "custom" uses the admin-confirmed `mappings`.
 * - Shopify exports one row per variant; rows are merged by Handle.
 * - Rows without a name or with an invalid price are dropped and counted.
 *
 * Known quirk kept as-is (see Phase 5 report): with the custom preset an
 * empty or "0" stock cell imports as 10 units; other presets import 0.
 */
export function buildProductImportPayload({
  rows: dataRows,
  headers: headersList,
  preset,
  mappings: finalMappings,
  isAr,
  makeSku = defaultSku,
}: {
  rows: string[][];
  headers: string[];
  preset: string;
  mappings: Record<string, number>;
  isAr: boolean;
  makeSku?: () => string;
}): { products: ImportedProductPayload[]; invalidCount: number } {
  const findHeaderIdx = (names: string[]) => {
    return headersList.findIndex((h) =>
      names.some((name) => h.trim().toLowerCase() === name.toLowerCase()),
    );
  };

  const productsPayload = dataRows.map((row) => {
    let nameVal = "";
    let priceVal = 10.0;
    let imageVal: string | null = null;
    let stockVal = 10;
    let skuVal = makeSku();
    let sizeVal: string | null = null;
    let colorVal: string | null = null;

    if (preset === "shopify") {
      const titleIdx = findHeaderIdx(["title"]);
      const priceIdx = findHeaderIdx(["variant price", "price"]);
      const imageIdx = findHeaderIdx(["image src", "image url", "image_src", "image"]);
      const stockIdx = findHeaderIdx(["variant inventory qty", "inventory qty", "stock"]);
      const skuIdx = findHeaderIdx(["variant sku", "sku"]);
      const option1NameIdx = findHeaderIdx(["option1 name"]);
      const option1ValueIdx = findHeaderIdx(["option1 value"]);
      const option2NameIdx = findHeaderIdx(["option2 name"]);
      const option2ValueIdx = findHeaderIdx(["option2 value"]);

      const options = [
        [option1NameIdx, option1ValueIdx],
        [option2NameIdx, option2ValueIdx],
      ] as const;
      for (const [nameIndex, valueIndex] of options) {
        if (nameIndex === -1 || valueIndex === -1 || !row[valueIndex]) continue;
        const optionName = row[nameIndex]?.toLowerCase() || "";
        if (optionName.includes("size") || optionName.includes("مقاس")) sizeVal = row[valueIndex];
        else if (
          optionName.includes("color") ||
          optionName.includes("colour") ||
          optionName.includes("لون")
        )
          colorVal = row[valueIndex];
      }

      nameVal = titleIdx !== -1 ? row[titleIdx] : "";
      priceVal =
        priceIdx !== -1 ? parseFloat(row[priceIdx]?.replace(/[^\d.]/g, "") || "10") || 10.0 : 10.0;
      imageVal = imageIdx !== -1 ? row[imageIdx] : null;
      stockVal = stockIdx !== -1 ? parseInt(row[stockIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 10;
      if (skuIdx !== -1 && row[skuIdx]) {
        skuVal = row[skuIdx];
      }
    } else if (preset === "woocommerce") {
      const nameIdx = findHeaderIdx(["name", "title", "post_title"]);
      const priceIdx = findHeaderIdx(["regular price", "sale price", "price", "_regular_price"]);
      const imageIdx = findHeaderIdx(["images", "image_url", "image"]);
      const stockIdx = findHeaderIdx(["stock", "manage_stock", "_stock", "quantity"]);
      const skuIdx = findHeaderIdx(["sku"]);

      nameVal = nameIdx !== -1 ? row[nameIdx] : "";
      priceVal =
        priceIdx !== -1 ? parseFloat(row[priceIdx]?.replace(/[^\d.]/g, "") || "10") || 10.0 : 10.0;
      imageVal = imageIdx !== -1 ? row[imageIdx]?.split(",")?.[0]?.trim() || null : null;
      stockVal = stockIdx !== -1 ? parseInt(row[stockIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 10;
      if (skuIdx !== -1 && row[skuIdx]) {
        skuVal = row[skuIdx];
      }
    } else if (preset === "salla" || preset === "zid") {
      const nameIdx = findHeaderIdx([
        "اسم المنتج",
        "الاسم",
        "عنوان المنتج",
        "product name",
        "name",
      ]);
      const priceIdx = findHeaderIdx(["السعر", "سعر البيع", "selling_price", "price"]);
      const imageIdx = findHeaderIdx(["صورة المنتج", "روابط الصور", "الصور", "image_url", "image"]);
      const stockIdx = findHeaderIdx(["الكمية", "المخزون", "كمية المخزون", "quantity", "stock"]);
      const skuIdx = findHeaderIdx(["رمز المنتج", "sku"]);

      nameVal = nameIdx !== -1 ? row[nameIdx] : "";
      priceVal =
        priceIdx !== -1 ? parseFloat(row[priceIdx]?.replace(/[^\d.]/g, "") || "10") || 10.0 : 10.0;
      imageVal = imageIdx !== -1 ? row[imageIdx]?.split(",")?.[0]?.trim() || null : null;
      stockVal = stockIdx !== -1 ? parseInt(row[stockIdx]?.replace(/[^\d]/g, "") || "0") || 0 : 10;
      if (skuIdx !== -1 && row[skuIdx]) {
        skuVal = row[skuIdx];
      }
    } else {
      nameVal = finalMappings.name !== -1 ? row[finalMappings.name] : "";
      priceVal =
        finalMappings.price !== -1
          ? parseFloat(row[finalMappings.price]?.replace(/[^\d.]/g, "") || "10") || 10.0
          : 10.0;
      imageVal = finalMappings.image !== -1 ? row[finalMappings.image] : null;
      stockVal =
        finalMappings.stock !== -1
          ? parseInt(row[finalMappings.stock]?.replace(/[^\d]/g, "") || "0") || 10
          : 10;
    }

    return {
      name: nameVal.trim(),
      name_ar: isAr ? nameVal : null,
      name_en: isAr ? null : nameVal,
      description: isAr ? "تم الاستيراد بنجاح" : "Imported product details",
      description_ar: isAr ? "تم الاستيراد بنجاح" : null,
      description_en: isAr ? null : "Imported product details",
      category: "General",
      image_url: imageVal,
      is_active: true,
      variants: [
        {
          size: sizeVal,
          size_unit: null,
          color: colorVal,
          fabric: null,
          sku: skuVal,
          barcode: null,
          cost_price: 0,
          selling_price: priceVal,
          stock_main: stockVal,
          stock_incubator: 0,
        },
      ],
    };
  });

  // Shopify exports one row per variant. Consolidate rows by Handle so a
  // product with five variants is imported as one product, not five products.
  let consolidatedPayload = productsPayload;
  if (preset === "shopify") {
    const handleIdx = findHeaderIdx(["handle"]);
    const groups = new Map<string, (typeof productsPayload)[number]>();
    dataRows.forEach((row, index) => {
      const product = productsPayload[index];
      const key = (handleIdx !== -1 ? row[handleIdx] : product.name).trim().toLowerCase();
      const existing = groups.get(key);
      if (!existing) groups.set(key, product);
      else {
        existing.variants.push(...product.variants);
        if (!existing.image_url && product.image_url) existing.image_url = product.image_url;
        if (!existing.name && product.name) {
          existing.name = product.name;
          existing.name_ar = product.name_ar;
          existing.name_en = product.name_en;
        }
      }
    });
    consolidatedPayload = [...groups.values()];
  }

  let invalidCount = 0;
  const products = consolidatedPayload.filter((product) => {
    const valid =
      product.name.trim().length > 0 &&
      product.variants.every(
        (variant) => Number.isFinite(variant.selling_price) && variant.selling_price >= 0,
      );
    if (!valid) invalidCount += 1;
    return valid;
  });
  return { products, invalidCount };
}
