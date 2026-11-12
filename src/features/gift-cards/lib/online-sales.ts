import type { GiftCardPurchase } from "@/lib/data/gift-cards/online";

/**
 * Selling cards online, on the store's side (step four of docs/gift-cards-plan.md): the range of
 * amounts a buyer chooses from, the purchases staff act on first, and how a purchase reads.
 */

const westernDigits = (text: string) =>
  text.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

export type RangeProblem = "missing" | "whole" | "order" | "too_high";

/**
 * The least and most amount a buyer may choose, as typed ("5", "٤٠"): whole numbers from 1 to
 * 100,000, the least not above the most (the database's `gift_card_settings_range_check`).
 */
export function rangeFromText(
  minText: string,
  maxText: string,
): { min: number; max: number; problem: null } | { problem: RangeProblem } {
  const lo = westernDigits(minText);
  const hi = westernDigits(maxText);
  if (!lo || !hi) return { problem: "missing" };
  if (!/^\d+$/.test(lo) || !/^\d+$/.test(hi)) return { problem: "whole" };
  const min = Number(lo);
  const max = Number(hi);
  if (min < 1 || min > max) return { problem: "order" };
  if (max > 100_000) return { problem: "too_high" };
  return { min, max, problem: null };
}

/** A saved store's range, as its fields open: its own, else its old list's least and most. */
export function rangeText(
  settings: {
    min_amount?: number | null;
    max_amount?: number | null;
    amounts?: readonly number[] | null;
  } | null,
): { min: string; max: string } {
  if (settings?.min_amount != null && settings.max_amount != null) {
    return { min: String(Number(settings.min_amount)), max: String(Number(settings.max_amount)) };
  }
  const amounts = (settings?.amounts ?? []).map(Number).filter((n) => n > 0);
  if (amounts.length === 0) return { min: "5", max: "100" };
  return {
    min: String(Math.max(1, Math.ceil(Math.min(...amounts)))),
    max: String(Math.floor(Math.max(...amounts))),
  };
}

/** The printing fee as typed ("2.5", "٢٫٥"): 0 to 1000 to the fils, or null when it is not one. */
export function printFeeFromText(text: string): number | null {
  const western = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٫,]/g, ".");
  if (western === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(western)) return null;
  const fee = Number(western);
  if (!Number.isFinite(fee) || fee < 0 || fee > 1000) return null;
  return Math.round(fee * 1000) / 1000;
}

/** Transfers still waiting for the store to check them, the oldest first. */
export function waitingTransfers(purchases: readonly GiftCardPurchase[]): GiftCardPurchase[] {
  return purchases
    .filter((p) => p.payment_method === "benefit" && p.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export const PURCHASE_WORDS: Record<string, { ar: string; en: string }> = {
  pending: { ar: "بانتظار الدفع", en: "Waiting for payment" },
  pending_transfer: { ar: "تحويل بانتظار التحقق", en: "Transfer to check" },
  paid: { ar: "صدرت البطاقة", en: "Card issued" },
  cancelled: { ar: "أُلغي", en: "Cancelled" },
  expired: { ar: "لم يكتمل", en: "Not completed" },
};

export function purchaseWords(purchase: Pick<GiftCardPurchase, "status" | "payment_method">) {
  if (purchase.status === "pending" && purchase.payment_method === "benefit") {
    return PURCHASE_WORDS.pending_transfer;
  }
  return PURCHASE_WORDS[purchase.status] ?? PURCHASE_WORDS.pending;
}

export const VALIDITY_CHOICES = [null, 6, 12, 24] as const;

/**
 * Paid purchases whose buyer chose WhatsApp and whose code no one has sent yet, the oldest first:
 * a person sends each (there is no WhatsApp connection), and "Send code" records it
 * (`mark_gift_card_purchase_sent`). A buyer who chose email is sent theirs by the system.
 */
export function codesToSend(purchases: readonly GiftCardPurchase[]): GiftCardPurchase[] {
  return purchases
    .filter(
      (p) =>
        p.status === "paid" &&
        p.delivery_channel === "whatsapp" &&
        !p.code_sent_at &&
        Boolean(p.gift_cards?.code),
    )
    .sort((a, b) => (a.paid_at ?? a.created_at).localeCompare(b.paid_at ?? b.created_at));
}
