import type { GiftCardOffer } from "@/lib/data/gift-cards/online";
import { countOf } from "@/lib/arabic-count";

/**
 * Buying a gift card on the storefront (step four of docs/gift-cards-plan.md): what a purchase
 * needs before it is sent, and how its state and its errors read to a shopper. The database
 * holds the rules (`create_gift_card_purchase`); these say them first, in the shopper's words.
 */

export type BuyMethod = "card" | "benefit";

/** How the code reaches the buyer: WhatsApp needs their phone, email their email. */
export type BuyDelivery = "whatsapp" | "email";

export type BuyForm = {
  amount: number | null;
  method: BuyMethod | "";
  delivery: BuyDelivery | "";
  name: string;
  phone: string;
  email: string;
  recipient: string;
  message: string;
  /** A transfer's receipt is chosen. */
  hasReceipt: boolean;
};

export const emptyBuyForm = (): BuyForm => ({
  amount: null,
  method: "",
  delivery: "",
  name: "",
  phone: "",
  email: "",
  recipient: "",
  message: "",
  hasReceipt: false,
});

/** The methods a shopper can pay a card with here: the store's card and BenefitPay. */
export function buyMethods(offer: Pick<GiftCardOffer, "card" | "benefit">): BuyMethod[] {
  return [
    ...(offer.card ? (["card"] as const) : []),
    ...(offer.benefit ? (["benefit"] as const) : []),
  ];
}

export type BuyProblem = "amount" | "method" | "delivery" | "name" | "phone" | "email" | "receipt";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function buyProblems(form: BuyForm, offer: GiftCardOffer): BuyProblem[] {
  const problems: BuyProblem[] = [];
  if (form.amount === null || !offer.amounts.includes(form.amount)) problems.push("amount");
  if (!form.method || !buyMethods(offer).includes(form.method)) problems.push("method");
  if (!form.delivery) problems.push("delivery");
  if (!form.name.trim()) problems.push("name");
  const phoneGiven = form.phone.trim() !== "";
  if ((form.delivery === "whatsapp" || phoneGiven) && form.phone.replace(/\D/g, "").length < 6) {
    problems.push("phone");
  }
  const emailGiven = form.email.trim() !== "";
  if ((form.delivery === "email" || emailGiven) && !EMAIL.test(form.email.trim())) {
    problems.push("email");
  }
  if (form.method === "benefit" && !form.hasReceipt) problems.push("receipt");
  return problems;
}

/** "Valid for 12 months from purchase", or nothing for a card with no end date. */
export function validityLine(months: number | null, lang: "ar" | "en"): string | null {
  if (!months) return null;
  return lang === "ar"
    ? `صالحة ${countOf(months, "month", "ar")} من تاريخ الشراء.`
    : `Valid for ${countOf(months, "month", "en")} from purchase.`;
}

const FAILURES: Record<string, { ar: string; en: string }> = {
  GIFT_CARDS_NOT_SOLD: {
    ar: "لا يبيع المتجر بطاقات الهدايا الآن.",
    en: "The store is not selling gift cards right now.",
  },
  GIFT_CARD_AMOUNT_NOT_OFFERED: {
    ar: "هذه القيمة لم تعد متاحة. اختر قيمة أخرى.",
    en: "That amount is no longer offered. Choose another.",
  },
  PAYMENT_METHOD_DISABLED: {
    ar: "طريقة الدفع هذه غير متاحة الآن.",
    en: "That payment method is not available now.",
  },
  BENEFIT_RECEIPT_INVALID: {
    ar: "تعذّر قبول إيصال التحويل. أرفقه مرة أخرى.",
    en: "The transfer receipt could not be used. Attach it again.",
  },
  GIFT_CARD_BUYER_INVALID: {
    ar: "اكتب اسمك.",
    en: "Write your name.",
  },
  GIFT_CARD_PHONE_REQUIRED: {
    ar: "اكتب رقم هاتفك لنرسل لك الرمز على واتساب.",
    en: "Write your phone number to get the code on WhatsApp.",
  },
  GIFT_CARD_DESIGN_INVALID: {
    ar: "تعذّر حفظ تصميم البطاقة. اختر تصميمًا آخر.",
    en: "The card's design could not be kept. Choose another design.",
  },
  GIFT_CARD_EMAIL_REQUIRED: {
    ar: "اكتب بريدك لنرسل لك الرمز عليه.",
    en: "Write your email to get the code there.",
  },
  GIFT_CARD_EMAIL_INVALID: {
    ar: "البريد غير صحيح.",
    en: "That email address is not valid.",
  },
  GIFT_CARD_TRIES: {
    ar: "محاولات كثيرة. حاول مرة أخرى بعد قليل.",
    en: "Too many tries. Please try again in a little while.",
  },
  GIFT_CARD_PURCHASES_BUSY: {
    ar: "المتجر مشغول الآن. حاول مرة أخرى بعد قليل.",
    en: "The store is busy right now. Please try again shortly.",
  },
};

