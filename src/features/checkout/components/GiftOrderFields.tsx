import { Gift } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/storefront-context";
import type { Storefront } from "@/features/checkout/types";
import { cn } from "@/lib/utils";
import { GIFT_CARD_TONES, GIFT_TONE_WORDS, giftCardDesign } from "@/lib/gift-order";
import { GiftCardPreview } from "@/features/gift-card-design/components/GiftCardPreview";
import { DEFAULT_DESIGN } from "@/features/gift-card-design/lib/design";
import { isArabic } from "@/features/gift-card-design/lib/type";
import { useStorefrontCardKit } from "@/features/gift-card-shop/hooks/use-storefront-card-kit";
import type { CheckoutGift } from "@/features/checkout/hooks/use-checkout-gift";
import { GiftAddonsPicker } from "@/features/checkout/components/GiftAddonsPicker";

/**
 * "Send this order as a gift", by the store's settings: who it is for, and the gift message card
 * when the store offers one, at its price (free at 0), with the shopper's words, who it is from
 * and the card's tone, drawn as it will be printed, and the store's add-ons (a bouquet). Their
 * prices join the order's total.
 */
export function GiftOrderFields({
  gift,
  isGift,
  setIsGift,
  recipient,
  setRecipient,
  message,
  setMessage,
  currency,
  lang,
  t,
}: {
  gift: CheckoutGift;
  isGift: boolean;
  setIsGift: (value: boolean) => void;
  recipient: string;
  setRecipient: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  currency: string;
  lang: Storefront["lang"];
  t: Storefront["t"];
}) {
  if (!gift.offered) return null;
  const { options } = gift;
  const price = options.cardPrice > 0 ? formatPrice(options.cardPrice, currency, lang) : null;

  return (
    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <label className="flex cursor-pointer items-center gap-2.5 select-none">
        <Checkbox checked={isGift} onCheckedChange={(checked) => setIsGift(checked === true)} />
        <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="text-sm font-semibold text-foreground">
          {t("هل ترغب في إرسال هذا الطلب كهدية؟", "Send this order as a gift?")}
        </span>
      </label>
      {isGift && (
        <div className="animate-in space-y-3 border-t border-primary/15 pt-3 duration-(--motion-fast) fade-in-50">
          <div>
            <Label htmlFor="gift-recipient" className="text-xs font-medium">
              {t("اسم المستلم (اختياري)", "Recipient's name (optional)")}
            </Label>
            <Input
              id="gift-recipient"
              type="text"
              maxLength={120}
              placeholder={t("مثال: سارة محمد", "e.g. Sarah Mohamed")}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="mt-1 h-11 bg-background"
            />
          </div>

          <GiftAddonsPicker gift={gift} currency={currency} lang={lang} t={t} />

          {options.card && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background p-3 select-none">
              <Checkbox
                className="mt-0.5"
                checked={gift.withCard}
                onCheckedChange={(checked) => gift.setWithCard(checked === true)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold">
                  <span>{t("بطاقة إهداء برسالتك", "A gift card with your message")}</span>
                  <span className={cn("font-mono", !price && "text-muted-foreground")}>
                    {price ? `+ ${price}` : t("مجانًا", "Free")}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t(
                    "نطبعها بتصميم المتجر ونرفقها مع الطلب.",
                    "We print it in the store's design and send it with the order.",
                  )}
                </span>
              </span>
            </label>
          )}

          {gift.hasCard && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="gift-card-message" className="text-xs font-medium">
                  {t("رسالة البطاقة", "The card's message")}
                </Label>
                <Textarea
                  id="gift-card-message"
                  maxLength={500}
                  placeholder={t("اكتب كلماتك لمن تهديه...", "Write your words for them...")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 min-h-20 resize-none bg-background"
                />
              </div>
              <div>
                <Label htmlFor="gift-from" className="text-xs font-medium">
                  {t("من (اختياري)", "From (optional)")}
                </Label>
                <Input
                  id="gift-from"
                  type="text"
                  maxLength={80}
                  placeholder={t("اسمك كما يظهر على البطاقة", "Your name as the card shows it")}
                  value={gift.from}
                  onChange={(e) => gift.setFrom(e.target.value)}
                  className="mt-1 h-11 bg-background"
                />
              </div>
              <div>
                <p className="text-xs font-medium" id="gift-tone-label">
                  {t("لون البطاقة", "The card's colour")}
                </p>
                <div
                  role="radiogroup"
                  aria-labelledby="gift-tone-label"
                  className="mt-1 flex flex-wrap gap-2"
                >
                  {GIFT_CARD_TONES.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      role="radio"
                      aria-checked={gift.tone === tone}
                      onClick={() => gift.setTone(tone)}
                      className={cn(
                        "min-h-11 rounded-full border px-4 text-xs font-medium transition-colors",
                        gift.tone === tone
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground",
                      )}
                    >
                      {GIFT_TONE_WORDS[tone][lang]}
                    </button>
                  ))}
                </div>
              </div>
              <GiftCardLook gift={gift} recipient={recipient} message={message} lang={lang} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The message card as it will be printed, mounted only while a card is being written. */
function GiftCardLook({
  gift,
  recipient,
  message,
  lang,
}: {
  gift: CheckoutGift;
  recipient: string;
  message: string;
  lang: Storefront["lang"];
}) {
  const kit = useStorefrontCardKit();
  // The card speaks the message's language, whatever the page's.
  const words = message.trim() || recipient.trim();
  const cardLang = words ? (isArabic(words) ? "ar" : "en") : lang;
  return (
    <GiftCardPreview
      kit={kit}
      design={{
        ...DEFAULT_DESIGN,
        occasion: "gift",
        design: giftCardDesign(gift.tone),
        language: cardLang,
        from: gift.from.trim() || null,
      }}
      details={{
        amount: null,
        code: null,
        to: recipient.trim() || null,
        message: message.trim() || null,
        expiresOn: null,
        purpose: "message",
      }}
      primary={cardLang}
      lang={lang}
    />
  );
}
