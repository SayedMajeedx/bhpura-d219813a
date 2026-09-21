import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  customFontFaces,
  defaultStorefrontTypography,
  fontCapabilities,
  getGoogleFontsUrl,
  normalizeTypography,
  SELF_HOSTED_FAMILIES,
  selfHostedFontPreloads,
  typographyVariables,
} from "../src/lib/typography";

describe("typography management", () => {
  it("normalizes untrusted settings into safe variable-font ranges", () => {
    const config = normalizeTypography(
      {
        bodyWeight: 2000,
        headingWeight: 50,
        scale: 4,
        axes: { width: 500, slant: -90, opticalSize: 200 },
        body: { en: { family: "  Inter  ", url: "javascript:alert(1)" } },
      },
      defaultStorefrontTypography(),
    );

    expect(config.bodyWeight).toBe(900);
    expect(config.headingWeight).toBe(100);
    expect(config.scale).toBe(1.25);
    expect(config.axes).toEqual({
      width: 125,
      slant: -12,
      opticalSize: 72,
      hexp: 0,
      italic: false,
    });
    expect(config.body.en).toEqual({ family: "Inter", url: null });
  });

  it("emits role-based variables and variable custom font faces", () => {
    const config = defaultStorefrontTypography();
    config.body.en.url = "https://media.boutq.store/font.woff2";
    const variables = typographyVariables(config, "en");
    const faces = customFontFaces(config, "en");

    expect(variables["--type-body"]).toContain("BoutqBodyCustom");
    expect(variables["--type-body-variation"]).toContain("'wdth' 100");
    expect(faces).toContain("font-weight:100 900");
    expect(faces).toContain("font-display:swap");
  });

  it("uses the native axes and ranges of bundled variable fonts", () => {
    const config = defaultStorefrontTypography();
    config.body.en = { family: "Plus Jakarta Sans", url: null };
    config.body.ar = { family: "Readex Pro", url: null };
    config.axes.hexp = 64;
    config.axes.italic = true;

    const english = typographyVariables(config, "en");
    const arabic = typographyVariables(config, "ar");

    expect(fontCapabilities(config.body.en)).toMatchObject({
      weight: { min: 200, max: 800 },
      italic: true,
    });
    expect(fontCapabilities(config.body.ar)).toMatchObject({
      weight: { min: 160, max: 700 },
      hexp: true,
    });
    expect(english["--type-body-style"]).toBe("italic");
    expect(english["--type-body-variation"]).toBe("normal");
    expect(arabic["--type-body-variation"]).toBe("'HEXP' 64");
  });

  it("bundles the variable fonts as woff2 with their OFL licenses locally", () => {
    const fontsCss = readFileSync(resolve(process.cwd(), "src/fonts.css"), "utf8");
    const requiredFiles = [
      "public/fonts/variable/plus-jakarta-sans-wght.woff2",
      "public/fonts/variable/plus-jakarta-sans-italic-wght.woff2",
      "public/fonts/variable/readex-pro-hexp-wght.woff2",
      "public/fonts/licenses/plus-jakarta-sans-OFL.txt",
      "public/fonts/licenses/readex-pro-OFL.txt",
      "public/fonts/licenses/Tajawal-OFL.txt",
    ];

    for (const file of requiredFiles) {
      const bytes = readFileSync(resolve(process.cwd(), file));
      expect(bytes.length).toBeGreaterThan(0);
      // woff2 magic number: "wOF2"
      if (file.endsWith(".woff2")) expect(bytes.subarray(0, 4).toString("ascii")).toBe("wOF2");
    }
    expect(fontsCss).toContain('font-family: "Plus Jakarta Sans"');
    expect(fontsCss).toContain('font-family: "Readex Pro"');
    expect(fontsCss).toContain('format("woff2-variations")');
    expect(fontsCss).toContain("font-weight: 200 800");
    expect(fontsCss).toContain("font-weight: 160 700");
  });

  it("serves the default Arabic body font (Tajawal) locally, split per script", () => {
    const fontsCss = readFileSync(resolve(process.cwd(), "src/fonts.css"), "utf8");
    for (const weight of [400, 500, 700]) {
      for (const subset of ["arabic", "latin"]) {
        const file = `public/fonts/tajawal/tajawal-${weight}-${subset}.woff2`;
        expect(readFileSync(resolve(process.cwd(), file)).length).toBeGreaterThan(0);
        expect(fontsCss).toContain(`/fonts/tajawal/tajawal-${weight}-${subset}.woff2`);
      }
    }
    expect(fontsCss).toContain("unicode-range:");
    expect(fontsCss).toContain("U+0600-06FF");
  });

  it("never loads fonts through a render-blocking third-party chain", () => {
    const fontsCss = readFileSync(resolve(process.cwd(), "src/fonts.css"), "utf8");
    expect(fontsCss).not.toMatch(/@import\s+url\(/);
    expect(fontsCss).not.toContain("fonts.googleapis.com");
    expect(fontsCss).not.toContain(".ttf");
    expect(
      readdirSync(resolve(process.cwd(), "public/fonts/variable")).some((f) => f.endsWith(".ttf")),
    ).toBe(false);

    // Default storefront typography must be fully self-hosted (no Google request).
    expect(getGoogleFontsUrl(defaultStorefrontTypography())).toBeNull();
    for (const family of [
      "Inter",
      "Tajawal",
      "Readex Pro",
      "Plus Jakarta Sans",
      "29LT Zarid Display",
    ]) {
      expect(SELF_HOSTED_FAMILIES.has(family)).toBe(true);
    }
  });

  it("requests only the rendered weights for non-self-hosted Google families", () => {
    const config = normalizeTypography(
      {
        body: { en: { family: "Poppins", url: null }, ar: { family: "Amiri", url: null } },
        display: { en: { family: "Cinzel", url: null }, ar: { family: "Tajawal", url: null } },
        bodyWeight: 400,
        headingWeight: 600,
      },
      defaultStorefrontTypography(),
    );
    const url = getGoogleFontsUrl(config)!;
    expect(url).toContain("family=Poppins:wght@400;700");
    // Amiri only ships 400/700; 600 must not be requested.
    expect(url).toContain("family=Amiri:wght@400;700");
    // Cinzel is variable: a single range request instead of static instances.
    expect(url).toContain("family=Cinzel:wght@400..700");
    expect(url).not.toContain("Tajawal");
    expect(url).not.toContain("900");
  });

  it("preloads at most the body and display faces of the active language", () => {
    const config = defaultStorefrontTypography();
    expect(selfHostedFontPreloads(config, "ar")).toEqual([
      "/fonts/tajawal/tajawal-400-arabic.woff2",
      "/fonts/zariddisplay.woff2",
    ]);
    expect(selfHostedFontPreloads(config, "en")).toEqual(["/fonts/inter.woff2"]);
    expect(selfHostedFontPreloads(null, "ar")).toEqual([]);
  });

  it("promotes legacy uploads to selectable custom font sources", () => {
    const defaults = defaultStorefrontTypography();
    defaults.body.en = {
      family: "Georgia",
      url: "https://media.boutq.store/legacy-font.woff2",
    };

    const config = normalizeTypography({}, defaults);

    expect(config.body.en).toEqual({
      family: "Custom — English",
      url: "https://media.boutq.store/legacy-font.woff2",
    });
  });

  it("persists storefront and admin typography independently", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260813230000_world_class_typography_management.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("storefront_typography jsonb");
    expect(migration).toContain("admin_typography jsonb");
    expect(migration).toMatch(/brand_public_settings[\s\S]*bs\.storefront_typography/);
    expect(migration).not.toMatch(/brand_public_settings[\s\S]*bs\.admin_typography/);
  });
});
