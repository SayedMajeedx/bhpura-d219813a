import { createFileRoute } from "@tanstack/react-router";
import { CustomerBalancesPage } from "@/features/finance-reports/components/CustomerBalancesPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/balances")({
  component: BalancesRoute,
});

function BalancesRoute() {
  const { slug } = Route.useParams();
  return <CustomerBalancesPage slug={slug} />;
}
