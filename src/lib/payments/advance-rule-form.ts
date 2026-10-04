import {
  ADVANCE_FULFILLMENTS,
  type AdvanceFulfillment,
  type AdvanceRuleDef,
} from "@/lib/payments/advance-rules";

/**
 * A store's own advance-payment rule as the merchant edits it (advance_payment_rules):
 * the form (inputs as text), what it says to the database, what it is in words.
 */

export type MadeToOrderChoice = "any" | "only" | "not";

export type AdvanceRuleForm = {
  name_en: string;
  name_ar: string;
  is_active: boolean;
  fulfillment: AdvanceFulfillment[];
  made_to_order: MadeToOrderChoice;
  product_ids: string[];
  category_slugs: string[];
  kind: "percent" | "fixed";
  value: string;
  min: string;
  max: string;
  include_fee: boolean;
};

export const EMPTY_RULE_FORM: AdvanceRuleForm = {
  name_en: "",
  name_ar: "",
  is_active: true,
  fulfillment: [],
  made_to_order: "any",
  product_ids: [],
  category_slugs: [],
  kind: "percent",
  value: "",
  min: "",
  max: "",
  include_fee: false,
};

/** The row of advance_payment_rules this module reads and writes. */
export type AdvanceRuleRow = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  is_active: boolean;
  sort_order: number;
  fulfillment: string[];
  made_to_order: boolean | null;
  product_ids: string[];
  category_slugs: string[];
  amount_kind: string;
  amount_value: number | string;
  min_amount: number | string | null;
  max_amount: number | string | null;
  include_delivery_fee: boolean;
};

const textOf = (n: number | string | null) =>
  n === null || n === undefined ? "" : String(Number(n));

export function ruleFormFrom(row: AdvanceRuleRow): AdvanceRuleForm {
  return {
    name_en: row.name_en ?? "",
    name_ar: row.name_ar ?? "",
    is_active: row.is_active,
    fulfillment: row.fulfillment.filter((f): f is AdvanceFulfillment =>
      (ADVANCE_FULFILLMENTS as readonly string[]).includes(f),
    ),
    made_to_order: row.made_to_order === null ? "any" : row.made_to_order ? "only" : "not",
    product_ids: row.product_ids,
    category_slugs: row.category_slugs,
    kind: row.amount_kind === "fixed" ? "fixed" : "percent",
    value: textOf(row.amount_value),
    min: textOf(row.min_amount),
    max: textOf(row.max_amount),
    include_fee: row.include_delivery_fee,
  };
}

/** The rule as the engine reads it (for the preview and the checkout). */
export function ruleDefFromRow(row: AdvanceRuleRow): AdvanceRuleDef {
  return {
    id: row.id,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    fulfillment: row.fulfillment.filter((f): f is AdvanceFulfillment =>
      (ADVANCE_FULFILLMENTS as readonly string[]).includes(f),
    ),
    madeToOrder: row.made_to_order,
    productIds: row.product_ids,
    categorySlugs: row.category_slugs,
    kind: row.amount_kind === "fixed" ? "fixed" : "percent",
    value: Number(row.amount_value),
    min: row.min_amount === null ? null : Number(row.min_amount),
    max: row.max_amount === null ? null : Number(row.max_amount),
    includeFee: row.include_delivery_fee,
  };
}

const numberOrNull = (text: string): number | null | typeof Number.NaN => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
};

/** Why the form can't be saved, or null. */
export function ruleFormError(form: AdvanceRuleForm, isAr: boolean): string | null {
  const value = Number(form.value);
  if (form.value.trim() === "" || !Number.isFinite(value) || value <= 0) {
    return isAr ? "اكتب قيمة الدفعة." : "Enter what the rule asks.";
  }
  if (form.kind === "percent" && value > 100) {
    return isAr ? "النسبة لا تتجاوز 100%." : "A percentage can't be over 100%.";
  }
  const min = numberOrNull(form.min);
  const max = numberOrNull(form.max);
  if (
    Number.isNaN(min) ||
    Number.isNaN(max) ||
    (min !== null && min < 0) ||
    (max !== null && max <= 0)
  ) {
    return isAr
      ? "الحد الأدنى والأعلى أرقام موجبة."
      : "The least and the most are positive numbers.";
  }
  if (min !== null && max !== null && max < min) {
    return isAr ? "الحد الأعلى أقل من الأدنى." : "The most is below the least.";
  }
  return null;
}

