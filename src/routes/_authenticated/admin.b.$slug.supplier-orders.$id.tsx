import { createFileRoute } from "@tanstack/react-router";
import { SupplierOrderPage } from "@/features/supplier-orders/components/SupplierOrderPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/supplier-orders/$id")({
  // A new order can start with sizes chosen to order again ("variant:pieces,…").
  validateSearch: (search: Record<string, unknown>): { reorder?: string } =>
    typeof search.reorder === "string" && search.reorder.length <= 4000
      ? { reorder: search.reorder }
      : {},
  component: SupplierOrderRoute,
});

function SupplierOrderRoute() {
  const { id } = Route.useParams();
  const { reorder } = Route.useSearch();
  // A new order and an open one are separate pages: the editor starts afresh for each.
  return <SupplierOrderPage key={id} orderId={id} reorder={reorder} />;
}
