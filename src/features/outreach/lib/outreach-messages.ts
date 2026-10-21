import type { OutreachCard, OutreachProduct, OutreachReason } from "./outreach";

/**
 * The message a member of staff sends, in the client's language: their first name, the store's
 * name, and what the reason is about. The Arabic is written so that it needs no verb in the
 * masculine or the feminine. A suggestion ends with how to stop them, and the store records the
 * answer on the client (`marketing_consent`, `opted_out_at`).
 */

export type MessageContext = {
  storeName: string;
  /** A product's page on the storefront, absolute. */
  productLink: (productId: string) => string;
  /** The checkout that brings a left cart back, absolute. */
  cartLink: (token: string) => string;
  /** The storefront's home page, absolute. */
  storeLink: string;
  /** The store's own word for a size ("المقاس", "Length"), for the client's language. */
  sizeLabel: (lang: "ar" | "en") => string;
  /** An amount in the cart's currency, in the client's language. */
  money: (amount: number, currency: string | null, lang: "ar" | "en") => string;
  productName: (product: OutreachProduct, lang: "ar" | "en") => string;
};

/**
 * A counted noun in Arabic: 1 قطعة, 2 قطعتان, 3-10 قطع, 11 and over قطعة (with the number).
 */
export function arCount(n: number, forms: { one: string; two: string; few: string; many: string }) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

const PIECES = { one: "قطعة واحدة", two: "قطعتان", few: "قطع", many: "قطعة" };
const NEW_PIECES = {
  one: "قطعة جديدة",
  two: "قطعتان جديدتان",
  few: "قطع جديدة",
  many: "قطعة جديدة",
};
const DAYS = { one: "يوم", two: "يومين", few: "أيام", many: "يوماً" };
const ORDERS = { one: "طلب واحد", two: "طلبان", few: "طلبات", many: "طلباً" };
const TIMES = { one: "مرة واحدة", two: "مرتين", few: "مرات", many: "مرة" };

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] ?? "";

const greeting = (name: string | null, lang: "ar" | "en") => {
  const first = firstName(name);
  if (lang === "ar") return first ? `مرحباً ${first}،` : "مرحباً،";
  return first ? `Hi ${first},` : "Hi,";
};

const STOP: Record<"ar" | "en", string> = {
  ar: "لإيقاف هذه الرسائل أرسل «إيقاف».",
  en: "Reply STOP to stop these messages.",
};

const listOf = (names: string[], lang: "ar" | "en") => {
  if (names.length <= 1) return names[0] ?? "";
  const head = names.slice(0, -1).join(lang === "ar" ? "، " : ", ");
  return `${head}${lang === "ar" ? " و" : " and "}${names[names.length - 1]}`;
};

/** A left cart, as both Clients to message and the abandoned-carts screen write it. */
export type CartReminder = {
  name: string | null;
  lines: readonly { name: string; size: string | null }[];
  subtotal: number;
  currency: string | null;
  token: string;
  /** A code the store chose to offer, already made for this cart. */
  code?: string | null;
};

export function cartReminderMessage(
  cart: CartReminder,
  lang: "ar" | "en",
  ctx: Pick<MessageContext, "storeName" | "cartLink" | "money">,
): string {
  const hi = greeting(cart.name, lang);
  const store = ctx.storeName;
  const names = cart.lines.map((line) => (line.size ? `${line.name} (${line.size})` : line.name));
  const total = ctx.money(cart.subtotal, cart.currency, lang);
  const link = ctx.cartLink(cart.token);
  const code = cart.code
    ? lang === "ar"
      ? `\nكود خصم خاص لهذه السلة: ${cart.code}`
      : `\nA code for this cart: ${cart.code}`
    : "";
  return lang === "ar"
    ? `${hi} سلتك في ${store} ما زالت محفوظة: ${listOf(names, lang)}، بمجموع ${total}.${code}\nلإكمال الطلب: ${link}`
    : `${hi} your cart at ${store} is still saved: ${listOf(names, lang)}, ${total} in all.${code}\nTo complete your order: ${link}`;
}

