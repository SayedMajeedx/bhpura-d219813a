import type { GiftCardPurchase } from "@/lib/data/gift-cards/online";

/**
 * Selling cards online, on the store's side (step four of docs/gift-cards-plan.md): the amounts
 * typed as one line, the purchases staff act on first, and how a purchase reads.
 */

/** "25, 50 100" → [25, 50, 100]: positive, at most 8, no repeats, smallest first. */
export function amountsFromText(text: string): { amounts: number[]; invalid: boolean } {
  const parts = text
    .split(/[\s,،؛;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const numbers = parts.map((part) =>
    Number(part.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))),
  );
  const invalid = numbers.some((n) => !Number.isFinite(n) || n <= 0 || n > 100_000);
  const amounts = [...new Set(numbers.filter((n) => Number.isFinite(n) && n > 0 && n <= 100_000))]
    .map((n) => Math.round(n * 1000) / 1000)
    .sort((a, b) => a - b);
  return { amounts, invalid: invalid || amounts.length > 8 };
}

export const amountsText = (amounts: readonly number[]) => amounts.join(", ");

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
