import { createFileRoute } from "@tanstack/react-router";
import { AdvanceReportView } from "@/features/advance-report/components/AdvanceReportView";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/advance")({
  component: AdvanceReportView,
});
