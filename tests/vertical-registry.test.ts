import { Store } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  getAddon,
  resolveInstallOrder,
  variantAxisDefaultsFrom,
} from "../src/lib/addons/addon-registry";
import { starterPackFor } from "../src/lib/addons/starter-packs";
import { DEFAULT_VERTICAL_CATEGORIES } from "../src/lib/addons/vertical-categories";
import { getVerticalSizingPresets } from "../src/lib/addons/vertical-inventory";
import { BRAND_TEMPLATES, VERTICAL_DESIGN_PRESETS } from "../src/lib/brand-templates";
import {
  STORE_VERTICALS,
  VERTICAL_ICON_NAMES,
  VERTICAL_LABELS,
  VERTICAL_MODULE_DEFAULTS,
} from "../src/lib/store-profile";
import {
  childVerticals,
  getVerticalDefinition,
  pickerVerticals,
  VERTICAL_DEFINITIONS,
  verticalFits,
  verticalLineage,
} from "../src/lib/verticals/registry";
import { verticalIcon } from "../src/components/verticals/VerticalIcon";

describe("the vertical registry", () => {
  it("defines every store vertical exactly once", () => {
    const ids = VERTICAL_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...STORE_VERTICALS].sort());
  });

  it("gives every vertical its names, a summary and a known icon", () => {
    for (const definition of VERTICAL_DEFINITIONS) {
      for (const text of [definition.label, definition.summary]) {
        expect(text.ar.trim(), definition.id).not.toBe("");
        expect(text.en.trim(), definition.id).not.toBe("");
      }
      if (definition.icon !== "Store") expect(verticalIcon(definition.id)).not.toBe(Store);
    }
  });

  it("nests one level deep, each child listed right after its parent", () => {
    for (const [index, definition] of VERTICAL_DEFINITIONS.entries()) {
      if (!definition.parent) continue;
      const parent = getVerticalDefinition(definition.parent);
      expect(parent.id).toBe(definition.parent);
      expect(parent.parent, `${definition.id}'s parent is top-level`).toBeNull();
      const parentIndex = VERTICAL_DEFINITIONS.findIndex((d) => d.id === definition.parent);
      const between = VERTICAL_DEFINITIONS.slice(parentIndex + 1, index);
      expect(between.every((d) => d.parent === definition.parent)).toBe(true);
    }
    expect(childVerticals("fashion")).toEqual(["abayas"]);
    expect(childVerticals("food")).toEqual(["coffee"]);
  });

  it("starts each vertical with add-ons that exist and install in order", () => {
    for (const definition of VERTICAL_DEFINITIONS) {
      const { required, suggested } = definition.starterPack;
      for (const id of [...required, ...suggested]) expect(() => getAddon(id)).not.toThrow();
      expect(resolveInstallOrder(required)).toEqual(expect.arrayContaining(required));
    }
  });

  it("has categories, a template and a design preset for every vertical", () => {
    for (const vertical of STORE_VERTICALS) {
      expect(DEFAULT_VERTICAL_CATEGORIES[vertical]?.length, vertical).toBeGreaterThan(0);
      expect(BRAND_TEMPLATES[vertical], vertical).toBeTruthy();
      expect(VERTICAL_DESIGN_PRESETS[vertical], vertical).toBeTruthy();
    }
  });
});

describe("what the registry feeds (unchanged from before it)", () => {
  it("keeps the starter packs", () => {
    expect(starterPackFor("abayas").required).toEqual([
      "fashion-core",
      "size-guides",
      "fit-passport",
      "made-to-order",
      "abaya-pack",
    ]);
    expect(starterPackFor("food")).toEqual({
      required: ["food-beverage"],
      suggested: ["made-to-order"],
    });
    expect(starterPackFor("print").required).toEqual(["made-to-order", "print-stamps"]);
    expect(starterPackFor("electronics")).toEqual({ required: [], suggested: [] });
    // A platform policy still overrides the registry.
    expect(
      starterPackFor("home", [{ addon_id: "gifts", default_for_activities: ["home"] }] as never)
        .required,
    ).toEqual(["gifts"]);
  });

  it("keeps the module defaults, labels and icons", () => {
    expect(VERTICAL_MODULE_DEFAULTS.abayas).toEqual({
      size_guide: true,
      fit_passport: true,
      made_to_order: true,
    });
    expect(VERTICAL_MODULE_DEFAULTS.jewelry).toEqual({
      size_guide: true,
      fit_passport: false,
      made_to_order: true,
    });
    expect(VERTICAL_MODULE_DEFAULTS.print.made_to_order).toBe(true);
    expect(VERTICAL_MODULE_DEFAULTS.coffee.size_guide).toBe(false);
    expect(VERTICAL_LABELS.coffee).toEqual({
      ar: "محاصيل وقهوة مختصة",
      en: "Specialty Coffee & Roastery",
    });
    expect(VERTICAL_ICON_NAMES.digital).toBe("FileCode");
  });

  it("keeps a roastery's own variant labels over its parent's", () => {
    expect(variantAxisDefaultsFrom([], "coffee")).toEqual({
      size: { ar: "الوزن / الحجم", en: "Weight / Size" },
      color: { ar: "درجة التحميص", en: "Roast Level" },
      fabric: { ar: "المعالجة", en: "Process" },
    });
    expect(variantAxisDefaultsFrom([], "food").color?.en).toBe("Flavor / Option");
  });
});

