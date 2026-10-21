import { describe, expect, it } from "vitest";
import {
  ADMIN_WORKSPACES,
  activeNavItem,
  adminNavGroups,
  dockWorkspaces,
  getAdminNavItems,
  workspaceOfPath,
  workspaceTabs,
  type GetNavItemsOptions,
} from "../src/config/admin-navigation";
import { PAGE_ACCESS } from "../src/lib/page-access";
import { resolveStoreModules } from "../src/lib/store-profile";

// The store admin's menu is one definition (src/config/admin-navigation.ts) read by the sidebar,
// the phone's dock and menu sheet, the workspace tabs, the tools directory and the command
// palette. Before, the phone's dock decided which workspace was lit from its own lists of
// addresses, which had already lost five pages, and the palette listed its own pages.

const owner: GetNavItemsOptions = {
  activeSlug: "pura",
  isCourier: false,
  isAdmin: true,
  hasPermission: () => true,
  t: (key) => key,
  lang: "en",
  storefrontMode: "shop",
  // A fashion store with every module that adds a page.
  storeModules: {
    ...resolveStoreModules({ store_vertical: "fashion" }),
    size_guide: true,
    bookings: true,
    incubators: true,
    returns: true,
  },
};

const every = getAdminNavItems(owner);
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("the menu's workspaces", () => {
  it("are six, named as a boutique owner names them, in order", () => {
    expect(ADMIN_WORKSPACES.map((w) => w.labelEn)).toEqual([
      "Home",
      "Orders",
      "Products",
      "Customers & marketing",
      "Money",
      "Store",
    ]);
    for (const workspace of ADMIN_WORKSPACES) {
      expect(workspace.labelAr).toBeTruthy();
      expect(workspace.shortLabelAr).toBeTruthy();
    }
  });

  it("hold every page of the admin once, the daily ones in view and the rare ones folded", () => {
    const groups = adminNavGroups(every);
    const placed = groups.flatMap((g) => [...g.items, ...g.more].map((item) => item.id));
    expect(placed.sort()).toEqual(Object.keys(PAGE_ACCESS).sort());
    expect(new Set(placed).size).toBe(placed.length);

    const view = Object.fromEntries(groups.map((g) => [g.id, ids(g.items)]));
    const more = Object.fromEntries(groups.map((g) => [g.id, ids(g.more)]));
    expect(view).toEqual({
      home: ["dashboard", "outreach"],
      orders: ["orders", "bookings", "returns", "abandoned-carts"],
      products: ["inventory", "categories", "supplier-orders", "incubators", "size-guides"],
      customers: [
        "customers",
        "discounts",
        "campaigns",
        "loyalty",
        "reviews",
        "signups",
        "content-studio",
      ],
      money: ["reports", "expenses"],
      store: ["settings", "team"],
    });
    expect(more).toEqual({
      home: [],
      orders: [],
      products: [],
      customers: ["giveaways"],
      money: [],
      store: ["pages", "communications", "integrations", "addons", "import", "export"],
    });
  });

  it("give every page a name and a line about it in both languages", () => {
    for (const item of every) {
      expect(item.labelAr, item.id).toBeTruthy();
      expect(item.descriptionAr?.length ?? 0, item.id).toBeGreaterThan(10);
      expect(item.descriptionEn?.length ?? 0, item.id).toBeGreaterThan(10);
    }
    expect(every.find((item) => item.id === "incubators")?.labelEn).toBe("Partner shops");
  });

  it("leave out a workspace a person has no page in", () => {
    const packer = getAdminNavItems({
      ...owner,
      isAdmin: false,
      hasPermission: (permission) => permission === "manage_orders",
    });
    expect(adminNavGroups(packer).map((g) => g.id)).toEqual(["home", "orders", "customers"]);
  });
});

describe("knowing where the reader is", () => {
  it("matches a page and its own pages, never one that only starts alike", () => {
    expect(activeNavItem(every, "/admin/b/pura/orders/123")?.id).toBe("orders");
    expect(activeNavItem(every, "/admin/b/pura/reports/sales")?.id).toBe("reports");
    expect(activeNavItem(every, "/admin/b/pura/supplier-orders/new")?.id).toBe("supplier-orders");
    expect(activeNavItem(every, "/admin/b/pura/ordersx")).toBeUndefined();
    expect(workspaceOfPath(every, "/admin/b/pura/integrations")).toBe("store");
    expect(workspaceOfPath(every, "/admin/b/pura/somewhere-else")).toBeNull();
  });

  it("lights the phone's dock from the same definition, for every page", () => {
    const dock = (path: string) =>
      dockWorkspaces(every, path)
        .filter((tab) => tab.active)
        .map((tab) => tab.workspace.id);
    // The old dock's lists missed these.
    expect(dock("/admin/b/pura/bookings")).toEqual(["orders"]);
    expect(dock("/admin/b/pura/supplier-orders")).toEqual(["products"]);
    expect(dock("/admin/b/pura/outreach")).toEqual(["home"]);
    expect(dock("/admin/b/pura/signups")).toEqual(["customers"]);
    expect(dock("/admin/b/pura/giveaways")).toEqual(["customers"]);
    // Money and Store live in the menu sheet.
    expect(dock("/admin/b/pura/reports")).toEqual([]);
    expect(dockWorkspaces(every, "/").map((tab) => [tab.workspace.id, tab.first.id])).toEqual([
      ["home", "dashboard"],
      ["orders", "orders"],
      ["products", "inventory"],
      ["customers", "customers"],
    ]);
  });

  it("opens a dock tab on a page the person may open", () => {
    const marketer = getAdminNavItems({
      ...owner,
      isAdmin: false,
      hasPermission: (permission) => permission === "manage_settings",
    });
    const tabs = dockWorkspaces(marketer, "/admin/b/pura/dashboard");
    expect(tabs.map((tab) => [tab.workspace.id, tab.first.id])).toEqual([
      ["home", "dashboard"],
      ["customers", "discounts"],
    ]);
  });

  it("shows a workspace's tabs, and a folded page only while it is open", () => {
    expect(ids(workspaceTabs(every, "/admin/b/pura/settings").items)).toEqual(["settings", "team"]);
    expect(ids(workspaceTabs(every, "/admin/b/pura/integrations").items)).toEqual([
      "settings",
      "team",
      "integrations",
    ]);
    expect(workspaceTabs(every, "/admin/b/pura/elsewhere").items).toEqual([]);
  });
});

describe("what a store does not use", () => {
  it("suppresses abandoned carts, loyalty and discounts in catalog mode", () => {
    const catalogIds = ids(getAdminNavItems({ ...owner, storefrontMode: "catalog" }));
    expect(catalogIds).not.toContain("abandoned-carts");
    expect(catalogIds).not.toContain("loyalty");
    expect(catalogIds).not.toContain("discounts");
    for (const id of ["orders", "returns", "inventory", "settings", "dashboard"]) {
      expect(catalogIds).toContain(id);
    }
  });

  it("gives a courier their deliveries and nothing else", () => {
    const items = getAdminNavItems({ ...owner, isCourier: true });
    expect(ids(items)).toEqual(["orders"]);
    expect(items[0].labelEn).toBe("Deliveries");
  });
});
