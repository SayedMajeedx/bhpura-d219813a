import { overviewProfit, type ComposedOverviewRow } from "@/lib/reporting-compose";
import { COUNT_FORMAT, PERCENT_FORMAT, moneyFormat, type XCell, type XSheet } from "./workbook";

/**
 * Margin by product and by category (`rpc_reporting_margins`): what each made after its cost,
 * and its share of the period's gross profit. The products' totals are the statement's for the
 * same period (net sales after returns, cost of goods after returns); `reconcile` says so, or
 * by how much they differ.
 */

export type MarginRow = {
  currency: string;
  product_id: string | null;
  product_name: string | null;
  product_name_ar: string | null;
  category: string | null;
  category_name: string | null;
  category_name_ar: string | null;
  units: number;
  partner_units: number;
  gross_sales: number;
  partner_sales: number;
  discounts: number;
  returns: number;
  cost_of_goods: number;
  missing_cost_units: number;
};

export type MarginLine = {
  key: string;
  name: string;
  /** The product's category (a category line has none). */
  category: string | null;
  units: number;
  partnerUnits: number;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cost: number;
  grossProfit: number;
  /** Gross profit as a share of net sales, in percent; null when nothing was sold. */
  margin: number | null;
  /** This line's part of the period's gross profit, in percent. */
  share: number | null;
  /** Some pieces sold had no cost recorded: its profit is overstated. */
  missingCost: boolean;
  /** A product's own products count (a category line). */
  products?: number;
};

export type MarginSort = "profit" | "margin" | "sales" | "units";

export const MARGIN_WORDS = {
  unlinked: { en: "Not linked to a product", ar: "غير مرتبطة بمنتج" },
  noCategory: { en: "No category", ar: "بلا قسم" },
};

const num = (value: unknown) => Number(value ?? 0) || 0;