describe("parents and children", () => {
  it("lets a child use its parent's add-ons, not the reverse", () => {
    expect(verticalLineage("abayas")).toEqual(["abayas", "fashion"]);
    expect(verticalLineage("home")).toEqual(["home"]);
    expect(verticalFits(["fashion"], "abayas")).toBe(true);
    expect(verticalFits(["food"], "coffee")).toBe(true);
    expect(verticalFits(["coffee"], "food")).toBe(false);
    expect(verticalFits(["abayas"], "fashion")).toBe(false);
  });

  it("gives a roastery food and drink sizing presets too", () => {
    const ids = getVerticalSizingPresets("coffee", []).map((preset) => preset.id);
    expect(ids).toContain("coffee_beans_weight");
    expect(ids).toContain("sweets_bakery_weights");
    const food = getVerticalSizingPresets("food", []).map((preset) => preset.id);
    expect(food).not.toContain("coffee_beans_weight");
  });

  it("offers the verticals in picker order with their depth", () => {
    const picker = pickerVerticals();
    expect(picker.map((d) => d.id)).toEqual(
      VERTICAL_DEFINITIONS.filter((d) => d.status === "active").map((d) => d.id),
    );
    expect(picker.find((d) => d.id === "abayas")?.depth).toBe(1);
    expect(picker.find((d) => d.id === "fashion")?.depth).toBe(0);
  });

  it("keeps a legacy vertical out of pickers, except for a store already on it", () => {
    expect(getVerticalDefinition("electronics").status).toBe("legacy");
    expect(pickerVerticals().map((d) => d.id)).not.toContain("electronics");
    expect(pickerVerticals("electronics").map((d) => d.id)).toContain("electronics");
  });
});

describe("the refined verticals", () => {
  it("puts perfume under beauty, with the perfume pack, words and categories", () => {
    expect(verticalLineage("fragrance")).toEqual(["fragrance", "beauty"]);
    expect(starterPackFor("fragrance").required).toEqual(["beauty-perfume"]);
    expect(verticalFits(getAddon("beauty-perfume").activities, "fragrance")).toBe(true);
    expect(DEFAULT_VERTICAL_CATEGORIES.fragrance.map((c) => c.slug)).toContain("oud-incense");
    expect(DEFAULT_VERTICAL_CATEGORIES.beauty.map((c) => c.slug)).toContain("skincare");
  });

  it("adds services as a catalog store until bookings arrive", () => {
    const services = getVerticalDefinition("services");
    expect(services.parent).toBeNull();
    expect(services.status).toBe("active");
    expect(BRAND_TEMPLATES.services.storefrontMode).toBe("catalog");
    expect(BRAND_TEMPLATES.services.fulfillment.delivery).toBe(false);
  });

  it("maps old free-text business types to the new verticals", async () => {
    const { legacyBusinessTypeToVertical } = await import("../src/lib/store-profile");
    expect(legacyBusinessTypeToVertical("Perfume & Oud")).toBe("fragrance");
    expect(legacyBusinessTypeToVertical("عطور")).toBe("fragrance");
    expect(legacyBusinessTypeToVertical("Beauty salon products")).toBe("beauty");
    expect(legacyBusinessTypeToVertical("Photo booth rental")).toBe("services");
    expect(legacyBusinessTypeToVertical("تأجير خيام وفعاليات")).toBe("services");
  });
});
