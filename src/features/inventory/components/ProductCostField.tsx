import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/lib/profile-context";

/**
 * What a product costs the store, in the product editor. Shown only to staff who may see the
 * store's finances: anyone else cannot read the cost, so their form holds none, and the database
 * keeps the real one when they save.
 */
export function ProductCostField({
  isAr,
  isService,
  value,
  error,
  onChange,
}: {
  isAr: boolean;
  isService: boolean;
  value: string;
  error?: string;
  onChange: (cost: string) => void;
}) {
  const { canViewFinancials } = useProfile();
  if (!canViewFinancials) return null;
  return (
    <div>
      <Label className="text-xs font-bold text-muted-foreground">
        {isService
          ? isAr
            ? "تكلفة الخدمة عليك (اختياري)"
            : "Your cost per booking (optional)"
          : isAr
            ? "تكلفة القطعة عليك (اختياري)"
            : "Unit Cost (Optional)"}
      </Label>
      <Input
        type="number"
        step="0.001"
        min="0"
        className={`mt-1 h-10.5 rounded-lg ${error ? "border-destructive" : ""}`}
        placeholder={isAr ? "0.000 (اختياري)" : "0.000 (optional)"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <p className="mt-1.5 text-xs text-muted-foreground">
        {isAr
          ? "اتركه فاضي إذا ما تعرف الرقم الآن، تقدر تضيفه لاحقاً لحساب صافي أرباحك بدقة."
          : "Leave it empty if you don't know it now; you can add it anytime later to track net profit."}
      </p>
    </div>
  );
}
