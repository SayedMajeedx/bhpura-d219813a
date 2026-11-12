import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CreditCard, Gift, Landmark, Loader2, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { giftCardOnlineQueries, type GiftCardOffer } from "@/lib/data/gift-cards/online";
import { giftOrderQueries } from "@/lib/data/gift-orders";
import { addonsPayload } from "@/lib/gift-addons";
import { startGiftCardPurchase } from "@/lib/gift-card-purchase.functions";
import { uploadBenefitReceipt } from "@/lib/benefit-receipt";
import { BenefitTransferDetails } from "@/features/checkout/components/BenefitTransferDetails";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { giftCardPixelPayload } from "@/lib/ad-events/gift-card-events";
import { GiftCardDesigner } from "@/features/gift-card-design/components/GiftCardDesigner";
import { DEFAULT_DESIGN, type CardDesign } from "@/features/gift-card-design/lib/design";
import { occasionsInOrder } from "@/features/gift-card-design/lib/occasions";
import { useStorefrontCardKit } from "../hooks/use-storefront-card-kit";
import { Choice } from "./BuyChoice";
import { PrintSection } from "./PrintSection";
import { GiftAmountPicker } from "./GiftAmountPicker";
import {
  buyMethods,
  buyProblems,
  buyTotal,
  emptyBuyForm,
  purchaseFailure,
  startAmount,
  validityLine,
  wantsPrint,
  type BuyDelivery,
  type BuyForm,
  type BuyMethod,
} from "../lib/gift-card-shop";

