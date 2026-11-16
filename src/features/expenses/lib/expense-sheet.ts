import { moneyFormat, type XCell, type XSheet } from "@/features/finance-reports/lib/workbook";
import { categoryLabel } from "./expense-form";
import { expenseTotals } from "./expense-list";

/**
 * The period's expenses as an Excel sheet: by category first (running costs and stock
 * purchases apart), then each expense with its kind, supplier, repeat and VAT, as real numbers
 * in the store's decimals, right to left for an Arabic reader.
 */

type SheetExpense = {
  expense_date: string;
  category: string;
  description?: string | null;
  amount: number | string;
  currency?: string | null;
  expense_type?: string | null;
  store_name?: string | null;
  vendors?: { name?: string | null } | null;
  tax_amount?: number | string | null;
  is_recurring?: boolean | null;
  recurring_source_id?: string | null;
  notes?: string | null;
};

const num = (value: unknown) => Number(value ?? 0) || 0;

export function expensesSheet(input: {
  expenses: readonly SheetExpense[];
  lang: "ar" | "en";
  storeName: string;
  currency: string;
  digits: number;
  periodText: string;
}): XSheet {
  const { lang, currency, digits } = input;
  const isAr = lang === "ar";
  const money = moneyFormat(digits);
  const mine = input.expenses.filter((e) => !e.currency || e.currency === currency);
  const head = (value: string): XCell => ({ value, heading: true });
  const m = (value: number, extra: Partial<Exclude<XCell, null>> = {}): XCell => ({
    value: Math.round(value * 10 ** digits) / 10 ** digits || 0,
    format: money,
    ...extra,
  });
  const kindOf = (e: SheetExpense) =>
    e.expense_type === "cogs"
      ? isAr
        ? "مشتريات مخزون"
        : "Stock purchase"
      : isAr
        ? "تشغيلي"
        : "Running cost";

  const byCategory = new Map<
    string,
    { kind: string; amount: number; tax: number; count: number }
  >();
  for (const e of mine) {
    const key = `${kindOf(e)}|${categoryLabel(e.category, lang)}`;
    const sum = byCategory.get(key) ?? { kind: kindOf(e), amount: 0, tax: 0, count: 0 };
    sum.amount += num(e.amount);
    sum.tax += num(e.tax_amount);
    sum.count += 1;
    byCategory.set(key, sum);
  }
  const totals = expenseTotals(mine, currency);

  return {
    name: isAr ? "المصاريف" : "Expenses",
    rtl: isAr,
    stickyRows: 4,
    widths: [12, 30, 22, 16, 14, 22, 12, 14, 30],
    rows: [
      [{ value: `${input.storeName} · ${isAr ? "المصاريف" : "Expenses"}`, bold: true }],
      [{ value: `${input.periodText} · ${currency}` }],
      [],
      [
        head(isAr ? "التصنيف" : "Category"),
        head(isAr ? "النوع" : "Kind"),
        head(isAr ? "العدد" : "Expenses"),
        head(isAr ? "المبلغ" : "Amount"),
        head(isAr ? "الضريبة المدفوعة" : "VAT paid"),
      ],
      ...[...byCategory.entries()]
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(([key, v]): XCell[] => [
          { value: key.split("|")[1] },
          { value: v.kind },
          { value: v.count, format: '#,##0;(#,##0);"–"' },
          m(v.amount),
          m(v.tax),
        ]),
      [
        { value: isAr ? "المصاريف التشغيلية" : "Running costs", indent: 1 },
        null,
        null,
        m(totals.running),
      ],
      [
        { value: isAr ? "مشتريات المخزون" : "Stock purchases", indent: 1 },
        null,
        null,
        m(totals.stock),
      ],
      [
        { value: isAr ? "المجموع" : "Total", total: true },
        null,
        null,
        m(totals.total, { total: true }),
        m(
          mine.reduce((s, e) => s + num(e.tax_amount), 0),
          { total: true },
        ),
      ],
      [],
      [
        head(isAr ? "التاريخ" : "Date"),
        head(isAr ? "الوصف" : "Description"),
        head(isAr ? "التصنيف" : "Category"),
        head(isAr ? "النوع" : "Kind"),
        head(isAr ? "المبلغ" : "Amount"),
        head(isAr ? "المورد" : "Supplier"),
        head(isAr ? "الضريبة" : "VAT"),
        head(isAr ? "التكرار" : "Repeat"),
        head(isAr ? "ملاحظات" : "Notes"),
      ],
      ...[...mine]
        .sort((a, b) => a.expense_date.localeCompare(b.expense_date))
        .map((e): XCell[] => [
          { value: e.expense_date.slice(0, 10), text: true },
          { value: e.description ?? null },
          { value: categoryLabel(e.category, lang) },
          { value: kindOf(e) },
          m(num(e.amount)),
          { value: e.vendors?.name || e.store_name || null },
          num(e.tax_amount) ? m(num(e.tax_amount)) : null,
          {
            value: e.is_recurring
              ? isAr
                ? "يتكرر"
                : "Repeats"
              : e.recurring_source_id
                ? isAr
                  ? "تلقائي"
                  : "Automatic"
                : null,
          },
          { value: e.notes ?? null },
        ]),
    ],
  };
}
