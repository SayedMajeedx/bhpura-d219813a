import { readGiftOrderNote } from "@/lib/gift-order-note";
import { readOrderGiftAddons, type OrderGiftAddon } from "@/lib/gift-addons";

/**
 * A gift order by the store's own settings (migration 20261202100000): whether the store takes
 * gift orders, whether it offers a gift message card and at what price, and whether a gift order
 * is paid before it is sent. The database holds the rules and the price (`apply_order_gift`);
 * these say them first, for the checkout's total and the screens.
 */

export type GiftOrderOptions = {
  /** The store takes gift orders. */
  enabled: boolean;
  /** It offers a gift message card with them. */
  card: boolean;
  /** The card's price in the store's currency; 0 is free. */
  cardPrice: number;
  /** A gift order is not paid on delivery. */
  prepaid: boolean;
};

/** A store that set nothing: gift orders on, a free card, any payment (as before the settings). */
export const DEFAULT_GIFT_OPTIONS: GiftOrderOptions = {
  enabled: true,
  card: true,
  cardPrice: 0,
  prepaid: false,
};

/** The store's offer as the database answers it (`storefront_gift_order_options`). */
export function readGiftOptions(raw: unknown): GiftOrderOptions {
  if (!raw || typeof raw !== "object") return DEFAULT_GIFT_OPTIONS;
  const value = raw as Record<string, unknown>;
  const price = Number(value.card_price);
  const enabled = value.enabled !== false;
  return {
    enabled,
    card: enabled && value.card !== false,
    cardPrice: Number.isFinite(price) && price > 0 ? price : 0,
    prepaid: value.prepaid === true,
  };
}

/**
 * The one look of a gift message card: the store's colour on white in the signature card's gold
 * frame (the owner's decision of 2026-11-12: the shopper does not choose a colour).
 */
export const GIFT_MESSAGE_CARD_DESIGN = "signature:brand";

/** What the shopper chose for a gift order at checkout. */
export type GiftChoice = {
  isGift: boolean;
  recipient: string;
  message: string;
  from: string;
  withCard: boolean;
};

/** Whether this order carries the card: a gift, the store offers one, the shopper kept it. */
export function giftHasCard(
  choice: Pick<GiftChoice, "isGift" | "withCard">,
  options: GiftOrderOptions,
): boolean {
  return choice.isGift && options.enabled && options.card && choice.withCard;
}

/** What the card adds to the order's subtotal (before tax; a code and the offers never reach it). */
export function giftCardFee(
  choice: Pick<GiftChoice, "isGift" | "withCard">,
  options: GiftOrderOptions,
): number {
  return giftHasCard(choice, options) ? options.cardPrice : 0;
}

/** A gift order as the order builder takes it. */
export type GiftOrderPayload = {
  recipient: string | null;
  from: string | null;
  card: boolean;
  message?: string | null;
  design?: string;
  /** The add-ons chosen (`addonsPayload`): ids and quantities, never a price. */
  addons?: Array<{ id: string; quantity: number }>;
};

/**
 * What checkout sends as `p_customer.gift`, or null for an order that is not a gift (or a store
 * that takes none). Never a price: the database reads the store's own.
 */
export function giftPayload(
  choice: GiftChoice,
  options: GiftOrderOptions,
  addons: Array<{ id: string; quantity: number }> = [],
): GiftOrderPayload | null {
  if (!choice.isGift || !options.enabled) return null;
  const card = giftHasCard(choice, options);
  return {
    recipient: choice.recipient.trim() || null,
    from: choice.from.trim() || null,
    card,
    ...(card ? { message: choice.message.trim() || null, design: GIFT_MESSAGE_CARD_DESIGN } : {}),
    ...(addons.length > 0 ? { addons } : {}),
  };
}

