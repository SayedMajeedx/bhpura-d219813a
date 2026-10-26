import type { NewStoreOffer, StoreOfferRow } from "@/lib/data/offers";
import type { OfferKind, StoreOffer } from "@/lib/offers";

/**
 * One offer's form on the Discounts page, and the row it saves (store_offers). Amounts are typed
 * as text so a half-typed number stays as typed; what stops a save is `offerFormProblem`, the
 * same shape the table's checks hold.
 */
export interface OfferForm {
  kind: OfferKind;
  name_ar: string;
  name_en: string;
  is_active: boolean;
  /** Local date-times as `<input type="datetime-local">` writes them. */
  starts_at: string;
  ends_at: string;
  min_subtotal: string;
  min_items: string;
  product_ids: string[];
  category_slugs: string[];
  exclude_sale_items: boolean;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  max_discount: string;
  buy_quantity: string;
  get_quantity: string;
  /** Whether the pieces given come from other products than the ones bought. */
  get_other: boolean;
  get_product_ids: string[];
  get_category_slugs: string[];
  get_percent: string;
  max_sets: string;
  local_only: boolean;
}

/** A new offer of each kind, with the values most stores start from. */
export function emptyOfferForm(kind: OfferKind): OfferForm {
  return {
    kind,
    name_ar: "",
    name_en: "",
    is_active: true,
    starts_at: "",
    ends_at: "",
    min_subtotal: kind === "free_delivery" ? "30" : "",
    min_items: "",
    product_ids: [],
    category_slugs: [],
    exclude_sale_items: false,
    discount_type: "percentage",
    discount_value: kind === "discount" ? "10" : "",
    max_discount: "",
    buy_quantity: "2",
    get_quantity: "1",
    get_other: false,
    get_product_ids: [],
    get_category_slugs: [],
    get_percent: "100",
    max_sets: "",
    local_only: true,
  };
}

const text = (n: number | null | undefined) => (n == null ? "" : String(Number(n)));

/** `2026-10-31T20:00` in the reader's own clock, from a stored moment. */
export function localInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

const moment = (local: string): string | null => {
  if (!local.trim()) return null;
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

/** The form an offer opens with. */
export function formFromRow(row: StoreOfferRow): OfferForm {
  const getOther = row.get_product_ids.length > 0 || row.get_category_slugs.length > 0;
  return {
    ...emptyOfferForm(row.kind as OfferKind),
    name_ar: row.name_ar,
    name_en: row.name_en,
    is_active: row.is_active,
    starts_at: localInput(row.starts_at),
    ends_at: localInput(row.ends_at),
    min_subtotal: text(row.min_subtotal),
    min_items: text(row.min_items),
    product_ids: row.product_ids,
    category_slugs: row.category_slugs,
    exclude_sale_items: row.exclude_sale_items,
    discount_type: row.discount_type === "fixed" ? "fixed" : "percentage",
    discount_value: text(row.discount_value),
    max_discount: text(row.max_discount),
    buy_quantity: text(row.buy_quantity) || "2",
    get_quantity: text(row.get_quantity) || "1",
    get_other: getOther,
    get_product_ids: row.get_product_ids,
    get_category_slugs: row.get_category_slugs,
    get_percent: text(row.get_percent) || "100",
    max_sets: text(row.max_sets),
    local_only: row.local_only,
  };
}

const num = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
};

/** What stops a save, in the reader's language; null when the offer can be saved. */
export function offerFormProblem(form: OfferForm, isAr: boolean): string | null {
  const say = (ar: string, en: string) => (isAr ? ar : en);
  const positive = (value: string) => {
    const n = num(value);
    return n !== null && !Number.isNaN(n) && n > 0;
  };
  const optionalPositive = (value: string) => !value.trim() || positive(value);
  const wholeIn = (value: string, low: number, high: number) => {
    const n = num(value);
    return n !== null && Number.isInteger(n) && n >= low && n <= high;
  };

  if (form.name_ar.length > 80 || form.name_en.length > 80)
    return say("الاسم أطول من 80 حرفًا.", "A name is longer than 80 characters.");
  if (!optionalPositive(form.min_subtotal))
    return say(
      "اكتب أقل مبلغ رقمًا أكبر من صفر.",
      "Write the least amount as a number above zero.",
    );
  if (form.min_items.trim() && !wholeIn(form.min_items, 1, 1000))
    return say(
      "اكتب أقل عدد قطع رقمًا صحيحًا.",
      "Write the least number of pieces as a whole number.",
    );
  const starts = moment(form.starts_at);
  const ends = moment(form.ends_at);
  if (starts && ends && ends <= starts)
    return say("ينتهي العرض قبل أن يبدأ.", "The offer ends before it starts.");

  if (form.kind === "discount") {
    if (!positive(form.discount_value))
      return say("اكتب قيمة الخصم.", "Write how much the offer takes off.");
    if (form.discount_type === "percentage" && Number(form.discount_value) > 100)
      return say("لا تزيد النسبة على 100%.", "A percentage cannot be over 100%.");
    if (!optionalPositive(form.max_discount))
      return say("اكتب الحد الأعلى للخصم رقمًا.", "Write the cap as a number.");
  }
  if (form.kind === "buy_x_get_y") {
    if (!wholeIn(form.buy_quantity, 1, 100) || !wholeIn(form.get_quantity, 1, 100))
      return say(
        "اكتب عدد القطع المشتراة والمهداة أرقامًا صحيحة من 1 إلى 100.",
        "Write the pieces bought and given as whole numbers from 1 to 100.",
      );
    const pct = num(form.get_percent);
    if (pct === null || Number.isNaN(pct) || pct <= 0 || pct > 100)
      return say(
        "اكتب نسبة الخصم على القطع المهداة من 1 إلى 100.",
        "Write the given pieces' discount from 1 to 100%.",
      );
    if (form.max_sets.trim() && !wholeIn(form.max_sets, 1, 100))
      return say("اكتب أقصى عدد للمرات رقمًا صحيحًا.", "Write the most times as a whole number.");
    if (form.get_other && form.get_product_ids.length === 0 && form.get_category_slugs.length === 0)
      return say(
        "اختر المنتجات أو الأقسام التي تُهدى منها القطع.",
        "Choose the products or categories the given pieces come from.",
      );
  }
  return null;
}

