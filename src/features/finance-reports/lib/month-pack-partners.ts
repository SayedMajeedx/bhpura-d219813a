import { salesBySource, type ComposedOverviewRow } from "@/lib/reporting-compose";
import { SALES_WORDS } from "@/lib/report-words";
import { partnerLines } from "@/features/report-export/lib/owner-sheets";
import { localDay } from "./receivables";
import { COUNT_FORMAT, moneyFormat, type XCell, type XSheet } from "./workbook";

/**
 * The month pack's partner shops sheet: every sale at a partner shop with the month's total,
 * each shop's sales added up, the month's net sales with the partner shops' beside the store's
 * (`salesBySource`), and the payments the shops made.
 */

type Rows = Array<Record<string, unknown>>;
const num = (value: unknown) => Number(value ?? 0) || 0;
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const day = (value: unknown): XCell => {
  if (!value) return null;
  const text = String(value);
  return { value: /^d{4}-d{2}-d{2}$/.test(text) ? text : localDay(text), text: true };
};

export function monthPackPartnersSheet(input: {
  sales: Rows;
  payments: Rows;
  monthRow: Partial<ComposedOverviewRow> | undefined;
  currency: string;
  digits: number;
  lang: "ar" | "en";
  head: XCell[][];
  name: string;
}): XSheet {
  const { currency, lang } = input;
  const isAr = lang === "ar";
  const w = (words: { en: string; ar: string }) => words[lang];
  const money = moneyFormat(input.digits);
  const head = (value: string): XCell => ({ value, heading: true });
  const m = (value: unknown): XCell => ({ value: num(value), format: money });
  const partnerSales = input.sales;
  const partnerPays = input.payments;
  return {
    name: input.name,
    rtl: isAr,
    widths: [12, 22, 28, 14, 9, 12, 12, 12, 12, 12, 12],
    rows: [
      ...input.head,
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
      ...(partnerSales.length
        ? [
            [
              { value: isAr ? "المجموع" : "Total", total: true },
              null,
              null,
              null,
              {
                value: partnerSales.reduce((s, r) => s + num(r.quantity), 0),
                format: COUNT_FORMAT,
                total: true,
              },
              null,
              ...(["gross", "commission", "net_due", "paid", "cost"] as const).map((k): XCell => ({
                value:
                  (k === "commission" ? -1 : 1) * partnerSales.reduce((s, r) => s + num(r[k]), 0),
                format: money,
                total: true,
              })),
            ] as XCell[],
          ]
        : []),
      [],
      // Each shop's sales added up, then the month's sales with the partner shops'.
      [
        head(isAr ? "حسب المحل" : "By partner shop"),
        head(isAr ? "القطع" : "Pieces"),
        head(isAr ? "المبيعات" : "Sales"),
        head(isAr ? "العمولة" : "Commission"),
        head(isAr ? "المدفوع" : "Paid"),
        head(isAr ? "المتبقي" : "Still owed"),
      ],
      ...partnerLines(partnerSales, currency).map((l): XCell[] => [
        { value: l.partner },
        { value: l.pieces, format: COUNT_FORMAT },
        m(l.sales),
        { value: -l.commission, format: money },
        m(l.paid),
        m(Math.max(0, l.due - l.paid)),
      ]),
      [],
      ...(() => {
        const split = salesBySource(input.monthRow);
        return [
          [
            head(isAr ? "صافي مبيعات الشهر" : "The month's net sales"),
            head(isAr ? "المبلغ" : "Amount"),
          ],
          [{ value: w(SALES_WORDS.store), indent: 1 }, m(split.store)],
          [{ value: w(SALES_WORDS.partners), indent: 1 }, m(split.partners)],
          ...(Math.abs(split.services) > 0.0005
            ? [[{ value: w(SALES_WORDS.services), indent: 1 }, m(split.services)] as XCell[]]
            : []),
          [
            { value: w(SALES_WORDS.total), total: true },
            { ...m(split.total)!, total: true },
          ],
        ] as XCell[][];
      })(),
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
}
