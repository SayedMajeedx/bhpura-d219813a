import { arNoun } from "@/lib/arabic-count";
/**
 * Booking-time discounts (booking_discount_rules; migration 20261002100000).
 * The database applies them when a booking is made (apply_booking_discount);
 * this is the same rule in TypeScript, so the storefront can show the saving
 * before the customer commits and the admin can describe each rule.
 * tests/booking-discounts.test.ts runs both against each other.
 */

export type DiscountKind = "percent" | "fixed";

export type DiscountRule = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  kind: DiscountKind;
  value: number;
  /** Days between the booking and the event: from... */
  min_days: number;
  /** ...to (null: no upper limit). */
  max_days: number | null;
  /** Event weekdays, Sunday = 0 (null or empty: every day). */
  weekdays: number[] | null;
  /** Services it covers (null or empty: all of them). */
  product_ids: string[] | null;
  /** The dates the offer can be booked on (null: always). */
  valid_from: string | null;
  valid_to: string | null;
  /** Only when the booking has one of these services (null or empty: no condition). */
  requires_product_ids?: string[] | null;
  /** Adds to the best offer instead of competing with it. */
  stackable?: boolean;
  /** The event dates it covers (null: every date). */
  event_from?: string | null;
  event_to?: string | null;
};

/** What a booking is made of, for pricing a discount. */
export type DiscountLine = { product_id: string | null; line_total: number };

const DAY_MS = 86_400_000;

