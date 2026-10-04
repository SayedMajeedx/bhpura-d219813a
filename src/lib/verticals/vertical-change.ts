import type { AddonId, PlatformAddonPolicy } from "@/lib/addons/addon-types";
import { dependentsOf, getAddon, resolveInstallOrder } from "@/lib/addons/addon-registry";
import { starterPackFor } from "@/lib/addons/starter-packs";
import {
  DEFAULT_VERTICAL_CATEGORIES,
  PURA_BRAND_ID,
  planCategorySync,
  type CategoryRow,
  type DefaultCategorySpec,
} from "@/lib/addons/vertical-categories";
import { resolveStoreModules, type StoreModules, type StoreVertical } from "@/lib/store-profile";
import {
  DEFAULT_VOCABULARY,
  getVerticalVocabularyOverrides,
  resolveVocabulary,
  type StoreVocabulary,
  type VocabularyEntry,
} from "@/lib/store-vocabulary";
import { verticalFits } from "@/lib/verticals/registry";
import {
  planLeftovers,
  type Leftover,
  type LeftoverFacts,
} from "@/lib/verticals/vertical-leftovers";

export type { CategoryRow };

type InstalledAddon = { addon_id: string; status: string };

/**
 * Changing a store's vertical, planned before anything is written: which
 * add-ons it needs, which it may switch off, how its categories follow, and
 * how its modules and wording change. Pure, so the preview a super admin
 * reads and the change the server applies come from the same rules.
 */

export type WordingChange = {
  key: keyof StoreVocabulary;
  before: VocabularyEntry;
  after: VocabularyEntry;
};

/** The store words that read differently under the new vertical. */
export function wordingChanges(from: StoreVertical, to: StoreVertical): WordingChange[] {
  const before = resolveVocabulary(DEFAULT_VOCABULARY, getVerticalVocabularyOverrides(from));
  const after = resolveVocabulary(DEFAULT_VOCABULARY, getVerticalVocabularyOverrides(to));
  return (Object.keys(after) as Array<keyof StoreVocabulary>)
    .filter((key) => before[key].en !== after[key].en || before[key].ar !== after[key].ar)
    .map((key) => ({ key, before: before[key], after: after[key] }));
}

export type VerticalChangePlan = {
  from: StoreVertical;
  to: StoreVertical;
  /** Add-ons to install first, dependencies before the add-ons that need them. */
  install: AddonId[];
  /**
   * Installed add-ons that belong to neither vertical's pack and nothing else
   * needs: the super admin may switch them off (their data is kept).
   */
  disableCandidates: AddonId[];
  /** Null when categories are left alone (not asked, or a protected store). */
  categories: { add: DefaultCategorySpec[]; remove: CategoryRow[] } | null;
  modules: { before: StoreModules; after: StoreModules };
  wording: WordingChange[];
  /** What stays behind and no longer fits the new vertical (never deleted; see vertical-leftovers). */
  leftovers: Leftover[];
};

export function planVerticalChange({
  brandId,
  from,
  to,
  installed,
  categories,
  usedKeys,
  syncCategories,
  policies,
  facts,
}: {
  brandId: string;
  from: StoreVertical;
  to: StoreVertical;
  installed: readonly InstalledAddon[];
  categories: readonly CategoryRow[];
  usedKeys: ReadonlySet<string>;
  syncCategories: boolean;
  policies?: PlatformAddonPolicy[] | null;
  /** Counts read off the store; without them no leftovers are listed. */
  facts?: LeftoverFacts;
}): VerticalChangePlan {
  const pack = starterPackFor(to, policies);
  const installedIds = installed
    .filter((row) => row.status === "installed")
    .map((row) => row.addon_id as AddonId);
  const install = resolveInstallOrder(pack.required).filter((id) => !installedIds.includes(id));
  const keep = new Set<AddonId>([...pack.required, ...install]);
  const knownManifest = (id: AddonId) => {
    try {
      return getAddon(id);
    } catch {
      return null; // an add-on no longer in the registry is left as it is
    }
  };
  const disableCandidates = installedIds.filter((id) => {
    const manifest = knownManifest(id);
    if (!manifest || keep.has(id) || verticalFits(manifest.activities, to)) return false;
    const others = installedIds.filter((other) => other !== id);
    return dependentsOf(id, others).length === 0;
  });
  // Pura's categories are hand-built: a vertical change never touches them.
  const categoryPlan =
    syncCategories && brandId !== PURA_BRAND_ID
      ? planCategorySync({
          existing: categories,
          usedKeys,
          targets: DEFAULT_VERTICAL_CATEGORIES[to] ?? DEFAULT_VERTICAL_CATEGORIES.general,
          replaceEmpty: true,
        })
      : null;
  return {
    from,
    to,
    install,
    disableCandidates,
    categories: categoryPlan,
    modules: {
      before: resolveStoreModules({ store_vertical: from }),
      after: resolveStoreModules({ store_vertical: to }),
    },
    wording: wordingChanges(from, to),
    leftovers: facts ? planLeftovers({ from, to, facts }) : [],
  };
}
