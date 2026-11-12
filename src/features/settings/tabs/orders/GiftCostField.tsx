import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { useProfileOptional } from "@/lib/profile-context";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { giftOrderQueries, invalidateGiftCosts, setGiftItemCost } from "@/lib/data/gift-orders";
import { giftCostFromText } from "@/lib/gift-addons";
import { giftRefusal } from "@/lib/gift-order";

/**
 * What the gift message card (no add-on) or one add-on costs the store, for staff who see the
 * finances only (`gift_item_costs`, step three of the gift orders plan): nothing is drawn for
 * anyone else. Each order line takes the cost in force when it is sold, and the Margins report
 * reads it in its "Gift services" row. Empty means no cost recorded.
 */
export function GiftCostField({
  brandId,
  addonId,
  lang,
}: {
  brandId: string;
  /** None for the gift message card. */
  addonId: string | null;
  lang: "ar" | "en";
}) {
  const finance = useProfileOptional()?.canViewFinancials ?? false;
  const costs = useQuery(giftOrderQueries.costs(brandId, finance));
  if (!finance || !costs.data) return null;
  const saved = addonId ? (costs.data.addons[addonId] ?? null) : costs.data.card;
  return (
    <CostInput
      key={`${addonId ?? "card"}:${saved ?? ""}`}
      brandId={brandId}
      addonId={addonId}
      saved={saved}
      lang={lang}
    />
  );
}

function CostInput({
  brandId,
  addonId,
  saved,
  lang,
}: {
  brandId: string;
  addonId: string | null;
  saved: number | null;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const id = useId();
  const qc = useQueryClient();
  const moneyLabel = useMoneyLabel(lang);
  const [value, setValue] = useState(saved === null ? "" : String(saved));
  const [saving, setSaving] = useState(false);
  const parsed = giftCostFromText(value);
  const changed = parsed !== "invalid" && parsed !== saved;

  const save = async () => {
    if (parsed === "invalid") return;
    setSaving(true);
    try {
      await setGiftItemCost(brandId, addonId, parsed);
      await invalidateGiftCosts(qc, brandId);
      toast.success(isAr ? "حُفظت التكلفة" : "Cost saved");
    } catch (error) {
      const message = getFriendlyErrorMessage(error);
      toast.error(giftRefusal(message, lang) ?? message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {isAr ? `التكلفة عليكم (${moneyLabel})` : `Cost to you (${moneyLabel})`}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          dir="ltr"
          className="max-w-40"
          aria-invalid={parsed === "invalid"}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={save}
          disabled={saving || !changed}
        >
          {isAr ? "حفظ التكلفة" : "Save cost"}
        </Button>
      </div>
      <p
        className={
          parsed === "invalid" ? "text-xs text-destructive" : "text-xs text-muted-foreground"
        }
      >
        {parsed === "invalid"
          ? isAr
            ? "اكتب رقمًا من 0 إلى 10000، أو اتركه فارغًا."
            : "Write a number from 0 to 10,000, or leave it empty."
          : isAr
            ? "يراها فقط من يطّلع على المالية. تُسجَّل على كل طلب عند بيعه، ومنها تُحسب هوامش «خدمات الهدايا»."
            : "Only staff who see the finances see it. It is recorded on each order when sold, and the “Gift services” margin is worked from it."}
      </p>
    </div>
  );
}
