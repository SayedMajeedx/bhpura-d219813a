import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { useProfileOptional } from "@/lib/profile-context";
import { invalidateOrders } from "@/lib/data/orders/mutations";
import { invalidateGiftCards, redeemGiftCardOnOrder } from "@/lib/data/gift-cards";
import { giftCardError, orderGiftCardOffer } from "../lib/gift-cards";
import { OrderGiftCardsPaid } from "./OrderGiftCardsPaid";

type PayableOrder = {
  id: string;
  brand_id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  total?: number | null;
  advance_paid?: number | null;
  gift_card_paid?: number | null;
};

/**
 * On an order's money card: what gift cards paid, and taking one as payment (staff who handle
 * orders). On a card-payment order a gift card pays all that is owed, as the database asks; on a
 * draft (an order typed in the admin, before its first step) taking it confirms the order.
 *
 * It waits while the order is not saved as shown (`unsaved`, or a new order): the database takes
 * what the saved order owes. Nothing is written into the editor's copy of the order: the orders'
 * cache is read again, and the page takes the saved order (paid, confirmed) from it.
 */
export function OrderGiftCardPayment({
  order,
  unsaved = false,
  currency,
  lang,
}: {
  order: PayableOrder;
  /** The editor holds changes not saved yet. */
  unsaved?: boolean;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const profile = useProfileOptional();
  const canTake = profile?.hasPermission?.("manage_orders") ?? false;
  const [open, setOpen] = useState(false);
  const offer = orderGiftCardOffer(order);
  const paid = Number(order.gift_card_paid ?? 0);
  const money = (n: number) => formatMoney(n, currency, lang);
  if (paid <= 0 && (!offer || !canTake)) return null;
  const waiting = unsaved || !order.id;

  return (
    <div className="space-y-2 rounded-xl border border-border-subtle p-3">
      {paid > 0 && (
        <p className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Gift className="size-3.5" aria-hidden />
            {isAr ? "دُفع ببطاقة هدية" : "Paid by gift card"}
          </span>
          <span className="font-mono font-semibold" dir="ltr">
            {money(paid)}
          </span>
        </p>
      )}
      {paid > 0 && order.id && (
        <OrderGiftCardsPaid
          order={order}
          canUndo={canTake && !waiting}
          currency={currency}
          lang={lang}
        />
      )}
      {offer && canTake && (!open || waiting) && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            disabled={waiting}
            onClick={() => setOpen(true)}
          >
            <Gift className="size-4" aria-hidden />
            {isAr ? "الدفع ببطاقة هدية" : "Pay with a gift card"}
          </Button>
          {waiting && (
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "احفظ الطلب أولاً، ثم ادفع ببطاقة الهدية."
                : "Save the order first, then pay with the gift card."}
            </p>
          )}
        </>
      )}
      {offer && canTake && open && !waiting && (
        <GiftCardRedeemForm
          order={order}
          offer={offer}
          currency={currency}
          lang={lang}
          onDone={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** The card's code (and the amount, when it may pay a part), and taking it: the open form only. */
function GiftCardRedeemForm({
  order,
  offer,
  currency,
  lang,
  onDone,
}: {
  order: PayableOrder;
  offer: { owed: number; mustCoverAll: boolean; confirms: boolean };
  currency: string;
  lang: "ar" | "en";
  onDone: () => void;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const money = (n: number) => formatMoney(n, currency, lang);

  const submit = async () => {
    setBusy(true);
    try {
      const asked = !offer.mustCoverAll && amount.trim() ? Number(amount) : null;
      const result = await redeemGiftCardOnOrder(order.id, code, asked);
      const confirmed = result.confirmed
        ? isAr
          ? " تأكّد الطلب."
          : " The order is confirmed."
        : "";
      toast.success(
        isAr
          ? `دُفع ${money(result.amount)} ببطاقة الهدية. المتبقي في البطاقة ${money(result.balance)}.${confirmed}`
          : `${money(result.amount)} paid by gift card. ${money(result.balance)} left on the card.${confirmed}`,
      );
      onDone();
      setCode("");
      setAmount("");
      if (order.brand_id) {
        await Promise.all([
          invalidateOrders(qc, order.brand_id),
          invalidateGiftCards(qc, order.brand_id),
        ]);
      }
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={`gift-code-${order.id}`} className="text-xs">
          {isAr ? "رمز البطاقة" : "Card code"}
        </Label>
        <Input
          id={`gift-code-${order.id}`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          dir="ltr"
          autoComplete="off"
          className="font-mono uppercase"
          placeholder="XXXX-XXXX-XXXX"
        />
      </div>
      {offer.confirms && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "الطلب مسودة: الدفع بالبطاقة يؤكّده ويحجز قطعه من المخزون."
            : "This order is a draft: paying with the card confirms it and holds its pieces from stock."}
        </p>
      )}
      {offer.mustCoverAll ? (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? `طلب دفع بالبطاقة: تدفع بطاقة الهدية كل المتبقي (${money(offer.owed)}).`
            : `A card-payment order: the gift card pays all that is owed (${money(offer.owed)}).`}
        </p>
      ) : (
        <div className="space-y-1">
          <Label htmlFor={`gift-amount-${order.id}`} className="text-xs">
            {isAr ? `المبلغ (حتى ${money(offer.owed)})` : `Amount (up to ${money(offer.owed)})`}
          </Label>
          <Input
            id={`gift-amount-${order.id}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            placeholder={isAr ? "كل ما يمكن" : "As much as it can"}
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={busy || code.trim().length < 12}
          onClick={submit}
        >
          {busy ? (isAr ? "جارٍ الدفع…" : "Paying…") : isAr ? "ادفع بالبطاقة" : "Pay with the card"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}
