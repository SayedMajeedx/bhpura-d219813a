import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBrand } from "@/lib/brand-context";
import { useProfileOptional } from "@/lib/profile-context";
import { customerOrderName } from "../lib/customer-pieces";
import { awaitsChoice, purposeLabel } from "../lib/after-sending";
import type { SupplierOrderLine } from "../lib/order-state";
import { CancelledPieceDialog } from "./CancelledPieceDialog";
import { useOrderNumberFormat } from "@/hooks/use-order-number";

/**
 * A supplier order's customers' pieces: each with its customer's order (by number, never a
 * name), whether it is made, fixed or altered and what to do, what arrived and its cost. A piece
 * whose customer cancelled says so and asks the store what to do with it.
 */
export function CustomerPiecesCard({
  brandId,
  lines,
  cost,
  sizeName,
  open,
  lang,
}: {
  brandId: string;
  lines: readonly SupplierOrderLine[];
  /** A piece's cost with its share of the order's other costs. */
  cost: (line: SupplierOrderLine) => string;
  sizeName: (variantId: string | null) => string;
  /** The supplier order is not cancelled: its pieces can still be decided on. */
  open: boolean;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const numberFormat = useOrderNumberFormat();
  const brand = useBrand();
  const profile = useProfileOptional();
  const may = (permission: string) =>
    Boolean(profile?.isAdmin || profile?.hasPermission(permission));
  const canDecide = open && may("manage_orders") && may("view_financials");
  const [deciding, setDeciding] = useState<SupplierOrderLine | null>(null);

  return (
    <Card className="p-3 sm:p-4">
      <h3 className="mb-2 font-bold">{isAr ? "قطع الزبائن" : "Customer pieces"}</h3>
      <ul className="divide-y divide-border-subtle text-sm">
        {lines.map((line) => {
          const work = purposeLabel(line.purpose, isAr);
          const cancelled = awaitsChoice(line);
          return (
            <li key={line.id} className="space-y-1.5 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="text-page-start line-clamp-2 break-words font-semibold">
                    {work && (
                      <span className="me-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                        {work}
                      </span>
                    )}
                    {line.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {line.customer_order ? (
                      <Link
                        to="/admin/b/$slug/orders/$id"
                        params={{ slug: brand.slug, id: line.customer_order.id }}
                        className="text-primary hover:underline"
                      >
                        {customerOrderName(line.customer_order.invoice_number, isAr, numberFormat)}
                      </Link>
                    ) : (
                      customerOrderName(null, isAr, numberFormat)
                    )}
                  </p>
                  {line.work_note && (
                    <p dir="auto" className="text-page-start break-words text-xs">
                      {line.work_note}
                    </p>
                  )}
                </div>
                <span dir="ltr" className="shrink-0 whitespace-nowrap px-2 tabular-nums">
                  <span
                    className={
                      line.received_quantity >= line.quantity ? "font-bold text-success" : ""
                    }
                  >
                    {line.received_quantity}
                  </span>
                  <span className="text-muted-foreground"> / {line.quantity}</span>
                </span>
                <span className="shrink-0 tabular-nums">{cost(line)}</span>
              </div>
              {cancelled && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                  <span className="min-w-0 flex-1 font-semibold">
                    {isAr
                      ? "ألغى الزبون طلبه: قرّر ماذا تفعل بالقطعة."
                      : "The customer cancelled: decide what happens to the piece."}
                  </span>
                  {canDecide && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => setDeciding(line)}
                    >
                      {isAr ? "قرّر" : "Decide"}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {deciding && (
        <CancelledPieceDialog
          open={Boolean(deciding)}
          onOpenChange={(next) => !next && setDeciding(null)}
          brandId={brandId}
          line={deciding}
          sizeName={sizeName(deciding.variant_id)}
          canStock={may("manage_inventory")}
          lang={lang}
        />
      )}
    </Card>
  );
}
