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

/** Headers that name a price but not the selling price (Shopify "Cost per item", "Compare At Price"; Salla "سعر التكلفة"). */
const NOT_A_SELLING_PRICE = /\b(cost|compare)\b|تكلفة/i;

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
    .join(" ");

/** How well a header names a field: 3 exact, 2 the alias as whole words, 1 contained, 0 not at all. */
function headerScore(field: keyof ProductColumnMappings, header: string, alias: string): number {
  if (field === "price" && NOT_A_SELLING_PRICE.test(header)) return 0;
  const h = header.trim().toLowerCase();
  const a = alias.toLowerCase();
  if (h === a) return 3;
  if (` ${words(h)} `.includes(` ${words(a)} `)) return 2;
  return h.includes(a) ? 1 : 0;
}

/**
 * Maps each field to the column whose header names it best: an exact alias
 * first, then the alias as whole words ("Variant Price", "Price (BHD)"), then
 * the alias anywhere in the header. A cost or compare-at column is never the
 * selling price, and one column maps to one field at most. Ties go to the
 * leftmost column. The importer shows the mapping for confirmation.
 */
export function detectProductColumns(headers: readonly string[]): ProductColumnMappings {
  const mappings: ProductColumnMappings = { ...DEFAULT_PRODUCT_MAPPINGS };
  const fields = Object.keys(PRODUCT_HEADER_MAPS) as Array<keyof ProductColumnMappings>;
  const candidates = fields.flatMap((field, fieldOrder) =>
    headers.map((header, column) => ({
      field,
      fieldOrder,
      column,
      score: Math.max(
        ...PRODUCT_HEADER_MAPS[field].map((alias) => headerScore(field, header, alias)),
      ),
    })),
  );
  candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.column - b.column || a.fieldOrder - b.fieldOrder)
    .forEach(({ field, column }) => {
      const taken = Object.values(mappings).includes(column);
      if (mappings[field] === -1 && !taken) mappings[field] = column;
    });
  return mappings;
}

/** Arabic-Indic and Persian digits as Western ones, and the Arabic decimal mark as a point. */
function westernDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".");
}

/**
 * A stock cell: its digits, with `whenEmpty` only when the cell has none (a
 * stock of 0 stays 0). A file that says nothing about stock has none: the
 * importer passes 0, never a made-up count (bug #51: it passed 10, which the
 * opening-ledger trigger then recorded as real pieces).
 */
export function stockFromCell(cell: string | undefined, whenEmpty = 0): number {
  const digits = westernDigits(cell ?? "").replace(/[^\d]/g, "");
  return digits === "" ? whenEmpty : Number.parseInt(digits, 10);
}

/**
 * A price cell as a number, or null when it gives none (empty, or no digits).
 * A price of 0 stays 0: it once became 10, as did an empty cell (bug #51).
 */
