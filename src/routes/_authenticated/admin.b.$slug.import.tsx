import { createFileRoute } from "@tanstack/react-router";
import { ImportCenterPage } from "@/features/import-export/components/ImportCenterPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/import")({
  component: ImportCenterPage,
});
