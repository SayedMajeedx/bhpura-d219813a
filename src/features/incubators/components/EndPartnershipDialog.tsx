import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleSlash, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PHONE_SHEET,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { incubatorsQueries } from "@/lib/data/incubators";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import { endPartnershipChecklist } from "@/features/incubators/lib/end-partnership";
import type { PartnerHold } from "@/features/incubators/lib/partner-stock";

const asHolds = (rows: unknown[]) => rows as PartnerHold[];

/**
 * Ending a partnership (step 4 of the partner transfers plan): what is still with the partner,
 * one line each, and the button that marks it inactive once nothing stops it. Pieces still there
 * or held for open orders stop it; money owed does not.
 */
export function EndPartnershipDialog({ page }: { page: IncubatorsPageState }) {
  const { isAr, lang, brand, current, currentId, summary, money, busy } = page;
  const open = page.dialog === "end";
  const holds = useQuery({
    ...incubatorsQueries.orderHolds(brand.id),
    select: asHolds,
    enabled: open && Boolean(brand.id),
  });
  const checklist = endPartnershipChecklist({
    pieces: summary.units,
    holds: holds.data ?? [],
    incubatorId: currentId ?? "",
    due: summary.due,
    money,
    lang,
  });
  const ready = !holds.isPending && checklist.canEnd;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && page.closeDialog()}>
      <DialogContent className={cn("max-w-lg", PHONE_SHEET)} dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleSlash className="h-4 w-4" aria-hidden />
            {isAr
              ? `إنهاء الشراكة مع ${current?.name ?? ""}`
              : `End the partnership with ${current?.name ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "يصير المحل موقوفاً: لا تُرسل أو تُنقل إليه قطع، ولا يظهر كمكان استلام. صفحته ومبيعاته ودفعاته وكشف حسابه تبقى، وتقدر ترجّعه فعّالاً من إعداداته."
              : "The partner becomes inactive: no pieces are sent or moved to it, and it is no longer a pickup point. Its page, sales, payments and statement stay, and it can be turned back on in its settings."}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {checklist.items.map((item) => {
            const Icon = item.clear ? CheckCircle2 : item.blocks ? AlertTriangle : Info;
            return (
              <li
                key={item.key}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border p-3 text-sm",
                  item.blocks ? "border-warning/40 bg-warning/10" : "border-border",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    item.clear
                      ? "text-success"
                      : item.blocks
                        ? "text-warning"
                        : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 break-words">{item.text}</span>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="gap-2">
          {summary.units > 0 && (
            <Button variant="outline" onClick={() => page.openDialog("move")} className="me-auto">
              {isAr ? "نقل القطع لمحل آخر" : "Move the pieces"}
            </Button>
          )}
          <Button variant="outline" onClick={page.closeDialog}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            variant="destructive"
            disabled={!ready || busy}
            onClick={() => void page.endPartnership()}
          >
            {isAr ? "إنهاء الشراكة" : "End the partnership"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
