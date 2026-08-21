import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(
  resolve("src/routes/_authenticated/admin.b.$slug.incubators.tsx"),
  "utf8",
);

describe("incubator page management", () => {
  it("allows existing incubator details to be edited", () => {
    expect(page).toContain('setDialog("edit_incubator")');
    expect(page).toContain('dialog === "edit_incubator" && currentId');
    expect(page).toContain('.from("incubators")');
    expect(page).toContain('is_active: values.is_active === "true"');
  });

  it("uses the full content width instead of a permanent sidebar grid", () => {
    expect(page).toContain('<div className="space-y-4">');
    expect(page).not.toContain("lg:grid-cols-[280px_minmax(0,1fr)]");
    expect(page).toContain("overflow-x-auto");
  });

  it("paginates stock, sales, and payments independently", () => {
    expect(page.match(/<ListPagination/g)?.length).toBe(3);
    expect(page).toContain("pagedStock.map");
    expect(page).toContain("pagedSales.map");
    expect(page).toContain("pagedPayments.map");
  });
});
