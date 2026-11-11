import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, MessageCircle, Receipt, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useBrand } from "@/lib/brand-context";
import { formatMoney } from "@/lib/format";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import {
  approveGiftCardPurchase,
  cancelGiftCardPurchase,
  invalidateGiftCardOnline,
  markGiftCardPurchaseSent,
  setGiftCardPrintStep,
  type GiftCardPurchase,
} from "@/lib/data/gift-cards";
import { getGiftCardPurchaseReceiptUrl } from "@/lib/gift-card-purchase.functions";
import { giftCardError } from "../lib/gift-cards";
import { giftAddress, giftLinkForBuyerMessage } from "@/lib/gift-link";
import { orderTotal, printStep } from "../lib/card-orders";
import { PrintOrderCardButton } from "./PrintCardDialog";

/** A paid order's gift link sent by a person on WhatsApp, in the buyer's language; never the code. */
export function SendCodeButton({
  purchase,
  lang,
}: {
  purchase: GiftCardPurchase;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const brand = useBrand();
  const card = purchase.gift_cards;
  if (!card?.code || !card.share_token) return null;
  const buyerLang = purchase.lang === "en" ? "en" : "ar";
  const storeName =
    (buyerLang === "ar" ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug;
  const message = giftLinkForBuyerMessage(
    {
      buyer: purchase.buyer_name,
      recipient: purchase.recipient_name,
      amount: formatMoney(Number(purchase.amount), purchase.currency, buyerLang),
      storeName,
      link: giftAddress(brand.slug, card.share_token ?? ""),
    },
    buyerLang,
  );
  const chat = whatsappChatUrl(purchase.buyer_phone) ?? "https://wa.me/";
  const href = `${chat}?text=${encodeURIComponent(message)}`;
  const record = async () => {
    try {
      await markGiftCardPurchaseSent(purchase.id);
      await invalidateGiftCardOnline(qc, brand.id);
    } catch (error) {
      toast.error(giftCardError(error, lang));
    }
  };
  return (
    <Button
      asChild
      size="sm"
      variant={purchase.code_sent_at ? "outline" : "default"}
      className="gap-1.5"
    >
      <a href={href} target="_blank" rel="noreferrer" onClick={record}>
        <MessageCircle className="size-4" aria-hidden="true" />
        {purchase.code_sent_at
          ? isAr
            ? "إرسال الرمز مرة أخرى"
            : "Send the code again"
          : isAr
            ? "إرسال الرمز على واتساب"
            : "Send the code on WhatsApp"}
      </a>
    </Button>
  );
}

/**
 * A paid card the store prints: print it (on the design the buyer chose), then record it printed,
 * then delivered. Recording asks nothing back: pressing again changes nothing.
 */
export function PrintStepActions({
  purchase,
  lang,
}: {
  purchase: GiftCardPurchase;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const brand = useBrand();
  const [busy, setBusy] = useState(false);
  const step = printStep(purchase);
  if (!step) return null;
  const record = async (next: "printed" | "delivered") => {
    setBusy(true);
    try {
      await setGiftCardPrintStep(purchase.id, next);
      await invalidateGiftCardOnline(qc, brand.id);
      toast.success(
        next === "printed"
          ? isAr
            ? "سُجّلت البطاقة مطبوعة"
            : "Recorded as printed"
          : isAr
            ? "سُجّلت البطاقة واصلة"
            : "Recorded as delivered",
      );
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <PrintOrderCardButton purchase={purchase} lang={lang} />
      {step === "print_card" ? (
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => record("printed")}
          disabled={busy}
        >
          <Check className="size-4" aria-hidden="true" />
          {isAr ? "تمت الطباعة" : "Printed"}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => record("delivered")}
          disabled={busy}
        >
          <Truck className="size-4" aria-hidden="true" />
          {isAr ? "تم التوصيل" : "Delivered"}
        </Button>
      )}
    </div>
  );
}

/** A transfer's receipt, in a new tab: a short-lived private link, asked for when pressed. */
export function ReceiptButton({
  purchase,
  lang,
}: {
  purchase: GiftCardPurchase;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const view = async () => {
    try {
      const { url } = await getGiftCardPurchaseReceiptUrl({ data: { purchaseId: purchase.id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(isAr ? "تعذّر فتح الإيصال" : "The receipt could not be opened");
    }
  };
  return (
    <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={view}>
      <Receipt className="size-4" aria-hidden="true" />
      {isAr ? "الإيصال" : "Receipt"}
    </Button>
  );
}

/** A transfer waiting to be checked: approving issues the card, declining keeps the reason. */
export function TransferActions({
  purchase,
  lang,
}: {
  purchase: GiftCardPurchase;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const brand = useBrand();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [declining, setDeclining] = useState(false);
  // What the transfer should show: the card's value, plus the printing fee when the store prints it.
  const amount = formatMoney(orderTotal(purchase), purchase.currency, lang);

  const approve = async () => {
    const ok = await confirmDialog({
      title: isAr ? `اعتماد تحويل ${amount}؟` : `Approve the ${amount} transfer?`,
      description:
        purchase.delivery_channel === "email"
          ? isAr
            ? "تصدر البطاقة ويصل رمزها إلى بريد المشتري."
            : "The card is issued and its code is emailed to the buyer."
          : isAr
            ? "تصدر البطاقة، ثم أرسل رمزها للمشتري على واتساب من هنا."
            : "The card is issued; then send its code to the buyer on WhatsApp from here.",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await approveGiftCardPurchase(purchase.id);
      await invalidateGiftCardOnline(qc, brand.id);
      toast.success(isAr ? "صدرت البطاقة" : "Card issued");
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await cancelGiftCardPurchase(purchase.id, reason.trim());
      await invalidateGiftCardOnline(qc, brand.id);
      setDeclining(false);
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={approve} disabled={busy}>
          {isAr ? "اعتماد وإصدار البطاقة" : "Approve and issue the card"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDeclining((v) => !v)}>
          {isAr ? "رفض" : "Decline"}
        </Button>
      </div>
      {declining && (
        <div className="space-y-2">
          <Label htmlFor={`decline-${purchase.id}`} className="text-xs">
            {purchase.delivery_channel === "email"
              ? isAr
                ? "السبب (يصل إلى المشتري بالبريد)"
                : "Why (emailed to the buyer)"
              : isAr
                ? "السبب (للسجل)"
                : "Why (kept on record)"}
          </Label>
          <Textarea
            id={`decline-${purchase.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
          />
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={decline}
            disabled={busy || reason.trim().length < 3}
          >
            {isAr ? "رفض الشراء" : "Decline the purchase"}
          </Button>
        </div>
      )}
    </div>
  );
}