/** Whole days from `today` to `day` (ISO dates). */
export function leadDays(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

/** Sunday = 0, as the database counts. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function applicableTotal(rule: DiscountRule, lines: readonly DiscountLine[]): number {
  const all = !rule.product_ids || rule.product_ids.length === 0;
  return round3(
    lines
      .filter(
        (line) => all || (line.product_id !== null && rule.product_ids!.includes(line.product_id)),
      )
      .reduce((sum, line) => sum + line.line_total, 0),
  );
}

/** What a rule takes off these lines (before checking the day): percent or a fixed sum, never more than the lines. */
export function ruleAmount(rule: DiscountRule, lines: readonly DiscountLine[]): number {
  const applicable = applicableTotal(rule, lines);
  return rule.kind === "percent"
    ? round3((applicable * rule.value) / 100)
    : round3(Math.min(rule.value, applicable));
}

/** Whether a rule is open for a booking made `today` for `day`. */
export function ruleApplies(rule: DiscountRule, day: string, today: string): boolean {
  const lead = leadDays(day, today);
  if (lead < rule.min_days) return false;
  if (rule.max_days !== null && lead > rule.max_days) return false;
  if (rule.weekdays && rule.weekdays.length > 0 && !rule.weekdays.includes(weekdayOf(day))) {
    return false;
  }
  if (rule.valid_from && today < rule.valid_from) return false;
  if (rule.valid_to && today > rule.valid_to) return false;
  if (rule.event_from && day < rule.event_from) return false;
  if (rule.event_to && day > rule.event_to) return false;
  return true;
}

/** Whether the booking has a service the rule asks for ("needs another service"). */
export function ruleRequirementMet(
  rule: DiscountRule,
  lines: readonly DiscountLine[],
  included: readonly string[] = [],
): boolean {
  const required = rule.requires_product_ids;
  if (!required || required.length === 0) return true;
  // A chosen package's own services count, as the database counts every line of the booking: a
  // package with a photo booth meets "with a photo booth".
  return (
    lines.some((line) => line.product_id !== null && required.includes(line.product_id)) ||
    included.some((id) => required.includes(id))
  );
}

/** A free gift: all of a service, for chosen event dates. */
export function isGiftRule(rule: Pick<DiscountRule, "kind" | "value">): boolean {
  return rule.kind === "percent" && rule.value >= 100;
}

/** What a booking gets: the rule that leads, every rule that applies, and the sum (never more than the service lines). */
export type DiscountResult = { rule: DiscountRule; rules: DiscountRule[]; amount: number };

/**
 * The discount for a booking, as the database gives it (apply_booking_discount):
 * the best non-stackable rule (ties: the longer lead, then the order given)
 * plus every stackable one that applies, capped at the service lines. Pass
 * service lines only: an offer never takes anything off an add-on. `included`
 * is the services inside the chosen packages (they cost nothing of their own,
 * but meet a rule that needs another service).
 */
export function bestDiscount(
  rules: readonly DiscountRule[],
  booking: {
    day: string;
    today: string;
    lines: readonly DiscountLine[];
    included?: readonly string[];
  },
): DiscountResult | null {
  const matched: Array<{ rule: DiscountRule; amount: number }> = [];
  for (const rule of rules) {
    if (!ruleApplies(rule, booking.day, booking.today)) continue;
    if (!ruleRequirementMet(rule, booking.lines, booking.included)) continue;
    const amount = ruleAmount(rule, booking.lines);
    if (amount > 0) matched.push({ rule, amount });
  }
  let best: { rule: DiscountRule; amount: number } | null = null;
  for (const entry of matched) {
    if (entry.rule.stackable) continue;
    if (
      !best ||
      entry.amount > best.amount ||
      (entry.amount === best.amount && entry.rule.min_days > best.rule.min_days)
    ) {
      best = entry;
    }
  }
  const picked = [
    ...(best ? [best] : []),
    ...matched.filter((entry) => entry.rule.stackable).sort((a, b) => b.amount - a.amount),
  ];
  if (picked.length === 0) return null;
  const total = round3(picked.reduce((sum, entry) => sum + entry.amount, 0));
  const services = round3(booking.lines.reduce((sum, line) => sum + line.line_total, 0));
  return {
    rule: picked[0].rule,
    rules: picked.map((entry) => entry.rule),
    amount: Math.min(total, services),
  };
}

/** The customer's name for a rule ("Last-minute offer"), or a plain description when it has none. */
export function discountName(rule: DiscountRule, isAr: boolean): string {
  const name = isAr ? rule.name_ar || rule.name_en : rule.name_en || rule.name_ar;
  return name?.trim() || describeDiscountRule(rule, isAr);
}

/** The names of every offer a booking gets, joined as the database stores them ("A + B"). */
export function discountLabel(result: Pick<DiscountResult, "rules">, isAr: boolean): string {
  return result.rules.map((rule) => discountName(rule, isAr)).join(" + ");
}

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** The value: "25%" or "5". */
export function discountValueText(rule: Pick<DiscountRule, "kind" | "value">): string {
  return rule.kind === "percent" ? `${rule.value}%` : String(rule.value);
}

function daysText(days: number, isAr: boolean): string {
  if (isAr) return days === 1 ? "يوم" : days === 2 ? "يومين" : `${arNoun(days, "day")}`;
  return days === 1 ? "1 day" : `${days} days`;
}

/** When a rule applies, in words: "within 7 days", "7 to 14 days ahead", "30+ days ahead". */
export function discountWindowText(
  rule: Pick<DiscountRule, "min_days" | "max_days">,
  isAr: boolean,
): string {
  const { min_days: min, max_days: max } = rule;
  if (max === null) {
    return min === 0
      ? isAr
        ? "أي وقت"
        : "any time"
      : isAr
        ? `قبل ${daysText(min, true)} أو أكثر`
        : `${min}+ days ahead`;
  }
  if (min === 0) {
    return max === 0
      ? isAr
        ? "في يوم الحدث نفسه"
        : "on the day itself"
      : isAr
        ? `خلال ${daysText(max, true)}`
        : `within ${daysText(max, false)}`;
  }
  return isAr ? `قبل ${min} إلى ${daysText(max, true)}` : `${min} to ${max} days ahead`;
}

/**
 * What a rule's words may name: a service by its id, and an amount in the store's money. Without
 * them a rule reads as before ("with a chosen service", "5 off").
 */
export type RuleWords = {
  name?: (productId: string) => string | null | undefined;
  money?: (amount: number) => string;
};

/** "Photo booth, Video booth or Memory phone" (four or more: "4 services"). */
function servicesText(
  ids: readonly string[],
  isAr: boolean,
  name: RuleWords["name"],
  joiner: "and" | "or",
): string | null {
  const names = ids.map((id) => name?.(id)?.trim()).filter((text): text is string => !!text);
  if (names.length === 0 || names.length !== ids.length) return null;
  if (names.length > 3) return isAr ? arNoun(names.length, "service") : `${names.length} services`;
  if (names.length === 1) return names[0];
  const last = names[names.length - 1];
  const word = isAr ? (joiner === "and" ? " و" : " أو ") : joiner === "and" ? " and " : " or ";
  return `${names.slice(0, -1).join(isAr ? "، " : ", ")}${word}${last}`;
}

/**
 * One line for the merchant or the customer: "25% off · within 1 day · Sun, Mon". With `words`,
 * it says what an offer is for and what it needs ("on the photo booth", "when booked with a video
 * booth"): a shopper read "25% off within 14 days" and expected it on a package it did not reach.
 */
export function describeDiscountRule(
  rule: DiscountRule,
  isAr: boolean,
  words: RuleWords = {},
): string {
  const value =
    rule.kind === "fixed" && words.money ? words.money(rule.value) : discountValueText(rule);
  const parts = [isAr ? `خصم ${value}` : `${value} off`];
  const on = rule.product_ids?.length
    ? servicesText(rule.product_ids, isAr, words.name, "and")
    : null;
  if (on) parts[0] += isAr ? ` على ${on}` : ` ${on}`;
  parts.push(discountWindowText(rule, isAr));
  if (rule.weekdays && rule.weekdays.length > 0 && rule.weekdays.length < 7) {
    parts.push(
      [...rule.weekdays]
        .sort((a, b) => a - b)
        .map((day) => (isAr ? WEEKDAYS_AR[day] : WEEKDAYS_EN[day]))
        .join(isAr ? "، " : ", "),
    );
  }
  if (rule.event_from || rule.event_to) {
    const from = rule.event_from ?? "";
    const to = rule.event_to ?? "";
    parts.push(
      from && to && from !== to
        ? isAr
          ? `للمواعيد من ${from} إلى ${to}`
          : `for dates ${from} to ${to}`
        : isAr
          ? `لموعد ${from || to}`
          : `for ${from || to}`,
    );
  }
  if (rule.requires_product_ids && rule.requires_product_ids.length > 0) {
    const needs = servicesText(rule.requires_product_ids, isAr, words.name, "or");
    parts.push(
      needs
        ? isAr
          ? `عند الحجز مع ${needs}`
          : `when booked with ${needs}`
        : isAr
          ? "مع خدمة محددة"
          : "with a chosen service",
    );
  }
  if (rule.stackable) parts.push(isAr ? "يضاف إلى العروض الأخرى" : "adds to other offers");
  return parts.join(" · ");
}

/**
 * The store's offers a shopper is told about before booking: those that reach a service (or any
 * service, with none named) and can be booked `today` (on the store's clock): started, not
 * ended, for event dates still to come. The booking calendar marks the days; a service's page and
 * the services home once said nothing of them.
 */
export function offersToShow(
  rules: readonly DiscountRule[],
  today: string,
  productId: string | null = null,
): DiscountRule[] {
  return rules.filter(
    (rule) =>
      (productId === null ||
        !rule.product_ids ||
        rule.product_ids.length === 0 ||
        rule.product_ids.includes(productId)) &&
      !(rule.valid_from && today < rule.valid_from) &&
      !(rule.valid_to && today > rule.valid_to) &&
      !(rule.event_to && today > rule.event_to),
  );
}

/** One offer as a shopper reads it: its name, then its terms ("خصم 25% · خلال 14 يوماً"). */
export function offerLine(rule: DiscountRule, isAr: boolean, words: RuleWords = {}): string {
  const name = (isAr ? rule.name_ar || rule.name_en : rule.name_en || rule.name_ar)?.trim();
  const terms = describeDiscountRule(rule, isAr, words);
  return name ? `${name}: ${terms}` : terms;
}

// ── The merchant's rule form ────────────────────────────────────────────────

/** A rule as its form holds it: numbers as the text of their inputs. */
export type DiscountRuleForm = {
  name_en: string;
  name_ar: string;
  kind: DiscountKind;
  value: string;
  min_days: string;
  max_days: string;
  weekdays: number[];
  product_ids: string[];
  valid_from: string;
  valid_to: string;
  requires_product_ids: string[];
  stackable: boolean;
  event_from: string;
  event_to: string;
  is_active: boolean;
};

export const EMPTY_DISCOUNT_FORM: DiscountRuleForm = {
  name_en: "",
  name_ar: "",
  kind: "percent",
  value: "",
  min_days: "0",
  max_days: "",
  weekdays: [],
  product_ids: [],
  valid_from: "",
  valid_to: "",
  requires_product_ids: [],
  stackable: false,
  event_from: "",
  event_to: "",
  is_active: true,
};

/** Quick starts the merchant can pick, then adjust. */
export const DISCOUNT_PRESETS: Array<{
  id: string;
  label: { ar: string; en: string };
  form: Partial<DiscountRuleForm>;
}> = [
  {
    id: "tomorrow",
    label: { ar: "حجز اللحظة الأخيرة (غداً)", en: "Last minute (within 1 day)" },
    form: {
      name_en: "Last-minute offer",
      name_ar: "عرض اللحظة الأخيرة",
      value: "25",
      min_days: "0",
      max_days: "1",
    },
  },
  {
    id: "week",
    label: { ar: "خلال أسبوع", en: "Within a week" },
    form: {
      name_en: "This week's offer",
      name_ar: "عرض هذا الأسبوع",
      value: "10",
      min_days: "2",
      max_days: "7",
    },
  },
  {
    id: "early",
    label: { ar: "حجز مبكر (٣٠ يوماً أو أكثر)", en: "Early bird (30+ days ahead)" },
    form: {
      name_en: "Early-bird offer",
      name_ar: "عرض الحجز المبكر",
      value: "15",
      min_days: "30",
      max_days: "",
    },
  },
  {
    id: "gift",
    label: { ar: "هدية مجانية في تواريخ محددة", en: "Free gift on chosen dates" },
    form: {
      name_en: "Free gift",
      name_ar: "هدية مجانية",
      value: "100",
      min_days: "0",
      max_days: "",
      stackable: true,
    },
  },
];

export function discountFormFrom(rule: DiscountRule & { is_active?: boolean }): DiscountRuleForm {
  return {
    name_en: rule.name_en ?? "",
    name_ar: rule.name_ar ?? "",
    kind: rule.kind,
    value: String(rule.value),
    min_days: String(rule.min_days),
    max_days: rule.max_days === null ? "" : String(rule.max_days),
    weekdays: rule.weekdays ?? [],
    product_ids: rule.product_ids ?? [],
    valid_from: rule.valid_from ?? "",
    valid_to: rule.valid_to ?? "",
    requires_product_ids: rule.requires_product_ids ?? [],
    stackable: rule.stackable ?? false,
    event_from: rule.event_from ?? "",
    event_to: rule.event_to ?? "",
    is_active: rule.is_active ?? true,
  };
}

const wholeDays = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : Number.NaN;
};

