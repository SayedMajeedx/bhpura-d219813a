import { useState } from "react";
import { Check, Copy, Eye, Gift } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import type { MyGiftCard } from "@/lib/data/gift-cards/online";

/**
 * A signed-in shopper's gift cards in this store (the owner's review of 2026-10-31): each card
 * bought while signed in, where it stands, and once paid its code (shown on a tap, to copy), what
 * is left on it and until when. A guest's cards reach them by email or WhatsApp instead.
 */
export function GiftCardsSection({
  cards,
  isLoading,
}: {
  cards: readonly MyGiftCard[] | undefined;
  isLoading: boolean;
}) {
  const { brand, lang, t } = useStorefront();
  if (isLoading) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t("جارٍ التحميل…", "Loading…")}
      </p>
    );
  }
  if (!cards || cards.length === 0) {
    return (
      <div className="space-y-3 py-6 text-center">
        <Gift className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {t("لا بطاقات هدية بعد.", "No gift cards yet.")}
        </p>
        <Link
          to="/$slug/gift-cards"
          params={{ slug: brand.slug }}
          className="text-sm font-medium text-primary underline underline-offset-2"
        >
          {t("شراء بطاقة هدية", "Buy a gift card")}
        </Link>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {cards.map((card) => (
        <GiftCardRow key={card.id} card={card} lang={lang} t={t} />
      ))}
    </ul>
  );
}

function stateWords(card: MyGiftCard, t: (ar: string, en: string) => string): string {
  if (card.status === "paid") {
    if (card.card_status === "voided") return t("ملغاة", "Voided");
    if (Number(card.balance ?? 0) <= 0) return t("استُخدمت كاملة", "Used up");
    return t("جاهزة", "Ready");
  }
  if (card.status === "pending") {
    return card.payment_method === "benefit"
      ? t("يتحقق المتجر من التحويل", "The store is checking the transfer")
      : t("الدفع لم يكتمل", "Payment not finished");
  }
  return card.status === "cancelled" ? t("لم يُعتمد", "Declined") : t("لم يكتمل", "Not completed");
}

function GiftCardRow({
  card,
  lang,
  t,
}: {
  card: MyGiftCard;
  lang: "ar" | "en";
  t: (ar: string, en: string) => string;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const money = (n: number) => formatPrice(n, card.currency, lang);
  const day = (value: string) =>
    new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(
      lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB",
      { day: "numeric", month: "short", year: "numeric" },
    );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.code ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The code stays on screen to copy by hand.
    }
  };
  return (
    <li className="space-y-2 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-semibold tabular-nums">{money(Number(card.amount))}</span>
          <span className="block text-xs text-muted-foreground">
            {day(card.created_at)}
            {card.recipient_name
              ? ` · ${t(`لـ ${card.recipient_name}`, `For ${card.recipient_name}`)}`
              : ""}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          {stateWords(card, t)}
        </span>
      </div>
      {card.code && (
        <div className="space-y-2">
          {shown ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <span className="font-mono text-base font-bold tracking-wider" dir="ltr">
                {card.code}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={copy}
                aria-label={t(`نسخ الرمز ${card.code}`, `Copy the code ${card.code}`)}
              >
                {copied ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
                {copied ? t("نُسخ", "Copied") : t("نسخ", "Copy")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShown(true)}
            >
              <Eye className="size-4" aria-hidden />
              {t("إظهار الرمز", "Show the code")}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {t(
              `المتبقي ${money(Number(card.balance ?? 0))}`,
              `${money(Number(card.balance ?? 0))} left`,
            )}
            {card.expires_on
              ? ` · ${t(`صالحة حتى ${day(card.expires_on)}`, `valid until ${day(card.expires_on)}`)}`
              : ""}
          </p>
        </div>
      )}
    </li>
  );
}
