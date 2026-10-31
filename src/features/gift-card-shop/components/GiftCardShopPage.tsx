import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CreditCard, Gift, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { giftCardOnlineQueries, type GiftCardOffer } from "@/lib/data/gift-cards/online";
import { startGiftCardPurchase } from "@/lib/gift-card-purchase.functions";
import { uploadBenefitReceipt } from "@/lib/benefit-receipt";
import { BenefitTransferDetails } from "@/features/checkout/components/BenefitTransferDetails";
import { cn } from "@/lib/utils";
import {
  buyMethods,
  buyProblems,
  emptyBuyForm,
  purchaseFailure,
  validityLine,
  type BuyForm,
  type BuyMethod,
} from "../lib/gift-card-shop";

/**
 * Buying a gift card: one of the store's amounts, who it is for and a line for them, who buys it,
 * and paying by card (to the gateway) or by BenefitPay transfer with its receipt. A card is money
 * the store holds: no VAT, no delivery, nothing to ship. Its code shows on the purchase's own
 * page once the payment is in.
 */
export function GiftCardShopPage() {
  const { brand, lang, t } = useStorefront();
  const offer = useQuery(giftCardOnlineQueries.offer(brand.slug));

  if (offer.isLoading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-muted-foreground">
        {t("جارٍ التحميل…", "Loading…")}
      </div>
    );
  }
  if (!offer.data) {
    return (
      <div className="mx-auto max-w-lg space-y-2 px-4 py-16 text-center">
        <Gift className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="font-display text-2xl">{t("بطاقات الهدايا", "Gift cards")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "لا يبيع المتجر بطاقات الهدايا على الموقع الآن.",
            "This store is not selling gift cards online right now.",
          )}
        </p>
      </div>
    );
  }
  return <BuyForm offer={offer.data} lang={lang} t={t} />;
}

