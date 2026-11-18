import { realSize } from "@/lib/default-variant";
import { makeEan13 } from "@/lib/variant-sku-utils";

/**
 * Numbering a store's size codes (the owner's request of 2026-11-18: Pura's pieces had no codes,
 * and its new partner shop uses the store's codes). Pura already numbers its pieces 40xx, one
 * number per size, as its own codes and the codes written at its partner shop; this continues
 * that run. Which sizes get a new code and what each gets is worked out here; the database writes
 * them all at once and refuses a code already used (`assign_variant_codes`).
 *
 * - A size whose code is already the store's style (its prefix and a number) keeps it, and so does a
 *   readable code in another style unless asked to restyle it.
 * - Any other size (no code, Arabic letters, a stray mark, and another style when asked) takes
 *   the code its piece carries at a partner shop when that is in the store's style and free, so the
 *   tag on the piece stays right; else the store's next number.
 * - New numbers go in product order, then size, then colour.
 */

export type NumberingVariant = {
  id: string;
  product_id: string;
  sku: string | null;
  barcode: string | null;
  size: string | null;
  color: string | null;
};

export type NumberingProduct = { id: string; name: string | null; name_ar?: string | null };

/** A piece at a partner shop with the code written there. */
export type PartnerCode = { variant_id: string; external_code: string | null };

export type CodeRow = {
  variantId: string;
  product: string;
  size: string;
  color: string;
  current: string;
  proposed: string;
  /** Where the new code came from. */
  source: "partner" | "number";
  /** A new barcode for a size with none, when asked. */
  barcode: string | null;
};

const key = (code: string | null | undefined) => (code ?? "").trim().toLowerCase();

/** A code in the store's style: its prefix, then a number. */
export function inStoreStyle(code: string | null | undefined, prefix: string): boolean {
  const text = (code ?? "").trim().toUpperCase();
  if (!text.startsWith(prefix.toUpperCase())) return false;
  return /^[0-9]{1,9}$/.test(text.slice(prefix.length));
}

/** A size whose code is missing or cannot be read by a barcode or another shop's system. */
export function codeUnreadable(code: string | null | undefined): boolean {
  return !/^[A-Z0-9][A-Z0-9-]{0,39}$/.test((code ?? "").trim().toUpperCase());
}

const sizeOrder = (size: string) => {
  const number = Number.parseFloat(size);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
};

export function codePlan(input: {
  variants: readonly NumberingVariant[];
  products: readonly NumberingProduct[];
  partnerCodes: readonly PartnerCode[];
  prefix: string;
  nextNumber: number;
  /** Also give a barcode to each size with none. */
  withBarcodes: boolean;
  /**
   * Also renumber readable codes in another style (S79-56, PL1-BLK) into the store's: the owner's
   * choice for Pura, "to match the rest". Off, only missing and unreadable codes change.
   */
  restyle: boolean;
  makeBarcode?: (used: Set<string>) => string;
  lang: "ar" | "en";
}): CodeRow[] {
  const { prefix, lang } = input;
  const productOf = new Map(input.products.map((product) => [product.id, product]));
  const nameOf = (id: string) => {
    const product = productOf.get(id);
    return (lang === "ar" ? product?.name_ar || product?.name : product?.name) ?? "";
  };
  const keeps = (variant: NumberingVariant) =>
    inStoreStyle(variant.sku, prefix) || (!input.restyle && !codeUnreadable(variant.sku));

  // Codes that stay: no new code may take one of them.
  const used = new Set(input.variants.filter(keeps).map((variant) => key(variant.sku)));
  const partnerOf = new Map<string, string>();
  for (const line of input.partnerCodes) {
    const code = (line.external_code ?? "").trim().toUpperCase();
    if (code && inStoreStyle(code, prefix) && !partnerOf.has(line.variant_id)) {
      partnerOf.set(line.variant_id, code);
    }
  }

  const toNumber = input.variants
    .filter((variant) => !keeps(variant))
    .sort(
      (a, b) =>
        nameOf(a.product_id).localeCompare(nameOf(b.product_id), lang) ||
        sizeOrder(realSize(a.size) ?? "") - sizeOrder(realSize(b.size) ?? "") ||
        (a.color ?? "").localeCompare(b.color ?? "", lang),
    );

  // First the partner codes, so a number never takes one a piece already carries.
  const proposed = new Map<string, { code: string; source: CodeRow["source"] }>();
  for (const variant of toNumber) {
    const code = partnerOf.get(variant.id);
    if (code && !used.has(key(code))) {
      used.add(key(code));
      proposed.set(variant.id, { code, source: "partner" });
    }
  }
  let next = Math.max(1, Math.trunc(input.nextNumber));
  for (const variant of toNumber) {
    if (proposed.has(variant.id)) continue;
    while (used.has(key(`${prefix}${next}`))) next += 1;
    const code = `${prefix}${next}`;
    used.add(key(code));
    proposed.set(variant.id, { code, source: "number" });
    next += 1;
  }

  const barcodes = new Set(
    input.variants.map((variant) => variant.barcode?.trim() ?? "").filter(Boolean),
  );
  const makeBarcode = input.makeBarcode ?? makeEan13;
  return toNumber.map((variant) => {
    const chosen = proposed.get(variant.id)!;
    return {
      variantId: variant.id,
      product: nameOf(variant.product_id),
      size: realSize(variant.size) ?? "",
      color: variant.color?.trim() ?? "",
      current: variant.sku?.trim() ?? "",
      proposed: chosen.code,
      source: chosen.source,
      barcode: input.withBarcodes && !variant.barcode?.trim() ? makeBarcode(barcodes) : null,
    };
  });
}

