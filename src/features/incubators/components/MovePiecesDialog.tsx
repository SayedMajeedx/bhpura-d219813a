import { useMemo, useState } from "react";
import { ArrowLeft, ArrowLeftRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Textarea } from "@/components/ui/textarea";
import { useOpenSession } from "@/hooks/use-open-session";
import { countOf } from "@/lib/arabic-count";
import { cn } from "@/lib/utils";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import {
  chosenRows,
  moveGroups,
  moveProblem,
  moveRows,
  moveTargets,
  moveTotals,
  type MoveRow,
} from "@/features/incubators/lib/move-pieces";

const SELECT_CLASS =
  "mt-1.5 h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11";

/**
 * Moving pieces from the open partner shop to another, from the admin (the owner's request of
 * 2026-11-17), in two steps: choose the partner and the pieces (each product's sizes together,
 * every piece chosen at all the partner holds, at the store's selling price and with our SKU as
 * its code), then read it all once more and move. A task: the whole screen on a phone.
 */
export function MovePiecesDialog({ page }: { page: IncubatorsPageState }) {
  const open = page.dialog === "move";
  const session = useOpenSession(open);
  return <MoveTask key={`${page.currentId ?? ""}-${session}`} page={page} open={open} />;
}

function MoveTask({ page, open }: { page: IncubatorsPageState; open: boolean }) {
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
  const [touched, setTouched] = useState(false);

  const totals = moveTotals(rows);
  const problem = moveProblem(rows, targetId, lang);
  const target = targets.find((partner) => partner.id === targetId) ?? null;
  const empty = targets.length === 0 || rows.length === 0;
  const change = (variantIds: readonly string[], patch: Partial<MoveRow>) => {
    setTouched(true);
    setRows((list) =>
      list.map((row) => (variantIds.includes(row.variantId) ? { ...row, ...patch } : row)),
    );
  };
  const allChosen = rows.length > 0 && rows.every((row) => row.chosen);
  const piecesText = countOf(totals.pieces, "piece", lang);

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => !next && page.closeDialog()}
      kind="task"
      size="lg"
      busy={busy}
      dirty={touched || reviewing || notes.trim() !== ""}
      dir={isAr ? "rtl" : "ltr"}
    >
      <AppDialogHeader
        icon={<ArrowLeftRight />}
        title={isAr ? "نقل قطع إلى محل شريك آخر" : "Move pieces to another partner"}
        description={
          <>
            {isAr ? "من " : "From "}
            <bdi>{current?.name}</bdi>
            {isAr
              ? ": تُنقل القطع مباشرة دون أن ترجع إلى المحل، وتبقى مبيعات هذا المحل ومستحقاته في حسابه."
              : ": the pieces go straight there without coming back to the store; this partner's sales and what it owes stay on its account."}
          </>
        }
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
            {targets.length === 0
              ? isAr
                ? "لا يوجد محل شريك آخر فعّال. أضف المحل الجديد أولاً، ثم ارجع هنا."
                : "There is no other active partner shop. Add the new one first, then come back here."
              : isAr
                ? "لا توجد قطع عند هذا المحل لنقلها."
                : "This partner holds no pieces to move."}
          </p>
        </AppDialogBody>
      ) : reviewing ? (
        <AppDialogBody>
          <MoveReview
            page={page}
            rows={chosenRows(rows)}
            targetName={target?.name ?? ""}
            notes={notes}
          />
        </AppDialogBody>
      ) : (
        <AppDialogBody
          className="space-y-5"
          toolbar={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={allChosen}
                  onCheckedChange={(checked) =>
                    change(
                      rows.map((row) => row.variantId),
                      { chosen: checked === true },
                    )
                  }
                />
                {isAr ? "كل القطع" : "Every piece"}
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {piecesText} · {money(totals.value)}
              </span>
            </div>
          }
        >
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

          <div className="space-y-3">
            {moveGroups(rows).map((group) => (
              <MoveGroup key={group.key} group={group} isAr={isAr} change={change} />
            ))}
          </div>

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
        </AppDialogBody>
      )}

      <AppDialogFooter
        summary={empty ? undefined : (problem ?? `${piecesText} · ${money(totals.value)}`)}
      >
        {empty ? (
          <Button variant="outline" onClick={page.closeDialog}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        ) : reviewing ? (
          <>
            <Button variant="outline" onClick={() => setReviewing(false)} disabled={busy}>
              {isAr ? "رجوع للتعديل" : "Back to edit"}
            </Button>
            <Button
              onClick={() => targetId && void page.movePieces(targetId, rows, notes)}
              disabled={busy || Boolean(problem)}
            >
              {isAr ? `نقل ${countOf(totals.pieces, "piece", "ar")}` : `Move ${piecesText}`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={page.closeDialog}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={() => setReviewing(true)} disabled={Boolean(problem)}>
              {isAr ? "مراجعة النقل" : "Review the move"}
            </Button>
          </>
        )}
      </AppDialogFooter>
    </AppDialog>
  );
}

