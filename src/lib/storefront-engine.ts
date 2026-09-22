/**
 * Which storefront rendering engine a brand is on, and which surfaces that
 * engine actually reads.
 *
 * Storefront 1.0 and 2.0 render different components, so a large part of the
 * settings surface only applies to one of them: the classic hero title controls
 * are read exclusively by the V1 carousel, and the Storefront 2.0 panel is read
 * exclusively by the V2 components. Showing both to everyone means merchants
 * change values that can never take effect.
 *
 * The footer is deliberately *not* version-scoped: a V2 brand that picks the
 * simple footer layout renders the classic footer, so the classic footer
 * controls become live again. `resolveFooterVariant` mirrors the branch in
 * `$slug.route.tsx` so the settings UI and the storefront can never disagree.
 */

export type StorefrontEngine = 1 | 2;
export type FooterVariant = "simple" | "columns";

type EngineSettings = {
  storefront_design_version?: number | null;
  footer_layout?: string | null;
} | null;

export function resolveStorefrontEngine(settings: EngineSettings): StorefrontEngine {
  return Number(settings?.storefront_design_version ?? 1) === 2 ? 2 : 1;
}

export function isStorefrontV2(settings: EngineSettings): boolean {
  return resolveStorefrontEngine(settings) === 2;
}

/**
 * The footer actually rendered for this brand. An explicit "simple" choice wins
 * over the engine default, which is how a Storefront 2.0 brand can keep the
 * classic footer.
 */
export function resolveFooterVariant(settings: EngineSettings): FooterVariant {
  const layout = settings?.footer_layout;
  if (layout === "simple") return "simple";
  if (layout === "columns") return "columns";
  return isStorefrontV2(settings) ? "columns" : "simple";
}

/**
 * Where a setting takes effect. Absent means "every brand".
 * - `v1_only` / `v2_only`: read only by that rendering engine.
 * - `simple_footer` / `columns_footer`: read only by that footer, which depends
 *   on `footer_layout` as well as the engine.
 */
export type SettingsScope = "v1_only" | "v2_only" | "simple_footer" | "columns_footer";

export function isSettingApplicable(
  scope: SettingsScope | undefined,
  settings: EngineSettings,
): boolean {
  if (!scope) return true;
  switch (scope) {
    case "v1_only":
      return !isStorefrontV2(settings);
    case "v2_only":
      return isStorefrontV2(settings);
    case "simple_footer":
      return resolveFooterVariant(settings) === "simple";
    case "columns_footer":
      return resolveFooterVariant(settings) === "columns";
    default:
      return true;
  }
}
