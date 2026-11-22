import type { DeletedStoreRecord } from "@/lib/data/super-admin/home";
import { isDeletedStore, type HomeStore } from "./stores";

/**
 * The stores that were deleted, one line each: what the record kept (migration 20261220100000)
 * and the stores marked deleted that are still in the database, deleted before any record was
 * kept. A store marked deleted and later removed for good reads as removed. Newest first.
 */

export type DeletedStore = {
  id: string;
  /** The address it had, without the `-deleted-` mark. */
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  /** "soft": still in the database, hidden; "hard": removed with all its data. */
  mode: "soft" | "hard";
  deletedAt: string | null;
  deletedBy: string | null;
};

/** "pura-deleted-1763800000" → "pura". */
export const originalSlug = (slug: string) => slug.replace(/-deleted-\d+$/, "");

/** The moment the `-deleted-` mark names (seconds since 1970), when it has one. */
export function deletedAtFromSlug(slug: string): string | null {
  const match = /-deleted-(\d+)$/.exec(slug);
  return match ? new Date(Number(match[1]) * 1000).toISOString() : null;
}

export function deletedStores(
  stores: readonly HomeStore[],
  records: readonly DeletedStoreRecord[],
): DeletedStore[] {
  const byId = new Map<string, DeletedStore>();
  // Oldest first, so a later record (the hard delete after a soft one) wins.
  for (const record of [...records].sort((a, b) => a.deletedAt.localeCompare(b.deletedAt))) {
    byId.set(record.brandId, {
      id: record.brandId,
      slug: originalSlug(record.slug),
      nameEn: record.nameEn,
      nameAr: record.nameAr,
      mode: record.mode,
      deletedAt: record.deletedAt,
      deletedBy: record.deletedBy,
    });
  }
  for (const store of stores) {
    if (!isDeletedStore(store) || byId.has(store.id)) continue;
    byId.set(store.id, {
      id: store.id,
      slug: originalSlug(store.slug),
      nameEn: store.name_en,
      nameAr: store.name_ar,
      mode: "soft",
      deletedAt: deletedAtFromSlug(store.slug),
      deletedBy: null,
    });
  }
  return [...byId.values()].sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
}
