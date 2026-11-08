import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cellNumber, type BulkAction } from "@/features/inventory/lib/bulk-sheet";
import { countOf } from "@/lib/arabic-count";

type Kind = BulkAction["kind"];

const KINDS: Array<{
  kind: Kind;
  ar: string;
  en: string;
  unit: "money" | "percent" | "pieces" | null;
}> = [
  { kind: "set_price", ar: "تحديد السعر", en: "Set price", unit: "money" },
  { kind: "change_price", ar: "رفع أو خفض السعر بنسبة", en: "Change price by %", unit: "percent" },
  { kind: "sale", ar: "خصم بنسبة من السعر الأصلي", en: "Put on sale, % off", unit: "percent" },
  { kind: "end_sale", ar: "إنهاء الخصم", en: "End sale", unit: null },
  { kind: "set_stock", ar: "تحديد المخزون", en: "Set stock", unit: "pieces" },
];

/** What a typed amount means for an action, or null when it cannot be applied. */
export function bulkActionOf(kind: Kind, typed: string): BulkAction | null {
  if (kind === "end_sale") return { kind };
  const raw = typed.trim();
  const negative = kind === "change_price" && raw.startsWith("-");
  const value = cellNumber(negative ? raw.slice(1) : raw.replace(/^\+/, ""));
  if (value === null || Number.isNaN(value)) return null;
  if (kind === "change_price") {
    const percent = negative ? -value : value;
    return percent > -100 && percent <= 500 ? { kind, percent } : null;
  }
  if (kind === "sale") return value > 0 && value < 100 ? { kind, percent: value } : null;
  if (kind === "set_stock") return Number.isInteger(value) ? { kind, value } : null;
  return { kind, value };
}

/**
 * The sheet's actions on the chosen rows: a price, a change by a percentage (−10 lowers), a
 * sale off the regular price, ending a sale, a stock count. They fill the chosen cells for
 * review; nothing is saved until the review.
 */
export function SheetBulkBar({
  chosenCount,
  isAr,
  onApply,
  onClearChosen,
}: {
  chosenCount: number;
  isAr: boolean;
  onApply: (action: BulkAction) => void;
  onClearChosen: () => void;
}) {
  const [kind, setKind] = useState<Kind>("change_price");
  const [amount, setAmount] = useState("");
  const amountId = useId();
  const unit = KINDS.find((k) => k.kind === kind)?.unit ?? null;
  const action = bulkActionOf(kind, amount);
  if (chosenCount === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "اختر صفوفاً لتغييرها معاً، أو عدّل أي خانة مباشرة."
          : "Choose rows to change them together, or edit any cell directly."}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-2">
      <span className="self-center text-xs font-medium">
        {isAr
          ? `المختار: ${countOf(chosenCount, "size", "ar")}`
          : `${countOf(chosenCount, "size", "en")} chosen`}
      </span>
      <Select value={kind} onValueChange={(next) => setKind(next as Kind)}>
        <SelectTrigger
          className="h-9 w-auto min-w-44"
          aria-label={isAr ? "ما الذي يتغير" : "What to change"}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KINDS.map((k) => (
            <SelectItem key={k.kind} value={k.kind}>
              {isAr ? k.ar : k.en}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {unit && (
        <div className="grid gap-1">
          <Label htmlFor={amountId} className="sr-only">
            {unit === "percent"
              ? isAr
                ? "النسبة"
                : "Percentage"
              : unit === "pieces"
                ? isAr
                  ? "عدد القطع"
                  : "Pieces"
                : isAr
                  ? "السعر"
                  : "Price"}
          </Label>
          <Input
            id={amountId}
            dir="ltr"
            inputMode="decimal"
            className="h-9 w-28"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={unit === "percent" ? (kind === "change_price" ? "+10 / -10" : "20") : "0"}
          />
        </div>
      )}
      <Button
        size="sm"
        className="h-9"
        disabled={!action}
        onClick={() => {
          if (!action) return;
          onApply(action);
          setAmount("");
        }}
      >
        {isAr ? "تطبيق على المختار" : "Apply to chosen"}
      </Button>
      <Button size="sm" variant="ghost" className="h-9" onClick={onClearChosen}>
        {isAr ? "إلغاء الاختيار" : "Clear choice"}
      </Button>
    </div>
  );
}
