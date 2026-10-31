import type { StatementLine } from "./statement";
import { COUNT_FORMAT, moneyFormat, type XCell, type XSheet } from "./workbook";

/**
 * Gift cards in the reports (step three of docs/gift-cards-plan.md): a card sold is money the
 * store holds until it is spent, not a sale (the owner's decision, 2026-10-31). The sale is
 * counted when a card pays an order, at its full price and VAT, so the statement's sales already
 * hold it; these lines say what came in on cards and what the store still owes on them.
 *
 * Read from the cards' own ledger by `rpc_reporting_gift_cards` (migration 20261103100000): per
 * period what was sold (and how it was paid) and given, what was spent net of what released
 * orders gave back, what was written off, and what the cards held at the period's end; and, as
 * of now, what active cards hold.
 */

export type GiftCardPeriod = {
  sold: number;
  soldCount: number;
  soldCash: number;
  soldCard: number;
  soldTransfer: number;
  given: number;
  spent: number;
  writtenOff: number;
  heldAtEnd: number;
};

export type GiftCardReport = {
  periods: GiftCardPeriod[];
  now: { held: number; heldCards: number; heldExpired: number };
};

const num = (value: unknown) => Number(value ?? 0) || 0;
const fils = (value: number) => Math.round(value * 1000) / 1000;

export function readGiftCardReport(raw: unknown): GiftCardReport {
  const data = (raw ?? {}) as { periods?: unknown; now?: Record<string, unknown> };
  const periods = Array.isArray(data.periods) ? (data.periods as Record<string, unknown>[]) : [];
  const now = data.now ?? {};
  return {
    periods: periods.map((p) => ({
      sold: num(p.sold),
      soldCount: num(p.sold_count),
      soldCash: num(p.sold_cash),
      soldCard: num(p.sold_card),
      soldTransfer: num(p.sold_transfer),
      given: num(p.given),
      spent: num(p.spent),
      writtenOff: num(p.written_off),
      heldAtEnd: num(p.held_at_end),
    })),
    now: {
      held: num(now.held),
      heldCards: num(now.held_cards),
      heldExpired: num(now.held_expired),
    },
  };
}

/** Whether a store has ever had a card in these periods (no section otherwise). */
export function hasGiftCards(periods: readonly GiftCardPeriod[]): boolean {
  return periods.some(
    (p) => p.sold || p.given || p.spent || p.writtenOff || Math.abs(p.heldAtEnd) > 0.0005,
  );
}

type Spec = {
  key: string;
  label: { ar: string; en: string };
  value: (p: GiftCardPeriod) => number;
  /** A balance, not a flow: its total is the last period's, not the sum. */
  balance?: boolean;
  optional?: boolean;
};

/** The month pack's sheet name (`PACK_SHEETS.giftCards`, which the read-me lists). */
const GIFT_CARD_SHEET = { en: "Gift cards", ar: "بطاقات الهدايا" };

export const GIFT_CARD_SECTION = {
  en: "Gift cards (money held, not sales)",
  ar: "بطاقات الهدايا (مال محفوظ، لا مبيعات)",
};

const SPECS: Spec[] = [
  {
    key: "gift_cards_sold",
    label: { en: "Sold (money received)", ar: "المبيعة (مبالغ مستلمة)" },
    value: (p) => p.sold,
  },
  {
    key: "gift_cards_given",
    label: { en: "Given by the store", ar: "مقدّمة من المتجر" },
    value: (p) => p.given,
    optional: true,
  },
  {
    key: "gift_cards_spent",
    label: { en: "Spent on orders (counted in sales)", ar: "المستخدمة في طلبات (ضمن المبيعات)" },
    value: (p) => p.spent,
  },
  {
    key: "gift_cards_written_off",
    label: { en: "Written off (voided)", ar: "المشطوبة (ملغاة)" },
    value: (p) => p.writtenOff,
    optional: true,
  },
  {
    key: "gift_cards_held",
    label: { en: "Held on cards at the month's end", ar: "المحفوظ في البطاقات آخر الشهر" },
    value: (p) => p.heldAtEnd,
    balance: true,
  },
];

const totalOf = (spec: Spec, periods: readonly GiftCardPeriod[]) =>
  spec.balance
    ? periods.at(-1)
      ? spec.value(periods.at(-1)!)
      : 0
    : fils(periods.reduce((sum, p) => sum + spec.value(p), 0));

/**
 * The statement's gift card lines for these months and, when given, the same months a year
 * earlier. None for a store that never had a card.
 */
