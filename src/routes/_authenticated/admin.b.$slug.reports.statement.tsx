import { createFileRoute } from "@tanstack/react-router";
import { MonthlyStatementPage } from "@/features/finance-reports/components/MonthlyStatementPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/statement")({
  component: StatementRoute,
});

function StatementRoute() {
  const { slug } = Route.useParams();
  return <MonthlyStatementPage slug={slug} />;
}
