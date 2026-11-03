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

/** "المقاسات · Measurements": a heading in both languages, Arabic first. */
const both = (ar: string, en: string) => (ar === en ? ar : `${ar} · ${en}`);

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

/** The printable page. */
export function jobSheetHtml(a: JobSheetArgs): string {
  const number = e(orderNumberLabel(a.orderNumber, a.numberFormat));
  const blank = `<span class="blank"></span>`;
  const twoLanguages = a.lang === "both";
  // A heading's words: the sheet's language, or both.
  const say = (pick: (words: Words) => string) =>
    twoLanguages ? both(pick(WORDS.ar), pick(WORDS.en)) : pick(WORDS[a.lang]);
  const workshopName = a.lang === "both" ? both(a.workshop.ar, a.workshop.en) : a.workshop;
  // Dates in Western digits; written once in a sheet in both languages.
  const date = formatDate(a.orderDate, a.lang === "ar" ? "ar-BH-u-nu-latn" : "en-US");

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

  const pageDir = a.lang === "ar" ? "rtl" : "ltr";
  const pageLang = a.lang === "both" ? "ar" : a.lang;

  return `<!DOCTYPE html>
<html dir="${pageDir}" lang="${pageLang}">
<head>
  <meta charset="utf-8" />
  <title>${e(say((w) => w.title))} ${number}</title>
  <style>${style(a.lang !== "en")}
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">${e(a.brand)}</div>
    <div style="text-align:end;">
      <div class="doc">${e(say((w) => w.title))} ${number}</div>
      <div class="to">${e(say((w) => w.to))}: ${e(workshopName)}</div>
    </div>
  </div>

  <div class="meta">
    <div><span>${e(say((w) => w.order))}</span><b>${number}</b></div>
    <div><span>${e(say((w) => w.date))}</span><b>${e(date)}</b></div>
    <div><span>${e(say((w) => w.customer))}</span><b dir="auto">${e(filled(a.customerName) || "—")}</b></div>
    <div><span>${e(say((w) => w.neededBy))}</span>${blank}</div>
  </div>

  ${orderNote}
  ${pieces}

  <div class="sign">
    <div>${blank}${e(say((w) => w.handedOver))}</div>
    <div>${blank}${e(say((w) => w.receivedBack))}</div>
    <div>${blank}${e(say((w) => w.signature))}</div>
  </div>
${PRINT_SCRIPT}
</body>
</html>`;
}
