import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GiftCard, GiftCardPurchase } from "@/lib/data/gift-cards";
import { GiftCardDesigner } from "@/features/gift-card-design/components/GiftCardDesigner";
import { CardKeepActions } from "@/features/gift-card-design/components/CardKeepActions";
import type { CardDetails } from "@/features/gift-card-design/lib/content";
import type { CardDesign } from "@/features/gift-card-design/lib/design";
import { cardPrintStart } from "../lib/card-print";
import { useAdminCardKit } from "../hooks/use-admin-card-kit";
import { MESSAGE_SIZES, type MessageSize } from "@/features/gift-card-design/lib/message-card";

const SIZE_WORDS: Record<MessageSize, { ar: string; en: string }> = {
  small: { ar: "أصغر", en: "Smaller" },
  auto: { ar: "تلقائي", en: "Automatic" },
  large: { ar: "أكبر", en: "Larger" },
};

/** What the print dialog draws: the card's own value, code and names, and the design to start on. */
type PrintSource = {
  id: string;
  code: string;
  details: CardDetails;
  initial: CardDesign;
  /** The dialog's title and the saved file's name, when not a gift card's. */
  title?: string;
  fileName?: string;
};

/**
 * A card printed in the store, to hand over in an envelope or send as a picture: the same designs
 * the storefront offers, with the card's own value and code. A card bought on the storefront opens
 * on what its buyer chose (`purchase`: the design, who it is from, the message).
 */
export function PrintCardButton({
  card,
  purchase,
  lang,
}: {
  card: GiftCard;
  purchase?: GiftCardPurchase | null;
  lang: "ar" | "en";
}) {
  return (
    <PrintButton
      lang={lang}
      wide
      label={lang === "ar" ? "طباعة البطاقة أو حفظها" : "Print or save the card"}
      source={() => ({ id: card.id, code: card.code, ...cardPrintStart(card, purchase, lang) })}
    />
  );
}

/**
 * A card bought online that the store prints and delivers: it opens on the design the buyer
 * chose, at the card's value (the printing fee is never on the card), with the buyer's words.
 */
export function PrintOrderCardButton({
  purchase,
  lang,
}: {
  purchase: GiftCardPurchase;
  lang: "ar" | "en";
}) {
  const card = purchase.gift_cards;
  if (!card?.code) return null;
  const code = card.code;
  return (
    <PrintButton
      lang={lang}
      label={lang === "ar" ? "طباعة البطاقة" : "Print the card"}
      source={() => {
        const start = cardPrintStart(
          {
            code,
            balance: purchase.amount,
            currency: purchase.currency,
            expires_on: card.expires_on,
            recipient_name: purchase.recipient_name,
            purchaser_name: null,
            note: null,
          },
          purchase,
          lang,
        );
        return { id: purchase.id, code, ...start };
      }}
    />
  );
}

export function PrintButton({
  lang,
  label,
  source,
  wide = false,
}: {
  lang: "ar" | "en";
  label: string;
  source: () => PrintSource;
  wide?: boolean;
}) {
  const [open, setOpen] = useState<PrintSource | null>(null);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={wide ? "default" : "sm"}
        className={wide ? "w-full gap-2" : "gap-1.5"}
        onClick={() => setOpen(source())}
      >
        <Printer className="size-4" aria-hidden />
        {label}
      </Button>
      {open && <PrintCardDialog source={open} lang={lang} onClose={() => setOpen(null)} />}
    </>
  );
}

function PrintCardDialog({
  source,
  lang,
  onClose,
}: {
  source: PrintSource;
  lang: "ar" | "en";
  onClose: () => void;
}) {
  const isAr = lang === "ar";
  const kit = useAdminCardKit();
  const [design, setDesign] = useState<CardDesign>(source.initial);
  // A gift message card's words can be written or put right before printing; a gift card's are
  // its own record.
  const [details, setDetails] = useState<CardDetails>(source.details);
  const editable = source.details.purpose === "message";
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="max-h-[92vh] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{source.title ?? (isAr ? "بطاقة للطباعة" : "Card to print")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <GiftCardDesigner
            kit={kit}
            value={design}
            onChange={setDesign}
            details={details}
            primary={lang}
            lang={lang}
          />
          {editable && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`print-to-${source.id}`}>{isAr ? "إلى" : "To"}</Label>
                <Input
                  id={`print-to-${source.id}`}
                  value={details.to ?? ""}
                  onChange={(e) => setDetails((d) => ({ ...d, to: e.target.value || null }))}
                  maxLength={80}
                  dir="auto"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`print-message-${source.id}`}>
                  {isAr ? "رسالة الإهداء" : "Gift message"}
                </Label>
                <Textarea
                  id={`print-message-${source.id}`}
                  value={details.message ?? ""}
                  onChange={(e) => setDetails((d) => ({ ...d, message: e.target.value || null }))}
                  maxLength={400}
                  rows={3}
                  dir="auto"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{isAr ? "حجم خط الرسالة" : "Message size"}</p>
                <div
                  role="radiogroup"
                  aria-label={isAr ? "حجم خط الرسالة" : "Message size"}
                  className="flex flex-wrap gap-2"
                >
                  {MESSAGE_SIZES.map((size) => {
                    const on = (details.messageSize ?? "auto") === size;
                    return (
                      <Button
                        key={size}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        role="radio"
                        aria-checked={on}
                        className="rounded-full"
                        onClick={() => setDetails((d) => ({ ...d, messageSize: size }))}
                      >
                        {SIZE_WORDS[size][lang]}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`print-from-${source.id}`}>
              {isAr ? "من (على ظهر البطاقة)" : "From (on the back)"}
            </Label>
            <Input
              id={`print-from-${source.id}`}
              value={design.from ?? ""}
              onChange={(e) => setDesign((d) => ({ ...d, from: e.target.value || null }))}
              maxLength={80}
            />
          </div>
          <CardKeepActions
            kit={kit}
            design={design}
            details={details}
            primary={lang}
            lang={lang}
            fileName={source.fileName ?? `gift-card-${source.code}`}
            printing
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
