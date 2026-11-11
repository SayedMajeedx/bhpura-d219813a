import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Clock, Copy, Gift, Link2, Printer, RefreshCw, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { giftAddress, giftLinkMessage } from "@/lib/gift-link";
import { resetGiftLink } from "@/lib/gift-link.functions";
import { getGiftCardPurchase } from "@/lib/gift-card-purchase.functions";
import { deliveryLine, printLine, purchaseState } from "../lib/gift-card-shop";
import { GiftCardPreview } from "@/features/gift-card-design/components/GiftCardPreview";
import { CardKeepActions } from "@/features/gift-card-design/components/CardKeepActions";
import { readDesign } from "@/features/gift-card-design/lib/design";
import { useStorefrontCardKit } from "../hooks/use-storefront-card-kit";

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
  // A new gift link the buyer asked for here, until the page reads the purchase again.
  const [renewed, setRenewed] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const kit = useStorefrontCardKit();
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
  // What the buyer pays: the card's value, plus the store's fee when it prints the card.
  const due = formatPrice(view.total, view.currency, lang);
  const printed = printLine(view, lang);
  const state = purchaseState(view, paymentFailed);
  const design = readDesign(view.design, lang);
  const details = {
    amount: view.amount,
    code: view.code,
    to: view.recipientName,
    message: view.message,
    expiresOn: view.expiresOn,
  };
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
    const giftToken = renewed ?? view.giftToken;
    const giftLink = giftToken ? giftAddress(brand.slug, giftToken) : null;
    const message = giftLink
      ? giftLinkMessage(
          { recipient: view.recipientName, message: view.message, storeName, link: giftLink },
          lang,
        )
      : "";
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(view.code ?? "");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        // The code stays on screen to copy by hand.
      }
    };
    const copyLink = async () => {
      try {
        await navigator.clipboard.writeText(giftLink ?? "");
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1500);
      } catch {
        // The WhatsApp button still carries the link.
      }
    };
    const renew = async () => {
      const sure = await confirmDialog({
        title: t("إنشاء رابط إهداء جديد؟", "Make a new gift link?"),
        description: t(
          "يتوقف الرابط القديم عن العمل. البطاقة ورمزها ورصيدها تبقى كما هي.",
          "The old link stops working. The card, its code and its balance stay as they are.",
        ),
        confirmLabel: t("رابط جديد", "New link"),
      });
      if (!sure) return;
      const reply = await resetGiftLink({ data: { purchaseId, token } }).catch(() => null);
      if (reply) setRenewed(reply.giftToken);
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
        <GiftCardPreview kit={kit} design={design} details={details} primary={lang} lang={lang} />
        {giftLink && (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild className="min-h-11 min-w-0 gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Send className="size-4 shrink-0" aria-hidden />
                  {t("أرسلها كهدية على واتساب", "Send as a gift on WhatsApp")}
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 min-w-0 gap-2"
                onClick={copyLink}
              >
                {linkCopied ? (
                  <Check className="size-4 shrink-0" aria-hidden />
                ) : (
                  <Link2 className="size-4 shrink-0" aria-hidden />
                )}
                {linkCopied
                  ? t("نُسخ الرابط", "Link copied")
                  : t("نسخ رابط الإهداء", "Copy the gift link")}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {t(
                "رابط الإهداء يفتح البطاقة بتصميمها مع رمزها، ولا يظهر فيه شيء عن الدفع أو بياناتك.",
                "The gift link opens the card in its design with its code, and shows nothing of the payment or your details.",
              )}
            </p>
          </div>
        )}
        <div className="space-y-2 rounded-xl border border-border px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">
            {t("رمز البطاقة، إن أردتها لنفسك", "The card's code, if it is for you")}
          </p>
          <p className="font-mono text-lg font-bold tracking-wider" dir="ltr">
            {view.code}
          </p>
          <p className="text-xs text-muted-foreground">
            {money}
            {expiry ? ` · ${t(`صالحة حتى ${expiry}`, `Valid until ${expiry}`)}` : ""}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 gap-2"
            onClick={copy}
          >
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? t("نُسخ", "Copied") : t("نسخ الرمز", "Copy the code")}
          </Button>
        </div>
        <CardKeepActions
          kit={kit}
          design={design}
          details={details}
          primary={lang}
          lang={lang}
          fileName={`${storeName || "gift"}-card`.replace(/s+/g, "-").toLowerCase()}
        />
        {giftLink && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mx-auto flex min-h-11 gap-1.5 text-muted-foreground"
            onClick={renew}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {t("أُرسل لشخص خطأ؟ أنشئ رابطًا جديدًا", "Sent to the wrong person? Make a new link")}
          </Button>
        )}
        {printed && <PrintNote text={printed} />}
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
          <GiftCardPreview
            kit={kit}
            design={design}
            details={details}
            primary={lang}
            lang={lang}
            showBack={false}
            className="pb-2"
          />
          <Clock className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="font-display text-2xl">{t("وصلنا طلبك", "We have your request")}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              `يتحقق المتجر من تحويل ${due}، ثم يظهر رمز البطاقة هنا.`,
              `The store is checking your ${due} transfer; the card's code then shows here.`,
            )}
          </p>
          <p className="text-sm text-muted-foreground">{deliveryLine(view, lang)}</p>
          {printed && <PrintNote text={printed} />}
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
            {t(`ادفع ${due}`, `Pay ${due}`)}
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

/** The card the store prints: where it is going, or that it is on its way or arrived. */
function PrintNote({ text }: { text: string }) {
  return (
    <p className="flex items-start justify-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm break-words">
      <Printer className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span dir="auto">{text}</span>
    </p>
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
