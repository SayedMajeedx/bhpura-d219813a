import type { AdvanceSplit } from "@/lib/payments/advance-payment";

/**
 * A gift card at checkout, before the order is placed: what it would pay and what is left. The
 * database decides what it takes once the order exists (`redeem_gift_card_at_checkout`: at most
 * its balance and what is owed); this is the preview the summary draws. A card is a payment, not
 * a discount: the order's total, its VAT and its advance stay as they are, and the card pays
 * toward them, what is asked now first.
 */

export type AppliedGiftCard = { code: string; balance: number; currency: string };

export type GiftCardPay = {
  /** What the card pays on the order. */
  used: number;
  /** What is still owed after it, now and later together. */
  left: number;
  /** What the shopper still pays now (the card, the transfer); 0 on cash on delivery. */
  payNow: number;
  /** The card pays all that would be asked now: no transfer receipt, no card gateway. */
  coversNow: boolean;
};

const fils = (n: number) => Math.round(n * 1000) / 1000;

export function giftCardPay(
  card: AppliedGiftCard | null,
  grandTotal: number,
  advance: AdvanceSplit,
  method: string,
): GiftCardPay | null {
  if (!card || !(card.balance > 0) || !(grandTotal > 0)) return null;
  const used = fils(Math.min(card.balance, grandTotal));
  const left = fils(grandTotal - used);
  const upfront = advance.applies ? advance.dueNow : method === "cod" ? 0 : grandTotal;
  const payNow = fils(Math.max(0, upfront - used));
  return { used, left, payNow, coversNow: method !== "cod" && payNow <= 0 };
}

/** The advance notice once a card paid part: what is still asked now and what stays due. */
export function advanceAfterGiftCard(advance: AdvanceSplit, pay: GiftCardPay | null): AdvanceSplit {
  if (!pay || !advance.applies) return advance;
  return {
    ...advance,
    applies: pay.payNow > 0,
    dueNow: pay.payNow,
    balance: fils(Math.max(0, pay.left - pay.payNow)),
  };
}

/** A card's code as the shopper may type it: spaces and dashes are the store's way of writing. */
export function typedGiftCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}
