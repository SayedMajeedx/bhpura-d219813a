import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_REGISTRY } from "../src/features/settings/registry";
import {
  isSettingApplicable,
  isStorefrontV2,
  resolveFooterVariant,
  resolveStorefrontEngine,
  type SettingsScope,
} from "../src/lib/storefront-engine";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

// The storefront shell is split across its route and src/features/storefront-shell (Phase 5).
const shellSource = () =>
  [
    "src/routes/$slug.route.tsx",
    ...["components", "lib"].flatMap((dir) =>
      readdirSync(`src/features/storefront-shell/${dir}`)
        .sort()
        .map((file) => `src/features/storefront-shell/${dir}/${file}`),
    ),
  ]
    .map((file) => read(file))
    .join("\n");

describe("storefront engine resolver", () => {
  it("treats only version 2 as Storefront 2.0", () => {
    expect(resolveStorefrontEngine({ storefront_design_version: 2 })).toBe(2);
    for (const v of [1, 0, null, undefined, 3]) {
      expect(resolveStorefrontEngine({ storefront_design_version: v as number })).toBe(
        v === 3 ? 1 : 1,
      );
    }
    expect(isStorefrontV2(null)).toBe(false);
  });

  it("mirrors the storefront footer branch exactly", () => {
    // Defaults follow the engine.
    expect(resolveFooterVariant({ storefront_design_version: 1 })).toBe("simple");
    expect(resolveFooterVariant({ storefront_design_version: 2 })).toBe("columns");
    // An explicit choice wins over the engine in both directions.
    expect(resolveFooterVariant({ storefront_design_version: 2, footer_layout: "simple" })).toBe(
      "simple",
    );
    expect(resolveFooterVariant({ storefront_design_version: 1, footer_layout: "columns" })).toBe(
      "columns",
    );
  });

  it("is the single source of truth for the storefront footer branch", () => {
    // The route used to hand-roll this condition, which is how the "minimal"
    // value drifted out of sync. It must go through the resolver now.
    const route = shellSource();
    expect(route).toContain('resolveFooterVariant(settings) === "columns"');
    expect(route).not.toContain('settings?.footer_layout !== "simple"');
  });
});

describe("setting applicability", () => {
  const v1 = { storefront_design_version: 1 };
  const v2 = { storefront_design_version: 2 };

  it("hides each scope from the engine that cannot read it", () => {
    const cases: Array<[SettingsScope, boolean, boolean]> = [
      // scope, visible on v1, visible on v2
      ["v1_only", true, false],
      ["v2_only", false, true],
      ["simple_footer", true, false],
      ["columns_footer", false, true],
    ];
    for (const [scope, onV1, onV2] of cases) {
      expect(isSettingApplicable(scope, v1), `${scope} on v1`).toBe(onV1);
      expect(isSettingApplicable(scope, v2), `${scope} on v2`).toBe(onV2);
    }
  });

  it("keeps unscoped settings visible everywhere", () => {
    expect(isSettingApplicable(undefined, v1)).toBe(true);
    expect(isSettingApplicable(undefined, v2)).toBe(true);
  });

  it("follows an explicit footer override rather than the engine", () => {
    const v2Simple = { storefront_design_version: 2, footer_layout: "simple" };
    expect(isSettingApplicable("simple_footer", v2Simple)).toBe(true);
    expect(isSettingApplicable("columns_footer", v2Simple)).toBe(false);
  });
});

