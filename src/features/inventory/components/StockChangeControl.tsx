import { useState } from "react";
import { Loader2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  STOCK_CHANGE_KINDS,
  planStockChange,
  stockChangeLabels,
  stockChangeProblem,
  type StockChangeKind,
  type StockChangeRequest,
} from "@/features/inventory/lib/stock-change";

/**
 * A variant's stock in the store: the number, and a button that opens the change. A change is
 * made once and says why (new stock, a count, a loss), so the stock history reads as what
 * happened; the row no longer sends a request on every press of + or −.
 */
export function StockChangeControl({
  value,
  pieceName,
  isAr,
  onSave,
}: {
  value: number;
  /** What is being changed, for the dialog's heading ("Abaya · M · Black"). */
  pieceName?: string;
  isAr: boolean;
  /** Sends the change; resolves false when it was refused (the dialog stays open). */
  onSave: (request: StockChangeRequest) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<StockChangeKind>("received");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const current = Math.max(0, Number(value) || 0);
  const plan = planStockChange({ current, kind, amount, note });
  const labels = stockChangeLabels(kind, isAr);
  const showProblem = amount.trim() !== "" && !plan.ok;

  const openDialog = () => {
    setKind("received");
    setAmount("");
    setNote("");
    setOpen(true);
  };

  const save = async () => {
    if (!plan.ok || saving) return;
    setSaving(true);
    const saved = await onSave(plan.request);
    setSaving(false);
    if (saved) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        dir="ltr"
        onClick={(event) => {
          event.stopPropagation();
          openDialog();
        }}
        className="inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 font-mono text-xs font-bold shadow-2xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={isAr ? `تغيير مخزون المحل: ${current}` : `Change store stock: ${current}`}
      >
        <span>{current}</span>
        <PencilLine className="h-3 w-3 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent
          className="max-w-[calc(100vw-2rem)] sm:max-w-md"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>{isAr ? "تغيير مخزون المحل" : "Change store stock"}</DialogTitle>
            <DialogDescription className="break-words">
              {pieceName ? `${pieceName} · ` : ""}
              {isAr ? `الموجود الآن: ${current}` : `In the store now: ${current}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div
              role="radiogroup"
              aria-label={isAr ? "سبب التغيير" : "Reason for the change"}
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {STOCK_CHANGE_KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={kind === option}
                  onClick={() => setKind(option)}
                  className={`min-w-0 break-words rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                    kind === option
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border-subtle bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {stockChangeLabels(option, isAr).title}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stock-change-amount" className="text-xs">
                {labels.amount}
              </Label>
              <Input
                id="stock-change-amount"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                dir="ltr"
                autoFocus
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void save();
                }}
                className="h-10 font-mono"
              />
              {showProblem && !plan.ok && (
                <p className="text-xs text-destructive">{stockChangeProblem(plan.problem, isAr)}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stock-change-note" className="text-xs">
                {isAr ? "ملاحظة (اختياري)" : "Note (optional)"}
              </Label>
              <Input
                id="stock-change-note"
                value={note}
                maxLength={200}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  isAr ? "مثال: دفعة الخياط، فاتورة ١٢٣" : "e.g. tailor's batch, invoice 123"
                }
                className="h-10 text-xs"
              />
            </div>

            <p
              className="rounded-lg border border-border-subtle bg-muted/40 px-3 py-2 text-xs"
              aria-live="polite"
            >
              {isAr ? "سيصبح مخزون المحل: " : "Store stock will be: "}
              <span dir="ltr" className="font-mono font-bold text-foreground">
                {current} → {plan.next}
              </span>
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button disabled={!plan.ok || saving} onClick={() => void save()}>
              {saving && <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />}
              {isAr ? "حفظ التغيير" : "Save change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
