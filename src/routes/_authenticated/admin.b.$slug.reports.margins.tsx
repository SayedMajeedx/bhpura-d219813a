import { createFileRoute } from "@tanstack/react-router";
import { MarginsPage } from "@/features/finance-reports/components/MarginsPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/margins")({
  component: MarginsRoute,
});

function MarginsRoute() {
  const { slug } = Route.useParams();
  return <MarginsPage slug={slug} />;
}
