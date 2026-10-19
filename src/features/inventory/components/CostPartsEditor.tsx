import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import {
  MAX_PART_LABEL,
  MAX_PARTS,
  SUGGESTED_PARTS,
  partKey,
  partProblems,
  partsTotal,
  type CostPartRow,
} from "@/features/inventory/lib/cost-parts";

/**
 * A product's cost in parts: each part a name and an amount, a part added in one tap, and the
 * cost they add up to. `onChange(null)` goes back to one number (the total is kept by the caller).
 */
export function CostPartsEditor({
  parts,
  currency,
  isAr,
  onChange,
}: {
  parts: CostPartRow[];
  currency: string;
  isAr: boolean;
  onChange: (parts: CostPartRow[] | null) => void;
}) {
  const lang = isAr ? "ar" : "en";
  const bad = partProblems(parts);
  const change = (next: CostPartRow[]) => onChange(next.length ? next : null);
  const addPart = (label = "") =>
    parts.length < MAX_PARTS && change([...parts, { key: partKey(), label, amount: "" }]);
  const unused = SUGGESTED_PARTS.map((p) => (isAr ? p.ar : p.en)).filter(
    (label) => !parts.some((row) => row.label.trim() === label),
  );

  return (
    <div className="space-y-2 rounded-lg border border-border-subtle p-2.5">
      {parts.map((row, index) => (
        <div key={row.key} className="flex min-w-0 items-center gap-2">
          <Input
            aria-label={isAr ? `اسم الجزء ${index + 1}` : `Part ${index + 1} name`}
            value={row.label}
            maxLength={MAX_PART_LABEL}
            placeholder={isAr ? "مثال: الخامة" : "e.g. Material"}
            onChange={(e) =>
              change(parts.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))
            }
            aria-invalid={bad.has(row.key) || undefined}
            className="min-w-0 flex-1"
          />
          <Input
            aria-label={
              isAr
                ? `مبلغ ${row.label || `الجزء ${index + 1}`}`
                : `Amount of ${row.label || `part ${index + 1}`}`
            }
            inputMode="decimal"
            value={row.amount}
            placeholder="0.000"
            onChange={(e) =>
              change(parts.map((r) => (r.key === row.key ? { ...r, amount: e.target.value } : r)))
            }
            aria-invalid={bad.has(row.key) || undefined}
            className="w-24 shrink-0 font-mono tabular-nums"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => change(parts.filter((r) => r.key !== row.key))}
            aria-label={
              isAr
                ? `حذف ${row.label || `الجزء ${index + 1}`}`
                : `Remove ${row.label || `part ${index + 1}`}`
            }
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {bad.size > 0 && (
        <p className="text-xs text-destructive">
          {isAr
            ? "لكل جزء اسم ومبلغ (صفر أو أكثر)."
            : "Each part needs a name and an amount (zero or more)."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {parts.length < MAX_PARTS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addPart()}
            className="h-8 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {isAr ? "جزء" : "Part"}
          </Button>
        )}
        {parts.length < MAX_PARTS &&
          unused.map((label) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => addPart(label)}
              className="h-8 px-2 text-xs text-muted-foreground"
            >
              + {label}
            </Button>
          ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
        <span className="text-xs font-semibold">{isAr ? "تكلفة القطعة" : "Cost of a piece"}</span>
        <span className="font-bold tabular-nums">
          {formatMoney(partsTotal(parts), currency, lang)}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {isAr ? "رقم واحد بدل الأجزاء" : "Use one number instead"}
      </button>
    </div>
  );
}
