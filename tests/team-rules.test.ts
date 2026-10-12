import { describe, expect, it } from "vitest";
import {
  adminMembersOf,
  adminWarnings,
  scopeCountsOf,
  staffInScope,
} from "../src/features/team/lib/team-rules";
import { AVAILABLE_PERMISSIONS, PERMISSION_PRESETS } from "../src/features/team/lib/team-shared";
import { PAGE_ACCESS } from "../src/lib/page-access";

// The team page's rules about the list of staff, moved out of the page as they were, and the
// permissions it lets an owner hand out.

const staff = [
  { id: "1", status: "active", role: "brand_admin", phone: "97339000001" },
  { id: "2", status: "active", role: "staff", phone: null },
  { id: "3", status: "inactive", role: "staff", phone: "97339000003" },
  { id: "4", status: "active", role: "courier", phone: null },
];

describe("the staff a view shows", () => {
  it("is everyone, the active, or the inactive", () => {
    expect(staffInScope(staff, "all")).toHaveLength(4);
    expect(staffInScope(staff, "active").map((m) => m.id)).toEqual(["1", "2", "4"]);
    expect(staffInScope(staff, "inactive").map((m) => m.id)).toEqual(["3"]);
  });

  it("is counted per view", () => {
    expect(scopeCountsOf(staff)).toEqual({ all: 4, active: 3, inactive: 1 });
    expect(scopeCountsOf([])).toEqual({ all: 0, active: 0, inactive: 0 });
  });
});

describe("what the page warns about the store's admins", () => {
  it("counts an admin, a store owner and the platform's owner as admins", () => {
    const roles = ["admin", "brand_admin", "super_admin", "staff", "courier"].map((role) => ({
      role,
    }));
    expect(adminMembersOf(roles).map((m) => m.role)).toEqual([
      "admin",
      "brand_admin",
      "super_admin",
    ]);
  });

  it("warns when one admin is all the store has, but not while the list loads", () => {
    expect(adminWarnings(staff, false).isSingleAdmin).toBe(true);
    expect(adminWarnings(staff, true).isSingleAdmin).toBe(false);
    const two = [...staff, { id: "5", status: "active", role: "admin", phone: null }];
    expect(adminWarnings(two, false).isSingleAdmin).toBe(false);
  });

  it("warns when no admin has a phone on file", () => {
    expect(adminWarnings(staff, false).adminHasNoPhone).toBe(false);
    const noPhones = staff.map((m) => ({ ...m, phone: null }));
    expect(adminWarnings(noPhones, false).adminHasNoPhone).toBe(true);
    // A store with no admin at all has nobody to warn about.
    expect(adminWarnings([staff[1]], false).adminHasNoPhone).toBe(false);
  });
});

describe("the permissions an owner can hand out", () => {
  const known = AVAILABLE_PERMISSIONS.map((permission) => permission.id);

  it("are named in both languages", () => {
    for (const permission of AVAILABLE_PERMISSIONS) {
      expect(permission.labelEn.trim()).not.toBe("");
      expect(permission.labelAr.trim()).not.toBe("");
    }
  });

  it("are the only ones a preset gives, and the first preset gives all of them", () => {
    for (const preset of PERMISSION_PRESETS) {
      for (const permission of preset.permissions) expect(known).toContain(permission);
    }
    expect([...PERMISSION_PRESETS[0].permissions].sort()).toEqual([...known].sort());
  });

  it("cover every permission a page of the admin asks for", () => {
    const asked = Object.values(PAGE_ACCESS).flatMap((rule) =>
      "permission" in rule && rule.permission ? [rule.permission] : [],
    );
    for (const permission of asked) expect(known).toContain(permission);
  });
});
