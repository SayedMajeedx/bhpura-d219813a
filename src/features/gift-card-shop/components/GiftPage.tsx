import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Copy, Eye, Gift, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { getGift, openGiftCode } from "@/lib/gift-link.functions";
import { isGiftToken, rememberGiftCode, type GiftState } from "@/lib/gift-link";
import { GiftCardPreview } from "@/features/gift-card-design/components/GiftCardPreview";
import { CardKeepActions } from "@/features/gift-card-design/components/CardKeepActions";
import { readDesign } from "@/features/gift-card-design/lib/design";
import { useStorefrontCardKit } from "../hooks/use-storefront-card-kit";

/**
 * A gift card as the person it is for receives it (`/<store>/gift/<token>`): a closed gift to
 * open, then the card in the design its giver chose with their words, its code on a tap (asked
 * from the server only then, so no chat preview holds it) to copy, and a way to shop with it: the
 * code goes with them to the store's checkout. Nothing of the purchase is here.
 */
export function GiftPage({ token }: { token: string }) {
  const { brand, lang, t } = useStorefront();
  const navigate = useNavigate();
  const kit = useStorefrontCardKit();
  const link = { slug: brand.slug, token };
  const query = useQuery({
    queryKey: ["storefront", "gift", brand.slug, token],
    queryFn: () => getGift({ data: link }),
    enabled: isGiftToken(token),
  });
  const [opened, setOpened] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [refused, setRefused] = useState<"tries" | "closed" | null>(null);
  const [copied, setCopied] = useState(false);
  const view = query.data;
  const storeName = (lang === "ar" ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug;

  if (query.isLoading) return <Shell>{t("جارٍ التحميل…", "Loading…")}</Shell>;
  if (!view) {
    return (
      <Shell>
        <p>
          {t(
            "هذا الرابط لم يعد يعمل. اطلب ممن أهداك البطاقة أن يرسل رابطها الجديد.",
            "This link no longer works. Ask the person who gave you the card for its new link.",
          )}
        </p>
        <BackToStore slug={brand.slug} t={t} />
      </Shell>
    );
  }

  const design = readDesign(view.design, view.lang ?? lang);
  const details = {
    amount: view.amount,
    code,
    to: view.to,
    message: view.message,
    expiresOn: view.expiresOn,
  };
  const money = formatPrice(view.amount, view.currency, lang);
  const left = formatPrice(view.balance, view.currency, lang);
  const expiry = view.expiresOn
    ? new Date(`${view.expiresOn}T12:00:00`).toLocaleDateString(
        lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB",
        { day: "numeric", month: "short", year: "numeric" },
      )
    : null;

  /** The code, asked for once; null when the server will not give it. */
  const fetchCode = async (): Promise<string | null> => {
    if (code) return code;
    setAsking(true);
    setRefused(null);
    try {
      const reply = await openGiftCode({ data: link });
      if (reply.ok) {
        setCode(reply.code);
        return reply.code;
      }
      setRefused(reply.reason);
      return null;
    } catch {
      setRefused("closed");
      return null;
    } finally {
      setAsking(false);
    }
  };

  const copy = async () => {
    const value = await fetchCode();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The code is on screen to copy by hand.
    }
  };

  const shop = async () => {
    const value = await fetchCode();
    if (value) rememberGiftCode(brand.slug, value);
    await navigate({ to: "/$slug", params: { slug: brand.slug } });
  };

  if (!opened) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center gap-5 px-4 py-12 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Gift className="size-9" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h1 className="font-display text-3xl break-words" dir="auto">
            {view.to
              ? t(`${view.to}، وصلتك هدية`, `${view.to}, a gift for you`)
              : t("وصلتك هدية", "A gift for you")}
          </h1>
          <p className="text-sm text-muted-foreground break-words" dir="auto">
            {view.from
              ? t(`من ${view.from} · ${storeName}`, `From ${view.from} · ${storeName}`)
              : t(`بطاقة هدية من ${storeName}`, `A gift card from ${storeName}`)}
          </p>
        </div>
        <Button type="button" size="lg" className="min-h-12 px-8" onClick={() => setOpened(true)}>
          {t("افتح الهدية", "Open your gift")}
        </Button>
      </div>
    );
  }

  const ready = view.state === "ready";
  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-4 py-8 sm:py-12">
      <div className="transition-[opacity,transform] duration-(--motion-slow) ease-(--motion-ease-smooth) starting:translate-y-4 starting:scale-95 starting:opacity-0">
        <GiftCardPreview
          kit={kit}
          design={design}
          details={details}
          primary={lang}
          lang={lang}
          showBack={ready}
        />
      </div>

      {view.message && (
        <blockquote
          className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-center text-base leading-relaxed break-words whitespace-pre-line"
          dir="auto"
        >
          {view.message}
          {view.from && (
            <footer className="mt-2 text-sm text-muted-foreground" dir="auto">
              {view.from}
            </footer>
          )}
        </blockquote>
      )}

      {ready ? (
        <>
          <div className="space-y-1 text-center">
            <p className="text-lg font-semibold">{money}</p>
            <p className="text-xs text-muted-foreground">
              {[
                view.balance < view.amount ? t(`المتبقي ${left}`, `${left} left`) : null,
                expiry ? t(`صالحة حتى ${expiry}`, `Valid until ${expiry}`) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="rounded-xl border border-border px-4 py-4 text-center">
            {code ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{t("رمز البطاقة", "Card code")}</p>
                <p className="font-mono text-xl font-bold tracking-wider" dir="ltr">
                  {code}
                </p>
                <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={copy}>
                  {copied ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                  {copied ? t("نُسخ", "Copied") : t("نسخ الرمز", "Copy the code")}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2"
                onClick={fetchCode}
                disabled={asking}
              >
                <Eye className="size-4" aria-hidden />
                {t("أظهر رمز البطاقة", "Show the card's code")}
              </Button>
            )}
            {refused && (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {refused === "tries"
                  ? t("محاولات كثيرة. حاول بعد قليل.", "Too many tries. Try again shortly.")
                  : t("تعذّر إظهار الرمز الآن.", "The code could not be shown right now.")}
              </p>
            )}
          </div>

          <Button type="button" className="min-h-12 w-full gap-2" onClick={shop} disabled={asking}>
            <ShoppingBag className="size-4" aria-hidden />
            {t("تسوّق بالبطاقة", "Shop with your card")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t(
              "نكتب الرمز لك عند الدفع. احتفظ بهذا الرابط لترجع إلى بطاقتك ورصيدها.",
              "We fill the code in for you at checkout. Keep this link to come back to your card and its balance.",
            )}
          </p>
          {code && (
            <CardKeepActions
              kit={kit}
              design={design}
              details={details}
              primary={lang}
              lang={lang}
              fileName={`${storeName || "gift"}-card`.replace(/\s+/g, "-").toLowerCase()}
            />
          )}
        </>
      ) : (
        <>
          <p className="text-center text-sm text-muted-foreground" role="status">
            {closedLine(view.state, expiry, t)}
          </p>
          <BackToStore slug={brand.slug} t={t} />
        </>
      )}
    </div>
  );
}

type Translate = (ar: string, en: string) => string;

/** Why a card can no longer be used, said kindly. */
function closedLine(state: GiftState, expiry: string | null, t: Translate): string {
  if (state === "used") {
    return t("استُخدم رصيد هذه البطاقة كاملًا.", "This card's balance has been used in full.");
  }
  if (state === "expired") {
    return expiry
      ? t(`انتهت صلاحية هذه البطاقة في ${expiry}.`, `This card expired on ${expiry}.`)
      : t("انتهت صلاحية هذه البطاقة.", "This card has expired.");
  }
  return t(
    "هذه البطاقة لم تعد صالحة. تواصل مع المتجر.",
    "This card is no longer valid. Contact the store.",
  );
}

function BackToStore({ slug, t }: { slug: string; t: Translate }) {
  return (
    <Link
      to="/$slug"
      params={{ slug }}
      className="block text-center text-sm text-muted-foreground underline underline-offset-2"
    >
      {t("زيارة المتجر", "Visit the store")}
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