export function marginRows(value: unknown): MarginRow[] {
  return (Array.isArray(value) ? value : []).map((row: Record<string, unknown>) => ({
    currency: String(row.currency ?? ""),
    product_id: (row.product_id as string | null) ?? null,
    product_name: (row.product_name as string | null) ?? null,
    product_name_ar: (row.product_name_ar as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    category_name: (row.category_name as string | null) ?? null,
    category_name_ar: (row.category_name_ar as string | null) ?? null,
    units: num(row.units),
    partner_units: num(row.partner_units),
    gross_sales: num(row.gross_sales),
    partner_sales: num(row.partner_sales),
    discounts: num(row.discounts),
    returns: num(row.returns),
    cost_of_goods: num(row.cost_of_goods),
    missing_cost_units: num(row.missing_cost_units),
  }));
}

function line(
  key: string,
  name: string,
  category: string | null,
  rows: MarginRow[],
): Omit<MarginLine, "share"> {
  const grossSales = rows.reduce((s, r) => s + r.gross_sales, 0);
  const discounts = rows.reduce((s, r) => s + r.discounts, 0);
  const returns = rows.reduce((s, r) => s + r.returns, 0);
  const netSales = grossSales - discounts - returns;
  const cost = rows.reduce((s, r) => s + r.cost_of_goods, 0);
  const grossProfit = netSales - cost;
  return {
    key,
    name,
    category,
    units: rows.reduce((s, r) => s + r.units, 0),
    partnerUnits: rows.reduce((s, r) => s + r.partner_units, 0),
    grossSales,
    discounts,
    returns,
    netSales,
    cost,
    grossProfit,
    margin: Math.abs(netSales) > 0.0005 ? (grossProfit / netSales) * 100 : null,
    missingCost: rows.some((r) => r.missing_cost_units > 0),
  };
}

function withShares(lines: Array<Omit<MarginLine, "share">>): MarginLine[] {
  const total = lines.reduce((s, l) => s + l.grossProfit, 0);
  return lines.map((l) => ({
    ...l,
    share: total > 0.0005 ? (l.grossProfit / total) * 100 : null,
  }));
}

const productName = (row: MarginRow, lang: "ar" | "en") =>
  row.product_id
    ? (lang === "ar" ? row.product_name_ar || row.product_name : row.product_name) || "—"
    : MARGIN_WORDS.unlinked[lang];

const categoryName = (row: MarginRow, lang: "ar" | "en") =>
  (lang === "ar" ? row.category_name_ar || row.category_name : row.category_name) ||
  MARGIN_WORDS.noCategory[lang];

/** One line per product sold in this currency (lines with no product together). */
export function productMargins(rows: MarginRow[], currency: string, lang: "ar" | "en") {
  const mine = rows.filter((r) => r.currency === currency);
  const byProduct = new Map<string, MarginRow[]>();
  for (const row of mine) {
    const key = row.product_id ?? "unlinked";
    byProduct.set(key, [...(byProduct.get(key) ?? []), row]);
  }
  return withShares(
    [...byProduct.entries()].map(([key, group]) =>
      line(
        key,
        productName(group[0], lang),
        group[0].product_id ? categoryName(group[0], lang) : null,
        group,
      ),
    ),
  );
}

/** One line per category, with how many of its products sold. */
export function categoryMargins(rows: MarginRow[], currency: string, lang: "ar" | "en") {
  const mine = rows.filter((r) => r.currency === currency);
  const byCategory = new Map<string, MarginRow[]>();
  for (const row of mine) {
    const key = row.product_id ? (row.category ?? row.category_name ?? "none") : "unlinked";
    byCategory.set(key, [...(byCategory.get(key) ?? []), row]);
  }
  return withShares(
    [...byCategory.entries()].map(([key, group]) => ({
      ...line(
        key,
        key === "unlinked" ? MARGIN_WORDS.unlinked[lang] : categoryName(group[0], lang),
        null,
        group,
      ),
      products: new Set(group.map((r) => r.product_id)).size,
    })),
  );
}

export function sortMargins(lines: MarginLine[], sort: MarginSort): MarginLine[] {
  const by: Record<MarginSort, (l: MarginLine) => number> = {
    profit: (l) => l.grossProfit,
    margin: (l) => l.margin ?? Number.NEGATIVE_INFINITY,
    sales: (l) => l.netSales,
    units: (l) => l.units,
  };
  return [...lines].sort((a, b) => by[sort](b) - by[sort](a) || a.name.localeCompare(b.name));
}

export function marginTotals(lines: MarginLine[]) {
  const t = line("total", "", null, []);
  const totals = lines.reduce(
    (s, l) => ({
      ...s,
      units: s.units + l.units,
      partnerUnits: s.partnerUnits + l.partnerUnits,
      grossSales: s.grossSales + l.grossSales,
      discounts: s.discounts + l.discounts,
      returns: s.returns + l.returns,
      netSales: s.netSales + l.netSales,
      cost: s.cost + l.cost,
      grossProfit: s.grossProfit + l.grossProfit,
      missingCost: s.missingCost || l.missingCost,
    }),
    { ...t },
  );
  return {
    ...totals,
    margin:
      Math.abs(totals.netSales) > 0.0005 ? (totals.grossProfit / totals.netSales) * 100 : null,
    share: totals.grossProfit > 0.0005 ? 100 : null,
  };
}

/**
 * Whether the products add up to the statement's figures for the same period: net sales and
 * cost of goods, each to within half a fils (rounding of the shares).
 */
export function reconcile(
  totals: Pick<MarginLine, "netSales" | "cost">,
  statement: Partial<ComposedOverviewRow> | undefined,
  digits: number,
) {
  const { netSales, costOfGoods } = overviewProfit(statement);
  const netSalesDiff = totals.netSales - netSales;
  const costDiff = totals.cost - costOfGoods;
  // The database keeps full precision; the statement's own figures are rounded to the fils.
  const tolerance = 10 ** -digits;
  return {
    netSalesDiff,
    costDiff,
    ok: Math.abs(netSalesDiff) <= tolerance && Math.abs(costDiff) <= tolerance,
  };
}

export const MARGIN_COLUMNS = {
  name: { en: "Product", ar: "المنتج" },
  category: { en: "Category", ar: "القسم" },
  units: { en: "Pieces", ar: "القطع" },
  netSales: { en: "Net sales", ar: "صافي المبيعات" },
  cost: { en: "Cost of goods", ar: "تكلفة البضاعة" },
  grossProfit: { en: "Gross profit", ar: "مجمل الربح" },
  margin: { en: "Margin", ar: "الهامش" },
  share: { en: "Share of profit", ar: "من الربح" },
  grossSales: { en: "Gross sales", ar: "إجمالي المبيعات" },
  discounts: { en: "Discounts", ar: "الخصومات" },
  returns: { en: "Returns", ar: "المرتجعات" },
  partnerUnits: { en: "Of which at partner shops", ar: "منها في المحلات الشريكة" },
  total: { en: "Total", ar: "المجموع" },
  products: { en: "Products sold", ar: "منتجات مبيعة" },
};

/** The margins as an Excel sheet: every figure, by product or by category, with the total. */
export function marginsSheet(input: {
  lines: MarginLine[];
  by: "product" | "category";
  currency: string;
  digits: number;
  lang: "ar" | "en";
  title: string;
  subtitle: string;
}): XSheet {
  const { lines, by, currency, digits, lang, title, subtitle } = input;
  const w = (words: { en: string; ar: string }) => words[lang];
  const money = moneyFormat(digits);
  const percent = (v: number | null): XCell =>
    v === null ? null : { value: v / 100, format: PERCENT_FORMAT };
  const heads = [
    by === "product" ? w(MARGIN_COLUMNS.name) : w(MARGIN_COLUMNS.category),
    ...(by === "product" ? [w(MARGIN_COLUMNS.category)] : [w(MARGIN_COLUMNS.products)]),
    w(MARGIN_COLUMNS.units),
    w(MARGIN_COLUMNS.partnerUnits),
    `${w(MARGIN_COLUMNS.grossSales)} (${currency})`,
    w(MARGIN_COLUMNS.discounts),
    w(MARGIN_COLUMNS.returns),
    w(MARGIN_COLUMNS.netSales),
    w(MARGIN_COLUMNS.cost),
    w(MARGIN_COLUMNS.grossProfit),
    w(MARGIN_COLUMNS.margin),
    w(MARGIN_COLUMNS.share),
  ];
  const row = (l: MarginLine | ReturnType<typeof marginTotals>, label: string, total = false) => [
    { value: label, bold: total, total },
    by === "product"
      ? { value: "category" in l ? l.category : null, total }
      : { value: "products" in l ? (l.products ?? null) : null, format: COUNT_FORMAT, total },
    { value: l.units, format: COUNT_FORMAT, total },
    { value: l.partnerUnits, format: COUNT_FORMAT, total },
    { value: l.grossSales, format: money, total },
    { value: -l.discounts, format: money, total },
    { value: -l.returns, format: money, total },
    { value: l.netSales, format: money, bold: true, total },
    { value: -l.cost, format: money, total },
    { value: l.grossProfit, format: money, bold: true, total },
    percent(l.margin),
    percent(l.share),
  ];
  return {
    name: title,
    rtl: lang === "ar",
    stickyRows: 4,
    stickyColumns: 1,
    widths: [34, 18, 9, 12, 14, 12, 12, 14, 14, 14, 9, 10],
    rows: [
      [{ value: title, bold: true }],
      [{ value: subtitle }],
      [],
      heads.map((value) => ({ value, heading: true })),
      ...lines.map((l) => row(l, l.name)),
      row(marginTotals(lines), w(MARGIN_COLUMNS.total), true),
    ],
  };
}
