import { PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { reportStockState, type ReportStockRow } from "@/lib/reports-view";

/**
 * What a size sold in the period has now, by the one availability rule: ready pieces (the store
 * plus partners) against the store's low-stock level, "made to order" for a piece made when it is
 * ordered, nothing for a service.
 */
export function ReportStockBadge({
  row,
  lowStockUnits,
  lang,
}: {
  row: ReportStockRow;
  lowStockUnits: number;
  lang: "ar" | "en";
}) {
  const state = reportStockState(row, lowStockUnits);
  const isAr = lang === "ar";
  switch (state.status) {
    case "service":
      return <span className="text-muted-foreground">—</span>;
    case "made_to_order":
      return (
        <Badge variant="outline" className="font-normal">
          {isAr ? "حسب الطلب" : "Made to order"}
          {state.readyUnits > 0 ? ` · ${state.readyUnits} ${isAr ? "جاهزة" : "ready"}` : ""}
        </Badge>
      );
    case "out":
      return (
        <Badge variant="destructive" className="flex gap-1">
          <PackageX className="h-3 w-3" /> 0
        </Badge>
      );
    case "low":
      return (
        <Badge
          variant="secondary"
          className="text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10"
        >
          {state.readyUnits}
        </Badge>
      );
    default:
      return <span className="tabular-nums">{state.readyUnits}</span>;
  }
}
