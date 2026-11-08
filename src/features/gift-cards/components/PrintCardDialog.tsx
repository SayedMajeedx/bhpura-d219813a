import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GiftCard, GiftCardPurchase } from "@/lib/data/gift-cards";
import { GiftCardDesigner } from "@/features/gift-card-design/components/GiftCardDesigner";
import { CardKeepActions } from "@/features/gift-card-design/components/CardKeepActions";
import type { CardDetails } from "@/features/gift-card-design/lib/content";
import {
  DEFAULT_DESIGN,
  readDesign,
  type CardDesign,
} from "@/features/gift-card-design/lib/design";
import { occasionsInOrder } from "@/features/gift-card-design/lib/occasions";
import { useAdminCardKit } from "../hooks/use-admin-card-kit";

/** What the print dialog draws: the card's own value, code and names, and the design to start on. */
type PrintSource = { id: string; code: string; details: CardDetails; initial: CardDesign };

/**
 * A card printed in the store, to hand over in an envelope or send as a picture: the same designs
 * the storefront offers, with the card's own value, code and names.
 */
export function PrintCardButton({ card, lang }: { card: GiftCard; lang: "ar" | "en" }) {
  return (
    <PrintButton
      lang={lang}
      wide
      label={lang === "ar" ? "طباعة البطاقة أو حفظها" : "Print or save the card"}
      source={() => ({
        id: card.id,
        code: card.code,
        details: {
          amount: Number(card.balance),
          code: card.code,
          to: card.recipient_name,
          message: card.note,
          expiresOn: card.expires_on,
        },
        initial: {
          ...DEFAULT_DESIGN,
          occasion: occasionsInOrder(new Date(), card.currency)[0].id,
          language: lang,
          from: card.purchaser_name ?? null,
        },
      })}
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
      source={() => ({
        id: purchase.id,
        code,
        details: {
          amount: Number(purchase.amount),
          code,
          to: purchase.recipient_name,
          message: purchase.message,
          expiresOn: card.expires_on,
        },
        initial: readDesign(purchase.design, purchase.lang === "en" ? "en" : "ar"),
      })}
    />
  );
}

function PrintButton({
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
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="max-h-[92vh] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{isAr ? "بطاقة للطباعة" : "Card to print"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <GiftCardDesigner
            kit={kit}
            value={design}
            onChange={setDesign}
            details={source.details}
            primary={lang}
            lang={lang}
          />
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
            details={source.details}
            primary={lang}
            lang={lang}
            fileName={`gift-card-${source.code}`}
            printing
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
