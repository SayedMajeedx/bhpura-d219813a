import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VERTICAL_CATEGORIES, PURA_BRAND_ID } from "../src/lib/addons/vertical-categories";
import { planVerticalChange, wordingChanges } from "../src/lib/verticals/vertical-change";
import { fakeSupabase } from "./helpers/server-fn";

const BRAND = "11111111-2222-4333-8444-555555555555";

const installed = (...ids: string[]) => ids.map((addon_id) => ({ addon_id, status: "installed" }));

const plan = (overrides: Partial<Parameters<typeof planVerticalChange>[0]>) =>
  planVerticalChange({
    brandId: BRAND,
    from: "food",
    to: "coffee",
    installed: [],
    categories: [],
    usedKeys: new Set(),
    syncCategories: true,
    ...overrides,
  });

describe("planVerticalChange: add-ons", () => {
  it("installs the new vertical's pack and offers the old one to switch off", () => {
    const result = plan({ installed: installed("food-beverage") });
    expect(result.install).toEqual(["coffee-roastery"]);
    expect(result.disableCandidates).toEqual(["food-beverage"]);
  });

  it("installs dependencies before the add-ons that need them", () => {
    const result = plan({ from: "fashion", to: "abayas", installed: installed("fashion-core") });
    expect(result.install).not.toContain("fashion-core");
    expect(result.install.at(-1)).toBe("abaya-pack");
    for (const dependency of ["size-guides", "fit-passport", "made-to-order"]) {
      expect(result.install.indexOf(dependency as never)).toBeLessThan(
        result.install.indexOf("abaya-pack"),
      );
    }
  });

  it("keeps add-ons the new vertical uses, and add-ons another installed one needs", () => {
    const abayaPack = installed(
      "fashion-core",
      "size-guides",
      "fit-passport",
      "made-to-order",
      "abaya-pack",
    );
    const toFashion = plan({ from: "abayas", to: "fashion", installed: abayaPack });
    expect(toFashion.install).toEqual([]);
    expect(toFashion.disableCandidates).toEqual(["abaya-pack"]);

    // Print needs made-to-order; abaya-pack still needs fashion-core, size guides, fit passport.
    const toPrint = plan({ from: "abayas", to: "print", installed: abayaPack });
    expect(toPrint.install).toEqual(["print-stamps"]);
    expect(toPrint.disableCandidates).toEqual(["abaya-pack"]);
  });

  it("ignores disabled rows and add-ons no longer in the registry", () => {
    const result = plan({
      installed: [
        { addon_id: "food-beverage", status: "disabled" },
        { addon_id: "retired-addon", status: "installed" },
      ],
    });
    expect(result.disableCandidates).toEqual([]);
  });
});

describe("planVerticalChange: categories", () => {
  const categories = [
    { id: "c1", slug: "sweets", name_en: "Sweets", name_ar: "حلويات" },
    { id: "c2", slug: "old-empty", name_en: "Old", name_ar: "قديم" },
    { id: "c3", slug: "specialty-beans", name_en: "Beans", name_ar: "بن" },
  ];

  it("adds the missing defaults and removes only categories no product uses", () => {
    const result = plan({ categories, usedKeys: new Set(["sweets"]) });
    expect(result.categories?.remove.map((c) => c.id)).toEqual(["c2"]);
    const slugs = result.categories?.add.map((c) => c.slug);
    expect(slugs).not.toContain("specialty-beans");
    expect(slugs).toEqual(
      DEFAULT_VERTICAL_CATEGORIES.coffee
        .map((c) => c.slug)
        .filter((slug) => slug !== "specialty-beans"),
    );
  });

  it("leaves categories alone when not asked, and always for Pura", () => {
    expect(plan({ categories, syncCategories: false }).categories).toBeNull();
    expect(plan({ categories, brandId: PURA_BRAND_ID }).categories).toBeNull();
  });
});

describe("planVerticalChange: modules and wording", () => {
  it("reports the modules and words that change", () => {
    const result = plan({ from: "general", to: "abayas" });
    expect(result.modules.before).not.toEqual(result.modules.after);
    const wording = plan({ from: "general", to: "coffee" }).wording;
    expect(wording.map((change) => change.key)).toContain("specifications_label");
    expect(wording.find((c) => c.key === "specifications_label")?.after.en).toBe(
      "Ingredients & Details",
    );
    expect(wordingChanges("food", "food")).toEqual([]);
  });
});

// ── Server functions ─────────────────────────────────────────────────────────

