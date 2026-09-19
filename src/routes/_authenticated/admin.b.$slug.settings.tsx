import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SettingsPage } from "@/features/settings/SettingsPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/settings")({
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const user = await queryClient.ensureQueryData({
      queryKey: ["auth_user"],
      queryFn: async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw redirect({ to: "/auth" });
        return data.user;
      },
      staleTime: 1000 * 60 * 5,
    });

    const profile = await queryClient.ensureQueryData({
      queryKey: ["caller_permissions", user.id],
      queryFn: async () => {
        const { data } = await (supabase as any)
          .from("profiles")
          .select("role, status, email, permissions")
          .eq("id", user.id)
          .maybeSingle();
        return data ?? null;
      },
      staleTime: 1000 * 60 * 5,
    });

    const email = (user.email || "").toLowerCase();
    const isFixedSuperAdmin = email === "majeed@hotmail.it";
    const role = profile?.role;
    const status = profile?.status ?? "active";
    const permissions = (profile?.permissions as string[]) || [];
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
