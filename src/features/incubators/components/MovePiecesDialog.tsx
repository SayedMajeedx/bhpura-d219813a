import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useOpenSession } from "@/hooks/use-open-session";
import { countOf } from "@/lib/arabic-count";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import { StockMoveTask } from "@/features/incubators/components/StockMoveTask";
import {
  moveProblem,
  moveRows,
  moveTargets,
  type MoveRow,
} from "@/features/incubators/lib/move-pieces";
import { choosePicks, type PickRow } from "@/features/incubators/lib/stock-move";

const SELECT_CLASS =
  "mt-1.5 h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11";

/**
 * Moving pieces from the open partner shop to another, from the admin (the owner's request of
 * 2026-11-17), on the partner page's one stock flow (`StockMoveTask`): choose the partner and
 * the pieces (every piece chosen at all the partner holds, at the price it has there and with
 * our SKU as its code), read it all once more, move.
 */
export function MovePiecesDialog({ page }: { page: IncubatorsPageState }) {
  const open = page.dialog === "move";
  const session = useOpenSession(open);
  return <MoveTask key={`${page.currentId ?? ""}-${session}`} page={page} open={open} />;
}

/** A piece the move offers, as the shared picker reads it. */
const asPick = (row: MoveRow, isAr: boolean): PickRow & MoveRow => ({
  ...row,
  available: row.held,
  note: row.currentCode ? `${isAr ? "كودهم" : "their code"} ${row.currentCode}` : null,
});

function MoveTask({ page, open }: { page: IncubatorsPageState; open: boolean }) {
  const { isAr, lang, current, currentId, incubators, allStock, money, busy } = page;
  const targets = useMemo(() => moveTargets(incubators, currentId), [incubators, currentId]);
  const [targetId, setTargetId] = useState<string | null>(() =>
    targets.length === 1 ? targets[0].id : null,
  );
  const [rows, setRows] = useState<Array<PickRow & MoveRow>>(() =>
    currentId ? moveRows(allStock, currentId, lang).map((row) => asPick(row, isAr)) : [],
  );
  const target = targets.find((partner) => partner.id === targetId) ?? null;

  return (
    <StockMoveTask
      open={open}
      onClose={page.closeDialog}
      busy={busy}
      isAr={isAr}
      lang={lang}
      money={money}
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
      empty={
        targets.length === 0
          ? isAr
            ? "لا يوجد محل شريك آخر فعّال. أضف المحل الجديد أولاً، ثم ارجع هنا."
            : "There is no other active partner shop. Add the new one first, then come back here."
          : rows.length === 0
            ? isAr
              ? "لا توجد قطع عند هذا المحل لنقلها."
              : "This partner holds no pieces to move."
            : null
      }
      rows={rows}
      onChoose={(ids, chosen) => setRows((list) => choosePicks(list, new Set(ids), chosen))}
      onEdit={(id, patch) =>
        setRows((list) => list.map((row) => (row.variantId === id ? { ...row, ...patch } : row)))
      }
      fields={{ price: true, code: true }}
      top={
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
      }
      problem={moveProblem(rows, targetId, lang)}
      from={current?.name ?? ""}
      to={target?.name ?? ""}
      reviewLabel={isAr ? "مراجعة النقل" : "Review the move"}
      goLabel={(pieces) =>
        isAr ? `نقل ${countOf(pieces, "piece", "ar")}` : `Move ${countOf(pieces, "piece", "en")}`
      }
      onSubmit={(notes) => targetId && page.movePieces(targetId, rows, notes)}
    />
  );
}
