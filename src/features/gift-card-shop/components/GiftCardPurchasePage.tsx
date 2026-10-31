import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Clock, Copy, Gift, MessageCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { storeAddress } from "@/lib/platform-host";
import { getGiftCardPurchase } from "@/lib/gift-card-purchase.functions";
import { deliveryLine, purchaseState, recipientMessage } from "../lib/gift-card-shop";

/**
 * A gift card purchase's own page, opened with its token: the card and its code once it is paid
 * (to copy, and a WhatsApp message the buyer sends to the person it is for), a transfer the store
 * is still checking, or a card payment that did not go through, with a way to try again.
 */
export function GiftCardPurchasePage({
  purchaseId,
  token,
  paymentFailed,
}: {
  purchaseId: string;
  token: string;
  paymentFailed: boolean;
}) {
  const { brand, lang, t } = useStorefront();
  const query = useQuery({
    queryKey: ["storefront", "gift-card-purchase", purchaseId, token],
    queryFn: () => getGiftCardPurchase({ data: { purchaseId, token } }),
    enabled: Boolean(purchaseId && token),
    // A transfer is checked by a person: look again now and then while the page is open.
    refetchInterval: (q) => (q.state.data && q.state.data.status === "pending" ? 20_000 : false),
  });
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const view = query.data;

  if (query.isLoading) {
    return <Shell>{t("جارٍ التحميل…", "Loading…")}</Shell>;
  }
  if (!view) {
    return (
      <Shell>
        {t(
          "لم نجد هذه البطاقة. افتح الرابط الذي وصلك بعد الشراء.",
          "We could not find this card. Open the link you were given after buying.",
        )}
      </Shell>
    );
  }

  const money = formatPrice(view.amount, view.currency, lang);
  const state = purchaseState(view, paymentFailed);
  const expiry = view.expiresOn
    ? new Date(`${view.expiresOn}T12:00:00`).toLocaleDateString(
        lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
      )
    : null;

  const retry = async () => {
    setRetrying(true);
    try {
      const response = await fetch("/api/public/gift-cards/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId, brandId: view.brandId, token }),
      });
      const reply = await response.json<{ redirectUrl?: string }>();
      if (response.ok && reply.redirectUrl) window.location.href = reply.redirectUrl;
    } finally {
      setRetrying(false);
    }
  };

  if (state === "ready" && view.code) {
    const storeName =
      (lang === "ar" ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug;
    const message = recipientMessage(
      {
        recipient: view.recipientName,
        message: view.message,
        amount: money,
        code: view.code,
        expiry,
        storeName,
        storeLink: storeAddress(brand.slug),
      },
      lang,
    );
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(view.code ?? "");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        // The code stays on screen to copy by hand.
      }
    };
    return (
      <div className="mx-auto w-full max-w-lg space-y-5 px-4 py-8 sm:py-12">
        <div className="space-y-1 text-center">
          <Gift className="mx-auto size-8 text-primary" aria-hidden="true" />
          <h1 className="font-display text-2xl">{t("بطاقتك جاهزة", "Your card is ready")}</h1>
          <p className="text-sm text-muted-foreground">
            {view.recipientName
              ? t(`أرسلها إلى ${view.recipientName}.`, `Send it to ${view.recipientName}.`)
              : t("أرسلها لمن تحب، أو احتفظ بها.", "Send it to someone, or keep it.")}
          </p>
        </div>
        <div className="space-y-3 rounded-2xl bg-primary p-6 text-primary-foreground">
          <p className="text-sm opacity-80">{storeName}</p>
          <p className="font-display text-3xl tabular-nums">{money}</p>
          <p className="font-mono text-lg font-bold tracking-wider" dir="ltr">
            {view.code}
          </p>
          {expiry && (
            <p className="text-xs opacity-80">
              {t(`صالحة حتى ${expiry}`, `Valid until ${expiry}`)}
            </p>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={copy}>
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? t("نُسخ", "Copied") : t("نسخ الرمز", "Copy the code")}
          </Button>
          <Button asChild className="min-h-11 gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="size-4" aria-hidden />
              {t("إرسال على واتساب", "Send on WhatsApp")}
            </a>
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {deliveryLine(view, lang)}{" "}
          {t("الرمز يُكتب عند الدفع في المتجر.", "The code is typed at the store's checkout.")}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-12 text-center">
      {state === "checking_transfer" ? (
        <>
          <Clock className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="font-display text-2xl">{t("وصلنا طلبك", "We have your request")}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              `يتحقق المتجر من تحويل ${money}، ثم يظهر رمز البطاقة هنا.`,
              `The store is checking your ${money} transfer; the card's code then shows here.`,
            )}
          </p>
          <p className="text-sm text-muted-foreground">{deliveryLine(view, lang)}</p>
          <KeepLink t={t} />
        </>
      ) : state === "over" ? (
        <>
          <XCircle className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="font-display text-2xl">
            {t("لم تكتمل عملية الشراء", "This purchase did not go through")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("تواصل مع المتجر إن دفعت.", "Contact the store if you paid.")}
          </p>
        </>
      ) : (
        <>
          <XCircle className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="font-display text-2xl">
            {state === "failed"
              ? t("لم يتم الدفع", "The payment did not go through")
              : t("لم يكتمل الدفع بعد", "The payment is not finished yet")}
          </h1>
          <Button type="button" className="min-h-11" onClick={retry} disabled={retrying}>
            {t(`ادفع ${money}`, `Pay ${money}`)}
          </Button>
        </>
      )}
      <Link
        to="/$slug"
        params={{ slug: brand.slug }}
        className="block text-sm text-muted-foreground underline underline-offset-2"
      >
        {t("العودة إلى المتجر", "Back to the store")}
      </Link>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** The page's own link, to come back to it: the code shows here once the payment is in. */
function KeepLink({ t }: { t: (ar: string, en: string) => string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The address bar still holds the link.
    }
  };
  return (
    <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={copy}>
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? t("نُسخ الرابط", "Link copied") : t("نسخ رابط هذه الصفحة", "Copy this page's link")}
    </Button>
  );
}
