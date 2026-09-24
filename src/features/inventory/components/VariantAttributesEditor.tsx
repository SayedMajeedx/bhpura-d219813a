import { Check, X } from "lucide-react";
import { useMemo } from "react";
import type { Product, Variant } from "@/features/inventory/types";
import { SIZE_UNITS, SIZE_UNIT_LABELS } from "@/features/inventory/lib/size-units";
import type { VariantAttributeDraft } from "@/features/inventory/lib/variant-attributes";
import {
  resolveVariantRowAxes,
  useInventoryAxisDefaults,
} from "@/features/inventory/hooks/use-inventory-axis-defaults";

/**
 * Inline editor for a variant's option values in the desktop variants table.
 * The draft lives in the row (so a cancelled edit keeps what was typed, as
 * before); this component renders it and resolves which axes to show.
 */
export function VariantAttributesEditor({
  variant: v,
  product,
  brandId,
  isAr,
  draft,
  onDraftChange,
  onCancel,
  onSave,
}: {
  variant: Variant;
  product?: Product;
  brandId: string;
  isAr: boolean;
  draft: VariantAttributeDraft;
  onDraftChange: (patch: Partial<VariantAttributeDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const addonAxisDefaults = useInventoryAxisDefaults(brandId);
  const {
    size: sizeAxis,
    color: colorAxis,
    fabric: fabricAxis,
    four: fourAxis,
    five: fiveAxis,
  } = useMemo(
    () =>
      resolveVariantRowAxes(product, addonAxisDefaults, isAr ? "ar" : "en", {
        color: v.color,
        fabric: v.fabric,
        option_four: v.option_four,
        option_five: v.option_five,
      }),
    [product, addonAxisDefaults, isAr, v.color, v.fabric, v.option_four, v.option_five],
  );

  return (
    <div className="flex flex-col gap-2.5 p-3 bg-card/95 backdrop-blur-md border border-primary/30 rounded-2xl w-[320px] sm:w-[350px] shadow-xl animate-in fade-in zoom-in-95 duration-150 relative z-40">
      {sizeAxis.visible && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-xs font-bold text-muted-foreground block mb-1">
              {sizeAxis.label}
            </span>
            <input
              className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              value={draft.size}
              onChange={(e) => onDraftChange({ size: e.target.value })}
              placeholder={sizeAxis.label}
            />
          </div>
          <div>
            <span className="text-xs font-bold text-muted-foreground block mb-1">
              {isAr ? "الوحدة" : "Unit"}
            </span>
            <select
              className="h-9 w-full px-2 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              value={draft.sizeUnit}
              onChange={(e) => onDraftChange({ sizeUnit: e.target.value })}
            >
              {SIZE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {isAr ? SIZE_UNIT_LABELS[u]?.ar || u : SIZE_UNIT_LABELS[u]?.en || u || "—"}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {(colorAxis.visible || fabricAxis.visible || fourAxis.visible || fiveAxis.visible) && (
        <div className="grid grid-cols-2 gap-2">
          {colorAxis.visible && (
            <div>
              <span className="text-xs font-bold text-muted-foreground block mb-1">
                {colorAxis.label}
              </span>
              <input
                className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={draft.color}
                onChange={(e) => onDraftChange({ color: e.target.value })}
                placeholder={colorAxis.label}
              />
            </div>
          )}
          {fabricAxis.visible && (
            <div>
              <span className="text-xs font-bold text-muted-foreground block mb-1">
                {fabricAxis.label}
              </span>
              <input
                className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={draft.fabric}
                onChange={(e) => onDraftChange({ fabric: e.target.value })}
                placeholder={fabricAxis.label}
              />
            </div>
          )}
          {fourAxis.visible && (
            <div>
              <span className="text-xs font-bold text-muted-foreground block mb-1">
                {fourAxis.label}
              </span>
              <input
                className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={draft.optionFour}
                onChange={(e) => onDraftChange({ optionFour: e.target.value })}
                placeholder={fourAxis.label}
              />
            </div>
          )}
          {fiveAxis.visible && (
            <div>
              <span className="text-xs font-bold text-muted-foreground block mb-1">
                {fiveAxis.label}
              </span>
              <input
                className="h-9 w-full px-2.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={draft.optionFive}
                onChange={(e) => onDraftChange({ optionFive: e.target.value })}
                placeholder={fiveAxis.label}
              />
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-border-subtle mt-0.5">
        <span className="text-xs text-muted-foreground font-medium">
          {isAr ? "تعديل المتغير" : "Edit Variant Attributes"}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="h-8 px-3 rounded-lg hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-muted-foreground flex items-center gap-1 text-xs font-semibold transition-colors"
            onClick={onCancel}
          >
            <X className="h-3.5 w-3.5" />
            <span>{isAr ? "إلغاء" : "Cancel"}</span>
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 text-xs font-bold transition-all shadow-xs"
            onClick={onSave}
          >
            <Check className="h-3.5 w-3.5" />
            <span>{isAr ? "حفظ" : "Save"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
