import { Gift } from "lucide-react";
import { orderGift } from "@/lib/gift-order";
import { DEFAULT_DESIGN, isDesignId } from "@/features/gift-card-design/lib/design";
import { isArabic } from "@/features/gift-card-design/lib/type";
import { PrintButton } from "./PrintCardDialog";

/** The card's language: the message's (or the recipient's name's), else the screen's. */
export function cardLanguage(
  gift: { recipient: string | null; message: string | null },
  lang: "ar" | "en",
): "ar" | "en" {
  const text = gift.message || gift.recipient;
  if (!text) return lang;
  return isArabic(text) ? "ar" : "en";
}

/**
 * A gift order's message card: the shopper's words for the person receiving it, in the same
 * designs as the store's gift cards but holding no money (`purpose: "message"`), printed to fold,
 * glue and cut like a gift card (`foldSheet`), on A6, or saved as a picture. Shown on the order
 * page only when the order is a gift (`orderGift`: the order's own details, else what an older
 * checkout wrote in its notes), in the colour the shopper chose and with who it is from.
 */
export function GiftMessageCardBlock({
  gift: own,
  notes,
  invoiceNumber,
  lang,
}: {
  /** The order's own gift details (`orders.gift`). */
  gift?: unknown;
  notes: string | null | undefined;
  invoiceNumber: number | null | undefined;
  lang: "ar" | "en";
}) {
  const gift = orderGift({ gift: own, notes });
  if (!gift) return null;
  const isAr = lang === "ar";
  const ref = invoiceNumber ?? "order";
  // Who it is for and who it is from, as far as the shopper said.
  const names = [
    gift.recipient ? `${isAr ? "إلى" : "To"} ${gift.recipient}` : null,
    gift.from ? `${isAr ? "من" : "From"} ${gift.from}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gift className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground">
            {gift.card
              ? isAr
                ? "بطاقة الإهداء"
                : "Gift message card"
              : isAr
                ? "طلب هدية بلا بطاقة"
                : "A gift order with no card"}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {names}
            {gift.card && names && gift.message ? " · " : null}
            {!gift.card ? null : gift.message ? (
              <span dir="auto" className="line-clamp-2 break-words">
                {gift.message}
              </span>
            ) : isAr ? (
              "لم يكتب العميل رسالة: اكتبها في البطاقة قبل الطباعة."
            ) : (
              "The customer wrote no message: add one on the card before printing."
            )}
          </p>
          {/* What to prepare with the gift (a bouquet), as the shopper added it. */}
          {gift.addons.length > 0 && (
            <p className="mt-1 text-xs font-medium break-words text-foreground" dir="auto">
              {isAr ? "مع: " : "With: "}
              {gift.addons
                .map((addon) => {
                  const name = isAr ? addon.nameAr : addon.nameEn;
                  return addon.quantity > 1 ? `${name} × ${addon.quantity}` : name;
                })
                .join(isAr ? "، " : ", ")}
            </p>
          )}
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
          // The card speaks the message's language, whatever the screen's.
          initial: {
            ...DEFAULT_DESIGN,
            occasion: "gift",
            // The colour the shopper chose at checkout, when they chose one.
            ...(isDesignId(gift.design) ? { design: gift.design } : {}),
            language: cardLanguage(gift, lang),
            from: gift.from,
          },
        })}
      />
    </div>
  );
}
