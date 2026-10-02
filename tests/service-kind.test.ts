import { describe, expect, it } from "vitest";
import { groupByKind, isRentalCategory, serviceKindOf } from "../src/lib/bookings/service-kind";

describe("the kinds of thing a services store sells", () => {
  it("knows a rentals category by its slug or its Arabic name", () => {
    for (const category of [
      "rentals",
      "Rental",
      "photo-booth-rentals",
      "تأجير",
      "إيجارات",
      "ايجار",
    ]) {
      expect(isRentalCategory(category), category).toBe(true);
    }
    for (const category of ["packages", "printing", "", null, undefined]) {
      expect(isRentalCategory(category), String(category)).toBe(false);
    }
  });

  it("calls a package a package even in a rentals category, then a rental, else a service", () => {
    expect(serviceKindOf({ is_package: true, category: "rentals" })).toBe("package");
    expect(serviceKindOf({ is_package: false, category: "rentals" })).toBe("rental");
    expect(serviceKindOf({ category: "printing" })).toBe("service");
    expect(serviceKindOf({})).toBe("service");
  });

  it("groups services, keeping each group's order", () => {
    const groups = groupByKind([
      { id: "a", category: "rentals" },
      { id: "b", is_package: true, category: "packages" },
      { id: "c", category: "printing" },
      { id: "d", category: "rentals" },
    ]);
    expect(groups.rental.map((x) => x.id)).toEqual(["a", "d"]);
    expect(groups.package.map((x) => x.id)).toEqual(["b"]);
    expect(groups.service.map((x) => x.id)).toEqual(["c"]);
  });
});
