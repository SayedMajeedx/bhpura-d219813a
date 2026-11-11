import { storeAddress } from "@/lib/platform-host";
import type { StoredCardDesign } from "@/lib/gift-card-purchase.functions";

/**
 * A gift card's own link, for the person it is given to (migration 20261201100000):
 * `/<store>/gift/<token>` shows the card in its design and its code on a tap, and nothing about
 * how it was bought. Every message a person sends with a card carries this link and never the
 * code: a code written in a chat is read by anyone who sees the chat's preview.
 */

/** A card's share token: 64 hex characters, as the database makes it. */
export function isGiftToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

/** The gift page's address, on the store's own address. */
export function giftAddress(slug: string, token: string): string {
  return `${storeAddress(slug)}/gift/${token}`;
}

export type GiftState = "ready" | "used" | "expired" | "voided";

/** What a card can still do, for the person holding its link. `today` is a day, YYYY-MM-DD. */
export function giftState(
  card: { status: string; balance: number; expires_on: string | null },
  today: string,
): GiftState {
  if (card.status !== "active") return "voided";
  if (card.expires_on && card.expires_on < today) return "expired";
  if (Number(card.balance) <= 0) return "used";
  return "ready";
}

/** What the gift page shows: the card and its words, never its code or anything of the buyer's. */
export type GiftView = {
  brandId: string;
  state: GiftState;
  /** What the card was given with, and what it still holds. */
  amount: number;
  balance: number;
  currency: string;
  to: string | null;
  message: string | null;
  /** Who it is from, only when the giver wrote it on the card. */
  from: string | null;
  expiresOn: string | null;
  /** The design the buyer chose (null for a card issued in the store). */
  design: StoredCardDesign | null;
  /** The language the card was bought in. */
  lang: "ar" | "en" | null;
};

/**
 * The message sent to the person the card is for: a greeting, the giver's own words and the link.
 * The amount and the code wait inside the link.
 */
export function giftLinkMessage(
  input: { recipient: string | null; message: string | null; storeName: string; link: string },
  lang: "ar" | "en",
): string {
  const name = input.recipient?.trim();
  const own = input.message?.trim();
  if (lang === "ar") {
    return [
      name ? `مرحبًا ${name}،` : "مرحبًا،",
      ...(own ? [own] : []),
      `لك بطاقة هدية من ${input.storeName}. افتحها من هنا:`,
      input.link,
    ].join("\n");
  }
  return [
    name ? `Hello ${name},` : "Hello,",
    ...(own ? [own] : []),
    `You have a gift card from ${input.storeName}. Open it here:`,
    input.link,
  ].join("\n");
}

/**
 * The message the store sends the buyer who asked for their card on WhatsApp: that it is ready,
 * and the link to pass on (or keep). The code shows inside the link.
 */
export function giftLinkForBuyerMessage(
  input: {
    buyer: string | null;
    recipient: string | null;
    amount: string;
    storeName: string;
    link: string;
  },
  lang: "ar" | "en",
): string {
  const buyer = input.buyer?.trim();
  const recipient = input.recipient?.trim();
  if (lang === "ar") {
    return [
      buyer ? `مرحبًا ${buyer}،` : "مرحبًا،",
      `بطاقة الهدية من ${input.storeName} جاهزة (${input.amount}).`,
      recipient
        ? `هذا رابط الإهداء، أرسله إلى ${recipient}:`
        : "هذا رابط البطاقة، أرسله لمن تحب أو احتفظ به:",
      input.link,
      "رمز البطاقة يظهر داخل الرابط.",
    ].join("\n");
  }
  return [
    buyer ? `Hello ${buyer},` : "Hello,",
    `Your gift card from ${input.storeName} is ready (${input.amount}).`,
    recipient
      ? `Here is the gift link to send to ${recipient}:`
      : "Here is the card's link, to send to someone or to keep:",
    input.link,
    "The card's code shows inside the link.",
  ].join("\n");
}

type LayoutData = {
  brand?: { slug?: string; name_ar?: string | null; name_en?: string | null };
  settings?: { business_name?: string | null } | null;
  initialLang?: "ar" | "en";
};

/**
 * The gift link's preview in a chat: the store's name and "a gift for you", with the store's own
 * share picture (the layout's). Never the amount, the code or a name, and kept out of search.
 */
export function giftHead({ matches }: { matches: ReadonlyArray<unknown> }) {
  const layout = (matches as ReadonlyArray<{ routeId?: string; loaderData?: unknown }>).find(
    (match) => match.routeId === "/$slug",
  )?.loaderData as LayoutData | undefined;
  const brand = layout?.brand;
  const lang = layout?.initialLang === "en" ? "en" : "ar";
  const name =
    (lang === "ar" ? brand?.name_ar || brand?.name_en : brand?.name_en || brand?.name_ar) ||
    layout?.settings?.business_name ||
    brand?.slug ||
    "";
  const title =
    lang === "ar"
      ? name
        ? `وصلتك هدية من ${name}`
        : "وصلتك هدية"
      : name
        ? `A gift for you from ${name}`
        : "A gift for you";
  const description =
    lang === "ar" ? "افتح الرابط لترى بطاقة هديتك." : "Open the link to see your gift card.";
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
  };
}

const codeKey = (slug: string) => `boutq_gift_code:${slug}`;

/** The code of a gift opened in this tab, kept for the store's checkout to fill in. */
export function rememberGiftCode(slug: string, code: string) {
  try {
    window.sessionStorage.setItem(codeKey(slug), code);
  } catch {
    // No storage (private mode): the shopper types the code at checkout.
  }
}

export function rememberedGiftCode(slug: string): string | null {
  try {
    return window.sessionStorage.getItem(codeKey(slug));
  } catch {
    return null;
  }
}

export function forgetGiftCode(slug: string) {
  try {
    window.sessionStorage.removeItem(codeKey(slug));
  } catch {
    // Nothing was kept.
  }
}
