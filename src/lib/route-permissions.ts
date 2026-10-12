import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";

const ADMIN_ROLES = new Set(["admin", "brand_admin", "super_admin"]);

export async function requireBrandPermission(slug: string, permission: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw redirect({ to: "/auth" });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("role, status, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const email = (user.email || "").toLowerCase();
  const isSuperAdmin = email === SUPER_ADMIN_EMAIL || profile?.role === "super_admin";
  const isAdmin = ADMIN_ROLES.has(profile?.role);
  const isAssignedOrderCourier = profile?.role === "courier" && permission === "manage_orders";
  const permissions = Array.isArray(profile?.permissions) ? profile.permissions : [];
  const isActive = profile?.status === "active";

  if (
    !isActive ||
    (!isSuperAdmin && !isAdmin && !isAssignedOrderCourier && !permissions.includes(permission))
  ) {
    throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug } });
  }
}
