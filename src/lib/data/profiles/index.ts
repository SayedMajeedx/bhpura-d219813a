import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

/**
 * Team members' profiles: the signed-in user's own profile that every route
 * guard checks (role, status, permissions), a brand's active couriers, and
 * the names shown next to stock movements.
 *
 * Before, the route guards cached the caller's profile under four keys with
 * different column lists; `["auth_profile_role", id]` in particular was filled
 * by the `_authenticated` layout without `email` and then read by the Team
 * route, whose fixed super-admin email check could never match. One fetcher
 * now reads the union of those columns.
 */

export const profilesKeys = {
  /** Every cached caller profile (prefix; invalidate after a profile change). */
  callers: () => ["profiles", "caller"] as const,
  caller: (userId: string) => [...profilesKeys.callers(), userId] as const,
  couriers: (brandId: string) => ["couriers", brandId] as const,
};

/**
 * The signed-in user's profile with every column a route guard reads. A failed
 * read counts as "no profile", as every guard always treated it.
 */
export async function fetchCallerProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id, role, status, email, brand_id, permissions, must_change_password")
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}
export type CallerProfile = NonNullable<Awaited<ReturnType<typeof fetchCallerProfile>>>;

/** A profile's permissions as the list the guards check. */
export function permissionsOf(profile: { permissions?: unknown } | null | undefined): string[] {
  const permissions = profile?.permissions;
  return Array.isArray(permissions)
    ? permissions.filter((p): p is string => typeof p === "string")
    : [];
}

/** The brand's active couriers by name, for assignment menus. */
export async function fetchCouriers(brandId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, phone")
    .eq("brand_id", brandId)
    .eq("role", "courier")
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** Names and emails of some users (who made a stock movement); a failure reads as none. */
export async function fetchProfileNames(userIds: string[]) {
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
  return data ?? [];
}

export const profilesQueries = {
  /** Cached for 5 minutes, as the route guards always did. */
  caller: (userId: string) =>
    queryOptions({
      queryKey: profilesKeys.caller(userId),
      queryFn: () => fetchCallerProfile(userId),
      staleTime: 1000 * 60 * 5,
    }),
  couriers: (brandId: string) =>
    queryOptions({
      queryKey: profilesKeys.couriers(brandId),
      queryFn: () => fetchCouriers(brandId),
      enabled: Boolean(brandId),
    }),
};

/** Changes a profile: the user's own, or a team member's (RLS decides which rows). */
export async function updateProfile(userId: string, patch: TablesUpdate<"profiles">) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}
