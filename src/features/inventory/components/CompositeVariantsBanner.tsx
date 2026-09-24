import { RefreshCw, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Variant } from "@/features/inventory/types";

/** Offers to split variants whose size holds both a size and an option. */
export function CompositeVariantsBanner({
  compositeVariants,
  isHealing,
  onHeal,
  isAr,
}: {
  compositeVariants: Variant[];
  isHealing: boolean;
  onHeal: () => void;
  isAr: boolean;
}) {
  return (
    <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-start sm:items-center gap-2.5">
        <span className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5 sm:mt-0">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="text-xs">
          <span className="font-bold text-foreground block sm:inline">
            {isAr
              ? `رصد النظام دمجاً للوزن والنكهة في (${compositeVariants.length}) متغيرات:`
              : `Detected merged size and flavor in (${compositeVariants.length}) variants:`}
          </span>{" "}
          <span className="text-muted-foreground">
            {compositeVariants
              .slice(0, 3)
              .map((v) => `"${v.size}"`)
              .join("، ")}
            {isAr
              ? " — هل ترغب في فرزها وتوزيعها تلقائياً إلى محورين مستقلين؟"
              : " — Would you like to automatically split them into separate weight and flavor axes?"}
          </span>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={isHealing}
        onClick={onHeal}
        className="shrink-0 h-8 text-xs font-bold gap-1.5 w-full sm:w-auto"
      >
        {isHealing ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Zap className="h-3.5 w-3.5" />
        )}
        <span>
          {isAr
            ? "فرز وتصحيح المتغيرات تلقائياً (بنقرة واحدة)"
            : "Auto-Heal & Split Variants (1-Click)"}
        </span>
      </Button>
    </div>
  );
}
