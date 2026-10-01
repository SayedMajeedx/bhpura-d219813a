/**
 * A service's add-ons (service_options; migration 20261002140000): an
 * attendant that comes with every booking, instant prints on by default,
 * magnets as an extra, envelopes in blocks that get cheaper. The database
 * prices and writes them when a booking is made (apply_booking_options); this
 * is the same price in TypeScript so a customer sees the total as they choose,
 * with the merchant's form rules and the words for each add-on.
 * tests/service-options.test.ts and tests/service-options-ui.test.tsx run both
 * against each other.
 */

export type OptionMode = "included" | "required" | "default_on" | "optional";

export type OptionTiers = { step: number; prices: number[] };

export type ServiceOption = {
  id: string;
  product_id: string;
  name_en: string | null;
  name_ar: string | null;
  description_en: string | null;
  description_ar: string | null;
  mode: OptionMode;
  price: number;
  tiers: OptionTiers | null;
  max_quantity: number | null;
  sort_order: number;
  is_active: boolean;
};

export const OPTION_MODES: OptionMode[] = ["included", "required", "default_on", "optional"];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** What an option costs for `quantity` units (the database's service_option_price). */
export function optionPrice(
  option: Pick<ServiceOption, "mode" | "price" | "tiers">,
  quantity = 1,
): number {
  if (option.mode === "included") return 0;
  if (!option.tiers) return round3(option.price);
  const { step, prices } = option.tiers;
  const blocks = Math.ceil(Math.max(quantity, 0) / Math.max(1, step));
  let total = 0;
  for (let block = 1; block <= blocks; block++) {
    total += prices[Math.min(block, prices.length) - 1];
  }
  return round3(total);
}

/** The first block's quantity of a tiered option; 1 for a flat one. */
export function optionStep(option: Pick<ServiceOption, "tiers">): number {
  return option.tiers ? option.tiers.step : 1;
}

/** What the customer has chosen: option id to quantity (a flat option is 1). */
export type OptionSelection = Record<string, number>;

/** The starting choice: what comes with the service and what is on by default. */
export function defaultSelection(options: readonly ServiceOption[]): OptionSelection {
  const selection: OptionSelection = {};
  for (const option of options) {
    if (!option.is_active) continue;
    if (option.mode === "included" || option.mode === "required" || option.mode === "default_on") {
      selection[option.id] = optionStep(option);
    }
  }
  return selection;
}

/** Whether the customer may take an add-on off or put it on. */
export function isChangeable(option: Pick<ServiceOption, "mode">): boolean {
  return option.mode === "default_on" || option.mode === "optional";
}

/** A quantity the option accepts (a multiple of its step, within its limit), or null. */
export function validQuantity(option: ServiceOption, quantity: number): number | null {
  const step = optionStep(option);
  if (!Number.isInteger(quantity) || quantity < step || quantity % step !== 0) return null;
  if (option.max_quantity !== null && quantity > option.max_quantity) return null;
  return quantity;
}

/** The chosen add-ons with their prices, in the merchant's order. */
export function chosenOptions(
  options: readonly ServiceOption[],
  selection: OptionSelection,
): Array<{ option: ServiceOption; quantity: number; price: number }> {
  return options
    .filter((option) => option.is_active)
    .filter(
      (option) =>
        option.mode === "included" || option.mode === "required" || option.id in selection,
    )
    .map((option) => {
      const quantity = selection[option.id] ?? optionStep(option);
      return { option, quantity, price: optionPrice(option, quantity) };
    });
}

export function optionsTotal(
  options: readonly ServiceOption[],
  selection: OptionSelection,
): number {
  return round3(chosenOptions(options, selection).reduce((sum, line) => sum + line.price, 0));
}

/**
 * The choice sent with a booking: always a list once the service has add-ons
 * (so an add-on that is on by default and was taken off stays off). Included and
 * required ones are not sent: the database adds them.
 */
export function optionsPayload(
  options: readonly ServiceOption[],
  selection: OptionSelection,
): Array<{ option_id: string; quantity: number }> | undefined {
  const active = options.filter((option) => option.is_active);
  if (active.length === 0) return undefined;
  return active
    .filter((option) => isChangeable(option) && option.id in selection)
    .map((option) => ({ option_id: option.id, quantity: selection[option.id] }));
}

export function optionName(option: Pick<ServiceOption, "name_en" | "name_ar">, isAr: boolean) {
  return (isAr ? option.name_ar || option.name_en : option.name_en || option.name_ar) ?? "";
}

export function optionDescription(
  option: Pick<ServiceOption, "description_en" | "description_ar">,
  isAr: boolean,
) {
  return (
    (isAr
      ? option.description_ar || option.description_en
      : option.description_en || option.description_ar) ?? ""
  );
}

/** "First 50: 15 · next 50: 12.5 · then 10 per 50" for a tiered option. */
export function tiersText(tiers: OptionTiers, isAr: boolean): string {
  const { step, prices } = tiers;
  const parts = prices.map((price, index) => {
    const last = index === prices.length - 1;
    if (isAr) {
      if (index === 0) return `أول ${step}: ${price}`;
      return last ? `ثم ${price} لكل ${step}` : `${index === 1 ? "التالية" : "ثم"}: ${price}`;
    }
    if (index === 0) return `first ${step}: ${price}`;
    if (last) return `then ${price} per ${step}`;
    return index === 1 ? `next ${step}: ${price}` : `${step} more: ${price}`;
  });
  return parts.join(" · ");
}

/** What the merchant sees under an add-on in its list: its mode and price in a few words. */
export function describeOption(option: ServiceOption, isAr: boolean): string {
  const mode = {
    included: isAr ? "مشمولة (بدون مقابل)" : "Included (free)",
    required: isAr ? "إلزامية" : "Required",
    default_on: isAr ? "مضافة تلقائياً" : "On by default",
    optional: isAr ? "اختيارية" : "Optional",
  }[option.mode];
  const price = option.tiers
    ? tiersText(option.tiers, isAr)
    : option.mode === "included"
      ? ""
      : String(option.price);
  return [mode, price].filter(Boolean).join(" · ");
}

// ── The merchant's add-on form ──────────────────────────────────────────────

export type OptionForm = {
  id?: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  mode: OptionMode;
  price: string;
  tiered: boolean;
  step: string;
  /** Block prices, comma-separated: "15, 12.5, 10". */
  prices: string;
  max_quantity: string;
  is_active: boolean;
};

export const EMPTY_OPTION_FORM: OptionForm = {
  name_en: "",
  name_ar: "",
  description_en: "",
  description_ar: "",
  mode: "optional",
  price: "",
  tiered: false,
  step: "50",
  prices: "",
  max_quantity: "",
  is_active: true,
};

export function optionFormFrom(option: ServiceOption): OptionForm {
  return {
    id: option.id,
    name_en: option.name_en ?? "",
    name_ar: option.name_ar ?? "",
    description_en: option.description_en ?? "",
    description_ar: option.description_ar ?? "",
    mode: option.mode,
    price: option.price ? String(option.price) : "",
    tiered: option.tiers !== null,
    step: option.tiers ? String(option.tiers.step) : "50",
    prices: option.tiers ? option.tiers.prices.join(", ") : "",
    max_quantity: option.max_quantity === null ? "" : String(option.max_quantity),
    is_active: option.is_active,
  };
}

function priceList(text: string): number[] {
  return text
    .split(/[,،\s]+/)
    .filter(Boolean)
    .map(Number);
}

/** Why the add-on can't be saved, or null. */
export function optionFormError(form: OptionForm, isAr: boolean): string | null {
  if (!form.name_en.trim() && !form.name_ar.trim()) {
    return isAr ? "اكتب اسم الإضافة." : "Name the add-on.";
  }
  if (form.tiered) {
    const step = Number(form.step);
    const prices = priceList(form.prices);
    if (!Number.isInteger(step) || step < 1 || step > 1000) {
      return isAr
        ? "حجم الدفعة رقم صحيح من 1 إلى 1000."
        : "A block is a whole number from 1 to 1000.";
    }
    if (
      prices.length === 0 ||
      prices.length > 20 ||
      prices.some((p) => !Number.isFinite(p) || p < 0)
    ) {
      return isAr
        ? "اكتب سعر كل دفعة مفصولاً بفاصلة، مثل: 15, 12.5, 10."
        : "Give each block's price, separated by commas, like 15, 12.5, 10.";
    }
  } else if (form.mode !== "included") {
    const price = Number(form.price);
    if (form.price.trim() === "" || !Number.isFinite(price) || price < 0) {
      return isAr ? "اكتب سعر الإضافة." : "Enter the add-on's price.";
    }
  }
  if (form.max_quantity.trim() !== "") {
    const max = Number(form.max_quantity);
    if (!Number.isInteger(max) || max < 1) {
      return isAr ? "الحد الأقصى رقم صحيح." : "The most is a whole number.";
    }
  }
  return null;
}

/** The service_options columns a form saves. */
export function optionColumns(form: OptionForm) {
  const prices = priceList(form.prices);
  const max = form.max_quantity.trim() === "" ? null : Number(form.max_quantity);
  return {
    name_en: form.name_en.trim() || null,
    name_ar: form.name_ar.trim() || null,
    description_en: form.description_en.trim() || null,
    description_ar: form.description_ar.trim() || null,
    mode: form.mode,
    price: form.tiered ? (prices[0] ?? 0) : form.mode === "included" ? 0 : Number(form.price || 0),
    tiers: form.tiered ? { step: Number(form.step), prices } : null,
    max_quantity: form.tiered ? max : null,
    is_active: form.is_active,
  };
}
