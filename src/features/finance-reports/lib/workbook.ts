/**
 * Excel workbooks for the finance reports: real numbers (never text that looks like a number),
 * each with the currency's own decimals, negatives in parentheses; frozen headings; right to left
 * for an Arabic reader; one sheet or many. Built as plain data here (testable), written to a file
 * by `downloadWorkbook`, which loads the writer only when asked.
 */

export type XCell = null | {
  value: string | number | null;
  /** An Excel number format for a number ("#,##0.000;(#,##0.000);\"–\""). */
  format?: string;
  bold?: boolean;
  /** A heading cell: bold, ruled underneath. */
  heading?: boolean;
  /** A total line: bold, ruled above. */
  total?: boolean;
  indent?: number;
  /** Kept as text (an invoice number, a phone), so Excel does not reinterpret it. */
  text?: boolean;
};

export type XSheet = {
  name: string;
  rows: XCell[][];
  /** Column widths in characters. */
  widths: number[];
  stickyRows?: number;
  stickyColumns?: number;
  rtl?: boolean;
};

/** An accounting money format with `digits` decimals: 1,234.500 / (1,234.500) / –. */
export function moneyFormat(digits: number) {
  const body = digits > 0 ? `#,##0.${"0".repeat(digits)}` : "#,##0";
  return `${body};(${body});"–"`;
}

export const COUNT_FORMAT = '#,##0;(#,##0);"–"';
export const PERCENT_FORMAT = '0.0%;(0.0%);"–"';
export const DATE_FORMAT = "yyyy-mm-dd";

/** A cell's formula-like text is quoted, so a spreadsheet never runs it (`=`, `+`, `-`, `@`). */
export function safeText(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** Excel limits a sheet's name to 31 characters and some symbols. */
export function sheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

type LibraryCell = Record<string, unknown> | null;

/** The writer's own cell for one of ours. */
export function libraryCell(cell: XCell): LibraryCell {
  if (cell === null || cell.value === null || cell.value === "") return null;
  const style: Record<string, unknown> = {};
  if (cell.bold || cell.heading || cell.total) style.fontWeight = "bold";
  if (cell.heading) style.bottomBorderStyle = "thin";
  if (cell.total) style.topBorderStyle = "thin";
  if (cell.indent) style.indent = cell.indent;
  if (typeof cell.value === "number") {
    return { value: cell.value, type: Number, format: cell.format, align: "right", ...style };
  }
  return {
    value: safeText(cell.value),
    type: String,
    ...(cell.text ? { format: "@" } : {}),
    ...style,
  };
}

export async function downloadWorkbook(sheets: XSheet[], fileName: string) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const write = writeXlsxFile as unknown as (
    sheets: Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ) => { toFile: (name: string) => Promise<void> };
  await write(
    sheets.map((sheet) => ({
      data: sheet.rows.map((row) => row.map(libraryCell)),
      sheet: sheetName(sheet.name),
      columns: sheet.widths.map((width) => ({ width })),
      stickyRowsCount: sheet.stickyRows ?? 0,
      stickyColumnsCount: sheet.stickyColumns ?? 0,
      rightToLeft: Boolean(sheet.rtl),
    })),
    { fontFamily: "Calibri", fontSize: 11 },
  ).toFile(fileName);
}

/** "pura-statement-2025-11-to-2026-10.xlsx": the store and what the file holds, no spaces. */
export function workbookFileName(slug: string, what: string, period: string) {
  const clean = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  return `${clean(slug) || "store"}-${clean(what)}-${clean(period)}.xlsx`;
}
