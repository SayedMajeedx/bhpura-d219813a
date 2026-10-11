import { formatDate } from "@/lib/format";
import { isPlaceholderVariant } from "@/lib/variant-sku-utils";
import { resolveAllVariantAxes, variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";

/**
 * The job sheet: the page that goes to the workshop with a made-to-order piece. It says what to
 * make and how (the piece, its options, the measurements and the customer's notes) and nothing
 * about money or how to reach the customer. Pure: `jobSheetPieces` picks and reads the lines,
 * `jobSheetHtml` draws the page; opening the print window is the action's job.
 */

type Lang = "ar" | "en";

export type JobSheetLine = {
  product_id?: string | null;
  variant_id?: string | null;
  description: string;
  quantity: number;
  location?: string | null;
  customizations?: Array<{ name: string }> | null;
  selected_variant?: {
    size?: string | null;
    color?: string | null;
    fabric?: string | null;
  } | null;
  custom_field_values?: Array<{
    key?: string | null;
    label_ar?: string | null;
    label_en?: string | null;
    value?: string | null;
  }> | null;
};

/** A product as the order editor loads it; only what the sheet reads is named. */
export type JobSheetProduct = {
  id: string;
  item_kind?: string | null;
  image_url?: string | null;
  [column: string]: unknown;
};

export type JobSheetRow = { label: string; value: string };

export type JobSheetPiece = {
  title: string;
  quantity: number;
  imageUrl: string | null;
  /** The variant the customer chose: colour, size, fabric in the store's own words. */
  options: JobSheetRow[];
  /** Measurements and every other answer the customer gave on the product page. */
  details: JobSheetRow[];
  /** What the customer wrote for the workshop. */
  notes: string[];
  /** Priced extras on the line, by name. */
  extras: string[];
};

/** The fields a customer writes free notes in; everything else is a labelled answer. */
const NOTE_KEYS = new Set(["tailoring_notes", "custom_measurements"]);

const filled = (value: string | null | undefined) => (value ?? "").trim();

function answers(line: JobSheetLine) {
  return (line.custom_field_values ?? []).filter((field) => filled(field?.value));
}

/**
 * Whether a line goes to the workshop: the database marked it made to order, staff added it as a
 * custom piece, or the customer gave measurements or instructions with it. A service never does.
 */
export function isWorkshopLine(line: JobSheetLine, product?: JobSheetProduct | null): boolean {
  if (product?.item_kind === "service") return false;
  return line.location === "custom" || line.variant_id === "custom" || answers(line).length > 0;
}

export function jobSheetPieces(
  lines: readonly JobSheetLine[],
  products: readonly JobSheetProduct[],
  options: { lang: Lang; brandAddons?: unknown[] | null; storeVertical?: string | null },
): JobSheetPiece[] {
  const { lang } = options;
  const addonDefaults = variantAxisDefaultsFrom(
    options.brandAddons as Parameters<typeof variantAxisDefaultsFrom>[0],
    options.storeVertical,
  );
  const productOf = (line: JobSheetLine) =>
    line.product_id ? (products.find((p) => p.id === line.product_id) ?? null) : null;

  return lines
    .filter((line) => isWorkshopLine(line, productOf(line)))
    .map((line) => {
      const product = productOf(line);
      const axes = resolveAllVariantAxes({
        product: product as Parameters<typeof resolveAllVariantAxes>[0]["product"],
        addonDefaults,
        lang,
      });
      const variant = line.selected_variant;
      const chosen: JobSheetRow[] = [];
      if (filled(variant?.color) && axes.color.visible) {
        chosen.push({ label: axes.color.label, value: filled(variant?.color) });
      }
      if (filled(variant?.size) && axes.size.visible && !isPlaceholderVariant(variant)) {
        chosen.push({ label: axes.size.label, value: filled(variant?.size) });
      }
      if (filled(variant?.fabric) && axes.fabric.visible) {
        chosen.push({ label: axes.fabric.label, value: filled(variant?.fabric) });
      }

      const given = answers(line);
      const labelOf = (field: (typeof given)[number]) =>
        filled(
          lang === "ar" ? field.label_ar || field.label_en : field.label_en || field.label_ar,
        ) || filled(field.key);

      return {
        title: filled(line.description) || "—",
        quantity: Number(line.quantity) || 1,
        imageUrl: filled(product?.image_url) || null,
        options: chosen,
        details: given
          .filter((field) => !NOTE_KEYS.has(filled(field.key)))
          .map((field) => ({ label: labelOf(field), value: filled(field.value) })),
        notes: given
          .filter((field) => NOTE_KEYS.has(filled(field.key)))
          .map((field) => filled(field.value)),
        extras: (line.customizations ?? []).map((c) => filled(c?.name)).filter(Boolean),
      };
    });
}

export type JobSheetArgs = {
  brand: string;
  /** The store's own word for where the piece is made ("Tailor", "Workshop"). */
  workshop: string;
  orderNumber: string | number;
  orderDate: string | null | undefined;
  customerName?: string | null;
  /** The note the customer left on the whole order, if any. */
  orderNote?: string | null;
  pieces: JobSheetPiece[];
  lang: Lang;
};

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

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The printable page. Every value from the order is escaped. */
export function jobSheetHtml(a: JobSheetArgs): string {
  const isRTL = a.lang === "ar";
  const words = WORDS[a.lang];
  const e = escapeHtml;
  const number = e(String(a.orderNumber));
  const blank = `<span class="blank"></span>`;

  const rows = (list: JobSheetRow[]) =>
    list
      .map(
        (row) =>
          `<div class="row"><span class="label">${e(row.label)}</span><span class="value">${e(row.value)}</span></div>`,
      )
      .join("");

  const pieces = a.pieces
    .map((piece, index) => {
      const image = piece.imageUrl ? `<img class="photo" src="${e(piece.imageUrl)}" alt="" />` : "";
      const chosen = piece.options.length
        ? `<div class="chosen">${piece.options
            .map((row) => `<span><b>${e(row.label)}:</b> ${e(row.value)}</span>`)
            .join("")}</div>`
        : "";
      const details = piece.details.length
        ? `<h3>${e(words.details)}</h3><div class="grid">${rows(piece.details)}</div>`
        : "";
      const notes = piece.notes.length
        ? `<h3>${e(words.notes)}</h3>${piece.notes.map((note) => `<p class="note">${e(note)}</p>`).join("")}`
        : "";
      const extras = piece.extras.length
        ? `<h3>${e(words.extras)}</h3><p class="extras">${piece.extras.map(e).join(" · ")}</p>`
        : "";
      return `
  <section class="piece">
    <div class="piece-head">
      ${image}
      <div class="piece-title">
        <div class="count">${e(words.piece(index + 1, a.pieces.length))}</div>
        <h2>${e(piece.title)}</h2>
        ${chosen}
      </div>
      <div class="qty"><span>${e(words.quantity)}</span><b>${piece.quantity}</b></div>
    </div>
    ${details}
    ${notes}
    ${extras}
    <h3>${e(words.workshopNotes(a.workshop))}</h3>
    <div class="lines"><i></i><i></i></div>
  </section>`;
    })
    .join("");

  const orderNote = filled(a.orderNote)
    ? `<div class="order-note"><b>${e(words.orderNote)}:</b> ${e(filled(a.orderNote))}</div>`
    : "";

  return `<!DOCTYPE html>
<html dir="${isRTL ? "rtl" : "ltr"}" lang="${a.lang}">
<head>
  <meta charset="utf-8" />
  <title>${e(words.title)} #${number}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: ${isRTL ? "'Tajawal','Cairo'," : ""}-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: black; margin: 0; padding: 16px; font-size: 13px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 12px; }
    .brand { font-size: 18px; font-weight: 800; }
    .doc { font-size: 20px; font-weight: 800; }
    .to { font-size: 13px; color: dimgray; margin-top: 2px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
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
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
    .row { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid gainsboro; padding: 5px 0; }
    .label { color: dimgray; }
    .value { font-weight: 700; font-size: 14px; text-align: end; }
    .note { margin: 0 0 4px; padding: 8px 10px; background: whitesmoke; border-radius: 6px; font-size: 14px; font-weight: 600; white-space: pre-wrap; }
    .extras { margin: 0; font-weight: 600; }
    .lines i { display: block; border-bottom: 1px dashed gray; height: 22px; }
    .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 18px; break-inside: avoid; }
    .sign div { font-size: 11px; color: dimgray; }
    .sign .blank { display: block; height: 26px; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">${e(a.brand)}</div>
    <div style="text-align:end;">
      <div class="doc">${e(words.title)} #${number}</div>
      <div class="to">${e(words.to)}: ${e(a.workshop)}</div>
    </div>
  </div>

  <div class="meta">
    <div><span>${e(words.order)}</span><b>#${number}</b></div>
    <div><span>${e(words.date)}</span><b>${e(formatDate(a.orderDate, isRTL ? "ar-BH-u-nu-latn" : "en-US"))}</b></div>
    <div><span>${e(words.customer)}</span><b>${e(filled(a.customerName) || "—")}</b></div>
    <div><span>${e(words.neededBy)}</span>${blank}</div>
  </div>

  ${orderNote}
  ${pieces}

  <div class="sign">
    <div>${blank}${e(words.handedOver)}</div>
    <div>${blank}${e(words.receivedBack)}</div>
    <div>${blank}${e(words.signature)}</div>
  </div>

  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>
</body>
</html>`;
}
