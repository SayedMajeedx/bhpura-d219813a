import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useBrand } from "@/lib/brand-context";
import {
  invalidateGiftCards,
  resetGiftCardShareLink,
  type GiftCard,
  type GiftCardPurchase,
} from "@/lib/data/gift-cards";
import { giftAddress, giftLinkMessage } from "@/lib/gift-link";
import { giftCardError } from "../lib/gift-cards";
import { PrintCardButton } from "./PrintCardDialog";

/**
 * A card to hand over: its gift link (the page the person it is for opens: the card in its design
 * and its code on a tap) to copy or send on WhatsApp by a person, and its code for staff to read.
 * The message carries the link and never the code.
 */
export function GiftCardShare({
  card,
  purchase,
  lang,
}: {
  card: GiftCard;
  /** The storefront purchase that bought it, whose design and words the printed card wears. */
  purchase?: GiftCardPurchase | null;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const brand = useBrand();
  const qc = useQueryClient();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [token, setToken] = useState(card.share_token);
  const [renewing, setRenewing] = useState(false);
  const storeName = (isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug;
  const link = giftAddress(brand.slug, token);
  const message = giftLinkMessage(
    {
      recipient: purchase?.recipient_name ?? card.recipient_name,
      message: purchase?.message ?? null,
      storeName,
      link,
    },
    lang,
  );

  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? card.code : link);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard unavailable: the code stays on screen to copy by hand.
    }
  };

  const renew = async () => {
    const sure = await confirmDialog({
      title: isAr ? "إنشاء رابط إهداء جديد؟" : "Make a new gift link?",
      description: isAr
        ? "يتوقف الرابط القديم عن العمل. البطاقة ورمزها ورصيدها تبقى كما هي."
        : "The old link stops working. The card, its code and its balance stay as they are.",
      confirmLabel: isAr ? "رابط جديد" : "New link",
    });
    if (!sure) return;
    setRenewing(true);
    try {
      const next = await resetGiftCardShareLink(card.id);
      setToken(next.share_token);
      await invalidateGiftCards(qc, brand.id);
      toast.success(isAr ? "أُنشئ رابط جديد" : "A new link was made");
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setRenewing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
        <span className="font-mono text-base font-bold tracking-wider" dir="ltr">
          {card.code}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => copy("code")}
          aria-label={isAr ? `نسخ الرمز ${card.code}` : `Copy the code ${card.code}`}
        >
          {copied === "code" ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied === "code" ? (isAr ? "نُسخ" : "Copied") : isAr ? "نسخ" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "رابط الإهداء يفتح البطاقة بتصميمها لمن أُهديت له، والرمز يظهر داخله. الرسالة لا تحمل الرمز."
          : "The gift link opens the card in its design for the person it is for, with the code inside. The message does not carry the code."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild className="min-w-0 gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            {isAr ? "إرسال رابط الإهداء على واتساب" : "Send the gift link on WhatsApp"}
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-w-0 gap-2"
          onClick={() => copy("link")}
        >
          {copied === "link" ? (
            <Check className="size-4 shrink-0" aria-hidden />
          ) : (
            <Link2 className="size-4 shrink-0" aria-hidden />
          )}
          {copied === "link"
            ? isAr
              ? "نُسخ الرابط"
              : "Link copied"
            : isAr
              ? "نسخ رابط الإهداء"
              : "Copy the gift link"}
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={renew}
        disabled={renewing}
      >
        <RefreshCw className="size-3.5" aria-hidden />
        {isAr ? "أُرسل لشخص خطأ؟ أنشئ رابطًا جديدًا" : "Sent to the wrong person? Make a new link"}
      </Button>
      <PrintCardButton card={card} purchase={purchase} lang={lang} />
    </div>
  );
}
