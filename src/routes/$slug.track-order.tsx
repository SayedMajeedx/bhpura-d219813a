import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PackageSearch } from "lucide-react";
import { useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackOrder, type TrackResult } from "@/lib/order-receipt.functions";
import { OrderReceiptCard } from "@/features/order-receipt/components/OrderReceiptCard";
import { OrderTimelineTracker } from "@/features/storefront-account/components/OrderTimelineTracker";
import { statusMeta } from "@/features/storefront-account/lib/account-shared";

/**
 * Where a shopper follows an order without an account: its number and the phone it was placed
 * with show its stage, what is in it and its invoice. Before it, only a signed-in shopper could
 * see an order again, and "where is my order?" was a message to the store.
 */
export const Route = createFileRoute("/$slug/track-order")({
  validateSearch: (search: Record<string, unknown>): { number?: string } =>
    typeof search.number === "string" && search.number.length <= 32
      ? { number: search.number }
      : {},
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: TrackOrderPage,
});

function TrackOrderPage() {
  const { brand, lang, t } = useStorefront();
  const search = Route.useSearch();
  const [number, setNumber] = useState(search.number ?? "");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const isAr = lang === "ar";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!number.trim() || !phone.trim()) return;
    setBusy(true);
    try {
      setResult(await trackOrder({ data: { slug: brand.slug, number, phone } }));
    } catch {
      setResult({ found: false, limited: false });
    } finally {
      setBusy(false);
    }
  };

  const receipt = result?.found ? result.receipt : null;
  const status = receipt
    ? statusMeta(receipt.status, receipt.paymentStatus, receipt.fulfillmentStatus, isAr)
    : null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-8 sm:py-12">
      <div className="space-y-2 text-center">
        <PackageSearch className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="font-display text-2xl sm:text-3xl">{t("تتبّع طلبك", "Track your order")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "اكتب رقم الطلب ورقم الهاتف الذي طلبت به.",
            "Enter your order number and the phone number you ordered with.",
          )}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="track-number">{t("رقم الطلب", "Order number")}</Label>
          <Input
            id="track-number"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            inputMode="text"
            autoComplete="off"
            dir="ltr"
            maxLength={32}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="track-phone">{t("رقم الهاتف", "Phone number")}</Label>
          <Input
            id="track-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            maxLength={32}
            required
          />
        </div>
        <Button type="submit" className="min-h-11 w-full" disabled={busy}>
          {busy ? t("جارٍ البحث…", "Looking…") : t("تتبّع الطلب", "Track order")}
        </Button>
        {result && !result.found && (
          <p role="alert" className="text-sm text-destructive">
            {result.limited
              ? t(
                  "محاولات كثيرة. حاول مرة أخرى بعد قليل.",
                  "Too many tries. Please try again in a little while.",
                )
              : t(
                  "لم نجد طلبًا بهذا الرقم وهذا الهاتف. تحقق منهما وحاول مرة أخرى.",
                  "We found no order with this number and phone. Check both and try again.",
                )}
          </p>
        )}
      </form>

      {receipt && status && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <span className="text-sm text-muted-foreground">{t("الحالة", "Status")}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>
              {status.label}
            </span>
          </div>
          <OrderTimelineTracker
            status={receipt.status}
            paymentStatus={receipt.paymentStatus}
            fulfillmentStatus={receipt.fulfillmentStatus}
            isAr={isAr}
            t={t}
          />
          <OrderReceiptCard receipt={receipt} lang={lang} slug={brand.slug} />
        </div>
      )}
    </div>
  );
}
