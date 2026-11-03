import { formatDate } from "@/lib/format";
import { orderNumberLabel, type OrderNumberFormat } from "@/lib/order-number";
import type { JobSheetPiece, JobSheetRow, Lang } from "./job-sheet";

/**
 * The job sheet's printable page, in Arabic, in English, or in both side by side (the owner's
 * decision of 2026-11-03: a tailor may read either). In both, each piece has two columns,
 * English on the left and Arabic on the right, each in its own direction; the order's number,
 * date, quantities and what the customer typed are written once. Every value from the order is
 * escaped. Pure: opening the print window is the action's job.
 */

type Common = {
  brand: string;
  orderNumber: string | number;
  /** How the store writes its order numbers (`orderNumberLabel`); none: "#1042". */
  numberFormat?: OrderNumberFormat | null;
  orderDate: string | null | undefined;
  customerName?: string | null;
  /** The note the customer left on the whole order, if any. */
  orderNote?: string | null;
  /**
   * Who has the piece: a supplier's order (its supplier, number and due day) or the store's own
   * workshop (`supplier` null). Absent: the sheet says nothing of it, as before.
   */
  where?: SheetWhere | null;
};

export type SheetWhere = {
  supplier: string | null;
  poNumber: string | null;
  expectedAt: string | null;
};

export type JobSheetArgs = Common &
  (
    | {
        lang: Lang;
        /** The store's own word for where the piece is made ("Tailor", "Workshop"). */
        workshop: string;
        pieces: JobSheetPiece[];
      }
    | {
        lang: "both";
        workshop: Record<Lang, string>;
        /** The same pieces read in each language, in the same order. */
        pieces: Record<Lang, JobSheetPiece[]>;
      }
  );

const WORDS = {
  ar: {
    title: "أمر تشغيل",
    to: "إلى",
    order: "رقم الطلب",
    date: "تاريخ الطلب",
    customer: "العميل",
    neededBy: "مطلوب بتاريخ",
    piece: (n: number, of: number) => `القطعة ${n} من ${of}`,
    quantity: "الكمية",
    details: "المقاسات والتفاصيل",
    notes: "ملاحظات العميل",
    extras: "إضافات",
    orderNote: "ملاحظة على الطلب",
    workshopNotes: (workshop: string) => `ملاحظات ${workshop}`,
    handedOver: "سُلّمت بتاريخ",
    receivedBack: "استُلمت بتاريخ",
    signature: "التوقيع",
    supplier: "المورد",
    supplierOrder: "طلبية المورد",
    inHouse: "في ورشتنا",
    sheetFor: "ورقة الطلب",
  },
  en: {
    title: "Job sheet",
    to: "For",
    order: "Order",
    date: "Order date",
    customer: "Customer",
    neededBy: "Needed by",
    piece: (n: number, of: number) => `Piece ${n} of ${of}`,
    quantity: "Qty",
    details: "Measurements & details",
    notes: "Customer notes",
    extras: "Extras",
    orderNote: "Order note",
    workshopNotes: (workshop: string) => `${workshop} notes`,
    handedOver: "Handed over on",
    receivedBack: "Received back on",
    signature: "Signature",
    supplier: "Supplier",
    supplierOrder: "Supplier order",
    inHouse: "In our workshop",
    sheetFor: "Sheet for",
  },
} as const;

type Words = (typeof WORDS)[Lang];

const filled = (value: string | null | undefined) => (value ?? "").trim();

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const e = escapeHtml;

const rows = (list: JobSheetRow[]) =>
  list
    .map(
      (row) =>
        `<div class="row"><span class="label">${e(row.label)}</span><span class="value">${e(row.value)}</span></div>`,
    )
    .join("");

const chosenOf = (piece: JobSheetPiece) =>
  piece.options.length
    ? `<div class="chosen">${piece.options
        .map((row) => `<span><b>${e(row.label)}:</b> ${e(row.value)}</span>`)
        .join("")}</div>`
    : "";

const notesOf = (piece: JobSheetPiece, heading: string) =>
  piece.notes.length
    ? `<h3>${e(heading)}</h3>${piece.notes.map((note) => `<p class="note" dir="auto">${e(note)}</p>`).join("")}`
    : "";

const extrasOf = (piece: JobSheetPiece, heading: string) =>
  piece.extras.length
    ? `<h3>${e(heading)}</h3><p class="extras" dir="auto">${piece.extras.map(e).join(" · ")}</p>`
    : "";

const photoOf = (piece: JobSheetPiece) =>
  piece.imageUrl ? `<img class="photo" src="${e(piece.imageUrl)}" alt="" />` : "";

/** One piece in one language: the page as it always was. */
function onePiece(piece: JobSheetPiece, index: number, of: number, words: Words, workshop: string) {
  const details = piece.details.length
    ? `<h3>${e(words.details)}</h3><div class="grid">${rows(piece.details)}</div>`
    : "";
  return `
  <section class="piece">
    <div class="piece-head">
      ${photoOf(piece)}
      <div class="piece-title">
        <div class="count">${e(words.piece(index + 1, of))}</div>
        <h2>${e(piece.title)}</h2>
        ${chosenOf(piece)}
      </div>
      <div class="qty"><span>${e(words.quantity)}</span><b>${piece.quantity}</b></div>
    </div>
    ${details}
    ${notesOf(piece, words.notes)}
    ${extrasOf(piece, words.extras)}
    <h3>${e(words.workshopNotes(workshop))}</h3>
    <div class="lines"><i></i><i></i></div>
  </section>`;
}

