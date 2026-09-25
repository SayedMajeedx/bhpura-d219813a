import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(
  resolve("src/routes/_authenticated/admin.b.$slug.incubators.tsx"),
  "utf8",
);

describe("inline incubator code editing", () => {
  it("renders the external code as an editable field in its table cell", () => {
    expect(page).toContain("<InlineCodeEditor");
    expect(page).toContain('placeholder={isAr ? "أدخل الكود" : "Enter code"}');
  });

  it("saves on blur or Enter and cancels with Escape", () => {
    expect(page).toContain("onBlur={save}");
    expect(page).toContain('event.key === "Enter"');
    expect(page).toContain('event.key === "Escape"');
  });

  it("uses the secured item update RPC and refreshes the authoritative query", () => {
    // The secured RPC is wrapped by the incubators data layer (tests/incubators-data-layer.test.ts).
    expect(page).toContain("await updateIncubatorItem({");
    expect(page).toContain("queryKey: incubatorsKeys.inventory(brand.id)");
  });
});
