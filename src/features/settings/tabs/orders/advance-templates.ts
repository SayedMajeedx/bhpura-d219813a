import { verticalLineage } from "@/lib/verticals/registry";
import type { StoreVertical } from "@/lib/store-profile";
import { EMPTY_RULE_FORM, type AdvanceRuleForm } from "@/lib/payments/advance-rule-form";

/**
 * Ready-made sets of advance rules, offered by the kind of store. Each is a starting point the
 * merchant can adjust afterwards: its rules are saved as ordinary rules of the store. Which
 * ones fit a vertical follows the vertical's lineage (a child store gets its parent's too).
 */

export type AdvanceTemplate = {
  id: string;
  title: { ar: string; en: string };
  summary: { ar: string; en: string };
  /** Verticals it suits (a vertical's parents count); "all" suits every store that ships goods. */
  verticals: readonly string[] | "all";
  /** The rules, most specific first; `scale` carries amounts to the store's currency. */
  rules: (scale: number) => Array<Partial<AdvanceRuleForm>>;
};

/** Stores that only deliver files have nothing to hold an order for. */
const NO_TEMPLATES: readonly string[] = ["digital"];

/** One BHD-sized unit in the store's currency (the amounts below are written in BHD). */
const CURRENCY_SCALE: Record<string, number> = {
  BHD: 1,
  KWD: 0.8,
  OMR: 1,
  JOD: 1.9,
  SAR: 10,
  AED: 10,
  QAR: 10,
  USD: 2.6,
  EUR: 2.4,
};

/** Rounds to a figure a merchant would write: a multiple of 5 once it is large. */
const round = (value: number) =>
  value >= 20 ? Math.round(value / 5) * 5 : Math.max(1, Math.round(value));

export const currencyScale = (currency: string | null | undefined): number =>
  CURRENCY_SCALE[String(currency ?? "").toUpperCase()] ?? 1;

export const ADVANCE_TEMPLATES: readonly AdvanceTemplate[] = [
  {
    id: "made-to-order-deposit",
    title: { ar: "عربون للمنتجات حسب الطلب", en: "A deposit on made-to-order items" },
    summary: {
      ar: "ما يُصنع خصيصاً للعميل يطلب نصف المبلغ مقدماً، والجاهز يتبع القاعدة العامة.",
      en: "Items made for the customer ask half up front; ready-made ones follow your general rule.",
    },
    verticals: ["fashion", "print", "food", "gifts", "home"],
    rules: () => [
      { name_en: "Made to order", name_ar: "حسب الطلب", made_to_order: "only", value: "50" },
    ],
  },
  {
    id: "big-orders",
    title: { ar: "الطلبات الكبيرة", en: "Big orders" },
    summary: {
      ar: "الطلب الكبير يطلب نصف المبلغ مقدماً قبل أن تبدأ بتجهيزه.",
      en: "A big order asks half up front before you start on it.",
    },
    verticals: ["food", "gifts", "print", "home", "general"],
    rules: (scale) => [
      {
        name_en: "Big orders",
        name_ar: "الطلبات الكبيرة",
        min_total: String(round(50 * scale)),
        value: "50",
      },
    ],
  },
  {
    id: "high-value",
    title: { ar: "الطلبات الغالية", en: "High-value orders" },
    summary: {
      ar: "الطلب الغالي يطلب ٣٠٪ مقدماً.",
      en: "A high-value order asks 30% up front.",
    },
    verticals: ["jewelry", "electronics", "beauty", "fashion"],
    rules: (scale) => [
      {
        name_en: "High-value orders",
        name_ar: "الطلبات الغالية",
        min_total: String(round(100 * scale)),
        value: "30",
      },
    ],
  },
  {
    id: "new-buyers-delivery",
    title: { ar: "عميل جديد بالتوصيل", en: "First-time customers, delivered" },
    summary: {
      ar: "العميل الجديد الذي يطلب توصيلاً يدفع ٣٠٪ مع رسوم التوصيل، لتقل الطلبات التي لا تُستلم.",
      en: "A first-time customer ordering delivery pays 30% with the delivery fee, so fewer orders go unclaimed.",
    },
    verticals: "all",
    rules: () => [
      {
        name_en: "New customers, delivery",
        name_ar: "عميل جديد بالتوصيل",
        customer: "new",
        fulfillment: ["delivery"],
        value: "30",
        include_fee: true,
      },
    ],
  },
  {
    id: "loyal-customers",
    title: { ar: "مكافأة العملاء السابقين", en: "Reward returning customers" },
    summary: {
      ar: "من سبق أن اشترى منك يدفع ١٠٪ فقط مقدماً.",
      en: "Someone who has bought from you before pays only 10% up front.",
    },
    verticals: "all",
    rules: () => [
      {
        name_en: "Returning customers",
        name_ar: "العملاء السابقون",
        customer: "returning",
        value: "10",
      },
    ],
  },
];

/** The templates that suit a store of this vertical, in the order above. */
export function templatesFor(vertical: string | null | undefined): AdvanceTemplate[] {
  const id = (vertical || "general") as StoreVertical;
  if (NO_TEMPLATES.includes(id)) return [];
  const lineage: readonly string[] = verticalLineage(id);
  return ADVANCE_TEMPLATES.filter(
    (template) =>
      template.verticals === "all" || template.verticals.some((v) => lineage.includes(v)),
  );
}

/** A template's rules as complete forms, with the amounts in the store's currency. */
export function templateForms(template: AdvanceTemplate, currency: string): AdvanceRuleForm[] {
  const scale = currencyScale(currency);
  return template.rules(scale).map((rule) => ({ ...EMPTY_RULE_FORM, ...rule }));
}