/**
 * Buying a gift card: an amount in the store's range (a slider, or typed), who it is for and a line for them, who buys it,
 * and paying by card (to the gateway) or by BenefitPay transfer with its receipt. A card is money
 * the store holds: no VAT. Its code shows on the purchase's own page once the payment is in.
 * A card on paper is printed by the store and delivered, for the store's own fee on top of the
 * card's value (never printed by the buyer: the owner's decision of 2026-11-08).
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
  const { brand, settings, session } = useStorefront();
  const navigate = useNavigate();
  const methods = buyMethods(offer);
  const [form, setForm] = useState<BuyForm>(() => ({
    ...emptyBuyForm(),
    amount: startAmount(offer),
    method: methods.length === 1 ? methods[0] : "",
    email: session?.user?.email ?? "",
  }));
  const kit = useStorefrontCardKit();
  const [design, setDesign] = useState<CardDesign>(() => ({
    ...DEFAULT_DESIGN,
    occasion: occasionsInOrder(new Date(), offer.currency)[0].id,
    language: lang,
  }));
  const [from, setFrom] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const problems = buyProblems({ ...form, hasReceipt: Boolean(receipt) }, offer);
  const printing = wantsPrint(form, offer);
  // The store's gift add-ons, offered with a card it prints and delivers.
  const addons = useQuery(giftOrderQueries.addons(brand.slug, offer.print)).data ?? [];
  const total = buyTotal(form, offer, addons);
  const money = (n: number) => formatPrice(n, offer.currency, lang);
  // The ad platforms hear of a card as of any product: viewed, checkout begun, bought.
  const pixelPayload = (purchaseId?: string) =>
    giftCardPixelPayload({ purchaseId, currency: offer.currency, value: total ?? 0 });
  useEffect(() => {
    void trackStorefrontEvent(
      "view_item",
      giftCardPixelPayload({ currency: offer.currency, value: 0 }),
      "gift-cards",
    );
  }, [offer.currency]);
  const set = (key: keyof BuyForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const validity = validityLine(offer.validMonths, lang);
  // The card as it will be, before it is bought: its code shows on the back once paid.
  const previewDetails = useMemo(
    () => ({
      amount: form.amount,
      code: null,
      to: form.recipient.trim() || null,
      message: form.message.trim() || null,
      expiresOn: offer.validMonths ? monthsFromToday(offer.validMonths) : null,
    }),
    [form.amount, form.recipient, form.message, offer.validMonths],
  );
  const cardDesign = useMemo(
    () => ({ ...design, from: from.trim() || null, print: printing }),
    [design, from, printing],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setShown(true);
    if (problems.length > 0 || form.amount === null || !form.method || !form.delivery) return;
    setBusy(true);
    void trackStorefrontEvent("begin_checkout", pixelPayload());
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
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            recipient: form.recipient.trim() || undefined,
            message: form.message.trim() || undefined,
            delivery: form.delivery,
            lang,
            design: cardDesign,
            ...(printing
              ? {
                  print: {
                    address: form.printAddress.trim(),
                    phone: form.printPhone.trim(),
                    addons: addonsPayload(form.addons, addons),
                  },
                }
              : {}),
          },
          receiptId,
          // Signed in: the card is kept in the shopper's account too (the server checks it).
          ...(session?.access_token ? { accessToken: session.access_token } : {}),
        },
      });
      if (!started.ok) {
        toast.error(purchaseFailure(started.reason, lang));
        return;
      }
      const purchaseTracked = trackStorefrontEvent(
        "purchase",
        pixelPayload(started.id),
        `gift-card:${started.id}`,
      );
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
          // Leaving the store: give the purchase's send a moment, as checkout does.
          await Promise.race([purchaseTracked, new Promise((done) => setTimeout(done, 1500))]);
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

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">{t("اختر البطاقة", "Choose the card")}</h2>
        <GiftCardDesigner
          kit={kit}
          value={cardDesign}
          onChange={(next) => setDesign(next)}
          details={previewDetails}
          primary={lang}
          lang={lang}
        />
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-5">
        <p id="gift-amount-label" className="text-sm font-semibold">
          {t("القيمة", "Amount")}
        </p>
        <GiftAmountPicker
          offer={offer}
          amount={form.amount}
          onChange={(amount) => setForm((current) => ({ ...current, amount }))}
          money={money}
          invalid={problem("amount")}
          lang={lang}
          t={t}
        />
        {validity && <p className="text-xs text-muted-foreground">{validity}</p>}
      </section>

      {offer.print && (
        <PrintSection
          form={form}
          setForm={setForm}
          fee={money(offer.printFee)}
          freePrint={offer.printFee === 0}
          problem={problem}
          addons={addons}
          currency={offer.currency}
          lang={lang}
          t={t}
        />
      )}

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
          <Label htmlFor="gift-from">
            {t("من (كما يُكتب على البطاقة، اختياري)", "From (as written on the card, optional)")}
          </Label>
          <Input
            id="gift-from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            maxLength={80}
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
          {problem("name") && (
            <p className="text-xs text-destructive">{t("اكتب اسمك.", "Write your name.")}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <p id="gift-delivery-label" className="text-sm font-medium">
            {t("أرسلوا لي رمز البطاقة على", "Send me the card's code by")}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="gift-delivery-label"
            className="grid grid-cols-2 gap-2"
          >
            {(["whatsapp", "email"] as BuyDelivery[]).map((delivery) => (
              <DeliveryChoice
                key={delivery}
                delivery={delivery}
                chosen={form.delivery === delivery}
                onChoose={() => setForm((current) => ({ ...current, delivery }))}
                t={t}
              />
            ))}
          </div>
          {problem("delivery") && (
            <p className="text-xs text-destructive">
              {t("اختر كيف يصلك الرمز.", "Choose how the code reaches you.")}
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gift-buyer-phone">
              {form.delivery === "whatsapp"
                ? t("رقم الهاتف (واتساب)", "Phone number (WhatsApp)")
                : t("رقم الهاتف (اختياري)", "Phone number (optional)")}
            </Label>
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
            {problem("phone") && (
              <p className="text-xs text-destructive">
                {t("اكتب رقم هاتف صحيحًا.", "Write a valid phone number.")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gift-buyer-email">
              {form.delivery === "email"
                ? t("البريد الإلكتروني", "Email")
                : t("البريد (اختياري)", "Email (optional)")}
            </Label>
            <Input
              id="gift-buyer-email"
              type="email"
              value={form.email}
              onChange={set("email")}
              autoComplete="email"
              dir="ltr"
              maxLength={200}
              aria-invalid={problem("email")}
            />
            {problem("email") && (
              <p className="text-xs text-destructive">
                {t("اكتب بريدًا صحيحًا.", "Write a valid email address.")}
              </p>
            )}
          </div>
        </div>
        {session && (
          <p className="text-xs text-muted-foreground">
            {t(
              "ستجد البطاقة ورمزها في حسابك أيضًا.",
              "You will also find the card and its code in your account.",
            )}
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
        {total !== null
          ? t(`شراء البطاقة · ${money(total)}`, `Buy the card · ${money(total)}`)
          : t("شراء البطاقة", "Buy the card")}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {form.method === "benefit"
          ? t(
              "يصلك رمز البطاقة بعد أن يتحقق المتجر من التحويل.",
              "You get the card's code once the store checks the transfer.",
            )
          : t(
              "يظهر رمز البطاقة فور إتمام الدفع، ويصلك كما اخترت.",
              "The card's code shows as soon as you pay, and reaches you as you chose.",
            )}
        {printing &&
          ` ${t(
            "ويطبع المتجر البطاقة ويوصلها إلى العنوان الذي كتبته.",
            "The store prints the card and delivers it to the address you wrote.",
          )}`}
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
  return (
    <Choice
      icon={method === "card" ? CreditCard : Landmark}
      label={
        method === "card" ? t("بطاقة", "Card") : t("بنفت باي (تحويل)", "BenefitPay (transfer)")
      }
      chosen={chosen}
      onChoose={onChoose}
    />
  );
}

function DeliveryChoice({
  delivery,
  chosen,
  onChoose,
  t,
}: {
  delivery: BuyDelivery;
  chosen: boolean;
  onChoose: () => void;
  t: (ar: string, en: string) => string;
}) {
  return (
    <Choice
      icon={delivery === "whatsapp" ? MessageCircle : Mail}
      label={delivery === "whatsapp" ? t("واتساب", "WhatsApp") : t("البريد", "Email")}
      chosen={chosen}
      onChoose={onChoose}
      centred
    />
  );
}

/** The day a card bought today ends, `months` on (the database counts the same way). */
function monthsFromToday(months: number): string {
  const day = new Date();
  day.setMonth(day.getMonth() + months);
  return day.toISOString().slice(0, 10);
}
