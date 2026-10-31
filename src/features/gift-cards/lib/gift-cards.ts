import type { GiftCard } from "@/lib/data/gift-cards";

/**
 * How a store's gift cards read on its screens (the database holds the rules: migration
 * 20261101100000). A card is a payment the store holds money for, never a discount.
 */

export type CardState = "active" | "used" | "expired" | "voided";

/** `today` is the reader's calendar day, "YYYY-MM-DD". */
export function cardState(
  card: Pick<GiftCard, "status" | "balance" | "expires_on">,
  today: string,
): CardState {
  if (card.status === "voided") return "voided";
  if (Number(card.balance) <= 0) return "used";
  if (card.expires_on && card.expires_on < today) return "expired";
  return "active";
}

export const CARD_STATE_WORDS: Record<CardState, { ar: string; en: string }> = {
  active: { ar: "صالحة", en: "Active" },
  used: { ar: "استُخدمت بالكامل", en: "Used up" },
  expired: { ar: "منتهية", en: "Expired" },
  voided: { ar: "ملغاة", en: "Voided" },
};

/**
 * What the store holds for its cards: the balance of every card still usable (money owed to
 * shoppers in goods), how many those are, and what sits on expired cards.
 */
export function cardsHeld(cards: readonly GiftCard[], today: string) {
  let held = 0;
  let active = 0;
  let expired = 0;
  for (const card of cards) {
    const state = cardState(card, today);
    if (state === "active") {
      held += Number(card.balance);
      active += 1;
    } else if (state === "expired") {
      expired += Number(card.balance);
    }
  }
  return { held: round3(held), active, expired: round3(expired) };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The cards a search finds: by code (with or without its dashes), recipient or purchaser. */
export function searchCards(cards: readonly GiftCard[], term: string): GiftCard[] {
  const raw = term.trim().toLowerCase();
  if (!raw) return [...cards];
  const compact = raw.replace(/[^a-z0-9]/g, "");
  return cards.filter((card) => {
    if (compact.length >= 3 && card.code.toLowerCase().replace(/-/g, "").includes(compact)) {
      return true;
    }
    return [card.recipient_name, card.purchaser_name]
      .filter(Boolean)
      .some((name) => String(name).toLowerCase().includes(raw));
  });
}

/**
 * How a card came to be (step three, the owner's decision: cards are sold in the store first).
 * A card sold is money the store holds, paid in cash, on the card machine or by transfer; a card
 * given (a present, a goodwill credit) brought nothing in. Neither is a sale: the sale is counted
 * when the card is spent.
 */
export type CardOrigin = "cash" | "card" | "transfer" | "online" | "given";

/** What staff choose from when they issue a card ("online" is the storefront's own). */
export const CARD_ORIGINS: Exclude<CardOrigin, "online">[] = ["cash", "card", "transfer", "given"];

export const ORIGIN_WORDS: Record<CardOrigin, { ar: string; en: string }> = {
  cash: { ar: "نقدًا", en: "Cash" },
  card: { ar: "جهاز البطاقات", en: "Card machine" },
  online: { ar: "دفع على المتجر", en: "Paid on the store" },
  transfer: { ar: "تحويل", en: "Transfer" },
  given: { ar: "هدية من المتجر", en: "Given by the store" },
};

/** What the database keeps: how it was paid, or nothing for a card given. */
export function paidWithOf(
  origin: Exclude<CardOrigin, "online"> | "",
): "cash" | "card" | "transfer" | null {
  return origin === "" || origin === "given" ? null : origin;
}

/** How a card came to be, read back from what the database kept. */
export function cardOrigin(card: { paid_with?: string | null }): CardOrigin {
  const paid = card.paid_with;
  return paid === "cash" || paid === "card" || paid === "transfer" || paid === "online"
    ? paid
    : "given";
}

export type IssueForm = {
  /** Sold (and how it was paid) or given: asked every time, never assumed. */
  origin: Exclude<CardOrigin, "online"> | "";
  amount: string;
  recipientName: string;
  purchaserName: string;
  note: string;
  expiresOn: string;
};

export const emptyIssueForm = (): IssueForm => ({
  origin: "",
  amount: "",
  recipientName: "",
  purchaserName: "",
  note: "",
  expiresOn: "",
});

export type IssueProblem = "origin" | "amount" | "expiry";

export function issueProblems(form: IssueForm, today: string): IssueProblem[] {
  const problems: IssueProblem[] = [];
  if (!form.origin) problems.push("origin");
  const amount = Number(form.amount);
  if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
    problems.push("amount");
  }
  if (form.expiresOn && form.expiresOn < today) problems.push("expiry");
  return problems;
}

