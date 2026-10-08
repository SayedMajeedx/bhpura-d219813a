/**
 * What a store's caption says, read without the AI: the price (and an old price crossed out), its
 * currency, and the sizes. The AI reads captions too, but it can invent, so its answer is checked
 * against this, and this fills in what the AI left empty. Everything here is conservative: when a
 * caption is unclear it says so instead of guessing.
 */

export type Currency = "BHD" | "KWD" | "OMR" | "QAR" | "SAR" | "AED";

/** Digits and separators as an Arabic caption writes them, as plain numbers. */
export function normalizeNumerals(text: string): string {
  return (
    text
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
      .replace(/٫/g, ".")
      .replace(/٬/g, "")
      // 35,500 and 9,5 are decimals (fils); 1,250,000-style thousands lose the comma.
      .replace(/(?<!\d)(\d{1,2}),(\d{1,3})(?!\d)/g, "$1.$2")
      .replace(/(?<!\d)(\d{3,}),(\d{3})(?!\d)/g, "$1$2")
  );
}

const NUM = String.raw`\d+(?:\.\d{1,3})?`;

// A currency written in the ways GCC captions write it. Latin words must stand alone; Arabic ones
// must not be the start or end of a longer word.
const CURRENCY_FORMS: Array<{ code: Currency | null; source: string }> = [
  { code: "KWD", source: String.raw`kwd|k\.?d\.?|د\.?\s?ك\.?|دينار\s+كويتي` },
  { code: "OMR", source: String.raw`omr|ر\.?\s?ع\.?|ريال\s+عماني` },
  { code: "QAR", source: String.raw`qar|qr|ر\.?\s?ق\.?|ريال\s+قطري` },
  { code: "SAR", source: String.raw`sar|sr|ر\.?\s?س\.?|ريال\s+سعودي` },
  { code: "AED", source: String.raw`aed|د\.?\s?إ\.?|درهم(?:\s+إماراتي)?` },
  {
    code: "BHD",
    source: String.raw`bhd|bd|b\.d\.?|د\.?\s?ب\.?|دب|دينار(?:\s+بحريني)?|ديناراً|دينارا`,
  },
  { code: null, source: String.raw`ريال` },
];
const CURRENCY = String.raw`(?<![A-Za-z؀-ۿ])(?:${CURRENCY_FORMS.map((form) => form.source).join("|")})(?![A-Za-z؀-ۿ])`;

function currencyOf(text: string | undefined): Currency | null {
  if (!text) return null;
  const trimmed = text.trim();
  for (const form of CURRENCY_FORMS) {
    if (new RegExp(`^(?:${form.source})$`, "i").test(trimmed)) return form.code;
  }
  return null;
}

type Role = "price" | "was" | "now" | "fee" | "discount";
type Candidate = {
  value: number;
  currency: Currency | null;
  raw: string;
  index: number;
  keyword: boolean;
  role: Role;
};

const CUES: Array<{ role: Role; pattern: RegExp }> = [
  { role: "fee", pattern: /(توصيل|التوصيل|شحن|الشحن|delivery|shipping)/gi },
  { role: "discount", pattern: /(خصم|الخصم|وفر|توفير|تخفيض|discount|save|off)/gi },
  { role: "was", pattern: /(كان|بدل|بدلا|بدلاً|قبل|was|instead of|before|original)/gi },
  { role: "now", pattern: /(الان|الآن|now|عرض|بعد الخصم|after discount|اليوم)/gi },
];

/**
 * The words just before a number, on its line, say whether it is a fee, a discount, an old price or
 * a new one. The nearest such word wins ("was 40 now 30": 30 follows "now").
 */
function roleBefore(text: string, start: number): Role {
  const lineStart = text.lastIndexOf(String.fromCharCode(10), start - 1) + 1;
  const window = text.slice(Math.max(lineStart, start - 18), start);
  let role: Role = "price";
  let nearest = -1;
  for (const cue of CUES) {
    for (const match of window.matchAll(cue.pattern)) {
      const end = (match.index ?? 0) + match[0].length;
      if (end > nearest) [nearest, role] = [end, cue.role];
    }
  }
  return role;
}

export type PriceReading = {
  /** The price of the product, or null when the caption has none or says several without saying which. */
  price: number | null;
  /** An old price that was crossed out ("was 40, now 30"), when the caption gives one. */
  originalPrice: number | null;
  currency: Currency | null;
  rawMatch: string | null;
  isExplicit: boolean;
  /** The different prices found when the caption gives several and does not say which is the price. */
  ambiguous: number[];
};

