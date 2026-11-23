import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { formatMoney } from "@/lib/format";
import { invalidateOrders } from "@/lib/data/orders/mutations";
import { giftCardQueries, invalidateGiftCards, undoGiftCardPayment } from "@/lib/data/gift-cards";
import { cardTail, cardsOnOrder, owedAfterUndo, type CardOnOrder } from "../lib/card-payments";
import { giftCardError } from "../lib/gift-cards";

type PaidOrder = {
  id: string;
  brand_id?: string | null;
  total?: number | null;
  advance_paid?: number | null;
};

/**
 * Under "Paid by gift card" on an order's money card: each card that still holds money on the
 * order, and undoing its payment (a card taken by mistake), which gives the card back what it paid
 * and leaves the order owing it (`undo_gift_card_payment`). Staff who handle orders, while the
 * order is saved as shown; a voided card's payment is not undone (its money was written off).
 */
export function OrderGiftCardsPaid({
  order,
  canUndo,
  currency,
  lang,
}: {
  order: PaidOrder;
  /** Staff who handle orders, with the order saved as shown. */
  canUndo: boolean;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const moves = useQuery(giftCardQueries.order(order.brand_id ?? "", order.id)).data;
  const cards = cardsOnOrder(moves ?? []);
  const money = (n: number) => formatMoney(n, currency, lang);
  if (cards.length === 0) return null;

  const undo = async (card: CardOnOrder) => {
    const ok = await confirmDialog({
      title: isAr ? "إلغاء الدفع بهذه البطاقة؟" : "Undo this card's payment?",
      description: isAr
        ? "يعود المبلغ إلى البطاقة فتصلح للدفع من جديد، ويعود الطلب مستحقاً له. يبقى الطلب مؤكداً، وتُسجَّل الخطوة في نشاطه."
        : "The amount goes back to the card, which can pay again, and the order owes it again. The order stays confirmed, and the step is kept in its activity.",
      confirmLabel: isAr ? "إلغاء الدفع" : "Undo payment",
      destructive: true,
      facts: [
        { label: isAr ? "البطاقة" : "Card", value: <bdi dir="ltr">{card.code}</bdi> },
        {
          label: isAr ? "يعود إلى البطاقة" : "Back to the card",
          value: <bdi dir="ltr">{money(card.held)}</bdi>,
        },
        {
          label: isAr ? "يصبح المستحق على الطلب" : "The order will owe",
          value: <bdi dir="ltr">{money(owedAfterUndo(order, card.held))}</bdi>,
        },
      ],
    });
    if (!ok) return;
    setBusy(card.cardId);
    try {
      const result = await undoGiftCardPayment(order.id, card.cardId);
      toast.success(
        isAr
          ? `أُعيد ${money(result.amount)} إلى البطاقة ${cardTail(card.code)}.`
          : `${money(result.amount)} went back to card ${cardTail(card.code)}.`,
      );
      if (order.brand_id) {
        await Promise.all([
          invalidateOrders(qc, order.brand_id),
          invalidateGiftCards(qc, order.brand_id),
        ]);
      }
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="space-y-1">
      {cards.map((card) => (
        <li key={card.cardId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-2">
            <bdi className="font-mono text-muted-foreground" dir="ltr">
              {card.code}
            </bdi>
            <bdi className="font-mono font-semibold" dir="ltr">
              {money(card.held)}
            </bdi>
          </span>
          {canUndo && !card.voided && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={busy !== null}
              onClick={() => void undo(card)}
              aria-label={
                isAr
                  ? `إلغاء الدفع بالبطاقة ${cardTail(card.code)}`
                  : `Undo the payment by card ${cardTail(card.code)}`
              }
            >
              <Undo2 className="size-3.5" aria-hidden />
              {isAr ? "إلغاء الدفع" : "Undo"}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
