import { redirect } from "@tanstack/react-router";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import { fetchCallerProfile } from "@/lib/data/profiles";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * A super admin page's guard (`beforeLoad`): a person signed out goes to sign in, anyone else to
 * their own admin. The database's row security decides what comes back either way.
 */
export async function requireSuperAdminRoute(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw redirect({ to: "/auth" });
  const profile = await fetchCallerProfile(user.id);
  const email = (user.email || "").toLowerCase();
  if (email !== SUPER_ADMIN_EMAIL && profile?.role !== "super_admin") {
    throw redirect({ to: "/admin" });
  }
}
