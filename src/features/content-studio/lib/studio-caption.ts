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

export function studioCaption({
  headline,
  body,
  description,
  occasion,
  madeToOrder,
  making,
  sizes,
  price,
  currency,
  lang,
  voice,
}: {
  headline: string;
  body: string;
  description: string | null;
  occasion: string | null | undefined;
  madeToOrder: boolean;
  /** The making time the store wrote: none written, none said. */
  making: string | null | undefined;
  sizes: string[];
  price: number | null;
  currency: string;
  lang: "ar" | "en";
  voice: CaptionVoice;
}): string {
  const ar = lang === "ar";
  const you = ENDING[voice];
  const hook = occasion ? occasionHook(occasion, lang, voice) : null;
  const title = headline.trim();
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
  if (price != null && price > 0) lines.push(`${Number(price.toFixed(3))} ${currency}`);
  lines.push(
    ar
      ? `${voice === "plural" ? "اطلبوها" : "اطلبيها"} من الرابط في البايو`
      : "Order from the link in bio",
  );
  return lines.filter(Boolean).join("\n");
}
