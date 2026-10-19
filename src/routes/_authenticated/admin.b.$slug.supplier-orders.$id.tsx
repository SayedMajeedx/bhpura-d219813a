import { createFileRoute } from "@tanstack/react-router";
import { SupplierOrderPage } from "@/features/supplier-orders/components/SupplierOrderPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/supplier-orders/$id")({
  component: SupplierOrderRoute,
});

function SupplierOrderRoute() {
  const { id } = Route.useParams();
  // A new order and an open one are separate pages: the editor starts afresh for each.
  return <SupplierOrderPage key={id} orderId={id} />;
}
