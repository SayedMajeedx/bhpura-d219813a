import {
  COUNT_FORMAT,
  moneyFormat,
  type XCell,
  type XSheet,
} from "@/features/finance-reports/lib/workbook";
import { stockCountLabel, type ReviewRow } from "./stock-count";

/**
 * A stock count's report as an Excel sheet: the count, when and what it counted, then each size
 * with the stock it started with, what moved during the count, what was counted and the
 * difference, and for staff who see costs what the difference is worth; a total line. Read from
 * what the database says the count found.
 */

type Lang = "ar" | "en";

const WORDS = {
  ar: {
    title: "جرد المخزون",
    count: "الجرد",
    started: "بدأ",
    finished: "انتهى",
    scope: "الجرد لـ",
    everything: "كل المنتجات",
    note: "ملاحظة",
    piece: "القطعة",
    sku: "الرمز",
    expected: "عند البدء",
    moved: "تحرك أثناء الجرد",
    counted: "المعدود",
    difference: "الفرق",
    value: "قيمة الفرق بالتكلفة",
    notCounted: "لم يُعد",
    total: "المجموع",
  },
  en: {
    title: "Stock count",
    count: "Count",
    started: "Started",
    finished: "Finished",
    scope: "Counted",
    everything: "Every product",
    note: "Note",
    piece: "Piece",
    sku: "Code",
    expected: "At the start",
    moved: "Moved during the count",
    counted: "Counted",
    difference: "Difference",
    value: "Difference at cost",
    notCounted: "Not counted",
    total: "Total",
  },
} as const;

export type CountSheetContext = {
  lang: Lang;
  store: string;
  number: number;
  startedAt: string;
  finishedAt: string | null;
  /** The category's name, or null for every product. */
  scope: string | null;
  note: string | null;
  /** The currency's decimals, for the value column. */
  digits: number;
  /** Only for staff who see costs. */
  showValue: boolean;
};

const day = (at: string | null, lang: Lang) =>
  at ? new Date(at).toLocaleString(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB") : "";

export function countSheet(rows: readonly ReviewRow[], c: CountSheetContext): XSheet {
  const w = WORDS[c.lang];
  const money = moneyFormat(c.digits);
  const num = (value: number | null, extra: Partial<NonNullable<XCell>> = {}): XCell =>
    value === null ? null : { value, format: COUNT_FORMAT, ...extra };
  const heading = ([w.piece, w.sku, w.expected, w.moved, w.counted, w.difference] as string[])
    .concat(c.showValue ? [w.value] : [])
    .map((label): XCell => ({ value: label, heading: true }));
  const lines = rows.map((r): XCell[] => [
    { value: r.name },
    r.sku ? { value: r.sku, text: true } : null,
    num(r.expected),
    num(r.moved),
    r.counted === null ? { value: w.notCounted } : num(r.counted),
    num(r.difference),
    ...(c.showValue ? [r.value === null ? null : { value: r.value, format: money }] : []),
  ]);
  const sum = (pick: (r: ReviewRow) => number | null) =>
    rows.reduce((total, r) => total + (pick(r) ?? 0), 0);
  const totals: XCell[] = [
    { value: w.total, total: true },
    null,
    num(
      sum((r) => r.expected),
      { total: true },
    ),
    num(
      sum((r) => r.moved),
      { total: true },
    ),
    num(
      sum((r) => r.counted),
      { total: true },
    ),
    num(
      sum((r) => r.difference),
      { total: true },
    ),
    ...(c.showValue
      ? [{ value: Math.round(sum((r) => r.value) * 1000) / 1000, format: money, total: true }]
      : []),
  ];
  return {
    name: stockCountLabel(c.number),
    rtl: c.lang === "ar",
    stickyRows: 7,
    widths: [40, 16, 12, 14, 12, 12, 16],
    rows: [
      [{ value: `${c.store} · ${w.title}`, bold: true }],
      [{ value: w.count }, { value: stockCountLabel(c.number), bold: true, text: true }],
      [{ value: w.started }, { value: day(c.startedAt, c.lang) }],
      [{ value: w.finished }, { value: day(c.finishedAt, c.lang) }],
      [{ value: w.scope }, { value: c.scope ?? w.everything }],
      [{ value: w.note }, { value: c.note ?? "" }],
      heading,
      ...lines,
      totals,
    ],
  };
}
