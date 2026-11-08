import { defaultVariantLabel, isDefaultVariant } from "@/lib/default-variant";
import { describeVariantAxes, formatAxisValue, type AxisDefaults } from "@/lib/variant-axes";
import { isMadeToOrderOnlyVariant } from "@/features/inventory/components/MadeToOrderOnlyNote";
import type { Product, Variant } from "@/features/inventory/types";

/**
 * The inventory's sheet: every size of the products the list shows, one row each, with its price,
 * "was" price, stock and cost in cells a merchant can change many at a time, then review and save
 * at once. Pure: the rows, the bulk actions on chosen rows, what stops a save, the list of changes
 * a person reviews, and the writes that save them (`useBulkSheetSave` makes them).
 *
 * Services and packages are priced in their own editors (lengths, included services) and are not
 * here. A made-to-order product's only size with no ready stock has nothing to count, as in the
 * product editor (`isMadeToOrderOnlyVariant`).
 */

export type SheetField = "price" | "wasPrice" | "stock" | "cost";

export type SheetRow = {
  variantId: string;
  productId: string;
  productName: string;
  image: string | null;
  /** The size's options in the store's words ("54 · Black"), or "No options". */
  options: string;
  sku: string | null;
  price: number;
  /** The struck "was" price (`original_price`), or null when the size is not on sale. */
  wasPrice: number | null;
  stock: number;
  /** The size's cost, or null for a reader who may not see costs. */
  cost: number | null;
  visible: boolean;
  /** The first row of its product: the product's own switch (visible) is drawn there. */
  firstOfProduct: boolean;
  stockEditable: boolean;
};

/** What was typed in a cell (kept as typed until saved), and each product's visibility. */
export type SheetEdits = {
  cells: Record<string, Partial<Record<SheetField, string>>>;
  visible: Record<string, boolean>;
};

export const NO_EDITS: SheetEdits = { cells: {}, visible: {} };

/** The most a price or a stock may be: a slip of the finger should not price a scarf at a million. */
export const MAX_SHEET_PRICE = 100_000;
export const MAX_SHEET_STOCK = 100_000;

const productName = (product: Product, lang: "ar" | "en") =>
  (lang === "ar" ? product.name_ar || product.name_en : product.name_en || product.name_ar) ||
  product.name;

/** The sheet's rows: the list's products in its order, each size in use, services left out. */
export function sheetRows({
  products,
  variantsByProduct,
  axisDefaults,
  lang,
  costsKnown,
}: {
  products: Product[];
  variantsByProduct: Record<string, Variant[]>;
  axisDefaults: AxisDefaults;
  lang: "ar" | "en";
  costsKnown: boolean;
}): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const product of products) {
    if (product.item_kind === "service" || product.is_package) continue;
    const variants = variantsByProduct[product.id] ?? [];
    const axes = describeVariantAxes({ product, variants, addonDefaults: axisDefaults, lang });
    variants.forEach((variant, index) => {
      const options = isDefaultVariant(variant)
        ? defaultVariantLabel(lang)
        : axes
            .map((axis) => {
              const value = variant[axis.field];
              return value ? formatAxisValue(axis, value, lang, variants) : null;
            })
            .filter(Boolean)
            .join(" · ") || defaultVariantLabel(lang);
      const was = Number(variant.original_price ?? 0);
      const price = Number(variant.selling_price ?? 0);
      rows.push({
        variantId: variant.id,
        productId: product.id,
        productName: productName(product, lang),
        image: variant.image_url || product.image_url || null,
        options,
        sku: variant.sku ?? null,
        price,
        wasPrice: was > price ? was : null,
        stock: Math.max(0, Math.trunc(Number(variant.stock_main ?? 0))),
        cost: costsKnown ? Number(variant.cost_price ?? 0) : null,
        visible: product.is_active,
        firstOfProduct: index === 0,
        stockEditable: !isMadeToOrderOnlyVariant(product, variant),
      });
    });
  }
  return rows;
}

/** Arabic-Indic digits and the Arabic decimal mark as Western ones. */
function western(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .trim();
}

