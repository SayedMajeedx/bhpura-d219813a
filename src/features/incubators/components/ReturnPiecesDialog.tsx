import { useState } from "react";
import { Undo2 } from "lucide-react";
import { useOpenSession } from "@/hooks/use-open-session";
import { countOf } from "@/lib/arabic-count";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import { StockMoveTask } from "@/features/incubators/components/StockMoveTask";
import { returnProblem, returnRows, type ReturnRow } from "@/features/incubators/lib/return-pieces";
import { choosePicks } from "@/features/incubators/lib/stock-move";

/**
 * Bringing a partner's pieces back to the store, many sizes at once, on the partner page's one
 * stock flow (`StockMoveTask`; the owner's request of 2026-11-19: a return was one size at a
 * time). Opened from the page's header with nothing chosen, or from a row's "Return" with that
 * size chosen at all the partner holds. The batch's sheet opens when it is done.
 */
export function ReturnPiecesDialog({ page }: { page: IncubatorsPageState }) {
  const open = page.dialog === "return";
  const session = useOpenSession(open);
  return <ReturnTask key={`${page.currentId ?? ""}-${session}`} page={page} open={open} />;
}

function ReturnTask({ page, open }: { page: IncubatorsPageState; open: boolean }) {
  const { isAr, lang, current, currentId, allStock, money, busy, storeName } = page;
  const [rows, setRows] = useState<ReturnRow[]>(() =>
    currentId ? returnRows(allStock, currentId, lang, page.activeItem?.variant_id) : [],
  );
  const store = storeName || (isAr ? "المحل" : "The store");

  return (
    <StockMoveTask
      open={open}
      onClose={page.closeDialog}
      busy={busy}
      isAr={isAr}
      lang={lang}
      money={money}
      icon={<Undo2 />}
      title={isAr ? "إرجاع قطع إلى المحل" : "Return pieces to the store"}
      description={
        <>
          {isAr ? "من " : "From "}
          <bdi>{current?.name}</bdi>
          {isAr
            ? ": ترجع القطع إلى مخزون المحل في دفعة واحدة مرقّمة، لها ورقة تسليم يوقّعها الطرفان."
            : ": the pieces come back to the store's stock in one numbered batch, with a delivery note for both sides to sign."}
        </>
      }
      empty={
        rows.length === 0
          ? isAr
            ? "لا توجد قطع عند هذا المحل لإرجاعها."
            : "This partner holds no pieces to return."
          : null
      }
      rows={rows}
      onChoose={(ids, chosen) => setRows((list) => choosePicks(list, new Set(ids), chosen))}
      onEdit={(id, patch) =>
        setRows((list) => list.map((row) => (row.variantId === id ? { ...row, ...patch } : row)))
      }
      problem={returnProblem(rows, lang)}
      from={current?.name ?? ""}
      to={store}
      showValue={false}
      reviewLabel={isAr ? "مراجعة الإرجاع" : "Review the return"}
      goLabel={(pieces) =>
        isAr
          ? `إرجاع ${countOf(pieces, "piece", "ar")}`
          : `Return ${countOf(pieces, "piece", "en")}`
      }
      onSubmit={(notes) => page.returnPieces(rows, notes)}
    />
  );
}
