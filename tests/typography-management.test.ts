import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  customFontFaces,
  defaultStorefrontTypography,
  fontCapabilities,
  normalizeTypography,
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

  it("bundles both variable fonts and their OFL licenses locally", () => {
    const fontsCss = readFileSync(resolve(process.cwd(), "src/fonts.css"), "utf8");
    const requiredFiles = [
      "public/fonts/variable/plus-jakarta-sans-wght.ttf",
      "public/fonts/variable/plus-jakarta-sans-italic-wght.ttf",
      "public/fonts/variable/readex-pro-hexp-wght.ttf",
      "public/fonts/licenses/plus-jakarta-sans-OFL.txt",
      "public/fonts/licenses/readex-pro-OFL.txt",
    ];

    for (const file of requiredFiles)
      expect(readFileSync(resolve(process.cwd(), file)).length).toBeGreaterThan(0);
    expect(
      readFileSync(
        resolve(process.cwd(), "public/fonts/variable/readex-pro-hexp-wght.ttf"),
      ).includes(Buffer.from("HEXP")),
    ).toBe(true);
    expect(
      readFileSync(
        resolve(process.cwd(), "public/fonts/variable/plus-jakarta-sans-wght.ttf"),
      ).includes(Buffer.from("wght")),
    ).toBe(true);
    expect(fontsCss).toContain('font-family: "Plus Jakarta Sans"');
    expect(fontsCss).toContain('font-family: "Readex Pro"');
    expect(fontsCss).toContain("font-weight: 200 800");
    expect(fontsCss).toContain("font-weight: 160 700");
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
