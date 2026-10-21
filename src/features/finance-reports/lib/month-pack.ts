import type { ComposedOverviewRow } from "@/lib/reporting-compose";
import { productMargins, marginsSheet, type MarginRow } from "./margins";
import {
  balancesSheet,
  customerBalances,
  localDay,
  type OpenOrder,
  type PartnerBalance,
} from "./receivables";
import { columnsIn, monthLabel, statementLines, type StatementMonth } from "./statement";
import { STATEMENT_WORDS } from "./statement-sheet";
import { COUNT_FORMAT, PERCENT_FORMAT, moneyFormat, type XCell, type XSheet } from "./workbook";

/**
 * The accountant's month pack: one workbook for one month, every sheet standing on its own (its
 * store, month, currency and basis written at its head), the same lines and figures as the
 * screens. Built here as plain data; `downloadWorkbook` writes it.
 */

type Rows = Array<Record<string, unknown>>;

export type MonthPackDetail = {
  sales: Rows;
  partner_sales: Rows;
  partner_payments: Rows;
  returns: Rows;
  expenses: Rows;
  supplier_payments: Rows;
  supplier_owed: Rows;
  stock: Rows;
};

export function readMonthPack(value: unknown): MonthPackDetail {
  const data = (value ?? {}) as Record<string, unknown>;
  const list = (key: string) => (Array.isArray(data[key]) ? (data[key] as Rows) : []);
  return {
    sales: list("sales"),
    partner_sales: list("partner_sales"),
    partner_payments: list("partner_payments"),
    returns: list("returns"),
    expenses: list("expenses"),
    supplier_payments: list("supplier_payments"),
    supplier_owed: list("supplier_owed"),
    stock: list("stock"),
  };
}

type Words = { en: string; ar: string };

export const PACK_SHEETS = {
  readMe: { en: "Read me", ar: "اقرأ أولاً" },
  statement: { en: "Statement", ar: "القائمة" },
  sales: { en: "Sales", ar: "المبيعات" },
  partners: { en: "Partner shops", ar: "المحلات الشريكة" },
  returns: { en: "Returns", ar: "المرتجعات" },
  margins: { en: "Cost of goods by product", ar: "التكلفة حسب المنتج" },
  expenses: { en: "Expenses", ar: "المصاريف" },
  suppliers: { en: "Suppliers", ar: "الموردون" },
  balances: { en: "Customer balances", ar: "أرصدة العملاء" },
  stock: { en: "Stock at cost", ar: "المخزون بالتكلفة" },
} satisfies Record<string, Words>;

const num = (value: unknown) => Number(value ?? 0) || 0;
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
/** A moment or a day as `YYYY-MM-DD` on the reader's calendar, kept as text. */
const day = (value: unknown): XCell => {
  if (!value) return null;
  const text = String(value);
  return { value: /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : localDay(text), text: true };
};

export type MonthPackInput = {
  month: StatementMonth;
  previous: StatementMonth;
  lastYear: StatementMonth;
  /** The statement's figures for the month, the month before and the same month a year earlier. */
  periods: [ComposedOverviewRow[], ComposedOverviewRow[], ComposedOverviewRow[]];
  margins: MarginRow[];
  receivables: { orders: OpenOrder[]; partners: PartnerBalance[] };
  detail: MonthPackDetail;
  currency: string;
  digits: number;
  lang: "ar" | "en";
  storeName: string;
  timeZone: string;
  /** `YYYY-MM-DD`: the day the pack was made (balances and stock are as of then). */
  today: string;
};