type Group = ReturnType<typeof moveGroups>[number];

/** One product: its box chooses all its sizes, then a row a size. */
function MoveGroup({
  group,
  isAr,
  change,
}: {
  group: Group;
  isAr: boolean;
  change: (variantIds: readonly string[], patch: Partial<MoveRow>) => void;
}) {
  const all = group.rows.every((row) => row.chosen);
  const some = group.rows.some((row) => row.chosen);
  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <header className="flex items-center gap-2.5 bg-muted/40 px-3 py-2.5">
        <Checkbox
          checked={all ? true : some ? "indeterminate" : false}
          onCheckedChange={(checked) =>
            change(
              group.rows.map((row) => row.variantId),
              { chosen: checked === true },
            )
          }
          aria-label={isAr ? `كل مقاسات ${group.product}` : `Every size of ${group.product}`}
        />
        <h3 className="min-w-0 flex-1 break-words text-sm font-semibold text-page-start" dir="auto">
          {group.product}
        </h3>
        <span className="shrink-0 text-xs text-muted-foreground">
          {isAr ? `عندهم ${group.held}` : `They hold ${group.held}`}
        </span>
      </header>
      <div
        aria-hidden
        className="hidden grid-cols-[auto_minmax(0,1fr)_auto_7rem_8rem] gap-x-3 border-t border-border-subtle px-3 py-1.5 text-xs text-muted-foreground sm:grid"
      >
        <span className="w-4" />
        <span>{isAr ? "المقاس" : "Size"}</span>
        <span className="w-36 text-center">{isAr ? "الكمية" : "Quantity"}</span>
        <span>{isAr ? "السعر عندهم" : "Price there"}</span>
        <span>{isAr ? "الكود عندهم" : "Code there"}</span>
      </div>
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {group.rows.map((row) => (
          <MoveRowItem key={row.variantId} row={row} isAr={isAr} change={change} />
        ))}
      </ul>
    </section>
  );
}

