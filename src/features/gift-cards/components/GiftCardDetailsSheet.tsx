import { useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { formatMoney } from "@/lib/format";
import { useProfileOptional } from "@/lib/profile-context";
import { invalidateOrders } from "@/lib/data/orders/mutations";
import {
  giftCardQueries,
  invalidateGiftCards,
  undoGiftCardPayment,
  voidGiftCard,
  type GiftCard,
  type GiftCardPurchase,
} from "@/lib/data/gift-cards";
import { localToday } from "@/features/supplier-orders/lib/order-state";
import {
  CARD_STATE_WORDS,
  MOVE_WORDS,
  ORIGIN_WORDS,
  cardOrigin,
  cardState,
  giftCardError,
  moveNote,
} from "../lib/gift-cards";
import { undoableOrders } from "../lib/card-payments";
import { GiftCardShare } from "./GiftCardShare";

/**
 * One card: what it holds, its code and message, its moves, voiding it with a reason, and undoing
 * a payment it made on an order by mistake (on that order's latest payment, while it still holds
 * money there: `undo_gift_card_payment`).
 */
export function GiftCardDetailsSheet({
  card,
  brandId,
  slug,
  lang,
  onClose,
  onOpenOrder,
  purchase,
}: {
  card: GiftCard | null;
  /** The storefront purchase that bought this card, when one did. */
  purchase?: GiftCardPurchase | null;
  brandId: string;
  slug: string;
  lang: "ar" | "en";
  onClose: () => void;
  /** Opens the storefront order that bought this card, when one did. */
  onOpenOrder?: (() => void) | null;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const canUndo = useProfileOptional()?.hasPermission?.("manage_orders") ?? false;
  const moves = useQuery({
    ...giftCardQueries.moves(brandId, card?.id ?? ""),
    enabled: Boolean(card),
  }).data;
  if (!card) return null;
  const undoable = undoableOrders(moves ?? []);
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

  const undoPayment = async (orderId: string, held: number) => {
    const ok = await confirmDialog({
      title: isAr ? "إلغاء دفع البطاقة على هذا الطلب؟" : "Undo this card's payment on the order?",
      description: isAr
        ? "يعود المبلغ إلى البطاقة، ويعود الطلب مستحقاً له."
        : "The amount goes back to the card, and the order owes it again.",
      confirmLabel: isAr ? "إلغاء الدفع" : "Undo payment",
      destructive: true,
      facts: [
        { label: isAr ? "البطاقة" : "Card", value: <bdi dir="ltr">{card.code}</bdi> },
        {
          label: isAr ? "يعود إلى البطاقة" : "Back to the card",
          value: <bdi dir="ltr">{money(held)}</bdi>,
        },
      ],
    });
    if (!ok) return;
    setUndoing(true);
    try {
      const result = await undoGiftCardPayment(orderId, card.id);
      await Promise.all([invalidateGiftCards(qc, brandId), invalidateOrders(qc, brandId)]);
      toast.success(
        isAr
          ? `أُعيد ${money(result.amount)} إلى البطاقة.`
          : `${money(result.amount)} went back to the card.`,
      );
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setUndoing(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={isAr ? "left" : "right"}
        dir={isAr ? "rtl" : "ltr"}
        className="w-full overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="text-start">
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
            {` · ${originLine(cardOrigin(card), lang)}`}
            {card.recipient_name ? ` · ${isAr ? "لـ" : "for"} ${card.recipient_name}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Fact label={isAr ? "الرمز" : "Code"} value={card.code} mono />
            <Fact
              label={isAr ? "تاريخ الإصدار" : "Issued"}
              value={shortDate(card.issued_at, lang)}
            />
            <Fact
              label={isAr ? "ينتهي" : "Expires"}
              value={
                card.expires_on ? shortDate(card.expires_on, lang) : isAr ? "لا ينتهي" : "Never"
              }
            />
            {card.purchaser_name && (
              <Fact label={isAr ? "المشتري" : "Bought by"} value={card.purchaser_name} />
            )}
            {card.note && <Fact label={isAr ? "ملاحظة" : "Note"} value={card.note} wide />}
          </dl>

          {onOpenOrder && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenOrder}>
              {isAr ? "عرض طلب الشراء" : "View the order"}
            </Button>
          )}

          {state === "active" && <GiftCardShare card={card} purchase={purchase} lang={lang} />}

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
                    {move.note && (
                      <span className="block text-muted-foreground">
                        {moveNote(move.note, lang)}
                      </span>
                    )}
                    {move.order_id && (
                      <Link
                        to="/admin/b/$slug/orders/$id"
                        params={{ slug, id: move.order_id }}
                        className="block font-medium text-foreground underline underline-offset-2"
                      >
                        {isAr ? "عرض الطلب" : "View order"}
                      </Link>
                    )}
                    {move.order_id &&
                      canUndo &&
                      card.status !== "voided" &&
                      undoable.get(move.order_id)?.moveId === move.id && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-1 h-7 px-2 text-xs"
                          disabled={undoing}
                          onClick={() =>
                            void undoPayment(
                              move.order_id as string,
                              undoable.get(move.order_id as string)?.held ?? 0,
                            )
                          }
                        >
                          {isAr ? "إلغاء الدفع على هذا الطلب" : "Undo this payment"}
                        </Button>
                      )}
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

const shortDate = (value: string, lang: "ar" | "en") =>
  new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(
    lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  );

function Fact({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={mono ? "font-mono font-semibold" : "font-medium break-words"}
        dir={mono ? "ltr" : "auto"}
      >
        {value}
      </dd>
    </div>
  );
}

/** "Sold · Cash", or "Given by the store". */
function originLine(origin: ReturnType<typeof cardOrigin>, lang: "ar" | "en"): string {
  if (origin === "given") return ORIGIN_WORDS.given[lang];
  return `${lang === "ar" ? "بيعت" : "Sold"} (${ORIGIN_WORDS[origin][lang]})`;
}
