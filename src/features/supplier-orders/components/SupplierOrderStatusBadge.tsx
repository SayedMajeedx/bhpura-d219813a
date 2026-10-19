import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusLabel, type SupplierOrderStatus } from "../lib/order-state";

const TONE: Record<SupplierOrderStatus, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  ordered: "border-primary/20 bg-primary/10 text-primary",
  partially_received: "border-warning/30 bg-warning-subtle text-warning",
  received: "border-success/30 bg-success-subtle text-success",
  cancelled: "border-border bg-muted text-muted-foreground line-through",
};

/** Where an order's goods are, and whether they are late. */
export function SupplierOrderStatusBadge({
  status,
  late,
  isAr,
}: {
  status: SupplierOrderStatus;
  late?: boolean;
  isAr: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="outline" className={cn("text-xs font-semibold", TONE[status])}>
        {statusLabel(status, isAr)}
      </Badge>
      {late && (
        <Badge
          variant="outline"
          className="border-warning/30 bg-warning-subtle text-xs font-semibold text-warning"
        >
          {isAr ? "متأخرة" : "Late"}
        </Badge>
      )}
    </span>
  );
}
