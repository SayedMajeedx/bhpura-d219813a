/**
 * Which footer a store's pages draw, and which settings only that footer reads.
 *
 * Every store has the one storefront (the classic engine was retired on 2026-10-30,
 * docs/storefront-v1-to-v2-plan.md). The footer is still a choice: a store that picks the simple
 * layout draws the classic footer, so the simple footer's controls are live for it and the
 * columns footer's are not. `resolveFooterVariant` mirrors the storefront's own branch so the
 * settings and the store can never disagree.
 */

export type FooterVariant = "simple" | "columns";

type FooterSettings = {
  footer_layout?: string | null;
} | null;

/**
 * Values the simple footer has been stored as. The settings dropdown wrote
 * "minimal" while the storefront only ever checked for "simple", so brands that
 * chose the simple footer silently kept the columns one. Both spellings are
 * accepted so those brands heal without a data migration.
 */
const SIMPLE_FOOTER_VALUES = new Set(["simple", "minimal"]);

/** The footer a store draws: its own choice, else the columns footer. */
export function resolveFooterVariant(settings: FooterSettings): FooterVariant {
  const layout = settings?.footer_layout;
  if (layout && SIMPLE_FOOTER_VALUES.has(layout)) return "simple";
  return "columns";
}

/**
 * Where a setting takes effect. Absent means "every store".
 * - `simple_footer` / `columns_footer`: read only by that footer.
 */
export type SettingsScope = "simple_footer" | "columns_footer";

export function isSettingApplicable(
  scope: SettingsScope | undefined,
  settings: FooterSettings,
): boolean {
  if (!scope) return true;
  return resolveFooterVariant(settings) === (scope === "simple_footer" ? "simple" : "columns");
}
