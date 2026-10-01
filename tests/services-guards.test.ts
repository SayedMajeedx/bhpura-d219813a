import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import { getAdminNavItems } from "../src/config/admin-navigation";
import { hasAvailableStock } from "../src/lib/data/storefront/types";
import { inventoryScopeTabs } from "../src/features/inventory/lib/inventory-scope-tabs";
import { resolveStoreModules, STORE_MODULES, type StoreModuleId } from "../src/lib/store-profile";
import { VERTICAL_DEFINITIONS } from "../src/lib/verticals/registry";
import itemKindMigration from "../supabase/migrations/20261001100000_products_item_kind.sql?raw";

// Services vertical, step S7: guards. A store that is booked, not stocked, must
// never show a shop's stock, shipping, packaging, incubator or returns UI, and
// every vertical must say which of those it has. These fail when someone adds a
// vertical or a screen and forgets the rule.

const SHOP_MODULES: StoreModuleId[] = ["stock", "incubators", "packaging", "shipping", "returns"];

const navFor = (modules: ReturnType<typeof resolveStoreModules>) =>
  getAdminNavItems({
    activeSlug: "aurora",
    isCourier: false,
    isAdmin: true,
    hasPermission: () => true,
    t: (key: string) => key,
    lang: "en",
    storeModules: modules,
  }).map((item) => item.id);

describe("every vertical says which modules it has", () => {
  it("lists every module as an on/off choice", () => {
    for (const vertical of VERTICAL_DEFINITIONS) {
      expect(Object.keys(vertical.modules).sort(), vertical.id).toEqual([...STORE_MODULES].sort());
      for (const id of STORE_MODULES) {
        expect(typeof vertical.modules[id], `${vertical.id}.${id}`).toBe("boolean");
      }
    }
  });

  it("resolves to its own defaults, for the store and for the server", () => {
    for (const vertical of VERTICAL_DEFINITIONS) {
      expect(resolveStoreModules({ store_vertical: vertical.id }), vertical.id).toEqual(
        vertical.modules,
      );
    }
  });

  it("is either a shop or a bookings store, never half of each", () => {
    for (const vertical of VERTICAL_DEFINITIONS) {
      const shop = SHOP_MODULES.map((id) => vertical.modules[id]);
      if (vertical.modules.bookings) {
        expect(shop, `${vertical.id} takes bookings`).toEqual(shop.map(() => false));
      } else {
        expect(shop, `${vertical.id} is a shop`).toEqual(shop.map(() => true));
      }
    }
  });

  it("turns bookings on only where the database does (bookings_enabled: services)", () => {
    const withBookings = VERTICAL_DEFINITIONS.filter((v) => v.modules.bookings).map((v) => v.id);
    expect(withBookings).toEqual(["services"]);
  });
});

describe("the admin menu follows the modules", () => {
  it("shows incubators, returns and bookings exactly when their module is on", () => {
    for (const vertical of VERTICAL_DEFINITIONS) {
      const ids = navFor(resolveStoreModules({ store_vertical: vertical.id }));
      expect(ids.includes("incubators"), `${vertical.id} incubators`).toBe(
        vertical.modules.incubators,
      );
      expect(ids.includes("returns"), `${vertical.id} returns`).toBe(vertical.modules.returns);
      expect(ids.includes("bookings"), `${vertical.id} bookings`).toBe(vertical.modules.bookings);
      expect(ids.includes("size-guides"), `${vertical.id} size guides`).toBe(
        vertical.modules.size_guide,
      );
    }
  });

  it("brings a screen back when a store turns its module on, and drops it when off", () => {
    const services = { store_vertical: "services" };
    expect(
      navFor(resolveStoreModules({ ...services, store_modules: { returns: true } })),
    ).toContain("returns");
    expect(
      navFor(resolveStoreModules({ store_vertical: "fashion", store_modules: { returns: false } })),
    ).not.toContain("returns");
  });

  it("always keeps the screens a services store lives in", () => {
    const ids = navFor(resolveStoreModules({ store_vertical: "services" }));
    for (const id of ["dashboard", "orders", "bookings", "inventory", "customers", "settings"]) {
      expect(ids, id).toContain(id);
    }
  });
});

describe("the inventory screen follows the stock module", () => {
  const counts = { all: 4, attention: 1, active: 3, inactive: 1, low: 1, out: 1, featured: 0 };

  it("has no stock tabs in a store that does not count stock", () => {
    for (const vertical of VERTICAL_DEFINITIONS) {
      const ids = inventoryScopeTabs(counts, { tracksStock: vertical.modules.stock }).map(
        (tab) => tab.id,
      );
      expect(ids.includes("low"), `${vertical.id} low`).toBe(vertical.modules.stock);
      expect(ids.includes("out"), `${vertical.id} out`).toBe(vertical.modules.stock);
      expect(ids.includes("attention"), `${vertical.id} attention`).toBe(vertical.modules.stock);
    }
  });
});

// Starting Postgres takes a moment on a busy machine (the whole suite runs in parallel).
vi.setConfig({ testTimeout: 30_000 });

describe("a service is never out of stock", () => {
  it("is available with no stock, in the storefront's one rule", () => {
    const row = (fields: object) =>
      ({ product_variants: [{ stock_main: 0, stock_incubator: 0 }], ...fields }) as never;
    expect(hasAvailableStock(row({ item_kind: "service" }))).toBe(true);
    expect(hasAvailableStock(row({ item_kind: "product", is_made_to_order: true }))).toBe(true);
    expect(hasAvailableStock(row({ item_kind: "product" }))).toBe(false);
  });

  // The storefront decides sold out from made-to-order, so the database makes
  // every service made to order, whatever the caller writes.
  const start = itemKindMigration.indexOf(
    "CREATE OR REPLACE FUNCTION public.products_service_is_made_to_order",
  );
  const end = itemKindMigration.indexOf("-- Services stores' items");
  const trigger = itemKindMigration.slice(start, end);

  async function products() {
    const pg = new PGlite();
    await pg.exec(`CREATE TABLE public.products (
      id serial PRIMARY KEY,
      item_kind text NOT NULL DEFAULT 'product' CHECK (item_kind IN ('product', 'service')),
      is_made_to_order boolean NOT NULL DEFAULT false
    );`);
    await pg.exec(trigger);
    return pg;
  }
  const madeToOrder = async (pg: PGlite) =>
    (
      await pg.query<{ id: number; is_made_to_order: boolean }>(
        "SELECT * FROM products ORDER BY id",
      )
    ).rows;

  it("is made to order on insert, update and a change of kind", async () => {
    expect(trigger.length).toBeGreaterThan(100);
    const pg = await products();
    await pg.exec(`
      INSERT INTO products (item_kind, is_made_to_order) VALUES ('service', false);
      INSERT INTO products (item_kind) VALUES ('product');
      INSERT INTO products (item_kind) VALUES ('product');
    `);
    await pg.exec("UPDATE products SET is_made_to_order = false WHERE id = 1");
    await pg.exec("UPDATE products SET item_kind = 'service' WHERE id = 3");
    const rows = await madeToOrder(pg);
    expect(rows.map((row) => row.is_made_to_order)).toEqual([true, false, true]);
  });

  it("leaves a product's own choice alone", async () => {
    const pg = await products();
    await pg.exec("INSERT INTO products (item_kind, is_made_to_order) VALUES ('product', true)");
    await pg.exec("UPDATE products SET is_made_to_order = false WHERE id = 1");
    expect((await madeToOrder(pg))[0]?.is_made_to_order).toBe(false);
  });
});
