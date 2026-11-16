import { localDay } from "@/features/finance-reports/lib/receivables";
import { moneyFormat, type XCell, type XSheet } from "@/features/finance-reports/lib/workbook";
import type { OrderNumberFormat } from "@/lib/order-number";
import type { ReportLang, Words } from "@/lib/report-words";

/**
 * What every sheet of the Reports export shares: its head (the store, what the sheet holds, the
 * period, the currency and the time zone, so a sheet stands on its own), a table with its
 * headings frozen, a total line, and the same rows as a CSV.
 */

export type Rows = Array<Record<string, unknown>>;

export type ExportContext = {
  lang: ReportLang;
  storeName: string;
  /** The store's currency: every figure is in it, and rows in another currency are left out. */
  currency: string;
  digits: number;
  timeZone: string;
  /** The period as whole days on the reader's calendar (`YYYY-MM-DD`). */
  from: string;
  to: string;
  numberFormat?: OrderNumberFormat | null;
};

/** A file's sheets, and the rows of its main table for a CSV (headings first). */
export type ExportFile = { sheets: XSheet[]; csv: Array<Array<string | number | null>> };

export const num = (value: unknown) => Number(value ?? 0) || 0;
export const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? null : String(value);

/** A moment or a day as a real date on the reader's calendar. */
export function dayCell(value: unknown): XCell {
  if (!value) return null;
  const raw = String(value);
  return { value: /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : localDay(raw), date: true };
}

export function inCurrency(rows: Rows, currency: string) {
  return rows.filter((row) => !row.currency || String(row.currency) === currency);
}

export function periodText(ctx: ExportContext) {
  return ctx.from === ctx.to ? ctx.from : `${ctx.from} → ${ctx.to}`;
}

export const sheetWords = (ctx: ExportContext) => (words: Words) => words[ctx.lang];

/** The three lines at the head of a sheet, and an empty one under them. */
export function sheetHead(ctx: ExportContext, title: Words, note?: Words): XCell[][] {
  const w = sheetWords(ctx);
  return [
    [{ value: `${ctx.storeName} · ${w(title)}`, bold: true }],
    [{ value: `${periodText(ctx)} · ${ctx.currency} · ${ctx.timeZone}` }],
    ...(note ? [[{ value: w(note) }] as XCell[]] : []),
    [],
  ];
}

export type Column = {
  head: Words;
  width: number;
  /** Added up in the total line. */
  sum?: boolean;
  /** A whole count, not money. */
  count?: boolean;
};

/**
 * A sheet of one table: its head, the headings (frozen with everything above them), the rows and
 * a total line under them adding up the columns marked `sum`. The CSV is the headings and rows.
 */
export function tableSheet(input: {
  ctx: ExportContext;
  name: Words;
  note?: Words;
  columns: Column[];
  rows: XCell[][];
  /** The total line's first cell; none when the table has no total. */
  totalLabel?: Words;
}): { sheet: XSheet; csv: Array<Array<string | number | null>> } {
  const { ctx, columns, rows } = input;
  const w = sheetWords(ctx);
  const money = moneyFormat(ctx.digits);
  const head = sheetHead(ctx, input.name, input.note);
  const headings: XCell[] = columns.map((c) => ({ value: w(c.head), heading: true }));
  const total: XCell[] | null = input.totalLabel
    ? columns.map((c, i): XCell => {
        if (i === 0) return { value: w(input.totalLabel!), total: true };
        if (!c.sum) return { value: null, total: true };
        const value = rows.reduce((s, row) => {
          const cell = row[i];
          return s + (cell && typeof cell.value === "number" ? cell.value : 0);
        }, 0);
        return {
          value: c.count ? value : roundTo(value, ctx.digits),
          format: c.count ? '#,##0;(#,##0);"–"' : money,
          total: true,
        };
      })
    : null;
  const sheet: XSheet = {
    name: w(input.name),
    rtl: ctx.lang === "ar",
    stickyRows: head.length + 1,
    widths: columns.map((c) => c.width),
    rows: [...head, headings, ...rows, ...(total && rows.length ? [total] : [])],
  };
  const csv = [
    columns.map((c) => w(c.head)),
    ...rows.map((row) => row.map((cell) => (cell ? cell.value : null))),
  ];
  return { sheet, csv };
}

export function roundTo(value: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(value * f) / f || 0; // never -0
}

/** A money cell in the store's decimals (a deduction is written negative by the caller). */
export function moneyCell(ctx: ExportContext, value: unknown): XCell {
  return { value: roundTo(num(value), ctx.digits), format: moneyFormat(ctx.digits) };
}

export function countCell(value: unknown): XCell {
  return { value: num(value), format: '#,##0;(#,##0);"–"' };
}

/** A CSV with a byte-order mark, so Excel opens Arabic correctly. */
export function csvText(rows: Array<Array<string | number | null>>) {
  const escape = (value: string | number | null) => {
    const raw = value === null ? "" : String(value);
    const safe = /^[=+\-@]/.test(raw) && typeof value === "string" ? `'${raw}` : raw;
    return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return rows.map((row) => row.map(escape).join(",")).join("\r\n");
}
