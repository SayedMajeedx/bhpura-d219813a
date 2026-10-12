import { describe, expect, it } from "vitest";
import { PAGE_ACCESS, homePageOf, mayOpenPage, pageOf } from "../src/lib/page-access";
import { getAdminNavItems } from "../src/config/admin-navigation";

// Who may open which page of a store's admin. Five pages each carried their own copy of the
// check and the others had none: the menu hid a page, its address still opened it.

const staff = (...permissions: string[]) => ({ role: "staff", status: "active", permissions });

describe("which page an address belongs to", () => {
  it("is the first part after the store", () => {
    expect(pageOf("/admin/b/zh/inventory", "zh")).toBe("inventory");
    expect(pageOf("/admin/b/zh/orders/order-1", "zh")).toBe("orders");
    expect(pageOf("/admin/b/zh/reports/sales?from=2026-10-01", "zh")).toBe("reports");
    expect(pageOf("/admin/b/zh", "zh")).toBeNull();
    expect(pageOf("/admin/b/zh/", "zh")).toBeNull();
    // Another store's address, or another area, is not this layout's to judge.
    expect(pageOf("/admin/b/pura/inventory", "zh")).toBeNull();
    expect(pageOf("/admin/brands", "zh")).toBeNull();
  });
});

describe("who may open a page", () => {
  it("lets the store's admins open everything", () => {
    for (const role of ["admin", "brand_admin", "super_admin"]) {
      for (const page of Object.keys(PAGE_ACCESS)) {
        expect(mayOpenPage(page, { role, status: "active" }), `${role} ${page}`).toBe(true);
      }
    }
  });

  it("lets a member of staff open the pages their permissions cover, and the dashboard", () => {
    const packer = staff("manage_orders");
    expect(mayOpenPage("dashboard", packer)).toBe(true);
    expect(mayOpenPage("orders", packer)).toBe(true);
    expect(mayOpenPage("returns", packer)).toBe(true);
    for (const page of ["inventory", "customers", "expenses", "reports", "settings", "discounts"]) {
      expect(mayOpenPage(page, packer), page).toBe(false);
    }
    expect(mayOpenPage("expenses", staff("view_financials"))).toBe(true);
    expect(mayOpenPage("reports", staff("view_financials"))).toBe(true);
    // Managing orders does not show the store's money.
    expect(mayOpenPage("reports", staff("manage_orders"))).toBe(false);
  });

  it("keeps the team and the integrations for admins, whatever a member of staff was granted", () => {
    const everything = staff(
      "manage_orders",
      "manage_customers",
      "manage_inventory",
      "manage_settings",
      "view_financials",
      "manage_team",
    );
    expect(mayOpenPage("team", everything)).toBe(false);
    expect(mayOpenPage("integrations", everything)).toBe(false);
    expect(mayOpenPage("settings", everything)).toBe(true);
  });

  it("gives a courier their deliveries and nothing else", () => {
    const courier = { role: "courier", status: "active", permissions: [] };
    expect(mayOpenPage("orders", courier)).toBe(true);
    for (const page of ["dashboard", "inventory", "customers", "expenses", "settings", "team"]) {
      expect(mayOpenPage(page, courier), page).toBe(false);
    }
    expect(homePageOf(courier)).toBe("orders");
    expect(homePageOf(staff())).toBe("dashboard");
  });

  it("opens nothing for an account that is switched off", () => {
    expect(mayOpenPage("dashboard", { role: "brand_admin", status: "inactive" })).toBe(false);
    expect(
      mayOpenPage("orders", { role: "staff", status: "disabled", permissions: ["manage_orders"] }),
    ).toBe(false);
  });

  it("never sends someone to a page they may not open", () => {
    for (const caller of [staff(), staff("manage_orders"), { role: "courier", status: "active" }]) {
      expect(mayOpenPage(homePageOf(caller), caller)).toBe(true);
    }
  });
});

describe("the table, the menu and the pages agree", () => {
  it("has a rule for every page of the admin", () => {
    // The route files themselves: a new page must say who may open it.
    const files = Object.keys(import.meta.glob("../src/routes/_authenticated/admin.b.$slug.*.tsx"));
    const pages = new Set(
      files
        .map(
          (file) =>
            file
              .split("admin.b.$slug.")[1]
              .replace(/\.tsx$/, "")
              .split(".")[0],
        )
        .filter((page) => page !== "route"),
    );
    expect(pages.size).toBeGreaterThan(20);
    for (const page of pages) expect(Object.keys(PAGE_ACCESS), page).toContain(page);
    for (const page of Object.keys(PAGE_ACCESS)) expect([...pages], page).toContain(page);
  });

  it("gives every menu item the rule of the page it opens", () => {
    const items = getAdminNavItems({
      activeSlug: "zh",
      isCourier: false,
      isAdmin: true,
      hasPermission: () => true,
      t: (key) => key,
      lang: "en",
      storefrontMode: "shop",
      storeModules: undefined,
    });
    expect(items.length).toBeGreaterThan(15);
    for (const item of items) {
      const page = pageOf(item.to.replace("$slug", "zh"), "zh");
      expect(page, item.id).not.toBeNull();
      const rule = PAGE_ACCESS[page as string];
      expect(rule, item.id).toBeDefined();
      expect(item.permission ?? null, `${item.id} permission`).toBe(rule.permission ?? null);
      expect(Boolean(item.adminOnly), `${item.id} admin only`).toBe(Boolean(rule.adminOnly));
    }
  });

  it("offers a member of staff exactly the pages they may open", () => {
    const packer = staff("manage_orders");
    const offered = getAdminNavItems({
      activeSlug: "zh",
      isCourier: false,
      isAdmin: false,
      hasPermission: (permission) => packer.permissions.includes(permission),
      t: (key) => key,
      lang: "en",
      storefrontMode: "shop",
      storeModules: undefined,
    }).map((item) => pageOf(item.to.replace("$slug", "zh"), "zh") as string);
    expect(offered.length).toBeGreaterThan(2);
    for (const page of offered) expect(mayOpenPage(page, packer), page).toBe(true);
    expect(offered).not.toContain("reports");
    expect(offered).not.toContain("team");
  });
});
