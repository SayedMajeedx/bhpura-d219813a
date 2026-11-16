import { realSize } from "@/lib/default-variant";
import type { Words } from "@/lib/report-words";
import { PERCENT_FORMAT } from "@/features/finance-reports/lib/workbook";
import {
  countCell,
  dayCell,
  inCurrency,
  moneyCell,
  num,
  tableSheet,
  text,
  type Column,
  type ExportContext,
  type ExportFile,
  type Rows,
} from "./export-shared";

/**
 * The products and customers exports. A product's row adds what it sold in the store and at the
 * partner shops, each apart and together (`rpc_reporting_products_inventory`, read to its end,
 * and `rpc_reporting_incubator_sales`'s products); a customer's row is what they bought.
 */

const TOTAL: Words = { en: "Total", ar: "المجموع" };

const PRODUCT_COLUMNS: Column[] = [
  { head: { en: "Product", ar: "المنتج" }, width: 30 },
  { head: { en: "Option", ar: "الخيار" }, width: 18 },
  { head: { en: "SKU", ar: "الرمز" }, width: 14 },
  { head: { en: "Pieces in store", ar: "قطع المتجر" }, width: 11, sum: true, count: true },
  { head: { en: "Pieces at partners", ar: "قطع المحلات" }, width: 11, sum: true, count: true },
  { head: { en: "Pieces", ar: "مجموع القطع" }, width: 10, sum: true, count: true },
  { head: { en: "Store sales", ar: "مبيعات المتجر" }, width: 14, sum: true },
  { head: { en: "Partner sales", ar: "مبيعات المحلات" }, width: 14, sum: true },
  { head: { en: "Total sales", ar: "إجمالي المبيعات" }, width: 14, sum: true },
  { head: { en: "Cost of goods", ar: "تكلفة البضاعة" }, width: 14, sum: true },
  { head: { en: "Gross profit", ar: "مجمل الربح" }, width: 14, sum: true },
  { head: { en: "Margin", ar: "الهامش" }, width: 9 },
  { head: { en: "Stock now", ar: "المخزون الآن" }, width: 11 },
];

export type ProductLine = {
  key: string;
  product: string | null;
  option: string | null;
  sku: string | null;
  storePieces: number;
  partnerPieces: number;
  storeSales: number;
  partnerSales: number;
  cost: number;
  stock: number | null;
};

const optionOf = (row: Record<string, unknown>) =>
  [realSize(text(row.size)), text(row.color), text(row.fabric)].filter(Boolean).join(" · ") || null;

/** One line per size, the store's sales and the partners' side by side. */
export function productLines(store: Rows, partners: Rows, currency: string): ProductLine[] {
  const lines = new Map<string, ProductLine>();
  const lineOf = (row: Record<string, unknown>) => {
    const key = String(row.variant_id ?? `${row.product_name ?? ""}|${optionOf(row) ?? ""}`);
    let line = lines.get(key);
    if (!line) {
      line = {
        key,
        product: text(row.product_name),
        option: optionOf(row),
        sku: text(row.sku),
        storePieces: 0,
        partnerPieces: 0,
        storeSales: 0,
        partnerSales: 0,
        cost: 0,
        stock: row.current_stock === undefined ? null : num(row.current_stock),
      };
      lines.set(key, line);
    }
    return line;
  };
  for (const row of inCurrency(store, currency)) {
    const line = lineOf(row);
    line.storePieces += num(row.units_sold);
    line.storeSales += num(row.net_merch_sales);
    line.cost += num(row.known_cogs);
    if (row.current_stock !== undefined) line.stock = num(row.current_stock);
  }
  for (const row of inCurrency(partners, currency)) {
    const line = lineOf(row);
    line.partnerPieces += num(row.units_sold);
    line.partnerSales += num(row.net_merch_sales);
    line.cost += num(row.known_cogs);
  }
  return [...lines.values()].sort(
    (a, b) => b.storeSales + b.partnerSales - (a.storeSales + a.partnerSales),
  );
}

export function productsExport(ctx: ExportContext, store: Rows, partners: Rows): ExportFile {
  const m = (v: number) => moneyCell(ctx, v);
  const rows = productLines(store, partners, ctx.currency).map((l) => {
    const sales = l.storeSales + l.partnerSales;
    const profit = sales - l.cost;
    return [
      { value: l.product },
      { value: l.option },
      { value: l.sku, text: true },
      countCell(l.storePieces),
      countCell(l.partnerPieces),
      countCell(l.storePieces + l.partnerPieces),
      m(l.storeSales),
      m(l.partnerSales),
      m(sales),
      m(-l.cost),
      m(profit),
      sales > 0 ? { value: profit / sales, format: PERCENT_FORMAT } : null,
      l.stock === null ? null : countCell(l.stock),
    ];
  });
  const table = tableSheet({
    ctx,
    name: { en: "Products", ar: "المنتجات" },
    note: {
      en: "Sales per size before order-wide discounts; cost of goods as recorded when sold",
      ar: "المبيعات لكل مقاس قبل خصومات الطلب كاملاً؛ والتكلفة كما سُجّلت عند البيع",
    },
    columns: PRODUCT_COLUMNS,
    rows,
    totalLabel: TOTAL,
  });
  return { sheets: [table.sheet], csv: table.csv };
}

export function customersExport(ctx: ExportContext, customers: Rows): ExportFile {
  const table = tableSheet({
    ctx,
    name: { en: "Customers", ar: "العملاء" },
    note: {
      en: "What each customer bought in the period, with VAT and delivery",
      ar: "مشتريات كل عميل في الفترة، مع الضريبة والتوصيل",
    },
    columns: [
      { head: { en: "Customer", ar: "العميل" }, width: 30 },
      { head: { en: "Orders", ar: "الطلبات" }, width: 10, sum: true, count: true },
      { head: { en: "Spent", ar: "المشتريات" }, width: 14, sum: true },
      { head: { en: "Average order", ar: "متوسط الطلب" }, width: 14 },
      { head: { en: "Last order", ar: "آخر طلب" }, width: 12 },
    ],
    rows: inCurrency(customers, ctx.currency).map((r) => {
      const orders = num(r.paid_order_count);
      return [
        { value: text(r.customer_name) },
        countCell(orders),
        moneyCell(ctx, r.total_spent),
        orders > 0 ? moneyCell(ctx, num(r.total_spent) / orders) : null,
        dayCell(r.last_order_at),
      ];
    }),
    totalLabel: TOTAL,
  });
  return { sheets: [table.sheet], csv: table.csv };
}