/** The row the form saves (store_offers), with only the fields its kind uses. */
export function rowFromForm(form: OfferForm): NewStoreOffer {
  const n = (value: string) => {
    const v = num(value);
    return v === null || Number.isNaN(v) ? null : v;
  };
  const base: NewStoreOffer = {
    kind: form.kind,
    name_ar: form.name_ar.trim(),
    name_en: form.name_en.trim(),
    is_active: form.is_active,
    starts_at: moment(form.starts_at),
    ends_at: moment(form.ends_at),
    min_subtotal: n(form.min_subtotal),
    min_items: form.kind === "buy_x_get_y" ? null : n(form.min_items),
    product_ids: form.product_ids,
    category_slugs: form.category_slugs,
    exclude_sale_items: form.exclude_sale_items,
    discount_type: null,
    discount_value: null,
    max_discount: null,
    buy_quantity: null,
    get_quantity: null,
    get_product_ids: [],
    get_category_slugs: [],
    get_percent: null,
    max_sets: null,
    local_only: form.local_only,
  };
  if (form.kind === "discount") {
    return {
      ...base,
      discount_type: form.discount_type,
      discount_value: n(form.discount_value),
      max_discount: form.discount_type === "percentage" ? n(form.max_discount) : null,
    };
  }
  if (form.kind === "buy_x_get_y") {
    return {
      ...base,
      min_subtotal: null,
      buy_quantity: n(form.buy_quantity),
      get_quantity: n(form.get_quantity),
      get_product_ids: form.get_other ? form.get_product_ids : [],
      get_category_slugs: form.get_other ? form.get_category_slugs : [],
      get_percent: n(form.get_percent),
      max_sets: n(form.max_sets),
    };
  }
  return base;
}

/** The offer being typed, as a shopper would read it (the dialog's "Shoppers read" line). */
export function draftOffer(form: OfferForm): StoreOffer {
  const row = rowFromForm(form);
  return asStoreOffer({
    ...row,
    id: "draft",
    brand_id: "",
    created_at: "",
    updated_at: "",
  } as StoreOfferRow);
}

/** A saved offer as the shopper-facing rules read it (`offerTerms`). */
export function asStoreOffer(row: StoreOfferRow): StoreOffer {
  return {
    id: row.id,
    kind: row.kind as OfferKind,
    name_ar: row.name_ar,
    name_en: row.name_en,
    ends_at: row.ends_at,
    min_subtotal: row.min_subtotal,
    min_items: row.min_items,
    product_ids: row.product_ids,
    category_slugs: row.category_slugs,
    exclude_sale_items: row.exclude_sale_items,
    discount_type: (row.discount_type as StoreOffer["discount_type"]) ?? null,
    discount_value: row.discount_value,
    max_discount: row.max_discount,
    buy_quantity: row.buy_quantity,
    get_quantity: row.get_quantity,
    get_product_ids: row.get_product_ids,
    get_category_slugs: row.get_category_slugs,
    get_percent: row.get_percent,
    max_sets: row.max_sets,
    local_only: row.local_only,
  };
}

export type OfferState = "live" | "scheduled" | "ended" | "off";

/** Whether an offer is on now, waiting for its start, past its end, or switched off. */
export function offerState(
  row: Pick<StoreOfferRow, "is_active" | "starts_at" | "ends_at">,
  now = new Date(),
): OfferState {
  if (!row.is_active) return "off";
  if (row.ends_at && new Date(row.ends_at) <= now) return "ended";
  if (row.starts_at && new Date(row.starts_at) > now) return "scheduled";
  return "live";
}