/** A gift order's details as staff read them. */
export type OrderGift = {
  recipient: string | null;
  message: string | null;
  from: string | null;
  /** The shopper asked for the message card (always true for an order from before the settings). */
  card: boolean;
  cardPrice: number;
  /** The card design the shopper chose, when they chose one. */
  design: string | null;
  /** What was added to the gift (a bouquet), to prepare with it. */
  addons: OrderGiftAddon[];
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * An order's gift details: its own (`orders.gift`), else what an older checkout wrote at the top
 * of its notes (`readGiftOrderNote`). Null when the order is not a gift.
 */
export function orderGift(order: { gift?: unknown; notes?: string | null }): OrderGift | null {
  const own = order.gift;
  if (own && typeof own === "object" && !Array.isArray(own)) {
    const value = own as Record<string, unknown>;
    const price = Number(value.card_price);
    return {
      recipient: text(value.recipient),
      message: text(value.message),
      from: text(value.from),
      card: value.card === true,
      cardPrice: Number.isFinite(price) && price > 0 ? price : 0,
      design: text(value.design),
      addons: readOrderGiftAddons(value.addons),
    };
  }
  const noted = readGiftOrderNote(order.notes);
  if (!noted) return null;
  return { ...noted, from: null, card: true, cardPrice: 0, design: null, addons: [] };
}

/** The price field of the settings: a number from 0 to 1000, or null when it is not one. */
export function giftPriceFromText(value: string): number | null {
  const cleaned = value.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (cleaned === "") return 0;
  const amount = Number(cleaned.replace("٫", "."));
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000) return null;
  return Math.round(amount * 1000) / 1000;
}

const REFUSALS: Record<string, { ar: string; en: string }> = {
  GIFT_ORDER_PREPAID: {
    ar: "طلب الهدية يُدفع مسبقًا. اختر طريقة دفع أخرى غير الدفع عند الاستلام.",
    en: "A gift order is paid in advance. Choose a payment method other than cash on delivery.",
  },
  GIFT_ORDER_NOT_OFFERED: {
    ar: "المتجر لا يستقبل طلبات الهدايا الآن. أزل خيار الهدية وأعد المحاولة.",
    en: "The store is not taking gift orders right now. Untick the gift option and try again.",
  },
  GIFT_MESSAGE_CARD_NOT_OFFERED: {
    ar: "بطاقة الإهداء غير متاحة الآن. أزلها وأعد المحاولة.",
    en: "The gift message card is not offered right now. Remove it and try again.",
  },
  GIFT_CARD_PRICE_INVALID: {
    ar: "اكتب سعرًا من 0 إلى 1000.",
    en: "Write a price from 0 to 1000.",
  },
  GIFT_ADDON_UNAVAILABLE: {
    ar: "إحدى إضافات الهدية لم تعد متاحة. أزلها وأعد المحاولة.",
    en: "One of the gift's add-ons is no longer available. Remove it and try again.",
  },
  GIFT_ADDON_PRICE_INVALID: {
    ar: "اكتب سعرًا أكبر من صفر وحتى 10000.",
    en: "Write a price above 0 and up to 10,000.",
  },
  GIFT_ADDON_NAME_REQUIRED: {
    ar: "اكتب اسم الإضافة.",
    en: "Write the add-on's name.",
  },
  GIFT_ADDON_NOT_FOUND: {
    ar: "لم نجد هذه الإضافة. حدّث الصفحة.",
    en: "This add-on was not found. Refresh the page.",
  },
  GIFT_COST_INVALID: {
    ar: "اكتب تكلفة من 0 إلى 10000.",
    en: "Write a cost from 0 to 10,000.",
  },
  FORBIDDEN: {
    ar: "لا تملك صلاحية تغيير الإعدادات.",
    en: "You may not change the settings.",
  },
};

/** The database's refusal of a gift order in the reader's language, or null when it is another. */
export function giftRefusal(message: string, lang: "ar" | "en"): string | null {
  const code = Object.keys(REFUSALS).find((key) => message.includes(key));
  return code ? REFUSALS[code][lang] : null;
}
