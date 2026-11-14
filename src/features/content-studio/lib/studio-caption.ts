/**
 * The Studio's automatic Instagram caption: a hook, a line about the piece, what a shopper needs to
 * order it, and where. It reads like a person, not a spec sheet ("made to order: yes"): nothing is
 * said that the product does not say, and a line with nothing to say is left out.
 *
 * Arabic has a word for "you" that a store chooses: to many, or to a woman in its own dialect.
 */
export type CaptionVoice = "plural" | "sh" | "j";

export const CAPTION_VOICES: readonly { id: CaptionVoice; label: string }[] = [
  { id: "plural", label: "لكم" },
  { id: "sh", label: "لش" },
  { id: "j", label: "لج" },
];

const ENDING: Record<CaptionVoice, string> = { plural: "كم", sh: "ش", j: "ج" };

export const readCaptionVoice = (value: unknown): CaptionVoice =>
  value === "sh" || value === "j" ? value : "plural";

/**
 * What a post asks a viewer to do, on the post itself. It names no piece, so it reads right for an
 * abaya, a perfume or a cake: to many in the plural, else impersonally (the platform writes no
 * feminine imperative, `tests/arabic-gender-neutral-copy.test.ts`).
 */
export function postCallToAction(voice: CaptionVoice, lang: "ar" | "en"): string {
  if (lang === "en") return "Order from the link in bio";
  return voice === "plural" ? "اطلبوا من الرابط في البايو" : "الطلب من الرابط في البايو";
}

/** What a product's occasion (`OCCASION_CHOICES`) invites a shopper to, in each language. */
function occasionHook(occasion: string, lang: "ar" | "en", voice: CaptionVoice): string | null {
  const you = ENDING[voice];
  const hooks: Record<string, { ar: string; en: string }> = {
    يومي: { ar: `ليوم${you} العادي، بس أحلى`, en: "For your everyday, only better" },
    سهرة: { ar: `لسهرت${you} الجاية`, en: "For your next evening out" },
    مناسبات: { ar: `لمناسبت${you} الجاية`, en: "For your next occasion" },
    "إطلالة رسمية": { ar: `لإطلالت${you} الرسمية`, en: "For when it has to be formal" },
  };
  return hooks[occasion.trim()]?.[lang] ?? null;
}

/** The description's first paragraph: a store's code line and the rest stay on its product page. */
export function captionLead(text: string | null | undefined): string {
  return (text ?? "")
    .trim()
    .split(/\n\s*\n/)[0]
    .trim();
}

/**
 * An amount as a caption writes it: a whole amount bare ("33"), else to the fils ("26.400"),
 * never "26.4", which reads as a typo in dinars.
 */
export function captionAmount(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3);
}

export function studioCaption({
  headline,
  name,
  body,
  description,
  occasion,
  madeToOrder,
  making,
  sizes,
  price,
  was = null,
  saleEnds = null,
  currency,
  lang,
  voice,
}: {
  headline: string;
  /** The product's name as a sentence says it ("عباية وتر"), when the headline is its short name. */
  name?: string | null;
  body: string;
  description: string | null;
  occasion: string | null | undefined;
  madeToOrder: boolean;
  /** The making time the store wrote: none written, none said. */
  making: string | null | undefined;
  sizes: string[];
  /** What the shopper pays now: the offer's price while one is on (the post says the same). */
  price: number | null;
  /** The price before the offer, while one is on. */
  was?: number | null;
  /** When the offer ends, in the reader's words ("حتى 14 نوفمبر"), or null. */
  saleEnds?: string | null;
  currency: string;
  lang: "ar" | "en";
  voice: CaptionVoice;
}): string {
  const ar = lang === "ar";
  const you = ENDING[voice];
  const hook = occasion ? occasionHook(occasion, lang, voice) : null;
  // The post shows a short name ("وتر") large; the caption names the piece in full ("عباية وتر").
  const title = name?.trim() || headline.trim();
  const lead = body.trim() || captionLead(description);

  const lines: string[] = [];
  lines.push(title || hook || "");
  lines.push(lead);
  if (title && hook) lines.push(hook);
  if (sizes.length > 0) {
    lines.push(`${ar ? "جاهزة الحين بمقاس" : "Ready now in"} ${sizes.join(" · ")}`);
  }
  if (madeToOrder) {
    lines.push(
      ar ? `وتتفصّل على مقاس${you}` : "And made to your measurements",
      making?.trim() ?? "",
    );
  }
  if (price != null && price > 0) {
    const now = `${captionAmount(price)} ${currency}`;
    if (was != null && was > price) {
      const before = `${captionAmount(was)} ${currency}`;
      lines.push(ar ? `${now} بدل ${before}` : `${now} instead of ${before}`);
      if (saleEnds?.trim())
        lines.push(ar ? `العرض ${saleEnds.trim()}` : `Offer ${saleEnds.trim()}`);
    } else {
      lines.push(now);
    }
  }
  lines.push(
    ar
      ? `${voice === "plural" ? "اطلبوها" : "اطلبيها"} من الرابط في البايو`
      : "Order from the link in bio",
  );
  return lines.filter(Boolean).join("\n");
}