const addons = vi.hoisted(() => ({ installAddon: vi.fn(async () => ({ success: true })) }));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
const guards = { requireSupabaseAuth: { guard: "authenticated" } };
vi.mock("../src/integrations/supabase/auth-middleware", () => guards);
vi.mock("@/integrations/supabase/auth-middleware", () => guards);
vi.mock("../src/lib/addons/addons.functions", () => addons);
vi.mock("@/lib/addons/addons.functions", () => addons);

type Handler = (args: { data: unknown; context: unknown }) => Promise<unknown>;

async function serverFns() {
  const fns = await import("../src/lib/verticals/vertical-change.functions");
  return {
    preview: fns.previewVerticalChange as unknown as Handler,
    change: fns.changeBrandVertical as unknown as Handler,
  };
}

function store({ superAdmin = true, vertical = "food" } = {}) {
  return fakeSupabase({
    rows: {
      business_settings: { store_vertical: vertical },
      brand_addons: installed("food-beverage", "gifts"),
      categories: [{ id: "c9", slug: "old-empty", name_en: "Old", name_ar: "قديم" }],
      products: [],
      platform_addon_policies: [],
    },
    rpc: {
      is_super_admin: superAdmin,
      apply_brand_vertical_change: { change_id: "x", from: vertical, to: "coffee" },
    },
  });
}

describe("vertical change server functions", () => {
  beforeEach(() => addons.installAddon.mockClear());

  it("refuses anyone but a super admin, before reading or writing", async () => {
    const { preview, change } = await serverFns();
    const db = store({ superAdmin: false });
    const context = { supabase: db.supabase };
    await expect(
      preview({ data: { brandId: BRAND, vertical: "coffee" }, context }),
    ).rejects.toThrow("STORE_VERTICAL_SUPER_ADMIN_ONLY");
    await expect(
      change({ data: { brandId: BRAND, vertical: "coffee", reason: "Owner asked" }, context }),
    ).rejects.toThrow("STORE_VERTICAL_SUPER_ADMIN_ONLY");
    expect(db.queries).toEqual([]);
    expect(addons.installAddon).not.toHaveBeenCalled();
  });

  it("requires a reason and a known vertical", async () => {
    const { change } = await serverFns();
    const context = { supabase: store().supabase };
    await expect(
      change({ data: { brandId: BRAND, vertical: "coffee", reason: " ok " }, context }),
    ).rejects.toThrow();
    await expect(
      change({ data: { brandId: BRAND, vertical: "pets", reason: "Owner asked" }, context }),
    ).rejects.toThrow();
  });

  it("previews from the store as it is now", async () => {
    const { preview } = await serverFns();
    const result = (await preview({
      data: { brandId: BRAND, vertical: "coffee" },
      context: { supabase: store().supabase },
    })) as ReturnType<typeof planVerticalChange>;
    expect(result.from).toBe("food");
    expect(result.install).toEqual(["coffee-roastery"]);
    expect(result.disableCandidates).toEqual(["food-beverage", "gifts"]);
  });

  it("installs first, then applies one audited change with only allowed disables", async () => {
    const { change } = await serverFns();
    const db = store();
    await change({
      data: {
        brandId: BRAND,
        vertical: "coffee",
        reason: "  Owner now roasts coffee  ",
        disableAddons: ["food-beverage", "coffee-roastery", "made-up"],
      },
      context: { supabase: db.supabase },
    });
    expect(addons.installAddon).toHaveBeenCalledWith({
      data: {
        brandId: BRAND,
        addonId: "coffee-roastery",
        source: "super_admin",
        withDependencies: true,
      },
    });
    const call = db.supabase.rpc.mock.calls.find(
      ([name]) => name === "apply_brand_vertical_change",
    ) as unknown as [string, Record<string, unknown>];
    expect(call[1]).toMatchObject({
      p_brand_id: BRAND,
      p_to_vertical: "coffee",
      p_reason: "Owner now roasts coffee",
      p_installed_addons: ["coffee-roastery"],
      p_disable_addons: ["food-beverage"],
      p_remove_category_ids: ["c9"],
    });
    expect(db.writes).toEqual([]); // every write goes through the RPC
  });

  it("changes nothing when the store is already on that vertical", async () => {
    const { change } = await serverFns();
    const db = store({ vertical: "coffee" });
    await expect(
      change({
        data: { brandId: BRAND, vertical: "coffee", reason: "Owner asked" },
        context: { supabase: db.supabase },
      }),
    ).rejects.toThrow("VERTICAL_UNCHANGED");
    expect(addons.installAddon).not.toHaveBeenCalled();
  });
});
