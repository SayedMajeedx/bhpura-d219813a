import { useId } from "react";
import { MapPin, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RegionPicker } from "@/components/region-picker";
import { regionLabel } from "@/lib/bahrain-regions";
import type { OfferForm } from "@/features/offers/lib/offer-form";

/**
 * Where a free-delivery offer reaches: every delivery (local only or abroad too, as before), or
 * only deliveries to the areas of Bahrain the store chooses (the owner's request of 2026-11-12:
 * a week of free delivery to Sadad and the areas around it). Areas are added by typing their name
 * (`RegionPicker`) and listed as chips to take out.
 */
export function OfferAreasField({
  form,
  patch,
  isAr,
}: {
  form: OfferForm;
  patch: (next: Partial<OfferForm>) => void;
  isAr: boolean;
}) {
  const id = useId();
  const lang = isAr ? "ar" : "en";
  const add = (value: string) => {
    if (!value || form.regions.includes(value)) return;
    patch({ regions: [...form.regions, value] });
  };
  const remove = (value: string) => patch({ regions: form.regions.filter((r) => r !== value) });

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <Label htmlFor={`${id}-areas`} className="min-w-0 text-sm font-normal">
          <span className="block font-medium">
            {isAr ? "لمناطق محددة فقط" : "Only for chosen areas"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {isAr
              ? "التوصيل مجاني لعناوين هذه المناطق في البحرين، وباقي المناطق برسومها."
              : "Free for addresses in these areas of Bahrain; other areas keep their fee."}
          </span>
        </Label>
        <Switch
          id={`${id}-areas`}
          checked={form.for_areas}
          onCheckedChange={(checked) =>
            patch(
              checked
                ? // An area offer is usually for any order: the "30" a new offer starts with goes.
                  {
                    for_areas: true,
                    min_subtotal: form.min_subtotal === "30" ? "" : form.min_subtotal,
                  }
                : { for_areas: false },
            )
          }
        />
      </div>

      {form.for_areas ? (
        <div className="space-y-2">
          <RegionPicker
            id={`${id}-add`}
            value={null}
            onChange={add}
            lang={lang}
            placeholder={isAr ? "أضف منطقة..." : "Add an area..."}
            icon={<MapPin className="size-4 text-muted-foreground" aria-hidden />}
          />
          {form.regions.length > 0 && (
            <ul
              className="flex flex-wrap gap-1.5"
              aria-label={isAr ? "المناطق المختارة" : "Chosen areas"}
            >
              {form.regions.map((value) => {
                const name = regionLabel(value, lang);
                return (
                  <li
                    key={value}
                    className="flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 ps-3 pe-1 text-sm"
                  >
                    <span>{name}</span>
                    <button
                      type="button"
                      onClick={() => remove(value)}
                      aria-label={isAr ? `إزالة ${name}` : `Remove ${name}`}
                      className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
          <Label htmlFor={`${id}-local`} className="min-w-0 text-sm font-normal">
            <span className="block font-medium">
              {isAr ? "للتوصيل المحلي فقط" : "Local deliveries only"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {isAr ? "الشحن إلى الخارج يبقى برسومه." : "Shipping abroad keeps its fee."}
            </span>
          </Label>
          <Switch
            id={`${id}-local`}
            checked={form.local_only}
            onCheckedChange={(checked) => patch({ local_only: checked })}
          />
        </div>
      )}
    </div>
  );
}