/** The advance_payment_rules columns a form saves. */
export function ruleColumns(form: AdvanceRuleForm) {
  return {
    name_en: form.name_en.trim() || null,
    name_ar: form.name_ar.trim() || null,
    is_active: form.is_active,
    fulfillment: form.fulfillment,
    made_to_order: form.made_to_order === "any" ? null : form.made_to_order === "only",
    product_ids: form.product_ids,
    category_slugs: form.category_slugs,
    amount_kind: form.kind,
    amount_value: Number(form.value),
    min_amount: numberOrNull(form.min) as number | null,
    max_amount: numberOrNull(form.max) as number | null,
    include_delivery_fee: form.include_fee,
  };
}

/** The form as the engine reads it, for the preview. */
export function ruleDefFromForm(form: AdvanceRuleForm): AdvanceRuleDef {
  return {
    fulfillment: form.fulfillment,
    madeToOrder: form.made_to_order === "any" ? null : form.made_to_order === "only",
    productIds: form.product_ids,
    categorySlugs: form.category_slugs,
    kind: form.kind,
    value: Number(form.value) || 0,
    min: (numberOrNull(form.min) as number | null) ?? null,
    max: (numberOrNull(form.max) as number | null) ?? null,
    includeFee: form.include_fee,
  };
}

const FULFILLMENT_WORDS: Record<AdvanceFulfillment, { ar: string; en: string }> = {
  delivery: { ar: "التوصيل", en: "delivery" },
  pickup: { ar: "الاستلام من الفرع", en: "pickup" },
  digital: { ar: "التسليم الرقمي", en: "digital delivery" },
  appointment: { ar: "المواعيد", en: "appointments" },
};
export const fulfillmentWord = (f: AdvanceFulfillment, isAr: boolean) =>
  isAr ? FULFILLMENT_WORDS[f].ar : FULFILLMENT_WORDS[f].en;

/** What the rule asks, in words: "50% of the made-to-order items", "20 for Abaya"... */
export function describeRule(
  rule: AdvanceRuleDef,
  options: {
    isAr: boolean;
    money: (n: number) => string;
    productName: (id: string) => string;
    categoryName: (slug: string) => string;
  },
): string {
  const { isAr, money } = options;
  const what = [
    ...rule.productIds.map(options.productName),
    ...rule.categorySlugs.map(options.categoryName),
  ];
  const parts: string[] = [];
  parts.push(
    rule.kind === "percent"
      ? `${rule.value}%`
      : isAr
        ? `مبلغ ثابت ${money(rule.value)}`
        : `a fixed ${money(rule.value)}`,
  );
  if (rule.madeToOrder === true) parts.push(isAr ? "المنتجات حسب الطلب" : "made-to-order items");
  if (rule.madeToOrder === false) parts.push(isAr ? "المنتجات الجاهزة" : "ready-made items");
  if (what.length > 0) parts.push(what.join(isAr ? "، " : ", "));
  if (rule.fulfillment.length > 0) {
    parts.push(
      (isAr ? "عند " : "for ") +
        rule.fulfillment.map((f) => fulfillmentWord(f, isAr)).join(isAr ? " أو " : " or "),
    );
  }
  if (rule.min !== null)
    parts.push(isAr ? `بحد أدنى ${money(rule.min)}` : `at least ${money(rule.min)}`);
  if (rule.max !== null)
    parts.push(isAr ? `وحد أعلى ${money(rule.max)}` : `at most ${money(rule.max)}`);
  if (rule.includeFee) parts.push(isAr ? "مع رسوم التوصيل" : "with the delivery fee");
  return parts.join(" · ");
}

/** Quick starts the merchant can pick, then adjust. */
export const RULE_PRESETS: Array<{
  id: string;
  label: { ar: string; en: string };
  form: Partial<AdvanceRuleForm>;
}> = [
  {
    id: "made-to-order",
    label: { ar: "المنتجات حسب الطلب 50%", en: "Made-to-order items 50%" },
    form: { name_en: "Made to order", name_ar: "حسب الطلب", made_to_order: "only", value: "50" },
  },
  {
    id: "delivery",
    label: { ar: "التوصيل 30% مع الرسوم", en: "Delivery 30%, with the fee" },
    form: {
      name_en: "Delivery",
      name_ar: "التوصيل",
      fulfillment: ["delivery"],
      value: "30",
      include_fee: true,
    },
  },
  {
    id: "fixed",
    label: { ar: "مبلغ ثابت لمنتج", en: "A fixed amount for a product" },
    form: { name_en: "Fixed advance", name_ar: "دفعة ثابتة", kind: "fixed", value: "20" },
  },
];