function BuyForm({
  offer,
  lang,
  t,
}: {
  offer: GiftCardOffer;
  lang: "ar" | "en";
  t: (ar: string, en: string) => string;
}) {
  const { brand, settings } = useStorefront();
  const navigate = useNavigate();
  const methods = buyMethods(offer);
  const [form, setForm] = useState<BuyForm>(() => ({
    ...emptyBuyForm(),
    method: methods.length === 1 ? methods[0] : "",
  }));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const problems = buyProblems({ ...form, hasReceipt: Boolean(receipt) }, offer);
  const money = (n: number) => formatPrice(n, offer.currency, lang);
  const set = (key: keyof BuyForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const validity = validityLine(offer.validMonths, lang);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setShown(true);
    if (problems.length > 0 || form.amount === null || !form.method) return;
    setBusy(true);
    try {
      const receiptId =
        form.method === "benefit" && receipt ? await uploadBenefitReceipt(brand.id, receipt) : null;
      const started = await startGiftCardPurchase({
        data: {
          slug: brand.slug,
          amount: form.amount,
          method: form.method,
          buyer: {
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim() || undefined,
            recipient: form.recipient.trim() || undefined,
            message: form.message.trim() || undefined,
          },
          receiptId,
        },
      });
      if (!started.ok) {
        toast.error(purchaseFailure(started.reason, lang));
        return;
      }
      if (form.method === "card") {
        const response = await fetch("/api/public/gift-cards/charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseId: started.id,
            brandId: started.brandId,
            token: started.token,
          }),
        });
        const reply = await response.json<{ redirectUrl?: string }>();
        if (response.ok && reply.redirectUrl) {
          window.location.href = reply.redirectUrl;
          return;
        }
      }
      await navigate({
        to: "/$slug/gift-card/$purchaseId",
        params: { slug: brand.slug, purchaseId: started.id },
        search: { t: started.token },
      });
    } catch (error) {
      toast.error(purchaseFailure(String((error as Error)?.message ?? error), lang));
    } finally {
      setBusy(false);
    }
  };

  const problem = (key: (typeof problems)[number]) => shown && problems.includes(key);

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:py-12">
      <div className="space-y-2 text-center">
        <Gift className="mx-auto size-8 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl sm:text-3xl">{t("بطاقة هدية", "Gift card")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "أهدِ من تحب بطاقة يختار بها ما يشاء من المتجر.",
            "Give someone a card to choose what they like from the store.",
          )}
        </p>
      </div>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-5">
        <p id="gift-amount-label" className="text-sm font-semibold">
          {t("القيمة", "Amount")}
        </p>
        <div
          role="radiogroup"
          aria-labelledby="gift-amount-label"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {offer.amounts.map((amount) => (
            <button
              key={amount}
              type="button"
              role="radio"
              aria-checked={form.amount === amount}
              onClick={() => setForm((current) => ({ ...current, amount }))}
              className={cn(
                "min-h-14 rounded-xl border px-3 text-base font-semibold tabular-nums transition-colors",
                form.amount === amount
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:border-primary",
              )}
            >
              {money(amount)}
            </button>
          ))}
        </div>
        {problem("amount") && (
          <p className="text-xs text-destructive">{t("اختر قيمة البطاقة.", "Choose an amount.")}</p>
        )}
        {validity && <p className="text-xs text-muted-foreground">{validity}</p>}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">{t("لمن البطاقة", "Who it is for")}</h2>
        <div className="space-y-1.5">
          <Label htmlFor="gift-recipient">{t("الاسم (اختياري)", "Name (optional)")}</Label>
          <Input
            id="gift-recipient"
            value={form.recipient}
            onChange={set("recipient")}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gift-message">
            {t("رسالة لهم (اختياري)", "A note for them (optional)")}
          </Label>
          <Textarea
            id="gift-message"
            value={form.message}
            onChange={set("message")}
            maxLength={300}
            rows={2}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">{t("بياناتك", "Your details")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gift-buyer-name">{t("الاسم", "Name")}</Label>
            <Input
              id="gift-buyer-name"
              value={form.name}
              onChange={set("name")}
              autoComplete="name"
              maxLength={120}
              aria-invalid={problem("name")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gift-buyer-phone">{t("رقم الهاتف", "Phone number")}</Label>
            <Input
              id="gift-buyer-phone"
              value={form.phone}
              onChange={set("phone")}
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              maxLength={32}
              aria-invalid={problem("phone")}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gift-buyer-email">{t("البريد (اختياري)", "Email (optional)")}</Label>
          <Input
            id="gift-buyer-email"
            type="email"
            value={form.email}
            onChange={set("email")}
            autoComplete="email"
            dir="ltr"
            maxLength={200}
          />
        </div>
        {(problem("name") || problem("phone")) && (
          <p className="text-xs text-destructive">
            {t("اكتب اسمك ورقم هاتفك.", "Write your name and phone number.")}
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <p id="gift-method-label" className="text-sm font-semibold">
          {t("طريقة الدفع", "Payment")}
        </p>
        <div
          role="radiogroup"
          aria-labelledby="gift-method-label"
          className="grid gap-2 sm:grid-cols-2"
        >
          {methods.map((method) => (
            <MethodChoice
              key={method}
              method={method}
              chosen={form.method === method}
              onChoose={() => setForm((current) => ({ ...current, method }))}
              t={t}
            />
          ))}
        </div>
        {problem("method") && (
          <p className="text-xs text-destructive">{t("اختر طريقة الدفع.", "Choose how to pay.")}</p>
        )}
        {form.method === "benefit" && (
          <BenefitTransferDetails
            brand={brand}
            settings={settings}
            receipt={receipt}
            setReceipt={setReceipt}
            t={t}
          />
        )}
        {problem("receipt") && (
          <p className="text-xs text-destructive">
            {t("أرفق صورة إيصال التحويل.", "Attach the transfer receipt.")}
          </p>
        )}
      </section>

      <Button type="submit" className="min-h-12 w-full text-base" disabled={busy}>
        {busy && <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />}
        {form.amount !== null
          ? t(`شراء البطاقة · ${money(form.amount)}`, `Buy the card · ${money(form.amount)}`)
          : t("شراء البطاقة", "Buy the card")}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {form.method === "benefit"
          ? t(
              "يصلك رمز البطاقة بعد أن يتحقق المتجر من التحويل.",
              "You get the card's code once the store checks the transfer.",
            )
          : t("يظهر رمز البطاقة فور إتمام الدفع.", "The card's code shows as soon as you pay.")}
      </p>
    </form>
  );
}

function MethodChoice({
  method,
  chosen,
  onChoose,
  t,
}: {
  method: BuyMethod;
  chosen: boolean;
  onChoose: () => void;
  t: (ar: string, en: string) => string;
}) {
  const Icon = method === "card" ? CreditCard : Landmark;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      onClick={onChoose}
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors",
        chosen
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:border-primary",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {method === "card" ? t("بطاقة", "Card") : t("بنفت باي (تحويل)", "BenefitPay (transfer)")}
    </button>
  );
}
