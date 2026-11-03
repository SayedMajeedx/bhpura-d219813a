import { useId } from "react";
import { Scissors } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";

/**
 * "We do alterations" (`business_settings.offers_alterations`, the owner's decision 3 of
 * 2026-11-03): whether an order's piece can be sent for an alteration the customer pays for.
 * On by default for clothing stores. A free fix of a piece the store had made is offered either
 * way: it is not a service the store sells.
 */
export function AlterationsSettingCard({ lang }: { lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const on = Boolean(form.bs.offers_alterations);
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border-subtle bg-card p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Scissors className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <Label htmlFor={id} className="text-sm font-semibold">
            {isAr ? "نقدّم التعديلات" : "We do alterations"}
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isAr
              ? "يظهر «تعديل القطعة» في الطلب: تقصير أو تضييق قطعة جاهزة أو مفصّلة، بسعر للعميل، عند مورد أو في ورشتك. التصليح المجاني لقطعة صنعتها يبقى متاحاً."
              : "Shows “Alter a piece” on an order: take up or take in a ready or custom piece, at a price for the customer, with a supplier or in your workshop. A free fix of a piece you had made stays available."}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        checked={on}
        onCheckedChange={(checked) => setBs({ offers_alterations: checked })}
      />
    </div>
  );
}
