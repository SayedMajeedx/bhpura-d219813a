import { createFileRoute } from "@tanstack/react-router";
import { ExportCenterPage } from "@/features/import-export/components/ExportCenterPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/export")({
  component: ExportCenterPage,
});
