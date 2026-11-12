import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useBrand } from "@/lib/brand-context";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { getFriendlyErrorMessage } from "@/lib/utils";
import {
  giftOrderQueries,
  invalidateGiftOrderSettings,
  saveGiftOrderSettings,
} from "@/lib/data/gift-orders";
import { giftPriceFromText, giftRefusal, type GiftOrderOptions } from "@/lib/gift-order";
import { GiftAddonsEditor } from "./GiftAddonsEditor";
import { GiftCostField } from "./GiftCostField";

/**
 * Gift orders, by the store's decision (`gift_order_settings`, the owner's request of 2026-11-11):
 * whether checkout offers "send as a gift", whether a gift message card goes with it and at what
 * price (0 is free; the price joins the order's total and a code never takes anything off it), and
 * whether a gift order must be paid before it is sent. Saved at once, apart from the page's form.
 */
export function GiftOrdersSettingCard({ lang }: { lang: "ar" | "en" }) {
  const brand = useBrand();
  const saved = useQuery(giftOrderQueries.settings(brand.id)).data;
  if (!saved) return null;
  // Keyed by what is saved, so a save elsewhere is shown and the fields start from it.
  return (
    <>
      <Fields key={JSON.stringify(saved)} saved={saved} brandId={brand.id} lang={lang} />
      {/* What a shopper may add to a gift (a bouquet), while the store takes gift orders. */}
      {saved.enabled && <GiftAddonsEditor brandId={brand.id} lang={lang} />}
    </>
  );
}

function Fields({
  saved,
  brandId,
  lang,
}: {
  saved: GiftOrderOptions;
  brandId: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const moneyLabel = useMoneyLabel(lang);
  const [enabled, setEnabled] = useState(saved.enabled);
  const [card, setCard] = useState(saved.card);
  const [price, setPrice] = useState(String(saved.cardPrice));
  const [prepaid, setPrepaid] = useState(saved.prepaid);
  const [saving, setSaving] = useState(false);
  const parsed = giftPriceFromText(price);
  const changed =
    enabled !== saved.enabled ||
    card !== saved.card ||
    prepaid !== saved.prepaid ||
    parsed !== saved.cardPrice;

  const save = async () => {
    if (parsed === null) return;
    setSaving(true);
    try {
      await saveGiftOrderSettings(brandId, { enabled, card, cardPrice: parsed, prepaid });
      await invalidateGiftOrderSettings(qc, brandId);
      toast.success(isAr ? "حُفظت إعدادات الهدية" : "Gift settings saved");
    } catch (error) {
      const message = getFriendlyErrorMessage(error);
      toast.error(giftRefusal(message, lang) ?? message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border-subtle bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gift className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <Label htmlFor="gift-orders-enabled" className="text-sm font-semibold">
              {isAr ? "نستقبل طلبات الهدايا" : "We take gift orders"}
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isAr
                ? "يظهر للعميل عند الدفع خيار «أرسل هذا الطلب كهدية» مع اسم المستلم."
                : "Checkout offers “Send this order as a gift” with the recipient's name."}
            </p>
          </div>
        </div>
        <Switch id="gift-orders-enabled" checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-4 border-t border-border-subtle pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="gift-orders-card" className="text-sm font-medium">
                {isAr ? "بطاقة إهداء برسالة العميل" : "A gift card with the customer's message"}
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isAr
                  ? "يكتب العميل رسالته ويختار لون البطاقة، وتطبعونها من صفحة الطلب."
                  : "The customer writes a message and picks the card's colour; you print it from the order page."}
              </p>
            </div>
            <Switch id="gift-orders-card" checked={card} onCheckedChange={setCard} />
          </div>

          {card && (
            <div className="space-y-1.5">
              <Label htmlFor="gift-orders-price" className="text-xs">
                {isAr ? `سعر البطاقة (${moneyLabel})` : `The card's price (${moneyLabel})`}
              </Label>
              <Input
                id="gift-orders-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                dir="ltr"
                className="max-w-40"
                aria-invalid={parsed === null}
              />
              <p
                className={
                  parsed === null ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                }
              >
                {parsed === null
                  ? isAr
                    ? "اكتب رقمًا من 0 إلى 1000."
                    : "Write a number from 0 to 1000."
                  : isAr
                    ? "يُضاف إلى إجمالي الطلب إذا اختار العميل البطاقة، ولا تخصم منه الأكواد ولا العروض. 0 يعني مجانًا."
                    : "Added to the order's total when the customer takes the card; codes and offers take nothing off it. 0 means free."}
              </p>
              <GiftCostField brandId={brandId} addonId={null} lang={lang} />
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="gift-orders-prepaid" className="text-sm font-medium">
                {isAr ? "طلب الهدية يُدفع مسبقًا" : "A gift order is paid in advance"}
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isAr
                  ? "يختفي الدفع عند الاستلام من طلبات الهدايا، فلا يُطلب المبلغ ممن تصله الهدية."
                  : "Cash on delivery is not offered for a gift order, so the person receiving it is never asked to pay."}
              </p>
            </div>
            <Switch id="gift-orders-prepaid" checked={prepaid} onCheckedChange={setPrepaid} />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={saving || parsed === null || !changed}
        >
          {isAr ? "حفظ إعدادات الهدية" : "Save gift settings"}
        </Button>
      </div>
    </div>
  );
}
