import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  customFontFaces,
  defaultStorefrontTypography,
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
    expect(config.axes).toEqual({ width: 125, slant: -12, opticalSize: 72 });
    expect(config.body.en).toEqual({ family: "Inter", url: null });
  });

  it("emits role-based variables and variable custom font faces", () => {
    const config = defaultStorefrontTypography();
    config.body.en.url = "https://media.boutq.store/font.woff2";
    const variables = typographyVariables(config, "en");
    const faces = customFontFaces(config, "en");

    expect(variables["--type-body"]).toContain("BoutqBodyCustom");
    expect(variables["--type-variation"]).toContain("'wdth' 100");
    expect(faces).toContain("font-weight:100 900");
    expect(faces).toContain("font-display:swap");
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
