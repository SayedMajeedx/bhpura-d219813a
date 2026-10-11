import { createFileRoute, redirect } from "@tanstack/react-router";
import { ensureSessionUser } from "@/lib/auth/ensure-session-user";
import { fetchCallerProfile, permissionsOf } from "@/lib/data/profiles";
import { IncubatorsPage } from "@/features/incubators/components/IncubatorsPage";

/**
 * Incubators and consignment, for staff who manage inventory. The page itself is in
 * `src/features/incubators/`; this route only guards it and mounts it.
 */
export const Route = createFileRoute("/_authenticated/admin/b/$slug/incubators")({
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const user = await ensureSessionUser(queryClient);

    if (!user) throw redirect({ to: "/auth" });

    const profile = await fetchCallerProfile(user.id);
    const permissions = permissionsOf(profile);
    const allowed =
      profile?.status !== "inactive" &&
      (["admin", "super_admin", "brand_admin"].includes(profile?.role ?? "") ||
        permissions.includes("manage_inventory"));
    if (!allowed) throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
  },
  component: IncubatorsPage,
});