export function purchaseFailure(reason: string, lang: "ar" | "en"): string {
  const code = Object.keys(FAILURES).find((key) => reason.includes(key));
  if (code) return FAILURES[code][lang];
  return lang === "ar"
    ? "تعذّر إتمام الشراء. حاول مرة أخرى."
    : "The purchase could not be completed. Please try again.";
}

export type PurchaseState =
  "ready" | "checking_transfer" | "payment_unfinished" | "failed" | "over";

/** Where a purchase stands, for its page. */
export function purchaseState(
  view: { status: string; method: BuyMethod; code: string | null },
  paymentFailed: boolean,
): PurchaseState {
  if (view.status === "paid" && view.code) return "ready";
  if (view.status === "cancelled" || view.status === "expired") return "over";
  if (view.method === "benefit") return "checking_transfer";
  return paymentFailed ? "failed" : "payment_unfinished";
}

/**
 * The message the buyer sends the person the card is for (on WhatsApp, by their own hand): who
 * it is for, the buyer's own words, the amount, the code, its end date and where to use it.
 */
export function recipientMessage(
  input: {
    recipient: string | null;
    message: string | null;
    amount: string;
    code: string;
    expiry: string | null;
    storeName: string;
    storeLink: string;
  },
  lang: "ar" | "en",
): string {
  const name = input.recipient?.trim();
  const own = input.message?.trim();
  if (lang === "ar") {
    return [
      name ? `مرحبًا ${name}،` : "مرحبًا،",
      ...(own ? [own] : []),
      `إليك بطاقة هدية من ${input.storeName} بقيمة ${input.amount}.`,
      `رمز البطاقة: ${input.code}`,
      ...(input.expiry ? [`صالحة حتى ${input.expiry}.`] : []),
      `تُستخدم عند الطلب من ${input.storeLink}`,
    ].join("\n");
  }
  return [
    name ? `Hello ${name},` : "Hello,",
    ...(own ? [own] : []),
    `Here is a ${input.amount} gift card from ${input.storeName}.`,
    `Card code: ${input.code}`,
    ...(input.expiry ? [`Valid until ${input.expiry}.`] : []),
    `Use it when you order at ${input.storeLink}`,
  ].join("\n");
}

/** Where the code goes, said on the purchase's page. */
export function deliveryLine(
  view: { delivery: BuyDelivery; deliveryTo: string | null; status: string; method: BuyMethod },
  lang: "ar" | "en",
): string {
  const to = view.deliveryTo ?? "";
  const paid = view.status === "paid";
  if (view.delivery === "email") {
    return lang === "ar"
      ? paid
        ? `أرسلنا الرمز إلى ${to}.`
        : `نرسل الرمز إلى ${to} حين يكتمل الدفع.`
      : paid
        ? `We emailed the code to ${to}.`
        : `We will email the code to ${to} once the payment is complete.`;
  }
  return lang === "ar"
    ? paid
      ? `يرسل لك المتجر الرمز على واتساب إلى ${to}.`
      : `يرسل لك المتجر الرمز على واتساب إلى ${to} حين يكتمل الدفع.`
    : paid
      ? `The store will send you the code on WhatsApp at ${to}.`
      : `The store will send you the code on WhatsApp at ${to} once the payment is complete.`;
}