const NONE: PriceReading = {
  price: null,
  originalPrice: null,
  currency: null,
  rawMatch: null,
  isExplicit: false,
  ambiguous: [],
};

function candidatesIn(text: string): Candidate[] {
  const found = new Map<number, Candidate>();
  const add = (
    match: RegExpMatchArray & { indices?: Array<[number, number]> },
    keyword: boolean,
    currency?: string,
  ) => {
    const span = match.indices?.[1];
    if (!span) return;
    const value = parseFloat(match[1]);
    if (!Number.isFinite(value) || value <= 0) return;
    const known = found.get(span[0]);
    const code = currencyOf(currency);
    if (known) {
      known.keyword ||= keyword;
      known.currency ??= code;
      return;
    }
    found.set(span[0], {
      value,
      currency: code,
      raw: match[0],
      index: span[0],
      keyword,
      role: roleBefore(text, span[0]),
    });
  };

  // "السعر 35", "price: 35 BD"
  const keywordPattern = new RegExp(
    String.raw`(?:السعر|سعر|بسعر|price)\s*[:：\-–=]?\s*(${NUM})(?:\s*(${CURRENCY}))?`,
    "gid",
  );
  for (const match of text.matchAll(keywordPattern)) add(match, true, match[2]);
  // "35 BD", "35د.ب", "35 دينار"
  const afterPattern = new RegExp(String.raw`(${NUM})\s*(${CURRENCY})`, "gid");
  for (const match of text.matchAll(afterPattern)) add(match, false, match[2]);
  // "BD 35", "دينار 35"
  const beforePattern = new RegExp(String.raw`(${CURRENCY})\s*(${NUM})`, "gid");
  for (const match of text.matchAll(beforePattern)) {
    const swapped = Object.assign([match[0], match[2], match[1]], {
      indices: [match.indices?.[0], match.indices?.[2], match.indices?.[1]],
    }) as unknown as RegExpMatchArray & { indices: Array<[number, number]> };
    add(swapped, false, match[1]);
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}

/** The most a boutique item plausibly costs, in the currency's own units. */
const isPlausible = (value: number, currency: Currency | null) =>
  value > 0 &&
  value <
    (currency === "BHD" || currency === "KWD" || currency === "OMR" || currency === null
      ? 2000
      : 20_000);

/**
 * The price a caption states. A delivery fee, a discount amount and an old price are not the price;
 * "السعر 30 بدل 40" and "كان 40 الآن 30" give 30 with 40 as the old price; two different prices with
 * nothing to tell them apart give no price at all (and are listed in `ambiguous`).
 */
export function readPrice(caption: string | undefined | null): PriceReading {
  if (!caption) return NONE;
  const text = normalizeNumerals(caption);
  const usable = candidatesIn(text)
    .filter((candidate) => candidate.role !== "fee" && candidate.role !== "discount")
    .map((candidate) => {
      // 35000 written for 35.000 (fils), for the dinars.
      const dinars =
        candidate.currency === null || ["BHD", "KWD", "OMR"].includes(candidate.currency);
      const value =
        dinars && candidate.value >= 1000 && candidate.value % 1000 === 0
          ? candidate.value / 1000
          : candidate.value;
      return { ...candidate, value };
    })
    .filter((candidate) => isPlausible(candidate.value, candidate.currency));
  if (usable.length === 0) return NONE;

  const currency = usable.find((candidate) => candidate.currency)?.currency ?? null;
  const pick = (chosen: (typeof usable)[number], original: number | null): PriceReading => ({
    price: chosen.value,
    originalPrice: original !== null && original > chosen.value ? original : null,
    currency: chosen.currency ?? currency,
    rawMatch: chosen.raw,
    isExplicit: true,
    ambiguous: [],
  });

  const olds = usable.filter((candidate) => candidate.role === "was");
  const rest = usable.filter((candidate) => candidate.role !== "was");
  const distinct = (list: typeof usable) => [...new Set(list.map((candidate) => candidate.value))];
  const original = olds.length > 0 ? Math.max(...olds.map((candidate) => candidate.value)) : null;

  const now = rest.filter((candidate) => candidate.role === "now");
  const pool = now.length > 0 ? now : rest;
  if (pool.length === 0) return NONE; // only old prices: the current one is not stated
  if (distinct(pool).length === 1) return pick(pool[0], original);

  // Several different prices: one labelled with a price word beats the others (a delivery fee was
  // already left out); otherwise the caption does not say which is the price.
  const labelled = pool.filter((candidate) => candidate.keyword);
  if (labelled.length > 0 && distinct(labelled).length === 1) return pick(labelled[0], original);
  return { ...NONE, currency, ambiguous: distinct(pool).sort((a, b) => a - b) };
}

/** The old compatible reading: the price, the text it came from, and whether it was stated outright. */
export function extractPriceByRegex(caption: string): {
  price: number | null;
  rawMatch: string | null;
  isExplicit: boolean;
} {
  const reading = readPrice(caption);
  return { price: reading.price, rawMatch: reading.rawMatch, isExplicit: reading.isExplicit };
}

// ---- sizes ------------------------------------------------------------------------------------

const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];
const FREE_SIZE = /(فري\s*سايز|free\s*size|one\s*size|مقاس\s*(?:واحد|موحد)|مقاس\s*حر)/i;
const SIZE_LABEL =
  /(?:المقاسات|المقاس|مقاسات|مقاس|sizes?)\s*(?:المتوفرة|المتاحة|available)?\s*[:：\-–=]?\s*([^\n]{1,90})/i;