export function giftCardStatementLines(
  current: readonly GiftCardPeriod[],
  prior?: readonly GiftCardPeriod[] | null,
): StatementLine[] {
  if (!hasGiftCards([...current, ...(prior ?? [])])) return [];
  return SPECS.flatMap((spec) => {
    const values = current.map(spec.value);
    const priorValues = prior ? prior.map(spec.value) : [];
    if (spec.optional && ![...values, ...priorValues].some((v) => Math.abs(v) > 0.0005)) return [];
    const total = totalOf(spec, current);
    const priorTotal = prior ? totalOf(spec, prior) : null;
    return [
      {
        key: spec.key,
        kind: "memo" as const,
        label: spec.label,
        values,
        total,
        prior: priorTotal,
        change:
          priorTotal === null || priorTotal === 0
            ? null
            : ((total - priorTotal) / Math.abs(priorTotal)) * 100,
        section: "gift_cards" as const,
      },
    ];
  });
}

const PAID_WITH = [
  { key: "soldCash", en: "of which cash", ar: "منها نقدًا" },
  { key: "soldCard", en: "of which card machine", ar: "منها بجهاز البطاقات" },
  { key: "soldTransfer", en: "of which transfer", ar: "منها تحويل" },
] as const;

/**
 * The month pack's gift card sheet: the month beside the month before and a year earlier, how
 * the cards sold were paid (what the cash box and the bank should show), and what active cards
 * hold today.
 */
export function giftCardSheet(input: {
  report: GiftCardReport;
  /** The month, the month before and the same month a year earlier, as headed. */
  labels: [string, string, string];
  currency: string;
  digits: number;
  lang: "ar" | "en";
  storeName: string;
  timeZone: string;
  today: string;
}): XSheet {
  const { report, labels, currency, digits, lang, storeName, timeZone, today } = input;
  const isAr = lang === "ar";
  const money = moneyFormat(digits);
  const m = (value: number): XCell => ({ value, format: money });
  const head = (value: string): XCell => ({ value, heading: true });
  const [now, before, yearAgo] = [0, 1, 2].map((i) => report.periods[i] ?? emptyPeriod());
  const row = (label: string, pick: (p: GiftCardPeriod) => number, indent = 0): XCell[] => [
    { value: label, indent },
    { ...(m(pick(now)) as Exclude<XCell, null>), bold: true },
    m(pick(before)),
    m(pick(yearAgo)),
  ];
  const name = GIFT_CARD_SHEET[lang];
  return {
    name,
    rtl: isAr,
    stickyRows: 4,
    stickyColumns: 1,
    widths: [40, 16, 16, 16],
    rows: [
      [{ value: `${storeName} · ${name} · ${labels[0]}`, bold: true }],
      [{ value: `${currency} · ${timeZone} · ${GIFT_CARD_SECTION[lang]}` }],
      [],
      [head(currency), head(labels[0]), head(labels[1]), head(labels[2])],
      row(SPECS[0].label[lang], (p) => p.sold),
      ...PAID_WITH.map((paid) => row(paid[lang], (p) => p[paid.key], 1)),
      [
        { value: isAr ? "عدد البطاقات المبيعة" : "Cards sold", indent: 1 },
        { value: now.soldCount, format: COUNT_FORMAT, bold: true },
        { value: before.soldCount, format: COUNT_FORMAT },
        { value: yearAgo.soldCount, format: COUNT_FORMAT },
      ],
      row(SPECS[1].label[lang], (p) => p.given),
      row(SPECS[2].label[lang], (p) => p.spent),
      row(SPECS[3].label[lang], (p) => p.writtenOff),
      row(SPECS[4].label[lang], (p) => p.heldAtEnd),
      [],
      [{ value: isAr ? `اليوم (${today})` : `Today (${today})`, bold: true }],
      [
        { value: isAr ? "المحفوظ في البطاقات السارية" : "Held on cards in use" },
        m(report.now.held),
      ],
      [
        { value: isAr ? "عدد البطاقات السارية برصيد" : "Cards in use with a balance" },
        { value: report.now.heldCards, format: COUNT_FORMAT },
      ],
      [
        { value: isAr ? "رصيد بطاقات انتهت صلاحيتها" : "Balance on cards past their end date" },
        m(report.now.heldExpired),
      ],
    ],
  };
}

function emptyPeriod(): GiftCardPeriod {
  return {
    sold: 0,
    soldCount: 0,
    soldCash: 0,
    soldCard: 0,
    soldTransfer: 0,
    given: 0,
    spent: 0,
    writtenOff: 0,
    heldAtEnd: 0,
  };
}
