import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GiftCard } from "@/lib/data/gift-cards";
import { GiftCardDesigner } from "@/features/gift-card-design/components/GiftCardDesigner";
import { CardKeepActions } from "@/features/gift-card-design/components/CardKeepActions";
import { DEFAULT_DESIGN, type CardDesign } from "@/features/gift-card-design/lib/design";
import { occasionsInOrder } from "@/features/gift-card-design/lib/occasions";
import { useAdminCardKit } from "../hooks/use-admin-card-kit";

/**
 * A card printed in the store, to hand over in an envelope or send as a picture: the same designs
 * the storefront offers, with the card's own value, code and names.
 */
export function PrintCardButton({ card, lang }: { card: GiftCard; lang: "ar" | "en" }) {
  const [open, setOpen] = useState(false);
  const isAr = lang === "ar";
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={() => setOpen(true)}
      >
        <Printer className="size-4" aria-hidden />
        {isAr ? "طباعة البطاقة أو حفظها" : "Print or save the card"}
      </Button>
      {open && <PrintCardDialog card={card} lang={lang} onClose={() => setOpen(false)} />}
    </>
  );
}

function PrintCardDialog({
  card,
  lang,
  onClose,
}: {
  card: GiftCard;
  lang: "ar" | "en";
  onClose: () => void;
}) {
  const isAr = lang === "ar";
  const kit = useAdminCardKit();
  const [design, setDesign] = useState<CardDesign>(() => ({
    ...DEFAULT_DESIGN,
    occasion: occasionsInOrder(new Date(), card.currency)[0].id,
    language: lang,
    from: card.purchaser_name ?? null,
  }));
  const details = {
    amount: Number(card.balance),
    code: card.code,
    to: card.recipient_name,
    message: card.note,
    expiresOn: card.expires_on,
  };
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
            details={details}
            primary={lang}
            lang={lang}
          />
          <div className="space-y-1.5">
            <Label htmlFor={`print-from-${card.id}`}>
              {isAr ? "من (على ظهر البطاقة)" : "From (on the back)"}
            </Label>
            <Input
              id={`print-from-${card.id}`}
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
            fileName={`gift-card-${card.code}`}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
