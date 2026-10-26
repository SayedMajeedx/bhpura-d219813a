import { formatMoney } from "@/lib/format";

/**
 * A price shown in a shopper's own Gulf currency: display only, "≈ 312 SAR" beside the real
 * price. The store charges, invoices and reports in its own currency (migration 20261027130000).
 * Rates are how many of a currency one US dollar buys, refreshed daily by the server
 * (`exchange-rates.server.ts`) and read with the store's choice through
 * `storefront_currency_display`.
 */

export const DISPLAY_CURRENCIES = [
  { code: "BHD", ar: "دينار بحريني", en: "Bahraini dinar" },
  { code: "SAR", ar: "ريال سعودي", en: "Saudi riyal" },
  { code: "AED", ar: "درهم إماراتي", en: "UAE dirham" },
  { code: "KWD", ar: "دينار كويتي", en: "Kuwaiti dinar" },
  { code: "QAR", ar: "ريال قطري", en: "Qatari riyal" },
  { code: "OMR", ar: "ريال عماني", en: "Omani rial" },
  { code: "USD", ar: "دولار أمريكي", en: "US dollar" },
] as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]["code"];

const KNOWN = new Set<string>(DISPLAY_CURRENCIES.map((c) => c.code));
export const isDisplayCurrency = (code: unknown): code is DisplayCurrency =>
  typeof code === "string" && KNOWN.has(code);

export type Rates = Partial<Record<DisplayCurrency, number>>;

/** An amount in one currency in another, by their rates per US dollar; null when a rate is missing. */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: Rates,
): number | null {
  if (from === to) return amount;
  const a = rates[from as DisplayCurrency];
  const b = rates[to as DisplayCurrency];
  if (!a || !b || !Number.isFinite(amount)) return null;
  return (amount / a) * b;
}

/** "≈ SAR 319.15" (or "≈ 319.15 ر.س" in Arabic); null when it cannot be worked out. */
export function approxPrice(
  amount: number,
  from: string,
  to: string,
  rates: Rates,
  lang: "ar" | "en",
): string | null {
  if (from === to) return null;
  const value = convertAmount(amount, from, to, rates);
  if (value === null) return null;
  return `≈ ${formatMoney(value, to, lang)}`;
}

/** How far a fetched rate may move from the one kept before it is refused as a bad figure. */
export const MAX_DAILY_MOVE = 0.1;

/**
 * The day's rates from the feed (`{ usd: { sar: 3.75, ... } }`), each checked against the rate
 * kept: a currency the feed lacks, a figure that is not a positive number, or one that moved more
 * than MAX_DAILY_MOVE in a day is left as it was (the Gulf currencies are pegged, so such a move
 * is a bad figure, not news).
 */
export function ratesFromFeed(
  feed: unknown,
  kept: Rates,
): { accepted: Rates; refused: DisplayCurrency[] } {
  const table =
    feed && typeof feed === "object" && "usd" in feed && typeof feed.usd === "object" && feed.usd
      ? (feed.usd as Record<string, unknown>)
      : {};
  const accepted: Rates = { USD: 1 };
  const refused: DisplayCurrency[] = [];
  for (const { code } of DISPLAY_CURRENCIES) {
    if (code === "USD") continue;
    const value = Number(table[code.toLowerCase()]);
    const before = kept[code];
    const sane = Number.isFinite(value) && value > 0;
    const steady = !before || Math.abs(value - before) / before <= MAX_DAILY_MOVE;
    if (sane && steady) accepted[code] = value;
    else refused.push(code);
  }
  return { accepted, refused };
}
