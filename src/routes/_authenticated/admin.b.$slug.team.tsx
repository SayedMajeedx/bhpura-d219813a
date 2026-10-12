import { createFileRoute } from "@tanstack/react-router";
import { TeamManagement } from "@/features/team/components/TeamManagement";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/team")({
  component: TeamManagement,
});
