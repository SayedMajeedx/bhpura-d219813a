import { createFileRoute } from "@tanstack/react-router";
import { CampaignsPage } from "@/features/campaigns/components/CampaignsPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/campaigns")({
  validateSearch: (search: Record<string, unknown>) => ({
    segment: (typeof search.segment === "string" ? search.segment : "All") as
      "All" | "VIP" | "Churn Risk" | "New Buyer",
  }),
  component: CampaignsRoute,
});

function CampaignsRoute() {
  const { segment } = Route.useSearch();
  return <CampaignsPage segment={segment} />;
}
