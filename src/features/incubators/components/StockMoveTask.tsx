import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countOf } from "@/lib/arabic-count";
import {
  StockMovePicker,
  StockMoveReview,
  type PickFields,
} from "@/features/incubators/components/StockMovePicker";
import {
  chosenPicks,
  chosenState,
  pickTotals,
  type PickRow,
} from "@/features/incubators/lib/stock-move";

/**
 * The partner page's one way of moving pieces (send to a partner, move between partners, bring
 * back to the store), in two steps on the pop-up shell: choose the pieces (`StockMovePicker`),
 * then read it all once more (`StockMoveReview`) and go. When it is done the batch's sheet opens
 * (the flow's `onSubmit` asks the page to show it). A task: the whole screen on a phone.
 */
export function StockMoveTask({
  open,
  onClose,
  busy,
  isAr,
  lang,
  money,
  icon,
  title,
  description,
  empty,
  rows,
  listed,
  onChoose,
  onEdit,
  fields,
  priceLabel,
  top,
  toolbar,
  problem,
  from,
  to,
  showValue = true,
  goLabel,
  reviewLabel,
  onSubmit,
  size = "lg",
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  isAr: boolean;
  lang: "ar" | "en";
  money: (amount: number) => string;
  icon: ReactNode;
  title: string;
  description: ReactNode;
  /** Why there is nothing to do here, when there is nothing. */
  empty?: string | null;
  rows: readonly PickRow[];
  /** The rows drawn, when a search narrows them; the totals and the review count every row. */
  listed?: readonly PickRow[];
  onChoose: (variantIds: readonly string[], chosen: boolean) => void;
  onEdit: (variantId: string, patch: Partial<PickRow>) => void;
  fields?: PickFields;
  priceLabel?: string;
  /** Above the pieces: where they go, quick choices. */
  top?: ReactNode;
  /** Replaces the bar that stays above the pieces ("every piece", the total). */
  toolbar?: ReactNode;
  /** What stops the next step, in the reader's words; null when it can go. */
  problem: string | null;
  from: string;
  to: string;
  /** Whether the pieces have a value to say (a return has no price). */
  showValue?: boolean;
  /** The last button's words for this many pieces: "Move 12 pieces". */
  goLabel: (pieces: number) => string;
  /** The first step's button: "Review the move". */
  reviewLabel?: string;
  /** Sends the chosen pieces with the note; the page closes the pop-up when it went. */
  onSubmit: (notes: string) => unknown;
  size?: "lg" | "xl";
}) {
  const [notes, setNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [touched, setTouched] = useState(false);
  const totals = pickTotals(rows);
  const piecesText = countOf(totals.pieces, "piece", lang);
  const summary = showValue ? `${piecesText} · ${money(totals.value)}` : piecesText;
  const choose = (ids: readonly string[], chosen: boolean) => {
    setTouched(true);
    onChoose(ids, chosen);
  };
  const edit = (id: string, patch: Partial<PickRow>) => {
    setTouched(true);
    onEdit(id, patch);
  };
  const all = chosenState(rows);

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      kind="task"
      size={size}
      busy={busy}
      dirty={touched || reviewing || notes.trim() !== ""}
      dir={isAr ? "rtl" : "ltr"}
    >
      <AppDialogHeader
        icon={icon}
        title={title}
        description={description}
        meta={
          empty
            ? undefined
            : reviewing
              ? isAr
                ? "الخطوة 2 من 2 · مراجعة"
                : "Step 2 of 2 · Review"
              : isAr
                ? "الخطوة 1 من 2 · اختيار القطع"
                : "Step 1 of 2 · Choose the pieces"
        }
      />

      {empty ? (
        <AppDialogBody>
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {empty}
          </p>
        </AppDialogBody>
      ) : reviewing ? (
        <AppDialogBody>
          <StockMoveReview
            isAr={isAr}
            lang={lang}
            from={from}
            to={to}
            rows={chosenPicks(rows)}
            money={money}
            notes={notes}
            showPrice={showValue}
          />
        </AppDialogBody>
      ) : (
        <AppDialogBody
          className="space-y-5"
          toolbar={
            toolbar ?? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={all}
                    onCheckedChange={(checked) =>
                      choose(
                        rows.map((row) => row.variantId),
                        checked === true,
                      )
                    }
                  />
                  {isAr ? "كل القطع" : "Every piece"}
                </label>
                <span className="text-xs text-muted-foreground tabular-nums">{summary}</span>
              </div>
            )
          }
        >
          {top}
          <StockMovePicker
            rows={listed ?? rows}
            isAr={isAr}
            fields={fields}
            priceLabel={priceLabel}
            onChoose={choose}
            onEdit={edit}
          />
          <div>
            <Label htmlFor="stock-move-notes">
              {isAr ? "ملاحظة (اختياري)" : "Note (optional)"}
            </Label>
            <Textarea
              id="stock-move-notes"
              className="mt-1.5"
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </AppDialogBody>
      )}

      <AppDialogFooter summary={empty ? undefined : (problem ?? summary)}>
        {empty ? (
          <Button variant="outline" onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        ) : reviewing ? (
          <>
            <Button variant="outline" onClick={() => setReviewing(false)} disabled={busy}>
              {isAr ? "رجوع للتعديل" : "Back to edit"}
            </Button>
            <Button onClick={() => void onSubmit(notes)} disabled={busy || Boolean(problem)}>
              {goLabel(totals.pieces)}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={() => setReviewing(true)} disabled={Boolean(problem)}>
              {reviewLabel ?? (isAr ? "مراجعة" : "Review")}
            </Button>
          </>
        )}
      </AppDialogFooter>
    </AppDialog>
  );
}
