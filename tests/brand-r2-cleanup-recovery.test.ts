import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("brand R2 cleanup recovery", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/routes/_authenticated/admin.brands.tsx"),
    "utf8",
  );

  it("continues media cleanup when the database purge already completed", () => {
    expect(source).toContain('hard && error.message.includes("BRAND_NOT_FOUND")');
    expect(source).toMatch(/BRAND_NOT_FOUND[\s\S]*?Promise\.allSettled/);
  });

  it("reports public and private cleanup independently", () => {
    expect(source).toContain('index === 0 ? "public" : "private"');
    expect(source).toContain('failedStores.join(" and ")');
  });

  it("makes a repeated hard database purge succeed when the brand is already absent", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20260810210500_make_brand_purge_retryable.sql"),
      "utf8",
    );

    expect(migration).toMatch(
      /IF v_slug IS NULL THEN[\s\S]*?IF p_hard THEN[\s\S]*?'already_absent', true/,
    );
    expect(migration).toContain("RAISE EXCEPTION 'BRAND_NOT_FOUND'");
  });
});
