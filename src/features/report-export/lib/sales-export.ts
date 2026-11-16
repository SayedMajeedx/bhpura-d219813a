import type { MarginRow } from "@/features/finance-reports/lib/margins";
import type { OpenOrder, PartnerBalance } from "@/features/finance-reports/lib/receivables";
import type { XCell, XSheet } from "@/features/finance-reports/lib/workbook";
import { orderNumberLabel } from "@/lib/order-number";
import type { ComposedOverviewRow } from "@/lib/reporting-compose";
import {
  SALES_WORDS,
  orderStatusWords,
  paymentMethodWords,
  paymentStatusWords,
  type Words,
} from "@/lib/report-words";
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
import {
  balancesNowSheet,
  expensesSheet,
  marginSheets,
  partnersSheet,
  stockSheet,
  suppliersSheet,
} from "./owner-sheets";
import { ownerSummarySheet } from "./owner-summary";

/**
 * The owner's report for any period (the Reports export's sales file): a summary of sales by
 * source and the profit and loss beside the period before (`ownerSummarySheet`), every sale of
 * the period in one list (the store's orders and the partner shops' sales together, with a
 * column saying which), each partner shop, profit by product and by category, expenses,
 * returns, and as they stand today the balances, stock at cost and suppliers. Every figure is
 * the overview's own (`composeOverviewRows`). Orders that do not count as sold (a draft, a
 * cancelled one) have their own sheet and are in no total.
 */

export type SalesExportInput = {
  ctx: ExportContext;
  /** The overview's figures for the period (one row per currency). */
  overview: ComposedOverviewRow[];
  /** `rpc_reporting_month_pack`'s lists for the period. */
  sales: Rows;
  partnerSales: Rows;
  returns: Rows;
  /** Every order placed in the period (`rpc_reporting_export`), for those not counted as sold. */
  allOrders: Rows;
  /** The overview's figures for the period of the same length just before. */
  previous?: ComposedOverviewRow[];
  partnerPayments?: Rows;
  expenses?: Rows;
  stock?: Rows;
  supplierPayments?: Rows;
  supplierOwed?: Rows;
  /** `rpc_reporting_margins` for the period (`marginRows`). */
  margins?: MarginRow[];
  /** What customers and partner shops owe today (`readReceivables`). */
  receivables?: { orders: OpenOrder[]; partners: PartnerBalance[] };
  /** `YYYY-MM-DD`: the day the file is made (balances, stock and suppliers are as of then). */
  today?: string;
};

export const SALES_EXPORT_WORDS = {
  summary: { en: "Summary", ar: "الملخص" },
  sales: { en: "Sales", ar: "المبيعات" },
  returns: { en: "Returns", ar: "المرتجعات" },
  notCounted: { en: "Not counted", ar: "غير محسوبة" },
  total: { en: "Total", ar: "المجموع" },
  salesNote: {
    en: "Every sale of the period: the store's orders and the partner shops' sales",
    ar: "كل مبيعات الفترة: طلبات المتجر ومبيعات المحلات الشريكة",
  },
  notCountedNote: {
    en: "Orders placed in the period that do not count as sold (drafts, cancelled, pending): in no total",
    ar: "طلبات الفترة التي لا تُحسب مبيعات (مسودة، ملغاة، قيد الانتظار): خارج كل المجاميع",
  },
} satisfies Record<string, Words>;

const W = SALES_EXPORT_WORDS;

const SALES_COLUMNS: Column[] = [
  { head: { en: "Date", ar: "التاريخ" }, width: 12 },
  { head: { en: "Source", ar: "المصدر" }, width: 20 },
  { head: { en: "Order no.", ar: "رقم الطلب" }, width: 12 },
  { head: { en: "Customer / product", ar: "العميل / المنتج" }, width: 28 },
  { head: { en: "Pieces", ar: "القطع" }, width: 8, sum: true, count: true },
  { head: { en: "Payment", ar: "طريقة الدفع" }, width: 16 },
  { head: { en: "Payment status", ar: "حالة الدفع" }, width: 14 },
  { head: { en: "Sales", ar: "المبيعات" }, width: 13, sum: true },
  { head: { en: "Discount", ar: "الخصم" }, width: 12, sum: true },
  { head: { en: "Net sales", ar: "صافي المبيعات" }, width: 14, sum: true },
  { head: { en: "Delivery", ar: "التوصيل" }, width: 12, sum: true },
  { head: { en: "VAT", ar: "الضريبة" }, width: 12, sum: true },
  { head: { en: "Total", ar: "المجموع" }, width: 13, sum: true },
  { head: { en: "Collected", ar: "المحصّل" }, width: 13, sum: true },
  { head: { en: "Owed", ar: "المتبقي" }, width: 12, sum: true },
  { head: { en: "Partner commission", ar: "عمولة المحل" }, width: 13, sum: true },
];

type SaleLine = { at: string; order: string; cells: XCell[] };

function storeLines(ctx: ExportContext, sales: Rows): SaleLine[] {
  const { lang } = ctx;
  const m = (v: unknown) => moneyCell(ctx, v);
  return sales.map((r) => {
    const net = num(r.subtotal) - num(r.discount);
    return {
      at: String(r.created_at ?? ""),
      order: String(r.invoice_number ?? ""),
      cells: [
        dayCell(r.created_at),
        { value: SALES_WORDS.store[lang] },
        { value: orderNumberLabel(r.invoice_number as string, ctx.numberFormat), text: true },
        { value: text(r.customer_name) },
        null,
        { value: paymentMethodWords(r.payment_method, lang) },
        { value: paymentStatusWords(r.payment_status, lang) },
        m(r.subtotal),
        m(-num(r.discount)),
        m(net),
        m(r.shipping),
        m(r.tax),
        m(r.total),
        m(r.collected),
        m(r.owed),
        null,
      ],
    };
  });
}