/**
 * A heading in both languages on the left-to-right page: the English, then the Arabic isolated
 * in its own direction ("Measurements · المقاسات"). Mixed on one line without the isolate, the
 * browser reorders the words ("Tailor · الخيّاط :For · إلى").
 */
const both = (ar: string, en: string) => (ar === en ? ar : `${en} · \u2068${ar}\u2069`);

/** One piece in both languages: English on the left, Arabic on the right. */
function twoColumnPiece(
  pieces: Record<Lang, JobSheetPiece>,
  index: number,
  of: number,
  workshop: Record<Lang, string>,
) {
  const column = (lang: Lang) => {
    const piece = pieces[lang];
    const words = WORDS[lang];
    const details = piece.details.length
      ? `<h3>${e(words.details)}</h3>${rows(piece.details)}`
      : "";
    return `<div class="col" dir="${lang === "ar" ? "rtl" : "ltr"}" lang="${lang}">
        <h2>${e(piece.title)}</h2>
        ${chosenOf(piece)}
        ${details}
      </div>`;
  };
  // What the customer typed is the same in both readings: written once.
  const shared = pieces.ar;
  return `
  <section class="piece">
    <div class="piece-head">
      ${photoOf(shared)}
      <div class="piece-title">
        <div class="count">${e(both(WORDS.ar.piece(index + 1, of), WORDS.en.piece(index + 1, of)))}</div>
      </div>
      <div class="qty"><span>${e(both(WORDS.ar.quantity, WORDS.en.quantity))}</span><b>${shared.quantity}</b></div>
    </div>
    <div class="cols">${column("en")}${column("ar")}</div>
    ${notesOf(shared, both(WORDS.ar.notes, WORDS.en.notes))}
    ${extrasOf(shared, both(WORDS.ar.extras, WORDS.en.extras))}
    <h3>${e(both(WORDS.ar.workshopNotes(workshop.ar), WORDS.en.workshopNotes(workshop.en)))}</h3>
    <div class="lines"><i></i><i></i></div>
  </section>`;
}

const style = (arabicFont: boolean) => `
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: ${arabicFont ? "'Tajawal','Cairo'," : ""}-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: black; margin: 0; padding: 16px; font-size: 13px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 12px; }
    .brand { font-size: 18px; font-weight: 800; }
    .doc { font-size: 20px; font-weight: 800; }
    .to { font-size: 13px; color: dimgray; margin-top: 2px; }
    .meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
    .meta div { border: 1px solid silver; border-radius: 6px; padding: 6px 8px; }
    .meta span { display: block; font-size: 10px; color: dimgray; }
    .meta b { font-size: 13px; }
    .blank { display: inline-block; min-width: 90px; border-bottom: 1px dashed gray; height: 14px; }
    .order-note { border: 1px solid silver; border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; white-space: pre-wrap; }
    .piece { border: 1.5px solid black; border-radius: 8px; padding: 12px; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
    .piece-head { display: flex; align-items: flex-start; gap: 12px; }
    .photo { width: 72px; height: 96px; object-fit: cover; border-radius: 6px; border: 1px solid silver; }
    .piece-title { flex: 1; min-width: 0; }
    .count { font-size: 10px; color: dimgray; }
    h2 { font-size: 17px; margin: 2px 0 4px; }
    .chosen { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; }
    .qty { text-align: center; border: 1.5px solid black; border-radius: 8px; padding: 4px 12px; }
    .qty span { display: block; font-size: 10px; color: dimgray; }
    .qty b { font-size: 22px; }
    h3 { font-size: 11px; color: dimgray; margin: 12px 0 4px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 20px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 20px; margin-top: 6px; }
    .cols .col { min-width: 0; }
    .cols .col + .col { border-inline-start: 1px solid gainsboro; padding-inline-start: 20px; }
    .row { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid gainsboro; padding: 5px 0; }
    .label { color: dimgray; }
    .value { font-weight: 700; font-size: 14px; text-align: end; }
    .note { margin: 0 0 4px; padding: 8px 10px; background: whitesmoke; border-radius: 6px; font-size: 14px; font-weight: 600; white-space: pre-wrap; }
    .extras { margin: 0; font-weight: 600; }
    .lines i { display: block; border-bottom: 1px dashed gray; height: 22px; }
    .sign { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 18px; break-inside: avoid; }
    .sign div { font-size: 11px; color: dimgray; }
    .sign .blank { display: block; height: 26px; margin-bottom: 4px; }`;

const PRINT_SCRIPT = `
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>`;