describe("registry scoping", () => {
  const byKey = new Map(SETTINGS_REGISTRY.map((e) => [e.key, e]));

  it("scopes the classic hero controls that HeroV2 ignores", () => {
    for (const key of [
      "hero_title_size",
      "hero_title_align",
      "hero_title_color",
      "show_hero_title",
      "show_hero_about",
    ]) {
      expect(byKey.get(key)?.scope, key).toBe("v1_only");
    }
  });

  it("scopes the classic footer controls FooterV2 ignores to the simple footer", () => {
    for (const key of ["footer_bg", "footer_fg", "show_footer_name"]) {
      expect(byKey.get(key)?.scope, key).toBe("simple_footer");
    }
  });

  it("scopes every Storefront 2.0 control to v2", () => {
    for (const key of [
      "brand_story_enabled",
      "brand_story_image_url",
      "social_proof_enabled",
      "recently_viewed_enabled",
      "motion_enabled",
      "product_card_hover_image",
      "product_card_color_dots",
      "product_card_quick_add",
      "quick_view_enabled",
      "new_badge_days",
      "pdp_image_zoom",
      "category_filters_enabled",
      "back_in_stock_enabled",
      "fabric_care_ar",
      "fabric_care_en",
      "hero_overlay_strength",
      "hero_title_color_v2",
    ]) {
      expect(byKey.get(key)?.scope, key).toBe("v2_only");
    }
  });

  it("scopes the columns-footer-only controls", () => {
    for (const key of [
      "newsletter_enabled",
      "newsletter_title_ar",
      "newsletter_title_en",
      "footer_show_payment_methods",
    ]) {
      expect(byKey.get(key)?.scope, key).toBe("columns_footer");
    }
  });

  it("leaves shared controls unscoped", () => {
    for (const key of ["trust_bar_enabled", "trust_bar_position", "footer_layout", "logo_size"]) {
      expect(byKey.get(key)?.scope, key).toBeUndefined();
    }
  });

  it("only uses scopes the resolver understands", () => {
    const valid = new Set(["v1_only", "v2_only", "simple_footer", "columns_footer"]);
    for (const entry of SETTINGS_REGISTRY) {
      if (entry.scope) expect(valid.has(entry.scope), `${entry.key}: ${entry.scope}`).toBe(true);
    }
  });

  it("retires the pdp_layout control that had no consumer", () => {
    // The column still exists (the registry is a complete inventory of
    // business_settings), but it is system-owned now: no control, no search hit.
    expect(byKey.get("pdp_layout")?.owner).toBe("system");
    expect(byKey.get("pdp_layout")?.tab).toBeNull();
    expect(read("src/features/settings/tabs/storefront/DesignV2Group.tsx")).not.toContain(
      "pdp_layout",
    );
  });
});

describe("settings UI honours the scopes", () => {
  it("hides the Storefront 2.0 group on a classic storefront", () => {
    const tab = read("src/features/settings/tabs/storefront/StorefrontTab.tsx");
    expect(tab).toContain("isStorefrontV2");
    expect(tab).toContain('g.id === "design_v2" ? isV2 : true');
  });

  it("hides the classic hero typography block under Storefront 2.0", () => {
    const hero = read("src/features/settings/tabs/storefront/HomeHeroGroup.tsx");
    expect(hero).toContain("isStorefrontV2");
    expect(hero).toContain("{!isV2 && (");
  });

  it("gates the classic footer controls on the resolved footer, not the engine", () => {
    const headerFooter = read("src/features/settings/tabs/storefront/HeaderFooterGroup.tsx");
    expect(headerFooter).toContain("resolveFooterVariant");
    expect(headerFooter).toContain('footerVariant === "simple"');

    const palette = read("src/features/settings/tabs/identity/PaletteGroup.tsx");
    expect(palette).toContain("resolveFooterVariant");
    expect(palette).toContain("showFooterColours");
  });

  it("keeps inapplicable settings out of search results", () => {
    const header = read("src/features/settings/SettingsHeader.tsx");
    expect(header).toContain("isSettingApplicable");
    expect(header).toContain("isSettingApplicable(entry.scope, form.bs)");
  });
});

describe("Storefront 2.0 hero controls are consumed", () => {
  it("drives the hero scrim from hero_overlay_strength", () => {
    const hero = read("src/components/storefront/HeroV2.tsx");
    expect(hero).toContain("hero_overlay_strength");
    expect(hero).toContain("linear-gradient(to top, rgba(0,0,0,${scrimBottom})");
    // The hardcoded scrim must be gone.
    expect(hero).not.toContain("from-black/85 via-black/40");
  });

  it("applies hero_title_color_v2 when set and falls back otherwise", () => {
    const hero = read("src/components/storefront/HeroV2.tsx");
    expect(hero).toContain("hero_title_color_v2");
    expect(hero).toContain("heroTitleColor ? { color: heroTitleColor } : {}");
  });

  it("propagates both fields through the storefront loader", () => {
    const route = shellSource();
    expect(route).toContain("hero_overlay_strength: s?.hero_overlay_strength ?? 45");
    expect(route).toContain("hero_title_color_v2: s?.hero_title_color_v2 ?? null");
  });
});

describe("Storefront 2.0 respects catalog (inquiry-only) mode", () => {
  it("suppresses grid quick-add when there is no cart", () => {
    const popover = read("src/components/storefront/QuickAddPopover.tsx");
    expect(popover).toContain("isCatalogMode");
    expect(popover).toContain("if (isCatalogMode(settings)) return null;");
  });

  it("suppresses quick view, which is an add-to-cart surface", () => {
    const card = read("src/components/storefront/ProductCardV2.tsx");
    expect(card).toContain("isCatalogMode");
    expect(card).toContain("settings?.quick_view_enabled !== false && !isCatalogMode(settings)");
    // Both the trigger and the modal go through the same gate.
    expect(card.match(/\{showQuickView && \(/g) ?? []).toHaveLength(2);
  });
});
