import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ensureSessionUser } from "@/lib/auth/ensure-session-user";
import { AppShell } from "@/components/app-shell";
import { TwoFactorGate } from "@/components/auth/TwoFactorGate";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { readStorefrontOAuthReturn } from "@/lib/storefront-oauth-return";
import { profilesQueries } from "@/lib/data/profiles";
import { prefetchAdminShell } from "@/lib/auth/admin-prefetch";
import { adminAppHead } from "@/lib/admin-app-head";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  head: adminAppHead,
  beforeLoad: async ({ context: { queryClient }, location }) => {
    const storefrontReturn = readStorefrontOAuthReturn();
    if (storefrontReturn) throw redirect({ to: storefrontReturn as any });

    // The profile, and a store's own reads, start now, beside the sign-in check below.
    await prefetchAdminShell(queryClient, location.pathname);

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
  // A member with two-factor on gives the code before the admin opens (migration 20261027150000).
  component: () => (
    <TwoFactorGate>
      <AppShell>
        <Outlet />
      </AppShell>
    </TwoFactorGate>
  ),
});
