/**
 * A store's advance-payment rules, worked out in TypeScript: the same arithmetic as the
 * database's advance_rules_due (migration 20261003160000), which is what charges, approves and
 * refuses. This copy is for the checkout's preview and the settings screen, and
 * tests/advance-payment-parity.test.ts runs the two against each other.
 *
 * A rule reaches order lines by the way the order is fulfilled, whether a line is made to order,
 * chosen products and chosen categories (empty or null reaches everything), and asks a percentage
 * or a fixed amount with a least and a most; it may take the delivery fee too. Each line is
 * taken by the first rule that reaches it. A line's basis is its share of the order after
 * discounts and tax (the order without its delivery fee, spread over the lines by amount). The
 * delivery fee joins the first rule that asks for it and reached a line. A percentage is of the
 * rule's basis, rounded up to the fils (the whole basis at 100); a fixed amount is asked once
 * per rule and never above its basis. The advance is the sum, never above the order total.
 */

export type AdvanceFulfillment = "delivery" | "pickup" | "digital" | "appointment";
export const ADVANCE_FULFILLMENTS: readonly AdvanceFulfillment[] = [
  "delivery",
  "pickup",
  "digital",
  "appointment",
];

export type AdvanceRuleDef = {
  id?: string;
  nameEn?: string | null;
  nameAr?: string | null;
  /** Ways of fulfilling it reaches; empty reaches all. */
  fulfillment: readonly AdvanceFulfillment[];
  /** true only made-to-order lines, false only ready-made ones, null any. */
  madeToOrder: boolean | null;
  productIds: readonly string[];
  categorySlugs: readonly string[];
  kind: "percent" | "fixed";
  value: number;
  min: number | null;
  max: number | null;
  includeFee: boolean;
  /** The order's total must be at least / at most this (null: no limit). */
  minTotal: number | null;
  maxTotal: number | null;
  /** A new customer has no earlier order with the store; a returning one has. */
  customer: "any" | "new" | "returning";
  /** Where the order goes: the store's own country, or abroad (one of `countries`, if listed). */
  destination: "any" | "local" | "abroad";
  /** For abroad: only these countries (ISO codes); empty means any country abroad. */
  countries: readonly string[];
};

/** The store's own country: an order going anywhere else is going abroad. */
export const ADVANCE_HOME_COUNTRY = "BH";

export type AdvanceLine = {
  amount: number;
  madeToOrder: boolean;
  productId?: string | null;
  category?: string | null;
};

export type AdvanceOrder = {
  /** The order's total (lines after discounts, tax and delivery fee). */
  total: number;
  /** The delivery fee inside the total. */
  shipping: number;
  fulfillment: AdvanceFulfillment;
  lines: readonly AdvanceLine[];
  /** Whether the customer already has an order with the store (unknown counts as new). */
  returning?: boolean;
  /** The country a delivery goes to (ISO code); none, as for a pickup, counts as local. */
  country?: string | null;
};

const wholeFils = (n: number) => Math.round(n * 1e6) / 1e6;

/** A rule that reaches everything, for building the general rule. */
const everything = (over: Partial<AdvanceRuleDef>): AdvanceRuleDef => ({
  fulfillment: [],
  madeToOrder: null,
  productIds: [],
  categorySlugs: [],
  kind: "percent",
  value: 30,
  min: null,
  max: null,
  includeFee: false,
  minTotal: null,
  maxTotal: null,
  customer: "any",
  destination: "any",
  countries: [],
  ...over,
});

/** The store's general rule (a percentage and a scope) as rules: the database's advance_default_rules. */
export function defaultAdvanceRules(percent: number, scope: string): AdvanceRuleDef[] {
  switch (scope) {
    case "made_to_order":
      return [everything({ madeToOrder: true, value: percent })];
    case "delivery":
      return [everything({ fulfillment: ["delivery"], value: percent, includeFee: true })];
    case "made_to_order_or_delivery":
      return [
        everything({ fulfillment: ["delivery"], value: percent, includeFee: true }),
        everything({ madeToOrder: true, value: percent }),
      ];
    default:
      return [everything({ value: percent, includeFee: true })];
  }
}

const reachesDestination = (rule: AdvanceRuleDef, country: string | null | undefined): boolean => {
  if (rule.destination === "any") return true;
  const where = country || ADVANCE_HOME_COUNTRY;
  if (rule.destination === "local") return where === ADVANCE_HOME_COUNTRY;
  return (
    where !== ADVANCE_HOME_COUNTRY &&
    (rule.countries.length === 0 || rule.countries.includes(where))
  );
};

