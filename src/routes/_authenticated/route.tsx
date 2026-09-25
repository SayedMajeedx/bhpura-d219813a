import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ensureSessionUser } from "@/lib/auth/ensure-session-user";
import { AppShell } from "@/components/app-shell";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { readStorefrontOAuthReturn } from "@/lib/storefront-oauth-return";
import { profilesQueries } from "@/lib/data/profiles";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context: { queryClient } }) => {
    const storefrontReturn = readStorefrontOAuthReturn();
    if (storefrontReturn) throw redirect({ to: storefrontReturn as any });

    // treats it as a query error and retries with backoff, so the router never
    const user = await ensureSessionUser(queryClient);

    if (!user) throw redirect({ to: "/auth" });

    const profile = await queryClient.ensureQueryData(profilesQueries.caller(user.id));

    const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
    if (!profile || profile.status !== "active" || !dashboardRoles.has(profile.role ?? "")) {
      throw redirect({ to: "/auth" });
    }

    const requiresPasswordChange =
      Boolean(profile?.must_change_password) || Boolean(user?.user_metadata?.must_change_password);

    if (requiresPasswordChange) {
      throw redirect({ to: "/first-login" });
    }

    return { user };
  },
  pendingComponent: RoutePendingSkeleton,
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
