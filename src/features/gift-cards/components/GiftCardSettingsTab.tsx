import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useBrand } from "@/lib/brand-context";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { storeAddress } from "@/lib/platform-host";
import { countOf } from "@/lib/arabic-count";
import {
  giftCardOnlineQueries,
  invalidateGiftCardOnline,
  saveGiftCardSettings,
} from "@/lib/data/gift-cards";
import { giftCardError } from "../lib/gift-cards";
import { VALIDITY_CHOICES, amountsFromText, amountsText } from "../lib/online-sales";
import { CardDesignsSection } from "./CardDesignsSection";

/** How the store sells its cards, for staff who may change settings: the offer, and the designs. */
export function GiftCardSettingsTab({ lang }: { lang: "ar" | "en" }) {
  const brand = useBrand();
  const settingsQ = useQuery(giftCardOnlineQueries.settings(brand.id));
  return (
    <div className="space-y-4">
      {settingsQ.isSuccess && (
        <SettingsCard
          key={settingsQ.data?.updated_at ?? "new"}
          brandId={brand.id}
          slug={brand.slug}
          lang={lang}
          initial={settingsQ.data}
        />
      )}
      <CardDesignsSection lang={lang} />
    </div>
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