/** One order's sheet: its words, direction and body (headed, its pieces, the signatures). */
function sheetBody(a: JobSheetArgs) {
  const number = e(orderNumberLabel(a.orderNumber, a.numberFormat));
  const blank = `<span class="blank"></span>`;
  const twoLanguages = a.lang === "both";
  // A heading's words: the sheet's language, or both.
  const say = (pick: (words: Words) => string) =>
    twoLanguages ? both(pick(WORDS.ar), pick(WORDS.en)) : pick(WORDS[a.lang]);
  const forLine =
    a.lang === "both"
      ? both(`${WORDS.ar.to}: ${a.workshop.ar}`, `${WORDS.en.to}: ${a.workshop.en}`)
      : `${WORDS[a.lang].to}: ${a.workshop}`;
  // Dates in Western digits; written once in a sheet in both languages.
  const dateOf = (day: string | null | undefined) =>
    formatDate(day, a.lang === "ar" ? "ar-BH-u-nu-latn" : "en-US");

  let pieces: string;
  if (a.lang === "both") {
    const { ar, en } = a.pieces;
    pieces = ar
      .map((piece, index) =>
        twoColumnPiece({ ar: piece, en: en[index] ?? piece }, index, ar.length, a.workshop),
      )
      .join("");
  } else {
    const list = a.pieces;
    const words = WORDS[a.lang];
    const workshop = a.workshop;
    pieces = list
      .map((piece, index) => onePiece(piece, index, list.length, words, workshop))
      .join("");
  }

  const orderNote = filled(a.orderNote)
    ? `<div class="order-note" dir="auto"><b>${e(say((w) => w.orderNote))}:</b> ${e(filled(a.orderNote))}</div>`
    : "";

  // Who has the piece, and by when: the supplier's order, or the store's own workshop.
  const where = a.where;
  const whereLine = !where
    ? ""
    : where.supplier
      ? `<div class="where"><span><b>${e(say((w) => w.supplier))}:</b> <span dir="auto">${e(where.supplier)}</span></span>${
          where.poNumber
            ? `<span><b>${e(say((w) => w.supplierOrder))}:</b> <span dir="ltr">${e(where.poNumber)}</span></span>`
            : ""
        }</div>`
      : `<div class="where"><span><b>${e(say((w) => w.inHouse))}</b></span></div>`;
  const neededBy = where?.expectedAt ? `<b>${e(dateOf(where.expectedAt))}</b>` : blank;
  const footer = where?.poNumber
    ? `<div class="sheet-foot">${e(say((w) => w.sheetFor))} ${number} · <span dir="ltr">${e(where.poNumber)}</span></div>`
    : "";

  const body = `
  <div class="header">
    <div class="brand">${e(a.brand)}</div>
    <div style="text-align:end;">
      <div class="doc">${e(say((w) => w.title))} ${number}</div>
      <div class="to">${e(forLine)}</div>
    </div>
  </div>
  ${whereLine}

  <div class="meta">
    <div><span>${e(say((w) => w.order))}</span><b>${number}</b></div>
    <div><span>${e(say((w) => w.date))}</span><b>${e(dateOf(a.orderDate))}</b></div>
    <div><span>${e(say((w) => w.customer))}</span><b dir="auto">${e(filled(a.customerName) || "—")}</b></div>
    <div><span>${e(say((w) => w.neededBy))}</span>${neededBy}</div>
  </div>

  ${orderNote}
  ${pieces}

  <div class="sign">
    <div>${blank}${e(say((w) => w.handedOver))}</div>
    <div>${blank}${e(say((w) => w.receivedBack))}</div>
    <div>${blank}${e(say((w) => w.signature))}</div>
  </div>
  ${footer}`;

  return {
    title: `${say((w) => w.title)} ${orderNumberLabel(a.orderNumber, a.numberFormat)}`,
    dir: a.lang === "ar" ? "rtl" : "ltr",
    lang: a.lang === "both" ? "ar" : a.lang,
    body,
  };
}

const SHEETS_STYLE = `
    .where { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: -4px 0 12px; font-size: 13px; }
    .sheet-foot { margin-top: 14px; font-size: 10px; color: dimgray; text-align: center; }
    .sheet + .sheet { break-before: page; page-break-before: always; }`;

/**
 * Several orders' sheets in one print, one after another, each on a page of its own: the
 * supplier order's pieces, or a batch sent at once.
 */
export function jobSheetsHtml(sheets: readonly JobSheetArgs[]): string {
  const read = sheets.map(sheetBody);
  const first = read[0];
  const arabic = sheets.some((sheet) => sheet.lang !== "en");
  return `<!DOCTYPE html>
<html dir="${first?.dir ?? "ltr"}" lang="${first?.lang ?? "en"}">
<head>
  <meta charset="utf-8" />
  <title>${e(first?.title ?? "")}</title>
  <style>${style(arabic)}${SHEETS_STYLE}
  </style>
</head>
<body>
${read.map((sheet) => `<div class="sheet" dir="${sheet.dir}" lang="${sheet.lang}">${sheet.body}</div>`).join("\n")}
${PRINT_SCRIPT}
</body>
</html>`;
}

/** The printable page of one order's sheet. */
export function jobSheetHtml(a: JobSheetArgs): string {
  return jobSheetsHtml([a]);
}