export function monthPackSheets(input: MonthPackInput): XSheet[] {
  const { month, previous, lastYear, periods, currency, digits, lang, storeName, timeZone, today } =
    input;
  const w = (words: Words) => words[lang];
  const isAr = lang === "ar";
  const money = moneyFormat(digits);
  const label = monthLabel(month, lang);
  const head = (value: string): XCell => ({ value, heading: true });
  const top = (title: Words, note?: string): XCell[][] => [
    [{ value: `${storeName} · ${w(title)} · ${label}`, bold: true }],
    [{ value: `${currency} · ${timeZone}${note ? ` · ${note}` : ""}` }],
    [],
  ];
  const m = (value: unknown): XCell => ({ value: num(value), format: money });
  const mine = (row: Record<string, unknown>) => !row.currency || row.currency === currency;

  // 1. Read me -------------------------------------------------------------------------------
  const readMe: XSheet = {
    name: w(PACK_SHEETS.readMe),
    rtl: isAr,
    widths: [34, 90],
    rows: [
      [
        {
          value: `${storeName} · ${isAr ? "ملف الشهر للمحاسب" : "Month pack for the accountant"}`,
          bold: true,
        },
      ],
      [],
      [{ value: isAr ? "الشهر" : "Month", bold: true }, { value: label }],
      [{ value: isAr ? "العملة" : "Currency", bold: true }, { value: currency }],
      [{ value: isAr ? "المنطقة الزمنية" : "Time zone", bold: true }, { value: timeZone }],
      [
        { value: isAr ? "أُعدّ في" : "Prepared on", bold: true },
        { value: today, text: true },
      ],
      [{ value: isAr ? "الأساس" : "Basis", bold: true }, { value: w(STATEMENT_WORDS.basis) }],
      [
        { value: isAr ? "أرصدة العملاء والمخزون" : "Customer balances and stock", bold: true },
        {
          value: isAr
            ? `كما هي يوم الإعداد (${today})، لا في نهاية الشهر.`
            : `As they stood on the day this was prepared (${today}), not at the month's end.`,
        },
      ],
      [],
      [{ value: isAr ? "الأوراق" : "Sheets", bold: true }],
      ...Object.values(PACK_SHEETS)
        .slice(1)
        .map((sheet): XCell[] => [{ value: w(sheet), indent: 1 }]),
    ],
  };

  // 2. Statement: the month beside the month before and the same month a year earlier ----------
  const lines = statementLines(columnsIn(periods, currency));
  const change = (kind: string, now: number, before: number): XCell => {
    if (kind === "ratio") {
      const pts = isAr ? "نقطة" : "pts";
      return { value: now - before, format: `+0.0" ${pts}";-0.0" ${pts}";"–"` };
    }
    return before === 0
      ? null
      : { value: (now - before) / Math.abs(before), format: '+0.0%;-0.0%;"–"' };
  };
  const figure = (kind: string, value: number): Exclude<XCell, null> =>
    kind === "ratio"
      ? { value: value / 100, format: PERCENT_FORMAT }
      : kind === "count"
        ? { value, format: COUNT_FORMAT }
        : { value, format: money, total: kind === "total" };
  const statement: XSheet = {
    name: w(PACK_SHEETS.statement),
    rtl: isAr,
    stickyRows: 4,
    stickyColumns: 1,
    widths: [36, 14, 14, 16, 14, 14],
    rows: [
      ...top(PACK_SHEETS.statement),
      [
        head(currency),
        head(label),
        head(monthLabel(previous, lang)),
        head(monthLabel(lastYear, lang)),
        head(isAr ? "مقابل الشهر السابق" : "vs month before"),
        head(isAr ? "مقابل العام الماضي" : "vs last year"),
      ],
      ...lines.map((line): XCell[] => {
        const [now, before, yearAgo] = line.values;
        const strong = line.kind === "subtotal" || line.kind === "total";
        return [
          {
            value: line.label[lang],
            bold: strong,
            total: line.kind === "total",
            indent: line.kind === "item" ? 1 : 0,
          },
          { ...figure(line.kind, now), bold: true },
          figure(line.kind, before),
          figure(line.kind, yearAgo),
          change(line.kind, now, before),
          change(line.kind, now, yearAgo),
        ];
      }),
    ],
  };

  // 3. Sales ---------------------------------------------------------------------------------
  const sales = input.detail.sales.filter(mine);
  const salesTotals = ["subtotal", "discount", "shipping", "tax", "total", "collected", "owed"].map(
    (key) => sales.reduce((s, r) => s + num(r[key]), 0),
  );
  const salesSheet: XSheet = {
    name: w(PACK_SHEETS.sales),
    rtl: isAr,
    stickyRows: 4,
    widths: [12, 10, 26, 12, 14, 14, 12, 12, 12, 12, 12, 12, 12, 12],
    rows: [
      ...top(
        PACK_SHEETS.sales,
        isAr ? "كل طلب عُدّ مبيعاً في الشهر" : "Every order counted as sold in the month",
      ),
      (isAr
        ? [
            "التاريخ",
            "الطلب",
            "العميل",
            "القناة",
            "حالة الدفع",
            "طريقة الدفع",
            "المبيعات",
            "الخصم",
            "التوصيل",
            "الضريبة",
            "المجموع",
            "المحصّل",
            "المتبقي",
          ]
        : [
            "Date",
            "Order",
            "Customer",
            "Channel",
            "Payment status",
            "Payment method",
            "Sales",
            "Discount",
            "Delivery",
            "VAT",
            "Total",
            "Collected",
            "Owed",
          ]
      ).map(head),
      ...sales.map((r): XCell[] => [
        day(r.created_at),
        { value: str(r.invoice_number), text: true },
        { value: str(r.customer_name) },
        { value: str(r.channel) },
        { value: str(r.payment_status) },
        { value: str(r.payment_method) },
        m(r.subtotal),
        { value: -num(r.discount), format: money },
        m(r.shipping),
        m(r.tax),
        m(r.total),
        m(r.collected),
        m(r.owed),
      ]),
      [
        { value: isAr ? "المجموع" : "Total", total: true },
        { value: sales.length, format: COUNT_FORMAT, total: true },
        null,
        null,
        null,
        null,
        ...salesTotals.map((v, i): XCell => ({
          value: i === 1 ? -v : v,
          format: money,
          total: true,
        })),
      ],
    ],
  };

  // 4. Partner shops: their sales and what they paid ---------------------------------------
  const partnerSales = input.detail.partner_sales.filter(mine);
  const partnerPays = input.detail.partner_payments.filter(mine);
  const partnersSheet: XSheet = {
    name: w(PACK_SHEETS.partners),
    rtl: isAr,
    widths: [12, 22, 28, 14, 9, 12, 12, 12, 12, 12, 12],
    rows: [
      ...top(PACK_SHEETS.partners),
      (isAr
        ? [
            "التاريخ",
            "المحل",
            "المنتج",
            "الرمز",
            "الكمية",
            "سعر القطعة",
            "المبيعات",
            "العمولة",
            "المستحق",
            "المدفوع",
            "التكلفة",
          ]
        : [
            "Date",
            "Partner shop",
            "Product",
            "SKU",
            "Pieces",
            "Unit price",
            "Sales",
            "Commission",
            "Due to store",
            "Paid",
            "Cost",
          ]
      ).map(head),
      ...partnerSales.map((r): XCell[] => [
        day(r.sold_at),
        { value: str(r.partner) },
        { value: str(r.product) },
        { value: str(r.sku), text: true },
        { value: num(r.quantity), format: COUNT_FORMAT },
        m(r.unit_price),
        m(r.gross),
        { value: -num(r.commission), format: money },
        m(r.net_due),
        m(r.paid),
        m(r.cost),
      ]),
      [],
      [
        head(isAr ? "دفعات المحلات" : "Payments from partner shops"),
        head(isAr ? "المحل" : "Partner shop"),
        head(isAr ? "المبلغ" : "Amount"),
        head(isAr ? "الطريقة" : "Method"),
        head(isAr ? "المرجع" : "Reference"),
      ],
      ...partnerPays.map((r): XCell[] => [
        day(r.payment_date),
        { value: str(r.partner) },
        m(r.amount),
        { value: str(r.method) },
        { value: str(r.reference), text: true },
      ]),
    ],
  };

  // 5. Returns -------------------------------------------------------------------------------
  const returns = input.detail.returns.filter(mine);
  const returnsSheet: XSheet = {
    name: w(PACK_SHEETS.returns),
    rtl: isAr,
    widths: [12, 14, 10, 12, 12, 12, 12, 12, 14, 26],
    rows: [
      ...top(PACK_SHEETS.returns, isAr ? "ما عولج في الشهر" : "Processed in the month"),
      (isAr
        ? [
            "التاريخ",
            "المرتجع",
            "الطلب",
            "القطع",
            "الخصم المسترد",
            "الضريبة",
            "الرسوم",
            "المسترد",
            "الطريقة",
            "خُصم من المبيعات",
          ]
        : [
            "Date",
            "Return",
            "Order",
            "Pieces",
            "Discount back",
            "VAT back",
            "Fee",
            "Refunded",
            "Method",
            "Deducted from sales",
          ]
      ).map(head),
      ...returns.map((r): XCell[] => [
        day(r.processed_at),
        { value: str(r.return_number), text: true },
        { value: str(r.invoice_number), text: true },
        m(r.items),
        { value: -num(r.discount_back), format: money },
        m(r.tax_back),
        m(r.fee),
        m(r.refunded),
        { value: str(r.method) },
        {
          value: r.deducted
            ? isAr
              ? "نعم"
              : "Yes"
            : isAr
              ? "لا: الطلب لم يعد مبيعاً"
              : "No: the order is no longer a sale",
        },
      ]),
    ],
  };

  // 6. Cost of goods by product --------------------------------------------------------------
  const margins = marginsSheet({
    lines: productMargins(input.margins, currency, lang).sort(
      (a, b) => b.grossProfit - a.grossProfit,
    ),
    by: "product",
    currency,
    digits,
    lang,
    title: w(PACK_SHEETS.margins),
    subtitle: `${storeName} · ${label} · ${currency}`,
  });

  // 7. Expenses: by category, then each, with the VAT paid --------------------------------
  const expenses = input.detail.expenses.filter(mine);
  const byCategory = new Map<string, { amount: number; tax: number }>();
  for (const e of expenses) {
    const key = str(e.category) || (isAr ? "بلا فئة" : "Uncategorised");
    const sum = byCategory.get(key) ?? { amount: 0, tax: 0 };
    sum.amount += num(e.amount);
    sum.tax += num(e.tax);
    byCategory.set(key, sum);
  }
  const expensesSheet: XSheet = {
    name: w(PACK_SHEETS.expenses),
    rtl: isAr,
    widths: [26, 14, 14, 30, 22, 14],
    rows: [
      ...top(PACK_SHEETS.expenses, isAr ? "بتاريخ المصروف" : "By the expense's own date"),
      [
        head(isAr ? "الفئة" : "Category"),
        head(isAr ? "المبلغ" : "Amount"),
        head(isAr ? "الضريبة المدفوعة" : "VAT paid"),
      ],
      ...[...byCategory.entries()]
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(([key, v]): XCell[] => [{ value: key }, m(v.amount), m(v.tax)]),
      [
        { value: isAr ? "المجموع" : "Total", total: true },
        { value: expenses.reduce((s, e) => s + num(e.amount), 0), format: money, total: true },
        { value: expenses.reduce((s, e) => s + num(e.tax), 0), format: money, total: true },
      ],
      [],
      (isAr
        ? ["التاريخ", "الفئة", "المبلغ", "الوصف", "المورد", "الضريبة", "من المصاريف التشغيلية"]
        : ["Date", "Category", "Amount", "Description", "Supplier", "VAT paid", "A running cost"]
      ).map(head),
      ...expenses.map((e): XCell[] => [
        day(e.expense_date),
        { value: str(e.category) },
        m(e.amount),
        { value: str(e.description) },
        { value: str(e.supplier) },
        m(e.tax),
        { value: e.running_cost ? (isAr ? "نعم" : "Yes") : isAr ? "لا" : "No" },
      ]),
    ],
  };

  // 8. Suppliers: paid in the month, owed today -------------------------------------------
  const suppliersSheet: XSheet = {
    name: w(PACK_SHEETS.suppliers),
    rtl: isAr,
    widths: [12, 14, 26, 14, 34],
    rows: [
      ...top(PACK_SHEETS.suppliers),
      [
        head(isAr ? "التاريخ" : "Date"),
        head(isAr ? "الطلبية" : "Order"),
        head(isAr ? "المورد" : "Supplier"),
        head(isAr ? "المدفوع" : "Paid"),
        head(isAr ? "ملاحظة" : "Note"),
      ],
      ...input.detail.supplier_payments.map((r): XCell[] => [
        day(r.paid_on),
        { value: str(r.po_number), text: true },
        { value: str(r.supplier) },
        m(r.amount),
        { value: str(r.note) },
      ]),
      [],
      [
        head(isAr ? `المستحق للموردين حتى ${today}` : `Owed to suppliers as of ${today}`),
        head(isAr ? "المبلغ" : "Amount"),
      ],
      ...input.detail.supplier_owed.map((r): XCell[] => [{ value: str(r.supplier) }, m(r.owed)]),
    ],
  };

  // 9. Customer balances (as of today) ---------------------------------------------------
  const balances = balancesSheet({
    customers: customerBalances(
      input.receivables.orders,
      currency,
      today,
      isAr ? "عميل بلا اسم" : "Unnamed customer",
    ),
    partners: input.receivables.partners,
    currency,
    digits,
    lang,
    title: w(PACK_SHEETS.balances),
    subtitle: `${storeName} · ${isAr ? "حتى" : "As of"} ${today} · ${currency}`,
  });

  // 10. Stock at cost (today) -------------------------------------------------------------
  const stock = input.detail.stock;
  const stockSheet: XSheet = {
    name: w(PACK_SHEETS.stock),
    rtl: isAr,
    widths: [34, 10, 16, 16],
    rows: [
      ...top(PACK_SHEETS.stock, isAr ? `كما هو في ${today}` : `As of ${today}`),
      [
        head(isAr ? "المنتج" : "Product"),
        head(isAr ? "القطع" : "Pieces"),
        head(isAr ? "القيمة بالتكلفة" : "Value at cost"),
        head(isAr ? "قطع بلا تكلفة" : "Pieces with no cost"),
      ],
      ...stock.map((r): XCell[] => [
        { value: str(r.product) },
        { value: num(r.units), format: COUNT_FORMAT },
        m(r.value),
        { value: num(r.units_without_cost), format: COUNT_FORMAT },
      ]),
      [
        { value: isAr ? "المجموع" : "Total", total: true },
        { value: stock.reduce((s, r) => s + num(r.units), 0), format: COUNT_FORMAT, total: true },
        { value: stock.reduce((s, r) => s + num(r.value), 0), format: money, total: true },
        {
          value: stock.reduce((s, r) => s + num(r.units_without_cost), 0),
          format: COUNT_FORMAT,
          total: true,
        },
      ],
    ],
  };

  return [
    readMe,
    statement,
    salesSheet,
    partnersSheet,
    returnsSheet,
    margins,
    expensesSheet,
    suppliersSheet,
    balances,
    stockSheet,
  ];
}
