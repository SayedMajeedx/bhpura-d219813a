import { realSize } from "@/lib/default-variant";
import {
  COUNT_FORMAT,
  moneyFormat,
  type XCell,
  type XSheet,
} from "@/features/finance-reports/lib/workbook";
import type { StockItem } from "@/features/incubators/types";

/**
 * What a partner shop holds today, as one Excel sheet: for a stock count with the partner, or to
 * hand over with everything at once. Each line with the partner's code, our SKU and barcode, the
 * piece, how many, its price there and the line's value, and a total line. Pure.
 */

type Lang = "ar" | "en";

const WORDS = {
  ar: {
    title: "البضاعة عند المحل الشريك",
    date: "حتى تاريخ",
    head: [
      "#",
      "كود المحل الشريك",
      "رمز المنتج (SKU)",
      "الباركود",
      "المنتج",
      "Product",
      "المقاس",
      "اللون",
      "الكمية",
      "سعر القطعة",
      "الإجمالي",
    ],
    totals: "المجموع",
  },
  en: {
    title: "Stock at the partner shop",
    date: "As of",
    head: [
      "#",
      "Partner code",
      "SKU",
      "Barcode",
      "المنتج",
      "Product",
      "Size",
      "Colour",
      "Qty",
      "Unit price",
      "Total",
    ],
    totals: "Totals",
  },
};

export function partnerStockSheet(
  stock: readonly StockItem[],
  context: { lang: Lang; store: string; partner: string; date: string; digits: number },
): XSheet {
  const w = WORDS[context.lang];
  const money = moneyFormat(context.digits);
  const lines = stock.filter((item) => Number(item.quantity) > 0);
  const text = (
    value: string | null | undefined,
    extra: Partial<NonNullable<XCell>> = {},
  ): XCell => (value?.trim() ? { value: value.trim(), ...extra } : null);
  const rows = lines.map((item, index): XCell[] => {
    const variant = item.product_variants;
    const product = variant?.products;
    const price = Number(item.consignment_price ?? 0);
    const quantity = Number(item.quantity);
    return [
      { value: index + 1, format: COUNT_FORMAT },
      text(item.external_code, { text: true }),
      text(variant?.sku, { text: true }),
      text(variant?.barcode, { text: true }),
      text(product?.name_ar || product?.name),
      text(product?.name || product?.name_ar),
      text(realSize(variant?.size), { text: true }),
      text(variant?.color),
      { value: quantity, format: COUNT_FORMAT },
      { value: price, format: money },
      { value: price * quantity, format: money },
    ];
  });
  const pieces = lines.reduce((sum, item) => sum + Number(item.quantity), 0);
  const value = lines.reduce(
    (sum, item) => sum + Number(item.consignment_price ?? 0) * Number(item.quantity),
    0,
  );
  return {
    name: context.lang === "ar" ? "البضاعة" : "Stock",
    rtl: context.lang === "ar",
    stickyRows: 4,
    widths: [5, 16, 16, 16, 26, 26, 8, 12, 7, 12, 12],
    rows: [
      [{ value: `${context.store} · ${w.title}`, bold: true }],
      [{ value: context.partner, bold: true }],
      [text(w.date), text(context.date)],
      w.head.map((label): XCell => ({ value: label, heading: true })),
      ...rows,
      [
        { value: w.totals, total: true },
        ...Array.from({ length: 7 }, (): XCell => ({ value: "", total: true })),
        { value: pieces, format: COUNT_FORMAT, total: true },
        { value: "", total: true },
        { value, format: money, total: true },
      ],
    ],
  };
}
