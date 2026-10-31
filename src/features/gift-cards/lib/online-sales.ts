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

/** How the buyer asked to receive the code, for staff. */
export function deliveryWords(
  purchase: Pick<GiftCardPurchase, "delivery_channel" | "buyer_phone" | "buyer_email">,
  lang: "ar" | "en",
): string {
  if (purchase.delivery_channel === "email") {
    return lang === "ar"
      ? `الرمز بالبريد إلى ${purchase.buyer_email ?? ""}`
      : `Code by email to ${purchase.buyer_email ?? ""}`;
  }
  return lang === "ar"
    ? `الرمز على واتساب إلى ${purchase.buyer_phone ?? ""}`
    : `Code on WhatsApp to ${purchase.buyer_phone ?? ""}`;
}

/** Where a paid purchase's code stands: emailed by the system, sent by a person, or still to send. */
export function codeSentWords(
  purchase: Pick<GiftCardPurchase, "status" | "delivery_channel" | "code_sent_at">,
  lang: "ar" | "en",
): string | null {
  if (purchase.status !== "paid") return null;
  if (purchase.delivery_channel === "email") {
    return lang === "ar" ? "أُرسل الرمز بالبريد تلقائيًا" : "Code emailed automatically";
  }
  if (purchase.code_sent_at)
    return lang === "ar" ? "أُرسل الرمز على واتساب" : "Code sent on WhatsApp";
  return lang === "ar" ? "الرمز لم يُرسل بعد" : "Code not sent yet";
}