export function priceFromCell(cell: string | undefined): number | null {
  const text = westernDigits(cell ?? "").replace(/[^\d.]/g, "");
  if (!/\d/.test(text)) return null;
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
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
  description: string | null;
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
 * - Rows without a name are dropped and counted (`invalidCount`).
 * - Nothing the file does not say is made up (bug #51): a product whose file
 *   gives no price for a size comes in hidden at 0, so nothing is sold at a
 *   price no one set, and the inventory lists it under "No price" until it is
 *   priced (`unpricedCount`); a stock the file does not give is 0; no
 *   description is written. A Shopify row that only adds a photo adds that
 *   photo, never a variant.
 */
export function buildProductImportPayload({
  rows: dataRows,
  headers: headersList,
  preset,
  mappings: finalMappings,
  isAr,
  makeSku = defaultSku,
  pricesMatter = true,
}: {
  rows: string[][];
  headers: string[];
  preset: string;
  mappings: Record<string, number>;
  isAr: boolean;
  makeSku?: () => string;
  /** False for a catalog that shows no prices: a product with no price comes in as it is. */
  pricesMatter?: boolean;
}): { products: ImportedProductPayload[]; invalidCount: number; unpricedCount: number } {
  const findHeaderIdx = (names: string[]) => {
    return headersList.findIndex((h) =>
      names.some((name) => h.trim().toLowerCase() === name.toLowerCase()),
    );
  };

  const productsPayload = dataRows.map((row) => {
    let nameVal = "";
    let priceVal: number | null = null;
    let imageVal: string | null = null;
    let stockVal = 0;
    // Whether the row describes a variant (a price, stock, SKU or option); a Shopify
    // row that only adds a photo does not.
    let variantGiven = true;
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
      priceVal = priceIdx !== -1 ? priceFromCell(row[priceIdx]) : null;
      imageVal = imageIdx !== -1 ? row[imageIdx] : null;
      stockVal = stockIdx !== -1 ? stockFromCell(row[stockIdx]) : 0;
      if (skuIdx !== -1 && row[skuIdx]) {
        skuVal = row[skuIdx];
      }
      const filled = (index: number) => index !== -1 && Boolean(row[index]?.trim());
      variantGiven =
        filled(priceIdx) ||
        filled(stockIdx) ||
        filled(skuIdx) ||
        filled(option1ValueIdx) ||
        filled(option2ValueIdx);
    } else if (preset === "woocommerce") {
      const nameIdx = findHeaderIdx(["name", "title", "post_title"]);
      const priceIdx = findHeaderIdx(["regular price", "sale price", "price", "_regular_price"]);
      const imageIdx = findHeaderIdx(["images", "image_url", "image"]);
      const stockIdx = findHeaderIdx(["stock", "manage_stock", "_stock", "quantity"]);
      const skuIdx = findHeaderIdx(["sku"]);

      nameVal = nameIdx !== -1 ? row[nameIdx] : "";
      priceVal = priceIdx !== -1 ? priceFromCell(row[priceIdx]) : null;
      imageVal = imageIdx !== -1 ? row[imageIdx]?.split(",")?.[0]?.trim() || null : null;
      stockVal = stockIdx !== -1 ? stockFromCell(row[stockIdx]) : 0;
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
      priceVal = priceIdx !== -1 ? priceFromCell(row[priceIdx]) : null;
      imageVal = imageIdx !== -1 ? row[imageIdx]?.split(",")?.[0]?.trim() || null : null;
      stockVal = stockIdx !== -1 ? stockFromCell(row[stockIdx]) : 0;
      if (skuIdx !== -1 && row[skuIdx]) {
        skuVal = row[skuIdx];
      }
    } else {
      nameVal = finalMappings.name !== -1 ? row[finalMappings.name] : "";
      priceVal = finalMappings.price !== -1 ? priceFromCell(row[finalMappings.price]) : null;
      imageVal = finalMappings.image !== -1 ? row[finalMappings.image]?.trim() || null : null;
      stockVal = finalMappings.stock !== -1 ? stockFromCell(row[finalMappings.stock]) : 0;
      const skuIdx = finalMappings.sku ?? -1;
      if (skuIdx !== -1 && row[skuIdx]?.trim()) skuVal = row[skuIdx].trim();
    }

    return {
      name: nameVal.trim(),
      name_ar: isAr ? nameVal : null,
      name_en: isAr ? null : nameVal,
      description: null,
      description_ar: null,
      description_en: null,
      category: "General",
      image_url: imageVal,
      is_active: true,
      variantGiven,
      unpriced: priceVal === null,
      variants: [
        {
          size: sizeVal,
          size_unit: null,
          color: colorVal,
          fabric: null,
          sku: skuVal,
          barcode: null,
          cost_price: 0,
          selling_price: priceVal ?? 0,
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
        if (product.variantGiven) {
          // The group's first row may have been only a photo: it holds no variant then.
          if (!existing.variantGiven) {
            existing.variants = [];
            existing.unpriced = false;
            existing.variantGiven = true;
          }
          existing.variants.push(...product.variants);
          existing.unpriced = existing.unpriced || product.unpriced;
        }
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
  let unpricedCount = 0;
  const products: ImportedProductPayload[] = [];
  for (const { variantGiven: _variantGiven, unpriced, ...product } of consolidatedPayload) {
    if (product.name.trim().length === 0) {
      invalidCount += 1;
      continue;
    }
    const hide = unpriced && pricesMatter;
    if (hide) unpricedCount += 1;
    products.push({ ...product, is_active: !hide });
  }
  return { products, invalidCount, unpricedCount };
}