/** Why the form can't be saved, or null. */
export function discountFormError(form: DiscountRuleForm, isAr: boolean): string | null {
  const value = Number(form.value);
  if (form.value.trim() === "" || !Number.isFinite(value) || value <= 0) {
    return isAr ? "اكتب قيمة الخصم." : "Enter the discount.";
  }
  if (form.kind === "percent" && value > 100) {
    return isAr ? "النسبة لا تتجاوز 100%." : "A percentage can't be over 100%.";
  }
  const min = wholeDays(form.min_days) ?? 0;
  const max = wholeDays(form.max_days);
  if (
    Number.isNaN(min) ||
    min < 0 ||
    min > 730 ||
    (max !== null && (Number.isNaN(max) || max > 730))
  ) {
    return isAr ? "الأيام أرقام صحيحة من 0 إلى 730." : "Days are whole numbers from 0 to 730.";
  }
  if (max !== null && max < min) {
    return isAr ? "آخر يوم يجب أن يكون بعد أول يوم." : "The last day must not be before the first.";
  }
  if (form.valid_from && form.valid_to && form.valid_to < form.valid_from) {
    return isAr ? "تاريخ النهاية قبل البداية." : "The end date is before the start.";
  }
  if (form.event_from && form.event_to && form.event_to < form.event_from) {
    return isAr ? "نهاية تواريخ الموعد قبل بدايتها." : "The booking dates end before they start.";
  }
  return null;
}