const MIN_NUMERIC = 34;
const MAX_NUMERIC = 66;
const MAX_EXPANDED = 12;

function expandNumeric(from: number, to: number): string[] {
  if (to <= from) return [String(from)];
  const step = from % 2 === 0 && to % 2 === 0 ? 2 : 1;
  const sizes: string[] = [];
  for (let size = from; size <= to && sizes.length < MAX_EXPANDED; size += step)
    sizes.push(String(size));
  return sizes;
}

function numericSizesIn(text: string): string[] {
  const sizes: string[] = [];
  // 52-58, 52 to 58, 52 إلى 58
  const range = /(?<!\d)(\d{2})\s*(?:-|–|—|to|الى|إلى|حتى|لـ?)\s*(\d{2})(?!\d)/gi;
  const withoutRanges = text.replace(range, (whole, a: string, b: string) => {
    const from = Number(a);
    const to = Number(b);
    if (from >= MIN_NUMERIC && to <= MAX_NUMERIC && from < to)
      sizes.push(...expandNumeric(from, to));
    return " ";
  });
  for (const match of withoutRanges.matchAll(/(?<![\d.])(\d{2})(?![\d.])/g)) {
    const size = Number(match[1]);
    if (size >= MIN_NUMERIC && size <= MAX_NUMERIC) sizes.push(String(size));
  }
  return sizes;
}

function letterSizesIn(text: string): string[] {
  const upper = text.toUpperCase();
  const range = upper.match(
    /(?<![A-Z0-9])(XS|S|M|L|XL|XXL|3XL|4XL)\s*(?:-|–|—|TO|إلى|الى)\s*(XS|S|M|L|XL|XXL|3XL|4XL)(?![A-Z0-9])/,
  );
  if (range) {
    const from = LETTER_SIZES.indexOf(range[1]);
    const to = LETTER_SIZES.indexOf(range[2]);
    if (from >= 0 && to > from) return LETTER_SIZES.slice(from, to + 1);
  }
  const found: string[] = [];
  for (const match of upper.matchAll(/(?<![A-Z0-9])(XS|S|M|L|XL|XXL|3XL|4XL)(?![A-Z0-9])/g))
    found.push(match[1]);
  return found;
}

/**
 * The sizes a caption lists: after a size label ("المقاسات: 52 54 56", "Sizes S-XL", a range like
 * 52-58), a free-size phrase, or three or more letter sizes in a row ("S M L XL"). A bare number is
 * never taken for a size, so prices, phone numbers and dates are not.
 */
export function extractSizes(caption: string | undefined | null): string[] {
  if (!caption) return [];
  const text = normalizeNumerals(caption);
  const labelled = text.match(SIZE_LABEL)?.[1];
  if (labelled) {
    const sizes = [...new Set([...numericSizesIn(labelled), ...letterSizesIn(labelled)])];
    if (sizes.length > 0) return sizes;
  }
  if (FREE_SIZE.test(text)) return ["Free Size"];
  const letters = [...new Set(letterSizesIn(text))];
  const lineWithRun = text.split("\n").find((line) => letterSizesIn(line).length >= 3);
  return lineWithRun && letters.length >= 3 ? [...new Set(letterSizesIn(lineWithRun))] : [];
}
