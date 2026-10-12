/**
 * The team page's rules about the list of staff: who a view shows, how many each view holds, and
 * what the page warns about the store's admins.
 */

export type TeamScope = "all" | "active" | "inactive";

type Member = { status?: string | null; role?: string | null; phone?: string | null };

/** The staff a view shows. */
export function staffInScope<T extends Member>(staff: readonly T[], scope: TeamScope): T[] {
  return staff.filter((m) => {
    if (scope === "active") return m.status === "active";
    if (scope === "inactive") return m.status === "inactive";
    return true;
  });
}

/** How many members each view holds. */
export function scopeCountsOf(staff: readonly Member[]): Record<TeamScope, number> {
  return {
    all: staff.length,
    active: staff.filter((m) => m.status === "active").length,
    inactive: staff.filter((m) => m.status === "inactive").length,
  };
}

/** The members who run the store: an admin, a store owner, or the platform's owner. */
export function adminMembersOf<T extends Member>(staff: readonly T[]): T[] {
  return staff.filter(
    (m) => m.role === "admin" || m.role === "super_admin" || m.role === "brand_admin",
  );
}

/**
 * What the page warns about: a store with one admin (nobody else can get in if that account is
 * lost), and admins none of whom has a phone on file. Nothing is said while the list loads.
 */
export function adminWarnings(staff: readonly Member[], loading: boolean) {
  const admins = adminMembersOf(staff);
  return {
    isSingleAdmin: !loading && admins.length <= 1,
    adminHasNoPhone: admins.length > 0 && admins.every((m) => !m.phone),
  };
}
