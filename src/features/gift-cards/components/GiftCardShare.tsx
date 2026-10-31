import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { storeAddress } from "@/lib/platform-host";
import { useBrand } from "@/lib/brand-context";
import type { GiftCard } from "@/lib/data/gift-cards";
import { giftCardMessage } from "../lib/gift-cards";
import { PrintCardButton } from "./PrintCardDialog";

/** A card's code to copy, and the message a person sends with it on WhatsApp. */
export function GiftCardShare({ card, lang }: { card: GiftCard; lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  const brand = useBrand();
  const [copied, setCopied] = useState(false);
  const storeName = (isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug;
  const expiry = card.expires_on
    ? new Date(`${card.expires_on}T12:00:00`).toLocaleDateString(
        isAr ? "ar-BH-u-nu-latn" : "en-GB",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
      )
    : null;
  const message = giftCardMessage(
    card,
    {
      amount: formatMoney(Number(card.balance), card.currency, lang),
      storeName,
      storeLink: storeAddress(brand.slug),
      expiry,
    },
    lang,
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable: the code stays on screen to copy by hand.
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
          onClick={copy}
          aria-label={isAr ? `نسخ الرمز ${card.code}` : `Copy the code ${card.code}`}
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied ? (isAr ? "نُسخ" : "Copied") : isAr ? "نسخ" : "Copy"}
        </Button>
      </div>
      <Button asChild variant="outline" className="w-full gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle className="size-4" aria-hidden />
          {isAr ? "إرسال البطاقة على واتساب" : "Send the card on WhatsApp"}
        </a>
      </Button>
      <PrintCardButton card={card} lang={lang} />
    </div>
  );
}
