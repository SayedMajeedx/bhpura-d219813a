import { useId } from "react";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/lib/profile-context";
import { cn } from "@/lib/utils";
import {
  SUGGESTED_PARTS,
  partKey,
  partsTotal,
  type CostPartRow,
} from "@/features/inventory/lib/cost-parts";
import { CostPartsEditor } from "@/features/inventory/components/CostPartsEditor";

/**
 * What a product costs the store, in the product editor: one number, or its parts (the material,
 * the making, the extras) that add up to it. Shown only to staff who may see the store's
 * finances: anyone else cannot read the cost, so their form holds none, and the database keeps
 * the real one when they save.
 */
export function ProductCostField({
  isAr,
  isService,
  value,
  parts,
  currency,
  error,
  onChange,
  onPartsChange,
}: {
  isAr: boolean;
  isService: boolean;
  value: string;
  /** The cost's parts, or null when it is one number. */
  parts: CostPartRow[] | null;
  currency: string;
  error?: string;
  onChange: (cost: string) => void;
  /** New parts and the cost they add up to (null: back to one number, the total kept). */
  onPartsChange: (parts: CostPartRow[] | null, cost: string) => void;
}) {
  const { canViewFinancials } = useProfile();
  const uid = useId();
  if (!canViewFinancials) return null;
  const startParts = () =>
    onPartsChange(
      [
        // What was typed as one number becomes the first part, so nothing is lost.
        ...(Number(value) > 0
          ? [{ key: partKey(), label: isAr ? "التكلفة" : "Cost", amount: value }]
          : []),
        ...SUGGESTED_PARTS.slice(0, Number(value) > 0 ? 1 : 2).map((part) => ({
          key: partKey(),
          label: isAr ? part.ar : part.en,
          amount: "",
        })),
      ],
      value,
    );

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-end justify-between gap-2">
        <Label htmlFor={`${uid}-cost`} className="text-xs font-bold text-muted-foreground">
          {isService
            ? isAr
              ? "تكلفة الخدمة عليك (اختياري)"
              : "Your cost per booking (optional)"
            : isAr
              ? "تكلفة القطعة عليك (اختياري)"
              : "Unit Cost (Optional)"}
        </Label>
        {!parts && !isService && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={startParts}
            className="h-8 shrink-0 gap-1 px-2 text-xs"
          >
            <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {isAr ? "قسّمها إلى أجزاء" : "Break into parts"}
          </Button>
        )}
      </div>

      {parts ? (
        <CostPartsEditor
          parts={parts}
          currency={currency}
          isAr={isAr}
          onChange={(next) => onPartsChange(next, String(partsTotal(next ?? parts)))}
        />
      ) : (
        <Input
          id={`${uid}-cost`}
          type="number"
          step="0.001"
          min="0"
          className={cn("h-10.5 rounded-lg", error && "border-destructive")}
          placeholder={isAr ? "0.000 (اختياري)" : "0.000 (optional)"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!parts && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "اتركه فاضي إذا ما تعرف الرقم الآن، تقدر تضيفه لاحقاً لحساب صافي أرباحك بدقة."
            : "Leave it empty if you don't know it now; you can add it anytime later to track net profit."}
        </p>
      )}
    </div>
  );
}