const reaches = (rule: AdvanceRuleDef, order: AdvanceOrder, line: AdvanceLine): boolean =>
  (rule.fulfillment.length === 0 || rule.fulfillment.includes(order.fulfillment)) &&
  (rule.minTotal === null || order.total >= rule.minTotal) &&
  (rule.maxTotal === null || order.total <= rule.maxTotal) &&
  (rule.customer === "any" || (rule.customer === "returning") === (order.returning === true)) &&
  reachesDestination(rule, order.country) &&
  (rule.madeToOrder === null || rule.madeToOrder === line.madeToOrder) &&
  (rule.productIds.length === 0 ||
    (line.productId != null && rule.productIds.includes(line.productId))) &&
  (rule.categorySlugs.length === 0 ||
    (line.category != null && rule.categorySlugs.includes(line.category)));

export type AdvancePart = { rule: AdvanceRuleDef; basis: number; amount: number };

/** What each rule asks of the order, in the rules' order (rules that reach nothing are left out). */
export function advanceParts(order: AdvanceOrder, rules: readonly AdvanceRuleDef[]): AdvancePart[] {
  const total = Number(order.total) || 0;
  if (rules.length === 0 || total <= 0) return [];
  const shipping = Number(order.shipping) || 0;
  const linesSum = order.lines.reduce((sum, line) => sum + line.amount, 0);
  const items = Math.max(total - shipping, 0);
  const basis = rules.map(() => 0);
  const hit = rules.map(() => false);
  for (const line of order.lines) {
    const index = rules.findIndex((rule) => reaches(rule, order, line));
    if (index < 0) continue;
    hit[index] = true;
    if (linesSum > 0) basis[index] += (items * line.amount) / linesSum;
  }
  if (shipping > 0) {
    const index = rules.findIndex((rule, i) => hit[i] && rule.includeFee);
    if (index >= 0) basis[index] += shipping;
  }
  const parts: AdvancePart[] = [];
  rules.forEach((rule, i) => {
    const b = wholeFils(basis[i]);
    if (b <= 0) return;
    let amount: number;
    if (rule.kind === "fixed") amount = Math.min(rule.value, b);
    else if (rule.value >= 100) amount = Math.round(b * 1000) / 1000;
    else amount = Math.ceil(wholeFils(b * rule.value * 10 - 1e-9)) / 1000;
    if (rule.min !== null) amount = Math.max(amount, Math.min(rule.min, b));
    if (rule.max !== null) amount = Math.min(amount, rule.max);
    parts.push({ rule, basis: b, amount });
  });
  return parts;
}

/** What the order owes in advance under these rules, or null when nothing is asked of it. */
export function advanceRulesDue(
  order: AdvanceOrder,
  rules: readonly AdvanceRuleDef[],
): number | null {
  const sum = advanceParts(order, rules).reduce((total, part) => total + part.amount, 0);
  if (sum <= 0) return null;
  return Math.min(Number(order.total) || 0, Math.round(sum * 1e6) / 1e6);
}

// ── The snapshot's JSON (what the database keeps on an order and rebuilds from a store's rules) ──

type RuleJson = {
  id?: string;
  fulfillment?: string[] | null;
  made_to_order?: boolean | null;
  product_ids?: string[] | null;
  category_slugs?: string[] | null;
  kind?: string | null;
  value: number | string;
  min?: number | string | null;
  max?: number | string | null;
  include_fee?: boolean | null;
  min_total?: number | string | null;
  max_total?: number | string | null;
  customer?: string | null;
  destination?: string | null;
  countries?: string[] | null;
};

/** A rule as the database's JSON (keys as advance_rules_for_brand writes them). */
export function advanceRuleToJson(rule: AdvanceRuleDef): RuleJson {
  return {
    ...(rule.id ? { id: rule.id } : {}),
    fulfillment: [...rule.fulfillment],
    made_to_order: rule.madeToOrder,
    product_ids: [...rule.productIds],
    category_slugs: [...rule.categorySlugs],
    kind: rule.kind,
    value: rule.value,
    min: rule.min,
    max: rule.max,
    include_fee: rule.includeFee,
    min_total: rule.minTotal,
    max_total: rule.maxTotal,
    customer: rule.customer,
    destination: rule.destination,
    countries: [...rule.countries],
  };
}

const asNumberOrNull = (value: unknown) =>
  value === null || value === undefined || value === "" ? null : Number(value);

/** A rule from the database's JSON, tolerating the keys a general rule leaves out. */
export function advanceRuleFromJson(json: RuleJson): AdvanceRuleDef {
  return {
    id: json.id,
    fulfillment: (json.fulfillment ?? []) as AdvanceFulfillment[],
    madeToOrder: json.made_to_order ?? null,
    productIds: json.product_ids ?? [],
    categorySlugs: json.category_slugs ?? [],
    kind: json.kind === "fixed" ? "fixed" : "percent",
    value: Number(json.value),
    min: asNumberOrNull(json.min),
    max: asNumberOrNull(json.max),
    includeFee: json.include_fee === true,
    minTotal: asNumberOrNull(json.min_total),
    maxTotal: asNumberOrNull(json.max_total),
    customer: json.customer === "new" || json.customer === "returning" ? json.customer : "any",
    destination:
      json.destination === "local" || json.destination === "abroad" ? json.destination : "any",
    countries: json.countries ?? [],
  };
}
