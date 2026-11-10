import { Gift } from "lucide-react";
import { readGiftOrderNote } from "@/lib/gift-order-note";
import { DEFAULT_DESIGN } from "@/features/gift-card-design/lib/design";
import { PrintButton } from "./PrintCardDialog";

/**
 * A gift order's message card: the shopper's words for the person receiving it, in the same
 * designs as the store's gift cards but holding no money (`purpose: "message"`), printed to fold,
 * glue and cut like a gift card (`foldSheet`), on A6, or saved as a picture. Shown on the order
 * page only when the order is a gift (`readGiftOrderNote`).
 */
export function GiftMessageCardBlock({
  notes,
  invoiceNumber,
  lang,
}: {
  notes: string | null | undefined;
  invoiceNumber: number | null | undefined;
  lang: "ar" | "en";
}) {
  const gift = readGiftOrderNote(notes);
  if (!gift) return null;
  const isAr = lang === "ar";
  const ref = invoiceNumber ?? "order";
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gift className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground">
            {isAr ? "بطاقة الإهداء" : "Gift message card"}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {gift.recipient ? `${isAr ? "إلى" : "To"} ${gift.recipient}` : null}
            {gift.recipient && gift.message ? " · " : null}
            {gift.message ? (
              <span dir="auto" className="line-clamp-2 break-words">
                {gift.message}
              </span>
            ) : isAr ? (
              "لم يكتب العميل رسالة: اكتبها في البطاقة قبل الطباعة."
            ) : (
              "The customer wrote no message: add one on the card before printing."
            )}
          </p>
        </div>
      </div>
      <PrintButton
        lang={lang}
        label={isAr ? "طباعة بطاقة الإهداء" : "Print the gift card"}
        source={() => ({
          id: `gift-message-${ref}`,
          code: String(ref),
          title: isAr ? "بطاقة الإهداء للطباعة" : "Gift message card to print",
          fileName: `gift-message-${ref}`,
          details: {
            amount: null,
            code: null,
            to: gift.recipient,
            message: gift.message,
            expiresOn: null,
            purpose: "message",
          },
          initial: { ...DEFAULT_DESIGN, occasion: "gift", language: lang, from: null },
        })}
      />
    </div>
  );
}
