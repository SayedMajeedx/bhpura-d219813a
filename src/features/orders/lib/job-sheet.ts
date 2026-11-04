import {
  isHiddenField,
  lineSize,
  madeToMeasure,
  madeToMeasureLabel,
  NOTE_KEYS,
} from "@/lib/made-to-measure";
import { resolveAllVariantAxes, variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";
import { customFieldLabel, customFieldValue } from "@/lib/order-custom-fields";
import { orderLineName } from "@/lib/order-line-name";
import { translateOptionValue } from "@/lib/variant-i18n";
import { replacedSheetDate, type LineRevision } from "./line-revisions";

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
  /** The order line's own id and revision (a line whose details changed after it was placed). */
  id?: string | null;
  revision?: number | null;
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
    made_to_measure?: boolean | null;
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

/** A row of the sheet; `was`: a revised piece's value before the change (struck through beside it). */
export type JobSheetRow = { label: string; value: string; was?: string; changed?: boolean };

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
  /**
   * A piece whose details changed after its sheet was given (migration `20261119100000`): the
   * revision it is, when the sheet it replaces was written, and whether the notes changed.
   */
  revision?: { number: number; replacesSheetOf: string | null; notesChanged: boolean } | null;
};

// A value read from the order as text (a stored answer may be a number).
const filled = (value: unknown) => (value == null ? "" : String(value)).trim();

/** What the customer answered, less the bookkeeping kept with it (the unit, the version). */
function answers(line: JobSheetLine) {
  return (line.custom_field_values ?? []).filter(
    (field) => filled(field?.value) && !isHiddenField(field?.key),
  );
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
  options: {
    lang: Lang;
    brandAddons?: unknown[] | null;
    storeVertical?: string | null;
    /** Every piece given, not only the workshop's (an alteration of a ready-made piece). */
    every?: boolean;
    /** The order's line revisions: a revised piece's sheet says so and marks what changed. */
    revisions?: readonly LineRevision[];
    /** The order's date: when the first sheet of a piece was written. */
    orderDate?: string | null;
  },
): JobSheetPiece[] {
  const { lang } = options;
  const addonDefaults = variantAxisDefaultsFrom(
    options.brandAddons as Parameters<typeof variantAxisDefaultsFrom>[0],
    options.storeVertical,
  );
  const productOf = (line: JobSheetLine) =>
    line.product_id ? (products.find((p) => p.id === line.product_id) ?? null) : null;

  return lines
    .filter((line) =>
      options.every
        ? productOf(line)?.item_kind !== "service"
        : isWorkshopLine(line, productOf(line)),
    )
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
      // A piece made to the customer's measurements is made to them, not to a size.
      const size = lineSize(line);
      if (madeToMeasure(line) && axes.size.visible) {
        chosen.push({
          label: axes.size.label,
          value: madeToMeasureLabel(lang),
        });
      } else if (size && axes.size.visible) {
        chosen.push({ label: axes.size.label, value: optionValue(size) });
      }
      if (filled(variant?.fabric) && axes.fabric.visible) {
        chosen.push({ label: axes.fabric.label, value: optionValue(variant?.fabric) });
      }

      const given = answers(line);
      const labelOf = (field: (typeof given)[number]) => filled(customFieldLabel(field, lang));
      // A revised piece: what its latest revision changed, by answer.
      const number = Number(line.revision) || 1;
      const ownRevisions = (options.revisions ?? []).filter(
        (r) => line.id && r.order_item_id === line.id,
      );
      const latest = number > 1 ? ownRevisions.find((r) => r.revision === number) : undefined;
      const changed = new Map((latest?.changes ?? []).map((c) => [c.key ?? "", c.from ?? ""]));
      const marked = (field: (typeof given)[number]) =>
        changed.has(filled(field.key))
          ? {
              changed: true,
              ...(changed.get(filled(field.key)) ? { was: changed.get(filled(field.key)) } : {}),
            }
          : {};

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
            ...marked(field),
          })),
        // What the customer wrote stays exactly as written, in every language.
        notes: given
          .filter((field) => NOTE_KEYS.has(filled(field.key)))
          .map((field) => filled(field.value)),
        extras: (line.customizations ?? []).map((c) => filled(c?.name)).filter(Boolean),
        revision:
          number > 1
            ? {
                number,
                replacesSheetOf: replacedSheetDate(ownRevisions, number, options.orderDate ?? null),
                notesChanged: [...changed.keys()].some((key) => NOTE_KEYS.has(key)),
              }
            : null,
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
  options: {
    lang: SheetLang;
    brandAddons?: unknown[] | null;
    storeVertical?: string | null;
    every?: boolean;
    revisions?: readonly LineRevision[];
    orderDate?: string | null;
  },
): SheetPieces {
  const read = (lang: Lang) => jobSheetPieces(lines, products, { ...options, lang });
  return options.lang === "both"
    ? { lang: "both", pieces: { ar: read("ar"), en: read("en") } }
    : { lang: options.lang, pieces: read(options.lang) };
}

export { jobSheetHtml, jobSheetsHtml, type JobSheetArgs, type SheetWhere } from "./job-sheet-html";
