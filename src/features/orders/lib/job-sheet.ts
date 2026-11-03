import { isDefaultSize } from "@/lib/default-variant";
import { resolveAllVariantAxes, variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";
import { customFieldLabel, customFieldValue } from "@/lib/order-custom-fields";
import { orderLineName } from "@/lib/order-line-name";
import { translateOptionValue } from "@/lib/variant-i18n";

/**
 * The job sheet: the page that goes to the workshop with a made-to-order piece. It says what to
 * make and how (the piece, its options, the measurements and the customer's notes) and nothing
 * about money or how to reach the customer. Pure: `jobSheetPieces` picks and reads the lines,
 * `jobSheetHtml` draws the page; opening the print window is the action's job.
 */

export type Lang = "ar" | "en";
/** The language a job sheet or a supplier's message is written in: one, or both side by side. */
export type SheetLang = Lang | "both";

export const SHEET_LANGS: readonly SheetLang[] = ["ar", "en", "both"];

export function isSheetLang(value: unknown): value is SheetLang {
  return value === "ar" || value === "en" || value === "both";
}

/**
 * The language a sheet opens on: the supplier's own when the piece is with a supplier who chose
 * one, else the screen's.
 */
export function sheetLanguageFor({
  vendorLang,
  screenLang,
}: {
  vendorLang?: string | null;
  screenLang: Lang;
}): SheetLang {
  return isSheetLang(vendorLang) ? vendorLang : screenLang;
}

export type JobSheetLine = {
  product_id?: string | null;
  variant_id?: string | null;
  description: string;
  /** The line's own names (a booking's add-on, a package's service), when it has them. */
  name_ar?: string | null;
  name_en?: string | null;
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
  name?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
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
      // An option's value in the sheet's language where the store's own words know it ("Black"
      // reads أسود on an Arabic sheet); otherwise as written. Nothing is sent to be translated.
      const optionValue = (value: string | null | undefined) =>
        translateOptionValue(filled(value), lang) || filled(value);
      const chosen: JobSheetRow[] = [];
      if (filled(variant?.color) && axes.color.visible) {
        chosen.push({ label: axes.color.label, value: optionValue(variant?.color) });
      }
      if (filled(variant?.size) && axes.size.visible && !isDefaultSize(variant?.size)) {
        chosen.push({ label: axes.size.label, value: optionValue(variant?.size) });
      }
      if (filled(variant?.fabric) && axes.fabric.visible) {
        chosen.push({ label: axes.fabric.label, value: optionValue(variant?.fabric) });
      }

      const given = answers(line);
      const labelOf = (field: (typeof given)[number]) => filled(customFieldLabel(field, lang));

      return {
        // The line's name in the sheet's language (its own names, else its product's), what a
        // person wrote by hand as written.
        title: filled(orderLineName({ ...line, product }, lang)) || "—",
        quantity: Number(line.quantity) || 1,
        imageUrl: filled(product?.image_url) || null,
        options: chosen,
        details: given
          .filter((field) => !NOTE_KEYS.has(filled(field.key)))
          .map((field) => ({
            label: labelOf(field),
            value: filled(customFieldValue(field, lang)),
          })),
        // What the customer wrote stays exactly as written, in every language.
        notes: given
          .filter((field) => NOTE_KEYS.has(filled(field.key)))
          .map((field) => filled(field.value)),
        extras: (line.customizations ?? []).map((c) => filled(c?.name)).filter(Boolean),
      };
    });
}

/** The pieces of a sheet: in one language, or in both, paired by line (same lines, same order). */
export type SheetPieces =
  | { lang: Lang; pieces: JobSheetPiece[] }
  | {
      lang: "both";
      pieces: Record<Lang, JobSheetPiece[]>;
    };

export function sheetPieces(
  lines: readonly JobSheetLine[],
  products: readonly JobSheetProduct[],
  options: { lang: SheetLang; brandAddons?: unknown[] | null; storeVertical?: string | null },
): SheetPieces {
  const read = (lang: Lang) => jobSheetPieces(lines, products, { ...options, lang });
  return options.lang === "both"
    ? { lang: "both", pieces: { ar: read("ar"), en: read("en") } }
    : { lang: options.lang, pieces: read(options.lang) };
}

export { jobSheetHtml, jobSheetsHtml, type JobSheetArgs, type SheetWhere } from "./job-sheet-html";
