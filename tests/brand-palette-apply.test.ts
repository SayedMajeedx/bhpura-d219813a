import { describe, it, expect } from "vitest";
import {
  PALETTE_SETTINGS_COLUMNS,
  darken,
  paletteToSettingsPatch,
  readableOn,
} from "../src/lib/brand-palette-apply";
import { derivePalette, getContrastRatio } from "../src/lib/logo-palette";
import { SETTINGS_REGISTRY } from "../src/features/settings/registry";

describe("paletteToSettingsPatch", () => {
  const palette = derivePalette("#800020", "#1c1917", "dominant");

  it("writes only whitelisted business_settings columns", () => {
    const patch = paletteToSettingsPatch(palette, "logo");
    const allowed = new Set<string>(PALETTE_SETTINGS_COLUMNS);
    for (const key of Object.keys(patch)) {
      expect(allowed.has(key), `${key} is not a palette column`).toBe(true);
    }
  });

  it("every palette column exists in the settings registry", () => {
    const registryKeys = new Set(SETTINGS_REGISTRY.map((f) => f.key));
    for (const col of PALETTE_SETTINGS_COLUMNS) {
      expect(registryKeys.has(col), `${col} missing from registry`).toBe(true);
    }
  });

  it("guarantees readable text on every generated surface (WCAG AA 4.5:1)", () => {
    const p = paletteToSettingsPatch(palette, "logo") as Record<string, string>;
    const pairs: Array<[string, string]> = [
      ["btn_primary_bg", "btn_primary_fg"],
      ["btn_secondary_bg", "btn_secondary_fg"],
      ["btn_checkout_bg", "btn_checkout_fg"],
      ["cart_drawer_checkout_bg", "cart_drawer_checkout_fg"],
      ["header_bg", "header_fg"],
      ["footer_bg", "footer_fg"],
      ["menu_bg", "menu_fg"],
      ["storefront_background_color", "heading_color"],
      ["storefront_background_color", "storefront_text_color"],
    ];
    for (const [bg, fg] of pairs) {
      expect(getContrastRatio(p[fg], p[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("records the palette source and mood in brand_palette metadata", () => {
    const logo = paletteToSettingsPatch(palette, "logo").brand_palette as any;
    expect(logo.source).toBe("logo");
    expect(logo.meta.source).toBe("logo");
    expect(logo.mood).toBe("dominant");
    const manual = paletteToSettingsPatch(palette, "manual").brand_palette as any;
    expect(manual.source).toBe("manual");
    expect(manual.meta.chosen).toBe("manual");
  });

  it("is deterministic apart from the timestamp", () => {
    const a = paletteToSettingsPatch(palette, "logo") as any;
    const b = paletteToSettingsPatch(palette, "logo") as any;
    delete a.brand_palette.extracted_at;
    delete b.brand_palette.extracted_at;
    expect(a).toEqual(b);
  });
});

describe("colour helpers", () => {
  it("readableOn picks white on dark and dark on light", () => {
    expect(readableOn("#111111")).toBe("#ffffff");
    expect(readableOn("#ffffff")).toBe("#111111");
  });

  it("darken lowers lightness and keeps a valid hex", () => {
    const out = darken("#800020", 0.2);
    expect(out).toMatch(/^#[0-9a-f]{6}$/i);
    expect(getContrastRatio("#ffffff", out)).toBeGreaterThan(
      getContrastRatio("#ffffff", "#800020"),
    );
  });
});
