import { monthLabel, type StatementLine, type StatementMonth } from "./statement";
import { COUNT_FORMAT, PERCENT_FORMAT, moneyFormat, type XCell, type XSheet } from "./workbook";

/**
 * The monthly statement as an Excel sheet: the same lines and figures as the screen, as numbers
 * (a ratio as a percentage, a deduction negative), with its store, currency, period and basis
 * written above it so the file stands on its own in an accountant's folder.
 */

export const STATEMENT_WORDS = {
  title: { en: "Monthly statement", ar: "القائمة الشهرية" },
  total: { en: "Total", ar: "المجموع" },
  lastYear: { en: "Same months last year", ar: "نفس الأشهر العام الماضي" },
  change: { en: "Change", ar: "التغيّر" },
  reference: { en: "For reference", ar: "للعلم" },
  toDate: { en: "to date", ar: "حتى اليوم" },
  basis: {
    en: "Accrual basis: a sale counts in full in the month its order was placed, once it counts as sold; a return is deducted in the month it was processed; running costs by their date.",
    ar: "أساس الاستحقاق: تُحسب المبيعة كاملة في شهر الطلب متى عُدّت مبيعة، ويُخصم المرتجع في شهر معالجته، والمصاريف بتاريخها.",
  },
};

export function statementSheet(input: {
  lines: StatementLine[];
  months: StatementMonth[];
  currency: string;
  digits: number;
  lang: "ar" | "en";
  storeName: string;
  timeZone: string;
  compare: boolean;
}): XSheet {
  const { lines, months, currency, digits, lang, storeName, timeZone, compare } = input;
  const w = (words: { en: string; ar: string }) => words[lang];
  const money = moneyFormat(digits);
  const heading = (value: string): XCell => ({ value, heading: true });

  const figure = (line: StatementLine, value: number): Exclude<XCell, null> => {
    if (line.kind === "ratio") return { value: value / 100, format: PERCENT_FORMAT };
    if (line.kind === "count") return { value, format: COUNT_FORMAT };
    return { value, format: money, total: line.kind === "total" };
  };
  const changeCell = (line: StatementLine): XCell => {
    if (line.change === null) return null;
    if (line.kind === "ratio") {
      const pts = lang === "ar" ? "نقطة" : "pts";
      return { value: line.change, format: `+0.0" ${pts}";-0.0" ${pts}";"–"` };
    }
    return { value: line.change / 100, format: '+0.0%;-0.0%;"–"' };
  };

  const header: XCell[] = [
    heading(currency),
    ...months.map((m) =>
      heading(
        m.toDate ? `${monthLabel(m, lang)} (${w(STATEMENT_WORDS.toDate)})` : monthLabel(m, lang),
      ),
    ),
    heading(w(STATEMENT_WORDS.total)),
    ...(compare ? [heading(w(STATEMENT_WORDS.lastYear)), heading(w(STATEMENT_WORDS.change))] : []),
  ];

  const body: XCell[][] = [];
  let inReference = false;
  for (const line of lines) {
    if (line.reference && !inReference) {
      inReference = true;
      body.push([]);
      body.push([{ value: w(STATEMENT_WORDS.reference), bold: true }]);
    }
    const strong = line.kind === "subtotal" || line.kind === "total";
    body.push([
      {
        value: line.label[lang],
        bold: strong,
        total: line.kind === "total",
        indent: line.kind === "item" || line.kind === "ratio" ? 1 : 0,
      },
      ...line.values.map((v) => figure(line, v)),
      { ...figure(line, line.total), bold: true },
      ...(compare ? [line.prior === null ? null : figure(line, line.prior), changeCell(line)] : []),
    ]);
  }

  const first = months[0];
  const last = months[months.length - 1];
  const period = first && last ? `${monthLabel(first, lang)} – ${monthLabel(last, lang)}` : "";
  return {
    name: w(STATEMENT_WORDS.title),
    rtl: lang === "ar",
    stickyRows: 5,
    stickyColumns: 1,
    widths: [36, ...months.map(() => 14), 16, ...(compare ? [18, 12] : [])],
    rows: [
      [{ value: `${storeName} · ${w(STATEMENT_WORDS.title)}`, bold: true }],
      [{ value: `${period} · ${currency} · ${timeZone}` }],
      [{ value: w(STATEMENT_WORDS.basis) }],
      [],
      header,
      ...body,
    ],
  };
}
