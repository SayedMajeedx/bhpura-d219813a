import { describe, it, expect } from "vitest";
import {
  SETTINGS_TABS,
  SETTINGS_GROUPS,
  SETTINGS_REGISTRY,
  type SettingsTabId,
} from "../src/features/settings/registry";
import { evaluateStoreReadiness } from "../src/components/settings/StoreReadinessChecklist";

describe("Settings Tabs & IA Architecture", () => {
  it("defines exactly the 5 canonical settings tabs in correct order (Owner Decision #5)", () => {
    const tabIds = SETTINGS_TABS.map((t) => t.id);
    expect(tabIds).toEqual(["identity", "storefront", "orders", "notifications", "account"]);
  });

  it("every tab has a non-empty group configuration in SETTINGS_GROUPS", () => {
    for (const tab of SETTINGS_TABS) {
      const groups = SETTINGS_GROUPS[tab.id as SettingsTabId];
      expect(groups).toBeDefined();
      expect(groups.length).toBeGreaterThan(0);

      // Verify each group has valid id, non-empty ar and en labels
      for (const group of groups) {
        expect(group.id.trim().length).toBeGreaterThan(0);
        expect(group.ar.trim().length).toBeGreaterThan(0);
        expect(group.en.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("all fields registered in SETTINGS_REGISTRY map to existing tabs and groups", () => {
    const settingsOwned = SETTINGS_REGISTRY.filter((f) => f.owner === "settings");

    for (const field of settingsOwned) {
      expect(field.tab).not.toBeNull();
      expect(field.group).not.toBeNull();

      if (field.tab && field.group) {
        const tabGroups = SETTINGS_GROUPS[field.tab as SettingsTabId];
        expect(tabGroups).toBeDefined();
        const groupExists = tabGroups.some((g) => g.id === field.group);
        expect(
          groupExists,
          `Field ${field.key} has tab ${field.tab} with unregistered group ${field.group}`,
        ).toBe(true);
      }
    }
  });

  it("basic vs advanced level distribution conforms to Owner Decision #7 (<= 45 basic fields)", () => {
    const basicSettings = SETTINGS_REGISTRY.filter(
      (f) => f.owner === "settings" && f.level === "basic",
    );
    const advancedSettings = SETTINGS_REGISTRY.filter(
      (f) => f.owner === "settings" && f.level === "advanced",
    );

    expect(basicSettings.length).toBeLessThanOrEqual(45);
    expect(advancedSettings.length).toBeGreaterThan(0);
  });
});

describe("Settings Search Universal Filtering", () => {
  const searchableEntries = SETTINGS_REGISTRY.filter(
    (f) => f.owner === "settings" && f.tab !== null,
  );

  const search = (q: string) => {
    const query = q.trim().toLowerCase();
    if (!query || query.length < 2) return [];

    return searchableEntries.filter((entry) => {
      const labelMatch =
        entry.label.ar.toLowerCase().includes(query) ||
        entry.label.en.toLowerCase().includes(query);
      const keyMatch = entry.key.toLowerCase().includes(query);
      const keywordMatch =
        (entry.keywords?.ar?.some((k) => k.toLowerCase().includes(query)) ?? false) ||
        (entry.keywords?.en?.some((k) => k.toLowerCase().includes(query)) ?? false);
      return labelMatch || keyMatch || keywordMatch;
    });
  };

  it("filters settings by Arabic keyword and yields correct tab and group", () => {
    const logoResults = search("شعار");
    expect(logoResults.length).toBeGreaterThan(0);
    const logoField = logoResults.find((f) => f.key === "logo_url");
    expect(logoField).toBeDefined();
    expect(logoField?.tab).toBe("identity");
    expect(logoField?.group).toBe("basics");
  });

  it("filters settings by English keyword and yields correct tab and group", () => {
    const paymentResults = search("benefitpay");
    expect(paymentResults.length).toBeGreaterThan(0);
    const benefitField = paymentResults.find((f) => f.key === "benefit_enabled");
    expect(benefitField).toBeDefined();
    expect(benefitField?.tab).toBe("orders");
    expect(benefitField?.group).toBe("payments");
  });

  it("distinguishes advanced settings so search can auto-enable advanced mode", () => {
    const advancedResults = search("header_glass");
    expect(advancedResults.length).toBeGreaterThan(0);
    expect(advancedResults[0].level).toBe("advanced");
  });
});

describe("Store Readiness Checklist Integration", () => {
  it("evaluates palette readiness using brand_palette extracted from logo", () => {
    const unextracted = evaluateStoreReadiness({
      logoUrl: "https://example.com/logo.png",
      activeProductsCount: 5,
      brandPalette: { meta: { source: "manual" } },
      storeVertical: "fashion",
      lang: "ar",
    });

    const paletteItem1 = unextracted.items.find((i) => i.id === "palette");
    expect(paletteItem1?.isComplete).toBe(false);

    const extracted = evaluateStoreReadiness({
      logoUrl: "https://example.com/logo.png",
      activeProductsCount: 5,
      brandPalette: { meta: { source: "logo" } },
      storeVertical: "fashion",
      lang: "ar",
    });

    const paletteItem2 = extracted.items.find((i) => i.id === "palette");
    expect(paletteItem2?.isComplete).toBe(true);
    expect(paletteItem2?.tabId).toBe("identity");
    expect(paletteItem2?.group).toBe("palette");
  });

  it("evaluates vertical readiness requiring explicit non-general vertical", () => {
    const general = evaluateStoreReadiness({
      logoUrl: "https://example.com/logo.png",
      activeProductsCount: 5,
      storeVertical: "general",
      lang: "ar",
    });

    const verticalItem1 = general.items.find((i) => i.id === "vertical");
    expect(verticalItem1?.isComplete).toBe(false);

    const selected = evaluateStoreReadiness({
      logoUrl: "https://example.com/logo.png",
      activeProductsCount: 5,
      storeVertical: "perfumes",
      lang: "ar",
    });

    const verticalItem2 = selected.items.find((i) => i.id === "vertical");
    expect(verticalItem2?.isComplete).toBe(true);
    expect(verticalItem2?.tabId).toBe("identity");
    expect(verticalItem2?.group).toBe("vertical");
  });

  it("points all actionable readiness items to valid SettingsTabId and group anchors", () => {
    const evalRes = evaluateStoreReadiness({
      logoUrl: null,
      activeProductsCount: 0,
      businessSettings: null,
      lang: "ar",
    });

    for (const item of evalRes.items) {
      if (item.actionType === "tab") {
        expect(item.tabId).toBeDefined();
        const validTabs: SettingsTabId[] = [
          "identity",
          "storefront",
          "orders",
          "notifications",
          "account",
        ];
        expect(validTabs).toContain(item.tabId);
        expect(item.group).toBeDefined();

        const tabGroups = SETTINGS_GROUPS[item.tabId as SettingsTabId];
        const groupExists = tabGroups.some((g) => g.id === item.group);
        expect(
          groupExists,
          `Readiness item ${item.id} has invalid group ${item.group} in tab ${item.tabId}`,
        ).toBe(true);
      }
    }
  });
});
