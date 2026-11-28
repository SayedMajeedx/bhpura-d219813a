import { createFileRoute } from "@tanstack/react-router";
import { StockCountsPage } from "@/features/stock-counts/components/StockCountsPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/stock-counts")({
  component: StockCountsPage,
});
