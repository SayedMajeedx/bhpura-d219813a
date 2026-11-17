import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PHONE_SHEET,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countOf } from "@/lib/arabic-count";
import { cn } from "@/lib/utils";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import {
  chosenRows,
  moveProblem,
  moveRows,
  moveTargets,
  moveTotals,
  type MoveRow,
} from "@/features/incubators/lib/move-pieces";

const SELECT_CLASS =
  "mt-1.5 h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm";

/**
 * Moving pieces from the open partner shop to another, from the admin (the owner's request of
 * 2026-11-17): choose the partner, tick the pieces and how many, set each one's price and code
 * at the new partner, read it all once more, then move. Every piece starts chosen at all the
 * partner holds, at the store's selling price and with our SKU as its code.
 */
export function MovePiecesDialog({ page }: { page: IncubatorsPageState }) {
  const open = page.dialog === "move";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && page.closeDialog()}>
      <DialogContent className={cn("max-w-3xl", PHONE_SHEET)} dir={page.isAr ? "rtl" : "ltr"}>
        {/* Mounted while open: each opening starts from what the partner holds then, and a
            refresh while it is open keeps what was typed. */}
        {open && <MoveForm key={page.currentId ?? ""} page={page} />}
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({ page }: { page: IncubatorsPageState }) {
  const { isAr, lang, current, currentId, incubators, allStock, money, busy } = page;
  const targets = useMemo(() => moveTargets(incubators, currentId), [incubators, currentId]);
  const [targetId, setTargetId] = useState<string | null>(() =>
    targets.length === 1 ? targets[0].id : null,
  );
  const [rows, setRows] = useState<MoveRow[]>(() =>
    currentId ? moveRows(allStock, currentId, lang) : [],
  );
  const [notes, setNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const totals = moveTotals(rows);
  const problem = moveProblem(rows, targetId, lang);
  const target = targets.find((partner) => partner.id === targetId) ?? null;
  const allChosen = rows.length > 0 && rows.every((row) => row.chosen);
  const change = (variantId: string, patch: Partial<MoveRow>) =>
    setRows((list) =>
      list.map((row) => (row.variantId === variantId ? { ...row, ...patch } : row)),
    );

  const moveNow = async () => {
    if (problem || !targetId) return;
    await page.movePieces(targetId, rows, notes);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
          {isAr ? "نقل قطع إلى محل شريك آخر" : "Move pieces to another partner"}
        </DialogTitle>
        <DialogDescription>
          {isAr
            ? `من ${current?.name ?? ""}: تُنقل القطع مباشرة دون أن ترجع إلى المحل، وتبقى مبيعات هذا المحل ومستحقاته في حسابه.`
            : `From ${current?.name ?? ""}: the pieces go straight there without coming back to the store; this partner's sales and what it owes stay on its account.`}
        </DialogDescription>
      </DialogHeader>

      {targets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {isAr
            ? "لا يوجد محل شريك آخر فعّال. أضف المحل الجديد أولاً، ثم ارجع هنا."
            : "There is no other active partner shop. Add the new one first, then come back here."}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {isAr ? "لا توجد قطع عند هذا المحل لنقلها." : "This partner holds no pieces to move."}
        </p>
      ) : reviewing ? (
        <ReviewList page={page} rows={chosenRows(rows)} targetName={target?.name ?? ""} />
      ) : (
        <div className="min-w-0 space-y-4">
          <div>
            <Label htmlFor="move-target">{isAr ? "إلى المحل الشريك" : "To the partner shop"}</Label>
            <select
              id="move-target"
              className={SELECT_CLASS}
              value={targetId ?? ""}
              onChange={(event) => setTargetId(event.target.value || null)}
            >
              <option value="">{isAr ? "اختر المحل" : "Choose a partner"}</option>
              {targets.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
            {target && (
              <p className="mt-1 text-xs text-muted-foreground">
                {isAr ? "العمولة حسب إعدادات المحل: " : "Commission from the partner's settings: "}
                {target.commission_type === "fixed"
                  ? money(Number(target.commission_value))
                  : `${Number(target.commission_value)}%`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={allChosen}
                onCheckedChange={(checked) =>
                  setRows((list) => list.map((row) => ({ ...row, chosen: checked === true })))
                }
                aria-label={isAr ? "اختيار كل القطع" : "Choose every piece"}
              />
              {isAr ? "كل القطع" : "Every piece"}
            </label>
            <span className="text-xs text-muted-foreground">
              {countOf(totals.pieces, "piece", lang)} · {money(totals.value)}
            </span>
          </div>

          <ul className="max-h-[50vh] divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border">
            {rows.map((row) => (
              <MoveRowItem key={row.variantId} row={row} isAr={isAr} change={change} />
            ))}
          </ul>

          <div>
            <Label htmlFor="move-notes">{isAr ? "ملاحظة (اختياري)" : "Note (optional)"}</Label>
            <Textarea
              id="move-notes"
              className="mt-1.5"
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
      )}

      <DialogFooter className="gap-2">
        {reviewing ? (
          <>
            <Button variant="outline" onClick={() => setReviewing(false)} disabled={busy}>
              {isAr ? "رجوع للتعديل" : "Back to edit"}
            </Button>
            <Button onClick={() => void moveNow()} disabled={busy || Boolean(problem)}>
              {isAr
                ? `نقل ${countOf(totals.pieces, "piece", "ar")}`
                : `Move ${countOf(totals.pieces, "piece", "en")}`}
            </Button>
          </>
        ) : (
          <>
            {problem && rows.length > 0 && targets.length > 0 && (
              <p className="me-auto self-center text-xs text-muted-foreground">{problem}</p>
            )}
            <Button variant="outline" onClick={page.closeDialog}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={() => setReviewing(true)} disabled={Boolean(problem)}>
              {isAr ? "مراجعة النقل" : "Review the move"}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

/** One piece: chosen or not, how many, and its price and code at the new partner. */
function MoveRowItem({
  row,
  isAr,
  change,
}: {
  row: MoveRow;
  isAr: boolean;
  change: (variantId: string, patch: Partial<MoveRow>) => void;
}) {
  const id = `move-${row.variantId}`;
  return (
    <li className={cn("space-y-2 p-3", !row.chosen && "opacity-60")}>
      <div className="flex min-w-0 items-start gap-2.5">
        <Checkbox
          id={`${id}-chosen`}
          checked={row.chosen}
          onCheckedChange={(checked) => change(row.variantId, { chosen: checked === true })}
          aria-label={row.name}
          className="mt-0.5"
        />
        <label htmlFor={`${id}-chosen`} className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-sm font-medium" dir="auto">
            {row.name}
          </span>
          <span className="block text-xs text-muted-foreground">
            {isAr ? `عندهم ${row.held}` : `They hold ${row.held}`}
            {row.currentCode ? ` · ${isAr ? "كودهم" : "their code"} ${row.currentCode}` : ""}
          </span>
        </label>
      </div>
      {row.chosen && (
        <div className="grid grid-cols-3 gap-2 ps-7">
          <div className="min-w-0">
            <Label htmlFor={`${id}-qty`} className="text-xs">
              {isAr ? "الكمية" : "Quantity"}
            </Label>
            <Input
              id={`${id}-qty`}
              type="number"
              inputMode="numeric"
              min={1}
              max={row.held}
              value={row.quantity}
              onChange={(event) => change(row.variantId, { quantity: Number(event.target.value) })}
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-price`} className="text-xs">
              {isAr ? "السعر عندهم" : "Price there"}
            </Label>
            <Input
              id={`${id}-price`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.001"
              value={row.price}
              onChange={(event) => change(row.variantId, { price: Number(event.target.value) })}
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-code`} className="text-xs">
              {isAr ? "الكود عندهم" : "Code there"}
            </Label>
            <Input
              id={`${id}-code`}
              value={row.code}
              maxLength={100}
              onChange={(event) => change(row.variantId, { code: event.target.value })}
            />
          </div>
        </div>
      )}
    </li>
  );
}

/** Everything that will move, once more before it does. */
function ReviewList({
  page,
  rows,
  targetName,
}: {
  page: IncubatorsPageState;
  rows: readonly MoveRow[];
  targetName: string;
}) {
  const { isAr, lang, money, current } = page;
  const totals = moveTotals(rows);
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm">
        {isAr
          ? `من ${current?.name ?? ""} إلى ${targetName}: ${countOf(totals.pieces, "piece", "ar")} بقيمة ${money(totals.value)}`
          : `From ${current?.name ?? ""} to ${targetName}: ${countOf(totals.pieces, "piece", "en")} worth ${money(totals.value)}`}
      </p>
      <ul className="max-h-[50vh] divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border text-sm">
        {rows.map((row) => (
          <li key={row.variantId} className="flex min-w-0 items-start justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="line-clamp-2 break-words font-medium" dir="auto">
                {row.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {row.code ? `${isAr ? "الكود" : "Code"} ${row.code}` : isAr ? "بلا كود" : "No code"}
              </span>
            </span>
            <span className="shrink-0 text-end">
              <span className="block font-mono">× {row.quantity}</span>
              <span className="block text-xs text-muted-foreground">{money(row.price)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {countOf(rows.length, "item", lang)} · {countOf(totals.pieces, "piece", lang)}
      </p>
    </div>
  );
}