/** The database's refusals in the reader's language, never a bare code. */
const ERRORS: Record<string, { ar: string; en: string }> = {
  GIFT_CARD_NOT_FOUND: { ar: "لا توجد بطاقة بهذا الرمز.", en: "No gift card has this code." },
  GIFT_CARD_VOIDED: { ar: "هذه البطاقة ملغاة.", en: "This gift card was voided." },
  GIFT_CARD_EXPIRED: { ar: "انتهت صلاحية هذه البطاقة.", en: "This gift card has expired." },
  GIFT_CARD_EMPTY: { ar: "لا رصيد في هذه البطاقة.", en: "This gift card has no balance left." },
  GIFT_CARD_CURRENCY: {
    ar: "عملة البطاقة غير عملة الطلب.",
    en: "The card is in another currency than the order.",
  },
  GIFT_CARD_MUST_COVER_ONLINE: {
    ar: "طلب الدفع بالبطاقة يُدفع هنا بالكامل ببطاقة الهدية: رصيدها لا يكفي لما تبقى.",
    en: "A card-payment order is paid in full by the gift card here, and its balance does not cover what is owed.",
  },
  ORDER_ALREADY_PAYING: {
    ar: "بدأ دفع هذا الطلب: لا تُضاف إليه بطاقة هدية الآن.",
    en: "This order's payment has begun, so a gift card cannot be added to it now.",
  },
  GIFT_CARD_TRIES: {
    ar: "محاولات كثيرة: أعد المحاولة بعد قليل.",
    en: "Too many tries: try again in a while.",
  },
  GIFT_CARD_AMOUNT_INVALID: { ar: "المبلغ غير صحيح.", en: "The amount is not valid." },
  GIFT_CARD_PAID_WITH_INVALID: {
    ar: "اختر كيف دُفعت البطاقة.",
    en: "Choose how the card was paid for.",
  },
  GIFT_CARD_EXPIRY_PAST: {
    ar: "تاريخ الانتهاء مضى.",
    en: "The expiry date has passed.",
  },
  GIFT_CARD_REASON_REQUIRED: {
    ar: "اكتب سبب إلغاء البطاقة.",
    en: "Write why the card is voided.",
  },
  ORDER_NOT_PAYABLE: {
    ar: "هذا الطلب مغلق: لا يُدفع.",
    en: "This order is closed and takes no payment.",
  },
  ORDER_NOTHING_OWED: { ar: "لا شيء متبقٍ على هذا الطلب.", en: "Nothing is owed on this order." },
  ORDER_NOT_FOUND: { ar: "لم يُعثر على الطلب.", en: "The order was not found." },
  GIFT_CARD_AMOUNTS_INVALID: {
    ar: "حتى 8 قيم أكبر من صفر.",
    en: "Up to 8 amounts above zero.",
  },
  GIFT_CARD_AMOUNTS_REQUIRED: {
    ar: "اكتب قيمة واحدة على الأقل للبيع على المتجر.",
    en: "Write at least one amount to sell on the store.",
  },
  PURCHASE_NOT_PENDING: {
    ar: "هذا الشراء لم يعد بانتظار التحقق.",
    en: "This purchase is no longer waiting to be checked.",
  },
  PURCHASE_NOT_PAID: {
    ar: "لم يُدفع هذا الشراء بعد.",
    en: "This purchase is not paid yet.",
  },
  PURCHASE_NOT_FOUND: { ar: "لم يُعثر على الشراء.", en: "The purchase was not found." },
  FORBIDDEN: {
    ar: "لا تملك صلاحية إدارة الطلبات.",
    en: "You do not have permission to manage orders.",
  },
};

export function giftCardError(error: unknown, lang: "ar" | "en"): string {
  const message = String((error as { message?: string })?.message ?? error ?? "");
  const code = Object.keys(ERRORS).find((key) => message.includes(key));
  if (code) return ERRORS[code][lang];
  return lang === "ar" ? "تعذّر إتمام العملية." : "That could not be done.";
}

export const MOVE_WORDS: Record<string, { ar: string; en: string }> = {
  issued: { ar: "أُصدرت", en: "Issued" },
  redeemed: { ar: "دُفع بها طلب", en: "Paid an order" },
  returned: { ar: "أُعيد إليها من طلب أُلغي", en: "Returned from a released order" },
  voided: { ar: "أُلغيت", en: "Voided" },
};

/**
 * The message a person sends with a card (WhatsApp): who it is for, what it holds, its code, how
 * long it lasts and where to use it. Nothing is sent by itself.
 */
export function giftCardMessage(
  card: Pick<GiftCard, "code" | "recipient_name" | "expires_on">,
  words: { amount: string; storeName: string; storeLink: string; expiry: string | null },
  lang: "ar" | "en",
): string {
  const name = card.recipient_name?.trim();
  if (lang === "ar") {
    return [
      name ? `مرحبًا ${name}،` : "مرحبًا،",
      `إليك بطاقة هدية من ${words.storeName} بقيمة ${words.amount}.`,
      `رمز البطاقة: ${card.code}`,
      ...(words.expiry ? [`صالحة حتى ${words.expiry}.`] : []),
      `تُستخدم عند الطلب من ${words.storeLink}`,
    ].join("\n");
  }
  return [
    name ? `Hello ${name},` : "Hello,",
    `Here is a ${words.amount} gift card from ${words.storeName}.`,
    `Card code: ${card.code}`,
    ...(words.expiry ? [`Valid until ${words.expiry}.`] : []),
    `Use it when you order at ${words.storeLink}`,
  ].join("\n");
}

const RELEASED = new Set([
  "draft",
  "cancelled",
  "canceled",
  "refunded",
  "voided",
  "failed",
  "returned",
]);

/**
 * Whether staff can take a gift card on an order, and what it would have to cover: what is still
 * owed, and on a card-payment order all of it (the database's own rule: a shopper's card charge
 * asks for what a gift card leaves only at checkout). Null when the order takes no payment.
 */
export function orderGiftCardOffer(order: {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  total?: number | null;
  advance_paid?: number | null;
}): { owed: number; mustCoverAll: boolean } | null {
  if (RELEASED.has(String(order.status ?? "").toLowerCase())) return null;
  if (String(order.payment_status ?? "").toLowerCase() === "refunded") return null;
  const owed = round3(Number(order.total ?? 0) - Number(order.advance_paid ?? 0));
  if (owed <= 0) return null;
  const method = String(order.payment_method ?? "").toLowerCase();
  return { owed, mustCoverAll: method === "card" || method === "tap" };
}