/** Sizes the line above the inventory counts: no code, or one no barcode can carry. */
export function sizesNeedingCodes(variants: readonly NumberingVariant[]): number {
  return variants.filter((variant) => codeUnreadable(variant.sku)).length;
}

/** What stops the plan being saved, in the reader's words; null when it can be. */
export function codePlanProblem(
  rows: readonly CodeRow[],
  keptCodes: readonly string[],
  lang: "ar" | "en",
): string | null {
  const ar = lang === "ar";
  const seen = new Set(keptCodes.map(key));
  for (const row of rows) {
    if (codeUnreadable(row.proposed)) {
      return ar
        ? `${row.product}: الكود يكون حروفاً إنجليزية وأرقاماً فقط`
        : `${row.product}: a code is English letters, digits and dashes only`;
    }
    if (seen.has(key(row.proposed))) {
      return ar ? `الكود ${row.proposed} مستخدم مرتين` : `The code ${row.proposed} is used twice`;
    }
    seen.add(key(row.proposed));
  }
  return null;
}

/** The database's refusal in the reader's words, naming the piece it stopped on. */
export function codeAssignError(
  message: string,
  rows: readonly CodeRow[],
  lang: "ar" | "en",
): string | null {
  const [code, variantId] = message.split(":").map((part) => part.trim());
  const row = rows.find((candidate) => candidate.variantId === variantId);
  const piece = row ? `${row.product}${row.size ? ` · ${row.size}` : ""}` : "";
  const ar = lang === "ar";
  const words: Record<string, [string, string]> = {
    CODE_TAKEN: [
      `${piece}: الكود ${row?.proposed ?? ""} مستخدم لمقاس آخر`,
      `${piece}: the code ${row?.proposed ?? ""} is used by another size`,
    ],
    BARCODE_TAKEN: [
      `${piece}: الباركود مستخدم لمقاس آخر`,
      `${piece}: the barcode is used by another size`,
    ],
    INVALID_CODE: [
      `${piece}: الكود يكون حروفاً إنجليزية وأرقاماً فقط`,
      `${piece}: a code is English letters, digits and dashes only`,
    ],
    NOT_AUTHORIZED: ["لا تملك صلاحية تعديل المخزون", "You may not change the inventory"],
  };
  const found = Object.keys(words).find((name) => code.endsWith(name));
  return found ? words[found][ar ? 0 : 1] : null;
}
