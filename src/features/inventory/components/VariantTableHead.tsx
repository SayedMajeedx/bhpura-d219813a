import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { VariantRowAxes } from "@/features/inventory/hooks/use-inventory-axis-defaults";
import { stockLabels } from "@/features/inventory/lib/stock-labels";

/** Header of the desktop variants table; the first column names the visible axes. */
export function VariantTableHead({
  axes,
  isAllSelected,
  onToggleSelectAll,
  isAr,
}: {
  axes: VariantRowAxes;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
  isAr: boolean;
}) {
  const { mainTooltip } = stockLabels(isAr);
  const {
    size: sizeAxis,
    color: colorAxis,
    fabric: fabricAxis,
    four: fourAxis,
    five: fiveAxis,
  } = axes;

  return (
    <thead>
      <tr className="text-start text-xs border-b bg-muted/40 font-semibold text-muted-foreground">
        <th className="w-10 px-2 py-3 text-center align-middle">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer transition-all"
            checked={isAllSelected}
            onChange={onToggleSelectAll}
          />
        </th>
        <th className="px-3 py-3 text-start font-black text-xs">
          {(() => {
            const visibleLabels = [
              sizeAxis.visible ? sizeAxis.label : null,
              colorAxis.visible ? colorAxis.label : null,
              fabricAxis.visible ? fabricAxis.label : null,
              fourAxis.visible ? fourAxis.label : null,
              fiveAxis.visible ? fiveAxis.label : null,
            ].filter(Boolean);
            const axisSummary =
              visibleLabels.length > 0
                ? visibleLabels.join(" / ")
                : isAr
                  ? "الخصائص"
                  : "Attributes";
            return isAr
              ? `المتغير والتعريف (${axisSummary})`
              : `Variant & Identity (${axisSummary})`;
          })()}
        </th>
        <th className="w-48 px-2 py-3 text-center font-black text-xs">
          {isAr ? "السعر والأرباح" : "Price & Profit"}
        </th>
        <th className="w-56 px-2 py-3 text-center font-black text-xs">
          <div className="inline-flex items-center justify-center gap-1">
            <span>{isAr ? "المخزون والتوزيع" : "Stock & Inventory"}</span>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-center text-xs">
                  {mainTooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </th>
        <th
          className="w-20 px-2 py-3 text-center font-black text-xs"
          aria-label={isAr ? "الإجراءات" : "Actions"}
        >
          {isAr ? "إجراء" : "Action"}
        </th>
      </tr>
    </thead>
  );
}
