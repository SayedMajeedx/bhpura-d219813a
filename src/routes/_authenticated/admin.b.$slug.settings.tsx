import { createFileRoute, redirect } from "@tanstack/react-router";
import { ensureSessionUser } from "@/lib/auth/ensure-session-user";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { permissionsOf, profilesQueries } from "@/lib/data/profiles";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/settings")({
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const user = await ensureSessionUser(queryClient);

    if (!user) throw redirect({ to: "/auth" });

    const profile = await queryClient.ensureQueryData(profilesQueries.caller(user.id));

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it";
    const role = profile?.role;
    const status = profile?.status ?? "active";
    const permissions = permissionsOf(profile);
    const hasSettings = permissions.includes("manage_settings");
    const allowed =
      isFixedSuperAdmin ||
      ((role === "admin" ||
        role === "super_admin" ||
        role === "brand_admin" ||
        (role === "staff" && hasSettings)) &&
        status === "active");

    if (!allowed) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
    }
  },
  component: SettingsRoute,
});

function SettingsRoute() {
  return <SettingsPage />;
}
