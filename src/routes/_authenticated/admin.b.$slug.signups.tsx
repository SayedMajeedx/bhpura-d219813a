import { createFileRoute } from "@tanstack/react-router";
import { SignupsPage } from "@/features/leads/components/SignupsPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/signups")({
  component: SignupsPage,
});
