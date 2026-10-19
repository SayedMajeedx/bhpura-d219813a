import { createFileRoute } from "@tanstack/react-router";
import { SupplierOrdersPage } from "@/features/supplier-orders/components/SupplierOrdersPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/supplier-orders/")({
  component: () => <SupplierOrdersPage />,
});
