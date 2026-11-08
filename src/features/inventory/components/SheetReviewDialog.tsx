import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { countOf } from "@/lib/arabic-count";
import { formatMoney } from "@/lib/format";
import type { SheetChange } from "@/features/inventory/lib/bulk-sheet";

const FIELD_WORDS: Record<SheetChange["field"], [string, string]> = {
  price: ["السعر", "Price"],
  wasPrice: ["السعر قبل الخصم", "Was price"],
  stock: ["المخزون", "Stock"],
  cost: ["التكلفة", "Cost"],
  visible: ["الظهور في المتجر", "On the store"],
};

/** One change's before and after, in the reader's words and the store's money. */
export function changeValues(
  change: SheetChange,
  currency: string,
  isAr: boolean,
): { from: string; to: string } {
  const lang = isAr ? "ar" : "en";
  if (change.field === "visible") {
    const word = (on: boolean) => (on ? (isAr ? "ظاهر" : "Shown") : isAr ? "مخفي" : "Hidden");
    return { from: word(change.from), to: word(change.to) };
  }
  const show = (value: number | null) => {
    if (value === null) return isAr ? "بلا خصم" : "No sale";
    return change.field === "stock" ? String(value) : formatMoney(value, currency, lang);
  };
  return { from: show(change.from), to: show(change.to) };
}

/**
 * Every change the sheet will save, before it is saved: each size with its old and new value.
 * Stock is saved as a count ("what is on the shelf now"), which the stock history shows.
 */
export function SheetReviewDialog({
  open,
  onOpenChange,
  changes,
  currency,
  isAr,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: SheetChange[];
  currency: string;
  isAr: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const lang = isAr ? "ar" : "en";
  const stockChanges = changes.filter((change) => change.field === "stock").length;
  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isAr ? "مراجعة التغييرات" : "Review changes"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? `سيُحفظ: ${countOf(changes.length, "change", "ar")}.`
              : `${countOf(changes.length, "change", "en")} will be saved.`}
            {stockChanges > 0 &&
              (isAr
                ? " يُسجَّل المخزون في سجل المخزون كتصحيح جرد: الرقم المكتوب هو ما على الرف الآن."
                : " Stock goes into the stock history as a count correction: the number typed is what is on the shelf now.")}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {changes.map((change) => {
            const { from, to } = changeValues(change, currency, isAr);
            return (
              <li
                key={`${change.row.variantId}:${change.field}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="font-medium break-words">
                    {change.row.productName}
                  </span>
                  {change.field !== "visible" && (
                    <span className="text-muted-foreground"> · {change.row.options}</span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {FIELD_WORDS[change.field][lang === "ar" ? 0 : 1]}
                  </span>
                </span>
                <span className="font-mono text-xs">
                  <span className="text-muted-foreground line-through">{from}</span>
                  <span aria-hidden="true"> → </span>
                  <span className="sr-only">{isAr ? " إلى " : " to "}</span>
                  <span className="font-semibold">{to}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {isAr ? "رجوع" : "Back"}
          </Button>
          <Button onClick={onSave} disabled={saving || changes.length === 0}>
            {saving
              ? isAr
                ? "جارٍ الحفظ..."
                : "Saving..."
              : isAr
                ? `حفظ ${countOf(changes.length, "change", "ar")}`
                : `Save ${countOf(changes.length, "change", "en")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
