import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { invalidateGiftCardOnline, saveGiftCardPrint } from "@/lib/data/gift-cards";
import { giftCardError } from "../lib/gift-cards";
import { printFeeFromText } from "../lib/online-sales";

/**
 * The store prints the cards bought online, never the buyer (the owner's decision of 2026-11-08):
 * whether a shopper may ask for a printed card, and the store's fee for printing and delivering
 * one, added to what the shopper pays. The card itself holds its value only.
 */
export function PrintSettingsCard({
  brandId,
  lang,
  initial,
}: {
  brandId: string;
  lang: "ar" | "en";
  initial: { print_enabled: boolean; print_fee: number } | null;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const moneyLabel = useMoneyLabel(lang);
  const [enabled, setEnabled] = useState(initial?.print_enabled ?? false);
  const [fee, setFee] = useState(String(initial?.print_fee ?? 0));
  const [saving, setSaving] = useState(false);
  const parsed = printFeeFromText(fee);

  const save = async () => {
    if (parsed === null) return;
    setSaving(true);
    try {
      await saveGiftCardPrint(brandId, { enabled, fee: parsed });
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
        <Label htmlFor="gift-print-enabled" className="text-sm">
          {isAr ? "نطبع البطاقة ونوصلها للمشتري" : "We print and deliver cards"}
        </Label>
        <Switch id="gift-print-enabled" checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "يختار المشتري بين بطاقة رقمية أو مطبوعة. المطبوعة تطبعونها أنتم وتوصلونها، ويدفع المشتري رسومها فوق قيمة البطاقة."
          : "Shoppers choose a digital or a printed card. You print and deliver the printed one, and the shopper pays its fee on top of the card's value."}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="gift-print-fee" className="text-xs">
          {isAr
            ? `رسوم الطباعة والتوصيل (${moneyLabel})`
            : `Printing and delivery fee (${moneyLabel})`}
        </Label>
        <Input
          id="gift-print-fee"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          inputMode="decimal"
          dir="ltr"
          className="max-w-40"
          aria-invalid={parsed === null}
        />
        <p
          className={parsed === null ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {parsed === null
            ? isAr
              ? "اكتب رقمًا من 0 إلى 1000."
              : "Write a number from 0 to 1000."
            : isAr
              ? "ما يدفعه المشتري، وفيه الضريبة إن كان المتجر يحتسبها. تُحسب في المبيعات ولا تُضاف إلى رصيد البطاقة. 0 تعني مجانًا."
              : "What the shopper pays, VAT included when the store charges it. It counts in sales and is never added to the card's balance. 0 means free."}
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={saving || parsed === null}>
          {isAr ? "حفظ الطباعة" : "Save printing"}
        </Button>
      </div>
    </Card>
  );
}