/** The booking_discount_rules columns a form saves. */
export function discountFormColumns(form: DiscountRuleForm) {
  return {
    name_en: form.name_en.trim() || null,
    name_ar: form.name_ar.trim() || null,
    kind: form.kind,
    value: Number(form.value),
    min_days: wholeDays(form.min_days) ?? 0,
    max_days: wholeDays(form.max_days),
    weekdays: form.weekdays.length > 0 && form.weekdays.length < 7 ? form.weekdays : null,
    product_ids: form.product_ids.length > 0 ? form.product_ids : null,
    valid_from: form.valid_from || null,
    valid_to: form.valid_to || null,
    requires_product_ids: form.requires_product_ids.length > 0 ? form.requires_product_ids : null,
    stackable: form.stackable,
    event_from: form.event_from || null,
    event_to: form.event_to || null,
    is_active: form.is_active,
  };
}

/**
 * The offer to show on a day before any service is chosen: the best rule that
 * covers every service and asks for no other service, priced on a reference
 * total. A free gift for those dates shows too, whichever service it is for
 * (a rule limited to some services otherwise shows once services are chosen,
 * through bestDiscount).
 */
export function dayOffer(
  rules: readonly DiscountRule[],
  day: string,
  today: string,
  referenceTotal = 100,
): DiscountResult | null {
  const general = rules.filter(
    (rule) =>
      (!rule.product_ids || rule.product_ids.length === 0) &&
      (!rule.requires_product_ids || rule.requires_product_ids.length === 0),
  );
  const found = bestDiscount(general, {
    day,
    today,
    lines: [{ product_id: null, line_total: referenceTotal }],
  });
  if (found) return found;
  const gift = rules.find(
    (rule) =>
      isGiftRule(rule) && (rule.event_from || rule.event_to) && ruleApplies(rule, day, today),
  );
  return gift ? { rule: gift, rules: [gift], amount: referenceTotal } : null;
}

