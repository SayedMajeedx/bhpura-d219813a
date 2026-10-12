import { createFileRoute } from "@tanstack/react-router";
import { ExpensesPage } from "@/features/expenses/components/ExpensesPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/expenses")({
  component: ExpensesPage,
});
