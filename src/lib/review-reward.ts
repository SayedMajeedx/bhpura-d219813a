import { currencyLabel } from "@/lib/currency-label";
import { moneyFractionDigits } from "@/lib/format";
import { orderNumberLabel, orderNumberText, type OrderNumberFormat } from "@/lib/order-number";

/**
 * A store's thank-you discount for a review: one of its own promo codes, or none
 * (`business_settings.review_reward_promo_id`). The database gives the code only while anyone
 * can use it (`store_review_reward`); `reviewRewardUsable` is that rule's twin for the screens
 * that offer a code to choose. Every place that promises the discount (the review page, the
 * WhatsApp message staff send, the Reviews page) words it with `rewardOffer`, so none promises a
 * discount the store does not give. Every store once promised "10%" and the code THANKU10.
 */

type Lang = "ar" | "en";

export type RewardPromo = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number | string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  max_redemptions: number | null;
};

/** Whether anyone can use the code now: switched on, started, not ended, not for one shopper. */
export function reviewRewardUsable(promo: RewardPromo | null | undefined, now: Date): boolean {
  if (!promo?.is_active) return false;
  const at = now.getTime();
  if (promo.start_date && new Date(promo.start_date).getTime() > at) return false;
  if (promo.end_date && new Date(promo.end_date).getTime() <= at) return false;
  return promo.max_redemptions === null || promo.max_redemptions > 1;
}

/** The codes a store may choose as its thank-you discount, in its list's order. */
export function rewardChoices<P extends RewardPromo>(promos: readonly P[], now: Date): P[] {
  return promos.filter((promo) => reviewRewardUsable(promo, now));
}

/**
 * What the code takes off, as a sentence piece: "10% off" / "خصم 10٪", "5.000 SAR off" /
 * "خصم 5.000 ر.س.". Null when there is no reward.
 */
export function rewardOffer(
  reward: { discount_type?: string | null; discount_value?: number | string | null } | null,
  lang: Lang,
  currency: string | null | undefined,
): string | null {
  const value = Number(reward?.discount_value);
  if (!reward?.discount_type || !(value > 0)) return null;
  if (reward.discount_type === "percentage") {
    const percent = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return lang === "ar" ? `خصم ${percent}٪` : `${percent}% off`;
  }
  const amount = `${value.toFixed(moneyFractionDigits(currency || "BHD"))} ${currencyLabel(currency, lang)}`;
  return lang === "ar" ? `خصم ${amount}` : `${amount} off`;
}

/**
 * The WhatsApp message a member of staff sends to ask for a review, in the customer's language,
 * promising the store's discount only when it gives one. The Arabic needs no gendered verb.
 */
export function reviewRequestMessage({
  lang,
  customerName,
  brandName,
  invoiceNumber,
  numberFormat,
  reviewUrl,
  offer,
}: {
  lang: Lang;
  customerName: string;
  brandName: string;
  invoiceNumber: number | string;
  /** How the store writes its order numbers (`orderNumberLabel`); none: "#1042". */
  numberFormat?: OrderNumberFormat | null;
  reviewUrl: string;
  offer: string | null;
}): string {
  if (lang === "ar") {
    const thanks = offer ? `، وبعد إكماله لك ${offer} على طلبك القادم 🎁` : "";
    return `هلا ${customerName} 🌿\n\nسعدنا بخدمتك في ${brandName}، ونتمنى أن طلبك رقم ${orderNumberText(invoiceNumber, numberFormat)} نال رضاك.\n\nشاركنا رأيك بتقييم سريع لا يستغرق أكثر من 30 ثانية${thanks}\n\n${reviewUrl}\n\nرأيك يفرق معنا ويساعدنا نقدم لك تجربة أجمل دائمًا 🤍`;
  }
  const thanks = offer ? ` and get ${offer} your next order 🎁` : "";
  return `Hi ${customerName} 🌿\n\nWe loved serving you at ${brandName}. Share a quick review of order ${orderNumberLabel(invoiceNumber, numberFormat)} in under 30 seconds${thanks}\n\n${reviewUrl}\n\nYour feedback helps us make every experience better 🤍`;
}
