import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/SettingsPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  return <SettingsPage />;
}