/** A size: chosen or not, how many, and its price and code at the new partner. */
function MoveRowItem({
  row,
  isAr,
  change,
}: {
  row: MoveRow;
  isAr: boolean;
  change: (variantIds: readonly string[], patch: Partial<MoveRow>) => void;
}) {
  const id = `move-${row.variantId}`;
  const option = row.option ?? (isAr ? "بلا مقاس" : "No options");
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_7rem_8rem]",
        !row.chosen && "bg-muted/20",
      )}
    >
      <Checkbox
        id={`${id}-chosen`}
        checked={row.chosen}
        onCheckedChange={(checked) => change([row.variantId], { chosen: checked === true })}
        aria-label={row.name}
      />
      <label htmlFor={`${id}-chosen`} className={cn("min-w-0", !row.chosen && "opacity-60")}>
        <span className="block break-words text-sm font-medium text-page-start" dir="auto">
          {option}
        </span>
        <span className="block text-xs text-muted-foreground">
          {isAr ? `عندهم ${row.held}` : `They hold ${row.held}`}
          {row.currentCode ? ` · ${isAr ? "كودهم" : "their code"} ${row.currentCode}` : ""}
        </span>
      </label>
      <QuantityStepper
        className="w-36 justify-center"
        value={row.quantity}
        min={1}
        max={row.held}
        disabled={!row.chosen}
        onChange={(quantity) => change([row.variantId], { quantity })}
        label={isAr ? `كمية ${row.name}` : `Quantity of ${row.name}`}
        lessLabel={isAr ? `قطعة أقل من ${row.name}` : `One less ${row.name}`}
        moreLabel={isAr ? `قطعة أكثر من ${row.name}` : `One more ${row.name}`}
      />
      {row.chosen && (
        // On a phone the price and the code sit under the size; from `sm` up, in their columns.
        <div className="col-span-3 grid grid-cols-2 gap-2 ps-7 sm:contents">
          <div className="min-w-0">
            <Label htmlFor={`${id}-price`} className="text-xs text-muted-foreground sm:sr-only">
              {isAr ? "السعر عندهم" : "Price there"}
            </Label>
            <Input
              id={`${id}-price`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.001"
              value={row.price}
              onChange={(event) => change([row.variantId], { price: Number(event.target.value) })}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-code`} className="text-xs text-muted-foreground sm:sr-only">
              {isAr ? "الكود عندهم" : "Code there"}
            </Label>
            <Input
              id={`${id}-code`}
              value={row.code}
              maxLength={100}
              dir="auto"
              onChange={(event) => change([row.variantId], { code: event.target.value })}
            />
          </div>
        </div>
      )}
    </li>
  );
}

/** Everything that will move, once more before it does: from where, to where, and each piece. */
function MoveReview({
  page,
  rows,
  targetName,
  notes,
}: {
  page: IncubatorsPageState;
  rows: readonly MoveRow[];
  targetName: string;
  notes: string;
}) {
  const { isAr, lang, money, current } = page;
  const totals = moveTotals(rows);
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <Place label={isAr ? "من" : "From"} name={current?.name ?? ""} />
        <Arrow className="size-4 text-muted-foreground" aria-hidden />
        <Place label={isAr ? "إلى" : "To"} name={targetName} />
      </div>
      <p className="text-sm">
        <b className="font-semibold">{countOf(totals.pieces, "piece", lang)}</b>
        {" · "}
        {countOf(totals.lines, "item", lang)}
        {" · "}
        {isAr ? "بقيمة " : "worth "}
        <b className="font-semibold tabular-nums">{money(totals.value)}</b>
      </p>
      {moveGroups(rows).map((group) => (
        <section key={group.key} className="overflow-hidden rounded-xl border border-border">
          <h3 className="bg-muted/40 px-3 py-2 text-sm font-semibold text-page-start" dir="auto">
            {group.product}
          </h3>
          <ul className="divide-y divide-border-subtle border-t border-border-subtle text-sm">
            {group.rows.map((row) => (
              <li
                key={row.variantId}
                className="flex min-w-0 items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block break-words text-page-start" dir="auto">
                    {row.option ?? (isAr ? "بلا مقاس" : "No options")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {row.code
                      ? `${isAr ? "الكود" : "Code"} ${row.code}`
                      : isAr
                        ? "بلا كود"
                        : "No code"}
                  </span>
                </span>
                <span className="shrink-0 text-end tabular-nums">
                  <span className="block font-medium">× {row.quantity}</span>
                  <span className="block text-xs text-muted-foreground">{money(row.price)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {notes.trim() && (
        <p className="break-words rounded-lg bg-muted/40 p-3 text-sm text-page-start" dir="auto">
          {notes.trim()}
        </p>
      )}
    </div>
  );
}

function Place({ label, name }: { label: string; name: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-semibold text-page-start" dir="auto">
        {name}
      </p>
    </div>
  );
}
