import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import {
  giftCardQueries,
  invalidateGiftCards,
  voidGiftCard,
  type GiftCard,
} from "@/lib/data/gift-cards";
import { localToday } from "@/features/supplier-orders/lib/order-state";
import { CARD_STATE_WORDS, MOVE_WORDS, cardState, giftCardError } from "../lib/gift-cards";
import { GiftCardShare } from "./GiftCardShare";

/** One card: what it holds, its code and message, its moves, and voiding it with a reason. */
export function GiftCardDetailsSheet({
  card,
  brandId,
  lang,
  onClose,
}: {
  card: GiftCard | null;
  brandId: string;
  lang: "ar" | "en";
  onClose: () => void;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const moves = useQuery({
    ...giftCardQueries.moves(brandId, card?.id ?? ""),
    enabled: Boolean(card),
  }).data;
  if (!card) return null;
  const state = cardState(card, localToday());
  const money = (n: number) => formatMoney(n, card.currency, lang);

  const voidCard = async () => {
    setVoiding(true);
    try {
      await voidGiftCard(card.id, reason.trim());
      await invalidateGiftCards(qc, brandId);
      toast.success(isAr ? "أُلغيت البطاقة" : "Card voided");
      onClose();
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setVoiding(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent dir={isAr ? "rtl" : "ltr"} className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {money(Number(card.balance))}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {isAr
                ? `من ${money(Number(card.initial_amount))}`
                : `of ${money(Number(card.initial_amount))}`}
            </span>
          </SheetTitle>
          <SheetDescription>
            {CARD_STATE_WORDS[state][lang]}
            {card.recipient_name ? ` · ${isAr ? "لـ" : "for"} ${card.recipient_name}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {state === "active" && <GiftCardShare card={card} lang={lang} />}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{isAr ? "الحركات" : "Moves"}</h3>
            <ol className="divide-y divide-border rounded-xl border border-border">
              {(moves ?? []).map((move) => (
                <li
                  key={move.id}
                  className="flex items-start justify-between gap-3 px-3 py-2 text-xs"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {MOVE_WORDS[move.kind]?.[lang] ?? move.kind}
                    </span>
                    <span className="text-muted-foreground" dir="ltr">
                      {new Date(move.created_at).toLocaleString(isAr ? "ar-BH-u-nu-latn" : "en-GB")}
                    </span>
                    {move.note && <span className="block text-muted-foreground">{move.note}</span>}
                  </span>
                  <span className="shrink-0 font-mono" dir="ltr">
                    {Number(move.amount) > 0 ? "+" : "−"}
                    {money(Math.abs(Number(move.amount)))}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {card.status === "voided" ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {isAr ? "سبب الإلغاء: " : "Voided because: "}
              {card.void_reason}
            </p>
          ) : (
            <section className="space-y-2 rounded-xl border border-destructive/30 p-3">
              <Label htmlFor="gift-void-reason" className="text-sm font-semibold">
                {isAr ? "إلغاء البطاقة" : "Void the card"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "يُشطب ما تبقى فيها ولا يمكن الدفع بها بعد ذلك. تبقى في السجل."
                  : "What it holds is written off and it can no longer pay. It stays on record."}
              </p>
              <Textarea
                id="gift-void-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={isAr ? "السبب" : "Why"}
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={voiding || !reason.trim()}
                onClick={voidCard}
              >
                {isAr ? "إلغاء البطاقة" : "Void card"}
              </Button>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
