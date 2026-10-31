import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Globe, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useBrand } from "@/lib/brand-context";
import { useProfile } from "@/lib/profile-context";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { formatMoney } from "@/lib/format";
import { storeAddress } from "@/lib/platform-host";
import { countOf } from "@/lib/arabic-count";
import {
  approveGiftCardPurchase,
  cancelGiftCardPurchase,
  giftCardOnlineQueries,
  invalidateGiftCardOnline,
  saveGiftCardSettings,
  type GiftCardPurchase,
} from "@/lib/data/gift-cards";
import { getGiftCardPurchaseReceiptUrl } from "@/lib/gift-card-purchase.functions";
import { giftCardError } from "../lib/gift-cards";
import {
  VALIDITY_CHOICES,
  amountsFromText,
  amountsText,
  purchaseWords,
  waitingTransfers,
} from "../lib/online-sales";

/**
 * Selling cards on the store (step four): whether the store sells them online, the amounts a
 * shopper picks from and how long a card lasts (staff who may change settings), the transfers
 * waiting to be checked (approving one issues its card), and the latest purchases.
 */
export function OnlineGiftCardsSection({ lang }: { lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  const brand = useBrand();
  const { hasPermission } = useProfile();
  const mayEdit = hasPermission("manage_settings");
  const settingsQ = useQuery(giftCardOnlineQueries.settings(brand.id));
  const purchasesQ = useQuery(giftCardOnlineQueries.purchases(brand.id));
  const purchases = purchasesQ.data ?? [];
  const waiting = waitingTransfers(purchases);
  const recent = purchases.filter((p) => !waiting.includes(p)).slice(0, 10);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Globe className="size-4" aria-hidden="true" />
        {isAr ? "البيع على المتجر" : "Selling on the store"}
      </h2>
      {mayEdit && settingsQ.isSuccess && (
        <SettingsCard
          key={settingsQ.data?.updated_at ?? "new"}
          brandId={brand.id}
          slug={brand.slug}
          lang={lang}
          initial={settingsQ.data}
        />
      )}
      {waiting.length > 0 && (
        <Card className="space-y-2 p-3">
          <p className="text-sm font-semibold">
            {isAr
              ? `تحويلات بانتظار التحقق: ${countOf(waiting.length, "card", lang)}`
              : `Transfers to check: ${countOf(waiting.length, "card", lang)}`}
          </p>
          <ul className="space-y-2">
            {waiting.map((purchase) => (
              <TransferRow key={purchase.id} purchase={purchase} lang={lang} />
            ))}
          </ul>
        </Card>
      )}
      {recent.length > 0 && (
        <Card className="p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            {isAr ? "آخر عمليات الشراء" : "Latest purchases"}
          </p>
          <ul className="divide-y divide-border text-sm">
            {recent.map((purchase) => (
              <li key={purchase.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{purchase.buyer_name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {purchaseWords(purchase)[lang]}
                  </span>
                </span>
                <span className="font-mono text-sm" dir="ltr">
                  {formatMoney(Number(purchase.amount), purchase.currency, lang)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function SettingsCard({
  brandId,
  slug,
  lang,
  initial,
}: {
  brandId: string;
  slug: string;
  lang: "ar" | "en";
  initial: { sell_online: boolean; amounts: number[]; valid_months: number | null } | null;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const moneyLabel = useMoneyLabel(lang);
  const [sellOnline, setSellOnline] = useState(initial?.sell_online ?? false);
  const [amounts, setAmounts] = useState(amountsText(initial?.amounts ?? []));
  const [validMonths, setValidMonths] = useState<number | null>(initial?.valid_months ?? 12);
  const [saving, setSaving] = useState(false);
  const parsed = amountsFromText(amounts);
  const needsAmounts = sellOnline && parsed.amounts.length === 0;
  const link = `${storeAddress(slug)}/gift-cards`;

  const save = async () => {
    if (parsed.invalid || needsAmounts) return;
    setSaving(true);
    try {
      await saveGiftCardSettings(brandId, {
        sellOnline,
        amounts: parsed.amounts,
        validMonths,
      });
      await invalidateGiftCardOnline(qc, brandId);
      toast.success(isAr ? "حُفظ" : "Saved");
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="gift-sell-online" className="text-sm">
          {isAr ? "بيع بطاقات الهدايا على المتجر" : "Sell gift cards on the store"}
        </Label>
        <Switch id="gift-sell-online" checked={sellOnline} onCheckedChange={setSellOnline} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gift-amounts" className="text-xs">
          {isAr ? `القيم المعروضة (${moneyLabel})` : `Amounts offered (${moneyLabel})`}
        </Label>
        <Input
          id="gift-amounts"
          value={amounts}
          onChange={(e) => setAmounts(e.target.value)}
          placeholder="25, 50, 100"
          dir="ltr"
          aria-invalid={parsed.invalid || needsAmounts}
        />
        <p
          className={
            parsed.invalid || needsAmounts
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {parsed.invalid
            ? isAr
              ? "حتى 8 قيم أكبر من صفر، تفصلها فاصلة."
              : "Up to 8 amounts above zero, separated by commas."
            : needsAmounts
              ? isAr
                ? "اكتب قيمة واحدة على الأقل."
                : "Write at least one amount."
              : isAr
                ? "يختار المتسوّق منها؛ لا ضريبة على البطاقة، وتُحسب المبيعة حين تُستخدم."
                : "Shoppers pick one; no VAT on a card, and the sale counts when it is spent."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gift-validity" className="text-xs">
          {isAr ? "صلاحية البطاقة" : "A card lasts"}
        </Label>
        <select
          id="gift-validity"
          value={validMonths ?? ""}
          onChange={(e) => setValidMonths(e.target.value ? Number(e.target.value) : null)}
          className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
        >
          {VALIDITY_CHOICES.map((months) => (
            <option key={months ?? "none"} value={months ?? ""}>
              {months === null
                ? isAr
                  ? "بلا تاريخ انتهاء"
                  : "No end date"
                : countOf(months, "month", lang)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
          dir="ltr"
        >
          {link.replace(/^https?:\/\//, "")}
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={saving || parsed.invalid || needsAmounts}
        >
          {isAr ? "حفظ" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

function TransferRow({ purchase, lang }: { purchase: GiftCardPurchase; lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const brand = useBrand();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const amount = formatMoney(Number(purchase.amount), purchase.currency, lang);

  const viewReceipt = async () => {
    try {
      const { url } = await getGiftCardPurchaseReceiptUrl({ data: { purchaseId: purchase.id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(isAr ? "تعذّر فتح الإيصال" : "The receipt could not be opened");
    }
  };

  const approve = async () => {
    const ok = await confirmDialog({
      title: isAr ? `اعتماد تحويل ${amount}؟` : `Approve the ${amount} transfer?`,
      description: isAr
        ? "تصدر البطاقة ويظهر رمزها للمشتري."
        : "The card is issued and its code shows to the buyer.",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await approveGiftCardPurchase(purchase.id);
      await invalidateGiftCardOnline(qc, brand.id);
      toast.success(isAr ? "صدرت البطاقة" : "Card issued");
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await cancelGiftCardPurchase(purchase.id, reason.trim());
      await invalidateGiftCardOnline(qc, brand.id);
      setDeclining(false);
    } catch (error) {
      toast.error(giftCardError(error, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="min-w-0">
          <span className="block font-medium">{purchase.buyer_name}</span>
          <span className="block text-xs text-muted-foreground" dir="ltr">
            {purchase.buyer_phone}
          </span>
          {purchase.recipient_name && (
            <span className="block text-xs text-muted-foreground">
              {isAr ? `لـ ${purchase.recipient_name}` : `For ${purchase.recipient_name}`}
            </span>
          )}
        </span>
        <span className="font-mono font-semibold" dir="ltr">
          {amount}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {purchase.receipt_key && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={viewReceipt}
          >
            <Receipt className="size-4" aria-hidden="true" />
            {isAr ? "الإيصال" : "Receipt"}
          </Button>
        )}
        <Button type="button" size="sm" onClick={approve} disabled={busy}>
          {isAr ? "اعتماد وإصدار البطاقة" : "Approve and issue the card"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDeclining((v) => !v)}>
          {isAr ? "رفض" : "Decline"}
        </Button>
      </div>
      {declining && (
        <div className="space-y-2">
          <Label htmlFor={`decline-${purchase.id}`} className="text-xs">
            {isAr ? "السبب (للسجل)" : "Why (kept on record)"}
          </Label>
          <Textarea
            id={`decline-${purchase.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
          />
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={decline}
            disabled={busy || reason.trim().length < 3}
          >
            {isAr ? "رفض الشراء" : "Decline the purchase"}
          </Button>
        </div>
      )}
    </li>
  );
}
