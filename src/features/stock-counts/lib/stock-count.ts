import { realSize } from "@/lib/default-variant";
import type { StockCountFinding, StockCountLine } from "@/lib/data/stock-counts";

/**
 * A full stock count's rules (migration 20261231100000): how a count is named, finding a size by
 * a scan, the progress, and what the review says. The difference itself is the database's
 * (`stock_count_review`: counted against the stock the size had when it was counted, so a sale
 * during the count is never a loss); these only arrange it.
 */

type Lang = "ar" | "en";

/** "SC-0003", as the ledger's note and the report write it. */
export const stockCountLabel = (number: number) => `SC-${String(number).padStart(4, "0")}`;

/** A size as staff read it: the product, then its size and colour. */
export function lineName(line: Pick<StockCountLine, "products" | "product_variants">, lang: Lang) {
  const p = line.products;
  const name =
    (lang === "ar" ? p?.name_ar || p?.name_en : p?.name_en || p?.name_ar) || p?.name || "—";
  const options = [realSize(line.product_variants?.size), line.product_variants?.color?.trim()]
    .filter(Boolean)
    .join(" · ");
  return options ? `${name} · ${options}` : name;
}

const code = (value: string | null | undefined) => (value ?? "").trim().toUpperCase();

/** The size a scanned barcode or a typed code names, or null for none in this count. */
export function findByCode<T extends Pick<StockCountLine, "product_variants">>(
  lines: readonly T[],
  scanned: string,
): T | null {
  const wanted = code(scanned);
  if (!wanted) return null;
  return (
    lines.find((l) => code(l.product_variants?.barcode) === wanted) ??
    lines.find((l) => code(l.product_variants?.sku) === wanted) ??
    null
  );
}

export function countProgress(lines: readonly Pick<StockCountLine, "counted">[]) {
  const counted = lines.filter((l) => l.counted !== null).length;
  return { counted, total: lines.length };
}

/** The sizes still to count first, then by name; a search narrows by name or code. */
export function linesToShow<T extends StockCountLine>(
  lines: readonly T[],
  lang: Lang,
  search: string,
  onlyUncounted: boolean,
): T[] {
  const words = search.trim().toLowerCase();
  return lines
    .filter((l) => !onlyUncounted || l.counted === null)
    .filter(
      (l) =>
        !words ||
        lineName(l, lang).toLowerCase().includes(words) ||
        code(l.product_variants?.sku).toLowerCase().includes(words) ||
        code(l.product_variants?.barcode).toLowerCase().includes(words),
    )
    .sort(
      (a, b) =>
        Number(a.counted !== null) - Number(b.counted !== null) ||
        lineName(a, lang).localeCompare(lineName(b, lang)),
    );
}

export type ReviewRow = {
  variantId: string;
  name: string;
  sku: string;
  expected: number;
  moved: number;
  counted: number | null;
  difference: number | null;
  /** What the difference is worth at cost (null: no cost known, or not shown to this reader). */
  value: number | null;
};

/**
 * The review: every size with what the count found, the differences first (the largest first),
 * then the sizes not counted (they keep their stock), then those that matched.
 */
export function reviewRows(
  lines: readonly StockCountLine[],
  findings: readonly StockCountFinding[],
  lang: Lang,
  costOf?: (variantId: string, productId: string | null) => number | null,
): ReviewRow[] {
  const found = new Map(findings.map((f) => [f.variant_id, f]));
  const rows = lines.map((line): ReviewRow => {
    const f = found.get(line.variant_id);
    const difference = f?.difference ?? null;
    const cost = costOf?.(line.variant_id, line.product_id) ?? null;
    return {
      variantId: line.variant_id,
      name: lineName(line, lang),
      sku: line.product_variants?.sku ?? "",
      expected: line.expected,
      moved: f?.moved_during ?? 0,
      counted: f ? f.counted : line.counted,
      difference,
      value: difference !== null && cost !== null && cost > 0 ? round3(difference * cost) : null,
    };
  });
  const rank = (r: ReviewRow) => (r.difference ? 0 : r.counted === null ? 1 : 2);
  return rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function reviewTotals(rows: readonly ReviewRow[]) {
  let short = 0;
  let over = 0;
  let lostValue = 0;
  let foundValue = 0;
  let withValue = false;
  for (const r of rows) {
    const d = r.difference ?? 0;
    if (d < 0) short += -d;
    if (d > 0) over += d;
    if (r.value !== null) {
      withValue = true;
      if (r.value < 0) lostValue += -r.value;
      else foundValue += r.value;
    }
  }
  return {
    sizes: rows.length,
    counted: rows.filter((r) => r.counted !== null).length,
    uncounted: rows.filter((r) => r.counted === null).length,
    changed: rows.filter((r) => r.difference).length,
    short,
    over,
    lostValue: withValue ? round3(lostValue) : null,
    foundValue: withValue ? round3(foundValue) : null,
  };
}

const ERRORS: Record<string, { ar: string; en: string }> = {
  STOCK_COUNT_OPEN: {
    ar: "هناك جرد مفتوح. أكمله أو ألغه قبل بدء جرد جديد.",
    en: "A count is open. Finish or cancel it before starting another.",
  },
  STOCK_COUNT_EMPTY: {
    ar: "لا توجد مقاسات للجرد في هذا الاختيار.",
    en: "There are no sizes to count in this choice.",
  },
  STOCK_COUNT_CLOSED: {
    ar: "هذا الجرد انتهى أو أُلغي.",
    en: "This count was finished or cancelled.",
  },
  NOT_IN_COUNT: {
    ar: "هذه القطعة ليست ضمن هذا الجرد.",
    en: "This piece is not in this count.",
  },
  INVALID_COUNT: { ar: "العدد غير صحيح.", en: "That number is not right." },
  NOT_AUTHORIZED: {
    ar: "لا تملك صلاحية إدارة المخزون.",
    en: "You do not have permission to manage stock.",
  },
};

/** A refusal in the reader's words, never a bare code. */
export function stockCountError(error: unknown, lang: Lang): string {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  const known = Object.keys(ERRORS).find((key) => message.includes(key));
  if (known) return ERRORS[known][lang];
  return lang === "ar" ? "تعذّر الحفظ، حاول مرة أخرى." : "Could not save, try again.";
}