/** A cell as a number, null when empty, NaN when it is not one. */
export function cellNumber(text: string): number | null {
  const clean = western(text);
  if (clean === "") return null;
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : Number.NaN;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/** A row's value for a field: what was typed when it was changed, else its own. */
export function cellText(row: SheetRow, field: SheetField, edits: SheetEdits): string {
  const typed = edits.cells[row.variantId]?.[field];
  if (typed !== undefined) return typed;
  const value = row[field];
  return value === null ? "" : String(value);
}

function current(row: SheetRow, field: SheetField, edits: SheetEdits): number | null {
  const value = cellNumber(cellText(row, field, edits));
  return value === null || Number.isNaN(value) ? (field === "wasPrice" ? null : row[field]) : value;
}

export function editCell(edits: SheetEdits, variantId: string, field: SheetField, text: string) {
  return {
    ...edits,
    cells: { ...edits.cells, [variantId]: { ...edits.cells[variantId], [field]: text } },
  };
}

export function editVisible(edits: SheetEdits, productId: string, visible: boolean): SheetEdits {
  return { ...edits, visible: { ...edits.visible, [productId]: visible } };
}

export type BulkAction =
  | { kind: "set_price"; value: number }
  | { kind: "change_price"; percent: number }
  | { kind: "sale"; percent: number }
  | { kind: "end_sale" }
  | { kind: "set_stock"; value: number };

/**
 * A bulk action on the chosen rows, written into their cells for review (nothing is saved yet).
 * A sale takes a percentage off the regular price (the "was" price when there is one, else the
 * price) and strikes the regular price through; ending one puts the regular price back. Prices
 * are rounded to the store currency's decimals. A row with nothing to count keeps its stock.
 */
export function applyBulk(
  rows: SheetRow[],
  chosen: ReadonlySet<string>,
  action: BulkAction,
  edits: SheetEdits,
  digits: number,
): SheetEdits {
  let next = edits;
  for (const row of rows) {
    if (!chosen.has(row.variantId)) continue;
    const price = current(row, "price", edits) ?? 0;
    const was = current(row, "wasPrice", edits);
    const set = (field: SheetField, value: number | null) => {
      next = editCell(next, row.variantId, field, value === null ? "" : String(value));
    };
    switch (action.kind) {
      case "set_price":
        set("price", round(action.value, digits));
        if (was !== null && was <= action.value) set("wasPrice", null);
        break;
      case "change_price": {
        const changed = round(Math.max(0, price * (1 + action.percent / 100)), digits);
        set("price", changed);
        if (was !== null && was <= changed) set("wasPrice", null);
        break;
      }
      case "sale": {
        const regular = was ?? price;
        set("price", round(regular * (1 - action.percent / 100), digits));
        set("wasPrice", action.percent > 0 ? regular : null);
        break;
      }
      case "end_sale":
        if (was !== null) {
          set("price", was);
          set("wasPrice", null);
        }
        break;
      case "set_stock":
        if (row.stockEditable) set("stock", Math.trunc(action.value));
        break;
    }
  }
  return next;
}

export type SheetProblem = "not_a_number" | "too_big" | "not_whole" | "was_not_higher";

/** What stops each changed cell from saving. An empty "was" price takes a size off sale. */
export function sheetProblems(
  rows: SheetRow[],
  edits: SheetEdits,
): Record<string, Partial<Record<SheetField, SheetProblem>>> {
  const problems: Record<string, Partial<Record<SheetField, SheetProblem>>> = {};
  for (const row of rows) {
    const typed = edits.cells[row.variantId];
    if (!typed) continue;
    const found: Partial<Record<SheetField, SheetProblem>> = {};
    for (const field of Object.keys(typed) as SheetField[]) {
      const value = cellNumber(typed[field] ?? "");
      if (value === null) {
        if (field !== "wasPrice") found[field] = "not_a_number";
        continue;
      }
      if (Number.isNaN(value)) found[field] = "not_a_number";
      else if (field === "stock" && !Number.isInteger(value)) found[field] = "not_whole";
      else if (value > (field === "stock" ? MAX_SHEET_STOCK : MAX_SHEET_PRICE))
        found[field] = "too_big";
    }
    const price = current(row, "price", edits);
    const was = current(row, "wasPrice", edits);
    if (!found.price && !found.wasPrice && was !== null && price !== null && was <= price)
      found.wasPrice = "was_not_higher";
    if (Object.keys(found).length) problems[row.variantId] = found;
  }
  return problems;
}

export function problemText(problem: SheetProblem, isAr: boolean): string {
  const words: Record<SheetProblem, [string, string]> = {
    not_a_number: ["اكتب رقماً", "Type a number"],
    too_big: ["الرقم أكبر من المعقول", "That number is too large"],
    not_whole: ["المخزون عدد قطع كامل", "Stock is a whole number of pieces"],
    was_not_higher: [
      "السعر قبل الخصم أعلى من السعر",
      "The was price must be higher than the price",
    ],
  };
  return words[problem][isAr ? 0 : 1];
}

export type SheetChange =
  | { row: SheetRow; field: SheetField; from: number | null; to: number | null }
  | { row: SheetRow; field: "visible"; from: boolean; to: boolean };

/** Every change a person will review: a cell that now differs, and a product shown or hidden. */
export function sheetChanges(rows: SheetRow[], edits: SheetEdits, digits: number): SheetChange[] {
  const changes: SheetChange[] = [];
  for (const row of rows) {
    const typed = edits.cells[row.variantId];
    for (const field of ["price", "wasPrice", "stock", "cost"] as SheetField[]) {
      if (typed?.[field] === undefined) continue;
      if (field === "stock" && !row.stockEditable) continue;
      if (field === "cost" && row.cost === null) continue;
      const to = cellNumber(typed[field] ?? "");
      if (to !== null && Number.isNaN(to)) continue;
      const places = field === "stock" ? 0 : digits;
      const from = row[field];
      const toRounded = to === null ? null : round(to, places);
      if (toRounded === (from === null ? null : round(from, places))) continue;
      if (field !== "wasPrice" && toRounded === null) continue;
      changes.push({ row, field, from, to: toRounded });
    }
    if (row.firstOfProduct && edits.visible[row.productId] !== undefined) {
      const to = edits.visible[row.productId];
      if (to !== row.visible) changes.push({ row, field: "visible", from: row.visible, to });
    }
  }
  return changes;
}

export type SheetSavePlan = {
  /** Price, "was" price and cost, one write per size. */
  variants: Array<{
    variantId: string;
    patch: { selling_price?: number; original_price?: number | null; cost_price?: number };
  }>;
  /** Stock, through the ledger as a count: the number typed is what is on the shelf. */
  stock: Array<{ variantId: string; value: number }>;
  show: string[];
  hide: string[];
};

export function sheetSavePlan(changes: SheetChange[]): SheetSavePlan {
  const patches = new Map<string, SheetSavePlan["variants"][number]["patch"]>();
  const plan: SheetSavePlan = { variants: [], stock: [], show: [], hide: [] };
  for (const change of changes) {
    const id = change.row.variantId;
    if (change.field === "visible") {
      (change.to ? plan.show : plan.hide).push(change.row.productId);
    } else if (change.field === "stock") {
      plan.stock.push({ variantId: id, value: change.to ?? 0 });
    } else {
      const patch = patches.get(id) ?? {};
      if (change.field === "price") patch.selling_price = change.to ?? 0;
      if (change.field === "wasPrice") patch.original_price = change.to;
      if (change.field === "cost") patch.cost_price = change.to ?? 0;
      patches.set(id, patch);
    }
  }
  plan.variants = [...patches].map(([variantId, patch]) => ({ variantId, patch }));
  return plan;
}

/** The rows after a save: what was saved becomes each row's own value; failures keep their edits. */
export function editsAfterSave(edits: SheetEdits, failedVariants: ReadonlySet<string>): SheetEdits {
  const cells: SheetEdits["cells"] = {};
  for (const [id, typed] of Object.entries(edits.cells))
    if (failedVariants.has(id)) cells[id] = typed;
  return { cells, visible: {} };
}
