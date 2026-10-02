import { Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import type { GiveawayDetail } from "../hooks/use-giveaway-detail";
import { REJECT_REASONS } from "../lib/entry-rules";
import { rejectLabel } from "../lib/messages";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground" dir="ltr">
        {value.toLocaleString("en-US")}
      </p>
    </div>
  );
}

/** What the rules leave: the entries, why the rest were left out, and the draw button. */
export function EntriesSummary({ detail }: { detail: GiveawayDetail }) {
  const { isAr, result, rules, hasDraw } = detail;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const empty = detail.comments.length === 0;
  const canDraw = !empty && result.entries.length > 0 && !detail.pull.running && !detail.drawing;
  const rejectedRows = REJECT_REASONS.filter((reason) => result.rejected[reason] > 0);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold text-foreground">{isAr ? "المشاركون" : "Entries"}</h2>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={isAr ? "كل التعليقات" : "All comments"} value={result.totalComments} />
        <Stat label={isAr ? "حسابات علّقت" : "Accounts"} value={result.uniqueAccounts} />
        <Stat label={isAr ? "حسابات مؤهلة" : "Eligible accounts"} value={result.eligibleAccounts} />
        <Stat label={isAr ? "فرص في السحب" : "Chances in the draw"} value={result.entries.length} />
      </div>

      {rejectedRows.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {rejectedRows.map((reason) => (
            <li key={reason} className="flex justify-between gap-3">
              <span>{rejectLabel(reason, isAr)}</span>
              <span dir="ltr" className="font-medium text-foreground">
                {result.rejected[reason].toLocaleString("en-US")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {empty ? (
        <p className="text-sm text-muted-foreground">
          {isAr ? "اسحب التعليقات أولاً." : "Pull the comments first."}
        </p>
      ) : result.entries.length < rules.winners ? (
        <p className="text-sm text-foreground">
          {isAr
            ? "المشاركون المؤهلون أقل من عدد الفائزين. خفف الشروط أو قلل العدد."
            : "There are fewer eligible entrants than winners. Relax the rules or lower the number."}
        </p>
      ) : null}

      <Button
        type="button"
        disabled={!canDraw}
        onClick={() => (hasDraw ? setConfirmOpen(true) : detail.draw())}
      >
        {detail.drawing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trophy className="size-4" />
        )}
        {hasDraw ? (isAr ? "إعادة السحب" : "Draw again") : isAr ? "اسحب الفائزين" : "Draw winners"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir={isAr ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? "إعادة السحب؟" : "Draw again?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? "يُستبدل الفائزون الحاليون بنتيجة جديدة وتُحذف ملاحظات التحقق."
                : "The current winners are replaced by a new result and the checks are cleared."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={detail.draw}>
              {isAr ? "اسحب من جديد" : "Draw again"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
