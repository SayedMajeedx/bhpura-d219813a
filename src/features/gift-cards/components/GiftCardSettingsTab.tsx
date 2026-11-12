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
import { VALIDITY_CHOICES, rangeFromText, rangeText, type RangeProblem } from "../lib/online-sales";
import { CardDesignsSection } from "./CardDesignsSection";
import { PrintSettingsCard } from "./PrintSettingsCard";

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
      {settingsQ.isSuccess && (
        <PrintSettingsCard
          key={`print-${settingsQ.data?.updated_at ?? "new"}`}
          brandId={brand.id}
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
  initial: {
    sell_online: boolean;
    amounts: number[];
    min_amount?: number | null;
    max_amount?: number | null;
    valid_months: number | null;
  } | null;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const moneyLabel = useMoneyLabel(lang);
  const [sellOnline, setSellOnline] = useState(initial?.sell_online ?? false);
  const [range, setRange] = useState(() => rangeText(initial));
  const [validMonths, setValidMonths] = useState<number | null>(initial?.valid_months ?? 12);
  const [saving, setSaving] = useState(false);
  const parsed = rangeFromText(range.min, range.max);
  const rangeProblem: RangeProblem | null = parsed.problem;
  const link = `${storeAddress(slug)}/gift-cards`;

  const save = async () => {
    if (parsed.problem !== null) return;
    setSaving(true);
    try {
      await saveGiftCardSettings(brandId, {
        sellOnline,
        minAmount: parsed.min,
        maxAmount: parsed.max,
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
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">
          {isAr ? `قيمة البطاقة (${moneyLabel})` : `Card amount (${moneyLabel})`}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="gift-min-amount" className="text-xs text-muted-foreground">
              {isAr ? "أقل قيمة" : "Least"}
            </Label>
            <Input
              id="gift-min-amount"
              value={range.min}
              onChange={(e) => setRange((r) => ({ ...r, min: e.target.value }))}
              inputMode="numeric"
              dir="ltr"
              aria-invalid={rangeProblem !== null}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gift-max-amount" className="text-xs text-muted-foreground">
              {isAr ? "أعلى قيمة" : "Most"}
            </Label>
            <Input
              id="gift-max-amount"
              value={range.max}
              onChange={(e) => setRange((r) => ({ ...r, max: e.target.value }))}
              inputMode="numeric"
              dir="ltr"
              aria-invalid={rangeProblem !== null}
            />
          </div>
        </div>
        <p className={rangeProblem ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {rangeProblem
            ? RANGE_WORDS[rangeProblem][lang]
            : isAr
              ? "يختار المتسوّق أي قيمة بينهما بشريط أو بكتابتها؛ لا ضريبة على البطاقة، وتُحسب المبيعة حين تُستخدم."
              : "Shoppers choose any whole amount between them, on a slider or by typing it; no VAT on a card, and the sale counts when it is spent."}
        </p>
      </fieldset>
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
        <Button type="button" size="sm" onClick={save} disabled={saving || rangeProblem !== null}>
          {isAr ? "حفظ" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

const RANGE_WORDS: Record<RangeProblem, { ar: string; en: string }> = {
  missing: { ar: "اكتب أقل قيمة وأعلى قيمة.", en: "Write the least and the most amount." },
  whole: { ar: "اكتب القيمتين أرقامًا صحيحة.", en: "Write both as whole numbers." },
  order: {
    ar: "أقل قيمة من 1، ولا تزيد على أعلى قيمة.",
    en: "The least is 1 or more, and not above the most.",
  },
  too_high: { ar: "أعلى قيمة حتى 100,000.", en: "The most is up to 100,000." },
};
