import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleSlash, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
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

  // While pieces are still there, moving them is the step to take; ending waits for it.
  const movesFirst = summary.units > 0;

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => !next && page.closeDialog()}
      kind="confirm"
      size="md"
      busy={busy}
      dir={isAr ? "rtl" : "ltr"}
    >
      <AppDialogHeader
        icon={<CircleSlash />}
        title={
          <>
            {isAr ? "إنهاء الشراكة مع " : "End the partnership with "}
            <bdi>{current?.name ?? ""}</bdi>
          </>
        }
        description={
          isAr
            ? "يصير المحل موقوفاً: لا تُرسل أو تُنقل إليه قطع، ولا يظهر كمكان استلام. صفحته ومبيعاته ودفعاته وكشف حسابه تبقى، وتقدر ترجّعه فعّالاً من إعداداته."
            : "The partner becomes inactive: no pieces are sent or moved to it, and it is no longer a pickup point. Its page, sales, payments and statement stay, and it can be turned back on in its settings."
        }
      />
      <AppDialogBody>
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
      </AppDialogBody>
      <AppDialogFooter>
        <Button variant="outline" onClick={page.closeDialog} disabled={busy}>
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
        {movesFirst ? (
          <Button onClick={() => page.openDialog("move")}>
            {isAr ? "نقل القطع لمحل آخر" : "Move the pieces"}
          </Button>
        ) : (
          <Button
            variant="destructive"
            disabled={!ready || busy}
            onClick={() => void page.endPartnership()}
          >
            {isAr ? "إنهاء الشراكة" : "End the partnership"}
          </Button>
        )}
      </AppDialogFooter>
    </AppDialog>
  );
}