/** A calendar day's mark: its text, the share of the booking it saves (null: not a share), a gift. */
export type DayMark = { text: string; percent: number | null; gift: boolean };

/**
 * What a day saves, as its calendar mark. With services chosen it is the share of their total the
 * day's offer takes off ("−17%"), never the rule's own percentage: a rule that halves one of two
 * services saves 17%, and the mark read "−50%" over a total that was 17% lower. Before any is
 * chosen, the rule's own value (a percentage, or an amount in the store's money). A free gift is
 * "🎁". Null when the day saves nothing.
 */
export function dayMark(
  offer: { amount: number; rule: Pick<DiscountRule, "kind" | "value"> | null } | null,
  servicesTotal: number | null,
  money: (amount: number) => string,
): DayMark | null {
  if (!offer || !(offer.amount > 0)) return null;
  if (offer.rule && isGiftRule(offer.rule)) return { text: "🎁", percent: null, gift: true };
  if (servicesTotal !== null && servicesTotal > 0) {
    const percent = Math.max(1, Math.round((offer.amount / servicesTotal) * 100));
    return { text: `−${percent}%`, percent, gift: false };
  }
  if (!offer.rule) return null;
  return offer.rule.kind === "percent"
    ? { text: `−${offer.rule.value}%`, percent: offer.rule.value, gift: false }
    : { text: `−${money(offer.rule.value)}`, percent: null, gift: false };
}

/**
 * The calendar's legend, said of the marks it shows (null: none): "up to 17% off · 🎁 free gift".
 * It once took the highest percentage of every offer the store has, so a month of "−25%" read
 * "up to 50% off" from an offer on one service booked with another.
 */
export function marksLegend(marks: readonly (DayMark | null)[], isAr: boolean): string | null {
  const shown = marks.filter((mark): mark is DayMark => mark !== null);
  if (shown.length === 0) return null;
  const top = Math.max(0, ...shown.map((mark) => mark.percent ?? 0));
  const gift = shown.some((mark) => mark.gift);
  const amounts = shown.some((mark) => !mark.gift && mark.percent === null);
  const parts = [
    top > 0
      ? isAr
        ? `خصم حتى ${top}% على الأيام المعلّمة`
        : `up to ${top}% off on the marked days`
      : amounts
        ? isAr
          ? "خصم على الأيام المعلّمة"
          : "a discount on the marked days"
        : null,
    gift ? (isAr ? "🎁 هدية مجانية" : "🎁 free gift") : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
