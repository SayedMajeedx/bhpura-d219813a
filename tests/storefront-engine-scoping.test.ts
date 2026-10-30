import { describe, expect, it } from "vitest";
import { SETTINGS_REGISTRY } from "../src/features/settings/registry";
import { isSettingApplicable, resolveFooterVariant } from "../src/lib/storefront-engine";

// Every store has the one storefront (the classic engine was retired on 2026-10-30). What is still
// a choice is the footer: the store's own layout, else the columns footer.

describe("the footer a store draws", () => {
  it("is the store's choice, else the columns footer", () => {
    expect(resolveFooterVariant(null)).toBe("columns");
    expect(resolveFooterVariant({})).toBe("columns");
    expect(resolveFooterVariant({ footer_layout: "columns" })).toBe("columns");
    expect(resolveFooterVariant({ footer_layout: "simple" })).toBe("simple");
    // The settings dropdown once stored the simple footer as "minimal".
    expect(resolveFooterVariant({ footer_layout: "minimal" })).toBe("simple");
  });
});

describe("setting applicability", () => {
  it("shows a footer's settings only to the footer that reads them", () => {
    const simple = { footer_layout: "simple" };
    expect(isSettingApplicable("simple_footer", simple)).toBe(true);
    expect(isSettingApplicable("columns_footer", simple)).toBe(false);
    expect(isSettingApplicable("simple_footer", {})).toBe(false);
    expect(isSettingApplicable("columns_footer", {})).toBe(true);
  });

  it("keeps unscoped settings visible everywhere", () => {
    expect(isSettingApplicable(undefined, {})).toBe(true);
    expect(isSettingApplicable(undefined, { footer_layout: "simple" })).toBe(true);
  });
});

describe("registry scoping", () => {
  const byKey = new Map(SETTINGS_REGISTRY.map((e) => [e.key, e]));

  it("retires the classic hero's controls with the classic storefront, which alone read them", () => {
    for (const key of [
      "hero_title_size",
      "hero_title_align",
      "hero_title_color",
      "show_hero_title",
      "show_hero_about",
      "storefront_design_version",
    ]) {
      expect(byKey.get(key)?.owner, key).toBe("system");
      expect(byKey.get(key)?.tab, key).toBeNull();
    }
    // The store-wide title still names the hero of a store with no slides.
    expect(byKey.get("hero_title_ar")?.owner).toBe("settings");
  });

  it("scopes the classic footer controls FooterV2 ignores to the simple footer", () => {
    expect(byKey.get("show_footer_name")?.scope).toBe("simple_footer");
  });

  it("leaves the footer colours open to both footers, which both read them", () => {
    for (const key of ["footer_bg", "footer_fg"]) {
      expect(byKey.get(key)?.scope, key).toBeUndefined();
    }
  });

  it("shows every storefront control to every store", () => {
    for (const key of ["brand_story_enabled", "product_card_quick_add", "hero_overlay_strength"]) {
      expect(byKey.get(key)?.scope, key).toBeUndefined();
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
    const valid = new Set(["simple_footer", "columns_footer"]);
    for (const entry of SETTINGS_REGISTRY) {
      if (entry.scope) expect(valid.has(entry.scope), `${entry.key}: ${entry.scope}`).toBe(true);
    }
  });

  it("retires the pdp_layout control that had no consumer", () => {
    // The column still exists (the registry is a complete inventory of
    // business_settings), but it is system-owned now: no control, no search hit.
    expect(byKey.get("pdp_layout")?.owner).toBe("system");
    expect(byKey.get("pdp_layout")?.tab).toBeNull();
  });
});