function partnerLines(ctx: ExportContext, sales: Rows): SaleLine[] {
  const { lang } = ctx;
  const m = (v: unknown) => moneyCell(ctx, v);
  return sales.map((r) => {
    const due = num(r.net_due);
    const paid = num(r.paid);
    const status = paid >= due - 0.0005 ? "paid" : paid > 0 ? "partially_paid" : "unpaid";
    const product = [text(r.product), text(r.sku)].filter(Boolean).join(" · ");
    return {
      at: String(r.sold_at ?? ""),
      order: "",
      cells: [
        dayCell(r.sold_at),
        { value: text(r.partner) ?? SALES_WORDS.partners[lang] },
        null,
        { value: product || null },
        countCell(r.quantity),
        { value: paymentMethodWords("incubator_receivable", lang) },
        { value: paymentStatusWords(status, lang) },
        m(r.gross),
        null,
        m(r.gross),
        null,
        null,
        m(r.gross),
        m(paid),
        m(Math.max(0, due - paid)),
        m(-num(r.commission)),
      ],
    };
  });
}

export function salesExport(input: SalesExportInput): ExportFile {
  const { ctx } = input;
  const row = input.overview.find((r) => r.currency === ctx.currency);
  const lines = [
    ...storeLines(ctx, inCurrency(input.sales, ctx.currency)),
    ...partnerLines(ctx, inCurrency(input.partnerSales, ctx.currency)),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.order.localeCompare(b.order));
  const sales = tableSheet({
    ctx,
    name: W.sales,
    note: W.salesNote,
    columns: SALES_COLUMNS,
    rows: lines.map((l) => l.cells),
    totalLabel: W.total,
  });

  const previous = input.previous?.find((r) => r.currency === ctx.currency);
  const partnerSales = inCurrency(input.partnerSales, ctx.currency);
  const hasPartners =
    partnerSales.length > 0 ||
    Math.abs(num(row?.incubator_sales)) > 0.0005 ||
    Math.abs(num(previous?.incubator_sales)) > 0.0005;
  const day = input.today ?? ctx.to;
  const sheets: XSheet[] = [
    ownerSummarySheet({ ctx, row, previous, hasPartners }),
    sales.sheet,
    ...(hasPartners ? [partnersSheet(ctx, partnerSales, input.partnerPayments ?? [])] : []),
    ...marginSheets(ctx, input.margins ?? []),
  ];
  const expenses = expensesSheet(ctx, input.expenses ?? []);
  if (expenses) sheets.push(expenses);

  const returns = inCurrency(input.returns, ctx.currency);
  if (returns.length) {
    sheets.push(
      tableSheet({
        ctx,
        name: W.returns,
        columns: [
          { head: { en: "Date", ar: "التاريخ" }, width: 12 },
          { head: { en: "Return", ar: "المرتجع" }, width: 12 },
          { head: { en: "Order no.", ar: "رقم الطلب" }, width: 12 },
          { head: { en: "Items", ar: "قيمة القطع" }, width: 13, sum: true },
          { head: { en: "Discount back", ar: "خصم مسترد" }, width: 13, sum: true },
          { head: { en: "VAT back", ar: "ضريبة مستردة" }, width: 13, sum: true },
          { head: { en: "Fee", ar: "رسوم" }, width: 11, sum: true },
          { head: { en: "Refunded", ar: "المسترد" }, width: 13, sum: true },
        ],
        rows: returns.map((r) => [
          dayCell(r.processed_at),
          { value: text(r.return_number), text: true },
          { value: orderNumberLabel(r.invoice_number as string, ctx.numberFormat), text: true },
          moneyCell(ctx, r.items),
          moneyCell(ctx, -num(r.discount_back)),
          moneyCell(ctx, r.tax_back),
          moneyCell(ctx, r.fee),
          moneyCell(ctx, r.refunded),
        ]),
        totalLabel: W.total,
      }).sheet,
    );
  }

  const notCounted = inCurrency(input.allOrders, ctx.currency).filter(
    (r) => r.counts_as_sold === false,
  );
  if (notCounted.length) {
    sheets.push(
      tableSheet({
        ctx,
        name: W.notCounted,
        note: W.notCountedNote,
        columns: [
          { head: { en: "Date", ar: "التاريخ" }, width: 12 },
          { head: { en: "Order no.", ar: "رقم الطلب" }, width: 12 },
          { head: { en: "Status", ar: "الحالة" }, width: 16 },
          { head: { en: "Payment status", ar: "حالة الدفع" }, width: 14 },
          { head: { en: "Total", ar: "المجموع" }, width: 13 },
        ],
        rows: notCounted.map((r) => [
          dayCell(r.order_date ?? r.created_at),
          { value: orderNumberLabel(r.invoice_number as string, ctx.numberFormat), text: true },
          { value: orderStatusWords(r.status, ctx.lang) },
          { value: paymentStatusWords(r.payment_status, ctx.lang) },
          moneyCell(ctx, r.total),
        ]),
      }).sheet,
    );
  }

  if (input.receivables) sheets.push(balancesNowSheet(ctx, day, input.receivables));
  const stock = stockSheet(ctx, day, input.stock ?? []);
  if (stock) sheets.push(stock);
  const suppliers = suppliersSheet(
    ctx,
    day,
    input.supplierPayments ?? [],
    input.supplierOwed ?? [],
  );
  if (suppliers) sheets.push(suppliers);

  return { sheets, csv: sales.csv };
}
