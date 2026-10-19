import { createFileRoute } from "@tanstack/react-router";
import { OutreachPage } from "@/features/outreach/components/OutreachPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/outreach")({
  component: () => <OutreachPage />,
});
