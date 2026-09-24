import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ensureSessionUser } from "@/lib/auth/ensure-session-user";
import { AppShell } from "@/components/app-shell";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { readStorefrontOAuthReturn } from "@/lib/storefront-oauth-return";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context: { queryClient } }) => {
    const storefrontReturn = readStorefrontOAuthReturn();
    if (storefrontReturn) throw redirect({ to: storefrontReturn as any });

    // treats it as a query error and retries with backoff, so the router never
    const user = await ensureSessionUser(queryClient);

    if (!user) throw redirect({ to: "/auth" });

    const profile = await queryClient.ensureQueryData({
      queryKey: ["auth_profile_role", user.id],
      queryFn: async () => {
        const { data } = await supabase
          .from("profiles")
          .select("status, role, must_change_password")
          .eq("id", user.id)
          .maybeSingle();
        return data ?? null;
      },
      staleTime: 1000 * 60 * 5, // 5 min cache
    });

    const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
    if (!profile || profile.status !== "active" || !dashboardRoles.has(profile.role ?? "")) {
      throw redirect({ to: "/auth" });
    }

    const requiresPasswordChange =
      Boolean((profile as any)?.must_change_password) ||
      Boolean(user?.user_metadata?.must_change_password);

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
