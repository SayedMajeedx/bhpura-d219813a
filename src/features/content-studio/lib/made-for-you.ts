import { normalizeVertical } from "@/lib/store-profile";
import { verticalLineage } from "@/lib/verticals/registry";

/**
 * Made for You: a made-to-order piece told in three chapters, what the
 * shopper gives, how the store makes it, and when it is theirs. The first
 * two are said in the words of the store's craft (a tailor cuts and sews, a
 * roastery roasts to order), never claiming what the store did not say
 * ("by hand"); the third is the making time the store wrote, else the
 * piece's name. Arabic is written with no gendered verb.
 */

type Lang = "ar" | "en";
export type Beat = { title: string; line: string };

type Craft = "sewn" | "crafted" | "roasted" | "prepared" | "blended" | "made";

const BEATS: Record<Craft, Record<Lang, [Beat, Beat]>> = {
  sewn: {
    en: [
      { title: "Your measurements", line: "Your size, your details" },
      { title: "Cut and sewn", line: "For you alone, once you order" },
    ],
    ar: [
      { title: "مقاساتك", line: "مقاسك وتفاصيلك" },
      { title: "تفصيل وخياطة", line: "لك وحدك، بعد طلبك" },
    ],
  },
  crafted: {
    en: [
      { title: "Your choice", line: "Your details, as you want them" },
      { title: "Crafted", line: "For you alone, once you order" },
    ],
    ar: [
      { title: "اختيارك", line: "تفاصيلك حسب اختيارك" },
      { title: "صياغة", line: "لك وحدك، بعد طلبك" },
    ],
  },
  roasted: {
    en: [
      { title: "Your order", line: "Just as you asked" },
      { title: "Roasted to order", line: "Fresh, once you order" },
    ],
    ar: [
      { title: "طلبك", line: "حسب طلبك" },
      { title: "تحميص بعد الطلب", line: "طازج، بعد طلبك" },
    ],
  },
  prepared: {
    en: [
      { title: "Your order", line: "Just as you asked" },
      { title: "Prepared fresh", line: "Once you order" },
    ],
    ar: [
      { title: "طلبك", line: "حسب طلبك" },
      { title: "تحضير طازج", line: "بعد طلبك" },
    ],
  },
  blended: {
    en: [
      { title: "Your choice", line: "Just as you asked" },
      { title: "Blended", line: "For you alone, once you order" },
    ],
    ar: [
      { title: "اختيارك", line: "حسب طلبك" },
      { title: "تركيب", line: "لك وحدك، بعد طلبك" },
    ],
  },
  made: {
    en: [
      { title: "Your details", line: "Just as you asked" },
      { title: "Made for you", line: "Once you order" },
    ],
    ar: [
      { title: "تفاصيلك", line: "حسب طلبك" },
      { title: "صنع لك", line: "بعد طلبك" },
    ],
  },
};

/** What the last chapter is called: the piece, or the order for what is not one. */
const YOURS: Record<Craft, Record<Lang, string>> = {
  sewn: { en: "Yours", ar: "قطعتك" },
  crafted: { en: "Yours", ar: "قطعتك" },
  roasted: { en: "Yours", ar: "طلبك" },
  prepared: { en: "Yours", ar: "طلبك" },
  blended: { en: "Yours", ar: "عطرك" },
  made: { en: "Yours", ar: "طلبك" },
};

/** The store's craft, from its vertical and the broader ones it belongs to. */
export function craftOf(vertical: unknown): Craft {
  const lineage = verticalLineage(normalizeVertical(vertical));
  if (lineage.includes("fashion")) return "sewn";
  if (lineage.includes("jewelry")) return "crafted";
  if (lineage.includes("coffee")) return "roasted";
  if (lineage.includes("food")) return "prepared";
  if (lineage.includes("fragrance")) return "blended";
  return "made";
}

/**
 * The three chapters for a store of `vertical`. `time` is the making time
 * the store wrote (`delivery_estimate_tailored_*`), shown as it is; with
 * none, the last chapter names the piece instead of making up a time.
 */
export function madeForYouBeats({
  vertical,
  lang,
  time,
  name,
}: {
  vertical: unknown;
  lang: Lang;
  time: string | null;
  name: string;
}): Beat[] {
  const craft = craftOf(vertical);
  const [first, second] = BEATS[craft][lang];
  return [first, second, { title: YOURS[craft][lang], line: time?.trim() || name.trim() }];
}