export function outreachMessage(
  card: OutreachCard,
  lang: "ar" | "en",
  ctx: MessageContext,
): string {
  const hi = greeting(card.name, lang);
  const store = ctx.storeName;
  const detail = card.detail;
  switch (detail.reason) {
    case "back_in_stock": {
      const piece = [ctx.productName(detail.product, lang), detail.option]
        .filter(Boolean)
        .join(" · ");
      const link = ctx.productLink(detail.product.id);
      return lang === "ar"
        ? `${hi} ${piece} صار متوفراً من جديد في ${store}.\n${link}`
        : `${hi} ${piece} is back in stock at ${store}.\n${link}`;
    }
    case "cart":
      return cartReminderMessage({ name: card.name, ...detail }, lang, ctx);
    case "aftercare":
      return lang === "ar"
        ? `${hi} شكراً لاختيارك ${store}. نتمنى أن يكون كل شيء على ما يرام، وإذا احتجت أي شيء نحن هنا.`
        : `${hi} thank you for choosing ${store}. We hope everything is just right, and we're here if you need anything.`;
    case "new_in_size": {
      const names = detail.products.map((product) => ctx.productName(product, lang));
      const label = ctx.sizeLabel(lang);
      const link =
        detail.products.length === 1 ? ctx.productLink(detail.products[0].id) : ctx.storeLink;
      return lang === "ar"
        ? `${hi} وصلتنا في ${store} قطع جديدة متوفرة في ${label} ${detail.size}: ${listOf(names, lang)}.\n${link}\n\n${STOP.ar}`
        : `${hi} new pieces just arrived at ${store} in your ${label.toLowerCase()} ${detail.size}: ${listOf(names, lang)}.\n${link}\n\n${STOP.en}`;
    }
    case "due_back":
      return lang === "ar"
        ? `${hi} اشتقنا لك في ${store}! تشكيلتنا الجديدة بانتظارك:\n${ctx.storeLink}\n\n${STOP.ar}`
        : `${hi} we've missed you at ${store}! Our new collection is waiting for you:\n${ctx.storeLink}\n\n${STOP.en}`;
    case "ask_consent":
      return lang === "ar"
        ? `${hi} معك ${store}. هل نرسل لك عند وصول قطع جديدة بمقاسك أو عروض خاصة؟ يكفي الرد بـ«نعم».`
        : `${hi} this is ${store}. Would you like us to let you know when new pieces arrive in your size, or about special offers? Just reply "yes".`;
  }
}

/** Why the client is on today's list, in the reader's (staff's) language. */
export function outreachWhy(
  card: OutreachCard,
  lang: "ar" | "en",
  ctx: Pick<MessageContext, "productName" | "sizeLabel">,
): string {
  const detail = card.detail;
  switch (detail.reason) {
    case "back_in_stock": {
      const piece = [ctx.productName(detail.product, lang), detail.option]
        .filter(Boolean)
        .join(" · ");
      return lang === "ar"
        ? `طلب إشعاره بتوفر ${piece}، وقد عاد للمخزون.`
        : `Asked to hear when ${piece} was back. It is.`;
    }
    case "cart":
      return lang === "ar"
        ? `ترك سلة فيها ${arCount(detail.lines.length, PIECES)} ووافق على تذكيره.`
        : `Left a cart with ${detail.lines.length} ${detail.lines.length === 1 ? "piece" : "pieces"} and agreed to a reminder.`;
    case "aftercare":
      return lang === "ar"
        ? "استلم أول طلب له قبل أيام: كلمة شكر تبني العلاقة."
        : "Received their first order a few days ago: a thank-you builds the relationship.";
    case "new_in_size":
      return lang === "ar"
        ? `وصلت ${arCount(detail.products.length, NEW_PIECES)} في ${ctx.sizeLabel(lang)} ${detail.size} الذي يشتري به.`
        : `${detail.products.length} new ${detail.products.length === 1 ? "piece" : "pieces"} in the ${ctx.sizeLabel(lang).toLowerCase()} they buy, ${detail.size}.`;
    case "due_back":
      return lang === "ar"
        ? `${arCount(detail.orders, ORDERS)}، عادةً كل ${arCount(detail.usualGapDays, DAYS)}، ومضى على آخرها أطول من ذلك.`
        : `${detail.orders} orders, usually every ${detail.usualGapDays} days, and longer than that since the last.`;
    case "ask_consent":
      return lang === "ar"
        ? `اشترى ${arCount(detail.orders, TIMES)} ولم يُسأل بعد إن كان يرغب برسائل المتجر.`
        : `Bought ${detail.orders === 1 ? "once" : `${detail.orders} times`} and hasn't been asked whether they'd like to hear from you.`;
  }
}

/** The reason's name on its card. */
export const REASON_LABELS: Record<OutreachReason, { ar: string; en: string }> = {
  back_in_stock: { ar: "عاد للمخزون", en: "Back in stock" },
  cart: { ar: "سلة متروكة", en: "Left a cart" },
  aftercare: { ar: "بعد أول طلب", en: "After first order" },
  new_in_size: { ar: "جديد بمقاسه", en: "New in their size" },
  due_back: { ar: "حان موعد عودته", en: "Due back" },
  ask_consent: { ar: "اسأله عن الرسائل", en: "Ask about messages" },
};
