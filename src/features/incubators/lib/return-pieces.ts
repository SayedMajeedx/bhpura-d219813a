import { pieceParts } from "@/features/incubators/lib/partner-stock";
import { chosenPicks, type PickRow } from "@/features/incubators/lib/stock-move";
import type { StockItem } from "@/features/incubators/types";

/**
 * Bringing a partner's pieces back to the store, many sizes at once (the owner's request of
 * 2026-11-19: a return was one size at a time). The database takes them back in one numbered
 * batch (`return_stock_to_store`); these rules only shape the dialog.
 */

type Lang = "ar" | "en";

export type ReturnRow = PickRow & { name: string };

/**
 * What the partner holds, each size with its partner code under it. Nothing starts chosen,
 * unless a size was named (the stock tab's "Return" on one row): that one starts at all it holds.
 */
export function returnRows(
  stock: readonly StockItem[],
  incubatorId: string,
  lang: Lang,
  preselect?: string | null,
): ReturnRow[] {
  return stock
    .filter((item) => item.incubator_id === incubatorId && Number(item.quantity) > 0)
    .map((item) => {
      const variant = item.product_variants;
      const parts = pieceParts(variant, lang);
      const held = Number(item.quantity);
      const code = item.external_code?.trim() || variant?.sku?.trim() || null;
      const named = item.variant_id === preselect;
      return {
        variantId: item.variant_id,
        name: parts.option ? `${parts.product} · ${parts.option}` : parts.product,
        productKey: variant?.products?.id ?? parts.product,
        product: parts.product,
        option: parts.option,
        available: held,
        note: code ? (lang === "ar" ? `الكود ${code}` : `Code ${code}`) : null,
        chosen: named,
        quantity: named ? held : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

/** What stops the return, in the reader's words; null when it can go. */
export function returnProblem(rows: readonly ReturnRow[], lang: Lang): string | null {
  const ar = lang === "ar";
  const chosen = chosenPicks(rows);
  if (chosen.length === 0) return ar ? "اختر قطعة واحدة على الأقل" : "Choose at least one piece";
  const over = chosen.find(
    (row) => !Number.isInteger(row.quantity) || row.quantity > row.available,
  );
  if (over) {
    return ar
      ? `${over.name}: الكمية أكبر مما عند المحل الشريك (${over.available})`
      : `${over.name}: more than the partner holds (${over.available})`;
  }
  if (chosen.length > 500) {
    return ar
      ? "عدد الأصناف كبير على إرجاع واحد؛ قسّمه على دفعتين"
      : "Too many different pieces for one return; do it in two";
  }
  return null;
}

/** What the database is sent: each chosen size and how many come back. */
export function returnPayload(rows: readonly ReturnRow[]) {
  return chosenPicks(rows).map((row) => ({ variantId: row.variantId, quantity: row.quantity }));
}
